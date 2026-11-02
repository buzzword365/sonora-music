'use strict';
const $ = id => document.getElementById(id);
const title = $('title');
const artist = $('artist');
const cover = $('cover');
const toggle = $('toggle');
const togglePath = $('toggle-path');
const seek = $('seek');
const elapsed = $('elapsed');
const remaining = $('remaining');
const status = $('status');
let current = {title:'Nothing playing',artist:'Open Sonora to choose a song',artwork:'',hasTrack:false,playing:false,position:0,duration:0};
let updatedAt = performance.now();
let previousImage = '';
let dragging = false;
const formatTime = seconds => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const secs = String(value % 60).padStart(2,'0');
  return hours ? hours + ':' + String(minutes).padStart(2,'0') + ':' + secs : minutes + ':' + secs;
};
function updateProgress() {
  const duration = Math.max(0, Number(current.duration) || 0);
  const elapsedSeconds = dragging ? Number(seek.value) : Math.min(duration, Math.max(0,
    (Number(current.position) || 0) + (current.playing ? (performance.now() - updatedAt) / 1000 : 0)));
  if (!dragging) seek.value = String(elapsedSeconds);
  seek.max = String(Math.max(1,duration));
  seek.disabled = !current.hasTrack || duration <= 0;
  seek.style.setProperty('--fill',(duration > 0 ? Math.min(100,elapsedSeconds / duration * 100) : 0) + '%');
  elapsed.textContent = formatTime(elapsedSeconds);
  remaining.textContent = '-' + formatTime(Math.max(0,duration - elapsedSeconds));
  seek.setAttribute('aria-valuetext',formatTime(elapsedSeconds) + ' of ' + formatTime(duration));
}
function applyAccent(image) {
  if (!image) {
    document.documentElement.style.setProperty('--accent','#b895ff');
    document.documentElement.style.setProperty('--glow','rgba(144,94,207,.22)');
    return;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 12;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    if (!ctx) return;
    ctx.drawImage(cover,0,0,12,12);
    const pixels = ctx.getImageData(0,0,12,12).data;
    let red=0,green=0,blue=0,count=0;
    for(let i=0;i<pixels.length;i+=4) {
      if(pixels[i+3]<80) continue;
      red+=pixels[i];green+=pixels[i+1];blue+=pixels[i+2];count++;
    }
    if(!count) return;
    const rgb=[red/count,green/count,blue/count].map(n=>Math.round(Math.min(230,Math.max(108,n*0.68+72))));
    document.documentElement.style.setProperty('--accent','rgb('+rgb.join(',')+')');
    document.documentElement.style.setProperty('--glow','rgba('+rgb.join(',')+',.24)');
  } catch { /* fallback to default accent */ }
}
function setArtwork(image) {
  const source = typeof image === 'string' && image.startsWith('data:image/') ? image : '';
  if (source === previousImage) return;
  previousImage = source;
  cover.classList.toggle('visible',Boolean(source));
  if (!source) {
    cover.removeAttribute('src');
    applyAccent('');
  } else {
    cover.onload = () => { if (previousImage === source) applyAccent(source); };
    cover.onerror = () => { cover.classList.remove('visible');applyAccent(''); };
    cover.src = source;
  }
}
function onState(data) {
  if (!data || typeof data !== 'object') return;
  current = {
    title:String(data.title || 'Nothing playing'),
    artist:String(data.artist || 'Open Sonora to choose a song'),
    artwork:data.artwork || '',
    hasTrack:Boolean(data.hasTrack),
    playing:Boolean(data.playing),
    position:Math.max(0,Number(data.position)||0),
    duration:Math.max(0,Number(data.duration)||0)
  };
  updatedAt = performance.now();
  title.textContent = current.title;
  title.title = current.title;
  artist.textContent = current.artist;
  artist.title = current.artist;
  status.textContent = current.playing ? 'NOW PLAYING' : (current.hasTrack ? 'PAUSED' : 'SONORA MUSIC');
  document.body.classList.toggle('playing',current.playing);
  togglePath.setAttribute('d',current.playing ? 'M6.5 5.5h4v13h-4zm7 0h4v13h-4z' : 'M8 5.6v12.8L19 12z');
  toggle.setAttribute('aria-label',current.playing ? 'Pause' : 'Play');
  toggle.title = current.playing ? 'Pause' : 'Play';
  for(const id of ['previous','toggle','next']) $(id).disabled = !current.hasTrack;
  setArtwork(current.artwork);
  updateProgress();
}
window.sonoraNotch?.onState(onState);
window.sonoraNotch?.onVisibility(visible => {
  document.body.classList.toggle('expanded',Boolean(visible));
});
window.sonoraNotch?.onProgress(data => {
  if (!data || typeof data !== 'object') return;
  current.position = Math.max(0,Number(data.position)||0);
  current.duration = Math.max(0,Number(data.duration)||0);
  current.playing = Boolean(data.playing);
  updatedAt = performance.now();
  if (!dragging) updateProgress();
});
const send = (action,value) => window.sonoraNotch?.command(action,value);
$('previous').addEventListener('click',()=>send('previous'));
toggle.addEventListener('click',()=>send('toggle'));
$('next').addEventListener('click',()=>send('next'));
$('open-app').addEventListener('click',()=>send('open'));
seek.addEventListener('pointerdown',()=>{dragging=true;});
seek.addEventListener('input',()=>{dragging=true;updateProgress();});
seek.addEventListener('change',()=>{
  const position = Number(seek.value);
  dragging=false;
  if (current.hasTrack && Number.isFinite(position) && current.duration>0) {
    current.position=Math.max(0,Math.min(current.duration,position));
    updatedAt=performance.now();
    send('seek',current.position);
  }
  updateProgress();
});
// Some macOS pointer paths release the range thumb without a `change`
// event, leaving the displayed progress permanently stuck in drag mode.
// Wait one task for the browser's native change, then commit if still needed.
seek.addEventListener('pointerup',()=>{
  setTimeout(()=>{
    if(dragging)seek.dispatchEvent(new Event('change',{bubbles:true}));
  },0);
});
seek.addEventListener('pointercancel',()=>{dragging=false;updateProgress();});
window.addEventListener('blur',()=>{if(dragging){dragging=false;updateProgress();}});
setInterval(updateProgress,250);
onState(current);
requestAnimationFrame(()=>document.body.classList.add('loaded'));
