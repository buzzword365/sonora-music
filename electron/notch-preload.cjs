const {contextBridge,ipcRenderer}=require('electron');
const listen=(eventName,callback)=>{
  if(typeof callback!=='function')return ()=>{};
  const listener=(_event,data)=>callback(data);
  ipcRenderer.on(eventName,listener);
  return ()=>ipcRenderer.removeListener(eventName,listener);
};
contextBridge.exposeInMainWorld('sonoraNotch',Object.freeze({
  onState:callback=>listen('sonora:notch-state',callback),
  onProgress:callback=>listen('sonora:notch-progress',callback),
  onVisibility:callback=>listen('sonora:notch-visible',callback),
  command:(action,value)=>{
    if(['toggle','previous','next','open'].includes(action))ipcRenderer.send('sonora:notch-action',action);
    else if(action==='seek'&&typeof value==='number'&&Number.isFinite(value)&&value>=0)
      ipcRenderer.send('sonora:notch-action','seek',value);
  }
}));
