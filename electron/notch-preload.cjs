const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('sonoraNotch',Object.freeze({
  onState:(callback)=>{
    const listener=(_event,state)=>callback(state);
    ipcRenderer.on('sonora:notch-state',listener);
    return ()=>ipcRenderer.removeListener('sonora:notch-state',listener);
  },
  command:(action)=>{
    if(['toggle','previous','next'].includes(action))
      ipcRenderer.send('sonora:notch-action',action);
  }
}));
