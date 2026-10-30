import {useEffect,useRef} from 'react';
import {ArrowDownLeft, Heart, ListMusic, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2} from 'lucide-react';
import type {Track} from './store';

const stamp=(n:number)=>{
  const v=Math.max(0,Math.floor(n||0));
  return Math.floor(v/60)+':'+String(v%60).padStart(2,'0');
};
export default function ImmersiveNowPlaying({
  track,cover,time,duration,playing,shuffle,repeat,volume,onClose,onToggle,onPrevious,onNext,onSeek,onLike,onShuffle,onRepeat,onVolume,onQueue
}:{
  track:Track|null;cover?:string;time:number;duration:number;playing:boolean;shuffle:boolean;
  repeat:'off'|'all'|'one';volume:number;
  onClose:()=>void;onToggle:()=>void;onPrevious:()=>void;onNext:()=>void;
  onSeek:(position:number)=>void;onLike:()=>void;onShuffle:()=>void;onRepeat:()=>void;
  onVolume:(value:number)=>void;onQueue:()=>void;
}){
  const closeRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    closeRef.current?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();onClose();}
    };
    window.addEventListener('keydown',key);
    return()=>window.removeEventListener('keydown',key);
  },[onClose]);
  return <div className="immersive-player" role="dialog" aria-modal="true" aria-label="Now Playing">
    <div className="immersive-backdrop" aria-hidden="true">
      {cover?<img src={cover} alt=""/>:<div className="immersive-backdrop-fallback"/>}
    </div>
    <div className="immersive-veil" aria-hidden="true"/>
    <div className="immersive-header">
      <div className="immersive-wordmark">sonora<span>.</span></div>
      <div className="immersive-caption">NOW PLAYING</div>
      <button ref={closeRef} aria-label="Close Now Playing" className="immersive-close" onClick={onClose}>
        <ArrowDownLeft size={18}/> Back to library
      </button>
    </div>
    <div className="immersive-main">
      <div className="immersive-cover-frame">
        {cover?<img className="immersive-cover" src={cover} alt={track?.album+' album cover'}/>:<div className="immersive-cover immersive-placeholder"><Music2 size={76} strokeWidth={1.2}/></div>}
      </div>
      <div className="immersive-detail">
        <div className="immersive-eyebrow">YOUR PRIVATE LISTENING SPACE</div>
        <h2 className="immersive-song-title">{track?.title||'Nothing playing'}</h2>
        <p className="immersive-song-artist">{track?.artist||'Choose a song from your library'}</p>
        {track?.album&&<p className="immersive-album">{track.album}</p>}
        <div className="immersive-progress">
          <input aria-label="Now Playing seek" type="range" min="0" max={Math.max(1,duration)}
            step=".1" value={Math.min(time,Math.max(1,duration))}
            style={{'--fill':duration>0?(time/duration*100)+'%':'0%'} as React.CSSProperties}
            onChange={event=>onSeek(Number(event.target.value))} disabled={!track}/>
          <div className="immersive-time"><span>{stamp(time)}</span><span>{stamp(duration)}</span></div>
        </div>
        <div className="immersive-transport">
          <button aria-label="Now Playing shuffle" aria-pressed={shuffle} onClick={onShuffle} className={shuffle?'is-active':''}><Shuffle size={20}/></button>
          <button aria-label="Now Playing previous" onClick={onPrevious}><SkipBack size={25} fill="currentColor"/></button>
          <button className="immersive-play" aria-label={playing?'Now Playing pause':'Now Playing play'} onClick={onToggle}>{playing?<Pause size={31} fill="currentColor"/>:<Play size={31} fill="currentColor"/>}</button>
          <button aria-label="Now Playing next" onClick={onNext}><SkipForward size={25} fill="currentColor"/></button>
          <button aria-label="Now Playing repeat" aria-pressed={repeat!=='off'} onClick={onRepeat} className={repeat!=='off'?'is-active':''}>{repeat==='one'?<Repeat1 size={20}/>:<Repeat size={20}/>}</button>
        </div>
        <div className="immersive-tools">
          <button aria-label="Now Playing like" className={track?.liked?'is-active':''} onClick={onLike} disabled={!track}><Heart size={19} fill={track?.liked?'currentColor':'none'}/>{track?.liked?'Liked':'Like'}</button>
          <button aria-label="Now Playing queue" onClick={onQueue}><ListMusic size={19}/> Queue</button>
          <div className="immersive-volume"><Volume2 size={19}/><input aria-label="Now Playing volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>onVolume(Number(e.target.value))}/></div>
        </div>
      </div>
    </div>
    <div className="immersive-footer"><span>FULL-LENGTH LISTENING</span><span>LOCAL MUSIC · NO DISTRACTIONS</span></div>
  </div>;
}
