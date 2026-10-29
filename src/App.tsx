import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import {
  Album, ArrowDownToLine, ArrowLeft, ArrowRight, Check, Disc3, FolderOpen,
  Heart, Home, Library, ListMusic, Menu, MoreHorizontal, Music2, Music4, Pause,
  Play, Plus, Repeat, Repeat1, Search, Settings2, Shuffle, SkipBack, SkipForward,
  SlidersHorizontal, Sparkles, Sun, Moon, Trash2, UploadCloud, Volume2, VolumeX, X, Headphones, Clock3, HardDrive, Info, GripVertical, ArrowUp, ArrowDown
} from 'lucide-react';
import {
  type Track, type Playlist, allTracks, allPlaylists, audioBlob, upsertNativeTracks, deletePlaylist,
  getPref, importOne, putPlaylist, removeTrack, hiddenNativeTrackCount, restoreHiddenNativeTracks, setPref, supportedFile, updateTrack
} from './store';
import PlaylistEditor from './PlaylistEditor';
import { matchesLibrarySearch } from './librarySearch';
import { AudioMixer, type EQBands } from './audioMixer';
import { createMixes } from './mixes';
import { useArtworkTheme, type AppearanceMode } from './artworkTheme';

type Page = 'home'|'search'|'songs'|'albums'|'artists'|'liked'|'recent'|'playlist'|'settings'|'mixes';
type RepeatMode = 'off'|'all'|'one';
type PlaylistDraft = {mode:'create'|'rename'|'edit';value:string;playlistId?:string;trackIds:string[]};
type SongDraft = {id:string;title:string;artist:string;album:string};

const shortTime=(value:number)=>Number.isFinite(value)&&value>0?Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0'):'0:00';
const fileSize=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':(n/1024**2).toFixed(1)+' MB';
const colorSets=[['#462d77','#9167cd'],['#6b3157','#d477a6'],['#174d63','#579cac'],['#5c3c2c','#bb8c59'],['#34465f','#8499b8'],['#5b4340','#ba7979']];
const getColors=(name:string)=>colorSets[[...name].reduce((n,c)=>n+c.charCodeAt(0),0)%colorSets.length];
const writeSettingShadow=(key:string,value:unknown)=>{
  try{localStorage.setItem(key,JSON.stringify(value));}catch{}
};
function readSettingShadow<T>(key:string,fallback:T):T {
  try{
    const raw=localStorage.getItem(key);
    return raw===null?fallback:JSON.parse(raw) as T;
  }catch{return fallback;}
}
const moveSong=(ids:string[],from:string,to:string)=>{
  if(from===to||!ids.includes(from)||!ids.includes(to))return ids;
  const next=ids.slice(),old=next.indexOf(from),at=next.indexOf(to);
  next.splice(old,1);next.splice(at,0,from);return next;
};


function Cover({title,url,size='normal'}:{title:string;url?:string;size?:'normal'|'small'|'large'}) {
  const [start,end]=getColors(title);
  return <div className={'cover cover-'+size} style={{background:'linear-gradient(135deg,'+start+','+end+')'}}>
    {url?<img src={url} alt="" loading="lazy" />:<div className="cover-sheen"><Music2 size={size==='small'?19:size==='large'?76:38} strokeWidth={1.5}/></div>}
  </div>;
}
function NavItem({icon,active,onClick,children}:{icon:ReactNode;active?:boolean;onClick:()=>void;children:ReactNode}) {
  return <button className={'nav-link '+(active?'active':'')} onClick={onClick}>{icon}<span>{children}</span></button>;
}
function Stat({value,label}:{value:string;label:string}) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div>; }

