import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {seedArtistFixture} from './seed-artist-fixture.mjs';

const profile=mkdtempSync(resolve(tmpdir(),'sonora-glass-'));
const app=await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,SONORA_TEST_PROFILE:profile}});
const errors=[],checks=[];
try{
  const page=await app.firstWindow();
  page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.app').waitFor();
  await seedArtistFixture(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const defaultOption=page.getByTestId('theme-default');
  const glassOption=page.getByTestId('theme-glass');
  assert.equal(await page.locator('.app').getAttribute('data-ui-theme'),'default');
  assert.equal(await defaultOption.getAttribute('aria-pressed'),'true');
  const original=await page.locator('.sidebar').evaluate(el=>({
    background:getComputedStyle(el).backgroundColor,
    backdrop:getComputedStyle(el).backdropFilter
  }));
  await page.screenshot({path:'/tmp/sonora-theme-default-settings.png'});
  await glassOption.click();
  assert.equal(await page.locator('.app').getAttribute('data-ui-theme'),'glass');
  assert.equal(await glassOption.getAttribute('aria-pressed'),'true');
  assert.equal(await defaultOption.getAttribute('aria-pressed'),'false');
  const computed=await page.evaluate(()=>{
    const style=s=>getComputedStyle(document.querySelector(s));
    return {
      sidebar:style('.sidebar').backdropFilter,
      player:style('.player').backdropFilter,
      bar:style('.topbar').backdropFilter,
      card:style('.theme-picker').backdropFilter,
      buttonBackground:style('.theme-picker-option').backgroundImage,
      appBackground:style('.app').backgroundImage,
      contrastText:style('.page-title').color
    };
  });
  for(const key of ['sidebar','player','bar','card'])
    assert.match(computed[key],/blur\(/,'Glass blur missing from '+key);
  assert.notEqual(original.backdrop,computed.sidebar);
  checks.push('Default remains the initial theme; Glass changes frosted surfaces and aria-pressed');
  await page.waitForTimeout(450);
  await page.screenshot({path:'/tmp/sonora-theme-glass-settings.png'});
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  assert.equal(await page.locator('.track-row').count(),22);
  const clarity=await page.locator('.track-row').first().evaluate(row=>({
    titleOpacity:getComputedStyle(row.querySelector('.track-labels strong')).opacity,
    coverOpacity:getComputedStyle(row.querySelector('.cover')).opacity,
    coverFilter:getComputedStyle(row.querySelector('.cover')).filter
  }));
  assert.equal(clarity.titleOpacity,'1');
  assert.equal(clarity.coverOpacity,'1');
  assert.equal(clarity.coverFilter,'none');
  await page.screenshot({path:'/tmp/sonora-theme-glass-songs.png'});
  checks.push('Songs and album artwork remain fully opaque and readable');
  await page.reload();
  await page.locator('.app').waitFor();
  assert.equal(await page.locator('.app').getAttribute('data-ui-theme'),'glass');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  assert.equal(await page.getByTestId('theme-glass').getAttribute('aria-pressed'),'true');
  await page.getByTestId('appearance-light').click();
  await page.locator('.sidebar').getByRole('button',{name:'Home',exact:true}).click();
  await page.waitForTimeout(750);
  await page.screenshot({path:'/tmp/sonora-theme-glass-home-light.png'});
  assert.equal(await page.locator('.app').getAttribute('data-appearance'),'light');
  assert.equal(await page.locator('.app').getAttribute('data-ui-theme'),'glass');
  checks.push('Glass persists after restart and works with the pre-existing light appearance');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByTestId('appearance-dark').click();
  await page.locator('.sidebar').getByRole('button',{name:'Home',exact:true}).click();
  await page.waitForTimeout(650);
  await page.screenshot({path:'/tmp/sonora-theme-glass-home-dark.png'});
  checks.push('Glass works with dark appearance too');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Glass theme causes horizontal overflow');
  await page.screenshot({path:'/tmp/sonora-theme-glass-mobile.png'});
  checks.push('Glass Settings theme picker fits a narrow mobile viewport');
  await page.setViewportSize({width:1200,height:850});
  await page.getByTestId('theme-default').click();
  assert.equal(await page.locator('.app').getAttribute('data-ui-theme'),'default');
  const reverted=await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backdropFilter);
  assert.equal(reverted,original.backdrop);
  await page.getByRole('button',{name:'All songs',exact:true}).click();
  assert.equal(await page.locator('.track-row').count(),22);
  checks.push('Switching back to Default removes the frosted treatment without touching the library');
  assert.deepEqual(errors,[],'Renderer errors found');
  console.log(JSON.stringify({result:'PASS',checks,computed,clarity,errors},null,2));
}finally{await app.close();}
