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
  await page.getByRole('button',{name:'Deep bass',exact:true}).click();
  const bass=page.getByRole('slider',{name:'bass equalizer'});
  const mid=page.getByRole('slider',{name:'mid equalizer'});
  assert.equal(await page.getByRole('checkbox',{name:'Enable equaliser'}).isChecked(),true);
  assert.equal(await bass.inputValue(),'14');
  assert.equal(await bass.getAttribute('max'),'15');
  assert.equal(await mid.inputValue(),'-3');
  await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="bass equalizer"]')?.value==='14');
  assert.equal(await page.getByRole('checkbox',{name:'Enable equaliser'}).isChecked(),true);
  assert.equal(await page.getByRole('slider',{name:'bass equalizer'}).inputValue(),'14');
  assert.deepEqual(errors,[]);
  console.log('PASS: Deep bass preset, +15 dB range and sound setting persist across reload without renderer errors.');
} finally {await app.close();}