export default function App() {
  const [tracks,setTracks]=useState<Track[]>([]);
  const [libraryReady,setLibraryReady]=useState(false);
  const [playlists,setPlaylists]=useState<Playlist[]>([]);
  const [page,setPage]=useState<Page>('home');
  const [selectedPlaylist,setSelectedPlaylist]=useState<string|null>(null);
  const [selectedAlbum,setSelectedAlbum]=useState<string|null>(null);
  const [selectedArtist,setSelectedArtist]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [privateMode,setPrivateMode]=useState(()=>{
    try{return localStorage.getItem('sonora:private-mode-shadow')==='1';}catch{return false;}
  });
  const [mixClock,setMixClock]=useState(Date.now());
  const [selectedMix,setSelectedMix]=useState<string|null>(null);
  const [lyricsOpen,setLyricsOpen]=useState(false);
  const [lyricsLines,setLyricsLines]=useState<{time:number;text:string}[]>([]);
  const [phoneInfo,setPhoneInfo]=useState<{online:boolean;address:string|null;qrDataUrl:string|null;reason:string|null}|null>(null);
  const [busy,setBusy]=useState(false);
  const [nativeFolders,setNativeFolders]=useState<string[]>([]);
  const [importState,setImportState]=useState('');
  const [error,setError]=useState('');
  const [dropActive,setDropActive]=useState(false);
  const [sideOpen,setSideOpen]=useState(false);
  const [currentId,setCurrentId]=useState<string|null>(null);
  const [queue,setQueue]=useState<string[]>([]);
  const [playing,setPlaying]=useState(false);
  const [time,setTime]=useState(0);
  const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(0.76);
  const [muted,setMuted]=useState(false);
  const [equalizerEnabled,setEqualizerEnabled]=useState(false);
  const [eq,setEq]=useState<EQBands>({bass:0,mid:0,treble:0});
  const [fadeSeconds,setFadeSeconds]=useState(0);
  const [lastLibrarySync,setLastLibrarySync]=useState<number|null>(null);
  const [appearanceMode,setAppearanceMode]=useState<AppearanceMode>(() => {
    try {
      const saved = localStorage.getItem('sonora:appearance-mode-shadow');
      if(saved==='auto'||saved==='light'||saved==='dark') return saved;
    } catch {}
    return 'auto';
  });
  const [draggingId,setDraggingId]=useState<string|null>(null);

  const [shuffle,setShuffle]=useState(false);
  const [repeat,setRepeat]=useState<RepeatMode>('off');
  const [showQueue,setShowQueue]=useState(false);
  const [showPlaylistMenu,setShowPlaylistMenu]=useState<string|null>(null);
  const [playlistDraft,setPlaylistDraft]=useState<PlaylistDraft|null>(null);
  const [songDraft,setSongDraft]=useState<SongDraft|null>(null);
  const [dialogError,setDialogError]=useState('');
  const [mediaKeyStatus,setMediaKeyStatus]=useState<{registered:string[];accessibilityTrusted:boolean;hasActiveTrack:boolean}|null>(null);
  const fileInput=useRef<HTMLInputElement|null>(null);
  const mixerRef=useRef<AudioMixer|null>(null);
  if(!mixerRef.current && typeof Audio!=='undefined')mixerRef.current=new AudioMixer();
  const mixer=mixerRef.current!;
  const audioRef=useRef<HTMLAudioElement|null>(null);
  if(!audioRef.current && mixer)audioRef.current=mixer.current;
  const fadeHandoffRef=useRef<string|null>(null);
  const pendingFadeRef=useRef<string|null>(null);
  const beginFadeRef=useRef<(audio:HTMLAudioElement)=>void>(()=>{});

  const nextRef=useRef<(auto:boolean)=>void>(()=>{});
  const wantPlay=useRef(false);
  // Resume a previous position only for the song restored on initial app launch.
  // Explicitly switching tracks must ALWAYS start at 0.
  const startupResumeTrackRef=useRef<string|null>(null);
  const savedPositionBucketRef=useRef<{id:string;bucket:number}>({id:'',bucket:-1});
  const transportRef=useRef<{toggle:()=>void;next:()=>void;previous:()=>void}>({
    toggle:()=>{},next:()=>{},previous:()=>{}
  });
  const lastMediaAction=useRef<{name:string;at:number}>({name:'',at:0});
  const phoneActionRef=useRef<(action:{action:string;id?:string;value?:boolean;position?:number;volume?:number;muted?:boolean;ids?:string[]})=>void>(()=>{});
  const privatePrefsReady=useRef(false);
  const [covers,setCovers]=useState<Record<string,string>>({});
  const [storage,setStorage]=useState<{usage:number;quota:number}>({usage:0,quota:0});

  const refresh=useCallback(async()=> {
    const [ts,ps]=await Promise.all([allTracks(),allPlaylists()]);
    setTracks(ts);setPlaylists(ps);setLibraryReady(true);
    if(navigator.storage?.estimate) {
      const est=await navigator.storage.estimate().catch(()=>null);
      if(est) setStorage({usage:est.usage||0,quota:est.quota||0});
    }
  },[]);
  useEffect(()=>{void refresh().catch(e=>setError('Could not open local library: '+String(e)));},[refresh]);
  useEffect(()=>{void window.sonoraDesktop?.listMusicFolders().then(setNativeFolders).catch(()=>{});},[]);
  useEffect(()=>{
    if(!window.sonoraDesktop)return;
    void window.sonoraDesktop.getPhoneInfo().then(setPhoneInfo).catch(()=>{});
  },[]);
  useEffect(()=>{
    const interval=setInterval(()=>setMixClock(Date.now()),60000);
    return ()=>clearInterval(interval);
  },[]);
  const updatePrivateMode=(value:boolean)=>{
    // Immediate durable shadow protects privacy across an abrupt reload.
    try{localStorage.setItem('sonora:private-mode-shadow',value?'1':'0');}catch{}
    setPrivateMode(value);
  };
  useEffect(()=>{
    void getPref('privateMode',false).then(value=>{
      let saved:string|null=null;
      try{saved=localStorage.getItem('sonora:private-mode-shadow');}catch{}
      setPrivateMode(saved==='1'?true:saved==='0'?false:value);
      privatePrefsReady.current=true;
    });
  },[]);
  useEffect(()=>{if(privatePrefsReady.current)void setPref('privateMode',privateMode);},[privateMode]);
  useEffect(()=>{
    let active=true;
    void getPref<AppearanceMode>('appearanceMode','auto').then(saved=>{
      if(!active)return;
      let shadow:string|null=null;
      try{shadow=localStorage.getItem('sonora:appearance-mode-shadow');}catch{}
      const valid = (mode:string|null):mode is AppearanceMode =>
        mode==='auto'||mode==='light'||mode==='dark';
      setAppearanceMode(valid(shadow)?shadow:valid(saved)?saved:'auto');
    }).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  const updateAppearanceMode=(mode:AppearanceMode)=>{
    try{localStorage.setItem('sonora:appearance-mode-shadow',mode);}catch{}
    setAppearanceMode(mode);
    void setPref('appearanceMode',mode).catch(()=>setError('Could not save your appearance setting.'));
  };
  useEffect(()=>{
    const id=tracks.find(t=>t.id===currentId)?.nativeId;
    if(!id||!window.sonoraDesktop){setLyricsLines([]);return;}
    let alive=true;
    void window.sonoraDesktop.getLyrics(id).then(lines=>{if(alive)setLyricsLines(lines);}).catch(()=>{if(alive)setLyricsLines([]);});
    return ()=>{alive=false};
  },[currentId,tracks.find(t=>t.id===currentId)?.nativeId]);
  useEffect(()=>{
    if(!window.sonoraDesktop)return;
    let valid=true;
    const unsubscribe=window.sonoraDesktop.onLibraryChanged(result=>{
      void (async()=>{
        await upsertNativeTracks(result.tracks);
        if(!valid)return;
        setNativeFolders(result.roots);setLastLibrarySync(Date.now());
        await refresh();
      })().catch(err=>setError('Automatic music library refresh failed: '+String(err)));
    });
    return ()=>{valid=false;unsubscribe();};
  },[refresh]);

  const chooseMusic=()=>{
    if(!window.sonoraDesktop){fileInput.current?.click();return;}
    if(busy)return;
    setBusy(true);setImportState('Choose a folder containing your music…');setError('');
    void window.sonoraDesktop.chooseMusicFolders().then(async result=>{
      if(result.canceled)return;
      setImportState('Adding '+result.tracks.length+' tracks to your library…');
      await upsertNativeTracks(result.tracks);setNativeFolders(result.roots);
      await refresh();if(result.tracks.length)setPage('songs');
      else setError('No supported audio tracks were found in those folders.');
    }).catch(e=>setError('Could not read that music folder: '+String(e))).finally(()=>{setBusy(false);setImportState('');});
  };
  const rescanMusic=()=>{
    if(!window.sonoraDesktop||busy)return;
    setBusy(true);setImportState('Rescanning your music folders…');setError('');
    void window.sonoraDesktop.rescanMusicFolders().then(async result=>{
      await upsertNativeTracks(result.tracks);setNativeFolders(result.roots);
      await refresh();setPage('songs');
    }).catch(e=>setError('Could not rescan music: '+String(e))).finally(()=>{setBusy(false);setImportState('');});
  };

  useEffect(()=>{
    void Promise.all([getPref('volume',0.76),getPref<string|null>('currentId',null),getPref<string[]>('queue',[]),
      getPref('fadeSeconds',0),getPref('eqEnabled',false),getPref<EQBands>('eqBands',{bass:0,mid:0,treble:0})]).then(([v,id,q,fade,enabled,bands])=>{
      // Persist queue changes synchronously as well as in IndexedDB.
      // On rapid reloads the last IndexedDB transaction may not have committed.
      let restoredQueue=q;
      try {
        const raw=localStorage.getItem('sonora:queue-shadow');
        if(raw){
          const saved:unknown=JSON.parse(raw);
          if(Array.isArray(saved)&&saved.length<=10000&&saved.every(id=>typeof id==='string'))
            restoredQueue=saved;
        }
      }catch {}
      const shadowVolume=readSettingShadow('sonora:volume-shadow',v);
      const restoredVolume=Number.isFinite(shadowVolume)&&shadowVolume>=0&&shadowVolume<=1?shadowVolume:v;
      const shadowFade=readSettingShadow('sonora:fade-shadow',fade);
      const restoredFade=Number.isInteger(shadowFade)&&shadowFade>=0&&shadowFade<=8?shadowFade:fade;
      const shadowEq=readSettingShadow('sonora:eq-shadow',bands);
      const restoredEq=shadowEq&&['bass','mid','treble'].every(k=>{
        const value=shadowEq[k as keyof EQBands];
        return typeof value==='number'&&Number.isFinite(value)&&value>=-12&&value<=12;
      })?shadowEq:bands;
      const shadowEnabled=readSettingShadow('sonora:eq-enabled-shadow',enabled);
      const restoredEnabled=typeof shadowEnabled==='boolean'?shadowEnabled:enabled;
      setVolume(restoredVolume);mixer.setVolume(restoredVolume,false);
      startupResumeTrackRef.current=id;
      setCurrentId(id);setQueue(restoredQueue);
      setFadeSeconds(restoredFade);setEqualizerEnabled(restoredEnabled);setEq(restoredEq);
    });
  },[]);
  useEffect(()=>{mixer.setEQ(equalizerEnabled,eq);void setPref('eqEnabled',equalizerEnabled);void setPref('eqBands',eq);},[equalizerEnabled,eq]);
  useEffect(()=>{void setPref('fadeSeconds',fadeSeconds);},[fadeSeconds]);
  useEffect(()=>{
    const next:Record<string,string>={};
    for(const t of tracks) if(t.cover) next[t.id]=URL.createObjectURL(t.cover);
    setCovers(next);
    return ()=>{Object.values(next).forEach(URL.revokeObjectURL);};
  },[tracks]);

  const current=tracks.find(t=>t.id===currentId)||null;
  const artworkTheme=useArtworkTheme(current?.cover,appearanceMode);
  const mixes=useMemo(()=>createMixes(tracks,new Date(mixClock)),[tracks,mixClock]);
  const activeIds=queue.filter(id=>tracks.some(t=>t.id===id));
  const saveQueue=(ids:string[])=>{
    const next=ids.slice();
    // localStorage is synchronous; IndexedDB remains the structured source.
    try{localStorage.setItem('sonora:queue-shadow',JSON.stringify(next));}catch{}
    setQueue(next);
    void setPref('queue',next);
  };
  const startSong=(id:string,ids?:string[])=>{
    if(!tracks.some(t=>t.id===id)) return;
    startupResumeTrackRef.current=null;
    if(ids && ids.length) {saveQueue(ids);}
    mixer.cancelFade();pendingFadeRef.current=null;
    wantPlay.current=true;
    void mixer.unlock().catch(e=>setError('Audio engine failed: '+String(e)));
    if(id===currentId) {
      audioRef.current?.play().catch(()=>setError('Playback was blocked. Press play again to start.'));
    } else setCurrentId(id);
  };
  const nextSong=(auto=false)=>{
    if(mixer.isCrossfading && auto)return;
    startupResumeTrackRef.current=null;
    if(mixer.isCrossfading || pendingFadeRef.current){mixer.cancelFade();pendingFadeRef.current=null;}
    const audio=audioRef.current;
    if(!currentId || !activeIds.length)return;
    if(auto && repeat==='one' && audio){audio.currentTime=0;void audio.play().catch(()=>{});return;}
    wantPlay.current=true;
    const pos=activeIds.indexOf(currentId);
    const nextPos=shuffle && activeIds.length>1
      ? (pos+1+Math.floor(Math.random()*(activeIds.length-1)))%activeIds.length
      : pos+1;
    if(nextPos>=activeIds.length){
      if(repeat==='all') setCurrentId(activeIds[0]);
      else {wantPlay.current=false;setPlaying(false);if(audio)audio.pause();}
    }else setCurrentId(activeIds[nextPos]);
  };
  nextRef.current=nextSong;
  const previousSong=()=>{
    startupResumeTrackRef.current=null;
    if(mixer.isCrossfading || pendingFadeRef.current){mixer.cancelFade();pendingFadeRef.current=null;}
    const audio=audioRef.current;
    if(audio && audio.currentTime>3){audio.currentTime=0;return;}
    const i=activeIds.indexOf(currentId||'');
    if(i>0){wantPlay.current=true;setCurrentId(activeIds[i-1]);} else if(audio)audio.currentTime=0;
  };
  const togglePlay=()=>{
    const audio=audioRef.current;if(!audio)return;
    if(!currentId){
      if(tracks.length)startSong(tracks[0].id,tracks.map(t=>t.id));
      else chooseMusic();
      return;
    }
    if(audio.paused){
      wantPlay.current=true;
      void mixer.unlock().then(()=>audio.play()).catch(()=>setError('Audio cannot play. Try a supported MP3, AAC or WAV file.'));
    }else{
      wantPlay.current=false;
      mixer.cancelFade();pendingFadeRef.current=null;
      audio.pause();
    }
  };
  beginFadeRef.current=(a)=>{
    if(fadeSeconds<=0||!playing||!currentId||repeat==='one'||mixer.isCrossfading||pendingFadeRef.current)return;
    const remaining=(a.duration||duration)-a.currentTime;
    if(!Number.isFinite(remaining)||remaining>fadeSeconds+.2||remaining<=.4)return;
    const position=activeIds.indexOf(currentId);
    if(position<0||!activeIds.length)return;
    const nextIndex=shuffle && activeIds.length>1?(position+1+Math.floor(Math.random()*(activeIds.length-1)))%activeIds.length:position+1;
    const targetId=activeIds[nextIndex]||(repeat==='all'?activeIds[0]:null);
    if(!targetId||targetId===currentId)return;
    const target=tracks.find(t=>t.id===targetId);
    if(!target)return;
    pendingFadeRef.current=targetId;
    void (async()=>{
      const isNative=Boolean(target.nativeId&&window.sonoraDesktop);
      let url='';
      if(isNative)url='sonora-app://localhost/stream/'+target.nativeId;
      else {
        const blob=await audioBlob(targetId);
        if(!blob)throw new Error('Next song is not in the library.');
        url=URL.createObjectURL(blob);
      }
      if(pendingFadeRef.current!==targetId){if(!isNative)URL.revokeObjectURL(url);return;}
      const succeeded=await mixer.crossfadeTo(url,Math.max(.35,Math.min(fadeSeconds,remaining-.15)),()=>{
        audioRef.current=mixer.current;
        fadeHandoffRef.current=targetId;
        pendingFadeRef.current=null;
        startupResumeTrackRef.current=null;
        setCurrentId(targetId);
      },!isNative);
      if(!succeeded){
        if(!isNative && !mixer.isCrossfading)URL.revokeObjectURL(url);
        pendingFadeRef.current=null;
      }
    })().catch(err=>{pendingFadeRef.current=null;console.warn('Crossfade skipped:',err);});
  };
  transportRef.current={
    toggle:togglePlay,
    next:()=>nextRef.current(false),
    previous:previousSong
  };
  useEffect(()=>{
    if(!window.sonoraDesktop)return;
    return window.sonoraDesktop.onPhoneCommand(action=>phoneActionRef.current(action));
  },[]);
  useEffect(()=>{
    if(!window.sonoraDesktop)return;
    window.sonoraDesktop.syncMobileLibrary({
      tracks:tracks.filter(t=>t.nativeId).map(t=>({id:t.id,nativeId:t.nativeId!,title:t.title,artist:t.artist,album:t.album,
        duration:t.duration,liked:t.liked,playedAt:t.playedAt||0})),
      playlists:playlists.map(p=>({id:p.id,name:p.name,trackIds:p.trackIds})),
      mixes:mixes.map(m=>({id:m.id,name:m.name,subtitle:m.subtitle,ids:m.ids})),
      playback:{id:currentId,isPlaying:playing,position:time,volume,muted,duration,queue:activeIds,shuffle,repeat},privateMode
    });
  },[tracks,playlists,mixes,currentId,playing,Math.floor(time/2),privateMode,volume,muted,duration,queue.join('|'),shuffle,repeat]);
  useEffect(()=>{
    if(!window.sonoraDesktop)return;
    return window.sonoraDesktop.onMediaAction(action=>{
      const now=performance.now();
      if(lastMediaAction.current.name===action&&now-lastMediaAction.current.at<140)return;
      lastMediaAction.current={name:action,at:now};
      if(action==='toggle')transportRef.current.toggle();
      if(action==='next')transportRef.current.next();
      if(action==='previous')transportRef.current.previous();
    });
  },[]);
  useEffect(()=>{window.sonoraDesktop?.setPlaybackActive(playing);},[playing]);
  useEffect(()=>{
    window.sonoraDesktop?.setTrackAvailable(Boolean(currentId));
    if(!currentId)setMediaKeyStatus(null);
  },[currentId]);
  useEffect(()=>{
    if(!('mediaSession' in navigator))return;
    navigator.mediaSession.playbackState=currentId?(playing?'playing':'paused'):'none';
  },[currentId,playing]);
  useEffect(()=>{
    const a=audioRef.current;if(!a)return;
    const tick=()=>{
      const seconds=a.currentTime;
      setTime(seconds);
      // Only a real timeupdate from the currently audible deck may persist
      // playback position. React state from the previous track may be stale.
      if(currentId && a===audioRef.current && !a.paused && Number.isFinite(seconds)){
        const bucket=Math.floor(seconds/8);
        if(bucket>0 && (savedPositionBucketRef.current.id!==currentId||
           savedPositionBucketRef.current.bucket!==bucket)){
          savedPositionBucketRef.current={id:currentId,bucket};
          void setPref('position:'+currentId,seconds);
        }
      }
      beginFadeRef.current(a);
    };
    const meta=()=>setDuration(a.duration||0);
    const onplay=()=>setPlaying(true), onpause=()=>setPlaying(false);
    const onend=()=>{if(!mixer.isCrossfading)nextRef.current(true);};
    const onerror=()=>{if(a.error)setError('The selected audio file could not be decoded by this browser.');};
    a.addEventListener('timeupdate',tick);a.addEventListener('loadedmetadata',meta);
    a.addEventListener('play',onplay);a.addEventListener('pause',onpause);
    a.addEventListener('ended',onend);a.addEventListener('error',onerror);
    return ()=>{a.removeEventListener('timeupdate',tick);a.removeEventListener('loadedmetadata',meta);a.removeEventListener('play',onplay);a.removeEventListener('pause',onpause);a.removeEventListener('ended',onend);a.removeEventListener('error',onerror);};
  },[currentId]);
  useEffect(()=>{
    const audio=audioRef.current;if(!audio||!libraryReady)return;
    let closed=false;
    let removeSeekListener:(()=>void)|null=null;
    let applyStartupPosition:(()=>void)|null=null;
    // The flag is consumed once: saved progress is never applied to a song
    // selected by Next, Previous, a playlist click, or the iPhone remote.
    const startupResume=currentId!==null && startupResumeTrackRef.current===currentId;
    if(startupResume)startupResumeTrackRef.current=null;
    setTime(0);
    setDuration(tracks.find(t=>t.id===currentId)?.duration||0);
    void setPref('currentId',currentId);
    if(!currentId){mixer.loadCurrent('');return;}
    if(fadeHandoffRef.current===currentId){
      fadeHandoffRef.current=null;
      setTime(audio.currentTime);
      setDuration(audio.duration||tracks.find(t=>t.id===currentId)?.duration||0);
      return ()=>{closed=true;};
    }
    void (async()=>{
      try {
        const selected=tracks.find(t=>t.id===currentId);
        const position=startupResume?await getPref('position:'+currentId,0):0;
        if(closed)return;
        // If an interrupted session is reopened, allow a one-time resume only
        // when the saved position isn't near the very end of the song.
        if(Number.isFinite(position)&&position>0){
          const seek=()=>{
            if(!closed && audioRef.current===audio &&
              Number.isFinite(audio.duration) &&
              audio.duration-position>Math.max(15,audio.duration*.05)){
              audio.currentTime=position;
              setTime(position);
            }
            if(removeSeekListener){removeSeekListener();removeSeekListener=null;}
          };
          applyStartupPosition=seek;
          audio.addEventListener('loadedmetadata',seek,{once:true});
          removeSeekListener=()=>audio.removeEventListener('loadedmetadata',seek);
        }
        if(selected?.nativeId && window.sonoraDesktop){
          mixer.loadCurrent('sonora-app://localhost/stream/'+selected.nativeId);
        } else {
          const b=await audioBlob(currentId);
          if(closed)return;
          if(!b){setError('Audio not found in the local library. Try importing this song again.');return;}
          mixer.loadCurrent(URL.createObjectURL(b),true);
        }
        if(closed)return;
        if(applyStartupPosition && audio.readyState>=1){
          // A fast-loading file may already have metadata before the await.
          applyStartupPosition();
        }
        if(wantPlay.current) await audio.play().catch(()=>setError('Press play to allow playback in this browser.'));
        const existing=tracks.find(t=>t.id===currentId);
        if(existing && wantPlay.current && privatePrefsReady.current && !privateMode){
          const playedAt=Date.now();
          const playCount=(existing.playCount||0)+1;
          await updateTrack({...existing,playedAt,playCount});
          if(!closed)setTracks(old=>old.map(t=>t.id===existing.id?{...t,playedAt,playCount}:t));
        }
      } catch(e){if(!closed)setError('Cannot load this track: '+String(e));}
    })();
    return ()=>{
      closed=true;
      if(removeSeekListener){removeSeekListener();removeSeekListener=null;}
    };
  },[currentId,libraryReady]);
  useEffect(()=>{
    mixer.setVolume(volume,muted);
    void setPref('volume',volume);
  },[volume,muted]);
  useEffect(()=>{
    if(!('mediaSession' in navigator)||!current)return;
    navigator.mediaSession.metadata=new MediaMetadata({
      title:current.title,artist:current.artist,album:current.album,
      artwork:covers[current.id]?[{src:covers[current.id]}]:[]
    });
    navigator.mediaSession.setActionHandler('play',()=>{
      wantPlay.current=true;
      void audioRef.current?.play().catch(()=>{});
    });
    navigator.mediaSession.setActionHandler('pause',()=>{
      wantPlay.current=false;
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack',previousSong);
    navigator.mediaSession.setActionHandler('nexttrack',()=>nextRef.current(false));
    navigator.mediaSession.setActionHandler('seekto',e=>{if(audioRef.current&&e.seekTime!==undefined)audioRef.current.currentTime=e.seekTime;});
  },[currentId,covers,current,activeIds.join('|')]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement|null;
      if(playlistDraft||songDraft||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName||'')||target?.isContentEditable)return;
      if(e.code==='Space'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
        e.preventDefault();
        if(!e.repeat && !playlistDraft && !songDraft)transportRef.current.toggle();
        return;
      }
      if(e.code==='ArrowRight'&&audioRef.current){e.preventDefault();audioRef.current.currentTime=Math.min(audioRef.current.duration||0,audioRef.current.currentTime+5);}
      if(e.code==='ArrowLeft'&&audioRef.current){e.preventDefault();audioRef.current.currentTime=Math.max(0,audioRef.current.currentTime-5);}
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  });

  const importFiles=async(files:FileList|File[])=>{
    const valid=Array.from(files).filter(supportedFile);
    if(!valid.length){setError('Please choose audio files (MP3, M4A, WAV, FLAC, OGG or AAC).');return;}
    if(busy)return;
    setError('');setBusy(true);
    const seen=new Set(tracks.map(t=>t.fingerprint));
    let added=0,duplicates=0,failures=0;
    for(let i=0;i<valid.length;i++){
      setImportState('Importing '+(i+1)+' of '+valid.length+' · '+valid[i].name);
      try{const result=await importOne(valid[i],seen);if(result==='added')added++;else duplicates++;}
      catch(e){failures++;console.warn('Import failed',valid[i].name,e);}
    }
    await refresh();setBusy(false);setImportState('');
    if(added)setPage('songs');
    if(failures || duplicates)setError(added+' song(s) imported. '+duplicates+' duplicate(s) skipped. '+failures+' failed (check storage quota and file format).');
  };
  const fileChange=(e:ChangeEvent<HTMLInputElement>)=>{if(e.target.files)void importFiles(e.target.files);e.target.value='';};
  const onDrop=(e:DragEvent)=>{e.preventDefault();setDropActive(false);if(e.dataTransfer.files.length)void importFiles(e.dataTransfer.files);};

  const like=async(track:Track)=>{await updateTrack({...track,liked:!track.liked});await refresh();};
  phoneActionRef.current=action=>{
    if(action.action==='pause-mac'){
      wantPlay.current=false;mixer.cancelFade();audioRef.current?.pause();return;
    }
    if(action.action==='resume-mac'){
      if(currentId && audioRef.current?.paused){
        wantPlay.current=true;
        void mixer.unlock().then(()=>audioRef.current?.play()).catch(e=>setError('Phone remote playback failed: '+String(e)));
      } else if(!currentId && tracks.length)startSong(tracks[0].id,tracks.map(t=>t.id));
      return;
    }
    if(action.action==='toggle-mac'){transportRef.current.toggle();return;}
    if(action.action==='volume-mac' && typeof action.volume==='number'){
      const next=Math.max(0,Math.min(1,action.volume));writeSettingShadow('sonora:volume-shadow',next);setVolume(next);setMuted(false);return;
    }
    if(action.action==='mute-mac' && typeof action.muted==='boolean'){setMuted(action.muted);return;}
    if(action.action==='seek-mac' && typeof action.position==='number'){
      const a=audioRef.current;
      if(a && Number.isFinite(a.duration))a.currentTime=Math.max(0,Math.min(action.position,Math.max(0,a.duration-0.15)));
      return;
    }
    if(action.action==='queue-mac' && action.ids){
      const ids=action.ids.filter(id=>tracks.some(t=>t.id===id));
      saveQueue(ids);return;
    }
    if(action.action==='play-on-mac'&&action.id){
      if(tracks.some(t=>t.id===action.id)){
        const ids=(action.ids&&action.ids.length)?action.ids.filter(id=>tracks.some(t=>t.id===id)):activeIds;
        if(typeof action.position==='number' && Number.isFinite(action.position) && action.position>0){
          const target=action.position;
          audioRef.current?.addEventListener('loadedmetadata',function seek(){
            if(audioRef.current&&audioRef.current.duration>target+1)audioRef.current.currentTime=target;
          },{once:true});
        }
        startSong(action.id,ids.includes(action.id)?ids:tracks.map(t=>t.id));
      }
      return;
    }
    if(action.action==='next-mac'){nextRef.current(false);return;}
    if(action.action==='previous-mac'){transportRef.current.previous();return;}
    if(action.action==='private'){updatePrivateMode(Boolean(action.value));return;}
    if(action.action==='like'&&action.id){
      const t=tracks.find(t=>t.id===action.id);
      if(t)void like(t);
    }
    if(action.action==='played'&&action.id&&!privateMode){
      const t=tracks.find(t=>t.id===action.id);
      if(t){
        const updated={...t,playedAt:Date.now(),playCount:(t.playCount||0)+1};
        void updateTrack(updated).then(()=>refresh());
      }
    }
  };
  const eraseTrack=async(track:Track)=>{
    if(!window.confirm('Remove "'+track.title+'" from your local Sonora library? This removes it from Sonora, not your original music folder.'))return;
    await removeTrack(track.id);if(currentId===track.id){wantPlay.current=false;setCurrentId(null);}await refresh();
  };
  const createPlaylist=(track?:Track)=>{
    setDialogError('');
    setPlaylistDraft({mode:'create',value:'',trackIds:track?[track.id]:[]});
  };
  const renamePlaylist=(p:Playlist)=>{
    setDialogError('');
    setPlaylistDraft({mode:'rename',value:p.name,playlistId:p.id,trackIds:p.trackIds});
  };
  const editPlaylist=(p:Playlist)=>{
    setPlaylistDraft({mode:'edit',value:p.name,playlistId:p.id,trackIds:p.trackIds});
  };
  const savePlaylistDraft=async(name:string,ids:string[])=>{
    if(!playlistDraft)return;
    if(!name||name.length>120)throw new Error('Enter a playlist name of 1 to 120 characters.');
    const savedPlaylists=await allPlaylists();
    if(savedPlaylists.some(p=>p.name.toLowerCase()===name.toLowerCase()&&p.id!==playlistDraft.playlistId))
      throw new Error('A playlist with that name already exists.');
    const available=new Set((await allTracks()).map(track=>track.id));
    const trackIds=[...new Set(ids)].filter(id=>available.has(id));
    if(playlistDraft.mode==='create'){
      const created:Playlist={id:crypto.randomUUID(),name,createdAt:Date.now(),trackIds};
      await putPlaylist(created);
      await refresh();
      setSelectedPlaylist(created.id);setPage('playlist');setSideOpen(false);
    }else{
      const existing=savedPlaylists.find(p=>p.id===playlistDraft.playlistId);
      if(!existing)throw new Error('Playlist no longer exists.');
      await putPlaylist({...existing,name,trackIds:playlistDraft.mode==='rename'?existing.trackIds:trackIds});
      await refresh();
    }
    setPlaylistDraft(null);
  };
  const editSong=(track:Track)=>{
    setDialogError('');
    setShowPlaylistMenu(null);
    setSongDraft({id:track.id,title:track.title,artist:track.artist,album:track.album});
  };
  const saveSongDraft=async()=>{
    if(!songDraft)return;
    const title=songDraft.title.trim(),artist=songDraft.artist.trim(),album=songDraft.album.trim();
    if(!title||!artist||!album){setDialogError('Title, artist and album cannot be empty.');return;}
    const song=tracks.find(t=>t.id===songDraft.id);
    if(!song){setSongDraft(null);return;}
    try{
      await updateTrack({...song,title,artist,album,customTitle:title,customArtist:artist,customAlbum:album});
      await refresh();
      setSongDraft(null);setDialogError('');
    }catch(e){setDialogError('Could not save song details: '+String(e));}
  };
  const removePlaylist=async(p:Playlist)=>{
    if(!confirm('Delete playlist "'+p.name+'"? Songs remain in your library.'))return;
    await deletePlaylist(p.id);setPage('home');setSelectedPlaylist(null);await refresh();
  };
  const addToPlaylist=async(track:Track,p:Playlist)=>{
    if(p.trackIds.includes(track.id)) return;
    await putPlaylist({...p,trackIds:[...p.trackIds,track.id]});await refresh();setShowPlaylistMenu(null);
  };
  const removeFromPlaylist=async(track:Track,p:Playlist)=>{
    await putPlaylist({...p,trackIds:p.trackIds.filter(id=>id!==track.id)});await refresh();
  };
  const reorderPlaylist=async(pl:Playlist,source:string,target:string)=>{
    if(source===target)return;
    const changed=moveSong(pl.trackIds,source,target);
    if(changed.join('|')===pl.trackIds.join('|'))return;
    await putPlaylist({...pl,trackIds:changed});
    setPlaylists(previous=>previous.map(item=>item.id===pl.id?{...pl,trackIds:changed}:item));
    if(queue.length===pl.trackIds.length && queue.every(id=>pl.trackIds.includes(id))){
      saveQueue(changed);
    }
  };
  const reorderQueue=(source:string,target:string)=>{
    const changed=moveSong(queue,source,target);
    saveQueue(changed);
  };
  const moveQueueStep=(id:string,amount:number)=>{
    const index=queue.indexOf(id),next=queue[index+amount];
    if(index>=0&&next)reorderQueue(id,next);
  };
  const p=playlists.find(p=>p.id===selectedPlaylist);
  const albums=useMemo(()=>Array.from(new Set(tracks.map(t=>t.album))).sort(),[tracks]);
  const artists=useMemo(()=>Array.from(new Set(tracks.map(t=>t.artist))).sort(),[tracks]);
  const query=search.trim().toLowerCase();
  const searchedTracks=tracks.filter(t=>matchesLibrarySearch(t,query));
  const visibleTracks=page==='liked'?tracks.filter(t=>t.liked)
    :page==='recent'?tracks.filter(t=>t.playedAt).sort((a,b)=>(b.playedAt||0)-(a.playedAt||0))
    :page==='playlist'?tracks.filter(t=>p?.trackIds.includes(t.id)).sort((a,b)=>(p?.trackIds.indexOf(a.id)||0)-(p?.trackIds.indexOf(b.id)||0))
    :page==='albums'&&selectedAlbum?tracks.filter(t=>t.album===selectedAlbum)
    :page==='artists'&&selectedArtist?tracks.filter(t=>t.artist===selectedArtist)
    :page==='search'?searchedTracks
    :page==='mixes'&&selectedMix?mixes.find(m=>m.id===selectedMix)?.ids.map(id=>tracks.find(t=>t.id===id)).filter((t):t is Track=>Boolean(t))||[]
    :tracks;
  const title=page==='home'?'Good to have you here':page==='search'?'Search':page==='liked'?'Liked songs'
    :page==='recent'?'Recently played':page==='playlist'?(p?.name||'Playlist'):page==='albums'?(selectedAlbum||'Albums')
    :page==='artists'?(selectedArtist||'Artists'):page==='mixes'?(mixes.find(m=>m.id===selectedMix)?.name||'Your mixes'):page==='songs'?'Your songs':'Settings';
  const open=(name:Page)=>{setPage(name);setSideOpen(false);setShowQueue(false);if(name!=='albums')setSelectedAlbum(null);if(name!=='artists')setSelectedArtist(null);};
  const randomPlay=()=>{if(!tracks.length)return;const shuffled=[...tracks].sort(()=>Math.random()-.5);startSong(shuffled[0].id,shuffled.map(t=>t.id));};

  const songList=(songs:Track[],playlist?:Playlist)=>(
    <div className="tracklist">
      <div className="track-header"><span>#</span><span>Title</span><span className="track-album">Album</span><span className="track-time"><Clock3 size={15}/></span><span></span></div>
      {songs.map((track,i)=><div key={track.id} data-testid={'track-'+track.id} draggable={Boolean(playlist)}
        onDragStart={e=>{if(!playlist)return;setDraggingId(track.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',track.id);}}
        onDragOver={e=>{if(playlist){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';}}}
        onDrop={e=>{if(!playlist)return;e.preventDefault();e.stopPropagation();const source=e.dataTransfer.getData('text/plain');setDraggingId(null);void reorderPlaylist(playlist,source,track.id);}}
        onDragEnd={()=>setDraggingId(null)}
        className={'track-row '+(track.id===currentId?'track-current':'')+(draggingId===track.id?' track-dragging':'')}>
        <button className="track-num" aria-label={'Play '+track.title} onClick={()=>startSong(track.id,songs.map(t=>t.id))}>
          {track.id===currentId&&playing?<span className="bars"><i/><i/><i/></span>:<><span className="num-static">{i+1}</span><Play className="num-hover" size={16} fill="currentColor"/></>}
        </button>
        <button className="track-title" onClick={()=>startSong(track.id,songs.map(t=>t.id))}>
          <Cover title={track.album} url={covers[track.id]} size="small"/><span className="track-labels"><strong>{track.title}</strong><small>{track.artist}</small></span>
        </button>
        <button className="album-name track-album" onClick={()=>{setSelectedAlbum(track.album);open('albums');}}>{track.album}</button>
        <span className="track-time">{shortTime(track.duration)}</span>
        <div className="track-actions">
          <button className={'icon-btn like-btn '+(track.liked?'is-liked':'')} onClick={()=>void like(track)} title={track.liked?'Unlike':'Like'}><Heart size={17} fill={track.liked?'currentColor':'none'}/></button>
          <div className="song-menu-holder"><button className="icon-btn" onClick={()=>setShowPlaylistMenu(showPlaylistMenu===track.id?null:track.id)} title="More options"><MoreHorizontal size={19}/></button>
          {showPlaylistMenu===track.id&&<div className="popup-menu">
            <div className="popup-label">Add to playlist</div>
            {playlists.map(pl=><button key={pl.id} onClick={()=>void addToPlaylist(track,pl)}>{pl.trackIds.includes(track.id)?<Check size={14}/>:<Plus size={14}/>} {pl.name}</button>)}
            <button onClick={()=>{setShowPlaylistMenu(null);createPlaylist(track);}}><Plus size={14}/> New playlist</button>
            <button onClick={()=>editSong(track)}><Settings2 size={14}/> Edit song details</button>
            {playlist&&<button onClick={()=>{setShowPlaylistMenu(null);void removeFromPlaylist(track,playlist);}}><X size={14}/> Remove from playlist</button>}
            <button className="danger" onClick={()=>{setShowPlaylistMenu(null);void eraseTrack(track);}}><Trash2 size={14}/> Remove song</button>
          </div>}
          </div>
        </div>
      </div>)}
    </div>
  );
  return <div className={'app '+(dropActive?'dropping':'')} data-appearance={appearanceMode} style={artworkTheme} onDragOver={e=>{e.preventDefault();setDropActive(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDropActive(false);}} onDrop={onDrop}>
    <input className="sr-only" ref={fileInput} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.aiff" multiple onChange={fileChange}/>
    {dropActive&&<div className="drop-target"><UploadCloud size={42}/><strong>Drop your music here</strong><span>Your tracks stay on this device</span></div>}
    <aside className={'sidebar '+(sideOpen?'sidebar-open':'')}>
      <div className="logo"><div className="logo-emblem"><span className="logo-bars"><i/><i/><i/><i/></span></div><span>sonora<span className="logo-dot">.</span></span><button className="mobile-close" onClick={()=>setSideOpen(false)}><X/></button></div>
      <div className="nav-group"><div className="nav-label">DISCOVER</div>
        <NavItem icon={<Home size={19}/>} active={page==='home'} onClick={()=>open('home')}>Home</NavItem>
        <NavItem icon={<Sparkles size={19}/>} active={page==='mixes'} onClick={()=>{setSelectedMix(null);open('mixes');}}>Your mixes</NavItem>
        <NavItem icon={<Search size={19}/>} active={page==='search'} onClick={()=>open('search')}>Search</NavItem>
      </div>
      <div className="nav-group"><div className="nav-label">YOUR MUSIC</div>
        <NavItem icon={<Library size={19}/>} active={page==='songs'} onClick={()=>open('songs')}>All songs</NavItem>
        <NavItem icon={<Disc3 size={19}/>} active={page==='albums'} onClick={()=>open('albums')}>Albums</NavItem>
        <NavItem icon={<Headphones size={19}/>} active={page==='artists'} onClick={()=>open('artists')}>Artists</NavItem>
        <NavItem icon={<Heart size={19}/>} active={page==='liked'} onClick={()=>open('liked')}>Liked songs</NavItem>
        <NavItem icon={<Clock3 size={19}/>} active={page==='recent'} onClick={()=>open('recent')}>Recently played</NavItem>
      </div>
      <div className="playlist-title"><div className="nav-label">PLAYLISTS</div><button className="bare-icon" aria-label="Create playlist" onClick={()=>void createPlaylist()}><Plus size={19}/></button></div>
      <div className="playlist-scroll">
      {playlists.map(pl=><NavItem key={pl.id} icon={<ListMusic size={18}/>} active={page==='playlist'&&pl.id===selectedPlaylist} onClick={()=>{setSelectedPlaylist(pl.id);open('playlist');}}>{pl.name}</NavItem>)}
      {!playlists.length&&<div className="sidebar-helper">Make a playlist that's all yours.</div>}
      </div>
      <div className="sidebar-bottom"><div className="local-flag"><span className="green-light"/> LOCAL LIBRARY <span className="flag-check"><Check size={13}/></span></div>
        <NavItem icon={<Settings2 size={19}/>} active={page==='settings'} onClick={()=>open('settings')}>Settings</NavItem>
      </div>
    </aside>
    <div className="main-layout">
      <main className="main-scroll">
        <header className="topbar">
          <div className="top-left"><button className="mobile-hamburger" onClick={()=>setSideOpen(true)}><Menu size={22}/></button>
          <div className="top-arrows"><button className="round-button" onClick={()=>open('home')} title="Home"><ArrowLeft size={18}/></button><button className="round-button" onClick={()=>open('songs')} title="Library"><ArrowRight size={18}/></button></div>
          <span className="top-kicker">YOUR PRIVATE LISTENING SPACE</span></div>
          <div className="top-actions"><button className={'privacy-toggle '+(privateMode?'enabled':'')} onClick={()=>updatePrivateMode(!privateMode)} title="Private listening does not update your listening history">{privateMode?'● Private session ON':'○ Private session'}</button>
          <button className="import-button" onClick={chooseMusic} disabled={busy}><Plus size={18}/> Add music</button></div>
        </header>
        {error&&<div className="notice" role="alert"><Info size={16}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss"><X size={17}/></button></div>}
        {busy&&<div className="notice notice-progress"><div className="spinner"/><span>{importState}</span></div>}
        <div className="main-inner">
        {page==='home'&&<>
          <div className="eyebrow"><Sparkles size={14}/> YOUR MUSIC, YOUR RULES</div>
          <h1 className="page-title">Good to have you <em>here.</em></h1>
          <p className="page-subtitle">A little space for the music you love. No noise, just the good stuff.</p>
          <div className="hero"><div className="hero-glow"/><div className="hero-copy">
            <span className="hero-eyebrow"><span className="tiny-star">✦</span> YOUR PERSONAL SOUNDTRACK</span>
            <h2>Every song.<br/><span>Your way.</span></h2>
            <p>Full-length listening, beautifully yours. Import the songs you own and enjoy the whole track.</p>
            <div className="hero-actions"><button className="white-button" onClick={()=>tracks.length?randomPlay():chooseMusic()}>{tracks.length?<><Play size={17} fill="currentColor"/> Play something</>:<><Plus size={18}/> Add your first songs</>}</button>
            {tracks.length>0&&<button className="text-button" onClick={()=>open('songs')}>Browse library <ArrowRight size={16}/></button>}</div>
          </div><div className="hero-art" aria-hidden="true"><div className="vinyl vinyl-back"/><div className="vinyl vinyl-front"><div className="vinyl-center"><Music4 size={38}/></div></div><div className="hero-stars star-a">✦</div><div className="hero-stars star-b">✧</div></div></div>
          {mixes.length>0&&<div className="mix-home"><div className="section-heading"><div><h2>Made for you</h2><p>Your personal mixes, refreshed automatically</p></div>
            <button className="see-all" onClick={()=>{setSelectedMix(null);open('mixes');}}>View mixes <ArrowRight size={16}/></button></div>
            <div className="mix-grid">{mixes.slice(0,4).map(m=><button key={m.id} className="mix-card" onClick={()=>{setSelectedMix(m.id);open('mixes');}}><Sparkles size={20}/><strong>{m.name}</strong><small>{m.subtitle}</small></button>)}</div>
          </div>}
          <div className="artist-radar"><div className="radar-label"><Sparkles size={15}/> ARTISTS TO EXPLORE</div>
            <div className="radar-chips">{['Alex G','Alex G Offline','wifiskeleton','keepsecrets'].map(a=>
              <button key={a} onClick={()=>{setSearch(a);open('search');}}>{a}<ArrowRight size={13}/></button>)}</div>
            <p>Search shortcuts for the artists you mentioned. Tracks appear when you add them to your library.</p>
          </div>
          {tracks.length>0?<>
            <div className="section-heading"><div><h2>Made for your ears</h2><p>A quick look at your collection</p></div><button className="see-all" onClick={()=>open('songs')}>See all <ArrowRight size={16}/></button></div>
            <div className="stats-strip"><Stat value={String(tracks.length)} label="Songs in your collection"/><Stat value={String(albums.length)} label="Albums to explore"/><Stat value={String(artists.length)} label="Artists you love"/><div className="stats-accent"><SlidersHorizontal size={27}/><span>All yours.<br/>Always.</span></div></div>
            <div className="section-heading"><div><h2>Fresh in your library</h2><p>Recently added tracks</p></div><button className="see-all" onClick={()=>open('songs')}>View songs <ArrowRight size={16}/></button></div>
            {songList(tracks.slice(0,6))}
            {albums.length>0&&<><div className="section-heading"><div><h2>Albums worth exploring</h2></div><button className="see-all" onClick={()=>open('albums')}>All albums <ArrowRight size={16}/></button></div>
            <div className="album-grid">{albums.slice(0,6).map(a=>{const t=tracks.find(t=>t.album===a)!;return <button key={a} className="album-card" onClick={()=>{setSelectedAlbum(a);open('albums');}}><Cover title={a} url={covers[t.id]}/><strong>{a}</strong><span>{t.artist}</span></button>;})}</div></>}
          </>:<div className="empty-section"><div className="empty-icon"><FolderOpen size={25}/></div><div><strong>Your collection begins here</strong><p>Choose a music folder to play its original audio files, or drag songs into the player.</p></div><button className="outline-button" onClick={chooseMusic}>Choose music folder <ArrowRight size={16}/></button></div>}
        </>}
        {page!=='home'&&<>
          {page==='search'&&<div className="search-top"><div><div className="eyebrow">FIND YOUR SOUND</div><h1 className="page-title">Find your <em>favourites.</em></h1></div><div className="search-box"><Search size={20}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search songs, artists, albums..." /><button onClick={()=>setSearch('')} aria-label="Clear search">{search&&<X size={17}/>}</button></div></div>}
          {page!=='search'&&<div className="page-top"><div><div className="eyebrow">{page==='settings'?'MAKE IT YOURS':'YOUR COLLECTION'}</div><h1 className="page-title">{title}<span className="title-period">.</span></h1>
          <p className="page-subtitle">{page==='mixes'?(selectedMix?'Your personalised listening queue':'Daily, weekly and daypart playlists refreshed automatically')
            :page==='songs'?tracks.length+' songs in your library':page==='liked'?visibleTracks.length+' liked tracks'
            :page==='albums'&&!selectedAlbum?albums.length+' albums':page==='artists'&&!selectedArtist?artists.length+' artists'
            :page==='playlist'?visibleTracks.length+' tracks · drag songs to reorder':page==='recent'?'The songs you last listened to':'Every detail, just how you like it.'}</p></div>
          <div className="page-actions">
            {page==='playlist'&&p&&<><button className="outline-button" onClick={()=>editPlaylist(p)}>Edit songs</button><button className="outline-button" onClick={()=>void renamePlaylist(p)}>Rename</button><button className="icon-btn danger-icon" title="Delete playlist" onClick={()=>void removePlaylist(p)}><Trash2 size={18}/></button></>}
            {(selectedAlbum||selectedArtist)&&<button className="outline-button" onClick={()=>{setSelectedAlbum(null);setSelectedArtist(null);}}>All {page}</button>}
            {visibleTracks.length>0&&page!=='settings'&&(page!=='albums'||!!selectedAlbum)&&(page!=='artists'||!!selectedArtist)&&<button className="play-all" onClick={()=>startSong(visibleTracks[0].id,visibleTracks.map(t=>t.id))}><Play size={18} fill="currentColor"/> Play all</button>}
          </div></div>}
          {page==='settings'&&<div className="settings-list">
            <section className="setting-card appearance-setting" aria-labelledby="appearance-title">
              <div className="appearance-heading">
                <div className="setting-icon appearance-heading-icon"><Sparkles size={23}/></div>
                <div className="appearance-intro">
                  <div className="appearance-kicker">YOUR SPACE, YOUR MOOD</div>
                  <h3 id="appearance-title">Appearance</h3>
                  <p>Keep the colours of every album. Choose how bright or dark the rest of Sonora feels.</p>
                </div>
                <span className="appearance-live"><span className="appearance-live-dot"/> LIVE PREVIEW</span>
              </div>
              <div className="appearance-options" role="group" aria-label="Appearance mode">
                {([
                  {mode:'auto',label:'Automatic',detail:'Let the artwork decide',Icon:Sparkles},
                  {mode:'light',label:'Light',detail:'Soft, sunlit colours',Icon:Sun},
                  {mode:'dark',label:'Dark',detail:'Deep, cinematic tones',Icon:Moon}
                ] as const).map(({mode,label,detail,Icon})=>
                  <button type="button" key={mode} data-testid={'appearance-'+mode}
                    className={'appearance-choice'+(appearanceMode===mode?' is-selected':'')}
                    aria-pressed={appearanceMode===mode} onClick={()=>updateAppearanceMode(mode)}>
                    <span className={'appearance-preview appearance-preview-'+mode} aria-hidden="true">
                      <span className="appearance-preview-rail"><i/><i/><i/></span>
                      <span className="appearance-preview-content">
                        <span className="appearance-preview-art"><i/><i/></span>
                        <span className="appearance-preview-lines"><i/><i/></span>
                        <span className="appearance-preview-progress"/>
                      </span>
                    </span>
                    <span className="appearance-choice-details">
                      <span className="appearance-choice-title"><Icon size={16}/>{label}</span>
                      <span className="appearance-choice-subtitle">{detail}</span>
                    </span>
                    <span className="appearance-choice-check" aria-hidden="true">{appearanceMode===mode&&<Check size={13} strokeWidth={3}/>}</span>
                  </button>
                )}
              </div>
              <div className="appearance-caption"><Disc3 size={14}/> Album colours stay in sync in every mode. Your choice is saved automatically.</div>
            </section>
            <div className="setting-card"><div className="setting-icon"><Headphones size={24}/></div><div><h3>Private session</h3>
              <p>When enabled, Sonora does not record what you play in listening history or use those plays to shape future mixes. Sonora has no public listening profile to begin with.</p>
              <label className="setting-toggle"><input type="checkbox" checked={privateMode} onChange={e=>updatePrivateMode(e.target.checked)}/> Private listening {privateMode?'enabled':'disabled'}</label>
            </div></div>
            {window.sonoraDesktop&&<div className="setting-card"><div className="setting-icon"><Headphones size={24}/></div>
              <div><h3>Listen on your phone</h3><p>Keep Sonora running on your Mac and connect your phone to the same Wi-Fi network. Scan this QR code with your phone camera, then choose Add to Home Screen in your browser.</p>
              {phoneInfo?.online&&phoneInfo.qrDataUrl?<div className="phone-pair"><img src={phoneInfo.qrDataUrl} width={198} height={198} alt="Scan to pair your phone with Sonora"/><p>Scan with your phone · {phoneInfo.address}</p></div>:<p>{phoneInfo?.reason||'Phone link not available yet. Check your Mac Wi-Fi connection.'}</p>}
              <p className="dialog-hint">Mac and phone must remain on the same local network and the Mac must stay on. This is local streaming, not access over mobile data or a full offline phone app. Connect only over a trusted home Wi-Fi network; the local web connection uses HTTP, not end-to-end encryption.</p>
            </div></div>}
            {window.sonoraDesktop&&<div className="setting-card"><div className="setting-icon"><Headphones size={24}/></div><div>
              <h3>PS5 Gaming Remote</h3>
              <p>Control music playing on this Mac from your iPhone while gaming. Open the Sonora phone companion and select the <strong>Gaming Remote</strong> tab. Play, pause, skip, seek, choose a playlist or adjust the Mac's music volume.</p>
              <p><strong>Hear both sources:</strong> Connect PS5 audio to your compatible dual-source headset using its console USB/2.4 GHz connection. Connect this Mac to the same headset using Bluetooth, then choose the headset under macOS System Settings → Sound → Output. A wired hardware audio mixer is an alternative.</p>
              <p>PS5 USB Music playback is separate and cannot be controlled this way. Mac and iPhone must share trusted Wi-Fi; keep Sonora running and the Mac powered. While music plays, Sonora prevents app suspension, but closing the MacBook lid may still suspend it.</p>
            </div></div>}
            <div className="setting-card"><div className="setting-icon"><HardDrive size={24}/></div><div><h3>On-device listening</h3><p>{window.sonoraDesktop?'Folders selected in the Mac app stream directly from your original files. Only metadata, favourites and playlists are saved in Sonora. Keep the source files in place.':'Your imported audio is stored privately in this browser. Clearing website storage can erase this library. Keep your original files.'} We never upload your music.</p></div><span className="setting-badge">LOCAL ONLY</span></div>
            {window.sonoraDesktop&&<div className="setting-card"><div className="setting-icon"><Trash2 size={24}/></div>
              <div><h3>Restore hidden music</h3>
                <p>Songs removed from Sonora stay hidden during automatic folder scans, but their original files remain untouched. Restore all hidden folder tracks whenever you want.</p>
                <button className="outline-button" onClick={async()=>{
                  if(!window.confirm('Restore the songs you previously removed from Sonora?'))return;
                  try{
                    const count=await hiddenNativeTrackCount();
                    if(!count){setError('No hidden tracks to restore.');return;}
                    await restoreHiddenNativeTracks();
                    const result=await window.sonoraDesktop!.rescanMusicFolders();
                    await upsertNativeTracks(result.tracks);
                    await refresh();
                    setError(count+' hidden song(s) restored.');
                  }catch(e){setError('Could not restore hidden music: '+String(e));}
                }}>Restore removed songs</button>
              </div></div>}
            {window.sonoraDesktop&&<div className="setting-card"><div className="setting-icon"><FolderOpen size={24}/></div>
              <div><h3>Connected music folders</h3><p>{nativeFolders.length?nativeFolders.join(' · '):'No music folders added yet.'}</p>
              <p className="muted">Automatic folder monitoring is enabled. New audio files appear in your library without using Rescan. {lastLibrarySync?'Last update: '+new Date(lastLibrarySync).toLocaleTimeString():''}</p>
              <div className="page-actions"><button className="outline-button" onClick={chooseMusic}><Plus size={15}/> Add folder</button>
              <button className="outline-button" onClick={rescanMusic}>Rescan folders</button></div></div></div>}
            <div className="setting-card"><div className="setting-icon"><FolderOpen size={24}/></div><div><h3>Storage</h3><p>{fileSize(storage.usage)} used out of roughly {storage.quota?fileSize(storage.quota):'unknown'} local app storage. Folder-sourced audio is never copied here; tracks imported by dragging files are.</p><button className="outline-button" onClick={async()=>{if(navigator.storage?.persist){const ok=await navigator.storage.persist();alert(ok?'Browser has granted persistent storage.':'Persistent storage was not granted. Keep your original files backed up.');}}}>Request persistent storage</button></div></div>
            {window.sonoraDesktop&&<div className="setting-card"><div className="setting-icon"><SlidersHorizontal size={24}/></div><div>
              <h3>Mac media keys and shortcuts</h3>
              <p>Space: play/pause (except while editing text). Mac play/pause, next and previous buttons work through macOS Now Playing where supported, with a native shortcut fallback. Media shortcuts may require Accessibility permission or conflict with another player.</p>
              <button className="outline-button" onClick={()=>void window.sonoraDesktop?.getMediaKeyStatus().then(setMediaKeyStatus).catch(e=>setError(String(e)))}>Check media key status</button>
              {mediaKeyStatus&&<p className="media-key-info" data-testid="media-key-status">Registered native keys: {mediaKeyStatus.registered.length}/3. Accessibility: {mediaKeyStatus.accessibilityTrusted?'allowed':'not granted'}. {mediaKeyStatus.hasActiveTrack?'A track is selected.':'Choose a track to activate native shortcuts.'} {mediaKeyStatus.registered.length!==3?'If needed, enable Sonora Music under System Settings → Privacy & Security → Accessibility, then reopen Sonora. macOS or another player can reserve these keys.':''}</p>}
            </div></div>}
            <div className="setting-card"><div className="setting-icon"><SlidersHorizontal size={24}/></div><div className="sound-settings">
              <h3>Sound settings</h3><p>Shape your sound with a three-band equaliser, and overlap consecutive tracks with an adjustable crossfade.</p>
              <label className="setting-toggle"><input type="checkbox" checked={equalizerEnabled} onChange={e=>{writeSettingShadow('sonora:eq-enabled-shadow',e.target.checked);setEqualizerEnabled(e.target.checked);}}/> Enable equaliser</label>
              <div className="eq-presets">{[{name:'Flat',bass:0,mid:0,treble:0},{name:'Warm',bass:4,mid:0,treble:2},{name:'Bass boost',bass:7,mid:-1,treble:1},{name:'Vocal',bass:-2,mid:5,treble:2}].map(preset=>
                <button className="outline-button" key={preset.name} onClick={()=>{const next={bass:preset.bass,mid:preset.mid,treble:preset.treble};writeSettingShadow('sonora:eq-shadow',next);writeSettingShadow('sonora:eq-enabled-shadow',true);setEq(next);setEqualizerEnabled(true);}}>{preset.name}</button>)}</div>
              <div className="eq-grid">{(['bass','mid','treble'] as const).map(band=><label key={band}><span>{band.charAt(0).toUpperCase()+band.slice(1)}</span><strong>{eq[band]>0?'+':''}{eq[band]} dB</strong>
                <input aria-label={band+' equalizer'} type="range" min="-12" max="12" value={eq[band]} step="1" disabled={!equalizerEnabled}
                  onChange={e=>{const next={...eq,[band]:Number(e.target.value)};writeSettingShadow('sonora:eq-shadow',next);setEq(next);}}/></label>)}</div>
              <label className="fade-setting"><span>Crossfade duration</span><strong>{fadeSeconds===0?'Off':fadeSeconds+' seconds'}</strong>
                <input aria-label="Crossfade duration" type="range" min="0" max="8" step="1" value={fadeSeconds} onChange={e=>{const next=Number(e.target.value);writeSettingShadow('sonora:fade-shadow',next);setFadeSeconds(next);}}/></label>
              <p className="dialog-hint">Crossfade overlaps songs automatically near the end of a track. Repeat-one plays the same song without crossfading. Changes are saved on this Mac.</p>
            </div></div>
            <div className="setting-card"><div className="setting-icon"><ArrowDownToLine size={24}/></div><div><h3>Export playlist definitions</h3><p>Download a JSON file of playlist names and song titles. Audio files are not included; this is not a music backup.</p><button className="outline-button" onClick={()=>{const data=playlists.map(pl=>({name:pl.name,songs:pl.trackIds.map(id=>tracks.find(t=>t.id===id)).filter(Boolean).map(t=>({title:t!.title,artist:t!.artist,album:t!.album}))}));const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sonora-playlists.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export playlists <ArrowDownToLine size={15}/></button></div></div>
            <div className="setting-card"><div className="setting-icon"><Info size={24}/></div><div><h3>What Sonora plays</h3><p>Sonora plays full-length audio files you import. It does not provide Spotify's licensed catalogue, YouTube extraction or music downloads. Some formats (such as FLAC) depend on your browser. For streaming across devices later, Navidrome is a possible separate upgrade.</p></div></div>
          </div>}
          {page==='mixes'&&!selectedMix&&<><p className="muted">Based on your own library, liked songs and listening history—not a commercial recommendation catalogue. Private sessions never update your history.</p>
            <div className="mix-grid">{mixes.map(m=><button key={m.id} className="mix-card" onClick={()=>setSelectedMix(m.id)}><Sparkles size={23}/><strong>{m.name}</strong><small>{m.subtitle}</small>
              <span className="mix-count">{m.ids.length} tracks · Refreshes {new Date(m.refreshAt).toLocaleString()}</span></button>)}</div></>}
          {page==='mixes'&&selectedMix&&<div className="mix-back"><button className="outline-button" onClick={()=>setSelectedMix(null)}><ArrowLeft size={15}/> All mixes</button></div>}
          {page==='albums'&&!selectedAlbum&&<div className="album-grid large-grid">{albums.map(a=>{const t=tracks.find(t=>t.album===a)!;return <button key={a} className="album-card" onClick={()=>setSelectedAlbum(a)}><Cover title={a} url={covers[t.id]}/><strong>{a}</strong><span>{t.artist} · {tracks.filter(t=>t.album===a).length} tracks</span></button>;})}</div>}
          {page==='artists'&&!selectedArtist&&<div className="album-grid large-grid">{artists.map(a=>{const t=tracks.find(t=>t.artist===a)!;return <button key={a} className="album-card artist-card" onClick={()=>setSelectedArtist(a)}><Cover title={a} url={covers[t.id]}/><strong>{a}</strong><span>{tracks.filter(t=>t.artist===a).length} songs</span></button>;})}</div>}
          {page!=='settings'&&!(page==='albums'&&!selectedAlbum)&&!(page==='artists'&&!selectedArtist)&&!(page==='mixes'&&!selectedMix)&&<>
            {page==='playlist'&&!p?<div className="simple-empty">Playlist no longer exists.</div>:
            visibleTracks.length>0?<>
              {page==='search'&&<div className="section-heading"><h2>{query?'Search results':'All songs'}</h2><span className="muted">{visibleTracks.length} tracks</span></div>}
              {songList(visibleTracks,page==='playlist'?p:undefined)}
            </>:<div className="content-empty"><div className="empty-icon big"><Music2 size={34}/></div><h3>{page==='search'?'Nothing found yet':page==='liked'?'No liked songs yet':page==='playlist'?'Nothing in this playlist yet':page==='recent'?'No listening history yet':'Your music is waiting'}</h3><p>{page==='search'?'Try another search or add music to your collection.':page==='liked'?'Tap the heart on a track to save it here.':page==='playlist'?'Choose songs already in your library to add to this playlist.':'Add audio files from your computer to start listening.'}</p>{page==='playlist'&&p?<button className="outline-button" onClick={()=>editPlaylist(p)}><Plus size={17}/> Choose songs</button>:<button className="outline-button" onClick={chooseMusic}><Plus size={17}/> Add music</button>}</div>}
          </>}
          {((page==='albums'&&!selectedAlbum&&!albums.length)||(page==='artists'&&!selectedArtist&&!artists.length))&&<div className="content-empty"><div className="empty-icon big"><Album size={33}/></div><h3>It all starts with a song</h3><p>Import your music and we’ll create your album and artist collections.</p><button className="outline-button" onClick={chooseMusic}>Import songs</button></div>}
        </>}
        </div>
        <footer className="page-footer"><span>sonora<span className="logo-dot">.</span></span> Music is better when it's yours. <span>Built for listening, not scrolling.</span></footer>
      </main>
      {showQueue&&<aside className="queue-panel"><div className="queue-top"><strong>Up next</strong><button className="icon-btn" onClick={()=>setShowQueue(false)}><X size={18}/></button></div><p>{activeIds.length} songs in your queue</p>{activeIds.map(id=>{const t=tracks.find(t=>t.id===id);if(!t)return null;return <div key={id} draggable
       data-testid={'queue-'+id}
       onDragStart={e=>{setDraggingId(id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);}}
       onDragOver={e=>{e.preventDefault();e.stopPropagation();}}
       onDrop={e=>{e.preventDefault();e.stopPropagation();setDraggingId(null);reorderQueue(e.dataTransfer.getData('text/plain'),id);}}
       onDragEnd={()=>setDraggingId(null)}
       className={'queue-row '+(id===currentId?'playing-row':'')+(draggingId===id?' track-dragging':'')}>
       <GripVertical size={15} className="drag-handle"/><button className="queue-song-button" onClick={()=>startSong(id)}><Cover title={t.album} url={covers[t.id]} size="small"/><span><strong>{t.title}</strong><small>{t.artist}</small></span></button>
       <button className="queue-step" title="Move up in queue" aria-label={'Move '+t.title+' up'} onClick={()=>moveQueueStep(id,-1)}><ArrowUp size={13}/></button>
       <button className="queue-step" title="Move down in queue" aria-label={'Move '+t.title+' down'} onClick={()=>moveQueueStep(id,1)}><ArrowDown size={13}/></button>
       </div>;})}</aside>}
    </div>
    {lyricsOpen&&<div className="lyrics-overlay" role="dialog" aria-label="Live lyrics" aria-modal="true">
      <div className="lyrics-header"><span>LIVE LYRICS · {current?.title||'No song selected'}</span><button className="outline-button" onClick={()=>setLyricsOpen(false)}>Close <X size={14}/></button></div>
      <div className="lyrics-body">{lyricsLines.length?lyricsLines.map((line,i)=><p key={i} className={'lyric-line '+(line.time<=time && (i===lyricsLines.length-1||lyricsLines[i+1].time>time)?'active':'')}>{line.text}</p>):
        <p>Synced lyrics will appear here when an LRC file is saved beside the song with the same filename. Lyrics are not fetched from unlicensed services.</p>}</div>
    </div>}
    {playlistDraft&&<PlaylistEditor mode={playlistDraft.mode} initialName={playlistDraft.value}
      initialIds={playlistDraft.trackIds} tracks={tracks} coverUrls={covers} ready={libraryReady}
      onSave={savePlaylistDraft} onClose={()=>setPlaylistDraft(null)}/>}

    {songDraft&&<div className="dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSongDraft(null);}}>
      <form className="edit-dialog" role="dialog" aria-modal="true" aria-label="Edit song details" onSubmit={e=>{e.preventDefault();void saveSongDraft();}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setSongDraft(null);}}}>
        <div className="dialog-top"><div><div className="eyebrow">SONG DETAILS</div><h2>Edit track information</h2></div><button type="button" className="icon-btn" aria-label="Cancel" onClick={()=>setSongDraft(null)}><X size={20}/></button></div>
        <label className="dialog-label" htmlFor="song-title">Song title</label><input id="song-title" autoFocus maxLength={200} value={songDraft.title} onChange={e=>setSongDraft({...songDraft,title:e.target.value})} />
        <label className="dialog-label" htmlFor="song-artist">Artist</label><input id="song-artist" maxLength={200} value={songDraft.artist} onChange={e=>setSongDraft({...songDraft,artist:e.target.value})} />
        <label className="dialog-label" htmlFor="song-album">Album</label><input id="song-album" maxLength={200} value={songDraft.album} onChange={e=>setSongDraft({...songDraft,album:e.target.value})} />
        <p className="dialog-hint">Changes apply inside Sonora, not to your original MP3 files. Your edits survive a library rescan.</p>
        {dialogError&&<p className="dialog-error" role="alert">{dialogError}</p>}
        <div className="dialog-actions"><button type="button" className="outline-button" onClick={()=>setSongDraft(null)}>Cancel</button><button type="submit" className="play-all">Save changes</button></div>
      </form>
    </div>}
    <div className="player">
      <div className="player-song">{current?<><Cover title={current.album} url={covers[current.id]} size="small"/><div className="player-track"><strong>{current.title}</strong><span>{current.artist}</span></div><button className={'icon-btn like-btn '+(current.liked?'is-liked':'')} onClick={()=>void like(current)} title="Like this track"><Heart size={18} fill={current.liked?'currentColor':'none'}/></button></>:<><div className="player-placeholder"><Music2 size={22}/></div><div className="player-track"><strong>Nothing playing</strong><span>Your soundtrack starts here</span></div></>}</div>
      <div className="player-center"><div className="player-buttons">
        <button aria-label="Shuffle" className={'control-btn '+(shuffle?'engaged':'')} onClick={()=>setShuffle(!shuffle)}><Shuffle size={18}/></button>
        <button aria-label="Previous" className="control-btn" onClick={previousSong}><SkipBack size={21} fill="currentColor"/></button>
        <button aria-label={playing?'Pause':'Play'} className="main-play" onClick={togglePlay}>{playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</button>
        <button aria-label="Next" className="control-btn" onClick={()=>nextRef.current(false)}><SkipForward size={21} fill="currentColor"/></button>
        <button aria-label="Repeat" title={'Repeat: '+repeat} className={'control-btn '+(repeat!=='off'?'engaged':'')} onClick={()=>setRepeat(repeat==='off'?'all':repeat==='all'?'one':'off')}>{repeat==='one'?<Repeat1 size={18}/>:<Repeat size={18}/>}</button>
      </div><div className="seekbar"><span>{shortTime(time)}</span><input type="range" aria-label="Seek" min="0" max={Math.max(1,duration)} step="0.1" value={Math.min(time,Math.max(1,duration))} style={{'--fill':duration>0?(time/duration*100)+'%':'0%'} as React.CSSProperties} onChange={e=>{if(audioRef.current)audioRef.current.currentTime=Number(e.target.value);setTime(Number(e.target.value));}}/><span>{shortTime(duration)}</span></div></div>
      <div className="player-right"><button title="Lyrics" className="control-btn" onClick={()=>setLyricsOpen(true)}>♫</button>
        <button title="Play queue" className={'control-btn '+(showQueue?'engaged':'')} onClick={()=>setShowQueue(!showQueue)}><ListMusic size={21}/></button>
        <button aria-label={muted?'Unmute':'Mute'} className="control-btn" onClick={()=>setMuted(!muted)}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={muted?0:volume} style={{'--fill':(muted?0:volume*100)+'%'} as React.CSSProperties} onChange={e=>{const next=Number(e.target.value);writeSettingShadow('sonora:volume-shadow',next);setMuted(false);setVolume(next);}}/><button className="mini-status" onClick={()=>open('settings')}><span className="green-light"/> LOCAL</button>
      </div>
    </div>
  </div>;
}
