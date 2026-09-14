const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require('@playwright/test');
(async () => {
 const app = express();
 app.use(express.static(path.resolve(__dirname, '../next-site/out')));
 const server = app.listen(0, '127.0.0.1');
 await new Promise(resolve => server.once('listening', resolve));
 const browser = await chromium.launch();
 try {
  const page = await browser.newPage();
  await page.clock.install();
  let breadth = 65.6, fail = false, live = false;
  const urls = [];
  await page.route('**/data/scanner_data.json*', route => {
   urls.push(route.request().url());
   return fail ? route.abort() : route.fulfill({json:{meta:{date:'2026-09-14'},breadth_context:{above_200d:breadth}}});
  });
  await page.route(/^https:/, route => live && route.request().url().includes('coingecko') ? route.fulfill({json:{bitcoin:{usd:105000,last_updated_at:Math.floor(Date.now()/1000)}}}) : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const ready = () => page.waitForFunction(() => document.querySelector('.snapshot-grid').getAttribute('aria-busy') === 'false');
  await ready();
  assert.equal(await page.locator('.snapshot-card__date time').count(), 3);
  assert.match(await page.locator('.snapshot-card').nth(0).innerText(), /Saved data/);
  breadth = 72.3;
  await page.clock.fastForward(60000);
  await page.waitForFunction(() => document.querySelectorAll('.snapshot-card__reading strong')[2].textContent === '72.3%');
  await ready();
  assert.notEqual(urls[0], urls[1], 'Refresh must bypass cached data URLs');
  fail = true;
  await page.getByRole('button', {name:'Refresh now'}).click();
  await page.waitForFunction(() => document.querySelector('.snapshot-status').textContent.includes('Update incomplete'));
  await ready();
  assert.match(await page.locator('.snapshot-status').innerText(), /Update incomplete/);
  assert.equal(await page.locator('.snapshot-card__reading strong').nth(2).innerText(), '72.3%');
  fail = false; breadth = 75.4; live = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelectorAll('.snapshot-card__reading strong')[2].textContent === '75.4%');
  await ready();
  assert.match(await page.locator('.snapshot-card').nth(0).innerText(), /Latest quote/);
  assert.match(await page.locator('.snapshot-status').innerText(), /Last checked/);
  console.log('Snapshot checks passed: timed refresh, cache bypass, failed refresh preserves values, focus recovery, live BTC and saved fallback.');
 } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
