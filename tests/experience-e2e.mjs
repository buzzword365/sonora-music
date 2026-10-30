import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {seedArtistFixture} from './seed-artist-fixture.mjs';
import {notchPopupBounds,inNotchHoverZone,inPopupZone} from '../electron/notch-geometry.mjs';

const display={bounds:{x:0,y:0,width:1512,height:982},workArea:{x:0,y:38,width:1512,height:944}};
const popup=notchPopupBounds(display);
assert.deepEqual(popup,{x:586,y:42,width:340,height:116});
assert.equal(inNotchHoverZone({x:756,y:22},display),true);
assert.equal(inNotchHoverZone({x:120,y:22},display),false);
assert.equal(inPopupZone({x:popup.x+110,y:popup.y+40},popup),true);

const profile=mkdtempSync(resolve(tmpdir(),'sonora-experience-'));
const app=await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,SONORA_TEST_PROFILE:profile}});
const errors=[],checks=[];
try{
  const page=await app.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.app').waitFor();
  await seedArtistFixture(page);
  await page.evaluate(async()=>{
    const db=await new Promise((ok,no)=>{const q=indexedDB.open('sonora-local-v1');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
    const tx=db.transaction('tracks','readwrite');
    for(const [id,plays] of [['fixture-0',8],['fixture-1',5],['fixture-15',4]]){
      const row=await new Promise((ok,no)=>{const q=tx.objectStore('tracks').get(id);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
      tx.objectStore('tracks').put({...row,playCount:plays,playedAt:Date.now()-plays*1000});
    }
    await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});
    db.close();
    localStorage.setItem('sonora:listen-seconds',3661);
  });
  await page.reload();await page.locator('.app').waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByText('Listening statistics',{exact:true}).waitFor();
  assert.equal(await page.getByTestId('stats-play-starts').innerText(),'17');
  assert.equal(await page.getByTestId('stats-listening-time').innerText(),'1h 1m');
  assert.equal(await page.getByText('Alex G',{exact:true}).count()>0,true);
  assert.equal(await page.getByText('Fixture track 01',{exact:true}).count()>0,true);
  assert.equal(await page.getByText('Play counts record song starts, not completed listens.',{exact:false}).count()>0,true);
  await page.screenshot({path:'/tmp/sonora-experience-stats.png'});
  checks.push('Statistics reads stored play counts, top artist, top song, listened time and qualification');
  assert.equal(await page.getByText('MacBook notch controls',{exact:true}).count(),1);
  const notchSetting=page.getByLabel('Enable notch pop-down');
  assert.equal(await notchSetting.isChecked(),true);
  await notchSetting.uncheck();
  assert.equal(await notchSetting.isChecked(),false);
  await notchSetting.check();
  await page.reload();await page.locator('.app').waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  assert.equal(await page.getByLabel('Enable notch pop-down').isChecked(),true);
  checks.push('Notch feature toggle exists and persists in Mac Settings');
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  await page.getByRole('button',{name:'Play Fixture track 01'}).click();
  await page.waitForTimeout(350);
  const desktopTitle=await page.locator('.player-track strong').first().innerText();
  assert.equal(desktopTitle,'Fixture track 01');
  await page.getByRole('button',{name:'Expand Now Playing'}).click();
  await page.getByRole('dialog',{name:'Now Playing'}).waitFor({state:'visible'});
  assert.equal(await page.getByRole('heading',{name:'Fixture track 01'}).count(),1);
  const backdrop=await page.locator('.immersive-backdrop img').evaluate(img=>getComputedStyle(img).filter);
  assert.match(backdrop,/blur/);
  const coverOpacity=await page.locator('.immersive-cover').evaluate(img=>getComputedStyle(img).opacity);
  assert.equal(coverOpacity,'1');
  await page.screenshot({path:'/tmp/sonora-experience-immersive.png'});
  await page.getByRole('button',{name:'Now Playing next'}).click();
  assert.equal(await page.getByRole('heading',{name:'Fixture track 02'}).count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog',{name:'Now Playing'}).count(),0);
  await page.getByRole('button',{name:'Open immersive Now Playing'}).click();
  await page.getByRole('button',{name:'Close Now Playing'}).click();
  checks.push('Immersive player opens from cover and expand button, shows clear art/blurred background, controls next, closes by Escape');
  const windows=app.windows();
  const notch=windows.find(w=>w.url().endsWith('/notch.html'));
  assert.ok(notch,'Native notch popup BrowserWindow exists');
  await notch.locator('#title').waitFor();
  await page.waitForTimeout(550);
  assert.equal(await notch.locator('#title').textContent(),'Fixture track 02');
  const media=await notch.evaluate(()=>({
    hasBridge:Boolean(window.sonoraNotch),
    previous:document.querySelector('#previous')?.getAttribute('aria-label'),
    play:document.querySelector('#toggle')?.getAttribute('aria-label'),
    next:document.querySelector('#next')?.getAttribute('aria-label')
  }));
  assert.deepEqual(media,{hasBridge:true,previous:'Previous song',play:'Play',next:'Next song'});
  await notch.evaluate(()=>document.querySelector('#next').click());
  await page.waitForFunction(()=>document.querySelector('.player-track strong')?.textContent==='Fixture track 03');
  checks.push('Native notch window shows live song info; controls send authenticated commands to main player');
  assert.deepEqual(errors,[],'No renderer errors');
  console.log(JSON.stringify({result:'PASS',checks,popup,errors},null,2));
}finally{await app.close();}
