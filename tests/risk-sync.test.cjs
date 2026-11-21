const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('market-models.js', 'utf8');
const models = new Function(source.replaceAll('export const ', 'const ') + ';return {bitcoinSnapshot, spySnapshot};')();
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  let end = source.indexOf('{', start), depth = 1;
  for (++end; depth; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  return source.slice(start, end);
}
const rows = file => fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).map(row => {const [d,p] = row.split(','); return [d, +p];});
test('shared SPY readings equal dashboard saved and live calculations', () => {
  const dashboard = fs.readFileSync('spy-risk-engine.js', 'utf8');
  const context = {};
  vm.runInNewContext(['upperBound', 'assignTrailingPercentiles', 'buildDataset', 'riskForCurrentPrice'].map(name => extract(dashboard, name)).join('\n'), context);
  const raw = rows('data_spy.csv');
  const {pts, weekly} = context.buildDataset(raw, {});
  const last = pts.at(-1);
  assert.equal(models.spySnapshot(raw).risk, last.riskCombo);
  for (const factor of [0.7, 0.95, 1, 1.05, 1.3]) {
    const quote = {c: last.price * factor, t: last.ms / 1000 + 3600};
    assert.equal(models.spySnapshot(raw, quote).risk, context.riskForCurrentPrice(quote.c, last, weekly));
  }
  for (const quote of [{c: -1, t: last.ms / 1000}, {c: last.price * 2, t: last.ms / 1000 - 1}, {c: 500}]) {
    assert.equal(models.spySnapshot(raw, quote).risk, last.riskCombo);
  }
});
test('shared BTC readings equal dashboard calculations', () => {
  const dashboard = fs.readFileSync('btc-risk-engine.js', 'utf8');
  const constants = dashboard.match(/const GENESIS =[^]*?const FAIR_VALUE_PROJECTION_END_MS = Date.UTC\(2040, 11, 1\);/)[0];
  const context = {};
  vm.runInNewContext(constants + ['buildDataset','normCdf','structuralRiskForResidual'].map(name => extract(dashboard,name)).join('\n'), context);
  const raw = rows('data.csv');
  assert.equal(models.bitcoinSnapshot(raw).risk, context.buildDataset(raw).pts.at(-1).riskCombo);
});

test('scanner risk refresh is eligible only after weekday New York close', () => {
  const scanner = fs.readFileSync('js/app.js', 'utf8');
  const key = new Function(extract(scanner, 'riskMarketCloseKey') + '; return riskMarketCloseKey;')();
  for (const date of ['2026-11-20T20:59:00Z', '2026-11-21T22:00:00Z', '2026-11-22T22:00:00Z', '2026-07-06T19:59:00Z']) {
    assert.equal(key(new Date(date)), null);
  }
  assert.equal(key(new Date('2026-11-20T21:00:00Z')), '2026-11-20');
  assert.equal(key(new Date('2026-11-20T23:59:00Z')), '2026-11-20');
  assert.equal(key(new Date('2026-07-06T20:00:00Z')), '2026-07-06');
});
