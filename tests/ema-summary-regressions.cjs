const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function render(data, script) {
  const elements = {'data-date': {innerHTML: ''}, 'tab-dashboard': {innerHTML: ''}};
  let source = fs.readFileSync(script, 'utf8');
  source = source.slice(0, source.indexOf('    // === START ===')) + `
    refreshLivePrices = () => {};
    renderIndexCard = () => '';
    renderBreadthCard = () => '';
    DATA = globalThis.fixture;
    renderIndexHeader();
    renderDashboard();
  })();`;
  const context = {
    fixture: data,
    document: {getElementById: id => elements[id], addEventListener: () => {}},
    window: {addEventListener: () => {}}, setInterval: () => {}, console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {header: elements['data-date'].innerHTML, dashboard: elements['tab-dashboard'].innerHTML};
}

function fixture() {
  return {
    meta: {date: '2026-11-20', generated_at: '2026-11-20T22:00:00+00:00'},
    index_context: [{symbol: 'SPY', price: 100}], dashboard: {total: 300, signals: []},
    ai_summary: {
      model: 'gpt-5.2', generated_at: '2026-11-20T22:01:00+00:00',
      source_date: '2026-11-20', source_generated_at: '2026-11-20T22:00:00+00:00',
      market_overview: {bias: 'bullish', bias_label: 'Strongly Bullish', headline: '47% Full Bull', detail: 'Old analysis'},
      reversal_candidates: {items: []}, pullback_setups: {items: []}, risk_warnings: {items: []},
      momentum_themes: {top_names: []}, sector_analysis: {strongest: [], weakest: []},
    },
  };
}

for (const script of ['js/app.js', 'ema-scanner-engine.js', 'next-site/public/ema-scanner-engine.js']) {
  test(`${script}: stale or unverified summaries cannot render a badge or narrative`, () => {
    for (const change of [
      data => { data.ai_summary.source_date = '2026-05-21'; },
      data => { delete data.ai_summary.source_date; delete data.ai_summary.source_generated_at; },
      data => { data.ai_summary.source_generated_at = '2026-11-20T21:00:00+00:00'; },
      data => { data.meta.latest_completed_session = '2026-11-23'; },
    ]) {
      const data = fixture(); change(data);
      const view = render(data, script);
      assert.doesNotMatch(view.header, /Strongly Bullish/);
      assert.doesNotMatch(view.dashboard, /47% Full Bull|Old analysis/);
    }
  });
  test(`${script}: matching summary renders, and missing close stays explicit`, () => {
    const data = fixture();
    let view = render(data, script);
    assert.match(view.header, /Strongly Bullish/);
    assert.match(view.dashboard, /47% Full Bull/);
    data.meta.latest_completed_session = '2026-11-23';
    view = render(data, script);
    assert.match(view.header, /Equity update pending · latest close 2026-11-23/);
    assert.equal(data.meta.date, '2026-11-20');
  });
}
