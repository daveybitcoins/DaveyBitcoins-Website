const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const ROOT = resolve(__dirname, '..');
const ENGINE_PATH = resolve(ROOT, 'btc-risk-engine.js');
const DATA_PATH = resolve(ROOT, 'data.csv');
// Freeze the dataset before the actively revised recent-price window so daily
// market-data updates do not change these regression fixtures.
const FIXTURE_CUTOFF = '2025-12-31';
const NEXT_HALVING_ESTIMATE = Date.parse('2028-04-13T00:00:00Z');
const PROJECTION_END = Date.parse('2040-12-01T00:00:00Z');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not find ${name} in ${ENGINE_PATH}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name} in ${ENGINE_PATH}`);
}

function loadProductionModel() {
  const source = readFileSync(ENGINE_PATH, 'utf8');
  const constants = source.match(
    /const GENESIS =[^]*?const FAIR_VALUE_PROJECTION_END_MS = Date\.UTC\(2040, 11, 1\);/,
  );
  assert.ok(constants, 'Could not load BTC risk model constants');

  const functions = [
    'buildDampedFairValuePath',
    'dampedFairValueAt',
    'structuralRiskForResidual',
    'combinedRiskForResidual',
    'buildDataset',
    'normCdf',
    'dateMs',
    'priceAtRiskForDate',
    'priceAtRiskForPoint',
    'lowerEnvelopePriceAtDate',
    'projectedRiskPriceAtDate',
    'smoothHistoricalRiskBandPriceAtDate',
  ].map(name => extractFunction(source, name));

  return new Function(
    `${constants[0]}\n${functions.join('\n')}\nreturn { buildDataset, buildDampedFairValuePath, dampedFairValueAt, priceAtRiskForDate, priceAtRiskForPoint, projectedRiskPriceAtDate, smoothHistoricalRiskBandPriceAtDate, structuralRiskForResidual, combinedRiskForResidual, lowerEnvelopePriceAtDate, dateMs };`,
  )();
}

function fixtureData() {
  return readFileSync(DATA_PATH, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map(row => {
      const [date, price] = row.split(',');
      return [date, Number(price)];
    })
    .filter(([date, price]) => date <= FIXTURE_CUTOFF && Number.isFinite(price));
}

function pointForDate(points, date) {
  const point = points.find(candidate => candidate.date === date);
  assert.ok(point, `Missing fixture point for ${date}`);
  return point;
}

function approximately(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('historical halving risk readings stay calibrated', () => {
  const { buildDataset } = loadProductionModel();
  const { pts } = buildDataset(fixtureData());
  const fixtures = {
    '2012-11-28': 0.1920494599469015,
    '2016-07-09': 0.20664905039520842,
    '2020-05-11': 0.2607545106705342,
    '2024-04-20': 0.5150876309313476,
  };

  for (const [date, expectedRisk] of Object.entries(fixtures)) {
    approximately(pointForDate(pts, date).riskCombo, expectedRisk);
  }
});

test('momentum baseline contains exactly the prior 1,460 observations', () => {
  const { buildDataset } = loadProductionModel();
  const { pts } = buildDataset(fixtureData());
  const point = pts.at(-1);
  const pointIndex = pts.length - 1;
  const priorWindow = pts.slice(pointIndex - 1460, pointIndex);
  const expectedMean = priorWindow.reduce((sum, candidate) => sum + candidate.residual, 0) / 1460;
  const expectedVariance = Math.max(
    0.0001,
    priorWindow.reduce((sum, candidate) => sum + candidate.residual ** 2, 0) / 1460 - expectedMean ** 2,
  );

  approximately(point.rollMean, expectedMean, 1e-12);
  approximately(point.rollStd, Math.sqrt(expectedVariance), 1e-12);
});

test('next-halving price-at-risk fixture remains deterministic', () => {
  const { buildDataset, priceAtRiskForDate } = loadProductionModel();
  const { pts, slope, intercept } = buildDataset(fixtureData());
  const last = pts.at(-1);
  const priceAtHalfRisk = priceAtRiskForDate(
    NEXT_HALVING_ESTIMATE,
    slope,
    intercept,
    last.rollMean,
    last.rollStd,
    0.5,
  );

  approximately(priceAtHalfRisk, 201654.91385283033, 0.01);
});

test('forecast path, tooltip lookup, and projection dates agree', () => {
  const source = readFileSync(ENGINE_PATH, 'utf8');
  const {
    buildDataset,
    buildDampedFairValuePath,
    dampedFairValueAt,
    dateMs,
  } = loadProductionModel();
  const { pts, slope } = buildDataset(fixtureData());
  const last = pts.at(-1);
  const path = buildDampedFairValuePath(
    dateMs(last.date),
    last.trendPrice,
    slope,
    PROJECTION_END,
      { marketCap: 23e12 },
  );
  const dateIndex = Math.round((NEXT_HALVING_ESTIMATE - path[0].ms) / 864e5);

  approximately(path[dateIndex].value, 250117.36277442117, 0.01);
  approximately(
    dampedFairValueAt(path, NEXT_HALVING_ESTIMATE),
    path[dateIndex].value,
    1e-9,
  );

  assert.match(source, /dampedFairValueAt\(dampedFairValuePath,\s*futureMs\)/);
  assert.match(source, /dampedFairValueAt\(dampedFairValuePath,\s*hoverMs\)/);
  assert.match(source, /for\(let i=0;i<dampedFairValuePath\.length;i\+\+\)/);

  const scenarioValues = [15e12, 23e12, 31e12].map(marketCap =>
    buildDampedFairValuePath(
      dateMs(last.date),
      last.trendPrice,
      slope,
      PROJECTION_END,
      { marketCap },
    ).at(-1).value,
  );
  assert.ok(scenarioValues[0] < scenarioValues[1]);
  assert.ok(scenarioValues[1] < scenarioValues[2]);
  assert.match(source, /data-fair-value-scenario/);
  assert.match(source, /renderFairValueProjectionTable\(\);\s*renderPriceChart\(\);/);
});

test('projected risk bands remain ordered around their independent 0.50-risk path', () => {
  const {
    buildDataset,
    buildDampedFairValuePath,
    dampedFairValueAt,
    priceAtRiskForDate,
    priceAtRiskForPoint,
    projectedRiskPriceAtDate,
    smoothHistoricalRiskBandPriceAtDate,
    dateMs,
  } = loadProductionModel();
  const { pts, slope, intercept } = buildDataset(fixtureData());
  const last = pts.at(-1);
  const currentHalfRiskPrice = priceAtRiskForDate(
    dateMs(last.date),
    slope,
    intercept,
    last.rollMean,
    last.rollStd,
    0.50,
  );
  const path = buildDampedFairValuePath(
    dateMs(last.date),
    currentHalfRiskPrice,
    slope,
    PROJECTION_END,
    { marketCap: 23e12 },
  );
  const prices = [0.20, 0.50, 0.80].map(risk =>
    projectedRiskPriceAtDate(
      PROJECTION_END,
      path,
      slope,
      intercept,
      last.rollMean,
      last.rollStd,
      risk,
    ),
  );

  assert.ok(prices[0] < prices[1]);
  assert.ok(prices[1] < prices[2]);
  approximately(prices[1], dampedFairValueAt(path, PROJECTION_END), 1e-9);
  for (const risk of [0.20, 0.50, 0.80]) {
    approximately(
      priceAtRiskForPoint(last, risk),
      priceAtRiskForDate(
        dateMs(last.date),
        slope,
        intercept,
        last.rollMean,
        last.rollStd,
        risk,
      ),
      1e-9,
    );
    approximately(
      smoothHistoricalRiskBandPriceAtDate(
        dateMs(last.date),
        dateMs(last.date),
        currentHalfRiskPrice,
        slope,
        intercept,
        last.rollMean,
        last.rollStd,
        risk,
      ),
      priceAtRiskForDate(
        dateMs(last.date),
        slope,
        intercept,
        last.rollMean,
        last.rollStd,
        risk,
      ),
      1e-9,
    );
    approximately(
      projectedRiskPriceAtDate(
        dateMs(last.date),
        path,
        slope,
        intercept,
        last.rollMean,
        last.rollStd,
        risk,
      ),
      priceAtRiskForDate(
        dateMs(last.date),
        slope,
        intercept,
        last.rollMean,
        last.rollStd,
        risk,
      ),
      1e-9,
    );
  }
  const source = readFileSync(ENGINE_PATH, 'utf8');
  assert.match(source, /projectedRiskBoundaries/);
  assert.match(source, /Fair value: \$/);
  assert.match(source, /Risk '\+point\.risk\.toFixed\(2\)/);
  assert.match(source, /if\(riskLabel\) riskLabel\.textContent=''/);
  const pageSource = readFileSync(
    resolve(ROOT, 'next-site/src/app/risk-metric/page.tsx'),
    'utf8',
  );
  assert.match(pageSource, /className="tt-risk-label"/);
  assert.doesNotMatch(source, /fillText\('RISK '/);
  assert.doesNotMatch(source, /fillText\([^\n]*FAIR VALUE/);
  assert.doesNotMatch(source, /if\(risk===0\.50\) return/);
  assert.match(source, /const currentHalfRiskPrice = priceAtRiskForDate/);
  assert.match(source, /let dampedFairValuePath = buildDampedFairValuePath\(\s*lastDateMs,\s*last\.trendPrice,\s*slope/);
  assert.match(source, /let dampedRiskCenterPath = buildDampedFairValuePath\(\s*lastDateMs,\s*currentHalfRiskPrice,\s*slope/);
  assert.match(source, /hoverMs,dampedRiskCenterPath,slope,intercept/);
  assert.doesNotMatch(source, /HISTORICAL_RISK_BAND_DAYS/);
  assert.doesNotMatch(source, /historicalBandStartIndex/);
  assert.doesNotMatch(source, /yOf\(priceAtRiskForPoint\(pts\[i\],risk\)\)/);
  assert.match(source, /smoothHistoricalRiskBandPriceAtDate/);
  assert.doesNotMatch(source, /ctx\.strokeStyle=tc\.regressionLine/);
  assert.match(source, /const PROJECTED_RISK_BOUNDARIES = RISK_ZONES\.slice/);
  assert.match(source, /const DISPLAY_RISK_BOUNDARIES = \[\.\.\.PROJECTED_RISK_BOUNDARIES\]\.reverse/);
  assert.match(source, /boundaryValues=DISPLAY_RISK_BOUNDARIES\.map/);
  assert.match(source, /Actual risk/);
  assert.match(source, /name: 'Accumulate', min: 0\.00, max: 0\.20/);
  assert.match(source, /name: 'Euphoria', min: 0\.80, max: 1\.00/);
  assert.doesNotMatch(source, /Auto-refresh BTC price every 60 seconds/);
  assert.match(source, /refreshRiskSnapshot/);
});

test('risk-price inversion reproduces the production combined score', () => {
  const {
    buildDataset,
    combinedRiskForResidual,
    priceAtRiskForPoint,
  } = loadProductionModel();
  const { pts } = buildDataset(fixtureData());
  const point = pts.at(-1);

  for (const risk of [0.01, 0.20, 0.50, 0.80, 0.99]) {
    const price = priceAtRiskForPoint(point, risk);
    const residual = Math.log10(price) - point.regLogPrice;
    approximately(
      combinedRiskForResidual(residual, point.logDays, point.rollMean, point.rollStd),
      risk,
      1e-9,
    );
  }
});
