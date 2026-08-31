const express = require('express');
const path = require('path');
const { chromium } = require('@playwright/test');
const dividendData = require('../data/dividend_data.json');

const btciLatestPayment = dividendData.tickers.BTCI.last_payments.reduce((latest, payment) =>
  payment.ex_date > latest.ex_date ? payment : latest
);
const btciShares = 6000;
const btciMonthlyIncome = btciLatestPayment.amount * btciShares;
const btciAnnualIncome = btciMonthlyIncome * 12;
const formatCurrency = (value) => value.toLocaleString('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const isNextExport = process.argv.includes('--next-export');
const rootDir = isNextExport
  ? path.resolve(__dirname, '..', 'next-site', 'out')
  : path.resolve(__dirname, '..');

function dashboardPath(slug) {
  return isNextExport ? `/${slug}/` : `/${slug}.html`;
}

async function assertSectionNavigation(page, expectedCount, dashboardName) {
  const sectionLinks = page.locator('.risk-section-nav a');
  if (await sectionLinks.count() !== expectedCount) {
    throw new Error(`expected ${expectedCount} ${dashboardName} section-navigation links, got ${await sectionLinks.count()}`);
  }
  const sectionNavLayout = await page.locator('.risk-section-nav').evaluate((nav) => {
    const style = getComputedStyle(nav);
    return {
      display: style.display,
      position: style.position,
      width: nav.getBoundingClientRect().width,
    };
  });
  if (sectionNavLayout.display !== 'none' && (
    sectionNavLayout.width > 200 ||
    !['fixed', 'sticky'].includes(sectionNavLayout.position)
  )) {
    throw new Error(`expected side navigation without a full-width banner, got ${JSON.stringify(sectionNavLayout)}`);
  }
  const sectionTargets = await sectionLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href'))
  );
  for (const href of sectionTargets) {
    if (!href || !href.startsWith('#') || await page.locator(href).count() !== 1) {
      throw new Error(`${dashboardName} section navigation has an invalid target: ${href}`);
    }
  }
}

