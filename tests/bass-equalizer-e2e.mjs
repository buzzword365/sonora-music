import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

const app=await electron.launch({
  executablePath:resolve('release/mac-arm64/Sonora Music.app/Contents/MacOS/Sonora Music'),
  env:{...process.env,SONORA_TEST_PROFILE:mkdtempSync(resolve(tmpdir(),'sonora-bass-test-'))}
});
try {
  const page=await app.firstWindow();
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.locator('.app').waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Earthquake',exact:true}).click();
  const bass=page.getByRole('slider',{name:'bass equalizer'});
  const mid=page.getByRole('slider',{name:'mid equalizer'});
  assert.equal(await page.getByRole('checkbox',{name:'Enable equaliser'}).isChecked(),true);
  assert.equal(await bass.inputValue(),'24');
  assert.equal(await bass.getAttribute('max'),'24');
  assert.equal(await mid.inputValue(),'-5');
  await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="bass equalizer"]')?.value==='24');
  assert.equal(await page.getByRole('checkbox',{name:'Enable equaliser'}).isChecked(),true);
  assert.equal(await page.getByRole('slider',{name:'bass equalizer'}).inputValue(),'24');
  // Exercise the real Web Audio graph, not only the preset controls, with a
  // generated 55 Hz bass tone. This test never uses personal music files.
  await page.evaluate(async()=>{
    const rate=44100,seconds=4,count=rate*seconds;
    const buffer=new ArrayBuffer(44+count*2), view=new DataView(buffer);
    const putText=(offset,value)=>[...value].forEach((char,i)=>view.setUint8(offset+i,char.charCodeAt(0)));
    putText(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);putText(8,'WAVE');putText(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
    view.setUint16(32,2,true);view.setUint16(34,16,true);putText(36,'data');view.setUint32(40,count*2,true);
    for(let n=0;n<count;n++)view.setInt16(44+n*2,Math.round(0.3*32767*Math.sin(2*Math.PI*55*n/rate)),true);
    const blob=new Blob([buffer],{type:'audio/wav'});
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('sonora-local-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
    const tx=db.transaction(['tracks','audio'],'readwrite');
    tx.objectStore('tracks').put({id:'bass-tone-smoke',title:'Synthetic bass playback test',artist:'Test generator',album:'Tests',duration:4,size:blob.size,filename:'test.wav',fingerprint:'bass-smoke',addedAt:Date.now(),liked:false,mime:'audio/wav'});
    tx.objectStore('audio').put(blob,'bass-tone-smoke');
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
  });
  await page.reload();
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  await page.locator('.track-title').filter({hasText:'Synthetic bass playback test'}).click();
  await page.waitForFunction(()=>document.querySelector('.seekbar')?.innerText?.includes('0:01'),{timeout:10000});
  assert.deepEqual(errors,[]);
  console.log('PASS: Earthquake preset and +24 dB bass settings persist; synthetic 55 Hz audio plays through the full Web Audio graph.');
} finally {await app.close();}
