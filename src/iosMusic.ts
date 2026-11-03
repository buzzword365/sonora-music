import {Capacitor, registerPlugin, type PluginListenerHandle} from '@capacitor/core';

export type IOSMusicFile = {
  id:string;filename:string;title:string;artist:string;album:string;
  duration:number;size:number;coverBase64?:string;coverMime?:string;
};
export type NativePlaybackState = {
  id:string;playing:boolean;time:number;duration:number;repeat:string;
};
type IOSMusicBridge = {
  nativeLoad(options:{id:string;time?:number;play?:boolean}):Promise<NativePlaybackState>;
  nativeQueue(options:{ids:string[];repeat:string}):Promise<NativePlaybackState>;
  nativePlay():Promise<NativePlaybackState>;
  nativePause():Promise<NativePlaybackState>;
  nativeSkip(options:{direction:number}):Promise<NativePlaybackState>;
  nativeSeek(options:{time:number}):Promise<NativePlaybackState>;
  nativeVolume(options:{volume:number;muted:boolean}):Promise<NativePlaybackState>;
  nativeState():Promise<NativePlaybackState>;
  addListener(eventName:'sonoraNativeState',listener:(state:NativePlaybackState)=>void):Promise<PluginListenerHandle>;

  pick():Promise<{files:IOSMusicFile[];errors?:string[];duplicates?:number;canceled?:boolean}>;
  list():Promise<{files:IOSMusicFile[]}>;
  resolveFile(options:{id:string}):Promise<{url:string}>;
  removeFile(options:{id:string}):Promise<void>;
};
export const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform()==='ios';
const iosBridge = registerPlugin<IOSMusicBridge>('SonoraMusic');

/** Native iOS Files picker stores audio on disk without transferring blobs into JS. */
export async function pickIOSMusic(){return iosBridge.pick();}
export async function listIOSMusic(){return (await iosBridge.list()).files;}
export async function removeIOSMusic(id:string){return iosBridge.removeFile({id});}
export async function iosAudioURL(id:string){
  const {url}=await iosBridge.resolveFile({id});
  return Capacitor.convertFileSrc(url);
}

/** iOS AVPlayer continues music and advances the queue with WKWebView suspended. */
export const iosPlayback = {
  load:(id:string,play=true,time=0)=>iosBridge.nativeLoad({id,time,play}),
  queue:(ids:string[],repeat:string)=>iosBridge.nativeQueue({ids,repeat}),
  play:()=>iosBridge.nativePlay(),
  pause:()=>iosBridge.nativePause(),
  skip:(direction:number)=>iosBridge.nativeSkip({direction}),
  seek:(time:number)=>iosBridge.nativeSeek({time}),
  volume:(volume:number,muted:boolean)=>iosBridge.nativeVolume({volume,muted}),
  state:()=>iosBridge.nativeState(),
  listen:(handler:(state:NativePlaybackState)=>void)=>iosBridge.addListener('sonoraNativeState',handler)
};
