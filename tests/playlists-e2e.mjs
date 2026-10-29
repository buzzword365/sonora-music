import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const profile = mkdtempSync(resolve(tmpdir(), 'sonora-playlists-'));
const output = resolve('tests/playlist-results');
mkdirSync(output, {recursive:true});
const checks = [], errors = [];
let app, page;
async function launch() {
  app = await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,SONORA_TEST_PROFILE:profile}});
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.app').waitFor();
}
async function playlists() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve,reject) => { const r=indexedDB.open('sonora-local-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
    const result=await new Promise((resolve,reject)=>{const r=db.transaction('playlists').objectStore('playlists').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return result;
  });
}
async function openCreate() { await page.getByRole('button',{name:'Create playlist',exact:true}).click(); await page.getByRole('dialog').waitFor(); }
const dialog = () => page.getByRole('dialog');
const checkSong = title => dialog().getByRole('checkbox',{name:'Include '+title+' by Test artist'});
async function saveCreate(name) { await dialog().getByLabel('Playlist name').fill(name);await dialog().getByRole('button',{name:'Create playlist',exact:true}).click();await dialog().waitFor({state:'hidden'}); }
async function saveEdit() { await dialog().getByRole('button',{name:'Save changes',exact:true}).click();await dialog().waitFor({state:'hidden'}); }
async function selected() { await dialog().getByRole('button',{name:/Selected songs/}).click(); }
try {
  await launch();
  await openCreate();
  assert.match(await dialog().innerText(), /library is empty/);
  await dialog().getByRole('button',{name:'Create playlist',exact:true}).click();
  assert.match(await dialog().getByRole('alert').innerText(),/Enter a playlist name/);
  await saveCreate('Empty');
  await page.getByRole('button',{name:'Choose songs',exact:true}).click();
  assert.equal(await dialog().getByRole('checkbox').count(),0);
  await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});
  checks.push('Empty library, empty playlist, required name and Choose songs path');

  await page.evaluate(async () => {
    const db=await new Promise(resolve=>{const r=indexedDB.open('sonora-local-v1');r.onsuccess=()=>resolve(r.result);});
    const wav=new ArrayBuffer(44+8000*30*2),v=new DataView(wav);
    const str=(i,s)=>[...s].forEach((c,j)=>v.setUint8(i+j,c.charCodeAt(0)));
    str(0,'RIFF');v.setUint32(4,wav.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,wav.byteLength-44,true);
    const tx=db.transaction(['tracks','audio'],'readwrite');
    ['Alpha','Beta','Gamma'].forEach((title,i)=>{tx.objectStore('tracks').put({id:title,title,artist:'Test artist',album:i===2?'Other album':'Test album',duration:30,size:wav.byteLength,filename:title+'.wav',fingerprint:title,addedAt:100-i,liked:false,mime:'audio/wav'});tx.objectStore('audio').put(new Blob([wav],{type:'audio/wav'}),title);});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
  await page.reload();
  await openCreate();
  await checkSong('Alpha').check();
  await dialog().getByLabel('Search library').fill('Other album');
  assert.equal(await dialog().getByRole('checkbox').count(),1);
  await dialog().getByRole('button',{name:'Select all results'}).click();
  await dialog().getByLabel('Search library').fill('missing');
  assert.match(await dialog().innerText(),/No songs match/);
  await dialog().getByLabel('Search library').fill('Test artist');
  assert.equal(await checkSong('Alpha').isChecked(),true);
  assert.equal(await checkSong('Gamma').isChecked(),true);
  await dialog().getByLabel('Search library').fill('');
  await selected();
  await dialog().getByRole('button',{name:'Move Gamma up',exact:true}).click();
  assert.deepEqual(await dialog().locator('.playlist-picker-song strong').allTextContents(),['Gamma','Alpha']);
  await page.screenshot({path:resolve(output,'create-dark.png')});
  await saveCreate('  Road trip  ');
  let saved=(await playlists()).find(p=>p.name==='Road trip');
  assert.deepEqual(saved.trackIds,['Gamma','Alpha']);
  checks.push('Search title/artist/album, multi-select survives search, select all, no results, reorder, trim name');

  await page.getByRole('button',{name:'Edit songs',exact:true}).click();
  await checkSong('Alpha').uncheck();await checkSong('Beta').check();
  await saveEdit();
  assert.deepEqual((await playlists()).find(p=>p.id===saved.id).trackIds,['Gamma','Beta']);
  await page.getByRole('button',{name:'Edit songs',exact:true}).click();
  await checkSong('Alpha').check();
  await dialog().getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual((await playlists()).find(p=>p.id===saved.id).trackIds,['Gamma','Beta']);
  await openCreate();await dialog().getByLabel('Playlist name').fill('road TRIP');
  await dialog().getByRole('button',{name:'Create playlist',exact:true}).click();
  assert.match(await dialog().getByRole('alert').innerText(),/already exists/);
  await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'Create playlist',exact:true}).evaluate(e=>e===document.activeElement),true);
  checks.push('Edit adds/removes, cancel discards, duplicate validation, Escape restores focus');

  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await dialog().getByLabel('Playlist name').fill('Driving');
  await saveEdit();
  assert.deepEqual((await playlists()).find(p=>p.name==='Driving').trackIds,['Gamma','Beta']);
  await page.getByRole('button',{name:'Play all',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.player-track strong')?.textContent==='Gamma');
  await page.waitForFunction(()=>document.querySelector('.seekbar span')?.textContent!=='0:00');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.player-track strong')?.textContent==='Beta');
  checks.push('Rename preserves songs; Play all starts first ordered song, time advances, Next plays second');
  await app.close();await launch();
  assert.deepEqual((await playlists()).find(p=>p.name==='Driving').trackIds,['Gamma','Beta']);
  await page.getByRole('button',{name:'Driving',exact:true}).click();
  assert.deepEqual(await page.locator('.track-labels strong').allTextContents(),['Gamma','Beta']);
  await page.getByTestId('track-Beta').dragTo(page.getByTestId('track-Gamma'));
  await page.waitForFunction(()=>document.querySelector('.track-labels strong')?.textContent==='Beta');
  assert.deepEqual((await playlists()).find(p=>p.name==='Driving').trackIds,['Beta','Gamma']);
  checks.push('Full app restart persistence; existing drag reorder preserved');

  await page.getByRole('button',{name:'Edit songs',exact:true}).click();
  await selected();
  await dialog().getByRole('button',{name:'Move Beta down',exact:true}).click();
  await dialog().getByRole('button',{name:'Save changes',exact:true}).focus();
  await page.keyboard.press('Tab');
  assert.equal(await dialog().getByRole('button',{name:'Close playlist editor'}).evaluate(e=>e===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog().getByRole('button',{name:'Save changes',exact:true}).evaluate(e=>e===document.activeElement),true);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(output,'editor-narrow.png')});
  await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});
  await page.setViewportSize({width:1200,height:850});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByTestId('appearance-light').click();
  await page.getByRole('button',{name:'Driving',exact:true}).click();
  await page.getByRole('button',{name:'Edit songs',exact:true}).click();
  await page.waitForTimeout(800);
  assert.equal(await dialog().evaluate(e=>getComputedStyle(e).colorScheme),'light');
  await page.screenshot({path:resolve(output,'editor-light.png')});
  await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});
  checks.push('Keyboard focus trap; narrow layout; light and dark editor rendering');

  await page.getByRole('button',{name:'All songs',exact:true}).click();
  await page.getByTestId('track-Alpha').getByTitle('More options').click();
  await page.getByRole('button',{name:'New playlist',exact:true}).click();
  assert.equal(await checkSong('Alpha').isChecked(),true);
  await saveCreate('From song');
  checks.push('Existing song menu New playlist preselects song');
  await page.getByRole('button',{name:'Edit songs',exact:true}).click();
  await checkSong('Beta').check();
  await page.evaluate(()=>{
    window.originalPlaylistPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='playlists')throw new Error('Test storage failure');return window.originalPlaylistPut.apply(this,args);};
  });
  await dialog().getByRole('button',{name:'Save changes',exact:true}).click();
  assert.match(await dialog().getByRole('alert').innerText(),/Test storage failure/);
  assert.equal(await checkSong('Beta').isChecked(),true);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPlaylistPut;delete window.originalPlaylistPut;});
  await saveEdit();
  assert.deepEqual((await playlists()).find(p=>p.name==='From song').trackIds,['Alpha','Beta']);
  checks.push('Storage failure keeps draft and supports retry');
  const audioBytes=await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('sonora-local-v1');r.onsuccess=()=>resolve(r.result);});
    const blob=await new Promise(resolve=>{const r=db.transaction('audio').objectStore('audio').get('Alpha');r.onsuccess=()=>resolve(r.result);});db.close();return [...new Uint8Array(await blob.arrayBuffer())];
  });
  writeFileSync(resolve(output,'Imported sample.wav'),Buffer.from(audioBytes));
  await page.locator('input[type=file]').setInputFiles(resolve(output,'Imported sample.wav'));
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  await page.getByRole('button',{name:'Play Imported sample',exact:true}).waitFor();
  await page.locator('input[type=file]').setInputFiles(resolve(output,'Imported sample.wav'));
  await page.waitForTimeout(250);
  assert.equal(await page.getByRole('button',{name:'Play Imported sample',exact:true}).count(),1);
  await openCreate();
  await dialog().getByLabel('Search library').fill('Imported sample');
  assert.equal(await dialog().getByRole('checkbox').count(),1);
  await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});
  checks.push('Audio import remains available, duplicate import does not duplicate songs, imported song enters picker');
  assert.deepEqual(errors,[]);
  writeFileSync(resolve(output,'report.json'),JSON.stringify({result:'PASS',checks,errors,profile},null,2));
  console.log(JSON.stringify({result:'PASS',checks,errors},null,2));
} catch(error) {
  if(page) await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
  throw error;
} finally { if(app) await app.close().catch(()=>{}); }
