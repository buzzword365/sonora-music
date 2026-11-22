import assert from 'node:assert/strict';
import {inNotchHoverZone} from '../electron/notch-geometry.mjs';

const screen={bounds:{x:0,y:0,width:1512,height:982},workArea:{x:0,y:33,width:1512,height:949}};
const cx=screen.bounds.width/2;
// The fallback opening trigger used to be 240 x 72 device-independent points.
// Only that invisible trigger should shrink, not the displayed player.
for(const x of [cx-60,cx,cx+60]){
  for(const y of [33,50,69])assert.equal(inNotchHoverZone({x,y},screen),true);
}
for(const [x,y] of [[cx-61,50],[cx+61,50],[cx,70],[cx,20],[cx+100,50],[cx,105]]){
  assert.equal(inNotchHoverZone({x,y},screen),false,`cold hover incorrectly triggered at ${x},${y}`);
}
assert.equal(inNotchHoverZone(null,screen),false);
assert.equal(inNotchHoverZone({x:cx,y:45},null),false);
console.log('PASS: fallback hover activation reduced to centered 120 x 36 pt; distant cursor no longer opens island');
