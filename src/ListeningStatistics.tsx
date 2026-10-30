import {BarChart3, Clock3, Disc3, Heart, Headphones, Music2} from 'lucide-react';
import type {Track} from './store';
import {buildListeningStats,listenDuration} from './listeningStats';

export default function ListeningStatistics({tracks,seconds,privateMode}:{
  tracks:Track[];seconds:number;privateMode:boolean;
}){
  const s=buildListeningStats(tracks);
  const peak=Math.max(1,s.artists[0]?.plays||0);
  return <section className="setting-card listening-stats" aria-labelledby="listening-statistics-title">
    <header className="listening-stats-head">
      <div className="setting-icon"><BarChart3 size={23}/></div>
      <div><div className="appearance-kicker">YOUR SOUND, IN NUMBERS</div>
        <h3 id="listening-statistics-title">Listening statistics</h3>
        <p>See which music you return to most. Your listening data stays on this device.</p></div>
    </header>
    <div className="listening-stat-grid">
      <div><Music2 size={18}/><strong data-testid="stats-play-starts">{s.plays.toLocaleString()}</strong><span>Song play starts</span></div>
      <div><Disc3 size={18}/><strong>{s.playedSongs.toLocaleString()}</strong><span>Different songs played</span></div>
      <div><Clock3 size={18}/><strong data-testid="stats-listening-time">{listenDuration(seconds)}</strong><span>Time listened *</span></div>
      <div><Heart size={18}/><strong>{s.liked.toLocaleString()}</strong><span>Liked songs</span></div>
    </div>
    <div className="listening-stat-columns">
      <div className="stat-list-group">
        <h4><Headphones size={17}/> Most played artists</h4>
        {s.artists.length?<ol>{s.artists.slice(0,5).map((artist,i)=>
          <li key={artist.artist}><span className="stat-rank">{String(i+1).padStart(2,'0')}</span>
            <div className="stat-artist">
              <div><strong>{artist.artist}</strong><small>{artist.plays} plays</small></div>
              <span className="stat-progress"><i style={{width:100*artist.plays/peak+'%'}}/></span>
            </div>
          </li>)}</ol>:<p className="stat-empty">Play some music and your top artists will appear here.</p>}
      </div>
      <div className="stat-list-group">
        <h4><Music2 size={17}/> Most played songs</h4>
        {s.songs.length?<ol>{s.songs.slice(0,5).map((song,i)=>
          <li key={song.id}><span className="stat-rank">{String(i+1).padStart(2,'0')}</span>
            <div className="stat-song"><strong>{song.title}</strong><small>{song.artist} · {song.plays} plays</small></div>
          </li>)}</ol>:<p className="stat-empty">Your most played tracks will appear here after listening.</p>}
      </div>
    </div>
    <div className="stat-foot">
      <span>* Time listened starts tracking with this update. Existing play counts were retained.</span>
      <span>Play counts record song starts, not completed listens.{privateMode?' Private session is on — new listening activity is not recorded.':''}</span>
    </div>
  </section>;
}
