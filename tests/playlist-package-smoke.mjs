import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const app=await electron.launch({
 executablePath:process.env.SONORA_SMOKE_APP || resolve('release/mac-arm64/Sonora Music.app/Contents/MacOS/Sonora Music'),
 args:[],env:{...process.env,SONORA_TEST_PROFILE:mkdtempSync(resolve(tmpdir(),'sonora-package-'))}
});
try {
 const page=await app.firstWindow();await page.locator('.app').waitFor();
 await page.getByRole('button',{name:'Create playlist',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Create playlist'});
 await dialog.getByLabel('Playlist name').fill('Package smoke test');
 await dialog.getByRole('button',{name:'Create playlist',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Choose songs',exact:true}).click();
 assert.match(await page.getByRole('dialog').innerText(),/library is empty/);
 await page.keyboard.press('Escape');
 console.log('PASS: packaged app launches, creates playlist, opens library picker.');
} finally {await app.close();}
