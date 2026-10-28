import { openDB, type DBSchema } from 'idb';
import { parseBlob } from 'music-metadata';

export type Track = {
  id: string; title: string; artist: string; album: string; duration: number;
  size: number; filename: string; fingerprint: string; addedAt: number;
  playedAt?: number; playCount?:number; liked: boolean; cover?: Blob; mime: string; nativeId?: string; nativePath?: string;
  customTitle?:string;customArtist?:string;customAlbum?:string;
};
export type NativeSong = {
  id:string; path:string; title:string; artist:string; album:string; duration:number;
  size:number; mtimeMs:number; coverBase64?:string; coverMime?:string;
};
export async function upsertNativeTracks(rows:NativeSong[]) {
  const db=await dbp;
  // Keep explicit user removals hidden across automatic updates and rescans.
  const ignored=new Set((await db.get('prefs','ignoredNativeTrackIds') as string[]|undefined)||[]);
  for (const r of rows) {
    const id='native-'+r.id;
    if(ignored.has(id))continue;
    const old=await db.get('tracks',id);
    const ext=r.path.split('.').pop()?.toLowerCase();
    const mime=ext==='mp3'?'audio/mpeg':ext==='m4a'?'audio/mp4':ext==='wav'?'audio/wav':'audio/'+(ext||'unknown');
    let cover=old?.cover;
    if(!cover&&r.coverBase64) {
      try {
        const chars=atob(r.coverBase64);
        cover=new Blob([Uint8Array.from(chars,c=>c.charCodeAt(0))],{type:r.coverMime||'image/jpeg'});
      }catch {}
    }
    const updated:Track={id,title:old?.customTitle||r.title,artist:old?.customArtist||r.artist,album:old?.customAlbum||r.album,duration:r.duration,
      customTitle:old?.customTitle,customArtist:old?.customArtist,customAlbum:old?.customAlbum,
      size:r.size,filename:r.path.split('/').pop()||r.title,
      fingerprint:'native:'+r.id,addedAt:old?.addedAt||Date.now(),
      playedAt:old?.playedAt,playCount:old?.playCount,liked:old?.liked||false,cover,mime,nativeId:r.id,nativePath:r.path};
    await db.put('tracks',updated);
  }
}
export type Playlist = { id: string; name: string; trackIds: string[]; createdAt: number };
interface MusicDB extends DBSchema {
  tracks: { key: string; value: Track };
  audio: { key: string; value: Blob };
  playlists: { key: string; value: Playlist };
  prefs: { key: string; value: unknown };
}
const dbp = openDB<MusicDB>('sonora-local-v1', 1, {
  upgrade(db) {
    db.createObjectStore('tracks', { keyPath: 'id' });
    db.createObjectStore('audio');
    db.createObjectStore('playlists', { keyPath: 'id' });
    db.createObjectStore('prefs');
  }
});
export async function allTracks() { return (await (await dbp).getAll('tracks')).sort((a,b) => b.addedAt-a.addedAt); }
export async function allPlaylists() { return (await (await dbp).getAll('playlists')).sort((a,b)=>a.createdAt-b.createdAt); }
export async function audioBlob(id:string) { return (await dbp).get('audio',id); }
export async function updateTrack(track:Track) { await (await dbp).put('tracks',track); }
export async function putPlaylist(playlist:Playlist) { await (await dbp).put('playlists',playlist); }
export async function deletePlaylist(id:string) { await (await dbp).delete('playlists',id); }
export async function getPref<T>(key:string, fallback:T):Promise<T> { const v=await (await dbp).get('prefs',key); return v === undefined ? fallback : v as T; }
export async function setPref(key:string,value:unknown) { await (await dbp).put('prefs',value,key); }
export async function hiddenNativeTrackCount() {
  return ((await (await dbp).get('prefs','ignoredNativeTrackIds') as string[]|undefined)||[]).length;
}
export async function restoreHiddenNativeTracks() {
  await (await dbp).put('prefs',[],'ignoredNativeTrackIds');
}
export async function removeTrack(id:string) {
  const db=await dbp, tx=db.transaction(['tracks','audio','playlists','prefs'],'readwrite');
  if(id.startsWith('native-')){
    const old=((await tx.objectStore('prefs').get('ignoredNativeTrackIds') as string[]|undefined)||[]);
    if(!old.includes(id))await tx.objectStore('prefs').put([...old,id],'ignoredNativeTrackIds');
  }
  await Promise.all([tx.objectStore('tracks').delete(id),tx.objectStore('audio').delete(id)]);
  const playlists=await tx.objectStore('playlists').getAll();
  for(const p of playlists) if(p.trackIds.includes(id)) await tx.objectStore('playlists').put({...p,trackIds:p.trackIds.filter(t=>t!==id)});
  await tx.done;
}
const validExt = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|aiff|aif|mp4)$/i;
export function supportedFile(file:File) { return validExt.test(file.name) || file.type.startsWith('audio/'); }
export async function importOne(file:File, seen:Set<string>):Promise<'added'|'duplicate'> {
  const fingerprint=[file.name,file.size,file.lastModified].join('|');
  if(seen.has(fingerprint)) return 'duplicate';
  let title=file.name.replace(/\.[^.]+$/,'').replace(/_/g,' '), artist='Unknown artist', album='Singles', duration=0;
  let cover:Blob|undefined;
  try {
    const m=await parseBlob(file,{duration:true});
    title=(m.common.title||title).trim(); artist=(m.common.artist||artist).trim(); album=(m.common.album||album).trim();
    duration=Number.isFinite(m.format.duration) ? (m.format.duration||0) : 0;
    const picture=m.common.picture?.[0];
    if(picture && picture.data.length) cover=new Blob([new Uint8Array(picture.data)],{type:picture.format||'image/jpeg'});
  } catch { /* Filename fallback when metadata is malformed or unavailable. */ }
  const track:Track={id:crypto.randomUUID(),title,artist,album,duration,cover,size:file.size,filename:file.name,
    fingerprint,addedAt:Date.now(),liked:false,mime:file.type||'application/octet-stream'};
  const db=await dbp, tx=db.transaction(['tracks','audio'],'readwrite');
  await tx.objectStore('tracks').put(track);
  await tx.objectStore('audio').put(file,track.id);
  await tx.done; seen.add(fingerprint);
  return 'added';
}
