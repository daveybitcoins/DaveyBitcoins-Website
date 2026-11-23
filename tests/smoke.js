const express = require('express');
const path = require('path');
const { chromium } = require('@playwright/test');
const dividendData = require('../data/dividend_data.json');
const scannerData = require('../data/scanner_data.json');
const spyValuation = require('../data/spy_valuation.json');
const { readFileSync } = require('node:fs');

const spyPrices = readFileSync(path.resolve(__dirname, '..', 'data_spy.csv'), 'utf8')
  .trim().split('\n').slice(1).map((row) => {
    const [date, price] = row.split(',');
    return { date, price: Number(price), ms: Date.parse(`${date}T00:00:00Z`) };
  });

const xbciLatestPayment = dividendData.tickers.XBCI.last_payments.reduce((latest, payment) =>
  payment.ex_date > latest.ex_date ? payment : latest
);
const xbciShares = 2000;
const xbciMonthlyIncome = xbciLatestPayment.amount * xbciShares;
const xbciAnnualIncome = xbciMonthlyIncome * 12;
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
      const scannerTableText = await page.locator('#scanner-table').textContent();
      if (!scannerTableText.includes('Next FY P/E')) {
        throw new Error('scanner table is not labeled with next-fiscal-year P/E');
      }
      const valuationRow = scannerData.full_scanner.find((row) => row.fwd_pe != null);
      const renderedValuationRow = await page.locator('#scanner-table tbody tr').evaluateAll(
        (tableRows, symbol) => tableRows.find((row) => row.cells[1]?.textContent.trim() === symbol)?.innerText,
        valuationRow.symbol,
      );
      if (!renderedValuationRow?.includes(valuationRow.fwd_pe.toFixed(1))) {
        throw new Error(`${valuationRow.symbol} next-FY P/E is not rendered from the reconciled scanner value`);
      }
      if (await page.locator('.risk-bar-wrap[data-risk-asset="QQQ"]').count()) {
        throw new Error('QQQ risk gauge should not appear in market context');
      }
      await expectText(page, 'Data as of ' + scannerData.meta.date);
      const labelColors = await page.evaluate(() => {
        const root = document.documentElement;
        const original = root.getAttribute('data-theme');
        const colors = ['dark', 'light'].map(theme => {
          root.setAttribute('data-theme', theme);
          return getComputedStyle(document.querySelector('.index-ma-label')).color;
        });
        if (original === null) root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', original);
        return colors;
      });
      if (labelColors[0] !== 'rgb(255, 255, 255)' || labelColors[1] !== 'rgb(0, 0, 0)') {
        throw new Error(`Incorrect weekly label colors: ${labelColors}`);
      }

      for (const symbol of ['SPY']) {
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
      await expectText(page, 'Est. Annual Distributions');
      await expectText(page, 'dividend stocks');

      const trackerLayout = await page.locator(isNextExport ? '.dividend-page' : 'body').evaluate((tracker) => {
        const main = tracker.querySelector('main');
        const card = tracker.querySelector('.card');
        const stats = tracker.querySelector('.stats-row');
        return {
          backgroundImage: getComputedStyle(tracker).backgroundImage,
          mainMaxWidth: main ? getComputedStyle(main).maxWidth : '',
          cardBorderStyle: card ? getComputedStyle(card).borderTopStyle : '',
          statsDisplay: stats ? getComputedStyle(stats).display : '',
        };
      });
      if (
        trackerLayout.backgroundImage === 'none' ||
        trackerLayout.mainMaxWidth !== '1540px' ||
        trackerLayout.cardBorderStyle === 'none' ||
        trackerLayout.statsDisplay !== 'flex'
      ) {
        throw new Error(`dividend tracker route styles are missing: ${JSON.stringify(trackerLayout)}`);
      }

      await page.route('https://daveybitcoins-api.dave-erazo78.workers.dev/**', (route) => route.abort());
      await page.evaluate((shares) => {
        localStorage.setItem('dividend_portfolios', JSON.stringify([{
          name: 'Main',
          holdings: [{ ticker: 'XBCI', shares, costBasis: 38.00 }],
        }]));
        localStorage.removeItem('dividend_history_cache');
      }, xbciShares);
      await page.reload();
      await page.waitForFunction(
        (expected) => document.querySelector('#monthly-income')?.textContent === expected,
        formatCurrency(xbciMonthlyIncome),
        { timeout: 10000 },
      );

      if (await page.locator('#annual-income').innerText() !== formatCurrency(xbciAnnualIncome)) {
        throw new Error('XBCI annual income is not based on the latest monthly distribution');
      }
      if (await page.locator('#monthly-income').innerText() !== formatCurrency(xbciMonthlyIncome)) {
        throw new Error('2,000 XBCI shares do not show the correct latest monthly payment');
      }
      const xbciRow = await page.locator('#holdings-table tbody tr').innerText();
      if (
        !xbciRow.includes(`$${xbciLatestPayment.amount.toFixed(4)}`) ||
        !xbciRow.includes(formatCurrency(xbciAnnualIncome)) ||
        !xbciRow.includes(formatCurrency(xbciMonthlyIncome))
      ) {
        throw new Error(`XBCI holding math does not reconcile: ${xbciRow}`);
      }
      await expectText(page, 'Latest Div / Share');

      // Adding a priced lot to shares with an unknown basis must not invent a
      // blended gain/loss basis for the pre-existing shares.
      await page.evaluate(() => {
        localStorage.setItem('dividend_portfolios', JSON.stringify([{
          name: 'Main',
          holdings: [{ ticker: 'XBCI', shares: 10, costBasis: null }],
        }]));
      });
      await page.reload();
      await page.waitForSelector('#app-content', { state: 'visible', timeout: 10000 });
      await page.locator('#ticker-input').fill('XBCI');
      await page.locator('#shares-input').fill('5');
      await page.locator('#cost-input').fill('30');
      await page.locator('#btn-add').click();
      await page.waitForFunction(() => {
        const holding = JSON.parse(localStorage.getItem('dividend_portfolios'))[0].holdings[0];
        return holding.shares === 15;
      });
      const holdingAfterAdd = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('dividend_portfolios'))[0].holdings[0]
      );
      if (holdingAfterAdd.costBasis !== null) {
        throw new Error(`unknown historical cost basis was replaced with ${holdingAfterAdd.costBasis}`);
      }
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
      const activeZoneLabels = await page.locator('#riskCard #vRiskZone[data-risk-zone]').evaluateAll(labels => labels.map(label => label.dataset.riskZone));
      if (activeZoneLabels.length !== 1) {
        throw new Error(`BTC combined-risk zone label is not active: ${activeZoneLabels.join(',')}`);
      }
      const riskLegend = await page.locator('#legendBar .legend-seg').allTextContents();
      const expectedRiskLegend = ['Generational0.00–0.10', 'Accumulate0.10–0.25', 'Neutral0.25–0.50', 'Elevated0.50–0.75', 'Caution0.75–0.90', 'Euphoria0.90–1.00'];
      if (JSON.stringify(riskLegend) !== JSON.stringify(expectedRiskLegend)) {
        throw new Error(`BTC price legend has incorrect risk ranges: ${riskLegend.join(', ')}`);
      }
      const clippedRiskLabels = await page.locator('#riskCard [data-risk-zone]').evaluateAll(labels => labels.filter(label => {
        const card = label.closest('#riskCard').getBoundingClientRect();
        return label.scrollWidth > label.clientWidth + 1 || label.getBoundingClientRect().bottom > card.bottom;
      }).map(label => label.textContent));
      if (clippedRiskLabels.length) throw new Error(`BTC gauge labels overflow: ${clippedRiskLabels.join(', ')}`);
      const riskCardText = await page.locator('#riskCard').innerText();
      if (/stage/i.test(riskCardText)) {
        throw new Error(`BTC combined-risk card still uses stage language: ${riskCardText}`);
      }
      const meterValueText = await page.locator('#riskBar').getAttribute('aria-valuetext');
      if (!meterValueText?.includes(`${activeZoneLabels[0]} risk zone`)) {
        throw new Error(`BTC combined-risk meter does not announce its zone: ${meterValueText}`);
      }
      await expectText(page, 'Major Weekly Moving Averages');
      await assertSectionNavigation(page, 10, 'BTC');
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
      if (await page.locator('#ma200d-analysis').count()) {
        throw new Error('BTC 200D analysis section should be removed');
      }
      if (await page.locator('#midterm-cycles').count()) {
        throw new Error('BTC midterm-election ROI section should be removed');
      }
      if (await page.locator('#vBearPct, #bearProgressBar').count()) {
        throw new Error('BTC bear-market progress card should be removed');
      }
      const bottomSectionOrder = await page.locator('#market-caps, #methodology').evaluateAll(
        (elements) => elements.map((element) => element.id)
      );
      if (bottomSectionOrder.join(',') !== 'market-caps,methodology') {
        throw new Error(`unexpected BTC bottom section order: ${bottomSectionOrder.join(',')}`);
      }
      await expectText(page, 'Price at Each Risk Level');
      await expectText(page, 'Bitcoin Market-Cap-Adjusted Power-Law Fair Value');
      await expectText(page, 'Model Snapshot & Historical Check');
      await expectText(page, 'Momentum Window');
      await expectText(page, 'Monthly Samples');
      const backtestRows = await page.locator('#modelBacktestBody tr').count();
      if (backtestRows !== 6) throw new Error(`expected 6 BTC backtest rows, got ${backtestRows}`);
      await expectText(page, 'Long-run scenario, not a short-term price target');
      await expectText(page, 'at the growing gold-linked threshold the power-law growth above a 6% long-run nominal rate is reduced by half');
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
      const zoomControls = page.locator('[data-price-zoom]');
      if (await zoomControls.count() !== 1 ||
          await zoomControls.getAttribute('data-price-zoom') !== 'reset') {
        throw new Error('Expected only the Reset zoom button');
      }
      const fullStart = await page.locator('#priceCanvas').getAttribute('data-visible-start');
      const priceCanvas = page.locator('#priceCanvas');
      await priceCanvas.scrollIntoViewIfNeeded();
      const bounds = await priceCanvas.boundingBox();
      await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.4);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.6, { steps: 5 });
      await page.mouse.up();
      if (await priceCanvas.getAttribute('data-visible-start') === fullStart) {
        throw new Error('Drag selection did not zoom the price chart');
      }
      await page.locator('[data-price-zoom="reset"]').click();
      if (await priceCanvas.getAttribute('data-visible-start') !== fullStart) {
        throw new Error('Reset did not restore full history');
      }
      await page.locator('#priceCanvas').dispatchEvent('wheel', { deltaY: -120 });
      await page.waitForTimeout(50);
      if (await page.locator('#priceCanvas').getAttribute('data-projection-end') === '2040-12-01') {
        throw new Error('BTC price chart did not zoom after a wheel event');
      }
      await page.locator('[data-price-zoom="reset"]').click();
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
      await assertSectionNavigation(page, isNextExport ? 8 : 7, 'SPY');
      if (isNextExport) {
        const chart = page.locator('#valuation-bands');
        await chart.locator('.vb-chart').waitFor();
        if (await chart.locator('.vb-historical-line').count() !== 6 || await chart.locator('.vb-projected-line').count() !== 6) {
          throw new Error('Expected six historical and projected P/E bands from 12× to 22×');
        }
        if (await chart.getByRole('group', { name: 'Chart price scale' }).count()) throw new Error('SPY chart should not offer a proxy toggle');
        const latestSavedSpy = spyPrices.at(-1).price;
        const displayedSavedSpy = Number((await chart.locator('.vb-current-price').innerText()).replace(/[$,]/g, ''));
        if (displayedSavedSpy !== Number(latestSavedSpy.toFixed(2))) throw new Error('Valuation chart must use actual saved SPY prices');
        const assertMarkerValues = async (growth) => {
          const markers = await chart.locator('.vb-projection-marker, .vb-end-marker').evaluateAll(nodes => nodes.map(node => ({
            pe: Number(node.dataset.pe), ms: Number(node.dataset.ms),
            text: node.querySelector('.vb-point-value, .vb-band-label')?.textContent,
            isEndpoint: node.classList.contains('vb-end-marker'),
            circles: node.querySelectorAll('circle').length,
          })));
          if (markers.length < 12) throw new Error('Missing labeled projection circles');
          for (const marker of markers) {
            const eps = spyValuation.forward_12m_eps * Math.pow(1 + growth / 100, (marker.ms - Date.parse(spyValuation.as_of + 'T00:00:00Z')) / (365.2425 * 86400000));
            const expected = marker.isEndpoint ? `${marker.pe}×` : '$' + (eps * marker.pe / 10).toLocaleString('en-US', { maximumFractionDigits: 0 });
            if (marker.circles !== 1 || marker.text !== expected) throw new Error(`Incorrect circle label: ${marker.text}; expected ${expected}`);
          }
        };
        await assertMarkerValues(8);
        const originalPath = await chart.locator('.vb-projected-line').first().getAttribute('d');
        await chart.getByLabel('Annual EPS growth').fill('12');
        if (await chart.locator('.vb-projected-line').first().getAttribute('d') === originalPath) throw new Error('EPS growth did not update valuation bands');
        await chart.getByRole('button', { name: '3Y', exact: true }).click();
        if (!(await chart.locator('.vb-stats strong').first().innerText()).startsWith('$')) throw new Error('SPY chart scale should show dollars');
        await assertMarkerValues(12);
        for (const growth of [30, -20]) {
          await chart.getByLabel('Annual EPS growth').fill(String(growth));
          await assertMarkerValues(growth);
          const overlaps = await chart.locator('.vb-projection-marker .vb-point-value, .vb-band-label').evaluateAll(nodes => {
            const boxes = nodes.map(node => node.getBoundingClientRect());
            const pairs = [];
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i], b = boxes[j];
              if (a.left < b.right + 2 && a.right + 2 > b.left && a.top < b.bottom + 2 && a.bottom + 2 > b.top) {
                pairs.push([nodes[i].textContent, nodes[j].textContent]);
              }
            }
            return pairs;
          });
          if (overlaps.length) throw new Error(`Projection circle values overlap at ${growth}% growth: ${JSON.stringify(overlaps)}`);
        }
        await chart.getByLabel('Annual EPS growth').fill('40');
        if (await chart.getByLabel('Annual EPS growth').getAttribute('aria-invalid') !== 'true') throw new Error('Out-of-range growth should be rejected');
        await chart.getByLabel('Annual EPS growth').fill('8');
        await chart.getByRole('button', { name: '2Y', exact: true }).click();
        await chart.getByLabel('Inspect date').focus();
        await page.keyboard.press('End');
        if (!(await chart.locator('.vb-inspector').innerText()).includes('Projected scenario')) throw new Error('Keyboard date inspection should reach the projection');
      }
      const riskLevels = (await page.locator('#riskTable .rc-risk').allTextContents()).map(label => label.replace(/^Risk\s+/, ''));
      if (riskLevels.join(',') !== '0.10,0.20,0.30,0.40,0.50,0.60,0.70,0.80,0.90,1.00') {
        throw new Error(`unexpected SPY risk scenario intervals: ${riskLevels.join(',')}`);
      }
      await expectText(page, 'Risk · 200-Week Trend-Deviation Percentile');
      await expectText(page, '200-Week Trend');
      await expectText(page, 'shaded = ≥10% SPY drawdown windows');
      await expectText(page, 'Forward 12M P/E');
      if (isNextExport) await expectText(page, 'FactSet Earnings Insight');
      if (await page.locator('#risk-oscillator, #riskCanvas, #downside-scenarios, #pe-projections').count()) {
        throw new Error('Removed SPY sections should not remain in the dashboard');
      }
      const currentForwardPE = Number((await page.locator('#vFwdPE').innerText()).match(/forward 12M P\/E: ([0-9.]+)×/i)?.[1]);
      const displayedSpyPrice = Number((await page.locator('#vPrice').innerText()).replace(/[$,]/g, ''));
      const expectedForwardPE = displayedSpyPrice * 10 / spyValuation.forward_12m_eps;
      if (!Number.isFinite(currentForwardPE) || Math.abs(currentForwardPE - expectedForwardPE) > 0.06) {
        throw new Error(`unexpected current forward P/E ${currentForwardPE}`);
      }
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
      if (!Number.isFinite(currentRisk) || currentRisk < 0 || currentRisk > 1) throw new Error(`unexpected 200W risk ${currentRisk}`);
      if (!Number.isFinite(risk200W) || risk200W < 0 || risk200W > 1) throw new Error(`unexpected 200W risk ${risk200W}`);
      if (risk200D !== null) throw new Error('200D risk should not be present');
      if (Math.abs(currentRisk - risk200W) > 0.002) {
        throw new Error('headline risk does not match the 200W percentile');
      }
      const vixStart = await page.locator('#vixCanvas').getAttribute('data-comparison-start');
      if (!vixStart?.startsWith('1993')) {
        throw new Error(`VIX history should start with actual SPY history: ${vixStart}`);
      }
      const vixDrawdownBands = Number(await page.locator('#vixCanvas').getAttribute('data-drawdown-bands'));
      if (vixDrawdownBands < 5) throw new Error('VIX drawdown shading should remain available');
      const recentEvent = page.locator('#riskLowsBody tr').filter({ hasText: 'Jensen Huang resignation' });
      const recentCells = await recentEvent.locator('td').allTextContents();
      const eventPrice = spyPrices.find(point => point.date === '2026-11-20');
      if (recentCells[0] !== eventPrice.date || Number(recentCells[2].replace(/[$,]/g, '')) !== Number(eventPrice.price.toFixed(2)) || recentCells[4] !== '40.0') {
        throw new Error(`Recent event should use the November 20 close and Cboe VIX high: ${JSON.stringify(recentCells)}`);
      }
      const eventSource = page.locator('.historic-event-note').getByRole('link', { name: 'NVIDIA announcement' });
      if (!(await eventSource.getAttribute('href')).includes('NVIDIA-Announces-CEO-Transition')) throw new Error('Recent event source is missing');
      for (let years = 1; years <= 3; years++) {
        if (spyPrices.at(-1).ms < eventPrice.ms + years * 365.2425 * 864e5 && recentCells[4 + years] !== '—') {
          throw new Error('Recent event must not invent forward returns before the observation horizon');
        }
      }
      const covidRow = page.locator('#riskLowsBody tr').filter({ hasText: 'COVID-19 Crash' });
      const covidCells = await covidRow.locator('td').allTextContents();
      const startIndex = spyPrices.findIndex((point) => point.date >= '2020-03-23');
      const targetMs = spyPrices[startIndex].ms + 365.2425 * 864e5;
      const future = spyPrices.find((point, index) => index > startIndex && point.ms >= targetMs);
      const expectedOneYear = Math.round((future.price / spyPrices[startIndex].price - 1) * 100);
      if (covidCells[5] !== `${expectedOneYear >= 0 ? '+' : ''}${expectedOneYear}%`) {
        throw new Error(`SPY 1Y event return uses the wrong horizon: ${covidCells[5]}`);
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
  const body = (await page.locator('body').innerText({ timeout: 5000 })).replace(/\s+/g, ' ');
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