const checks = [
  {
    path: dashboardPath('ema-scanner'),
    name: 'EMA scanner',
    assert: async (page) => {
      await page.waitForFunction(() => document.querySelectorAll('#scanner-table tbody tr').length >= 100, null, { timeout: 10000 });
      const rows = await page.locator('#scanner-table tbody tr').count();
      if (rows < 100) throw new Error(`expected at least 100 scanner rows, got ${rows}`);
      await expectText(page, 'Weekly EMA Strategy Scanner');
      await expectText(page, 'Dashboard');
      for (const symbol of ['SPY', 'QQQ']) {
        const gauge = page.locator(`.risk-bar-wrap[data-risk-asset="${symbol}"]`);
        if (await gauge.getAttribute('data-risk-model') !== '200w-trailing20y-weekly') {
          throw new Error(`${symbol} scanner gauge is not using the weekly 200W model`);
        }
        const value = Number(await gauge.getAttribute('data-risk-value'));
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          throw new Error(`invalid ${symbol} scanner risk ${value}`);
        }
      }
    },
  },
  {
    path: dashboardPath('dividend-tracker'),
    name: 'Dividend tracker',
    assert: async (page) => {
      await page.waitForSelector('#app-content', { timeout: 10000 });
      await expectText(page, 'Dividend Portfolio Tracker');
      await expectText(page, 'Annual Income');
      await expectText(page, 'dividend stocks');

      await page.route('https://daveybitcoins-api.dave-erazo78.workers.dev/**', (route) => route.abort());
      await page.evaluate(() => {
        localStorage.setItem('dividend_portfolios', JSON.stringify([{
          name: 'Main',
          holdings: [{ ticker: 'BTCI', shares: 6000, costBasis: 28.60 }],
        }]));
        localStorage.removeItem('dividend_history_cache');
      });
      await page.reload();
      await page.waitForFunction(
        (expected) => document.querySelector('#monthly-income')?.textContent === expected,
        formatCurrency(btciMonthlyIncome),
        { timeout: 10000 },
      );

      if (await page.locator('#annual-income').innerText() !== formatCurrency(btciAnnualIncome)) {
        throw new Error('BTCI annual income is not based on the latest dividend payment');
      }
      if (await page.locator('#monthly-income').innerText() !== formatCurrency(btciMonthlyIncome)) {
        throw new Error('BTCI monthly income is not based on the latest dividend payment');
      }
      const btciRow = await page.locator('#holdings-table tbody tr').innerText();
      if (
        !btciRow.includes(`$${btciLatestPayment.amount.toFixed(4)}`) ||
        !btciRow.includes(formatCurrency(btciAnnualIncome)) ||
        !btciRow.includes(formatCurrency(btciMonthlyIncome))
      ) {
        throw new Error(`BTCI holding math does not tie to the latest payment: ${btciRow}`);
      }
      await expectText(page, 'Latest Div / Share');
    },
  },
  {
    path: dashboardPath('risk-metric'),
    name: 'BTC risk metric',
    assert: async (page) => {
      // Allow for live-quote fallbacks plus the full-history regression on cold CI runners.
      await page.waitForFunction(() => document.querySelectorAll('#riskTable .risk-cell').length >= 10, null, { timeout: 20000 });
      await expectText(page, 'Bitcoin Risk Metric');
      await expectText(page, 'Combined Risk');
      const riskValue = await page.locator('#vRisk').innerText();
      if (!/^0\.\d{3}$|^1\.000$/.test(riskValue)) {
        throw new Error(`unexpected BTC combined-risk value: ${riskValue}`);
      }
      const activeZoneLabels = await page.locator('#riskCard [data-risk-zone].is-active').allTextContents();
      if (activeZoneLabels.length !== 1) {
        throw new Error(`BTC combined-risk zone label is not active: ${activeZoneLabels.join(',')}`);
      }
      const riskCardText = await page.locator('#riskCard').innerText();
      if (/stage/i.test(riskCardText)) {
        throw new Error(`BTC combined-risk card still uses stage language: ${riskCardText}`);
      }
      const meterValueText = await page.locator('#riskBar').getAttribute('aria-valuetext');
      if (!meterValueText?.includes(`${activeZoneLabels[0]} risk zone`)) {
        throw new Error(`BTC combined-risk meter does not announce its zone: ${meterValueText}`);
      }
      await expectText(page, 'Major Weekly Moving Averages');
      await assertSectionNavigation(page, 12, 'BTC');
      const movingAveragePeriods = await page.locator('#movingAveragesCard .moving-average-period').allTextContents();
      if (movingAveragePeriods.join(',') !== '8W,13W,21W,50W,200W,300W') {
        throw new Error(`unexpected BTC moving-average periods: ${movingAveragePeriods.join(',')}`);
      }
      const movingAverageValues = await page.locator('#movingAveragesCard .moving-average-value').evaluateAll(
        (elements) => elements.map((element) => Number(element.dataset.value))
      );
      if (movingAverageValues.length !== 6 || movingAverageValues.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error(`invalid BTC moving-average values: ${movingAverageValues.join(',')}`);
      }
      const weeklyObservations = Number(await page.locator('#movingAveragesCard').getAttribute('data-weekly-observations'));
      if (weeklyObservations < 300) throw new Error(`insufficient BTC weekly history: ${weeklyObservations}`);
      await expectText(page, '200-Day Average: Bear Reset & Turn');
      const ma200dSection = page.locator('#ma200d-analysis');
      const ma200dSlope30 = Number(await ma200dSection.getAttribute('data-slope30'));
      const ma200dAnnualChange = Number(await ma200dSection.getAttribute('data-annual-change'));
      const ma200dPriceGap = Number(await ma200dSection.getAttribute('data-price-gap'));
      if (![ma200dSlope30, ma200dAnnualChange, ma200dPriceGap].every(Number.isFinite)) {
        throw new Error(`invalid BTC 200D analysis: ${ma200dSlope30}, ${ma200dAnnualChange}, ${ma200dPriceGap}`);
      }
      const ma200dRegime = await ma200dSection.getAttribute('data-regime');
      if (!['confirmed-post-bear-turn', 'post-bear-candidate', 'bottoming-watch', 'bear-reset', 'bull-reacceleration', 'cycle-cooling'].includes(ma200dRegime)) {
        throw new Error(`unexpected BTC 200D regime: ${ma200dRegime}`);
      }
      const ma200dCanvas = page.locator('#ma200dCanvas');
      const ma200dSeriesPoints = Number(await ma200dCanvas.getAttribute('data-series-points'));
      const ma200dTurnCount = Number(await ma200dCanvas.getAttribute('data-turn-count'));
      if (ma200dSeriesPoints < 4000 || ma200dTurnCount < 5) {
        throw new Error(`insufficient BTC 200D history: ${ma200dSeriesPoints} points, ${ma200dTurnCount} turns`);
      }
      const ma200dRows = await page.locator('#ma200dTurnsBody tr').count();
      if (ma200dRows !== 6) throw new Error(`expected six recent BTC 200D upward turns, got ${ma200dRows}`);
      await expectText(page, 'Price at Each Risk Level');
      await expectText(page, 'Bitcoin Market-Cap-Adjusted Power-Law Fair Value');
      await expectText(page, 'Model Snapshot & Historical Check');
      await expectText(page, 'Momentum Window');
      await expectText(page, 'Monthly Samples');
      const backtestRows = await page.locator('#modelBacktestBody tr').count();
      if (backtestRows !== 4) throw new Error(`expected 4 BTC backtest rows, got ${backtestRows}`);
      await expectText(page, 'Long-run scenario, not a short-term price target');
      await expectText(page, 'at $23T the power-law growth above a 6% long-run nominal rate is reduced by half');
      await expectText(page, 'World Gold Council');
      await expectText(page, 'gpower-law');
      const projectionHeaders = await page.locator('#projTable th').allTextContents();
      for (const header of ['Adjusted Fair Value', 'Fair Value Growth', 'Gap to Fair Value']) {
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
        throw new Error(`expected adjusted Dec 2040 fair value, got ${dec2040FairValue}`);
      }
      await expectText(page, 'market-cap-adjusted fair value through 2040');
      const projectionEnd = await page.locator('#priceCanvas').getAttribute('data-projection-end');
      const projectionPoints = Number(await page.locator('#priceCanvas').getAttribute('data-projection-points'));
      if (projectionEnd !== '2040-12-01' || projectionPoints < 5000) {
        throw new Error(`expected price chart projection through 2040, got ${projectionEnd} with ${projectionPoints} points`);
      }
      const minorTickMultipliers = await page.locator('#priceCanvas').getAttribute('data-log-minor-tick-multipliers');
      const minorTickCount = Number(await page.locator('#priceCanvas').getAttribute('data-log-minor-tick-count'));
      if (minorTickMultipliers !== '2,3,4,5,6,7,8,9' || minorTickCount < 8) {
        throw new Error(`expected logarithmic minor ticks for each decade, got ${minorTickMultipliers} (${minorTickCount})`);
      }
      const zoomControls = await page.locator('.zoom-btn, .brush-overlay').count();
      if (zoomControls !== 0) {
        throw new Error(`expected fixed BTC chart views without zoom controls, found ${zoomControls}`);
      }
      await page.locator('#priceCanvas').dispatchEvent('wheel', { deltaY: -120 });
      await page.waitForTimeout(50);
      if (await page.locator('#priceCanvas').getAttribute('data-projection-end') !== '2040-12-01') {
        throw new Error('BTC price chart changed range after a wheel event');
      }
      await page.locator('#riskCanvas').dispatchEvent('wheel', { deltaY: -120 });
      await page.waitForTimeout(50);
      if (await page.locator('#priceCanvas').getAttribute('data-projection-end') !== '2040-12-01') {
        throw new Error('BTC risk chart changed the shared price-chart range after a wheel event');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileWidth = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      if (mobileWidth.document > mobileWidth.viewport + 1) {
        throw new Error(`BTC dashboard overflows mobile viewport: ${JSON.stringify(mobileWidth)}`);
      }
    },
  },
  {
    path: dashboardPath('spy-risk-metric'),
    name: 'SPY risk metric',
    assert: async (page) => {
      await page.waitForFunction(() => document.querySelectorAll('#riskTable .risk-cell').length === 10, null, { timeout: 20000 });
      await expectText(page, 'Risk Price Scenarios');
      await expectText(page, 'Market Cycle Risk');
      await assertSectionNavigation(page, 10, 'SPY');
      const riskLevels = await page.locator('#riskTable .rc-risk').allTextContents();
      if (riskLevels.join(',') !== '0.10,0.20,0.30,0.40,0.50,0.60,0.70,0.80,0.90,1.00') {
        throw new Error(`unexpected SPY risk scenario intervals: ${riskLevels.join(',')}`);
      }
      await expectText(page, 'Risk · 200-Week Trend-Deviation Percentile');
      await expectText(page, 'Weekly risk only');
      await expectText(page, '200-Week Trend');
      await expectText(page, 'shaded = ≥10% drawdown windows');
      await expectText(page, 'Valuation-Aware Downside Scenarios');
      await expectText(page, 'not a guaranteed market floor');
      await expectText(page, 'Forward P/E Price Projections');
      await expectText(page, 'FactSet Jul 24, 2026');
      await expectText(page, 'Next review: Oct 2026');
      await expectText(page, 'Forward 12M P/E');
      await expectText(page, 'is the nearest whole-number scenario');
      await expectText(page, 'Nearest current');
      await expectText(page, 'CY2026 consensus EPS: $345');
      const removedReturnsPanel = await page.locator('#returnsCanvas').count();
      if (removedReturnsPanel !== 0) throw new Error('forward-return-by-risk-decile panel should be removed');
      const riskCardText = (await page.locator('#riskTable').innerText()).toLowerCase();
      if (riskCardText.includes('p/e')) throw new Error('200W risk cards should not show static-EPS P/E values');
      if (await page.locator('#riskTable').getAttribute('data-model') !== '200w-trailing20y-weekly') {
        throw new Error('risk scenarios are not using the weekly 200W model');
      }
      const currentRisk = Number(await page.locator('#vRisk').innerText());
      const risk200W = Number(await page.locator('#vRisk').getAttribute('data-risk200w'));
      const risk200D = await page.locator('#vRisk').getAttribute('data-risk200d');
      if (currentRisk < 0.80 || currentRisk > 0.98) throw new Error(`unexpected 200W risk ${currentRisk}`);
      if (risk200W < 0.80 || risk200W > 0.98) throw new Error(`unexpected 200W risk ${risk200W}`);
      if (risk200D !== null) throw new Error('200D risk should not be present');
      if (Math.abs(currentRisk - risk200W) > 0.002) {
        throw new Error('headline risk does not match the 200W percentile');
      }
      if (await page.locator('#riskCanvas').getAttribute('data-model') !== '200W trailing-20-year weekly percentile') {
        throw new Error('risk oscillator is not using the weekly-only model');
      }
      const riskStart = await page.locator('#riskCanvas').getAttribute('data-comparison-start');
      const vixStart = await page.locator('#vixCanvas').getAttribute('data-comparison-start');
      if (!riskStart?.startsWith('1990') || riskStart !== vixStart) {
        throw new Error(`risk/VIX comparison ranges are not aligned: ${riskStart} vs ${vixStart}`);
      }
      const riskDrawdownBands = Number(await page.locator('#riskCanvas').getAttribute('data-drawdown-bands'));
      const vixDrawdownBands = Number(await page.locator('#vixCanvas').getAttribute('data-drawdown-bands'));
      if (riskDrawdownBands < 5 || riskDrawdownBands !== vixDrawdownBands) {
        throw new Error(`risk/VIX drawdown bands are not aligned: ${riskDrawdownBands} vs ${vixDrawdownBands}`);
      }
      const stressRows = await page.locator('#valuationStressBody tr').allTextContents();
      if (stressRows.length !== 4) throw new Error(`expected 4 valuation-aware stress rows, got ${stressRows.length}`);
      if (!stressRows.some((row) => row.includes('No EPS decline') && row.includes('$373') && row.includes('15×') && row.includes('$560'))) {
        throw new Error('missing no-decline 15x valuation scenario');
      }
      if (!stressRows.some((row) => row.includes('Severe recession') && row.includes('-35%') && row.includes('$243') && row.includes('$364'))) {
        throw new Error('missing severe-recession valuation scenario');
      }
      const growthInput = page.locator('#epsGrowthInput');
      if (await growthInput.inputValue() !== '8') throw new Error('expected 8% default post-2027 EPS growth');
      const projectionRows = await page.locator('#peProjBody tr').allTextContents();
      if (projectionRows.some((row) => row.includes('2026'))) {
        throw new Error('current year should be summarized above, not listed as a projection row');
      }
      if (!projectionRows.some((row) => row.includes('2027') && row.includes('Consensus EPS $398'))) {
        throw new Error('missing July 2027 consensus EPS');
      }
      if (!projectionRows.some((row) => row.includes('2028') && row.includes('Scenario EPS $430'))) {
        throw new Error('missing post-2027 scenario EPS');
      }
      await page.locator('.pe-growth-preset[data-growth="12"]').click();
      if (await growthInput.inputValue() !== '12') throw new Error('expected 12% growth preset to update the input');
      let updatedRows = await page.locator('#peProjBody tr').allTextContents();
      if (!updatedRows.some((row) => row.includes('2028') && row.includes('Scenario EPS $446 (+12.0%)'))) {
        throw new Error('expected 12% preset to update scenario EPS');
      }
      await growthInput.fill('27');
      if (await growthInput.inputValue() !== '20') throw new Error('expected growth input to clamp at 20%');
      await expectText(page, 'Limited to 0–20%');
      updatedRows = await page.locator('#peProjBody tr').allTextContents();
      if (!updatedRows.some((row) => row.includes('2028') && row.includes('Scenario EPS $478 (+20.0%)'))) {
        throw new Error('expected clamped input to update scenario EPS consistently');
      }
    },
  },
];

const removedPaths = [
  { path: dashboardPath('qqq-risk-metric'), name: 'QQQ risk metric' },
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

  console.log(`Testing ${isNextExport ? 'Next.js static export' : 'legacy HTML'} from ${rootDir}`);

  try {
    for (const removed of removedPaths) {
      const response = await fetch(baseUrl + removed.path);
      if (response.status !== 404) {
        failures.push(`${removed.name}: expected removed route to return 404, got ${response.status}`);
      } else {
        console.log(`OK removed ${removed.name}`);
      }
    }

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
