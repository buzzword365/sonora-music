import type { Track } from './store';

export type Mix = { id:string;name:string;subtitle:string;ids:string[];refreshAt:number };
const hash=(str:string)=>{let v=2166136261;for(let i=0;i<str.length;i++)v=Math.imul(v^str.charCodeAt(i),16777619);return v>>>0;};
const pseudo=(key:string)=>hash(key)/4294967295;
export function createMixes(tracks:Track[],now=new Date()):Mix[]{
  if(!tracks.length)return [];
  const dayKey=now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
  const hour=now.getHours();
  const daypart=hour<5?'Late night':hour<11?'Morning':hour<17?'Afternoon':hour<22?'Evening':'Late night';
  const slot=hour<5?0:hour<11?1:hour<17?2:hour<22?3:4;
  const next=new Date(now);
  if(hour<5)next.setHours(5,0,0,0);
  else if(hour<11)next.setHours(11,0,0,0);
  else if(hour<17)next.setHours(17,0,0,0);
  else if(hour<22)next.setHours(22,0,0,0);
  else {next.setDate(next.getDate()+1);next.setHours(5,0,0,0);}
  const weekStart=new Date(now);weekStart.setHours(0,0,0,0);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
  const recentByArtist=new Map<string,number>();
  const likedByArtist=new Map<string,number>();
  for(const t of tracks){
    if(t.playedAt)recentByArtist.set(t.artist,(recentByArtist.get(t.artist)||0)+1);
    if(t.liked)likedByArtist.set(t.artist,(likedByArtist.get(t.artist)||0)+1);
  }
  const ranked=(seed:string,scale=1)=>tracks.slice().sort((a,b)=>{
    const score=(t:Track)=>{
      const recent=t.playedAt?Math.max(0,5-(now.getTime()-t.playedAt)/86400000*.25):0;
      const familiarity=Math.min(4,(recentByArtist.get(t.artist)||0)*.8+(likedByArtist.get(t.artist)||0)*1.4);
      const discovery=!t.playedAt?1.4:0;
      return (t.liked?8:0)+recent+familiarity+discovery+pseudo(seed+t.id)*12*scale;
    };
    return score(b)-score(a);
  }).map(t=>t.id);
  const weekly=ranked('week:'+weekStart.toISOString(),1.3);
  const daily=ranked('day:'+dayKey,1.4);
  const current=ranked('part:'+dayKey+':'+slot,2.2);
  return [
    {id:'daylist',name:daypart+' daylist',subtitle:'Changes throughout the day based on your library and listening habits.',ids:current.slice(0,Math.min(25,tracks.length)),refreshAt:next.getTime()},
    {id:'daily',name:'Your Daily Mix',subtitle:'A fresh blend of favourites and overlooked tracks. Updates each day.',ids:daily.slice(0,Math.min(30,tracks.length)),refreshAt:new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime()},
    {id:'weekly',name:'Your Weekly Mix',subtitle:'A longer selection shaped by your saved songs and listening history.',ids:weekly.slice(0,Math.min(40,tracks.length)),refreshAt:weekStart.getTime()+7*86400000},
    {id:'discover',name:'Rediscover',subtitle:'Songs you have not played recently, mixed with familiar favourites.',ids:tracks.slice().sort((a,b)=>{
      const ta=a.playedAt||0,tb=b.playedAt||0;
      return ta-tb || pseudo('lost'+a.id)-pseudo('lost'+b.id);
    }).map(t=>t.id).slice(0,Math.min(30,tracks.length)),refreshAt:next.getTime()}
  ];
}