import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const profile=mkdtempSync(resolve(tmpdir(),'sonora-count-failure-'));
const app=await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,SONORA_TEST_PROFILE:profile}});
try {
  const page=await app.firstWindow();
  await page.locator('.app').waitFor();
  await page.evaluate(async()=>{
    const db=await new Promise((ok,no)=>{const q=indexedDB.open('sonora-local-v1');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
    const buf=new ArrayBuffer(44+32000),v=new DataView(buf);
    const write=(a,s)=>[...s].forEach((c,j)=>v.setUint8(a+j,c.charCodeAt(0)));
    write(0,'RIFF');v.setUint32(4,buf.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,8000,true);v.setUint32(28,16000,true);
    v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,buf.byteLength-44,true);
    const tx=db.transaction(['tracks','audio'],'readwrite');
    tx.objectStore('tracks').put({id:'fails-to-play',title:'Rejected Audio',artist:'Test Artist',
      album:'Test',duration:2,size:buf.byteLength,filename:'test.wav',fingerprint:'test',
      addedAt:1,liked:false,mime:'audio/wav',playCount:0});
    tx.objectStore('audio').put(new Blob([buf],{type:'audio/wav'}),'fails-to-play');
    await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});
    db.close();
  });
  await page.reload();await page.locator('.app').waitFor();
  await page.evaluate(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new Error('Blocked by test'))}});
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  await page.getByRole('button',{name:'Play Rejected Audio',exact:true}).click();
  await page.waitForTimeout(700);
  const count=await page.evaluate(async()=>{
    const db=await new Promise((ok,no)=>{const q=indexedDB.open('sonora-local-v1');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
    const row=await new Promise((ok,no)=>{const q=db.transaction('tracks').objectStore('tracks').get('fails-to-play');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
    return row.playCount||0;
  });
  console.log(JSON.stringify({playRejected:true,recordedCount:count,pass:count===0},null,2));
  assert.equal(count,0,'A rejected playback must not count as a play');
}finally{await app.close()}