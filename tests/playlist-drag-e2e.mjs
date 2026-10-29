import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {seedArtistFixture} from './seed-artist-fixture.mjs';
const profile = mkdtempSync(resolve(tmpdir(),'sonora-drag-'));
const app = await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,SONORA_TEST_PROFILE:profile}});
const errors=[];
try {
 const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.locator('.app').waitFor();await seedArtistFixture(page);
 await page.getByRole('button',{name:'Create playlist',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Playlist name').fill('Drag selection regression');
 const search=dialog.getByLabel('Search library');await search.fill('alexg');
 assert.equal(await dialog.locator('.playlist-picker-row').count(),22);
 assert.equal(await dialog.locator('.playlist-picker-cover img').count(),22);
 const rows=dialog.locator('.playlist-picker-row');
 async function sweep(from,to){
  const a=await rows.nth(from).boundingBox(),b=await rows.nth(to).boundingBox();
  assert.ok(a&&b,'Drag endpoints must be visible');
  const x=a.x+Math.min(98,a.width/2);
  await page.mouse.move(x,a.y+a.height/2);
  await page.mouse.down();
  await page.mouse.move(x,b.y+b.height/2,{steps:16});
  await page.mouse.up();
 }
 async function checked(){return await dialog.locator('.playlist-picker-song input:checked').count();}
 await sweep(0,2);
 assert.equal(await checked(),3,'Dragging across three unchecked rows must select three');
 await sweep(1,2);
 assert.equal(await checked(),1,'Dragging across checked rows must deselect that range');
 await rows.nth(3).locator('label').click();
 assert.equal(await checked(),2,'Ordinary click still toggles one song');
 await rows.nth(4).locator('input').focus();
 await page.keyboard.press('Space');
 assert.equal(await checked(),3,'Keyboard checkbox Space toggles one song');
 await search.press('Enter');
 assert.equal(await dialog.isVisible(),true,'Enter must not close editor');
 await dialog.getByRole('button',{name:'Select all results'}).click();
 assert.equal(await checked(),22,'Select all still works after drag');
 await dialog.getByRole('button',{name:'Create playlist',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 assert.equal(await page.locator('.track-row').count(),22,'22 saved tracks in playlist');
 await page.getByRole('button',{name:'Edit songs',exact:true}).click();
 const edit=page.getByRole('dialog');await edit.getByLabel('Search library').fill('alexg');
 assert.equal(await edit.locator('.playlist-picker-cover img').count(),22);
 await edit.getByLabel('Search library').press('Enter');
 assert.equal(await edit.isVisible(),true,'Edit dialog remains open on Enter');
 await page.keyboard.press('Escape');
 await page.reload();await page.getByRole('button',{name:'Drag selection regression',exact:true}).click();
 assert.equal(await page.locator('.track-row').count(),22,'Saved playlist survives reload');
 assert.deepEqual(errors,[],'No renderer errors');
 console.log(JSON.stringify({result:'PASS',checks:['drag adds contiguous songs','drag deselects contiguous songs','normal click and Space checkbox unaffected','22 album thumbnails','Enter stays open','select-all and saved playlist persistence','no page errors']},null,2));
}finally{await app.close();}
