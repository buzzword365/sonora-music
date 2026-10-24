const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('sonoraDesktop',Object.freeze({
 isDesktop:true,
 chooseMusicFolders:()=>ipcRenderer.invoke('sonora:choose-folders'),
 rescanMusicFolders:()=>ipcRenderer.invoke('sonora:rescan'),
 listMusicFolders:()=>ipcRenderer.invoke('sonora:folders'),
 setTrackAvailable:(active)=>ipcRenderer.send('sonora:track-active',Boolean(active)),
 setPlaybackActive:(playing)=>ipcRenderer.send('sonora:playback-status',Boolean(playing)),
 getMediaKeyStatus:()=>ipcRenderer.invoke('sonora:media-key-status'),
 getPhoneInfo:()=>ipcRenderer.invoke('sonora:phone-info'),
 getLyrics:(nativeId)=>ipcRenderer.invoke('sonora:lyrics',nativeId),
 syncMobileLibrary:(payload)=>ipcRenderer.send('sonora:library-snapshot',payload),
 onPhoneCommand:(callback)=>{
   const listener=(_event,command)=>callback(command);
   ipcRenderer.on('sonora:phone-command',listener);
   return ()=>ipcRenderer.removeListener('sonora:phone-command',listener);
 },
 onLibraryChanged:(callback)=>{
   const listener=(_event,result)=>callback(result);
   ipcRenderer.on('sonora:library-updated',listener);
   return ()=>ipcRenderer.removeListener('sonora:library-updated',listener);
 },
 onMediaAction:(callback)=>{
   const listener=(_event,action)=>{
     if(['toggle','next','previous'].includes(action))callback(action);
   };
   ipcRenderer.on('sonora:media-action',listener);
   return ()=>ipcRenderer.removeListener('sonora:media-action',listener);
 }
}));