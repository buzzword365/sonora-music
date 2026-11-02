import assert from 'node:assert/strict';
import {
  notchPopupBounds,inNotchHoverZone,inNotchKeepAliveZone,
  inPopupZone,isNotchHovered
} from '../electron/notch-geometry.mjs';

const display={
  bounds:{x:0,y:0,width:1512,height:982},
  workArea:{x:0,y:33,width:1512,height:949}
};
const center=756;
const popup=notchPopupBounds(display);
assert.deepEqual(popup,{x:602,y:33,width:308,height:134});

// Deliberately don't OPEN on the physical top/menu bar (avoid system menu flash).
assert.equal(inNotchHoverZone({x:center,y:5},display),false);
assert.equal(isNotchHovered({x:center,y:5},display,popup,false),false);
assert.equal(isNotchHovered({x:center,y:33},display,popup,false),true);
assert.equal(isNotchHovered({x:center,y:98},display,popup,false),true);
assert.equal(inNotchHoverZone({x:center,y:115},display),false);
assert.equal(inNotchHoverZone({x:center+200,y:50},display),false);

// Once the card is visible, a pointer continuing UP into the physical
// camera notch still counts as hovering, even if the cursor stays still.
for(const y of [0,5,18,28,32,33,50,76,103]){
  assert.equal(inNotchKeepAliveZone({x:center,y},display),true,
    'keep-alive should cover notch and activation area, y='+y);
  assert.equal(isNotchHovered({x:center,y},display,popup,true),true,
    'shown popup should remain open at y='+y);
}
assert.equal(isNotchHovered({x:150,y:12},display,popup,true),false);
assert.equal(isNotchHovered({x:center,y:250},display,popup,true),false);
assert.equal(inPopupZone({x:popup.x+popup.width-18,y:popup.y+popup.height-18},popup),true);
assert.equal(isNotchHovered({x:popup.x+popup.width-18,y:popup.y+popup.height-18},display,popup,true),true,
  'the actual controls remain usable');

// The menu bar can change its work area between normal and fullscreen.
for(const workY of [0,29,33,38]){
  const d={bounds:display.bounds,workArea:{...display.workArea,y:workY}};
  const b=notchPopupBounds(d);
  assert.equal(isNotchHovered({x:center,y:0},d,b,true),true);
  assert.equal(isNotchHovered({x:center,y:40},d,b,false),true);
}

// Reproduce user's sequence with a 160ms poll, cursor moves into notch,
// stays for >4 seconds, leaves, then re-enters. Should open ONCE, stay open,
// hide after leaving, and reopen on the first return without repeated swipes.
let visible=false;
let lastInside=0;
let pendingHide=0;
const events=[];
function tick(t,point){
  if(pendingHide && t>=pendingHide){
    if(t-lastInside>1050){visible=false;events.push(['hide',t]);}
    pendingHide=0;
  }
  const hovering=isNotchHovered(point,display,popup,visible);
  if(hovering){
    lastInside=t;
    pendingHide=0;
    if(!visible){visible=true;events.push(['show',t]);}
  } else if(visible&&!pendingHide&&t-lastInside>1050){
    pendingHide=t+230;
  }
}
for(let t=0;t<=7600;t+=160){
  let point;
  if(t<320)point={x:center,y:48};         // Enter just below camera
  else if(t<4600)point={x:center,y:4};    // Hold at physical top for >4s
  else if(t<6000)point={x:300,y:390};     // Move away
  else point={x:center,y:49};             // Re-enter once
  tick(t,point);
  if(t>=320&&t<4600)assert.equal(visible,true,'flickered at t='+t);
}
assert.equal(events.filter(([event])=>event==='show').length,2);
assert.equal(events.filter(([event])=>event==='hide').length,1);
assert.equal(visible,true,'should reopen on first entry');
console.log('PASS: camera-notch hover stability, menu-safe cold opening, visible hold, actual controls, multi-space geometry, delayed dismiss, first-try reopen');
console.log('Simulation events:',JSON.stringify(events));
