const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('spy-risk-metric.html', 'utf8');
const context = vm.createContext({});
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let i = source.indexOf('{', start), depth = 1, end = i + 1;
  while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  return source.slice(start, end);
}
vm.runInContext(['upperBound', 'assignTrailingPercentiles', 'buildDataset', 'simulateFundedDCA'].map(extract).join('\n'), context);
const rows = fs.readFileSync('data_spy.csv', 'utf8').trim().split('\n').slice(1).map(r => { const [d,p,tr] = r.split(','); return [d,+p,+tr]; });
const full = context.buildDataset(rows, {}).pts;

test('SPY historical data uses actual ETF history, consistent raw close and return index', () => {
  assert.equal(rows[0][0], '1993-01-29');
  assert.ok(Math.abs(rows[0][1] - 43.9375) < 0.00001);
  assert.equal(rows[0][2], 100);
  assert.ok(rows.every((p, i) => p[1] > 0 && p[2] > 0 && (!i || p[0] > rows[i-1][0])));
  const march = rows.find(r => r[0] === '2020-03-23');
  assert.ok(Math.abs(march[1] - 222.95) < 0.01);
  // Dividend reinvestment must increase cumulative return relative to raw prices.
  const last = rows[rows.length-1];
  assert.ok(last[2] / rows[0][2] > last[1] / rows[0][1]);
});

test('all completed and midweek historical prefixes reproduce the same signal', () => {
  for (const date of ['1996-12-03','2000-03-10','2020-03-23','2020-03-25','2020-03-27','2026-09-02','2026-09-04']) {
    const index = rows.findIndex(r => r[0] === date);
    const prefix = context.buildDataset(rows.slice(0,index+1), {}).pts.at(-1);
    assert.equal(prefix.riskCombo, full[index].riskCombo, date);
    assert.equal(prefix.ma200W, full[index].ma200W, date);
    assert.ok(prefix.signalWeekMs < prefix.ms);
  }
});

test('first 200 weeks are marked warmup, not eligible for model allocation', () => {
  assert.equal(full[0].modelWarmup, true);
  const first = full.find(p => !p.modelWarmup);
  assert.ok(first.date >= '1996-11-01');
  assert.ok(Number.isFinite(first.riskCombo));
});

function point(date, tr, priorRisk, currentRisk = 0) {
  return { date, totalReturnIndex: tr, price: 100, executionRisk: priorRisk, riskCombo: currentRisk };
}
test('equal funding and cash limits prevent borrowing; skipped cash is retained', () => {
  const p = [point('2020-01-01',100,0.9),point('2020-02-01',100,0.1),point('2020-03-01',110,0.9)];
  const r = context.simulateFundedDCA(p,[0,1,2],100,0.5,'linear');
  assert.equal(r.totalInvested,300);
  assert.equal(r.trades.length,1);
  assert.equal(r.trades[0].unitValue,100);
  assert.equal(r.trades[0].usd,200); // nominal 4x request constrained to funded cash
  assert.equal(r.cash,100);
  assert.equal(r.portfolioValue,320);
  assert.equal(r.lumpSumValue,320);
  assert.ok(r.timeline.every(p => p.cash >= 0));
});
test('execution uses prior signal, and all-skipped strategy still reports funded cash', () => {
  const r = context.simulateFundedDCA([point('2020-01-01',100,0.9,0.01),point('2020-02-01',120,0.9,0.01)],[0,1],100,0.5,'linear');
  assert.equal(r.buyCount,0);
  assert.equal(r.timeline[0].risk,0.9); // chart must show the signal actually used
  assert.equal(r.strategy,'linear');
  assert.equal(r.amount,100);
  assert.equal(r.threshold,0.5);
  assert.equal(r.portfolioValue,200);
  assert.equal(r.cash,200);
  assert.ok(Math.abs(r.lumpSumValue-220)<1e-9);
});
test('fixed DCA matches benchmark exactly and counts distributions once through return index', () => {
  const p = [point('2020-01-01',100,0),point('2020-02-01',110,0)];
  const r = context.simulateFundedDCA(p,[0],100,0.5,'fixed');
  assert.ok(Math.abs(r.portfolioValue-110)<1e-9);
  assert.equal(r.portfolioValue,r.lumpSumValue);
  assert.equal(r.cash,0);
});

test('SPY risk colors switch at the displayed band boundaries', () => {
  const scale = source.match(/const SPY_RISK_ZONES = \[[\s\S]*?\n\];/);
  assert.ok(scale, 'shared SPY display scale');
  const colors = vm.createContext({});
  vm.runInContext(scale[0] + '\n' + extract('riskZoneForScore') + '\n' + extract('riskColor'), colors);
  for (const [score, name, rgb] of [
    [0, 'Generational', '85,183,255'],
    [0.099999, 'Generational', '85,183,255'],
    [0.10, 'Accumulate', '88,214,141'],
    [0.299999, 'Accumulate', '88,214,141'],
    [0.30, 'Neutral', '179,136,255'],
    [0.499999, 'Neutral', '179,136,255'],
    [0.50, 'Elevated', '255,209,102'],
    [0.699999, 'Elevated', '255,209,102'],
    [0.70, 'Caution', '255,150,62'],
    [0.899999, 'Caution', '255,150,62'],
    [0.90, 'Euphoria', '255,98,110'],
    [1, 'Euphoria', '255,98,110'],
  ]) {
    assert.equal(colors.riskZoneForScore(score).name, name);
    assert.equal(colors.riskColor(score), `rgba(${rgb},1)`);
    assert.equal(colors.riskColor(score, 0.1), `rgba(${rgb},0.1)`);
  }
});
