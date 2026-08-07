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
    'buildDataset',
    'normCdf',
    'dateMs',
    'priceAtRiskForDate',
    'projectedRiskPriceAtDate',
  ].map(name => extractFunction(source, name));

  return new Function(
    `${constants[0]}\n${functions.join('\n')}\nreturn { buildDataset, buildDampedFairValuePath, dampedFairValueAt, priceAtRiskForDate, projectedRiskPriceAtDate, dateMs };`,
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
    '2012-11-28': 0.22627442366399386,
    '2016-07-09': 0.20655404166730124,
    '2020-05-11': 0.260512656493095,
    '2024-04-20': 0.5149596037232536,
  };

  for (const [date, expectedRisk] of Object.entries(fixtures)) {
    approximately(pointForDate(pts, date).riskCombo, expectedRisk);
  }
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

  approximately(priceAtHalfRisk, 201614.77652696377, 0.01);
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
    { marketCap: 20e12 },
  );
  const dateIndex = Math.round((NEXT_HALVING_ESTIMATE - path[0].ms) / 864e5);

  approximately(path[dateIndex].value, 249069.92082868578, 0.01);
  approximately(
    dampedFairValueAt(path, NEXT_HALVING_ESTIMATE),
    path[dateIndex].value,
    1e-9,
  );

  assert.match(source, /dampedFairValueAt\(dampedFairValuePath,\s*futureMs\)/);
  assert.match(source, /dampedFairValueAt\(dampedFairValuePath,\s*hoverMs\)/);
  assert.match(source, /for\(let i=0;i<dampedFairValuePath\.length;i\+\+\)/);

  const scenarioValues = [13e12, 20e12, 31e12].map(marketCap =>
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

test('projected risk bands remain ordered around the selected fair-value scenario', () => {
  const {
    buildDataset,
    buildDampedFairValuePath,
    dampedFairValueAt,
    projectedRiskPriceAtDate,
    dateMs,
  } = loadProductionModel();
  const { pts, slope, intercept } = buildDataset(fixtureData());
  const last = pts.at(-1);
  const path = buildDampedFairValuePath(
    dateMs(last.date),
    last.trendPrice,
    slope,
    PROJECTION_END,
    { marketCap: 20e12 },
  );
  const prices = [0.25, 0.50, 0.75].map(risk =>
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
  assert.match(source, /if\(risk===0\.50\) return/);
});
