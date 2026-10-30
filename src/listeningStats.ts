import type {Track} from './store';

export type ArtistStat={artist:string;plays:number;songs:number};
export type SongStat={id:string;title:string;artist:string;plays:number;playedAt:number};
export function buildListeningStats(tracks:Track[]){
  const plays=tracks.reduce((n,t)=>n+Math.max(0,t.playCount||0),0);
  const played=tracks.filter(t=>(t.playCount||0)>0);
  const artists=new Map<string,ArtistStat>();
  for(const track of tracks){
    const artist=track.artist?.trim()||'Unknown artist';
    const key=artist.toLocaleLowerCase();
    const entry=artists.get(key)||{artist,plays:0,songs:0};
    entry.plays+=Math.max(0,track.playCount||0);
    entry.songs++;
    artists.set(key,entry);
  }
  const artistRanking=[...artists.values()].filter(a=>a.plays>0).sort((a,b)=>b.plays-a.plays||a.artist.localeCompare(b.artist));
  const songRanking:SongStat[]=tracks.filter(t=>(t.playCount||0)>0).map(t=>({
    id:t.id,title:t.title,artist:t.artist,plays:t.playCount||0,playedAt:t.playedAt||0
  })).sort((a,b)=>b.plays-a.plays||b.playedAt-a.playedAt);
  const recent=[...songRanking].filter(t=>t.playedAt>0).sort((a,b)=>b.playedAt-a.playedAt);
  return {plays,playedSongs:played.length,liked:tracks.filter(t=>t.liked).length,artists:artistRanking,songs:songRanking,recent};
}
export function listenDuration(seconds:number){
  const amount=Math.max(0,Math.floor(Number(seconds)||0));
  const h=Math.floor(amount/3600),m=Math.floor((amount%3600)/60);
  if(!h)return m+'m';
  return h+'h '+m+'m';
}
