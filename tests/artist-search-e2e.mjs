import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {seedArtistFixture} from './seed-artist-fixture.mjs';
const profile=mkdtempSync(resolve(tmpdir(),'sonora-search-regression-'));
const app=await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,SONORA_TEST_PROFILE:profile}});
const errors=[];
try {
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.locator('.app').waitFor();await seedArtistFixture(page);
 await page.getByRole('button',{name:'Search',exact:true}).click();
 const search=page.getByPlaceholder('Search songs, artists, albums...');
 for(const q of ['alexg','Alex G','ALEX-G']) {
  await search.fill(q);await search.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.track-row').length===22);
  assert.equal(await page.locator('.track-row').count(),22);
 }
 await page.getByRole('button',{name:'Create playlist',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Playlist name').fill('Artist search regression');
 const picker=dialog.getByLabel('Search library');
 for(const q of ['alexg','Alex G','ALEX-G']) {
  await picker.fill(q);await picker.press('Enter');
  await page.waitForTimeout(150);
  assert.equal(await dialog.isVisible(),true,'Search Enter must not submit and close editor');
  assert.equal(await dialog.getByRole('checkbox').count(),22);
 }
 await dialog.getByRole('button',{name:'Select all results',exact:true}).click();
 await picker.fill('no matching artist');
 await picker.press('Enter');
 assert.equal(await dialog.isVisible(),true);
 assert.match(await dialog.innerText(),/22 selected/);
 await picker.fill('alexg');
 assert.equal(await dialog.locator('.playlist-picker-cover').count(),22,'Every matched track has a cover slot');
 const embeddedArtworkCount=await dialog.locator('.playlist-picker-cover img').count();
 assert.ok(embeddedArtworkCount>0,'Saved album covers appear instead of only placeholders');
 await page.waitForFunction(()=>[...document.querySelectorAll('.playlist-picker-cover img')].every(img=>img.complete&&img.naturalWidth>0));
 console.log('Rendered cover slots:',22,'Actual album artwork:',embeddedArtworkCount);
 await page.screenshot({path:'tests/playlist-results/alexg-search.png'});
 await dialog.getByRole('button',{name:'Create playlist',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 assert.equal(await page.locator('.track-row').count(),22);
 await page.getByRole('button',{name:'Edit songs',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Search library').fill('alexg');
 await page.getByRole('dialog').getByLabel('Search library').press('Enter');
 assert.equal(await page.getByRole('dialog').isVisible(),true);
 await page.keyboard.press('Escape');
 await page.reload();
 await page.getByRole('button',{name:'Artist search regression',exact:true}).click();
 assert.equal(await page.locator('.track-row').count(),22);
 assert.deepEqual(errors,[]);
 const result={result:'PASS',matches:22,checks:['alexg, Alex G and ALEX-G return all 22 saved matches in main search and picker','Enter does not close create or edit dialog','No-results search preserves selections','Explicit creation saves all 22 selections','22 tracks persist after reload','No renderer errors']};
 mkdirSync('tests/playlist-results',{recursive:true});
 writeFileSync('tests/playlist-results/artist-search-report.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{await app.close();}
