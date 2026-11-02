import { app, BrowserWindow, dialog, ipcMain, protocol, globalShortcut, systemPreferences, powerSaveBlocker, screen } from 'electron';
import { createHash } from 'node:crypto';
import { createReadStream, watch, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createNativeIslandSender } from './native-island-state.mjs';
import { FullscreenTransitionGuard } from './fullscreen-transition.mjs';
import { readdir, readFile, stat, realpath, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';
import { createPhoneServer } from './phone-server.mjs';
import { lyricsFromTrack } from './lyrics.mjs';
import {notchPopupBounds,isNotchHovered} from './notch-geometry.mjs';
import QRCode from 'qrcode';
const here=path.dirname(fileURLToPath(import.meta.url));
if(process.env.SONORA_TEST_PROFILE)app.setPath('userData',path.resolve(process.env.SONORA_TEST_PROFILE));
const dist=path.resolve(here,'../dist');
const exts=new Set(['.mp3','.m4a','.aac','.mp4','.wav','.aif','.aiff','.flac','.ogg','.oga','.opus']);
const mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2',
 '.mp3':'audio/mpeg','.m4a':'audio/mp4','.mp4':'audio/mp4','.aac':'audio/aac',
 '.wav':'audio/wav','.aif':'audio/aiff','.aiff':'audio/aiff','.flac':'audio/flac','.ogg':'audio/ogg','.oga':'audio/ogg','.opus':'audio/ogg'};
