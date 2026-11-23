const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../next-site/node_modules/typescript');
const moduleExports = {};
const compiled = ts.transpileModule(fs.readFileSync('next-site/src/lib/valuation-bands.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('exports', compiled)(moduleExports);
const { parseBandPrices, parseValuationAnchor, modeledEPS, buildBandModel, PE_MULTIPLES, YEAR_MS } = moduleExports;
const anchor = parseValuationAnchor({ as_of: '2026-01-01', forward_12m_eps: 400 });
const prices = parseBandPrices('date,price\n2025-01-01,500\n2026-01-01,600\n2026-02-01,650');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('EPS is anchored to the report date and compounds in either direction', () => {
  close(modeledEPS(anchor, anchor.ms, 8), 400);
  close(modeledEPS(anchor, anchor.ms + YEAR_MS, 8), 432);
  close(modeledEPS(anchor, anchor.ms - YEAR_MS, 8), 400 / 1.08);
  close(modeledEPS(anchor, anchor.ms + YEAR_MS * 2, -20), 256);
  close(modeledEPS(anchor, anchor.ms - YEAR_MS * 3, 0), 400);
  for (const growth of [NaN, Infinity, -100, -20.1, 30.1]) assert.throws(() => modeledEPS(anchor, anchor.ms, growth));
});

test('historical and projected bands connect at the latest saved price without inventing future prices', () => {
  const model = buildBandModel(prices, anchor, 8, 2);
  assert.deepEqual(model.historical.at(-1), model.projected[0]);
  assert.equal(model.historical.at(-1).ms, prices.at(-1).ms);
  assert.equal(new Date(model.end).toISOString().slice(0, 10), '2028-02-01');
  assert.equal(model.history.length, prices.length);
  assert.ok(model.projected.every(point => point.ms >= prices.at(-1).ms));
  assert.ok(model.samples.every(point => Number.isFinite(point.eps) && point.eps > 0));
  const flat = buildBandModel(prices, anchor, 0, 3);
  for (const point of flat.samples) { close(point.eps * PE_MULTIPLES[0], 4800); close(point.eps * PE_MULTIPLES.at(-1) / 10, 880); }
});

test('input validation rejects unusable anchors, unsafe links, stale price histories and unsupported horizons', () => {
  for (const value of [null, {}, { as_of: '2026-02-30', forward_12m_eps: 400 }, { as_of: '2026-01-01', forward_12m_eps: 0 }, { as_of: '2026-01-01', forward_12m_eps: '400' }]) {
    assert.throws(() => parseValuationAnchor(value));
  }
  assert.equal(parseValuationAnchor({ as_of: '2026-01-01', forward_12m_eps: 400, source_url: 'javascript:alert(1)' }).sourceUrl, null);
  assert.throws(() => buildBandModel(prices, { ...anchor, ms: Date.UTC(2026, 3, 1) }, 8, 2));
  assert.throws(() => buildBandModel(prices, anchor, 8, 100));
  assert.throws(() => parseBandPrices('<html>Not found</html>'));
});

test('price history is validated, sorted and deduplicated before drawing', () => {
  const parsed = parseBandPrices('price,date\n600,2026-01-02\n500,2026-01-01\n610,2026-01-02\n0,2026-01-03\nInfinity,2026-01-04\n700,2026-02-30');
  assert.deepEqual(parsed.map(point => [point.date, point.price]), [['2026-01-01', 500], ['2026-01-02', 610]]);
});

test('saved production data supports every exposed scenario without invalid geometry', () => {
  const savedPrices = parseBandPrices(fs.readFileSync('data_spy.csv', 'utf8'));
  const savedAnchor = parseValuationAnchor(JSON.parse(fs.readFileSync('data/spy_valuation.json', 'utf8')));
  for (const growth of [-20, 0, 8, 30]) for (const horizon of [1, 2, 3]) {
    const model = buildBandModel(savedPrices, savedAnchor, growth, horizon);
    assert.ok(model.history.length > 200);
    assert.ok(model.samples.every(point => Number.isFinite(point.eps) && point.eps > 0));
    assert.equal(model.projected.at(-1).ms, model.end);
  }
});

test('the displayed multiple range includes lower historical valuations at default growth', () => {
  const fixturePrices = parseBandPrices('date,price\n2025-01-01,600\n2025-04-08,496.48\n2026-08-13,777.88\n2026-11-20,689.81');
  const fixtureAnchor = parseValuationAnchor({ as_of: '2026-11-13', forward_12m_eps: 414.89 });
  const model = buildBandModel(fixturePrices, fixtureAnchor, 8, 2);
  for (const point of model.history) {
    const pe = point.price * 10 / modeledEPS(fixtureAnchor, point.ms, 8);
    assert.ok(pe > PE_MULTIPLES[0] && pe < PE_MULTIPLES.at(-1), `${point.date}: ${pe} is outside the displayed range`);
  }
  assert.equal(PE_MULTIPLES[0], 12);
  assert.equal(PE_MULTIPLES.at(-1), 22);
});
