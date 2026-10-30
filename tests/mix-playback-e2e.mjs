import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

const profile=mkdtempSync(resolve(tmpdir(),'sonora-mix-'));
const app=await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,SONORA_TEST_PROFILE:profile}});
const errors=[];
try {
  const page=await app.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.app').waitFor();
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('sonora-local-v1');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const samples=8000*20;
    const wav=new ArrayBuffer(44+samples*2), view=new DataView(wav);
    const chars=(i,text)=>[...text].forEach((c,j)=>view.setUint8(i+j,c.charCodeAt(0)));
    chars(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);
    chars(8,'WAVE');chars(12,'fmt ');view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,8000,true);view.setUint32(28,16000,true);
    view.setUint16(32,2,true);view.setUint16(34,16,true);
    chars(36,'data');view.setUint32(40,wav.byteLength-44,true);
    const blob=new Blob([wav],{type:'audio/wav'});
    const tx=db.transaction(['tracks','audio','playlists'],'readwrite');
    for(let i=0;i<6;i++){
      const id='mix-'+i;
      tx.objectStore('tracks').put({
        id,title:'Song '+i,artist:i%2?'Artist Two':'Artist One',
        album:i<4?'Album Blue':'Album Red',duration:20,size:wav.byteLength,
        filename:id+'.wav',fingerprint:id,addedAt:100-i,liked:i%2===0,
        mime:'audio/wav'
      });
      tx.objectStore('audio').put(blob,id);
    }
    tx.objectStore('playlists').put({id:'test-list',name:'Mix test playlist',createdAt:1,trackIds:['mix-5','mix-3','mix-0']});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    db.close();
  });
  await page.reload();
  await page.locator('.app').waitFor();
  const queue=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sonora:queue-shadow')||'[]'));
  const mixButton=()=>page.getByRole('button',{name:'Mix',exact:true});
  const mixAndCheck=async(expected)=>{
    await mixButton().click();
    const actual=await queue();
    assert.equal(actual.length,expected.length);
    assert.equal(new Set(actual).size,expected.length,'Mix must not repeat tracks');
    assert.deepEqual([...actual].sort(),[...expected].sort(),'Mix must stay inside chosen collection');
    assert.equal(await page.getByRole('button',{name:'Shuffle'}).getAttribute('aria-pressed'),'true');
    const active=page.getByRole('button',{name:'Turn Mix off'});
    assert.equal(await active.getAttribute('aria-pressed'),'true','Active Mix is announced to assistive technology');
    assert.match(await active.getAttribute('class'),/is-mixed/,'Active Mix has visible selected styling');
    assert.equal((await active.innerText()).trim(),'Mixed','Mix visibly changes to Mixed');
    const playerTitle=await page.locator('.player-track strong').first().innerText();
    assert.equal(playerTitle,'Song '+actual[0].split('-')[1],'The first queued track starts playing');
    return actual;
  };
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  const all=await mixAndCheck(['mix-0','mix-1','mix-2','mix-3','mix-4','mix-5']);
  for(let i=1;i<all.length;i++){
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.waitForFunction(title=>document.querySelector('.player-track strong')?.textContent===title,'Song '+all[i].split('-')[1]);
  }
  await page.getByRole('button',{name:'Next',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Play',exact:true}).count(),1,'Mix stops at the end if repeat is off');
  await page.getByRole('button',{name:'Previous',exact:true}).click();
  assert.equal(await page.locator('.player-track strong').first().innerText(),'Song '+all[all.length-2].split('-')[1]);
  const playingBeforeOff=await page.locator('.player-track strong').first().innerText();
  await page.getByRole('button',{name:'Turn Mix off'}).click();
  assert.equal(await page.getByRole('button',{name:'Shuffle'}).getAttribute('aria-pressed'),'false');
  assert.deepEqual(await queue(),['mix-0','mix-1','mix-2','mix-3','mix-4','mix-5']);
  assert.equal(await page.locator('.player-track strong').first().innerText(),playingBeforeOff,'Switching off Mix preserves current track');
  assert.equal(await page.getByRole('button',{name:'Mix',exact:true}).getAttribute('aria-pressed'),'false');
  await page.getByRole('button',{name:'Liked songs',exact:true}).click();
  await mixAndCheck(['mix-0','mix-2','mix-4']);
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Mix',exact:true}).getAttribute('aria-pressed'),'false','All Songs should not appear mixed while Liked Songs are mixed');
  await page.getByRole('button',{name:'Liked songs',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Turn Mix off'}).getAttribute('aria-pressed'),'true','Returning to the active collection restores its Mixed indicator');
  await page.getByRole('button',{name:'Turn Mix off'}).click();
  assert.deepEqual(await queue(),['mix-0','mix-2','mix-4'],'Liked Songs Mix off restores its original order');
  await mixAndCheck(['mix-0','mix-2','mix-4']);
  await page.getByRole('button',{name:'Mix test playlist',exact:true}).click();
  await mixAndCheck(['mix-5','mix-3','mix-0']);
  await page.getByRole('button',{name:'Albums',exact:true}).click();
  await page.locator('.album-card').filter({hasText:'Album Blue'}).first().click();
  await mixAndCheck(['mix-0','mix-1','mix-2','mix-3']);
  await page.getByRole('button',{name:'Artists',exact:true}).click();
  await page.locator('.artist-card').filter({hasText:'Artist Two'}).first().click();
  await mixAndCheck(['mix-1','mix-3','mix-5']);
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByPlaceholder('Search songs, artists, albums...').fill('Song 1');
  await page.getByRole('button',{name:'Mix results',exact:true}).click();
  assert.deepEqual(await queue(),['mix-1']);
  assert.equal(await page.getByRole('button',{name:'Turn results Mix off'}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Turn results Mix off'}).click();
  assert.equal(await page.getByRole('button',{name:'Mix results'}).getAttribute('aria-pressed'),'false');
  assert.deepEqual(errors,[],'No renderer errors');
  console.log(JSON.stringify({result:'PASS',checks:[
    'Mix controls on All songs, Liked songs, playlists, albums, artists, and search',
    'Shuffled full queue contains each scoped track exactly once',
    'Next/Previous respect shuffled order; end stops without repeat',
    'Mix toggles visibly between Mix and Mixed with aria-pressed and accent styling',
    'Turning Mix off restores original queue without changing the current song',
    'Mixed indication belongs only to the active collection and returns on navigation',
    'Player shuffle indicator and restore-original-order control',
    'No runtime errors'
  ]},null,2));
}finally{
  await app.close();
}