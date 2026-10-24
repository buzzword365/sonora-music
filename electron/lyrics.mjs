import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
export async function lyricsFromTrack(file){
  if(!file)return [];
  const base=file.slice(0,file.length-path.extname(file).length);
  for(const name of [base+'.lrc',base+'.LRC']){
    try{
      if((await stat(name)).size>512000)continue;
      const src=await readFile(name,'utf8');
      const out=[];
      for(const line of src.split(/\r?\n/)){
        const regex=/\[(\d{1,3}):(\d\d)(?:\.(\d{1,3}))?\]/g;
        const stamps=[...line.matchAll(regex)];
        const content=line.replace(regex,'').trim();
        for(const match of stamps){
          const frac=match[3]?Number(match[3])/Math.pow(10,match[3].length):0;
          out.push({time:Number(match[1])*60+Number(match[2])+frac,text:content||'♪'});
        }
      }
      return out.sort((a,b)=>a.time-b.time).slice(0,1500);
    }catch{}
  }
  return [];
}
