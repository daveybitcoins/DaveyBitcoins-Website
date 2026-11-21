const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('market-models.js', 'utf8');
const snapshot = new Function(source.replaceAll('export const ', 'const ') + '; return spySnapshot;')();
const calculate = rows => snapshot(rows).risk;
test('active calendar-week price cannot change the scanner completed-week score', () => {
  const start = Date.UTC(2020,0,6);
  const rows = Array.from({length:230}, (_,i) => [new Date(start + i*7*864e5).toISOString().slice(0,10), 100 + i + 8*Math.sin(i)]);
  const baseline = calculate(rows);
  assert.ok(Number.isFinite(baseline));
  rows.at(-1)[1] = 10000;
  assert.equal(calculate(rows), baseline);
  const friday = new Date(Date.parse(rows.at(-1)[0]) + 4*864e5).toISOString().slice(0,10);
  assert.equal(calculate([...rows, [friday, 1]]), baseline);
});