protocol.registerSchemesAsPrivileged([
 {scheme:'sonora-app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}},
 {scheme:'sonora-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}
]);
let roots=[];const approved=new Map();let win;
let playbackPowerBlocker=null;
let notchWindow=null;
let notchTimer=null;
let notchDismissTimer=null;
let notchSpaceTimer=null;
const fullscreenTransition = new FullscreenTransitionGuard();
let nativeIsland=null;
let nativeIslandReady=false;
let nativeIslandFailed=false;
let nativeIslandStopping=false;
let nativeIslandSender=null;
let notchEnabled=true;
let notchLastInside=0;
let lastNotchStateKey='';
function notchDisplay(){
  const displays=screen.getAllDisplays();
  return displays.find(d=>d.internal===true)||screen.getPrimaryDisplay();
}
function currentNotchState(){
  const playback=snapshot.playback||{};
  const song=playback.id&&snapshot.tracks.find(t=>t.id===playback.id);
  const title=String(song?.title||snapshot.notch?.title||'Nothing playing').slice(0,180);
  const artist=String(song?.artist||snapshot.notch?.artist||'Choose a song in Sonora').slice(0,160);
  const meta=song?.nativeId&&scannedTracks.get(song.nativeId);
  const image=meta?.coverBase64 && meta.coverBase64.length<380000
    ? 'data:'+(meta.coverMime||'image/jpeg')+';base64,'+meta.coverBase64 : '';
  // The renderer can temporarily announce a track ID before its library
  // metadata has hydrated. Do not present a large empty 'Nothing playing'
  // island as if there were a selectable song.
  const hasTrack=Boolean(playback.id&&(song||snapshot.notch?.title?.trim()));
  return {
    title,artist,artwork:image,trackId:String(playback.id||''),
    playing:Boolean(playback.isPlaying&&hasTrack),hasTrack,
    position:Number.isFinite(playback.position)?Math.max(0,playback.position):0,
    duration:Number.isFinite(playback.duration)&&playback.duration>0?playback.duration:(Number(song?.duration)||0)
  };
}
function sendNotchState(force=false){
  if(nativeIslandReady&&nativeIslandSender){
    nativeIslandSender.write(currentNotchState(),force);
  }
  if(!notchWindow||notchWindow.isDestroyed()||notchWindow.webContents.isLoading())return;
  const state=currentNotchState();
  // Cover art can change without its encoded byte length changing. Include
  // the content fingerprint so repeated album artwork updates are not lost.
  const artworkHash=state.artwork?createHash('sha1').update(state.artwork).digest('hex'):'';
  const key=[state.trackId,state.title,state.artist,state.playing,state.hasTrack,state.duration,artworkHash].join('|');
  if(force||key!==lastNotchStateKey){
    lastNotchStateKey=key;
    notchWindow.webContents.send('sonora:notch-state',state);
  }else{
    notchWindow.webContents.send('sonora:notch-progress',{
      position:state.position,duration:state.duration,playing:state.playing
    });
  }
}
function checkNotchHover(){
  if(process.platform!=='darwin'||!win||win.isDestroyed())return;
  // Do not permit the legacy overlay to appear over a fullscreen
  // transition. Its all-Spaces window was able to steal the active Space.
  // The native accessory helper has its own separate hover loop.
  if(win.isFullScreen()||fullscreenTransition.suppressesFocus()){
    if(notchWindow&&!notchWindow.isDestroyed()&&notchWindow.isVisible())notchWindow.hide();
    return;
  }
  // Recover if the secondary overlay renderer/window unexpectedly closes.
  // Never create the Electron overlay inside a native fullscreen Space.
  // The packaged Swift accessory helper handles fullscreen independently.
  if((!notchWindow||notchWindow.isDestroyed())&&notchEnabled){
    if(!win.isFullScreen()&&!fullscreenTransition.suppressesFocus())createNotchWindow();
    return;
  }
  if(!notchWindow||notchWindow.isDestroyed())return;
  if(!notchEnabled||!currentNotchState().hasTrack){
    if(notchDismissTimer){clearTimeout(notchDismissTimer);notchDismissTimer=null;}
    if(notchWindow.isVisible())notchWindow.hide();
    return;
  }
  const display=notchDisplay();
  if(!display)return;
  const cursor=screen.getCursorScreenPoint();
  const bounds=notchPopupBounds(display);
  // macOS may move a shown borderless window below the camera/menu bar.
  // Use its *actual* frame for mouse hit-testing so the bottom controls
  // remain usable instead of dismissing the island prematurely.
  const shownBounds=notchWindow.isVisible()?notchWindow.getBounds():bounds;
  const hovering=isNotchHovered(cursor,display,shownBounds,notchWindow.isVisible());
  if(hovering){
    notchLastInside=Date.now();
    if(notchDismissTimer){
      clearTimeout(notchDismissTimer);
      notchDismissTimer=null;
      notchWindow.webContents.send('sonora:notch-visible',true);
    }
    if(!notchWindow.isVisible()){
      notchWindow.setBounds(bounds);
      notchWindow.showInactive();
      sendNotchState(true);
    }
  }else if(notchWindow.isVisible()&&!notchDismissTimer&&Date.now()-notchLastInside>1050){
    // Let the island retract into the camera cutout before hiding the panel.
    notchWindow.webContents.send('sonora:notch-visible',false);
    notchDismissTimer=setTimeout(()=>{
      notchDismissTimer=null;
      if(!notchWindow||notchWindow.isDestroyed()||!notchWindow.isVisible())return;
      // A cursor can return between the 160ms poll ticks and this timer.
      // Check its *current* position before completing the disappearance.
      const latestDisplay=notchDisplay();
      if(latestDisplay&&isNotchHovered(
        screen.getCursorScreenPoint(),latestDisplay,notchWindow.getBounds(),true
      )){
        notchLastInside=Date.now();
        notchWindow.webContents.send('sonora:notch-visible',true);
        return;
      }
      if(Date.now()-notchLastInside>1050)notchWindow.hide();
    },230);
  }
}
function refreshNotchAfterSpaceChange(){
  // macOS sometimes anchors an all-Spaces window to the old fullscreen
  // Space when the host transitions. Recreate only on a Space transition;
  // app switching itself must leave this independent overlay untouched.
  if(!notchWindow||notchWindow.isDestroyed()||!win||win.isDestroyed())return;
  if(notchDismissTimer){clearTimeout(notchDismissTimer);notchDismissTimer=null;}
  notchWindow.destroy();
  notchLastInside=0;
  // An ordinary Electron overlay can bring the wrong Space forward when
  // recreated over fullscreen. Keep it closed in fullscreen; the native
  // Swift nonactivating panel remains available, and fallback resumes on exit.
  if(!win.isFullScreen()&&!fullscreenTransition.suppressesFocus())createNotchWindow();
}
function stopNativeIsland(){
  nativeIslandStopping=true;
  nativeIslandReady=false;
  if(nativeIslandSender){nativeIslandSender.close();nativeIslandSender=null;}
  if(nativeIsland){nativeIsland.kill();nativeIsland=null;}
}
function startNativeIsland(){
  // The native, nonactivating macOS panel is a separate accessory process.
  // It is only used when packaged; automated Electron tests use the stable
  // legacy overlay, and SONORA_USE_ELECTRON_ISLAND=1 is an explicit fallback.
  if(!app.isPackaged||process.env.SONORA_TEST_PROFILE||
     process.env.SONORA_USE_ELECTRON_ISLAND==='1'||nativeIslandFailed)return false;
  const executable=path.join(process.resourcesPath,'sonora-island-helper');
  if(!existsSync(executable))return false;
  let child;
  try {
    child=spawn(executable,[],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  }catch(error){
    console.warn('Native Sonora island unavailable:',error);
    nativeIslandFailed=true;
    return false;
  }
  nativeIsland=child;nativeIslandStopping=false;nativeIslandReady=false;
  nativeIslandSender=createNativeIslandSender(child.stdin);
  let output='';
  const timeout=setTimeout(()=>{
    if(nativeIsland===child&&!nativeIslandReady){
      console.warn('Native island startup timed out; using Electron fallback');
      nativeIslandFailed=true;child.kill();
    }
  },5000);
  child.stdout.on('data',data=>{
    output+=String(data);
    if(output.length>16384){output='';return;}
    let newline;
    while((newline=output.indexOf('\n'))!==-1){
      const line=output.slice(0,newline).trim();output=output.slice(newline+1);
      let msg;
      try{msg=JSON.parse(line);}catch{continue;}
      if(msg.event==='ready'){
        nativeIslandReady=true;clearTimeout(timeout);sendNotchState(true);
      }else if(typeof msg.action==='string'){
        if(!win||win.isDestroyed())continue;
        if(msg.action==='open')showMainWindow();
        else if(msg.action==='seek'&&Number.isFinite(msg.position)&&msg.position>=0){
          const duration=currentNotchState().duration;
          if(duration>0)win.webContents.send('sonora:phone-command',{
            action:'seek-mac',position:Math.min(duration,msg.position)
          });
        }else if(['toggle','previous','next'].includes(msg.action)){
          win.webContents.send('sonora:media-action',msg.action);
        }
      }
    }
  });
  child.stderr.on('data',data=>console.warn('Native island:',String(data).slice(0,1000)));
  child.stdin.on('error',error=>console.warn('Native island input closed:',error.message));
  child.on('error',error=>{console.warn('Native island failed:',error);nativeIslandFailed=true;});
  child.on('exit',(code,signal)=>{
    clearTimeout(timeout);
    if(nativeIsland!==child)return;
    const stopping=nativeIslandStopping;
    nativeIsland=null;nativeIslandReady=false;
    if(nativeIslandSender){nativeIslandSender.close();nativeIslandSender=null;}
    if(!stopping&&win&&!win.isDestroyed()){
      console.warn('Native island exited; restoring Electron mini player:',code,signal);
      nativeIslandFailed=true;
      createNotchWindow();
    }
  });
  return true;
}
function createNotchWindow(){
  if(process.platform!=='darwin'||!notchEnabled||(notchWindow&&!notchWindow.isDestroyed()))return;
  if(nativeIsland||startNativeIsland())return;
  // A helper failure must not create an extra all-Spaces Electron window in
  // fullscreen. Prefer no island temporarily to switching the user's Space.
  if(win?.isFullScreen()||fullscreenTransition.suppressesFocus())return;
  notchWindow=new BrowserWindow({
    // Independent non-fullscreenable window: unlike a parent-owned popup it
    // remains available when the user switches apps or macOS Spaces. Avoid
    // type:'panel' (NSPanel) and the pop-up-menu window level: those changed
    // the system menu-bar appearance on this Mac.
    fullscreenable:false,
    width:308,height:134,frame:false,transparent:true,show:false,
    resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,
    hasShadow:false,alwaysOnTop:true,backgroundColor:'#00000000',
    webPreferences:{preload:path.join(here,'notch-preload.cjs'),
      nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
  });
  // Floating, not menu-level. Use an ordinary window instead of an NSPanel,
  // with a transparent background and bounds wholly below the menu bar.
  // This lets the player follow across apps and fullscreen Spaces without
  // becoming its own fullscreen window.
  notchWindow.setAlwaysOnTop(true,'floating');
  notchWindow.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  // Electron temporarily turns the entire process into a macOS accessory
  // app when enabling cross-Space visibility, removing Sonora's Dock
  // running indicator. Restore regular app/Dock status afterward while
  // retaining the independent island's all-Spaces capability.
  if(process.platform==='darwin' && app.dock){
    void app.dock.show().catch(error=>console.warn('Could not restore Sonora Dock icon:',error));
  }
  notchWindow.on('show',()=>notchWindow?.webContents.send('sonora:notch-visible',true));
  notchWindow.on('hide',()=>notchWindow?.webContents.send('sonora:notch-visible',false));
  notchWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  notchWindow.webContents.on('will-navigate',event=>event.preventDefault());
  const thisPanel=notchWindow;
  thisPanel.webContents.once('did-finish-load',()=>{
    if(thisPanel.isDestroyed()||notchWindow!==thisPanel)return;
    sendNotchState(true);
    // 'show' may fire before the renderer installs its IPC listeners.
    thisPanel.webContents.send('sonora:notch-visible',thisPanel.isVisible());
  });
  thisPanel.webContents.on('render-process-gone',(_event,details)=>{
    console.warn('Sonora island renderer stopped:',details.reason);
    if(notchWindow===thisPanel&&!thisPanel.isDestroyed())thisPanel.destroy();
  });
  thisPanel.on('closed',()=>{
    if(notchWindow!==thisPanel)return;
    if(notchDismissTimer){clearTimeout(notchDismissTimer);notchDismissTimer=null;}
    notchWindow=null;lastNotchStateKey='';
  });
  void notchWindow.loadFile(path.join(here,'notch.html')).catch(err=>console.warn('Notch player unavailable:',err));
  if(!notchTimer)notchTimer=setInterval(checkNotchHover,160);
}


let phoneServer=null;
let phoneQR=null;
let snapshot={tracks:[],playlists:[],mixes:[],playback:null,privateMode:false};
let scannedTracks=new Map();
const validTrack=id=>typeof id==='string'&&/^native-[a-f0-9]{32}$/.test(id)&&approved.has(id.slice(7));
function publicLibrary(){
  const source=snapshot.tracks.map(t=>{
    const meta=scannedTracks.get(t.nativeId);
    return {...t,cover:Boolean(meta?.coverBase64),coverMime:meta?.coverMime};
  }).filter(t=>t.nativeId&&approved.has(t.nativeId));
  return {tracks:source,playlists:snapshot.playlists,mixes:snapshot.mixes,
    playback:snapshot.playback,privateMode:snapshot.privateMode};
}
function publicPhoneInfo(){
  const state=phoneServer?.info()||{online:false,address:null,reason:'Phone service unavailable',pairingUrl:null};
  return {online:state.online,address:state.address,reason:state.reason,qrDataUrl:state.online?phoneQR:null,pairingUrl:state.online?state.pairingUrl:null};
}

// Recursive macOS folder watchers; debounced and serialized so partial files do not
// enter the library and multiple folder changes cannot race metadata/index writes.
let folderWatchers=[];
let watcherTimer=null;
let scanPromise=null;
let scanAgain=false;
function stopFolderWatchers(){
  if(watcherTimer)clearTimeout(watcherTimer);
  watcherTimer=null;
  for(const w of folderWatchers){try{w.close();}catch{}}
  folderWatchers=[];
}
function enableFolderWatchers(){
  stopFolderWatchers();
  for(const root of roots){
    try{
      const watcher=watch(root,{recursive:true,persistent:false},(_event,filename)=>{
        if(filename && !audio(String(filename)) &&
          !String(filename).split(path.sep).some(x=>x.startsWith('.')) &&
          !String(filename).endsWith('.part'))return;
        if(watcherTimer)clearTimeout(watcherTimer);
        watcherTimer=setTimeout(()=>{watcherTimer=null;void serializedScan(true);},1600);
      });
      watcher.on('error',err=>console.warn('Music folder watch unavailable for '+root+':',err.message));
      folderWatchers.push(watcher);
    }catch(err){console.warn('Cannot watch music folder '+root+':',err.message);}
  }
}
async function serializedScan(announce=false){
  if(scanPromise){
    if(announce)scanAgain=true;
    return scanPromise;
  }
  scanPromise=(async()=>{
    try {
      const result=await scan();
      if(announce && win && !win.isDestroyed())
        win.webContents.send('sonora:library-updated',result);
      return result;
    }finally {
      scanPromise=null;
      if(scanAgain){scanAgain=false;void serializedScan(true);}
    }
  })();
  return scanPromise;
}

// The Media Session API publishes Now Playing metadata. These media-key accelerators
// are a fallback when macOS routes keyboard events directly to Electron.
const mediaKeys = [
  ['MediaPlayPause', 'toggle'],
  ['MediaNextTrack', 'next'],
  ['MediaPreviousTrack', 'previous']
];
const registeredKeys=new Set();
let hasActiveTrack=false;
function updateMediaShortcuts(available){
  hasActiveTrack=Boolean(available);
  if(!hasActiveTrack){
    for(const key of [...registeredKeys]){ globalShortcut.unregister(key); registeredKeys.delete(key); }
    return;
  }
  for(const [accelerator,action] of mediaKeys){
    if(registeredKeys.has(accelerator))continue;
    try{
      if(globalShortcut.register(accelerator,()=>{
        if(win && !win.isDestroyed())win.webContents.send('sonora:media-action',action);
      }))registeredKeys.add(accelerator);
    }catch(err){console.warn('Could not register '+accelerator+':',err?.message);}
  }
}
function mediaStatus(){
  let accessibilityTrusted=true;
  if(process.platform==='darwin'){
    try{accessibilityTrusted=systemPreferences.isTrustedAccessibilityClient(false);}catch{accessibilityTrusted=false;}
  }
  return {registered:mediaKeys.filter(([k])=>registeredKeys.has(k)).map(([k])=>k),
    accessibilityTrusted, hasActiveTrack};
}

const indexPath=()=>path.join(app.getPath('userData'),'sonora-folder-index.json');
const idFor=p=>createHash('sha256').update(p).digest('hex').slice(0,32);
const audio=p=>exts.has(path.extname(p).toLowerCase());
const within=(root,p)=>{const rel=path.relative(root,p);return !!rel && rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
async function restore(){
 try{
  const data=JSON.parse(await readFile(indexPath(),'utf8'));
  roots=(data.roots||[]).filter(x=>typeof x==='string');
  for(const entry of data.files||[])
   if(entry.id===idFor(entry.path)&&audio(entry.path)&&roots.some(r=>within(r,entry.path)))approved.set(entry.id,entry.path);
 }catch{}
}
async function save(){
 await writeFile(indexPath(),JSON.stringify({roots,files:[...approved].map(([id,p])=>({id,path:p}))}),'utf8');
}
async function* walk(root,depth=0){
 if(depth>12)return;
 let files;try{files=await readdir(root,{withFileTypes:true});}catch{return;}
 for(const entry of files){
  if(entry.name.startsWith('.')||['node_modules','.git','dist','Library'].includes(entry.name))continue;
  const p=path.join(root,entry.name);
  if(entry.isDirectory())yield* walk(p,depth+1);
  else if(entry.isFile()&&audio(p))yield p;
 }
}
async function scan(){
 const list=[];const next=new Map();
 for(const root of roots){
  try{if(!(await stat(root)).isDirectory())continue;}catch{continue;}
  for await(const p of walk(root)){
   if(list.length>=10000)break;
   try{
    const fs=await stat(p);if(!fs.isFile()||fs.size>1024**3)continue;
    const id=idFor(p);next.set(id,p);
    let title=path.basename(p,path.extname(p)),artist='Unknown artist',album='Singles',duration=0,coverBase64,coverMime;
    try{
     const m=await parseFile(p,{duration:true});
     title=(m.common.title||title).trim();artist=(m.common.artist||artist).trim();album=(m.common.album||album).trim();duration=m.format.duration||0;
     const pic=m.common.picture?.[0];
     if(pic&&pic.data?.length>0&&pic.data.length<700000){coverBase64=Buffer.from(pic.data).toString('base64');coverMime=pic.format||'image/jpeg';}
    }catch{}
    list.push({id,path:p,title,artist,album,duration,size:fs.size,mtimeMs:fs.mtimeMs,coverBase64,coverMime});
   }catch{}
  }
 }
 approved.clear();for(const [id,p] of next)approved.set(id,p);
 scannedTracks=new Map(list.map(t=>[t.id,t]));
 await save();return {tracks:list,roots};
}
const error=(status,msg)=>new Response(msg,{status,headers:{'Content-Type':'text/plain'}});
async function asset(request){
 if(!['GET','HEAD'].includes(request.method))return error(405,'Method not allowed');
 // Native audio MUST be served from the same origin as the app.
 // A MediaElementAudioSourceNode deliberately outputs silence for cross-origin
 // media loaded without CORS permission, even while playback time advances.
 if(new URL(request.url).pathname.startsWith('/stream/'))return media(request);
 let resource;try{resource=decodeURIComponent(new URL(request.url).pathname);}catch{return error(400,'Invalid asset path');}
 const p=path.resolve(dist,'.'+resource);
 if(!p.startsWith(dist+path.sep))return error(403,'Forbidden');
 try{
  const buf=await readFile(p);
  return new Response(request.method==='HEAD'?null:buf,{headers:{
   'Content-Type':mimes[path.extname(p)]||'application/octet-stream',
   'Cache-Control':'no-store',
   'Content-Security-Policy':"default-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'"
  }});
 }catch{return error(404,'File not found');}
}
async function media(request){
 if(!['GET','HEAD'].includes(request.method))return error(405,'Method not allowed');
 const u=new URL(request.url);
 const sameOrigin=u.protocol==='sonora-app:'&&u.hostname==='localhost'&&/^\/stream\/[a-f0-9]{32}$/.test(u.pathname);
 const legacy=u.protocol==='sonora-media:'&&u.hostname==='track'&&/^\/[a-f0-9]{32}$/.test(u.pathname);
 if(!sameOrigin&&!legacy)return error(400,'Bad audio URL');
 const id=sameOrigin?u.pathname.slice('/stream/'.length):u.pathname.slice(1);
 const p=approved.get(id);
 if(!p||!audio(p)||!roots.some(root=>within(root,p)))return error(404,'Track not authorised');
 try{
  const real=await realpath(p);
  if(!roots.some(root=>within(root,real)))return error(403,'Track moved outside selected folder');
  const s=await stat(p),n=s.size;
  if(!s.isFile()||n<1)return error(404,'File unavailable');
  let start=0,end=n-1,status=200;
  const header=request.headers.get('range');
  if(header){
   const match=/^bytes=(\d*)-(\d*)$/.exec(header);
   if(!match)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+n}});
   if(!match[1]&&match[2])start=Math.max(0,n-Number(match[2]));
   else {start=Number(match[1]);end=match[2]?Math.min(n-1,Number(match[2])):n-1;}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=n||end<start)
    return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+n}});
   status=206;
  }
  const headers={'Content-Type':mimes[path.extname(p).toLowerCase()]||'application/octet-stream',
   'Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':'no-store'};
  if(status===206)headers['Content-Range']='bytes '+start+'-'+end+'/'+n;
  return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(p,{start,end})),{status,headers});
 }catch{return error(404,'Missing audio');}
}
function sendMainWindowState(){
 if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed())
   win.webContents.send('sonora:window-state',{fullscreen:win.isFullScreen(),maximized:win.isMaximized()});
}
function newWindow(){
 win=new BrowserWindow({width:1380,height:900,minWidth:830,minHeight:550,backgroundColor:'#121115',
  // Use the native macOS title bar in normal and maximised windows so the
  // close / minimise / green zoom buttons are always present and usable.
  title:'Sonora Music',titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:15},
  // This is the MAIN player. The green traffic-light button must enter
  // genuine macOS fullscreen (its own Space), NOT same-desktop zoom.
  // Only the separate mini-player is nonfullscreenable.
  fullscreenable:true,
  webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('sonora-app://localhost/')&&!url.startsWith('http://127.0.0.1:5173/'))event.preventDefault();});
 if(process.env.SONORA_DEV_SERVER)win.loadURL(process.env.SONORA_DEV_SERVER);
 else win.loadURL('sonora-app://localhost/index.html');
 const scheduleNotchSpaceRefresh=()=>{
   // The packaged native island is already visible on fullscreen Spaces and
   // must not be restarted as part of the host window's transition.
   if(nativeIsland)return;
   if(notchSpaceTimer)clearTimeout(notchSpaceTimer);
   notchSpaceTimer=setTimeout(()=>{
     notchSpaceTimer=null;
     refreshNotchAfterSpaceChange();
     // If the fallback was suspended entering fullscreen, restore it on exit.
     if(!win?.isFullScreen()&&!notchWindow&&notchEnabled)createNotchWindow();
   },1250);
 };
 const beginFullscreenTransition=()=>{
   fullscreenTransition.begin();
   // Hide the fallback before the native animation starts. The nonactivating
   // native helper stays untouched across Spaces.
   if(notchWindow&&!notchWindow.isDestroyed())notchWindow.hide();
 };
 win.on('will-enter-full-screen',beginFullscreenTransition);
 win.on('will-leave-full-screen',beginFullscreenTransition);
 win.on('enter-full-screen',()=>{
   fullscreenTransition.end();
   sendMainWindowState();
   scheduleNotchSpaceRefresh();
 });
 win.on('leave-full-screen',()=>{
   fullscreenTransition.end();
   sendMainWindowState();
   scheduleNotchSpaceRefresh();
 });
 win.on('maximize',sendMainWindowState);
 win.on('unmaximize',sendMainWindowState);
 win.on('closed',()=>{
   if(notchSpaceTimer){clearTimeout(notchSpaceTimer);notchSpaceTimer=null;}
   stopNativeIsland();
   if(notchWindow&&!notchWindow.isDestroyed())notchWindow.close();
   win=null;
 });
 win.webContents.once('did-finish-load',()=>{
   if(roots.length)setTimeout(()=>void serializedScan(true),900);
   // Delay the secondary hidden notch window until the main UI is ready.
   // Keeps the main player as the primary Electron window for launch/tests.
   setTimeout(()=>{if(win&&!win.isDestroyed())createNotchWindow();},1200);
 });
}
function showMainWindow(){
 // A spurious Dock/app activation during a macOS fullscreen animation must
 // not refocus the main window and yank the user back to the prior Space.
 if(fullscreenTransition.suppressesFocus()&&win&&!win.isDestroyed())return;
 if(process.platform==='darwin')app.show();
 if(!win||win.isDestroyed()){newWindow();return;}
 if(win.isMinimized())win.restore();
 if(!win.isVisible())win.show();
 else if(!win.isFocused())win.focus();
}
const hasSingleInstanceLock=app.requestSingleInstanceLock();
if(!hasSingleInstanceLock){app.quit();}
else {
app.on('second-instance',showMainWindow);
// Enable playback started by a paired phone remote even when the Mac has no recent input.
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.whenReady().then(async()=>{
 await restore();
 enableFolderWatchers();
 try{
   phoneServer=await createPhoneServer({
     htmlPath:path.join(here,'phone-ui.html'),
     indexPath:path.join(app.getPath('userData'),'phone-pairing.json'),
     getLibrary:publicLibrary,
     findTrack:id=>approved.get(id),
     getRoots:()=>roots,
     lyricsFor:id=>lyricsFromTrack(approved.get(id)),
     coverFor:id=>{const m=scannedTracks.get(id);return m?{data:m.coverBase64,mime:m.coverMime}:null;},
     handleCommand:async data=>{
       if(data.id && !validTrack(data.id))throw Error('Unknown music track');
       if(data.ids && (!Array.isArray(data.ids)||data.ids.length>300||data.ids.some(id=>!validTrack(id))))throw Error('Unknown song in queue');
       if(!win||win.isDestroyed()||win.webContents.isLoading())
         throw Error('Mac player is not open');
       win.webContents.send('sonora:phone-command',data);
     }
   });
   if(phoneServer.info().pairingUrl)phoneQR=await QRCode.toDataURL(phoneServer.info().pairingUrl,{width:248,margin:1,color:{dark:'#271629',light:'#ffffff'}});
 }catch(err){console.error('Phone server error:',err);}

 protocol.handle('sonora-app',asset);
 protocol.handle('sonora-media',media);
 ipcMain.handle('sonora:choose-folders',async()=>{
  const chosen=await dialog.showOpenDialog(win,{title:'Choose your music folders',
    properties:['openDirectory','multiSelections']});
  if(chosen.canceled)return {canceled:true,tracks:[],roots};
  roots=[...new Set([...roots,...chosen.filePaths.map(p=>path.resolve(p))])];
  const result=await serializedScan(false);
  enableFolderWatchers();
  return {canceled:false,...result};
 });
 ipcMain.handle('sonora:window-state',event=>{
   if(!win||win.isDestroyed()||event.sender!==win.webContents)return {fullscreen:false,maximized:false};
   return {fullscreen:win.isFullScreen(),maximized:win.isMaximized()};
 });
 ipcMain.on('sonora:window-action',(event,action)=>{
   if(!win||win.isDestroyed()||event.sender!==win.webContents)return;
   if(action==='close')win.close();
   else if(action==='minimize'){
     if(win.isFullScreen()){
       win.once('leave-full-screen',()=>{if(win&&!win.isDestroyed())win.minimize();});
       win.setFullScreen(false);
     }else win.minimize();
   }else if(action==='exit-fullscreen'&&win.isFullScreen())win.setFullScreen(false);
   else if(action==='toggle-fullscreen')win.setFullScreen(!win.isFullScreen());
 });
 ipcMain.handle('sonora:rescan',()=>serializedScan(false));
 ipcMain.handle('sonora:folders',()=>roots);
 ipcMain.handle('sonora:phone-info',()=>publicPhoneInfo());
 ipcMain.handle('sonora:lyrics',(_event,id)=>lyricsFromTrack(approved.get(id)));
 ipcMain.on('sonora:library-snapshot',(event,data)=>{
   if(!win||event.sender!==win.webContents||!data||typeof data!=='object')return;
   const valid=(data.tracks||[]).filter(t=>validTrack(t.id)&&t.nativeId===t.id.slice(7));
   snapshot={
     tracks:valid.map(t=>({id:t.id,nativeId:t.nativeId,title:String(t.title||'').slice(0,200),
       artist:String(t.artist||'').slice(0,200),album:String(t.album||'').slice(0,200),
       duration:Number(t.duration)||0,liked:Boolean(t.liked),playedAt:Number(t.playedAt)||0})),
     playlists:(data.playlists||[]).map(pl=>({id:String(pl.id),name:String(pl.name),trackIds:(pl.trackIds||[]).filter(validTrack)})).slice(0,300),
     mixes:(data.mixes||[]).map(m=>({id:String(m.id),name:String(m.name),subtitle:String(m.subtitle),
       ids:(m.ids||[]).filter(validTrack)})).slice(0,16),
     playback:data.playback||null,privateMode:Boolean(data.privateMode),
     notch:{title:String(data.notch?.title||'').slice(0,180),artist:String(data.notch?.artist||'').slice(0,160)}
   };
   sendNotchState();
 });
 ipcMain.on('sonora:notch-enabled',(event,enabled)=>{
   if(win&&event.sender===win.webContents){
     const wasEnabled=notchEnabled;
     notchEnabled=Boolean(enabled);
     if(!notchEnabled){
       stopNativeIsland();
       if(notchWindow&&!notchWindow.isDestroyed())notchWindow.hide();
     }else if(!wasEnabled&&!nativeIsland&&(!notchWindow||notchWindow.isDestroyed())){
       createNotchWindow();
     }
   }
 });
 ipcMain.on('sonora:notch-action',(event,action,value)=>{
   if(!notchWindow||event.sender!==notchWindow.webContents)return;
   if(action==='open'){showMainWindow();return;}
   if(!win||win.isDestroyed())return;
   if(action==='seek'){
     const duration=currentNotchState().duration;
     if(!Number.isFinite(value)||value<0||!Number.isFinite(duration)||duration<=0)return;
     win.webContents.send('sonora:phone-command',{
       action:'seek-mac',position:Math.min(duration,Number(value))
     });
   }else if(['toggle','previous','next'].includes(action)){
     win.webContents.send('sonora:media-action',action);
   }
 });
 ipcMain.handle('sonora:notch-support',()=>process.platform==='darwin');

 ipcMain.on('sonora:playback-status',(event,playing)=>{
   if(!win||event.sender!==win.webContents)return;
   if(playing && playbackPowerBlocker===null)
     playbackPowerBlocker=powerSaveBlocker.start('prevent-app-suspension');
   else if(!playing && playbackPowerBlocker!==null){
     powerSaveBlocker.stop(playbackPowerBlocker);playbackPowerBlocker=null;
   }
 });
 ipcMain.on('sonora:track-active',(event,available)=>{
   if(win && event.sender===win.webContents)updateMediaShortcuts(available);
 });
 ipcMain.handle('sonora:media-key-status',()=>mediaStatus());

 newWindow();
 app.on('activate',showMainWindow);
});
app.on('window-all-closed',()=>{
  updateMediaShortcuts(false);
  // macOS leaves the app process alive after the last window closes. Never keep
  // a stale sleep-prevention assertion active with no player window.
  if(playbackPowerBlocker!==null){
    powerSaveBlocker.stop(playbackPowerBlocker);
    playbackPowerBlocker=null;
  }
  if(process.platform!=='darwin')app.quit();
});
app.on('will-quit',()=>{
 stopNativeIsland();
 if(notchTimer){clearInterval(notchTimer);notchTimer=null;}
 stopFolderWatchers();globalShortcut.unregisterAll();
 if(playbackPowerBlocker!==null){powerSaveBlocker.stop(playbackPowerBlocker);playbackPowerBlocker=null;}
 void phoneServer?.close();
});
} // Single-instance guard: prevents multiple Mac windows fighting over IndexedDB.
