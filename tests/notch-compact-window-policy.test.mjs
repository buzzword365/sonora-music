import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {notchPopupBounds,NOTCH_WIDTH,NOTCH_HEIGHT} from '../electron/notch-geometry.mjs';

const root=process.cwd();
const main=readFileSync(join(root,'electron/main.mjs'),'utf8');
const html=readFileSync(join(root,'electron/notch.html'),'utf8');
const css=readFileSync(join(root,'electron/notch.css'),'utf8');
const appCss=readFileSync(join(root,'src/style.css'),'utf8');
const react=readFileSync(join(root,'src/App.tsx'),'utf8');
assert.equal(NOTCH_WIDTH,308);
assert.equal(NOTCH_HEIGHT,134);
const display={bounds:{x:0,y:0,width:1512,height:982},workArea:{x:0,y:33,width:1512,height:949}};
assert.deepEqual(notchPopupBounds(display),{x:602,y:33,width:308,height:134});
assert.match(css,/\.island\s*\{[^}]*width:308px;\s*height:134px/s);
assert.doesNotMatch(html,/camera-neck/,'fake tab should be removed');
assert.doesNotMatch(css,/\.camera-neck/,'fake tab styling should be removed');
assert.match(main,/titleBarStyle:'hiddenInset'/);
assert.match(main,/trafficLightPosition:\{x:16,y:15\}/);
assert.match(main,/fullscreenable:true/,'main player must support native fullscreen Spaces');
assert.match(main,/fullscreenable:false/,'mini-player must not become its own fullscreen Space');
assert.match(appCss,/\.sonora-window-drag-strip\s*\{/);
assert.match(react,/sonora-window-drag-strip/);
assert.doesNotMatch(react,/sonora-fs-title">Sonora Music/,'redundant title tab should be removed');
for(const id of ['previous','toggle','next','seek','open-app']){
  assert.match(html,new RegExp('id="'+id+'"'));
}
assert.match(css,/backdrop-filter:blur\(30px\)/,'liquid glass must be kept');
console.log('PASS: compact 308×134 glass player, extra tab removed, native inset title, real native fullscreen Space from green control, controls and drag area preserved');
