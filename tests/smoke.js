const express = require('express');
const path = require('path');
const { chromium } = require('@playwright/test');

const rootDir = path.resolve(__dirname, '..');

const checks = [
  {
    path: '/ema-scanner.html',
    name: 'EMA scanner',
    assert: async (page) => {
      await page.waitForFunction(() => document.querySelectorAll('#scanner-table tbody tr').length >= 100, null, { timeout: 10000 });
      const rows = await page.locator('#scanner-table tbody tr').count();
      if (rows < 100) throw new Error(`expected at least 100 scanner rows, got ${rows}`);
      await expectText(page, 'Weekly EMA Strategy Scanner');
      await expectText(page, 'Dashboard');
    },
  },
  {
    path: '/dividend-tracker.html',
    name: 'Dividend tracker',
    assert: async (page) => {
      await page.waitForSelector('#app-content', { timeout: 10000 });
      await expectText(page, 'Dividend Portfolio Tracker');
      await expectText(page, 'Annual Income');
      await expectText(page, 'dividend stocks');
    },
  },
  {
    path: '/risk-metric.html',
    name: 'BTC risk metric',
    assert: async (page) => {
      // Allow for live-quote fallbacks plus the full-history regression on cold CI runners.
      await page.waitForFunction(() => document.querySelectorAll('#riskTable .risk-cell').length >= 10, null, { timeout: 20000 });
      await expectText(page, 'Bitcoin Risk Metric');
      await expectText(page, 'Combined Risk');
      await expectText(page, 'Price at Each Risk Level');
      await expectText(page, 'Bitcoin Market-Cap-Damped Power-Law Fair Value');
      await expectText(page, 'Long-run scenario, not a short-term price target');
      await expectText(page, 'half of the growth above a 6% long-run nominal rate is damped');
      await expectText(page, 'World Gold Council’s long-term model');
      await expectText(page, 'gpower-law');
      const projectionHeaders = await page.locator('#projTable th').allTextContents();
      for (const header of ['Damped Fair Value', 'Fair Value Growth', 'Gap to Fair Value']) {
        if (!projectionHeaders.includes(header)) throw new Error(`missing projection header: ${header}`);
      }
      if (projectionHeaders.includes('Typical Range (±1σ)')) {
        throw new Error('unexpected historical dispersion column');
      }
      const projectionDates = await page.locator('#projBody .pj-date').allTextContents();
      if (!projectionDates.includes('June 2030') || !projectionDates.includes('Dec 2030')) {
        throw new Error('expected semiannual fair-value projections through 2030');
      }
      if (projectionDates.includes('June 2031')) {
        throw new Error('expected annual December-only projections after 2030');
      }
      for (let year = 2031; year <= 2040; year++) {
        if (!projectionDates.includes(`Dec ${year}`)) {
          throw new Error(`missing annual fair-value projection for Dec ${year}`);
        }
      }
      const dec2040Row = page.locator('#projBody tr', { hasText: 'Dec 2040' });
      const dec2040FairValue = await dec2040Row.locator('.pj-price').innerText();
      const dec2040Value = Number(dec2040FairValue.replace(/[$,M]/g, '')) * (dec2040FairValue.includes('M') ? 1e6 : 1);
      if (dec2040Value < 1.5e6 || dec2040Value > 3e6) {
        throw new Error(`expected damped Dec 2040 fair value, got ${dec2040FairValue}`);
      }
      await expectText(page, 'damped fair value through 2040 in All view');
      const projectionEnd = await page.locator('#priceCanvas').getAttribute('data-projection-end');
      const projectionPoints = Number(await page.locator('#priceCanvas').getAttribute('data-projection-points'));
      if (projectionEnd !== '2040-12-01' || projectionPoints < 5000) {
        throw new Error(`expected price chart projection through 2040, got ${projectionEnd} with ${projectionPoints} points`);
      }
    },
  },
];

function startServer() {
  const app = express();
  app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path.endsWith('.csv') || req.path.endsWith('.json')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
  });
  app.use(express.static(rootDir));

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('local smoke server did not provide a TCP port'));
        return;
      }
      const { port } = address;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
    server.on('error', reject);
  });
}

async function expectText(page, text) {
  const body = await page.locator('body').innerText({ timeout: 5000 });
  if (!body.toLowerCase().includes(text.toLowerCase())) throw new Error(`missing expected text: ${text}`);
}

function isIgnoredConsoleError(text) {
  return [
    'Failed to load resource',
    'net::ERR_NAME_NOT_RESOLVED',
    'net::ERR_CONNECTION_REFUSED',
    'api.coingecko.com',
    'workers.dev',
  ].some((needle) => text.includes(needle));
}

async function run() {
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();
  const failures = [];

  try {
    for (const check of checks) {
      const page = await browser.newPage();
      const pageErrors = [];
      const consoleErrors = [];

      page.on('pageerror', (err) => pageErrors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isIgnoredConsoleError(msg.text())) {
          consoleErrors.push(msg.text());
        }
      });

      try {
        await page.goto(baseUrl + check.path, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await check.assert(page);
        if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
        if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(' | ')}`);
        console.log(`OK ${check.name}`);
      } catch (err) {
        failures.push(`${check.name}: ${err.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  if (failures.length) {
    console.error('Smoke test failures:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('All smoke tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
