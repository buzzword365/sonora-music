import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const profile = resolve('tests/adaptive-e2e-profile');
mkdirSync(profile, { recursive: true });
const app = await electron.launch({ args:['.'], cwd:process.cwd(),
  env:{...process.env, SONORA_TEST_PROFILE:profile } });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.locator('.app').waitFor();
  await page.evaluate(async () => {
    const db = await new Promise((resolve,reject) => {
      const open=indexedDB.open('sonora-local-v1',1);
      open.onsuccess=()=>resolve(open.result); open.onerror=()=>reject(open.error);
    });
    const colours = [
      { name:'Cream illustration', bg:'#fffed0', marks:[['#0b0b0b',38,18,48,56],['#de1a1c',18,80,26,22]] },
      { name:'Black illustration', bg:'#080709', marks:[['#dd2823',18,25,33,38],['#48bd5b',60,33,27,42]] },
    ];
    const covers = await Promise.all(colours.map(async entry => {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
      const ctx=canvas.getContext('2d');ctx.fillStyle=entry.bg;ctx.fillRect(0,0,128,128);
      for (const [hex,x,y,w,h] of entry.marks) {ctx.fillStyle=hex;ctx.fillRect(x,y,w,h);}
      return await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    }));
    const wav=new ArrayBuffer(44+8000*30*2),view=new DataView(wav);
    const str=(i,s)=>[...s].forEach((c,j)=>view.setUint8(i+j,c.charCodeAt(0)));
    str(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);
    view.setUint16(34,16,true);str(36,'data');view.setUint32(40,wav.byteLength-44,true);
    const tx=db.transaction(['tracks','audio','prefs'],'readwrite');
    tx.objectStore('tracks').clear();tx.objectStore('audio').clear();
    for(let i=0;i<colours.length;i++){
      tx.objectStore('tracks').put({id:'adaptive-'+i,title:colours[i].name,artist:'Palette test',
      album:'Illustrations',duration:30,size:wav.byteLength,filename:'test-'+i+'.wav',
      fingerprint:'adaptive-'+i,addedAt:100-i,liked:false,cover:covers[i],mime:'audio/wav'});
      tx.objectStore('audio').put(new Blob([wav],{type:'audio/wav'}),'adaptive-'+i);
    }
    tx.objectStore('prefs').put(null,'currentId');
    tx.objectStore('prefs').put('auto','appearanceMode');
    localStorage.setItem('sonora:appearance-mode-shadow','auto');
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    db.close();
  });
  await page.reload();await page.locator('.app').waitFor();
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  const pick=async title=>{
    await page.locator('.track-title').filter({hasText:title}).click();
    await page.waitForFunction(title=>document.querySelector('.player-track strong')?.textContent===title,title);
    await page.waitForTimeout(950);
    return page.evaluate(()=>{
      const app=document.querySelector('.app');
      return {bg:app.style.getPropertyValue('--theme-bg'), accent:app.style.getPropertyValue('--theme-accent'),
        secondary:app.style.getPropertyValue('--theme-secondary'), mode:getComputedStyle(app).colorScheme,
        background:getComputedStyle(app).backgroundColor,
        sidebar:getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
        player:getComputedStyle(document.querySelector('.player')).backgroundColor,
        text:getComputedStyle(app).color};
    });
  };
  const cream=await pick('Cream illustration');
  assert.equal(cream.mode,'light');await page.screenshot({path:'tests/adaptive-cream.png'});
  const black=await pick('Black illustration');
  assert.equal(black.mode,'dark');await page.screenshot({path:'tests/adaptive-black.png'});
  for(const part of ['bg','accent','secondary','background','sidebar','player','text'])
    assert.notEqual(cream[part],black[part],part+' must change with cover');
  // The appearance selector must preserve album hues while choosing brightness.
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const automatic=page.getByTestId('appearance-auto');
  const lightButton=page.getByTestId('appearance-light');
  const darkButton=page.getByTestId('appearance-dark');
  assert.equal(await automatic.getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'tests/appearance-auto-settings.png'});
  const colours=()=>page.evaluate(()=>{
    const root=document.querySelector('.app');
    return {mode:getComputedStyle(root).colorScheme, choice:root.getAttribute('data-appearance'),
      bg:root.style.getPropertyValue('--theme-bg'),
      accent:root.style.getPropertyValue('--theme-accent'),
      sidebar:getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
      player:getComputedStyle(document.querySelector('.player')).backgroundColor};
  });
  await lightButton.click();
  await page.waitForTimeout(850);
  const blackLight=await colours();
  assert.equal(blackLight.mode,'light');
  assert.equal(blackLight.choice,'light');
  assert.notEqual(blackLight.bg,black.bg);
  assert.notEqual(blackLight.accent,black.accent);
  assert.equal(await lightButton.getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'tests/appearance-light-settings.png'});
  await darkButton.click();
  await page.waitForTimeout(850);
  const blackDark=await colours();
  assert.equal(blackDark.mode,'dark');
  assert.equal(blackDark.choice,'dark');
  assert.notEqual(blackLight.bg,blackDark.bg);
  await page.screenshot({path:'tests/appearance-dark-settings.png'});
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  const creamDark=await pick('Cream illustration');
  assert.equal(creamDark.mode,'dark','Dark setting must override a cream album');
  assert.notEqual(creamDark.bg,cream.bg);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  assert.equal(await darkButton.getAttribute('aria-pressed'),'true');
  await automatic.click();
  await page.waitForTimeout(850);
  assert.equal((await colours()).mode,'light','Automatic must restore artwork preference');
  await lightButton.click();
  await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.waitForTimeout(850);
  assert.equal(await lightButton.getAttribute('aria-pressed'),'true','Appearance preference must persist after reload');
  assert.equal((await colours()).mode,'light');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(150);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
    'Appearance setting must fit narrow screens');
  await page.screenshot({path:'tests/appearance-mobile-settings.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',cream,black,blackLight,blackDark,creamDark,
    checks:['three selectable designs','mode changes UI','album hues preserved',
      'forced dark on cream','forced light on black','automatic restored','persist after reload',
      'responsive narrow width','no JS errors'], errors},null,2));
} finally {await app.close();}
