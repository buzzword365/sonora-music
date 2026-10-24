import { app, BrowserWindow, dialog, ipcMain, protocol, globalShortcut, systemPreferences, powerSaveBlocker } from 'electron';
import { createHash } from 'node:crypto';
import { createReadStream, watch } from 'node:fs';
import { readdir, readFile, stat, realpath, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';
import { createPhoneServer } from './phone-server.mjs';
import { lyricsFromTrack } from './lyrics.mjs';
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
function newWindow(){
 win=new BrowserWindow({width:1380,height:900,minWidth:830,minHeight:550,backgroundColor:'#121115',
  title:'Sonora Music',titleBarStyle:'hiddenInset',trafficLightPosition:{x:18,y:16},
  webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('sonora-app://localhost/')&&!url.startsWith('http://127.0.0.1:5173/'))event.preventDefault();});
 if(process.env.SONORA_DEV_SERVER)win.loadURL(process.env.SONORA_DEV_SERVER);
 else win.loadURL('sonora-app://localhost/index.html');
 win.webContents.once('did-finish-load',()=>{
   if(roots.length)setTimeout(()=>void serializedScan(true),900);
 });
}
const hasSingleInstanceLock=app.requestSingleInstanceLock();
if(!hasSingleInstanceLock){app.quit();}
else {
app.on('second-instance',()=>{
 if(win && !win.isDestroyed()){if(win.isMinimized())win.restore();win.focus();}
});
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
     playback:data.playback||null,privateMode:Boolean(data.privateMode)
   };
 });

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
 app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)newWindow();});
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
 stopFolderWatchers();globalShortcut.unregisterAll();
 if(playbackPowerBlocker!==null){powerSaveBlocker.stop(playbackPowerBlocker);playbackPowerBlocker=null;}
 void phoneServer?.close();
});
} // Single-instance guard: prevents multiple Mac windows fighting over IndexedDB.
