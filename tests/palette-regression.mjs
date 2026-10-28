import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

await build({ entryPoints: ['src/artworkTheme.ts'], bundle: true, platform: 'node',
  format: 'cjs', outfile: 'tests/palette-test-build.cjs' });
const { paletteFromPixels, themeVariables } = createRequire(import.meta.url)('./palette-test-build.cjs');

const cover = (background, marks = []) => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const selected = marks.find(m => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);
    const colour = selected?.colour || background;
    pixels.set([...colour, 255], (y * 64 + x) * 4);
  }
  return pixels;
};
const cream = paletteFromPixels(cover([255, 254, 208], [
  { x: 18, y: 15, w: 22, h: 30, colour: [12, 11, 13] },
  { x: 10, y: 48, w: 16, h: 9, colour: [222, 25, 28] },
  { x: 41, y: 27, w: 7, h: 12, colour: [232, 164, 28] }
]));
const dark = paletteFromPixels(cover([8, 7, 9], [
  { x: 13, y: 15, w: 16, h: 19, colour: [211, 37, 35] },
  { x: 31, y: 26, w: 16, h: 21, colour: [69, 189, 92] },
  { x: 25, y: 9, w: 5, h: 8, colour: [231, 170, 54] }
]));
assert.equal(cream.light, true, 'cream background should make a light theme');
assert.equal(dark.light, false, 'black background should make a dark theme');
assert(cream.accent && dark.accent, 'details should remain available');
const lightUI = themeVariables(cream), darkUI = themeVariables(dark);
assert.notEqual(lightUI['--theme-bg'], darkUI['--theme-bg']);
assert.notEqual(lightUI['--theme-accent'], darkUI['--theme-accent']);
assert.notEqual(lightUI['--theme-secondary'], lightUI['--theme-accent']);
const parse = value => value.match(/\d+/g).map(Number);
const luminance = col => {
  const linear = parse(col).map(x => {
    x /= 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const contrast = (a,b) => {
  const l1=luminance(a),l2=luminance(b);
  return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
};
for (const [name, ui] of [['cream',lightUI],['dark',darkUI]]) {
  for (const surface of ['bg','sidebar','panel','raised','hover','selected']) {
    for (const foreground of ['text','muted','accent']) {
      const n = contrast(ui['--theme-' + foreground], ui['--theme-' + surface]);
      assert(n >= 4.5, name + ' contrast failed: ' + foreground + '/' + surface + ' ' + n.toFixed(2));
    }
  }
  assert(contrast(ui['--theme-on-accent'], ui['--theme-accent']) >= 4.5, name + ' button contrast');
}
// Exercise the full hue wheel, saturated/pastel/neutral artwork, and both modes.
const sampleHsl = (h,s,l) => {
  const a=s*Math.min(l,1-l);
  return [0,8,4].map(n=>{
    const k=(n+h/30)%12;
    return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));
  });
};
let minContrast = Infinity;
for(let hue=0;hue<360;hue+=10) for(const saturation of [0,.2,.55,.95])
for(const lightness of [.10,.35,.60,.76,.94]){
  const [r,g,b]=sampleHsl(hue,saturation,lightness);
  const [ar,ag,ab]=sampleHsl((hue+107)%360,.8,.55);
  const ui=themeVariables({background:{r,g,b},accent:{r:ar,g:ag,b:ab},
    secondary:null,light:lightness>=.71});
  for(const surface of ['bg','sidebar','panel','raised','hover','selected']) {
    for(const foreground of ['text','muted','accent']) {
      const n=contrast(ui['--theme-'+foreground],ui['--theme-'+surface]);
      minContrast=Math.min(minContrast,n);
      assert(n>=4.5,'contrast fails '+hue+'/'+saturation+'/'+lightness+'/'+foreground+'/'+surface+' '+n.toFixed(2));
    }
  }
  const n=contrast(ui['--theme-on-accent'],ui['--theme-accent']);
  minContrast=Math.min(minContrast,n);
  assert(n>=4.5,'button contrast fails '+hue+'/'+saturation+'/'+lightness+' '+n.toFixed(2));
}
// Forced Light and Dark must remain accessible across wildly different album hues.
for (const mode of ['light','dark']) {
  for(let hue=0;hue<360;hue+=20) for(const saturation of [0,.3,.65,.95])
  for(const lightness of [.05,.32,.58,.78,.97]){
    const [r,g,b]=sampleHsl(hue,saturation,lightness);
    const [ar,ag,ab]=sampleHsl((hue+102)%360,.8,.45);
    const ui=themeVariables({background:{r,g,b},accent:{r:ar,g:ag,b:ab},
      secondary:null,light:lightness>=.71},mode);
    assert.equal(ui.colorScheme,mode);
    for(const surface of ['bg','sidebar','panel','raised','hover','selected']) {
      for(const foreground of ['text','muted','accent']){
        const n=contrast(ui['--theme-'+foreground],ui['--theme-'+surface]);
        minContrast=Math.min(minContrast,n);
        assert(n>=4.5,'forced '+mode+' contrast '+hue+'/'+saturation+'/'+lightness+'/'+foreground+'/'+surface+' '+n.toFixed(2));
      }
    }
    const n=contrast(ui['--theme-on-accent'],ui['--theme-accent']);
    minContrast=Math.min(minContrast,n);
    assert(n>=4.5,'forced '+mode+' button contrast '+hue+'/'+saturation+'/'+lightness+' '+n.toFixed(2));
  }
}
console.log('Palette full-wheel + forced-mode minimum contrast:',minContrast.toFixed(2));
const gray = paletteFromPixels(cover([125,125,125]));
assert.equal(gray.accent, null);
assert.equal(gray.light, false);
const white = paletteFromPixels(cover([249,249,249]));
assert.equal(white.light, true);
const transparent = paletteFromPixels(new Uint8ClampedArray(64*64*4));
assert.equal(transparent.light, false);
console.log(JSON.stringify({ result:'PASS', cream: lightUI, dark: darkUI,
  checks:['cream artwork produces a light UI','black artwork produces a dark UI',
    'distinct accent/secondary colours','WCAG AA contrast on all surface types',
    'monochrome artwork','transparent fallback'] }, null, 2));
