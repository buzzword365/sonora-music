const title=document.getElementById('title');
const artist=document.getElementById('artist');
const cover=document.getElementById('cover');
const toggle=document.getElementById('toggle');
const playIcon=document.getElementById('play-icon');
const pauseIcon=document.getElementById('pause-icon');
let previousImage='';
window.sonoraNotch?.onState(state=>{
  title.textContent=state?.title||'Nothing playing';
  artist.textContent=state?.artist||'Choose a song in Sonora';
  const playing=Boolean(state?.playing);
  toggle.setAttribute('aria-label',playing?'Pause':'Play');
  playIcon.hidden=playing;pauseIcon.hidden=!playing;
  for(const id of ['toggle','next','previous'])
    document.getElementById(id).disabled=!state?.hasTrack;
  const image=state?.artwork||'';
  if(image!==previousImage){
    previousImage=image;
    cover.classList.toggle('visible',Boolean(image));
    if(image)cover.src=image;else cover.removeAttribute('src');
  }
});
for(const id of ['previous','toggle','next'])
  document.getElementById(id).addEventListener('click',()=>window.sonoraNotch?.command(id));
