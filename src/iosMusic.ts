import {Capacitor, registerPlugin} from '@capacitor/core';

export type IOSMusicFile = {
  id:string;filename:string;title:string;artist:string;album:string;
  duration:number;size:number;coverBase64?:string;coverMime?:string;
};
type IOSMusicBridge = {
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
