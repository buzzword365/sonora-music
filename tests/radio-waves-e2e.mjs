import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const profile=mkdtempSync(resolve(tmpdir(),'sonora-wave-test-'));
const app=await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,SONORA_TEST_PROFILE:profile}});
const errors=[];
try{
  const page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.app').waitFor();
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const r=indexedDB.open('sonora-local-v1');
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    const data=new ArrayBuffer(44+8000*2*20),v=new DataView(data);
    const str=(i,s)=>[...s].forEach((c,j)=>v.setUint8(i+j,c.charCodeAt(0)));
    str(0,'RIFF');v.setUint32(4,data.byteLength-8,true);
    str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);
    v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);
    v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
    str(36,'data');v.setUint32(40,data.byteLength-44,true);
    const tx=db.transaction(['tracks','audio'],'readwrite');
    for(let i=0;i<3;i++){
      const id='wave-'+i;
      tx.objectStore('tracks').put({id,title:'Wave '+i,artist:'Test',album:'Wave Test',
        duration:20,size:data.byteLength,filename:id+'.wav',fingerprint:id,addedAt:30-i,
        liked:i%2===0,mime:'audio/wav'});
      tx.objectStore('audio').put(new Blob([data],{type:'audio/wav'}),id);
    }
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    db.close();
  });
  await page.reload();
  await page.locator('.app').waitFor();
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  const play=page.getByRole('button',{name:'Play all',exact:true});
  const mix=page.getByRole('button',{name:'Mix',exact:true});
  assert.equal(await play.locator('.radio-wave-emission').count(),0);
  await play.click();
  assert.equal(await play.locator('.radio-wave-emission').count(),0,'Play All must have no effect');
  await mix.click();
  let active=page.getByRole('button',{name:'Turn Mix off'});
  assert.equal(await active.getAttribute('aria-pressed'),'true');
  await active.locator('.radio-wave-emission').waitFor({state:'attached'});
  assert.equal(await active.locator('.oil-slick-svg').count(),1);
  const wave=await active.locator('.radio-wave-emission').evaluate(el=>{
    const film=el.querySelector('.oil-slick-svg');
    const spectral=film?.querySelector('radialGradient');
    const styles=getComputedStyle(film);
    return {
      pointerEvents:getComputedStyle(el).pointerEvents,
      animated:styles.animationName,
      width:parseFloat(styles.width),
      height:parseFloat(styles.height),
      colors:[...spectral.querySelectorAll('stop')].map(node=>node.getAttribute('stop-color')),
      filter:film.querySelector('feDisplacementMap')?.getAttribute('scale'),
      visibility:getComputedStyle(el).display
    };
  });
  assert.equal(wave.pointerEvents,'none');
  assert.equal(wave.animated,'oil-slick-radiate');
  assert.ok(wave.width<=190 && wave.height<=110,'Wave remains compact');
  assert.ok(new Set(wave.colors).size>=8,'Subtle film still contains rainbow tones');
  assert.ok(Number(wave.filter)>0 && Number(wave.filter)<=8,'Liquid distortion is gentle');
  assert.equal(wave.visibility,'block');
  await page.waitForTimeout(250);
  await page.screenshot({path:'/tmp/sonora-subtle-mix-preview.png'});
  await active.click();
  assert.equal(await page.getByRole('button',{name:'Mix',exact:true}).getAttribute('aria-pressed'),'false');
  const off=page.getByRole('button',{name:'Mix',exact:true});
  assert.equal(await off.locator('.oil-slick-svg').count(),1,'Mix off also produces a pulse');
  await page.waitForTimeout(980);
  assert.equal(await off.locator('.radio-wave-emission').count(),0,'Wave cleans up after animation');
  await page.emulateMedia({reducedMotion:'reduce'});
  await off.click();
  active=page.getByRole('button',{name:'Turn Mix off'});
  await active.locator('.radio-wave-emission').waitFor({state:'attached'});
  assert.equal(await active.locator('.radio-wave-emission').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await play.locator('.radio-wave-emission').count(),0);
  assert.deepEqual(errors,[],'No renderer exceptions');
  console.log(JSON.stringify({result:'PASS',checks:['Only Mix plays a small oil-slick ripple','Play All has no animation','Thin restrained ripple with subtle distortion','Toggling Mix off has a ripple without breaking playback','Animation self-cleans','Reduced motion hides ripple','No runtime errors'],preview:'/tmp/sonora-subtle-mix-preview.png'},null,2));

}finally{
  await app.close();
}