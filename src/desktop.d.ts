import type { NativeSong } from './store';
declare global {
  interface Window {
    sonoraDesktop?: {
      isDesktop: boolean;
      chooseMusicFolders: ()=>Promise<{canceled:boolean; tracks:NativeSong[]; roots:string[]}>;
      rescanMusicFolders: ()=>Promise<{tracks:NativeSong[]; roots:string[]}>;
      listMusicFolders: ()=>Promise<string[]>;
      setTrackAvailable: (active:boolean)=>void;
      setPlaybackActive: (playing:boolean)=>void;
      getMediaKeyStatus: ()=>Promise<{registered:string[];accessibilityTrusted:boolean;hasActiveTrack:boolean}>;
      onMediaAction: (callback:(action:'toggle'|'next'|'previous')=>void)=>()=>void;
      onLibraryChanged: (callback:(result:{tracks:NativeSong[];roots:string[]})=>void)=>()=>void;
      getNotchSupport: ()=>Promise<boolean>;
      setNotchEnabled: (enabled:boolean)=>void;
      getPhoneInfo: ()=>Promise<{online:boolean;address:string|null;reason:string|null;qrDataUrl:string|null}>;
      getLyrics: (nativeId:string)=>Promise<{time:number;text:string}[]>;
      syncMobileLibrary: (payload:{
        tracks:{id:string;nativeId:string;title:string;artist:string;album:string;duration:number;liked:boolean;playedAt:number}[];
        playlists:{id:string;name:string;trackIds:string[]}[];
        mixes:{id:string;name:string;subtitle:string;ids:string[]}[];
        playback:{id:string|null;isPlaying:boolean;position:number;volume:number;muted:boolean;duration:number;queue:string[];shuffle:boolean;repeat:string}|null;privateMode:boolean;
        notch:{title:string;artist:string};
      })=>void;
      onPhoneCommand:(callback:(command:{action:string;id?:string;value?:boolean;position?:number;volume?:number;muted?:boolean;ids?:string[]})=>void)=>()=>void;
    };
  }
}
export {};
