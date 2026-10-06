const {test}=require('node:test'); const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm');
function harness(data,holdings,options={}){
 const elements={};let source=fs.readFileSync(options.script || 'js/dividends.js','utf8');
 source=source.replace('    // === BOOT ===', `renderAll = function () {}; fetchLivePrices = async function () {}; fetchDividendHistory = async function () {}; globalThis.model={rate:getAnnualDividendRate,calendar:buildCalendarEvents,renderCalendar:(y,m)=>{calYear=y;calMonth=m;renderCalendar();},summary:renderSummaryCards,apply:applyDividendHistory,holdings:()=>getHoldings(),add:addHolding,set:(d,h)=>{dividendData=d;portfolios=[{holdings:h}];}};\n    // === BOOT ===`);
 const Clock=options.today ? class extends Date {constructor(...args){super(...(args.length ? args : [options.today]));} static now(){return new Date(options.today).getTime();}} : Date;
 const ctx={Date:Clock,location:{hostname:'localhost'},setInterval:()=>{},document:{readyState:'loading',addEventListener:()=>{},getElementById:id=>elements[id] ||= {value:'',focus:()=>{}}},localStorage:{setItem:()=>{},getItem:()=>null},fetch:async()=>({ok:true,json:async()=>({payments:[]})}),console};vm.createContext(ctx);vm.runInContext(source,ctx);ctx.model.set(data,holdings);return {...ctx.model,elements};
}
test('all seven verified closed funds retain cash history but have zero recurring income',()=>{
 const d=JSON.parse(fs.readFileSync('data/dividend_data.json'));const m=harness(d,[]);
 for(const t of ['ABNY','DISO','CWII','GIF','HOII','LLII','PLTI']){assert.equal(m.rate(t),0);assert(d.tickers[t].last_payments.at(-1).amount>0);assert.equal(d.tickers[t].last_payments.at(-1).distribution_type,'liquidation');}
});
test('yield numerator and denominator include the same holdings, with visible coverage',()=>{
 const m=harness({tickers:{A:{close:100,dividend_rate:4},B:{close:100},C:{dividend_rate:1000}}},[{ticker:'A',shares:100},{ticker:'B',shares:100},{ticker:'C',shares:100}]);m.summary();assert.equal(m.elements['portfolio-yield'].textContent,'4.00%');assert.match(m.elements['dividend-coverage'].textContent,/yield uses only the 1 holdings/);
});
test('payment calendar uses payable date and sums distinct supplemental events once',()=>{
 const regular={event_id:'a',ex_date:'2026-08-31',pay_date:'2026-09-15',amount:.5};const special={...regular,event_id:'b',amount:.2,distribution_type:'SC'};
 const m=harness({tickers:{A:{frequency:'monthly',dividend_rate:6,last_payments:[regular,special,regular]}}},[{ticker:'A',shares:100}]);assert.equal(m.calendar(2026,7)['2026-08-31'],undefined);assert.equal(m.calendar(2026,8)['2026-09-15'][0].amount,70);
});
test('special payments do not become recurring run rate',()=>{
 const m=harness({tickers:{A:{frequency:'monthly',annualization_method:'latest_payment',last_payments:[{ex_date:'2026-08-01',amount:.5},{ex_date:'2026-09-01',amount:10,distribution_type:'SC'}]}}},[]);assert.equal(m.rate('A'),6);
});
test('unknown added lot invalidates combined cost basis',async()=>{
 const m=harness({tickers:{}},[{ticker:'A',shares:10,costBasis:100}]);m.elements['ticker-input']={value:'A',focus:()=>{}};m.elements['shares-input']={value:'10'};m.elements['cost-input']={value:''};
 // Provider IO and UI rendering are isolated from production lot arithmetic.
 await m.add();assert.equal(m.holdings()[0].costBasis,null);assert.equal(m.holdings()[0].shares,20);
});
test('newly classified liquidation cannot revive an old annual rate',()=>{
 const m=harness({tickers:{NEW:{frequency:'monthly',dividend_rate:200,last_payments:[{ex_date:'2026-09-01',amount:20,distribution_type:'liquidation'}]}}},[{ticker:'NEW',shares:10}]);assert.equal(m.rate('NEW'),0);assert.deepEqual(Object.keys(m.calendar(2027,0)),[]);
});
test('known payable date with unknown amount is labeled estimated',()=>{
 const m=harness({tickers:{A:{frequency:'monthly',dividend_rate:6,last_payments:[{ex_date:'2026-09-01',pay_date:'2026-09-15',amount:null}]}}},[{ticker:'A',shares:100}]);const event=m.calendar(2026,8)['2026-09-15'][0];assert.equal(event.type,'est');assert.equal(event.amount,50);
});
test('monthly estimates clamp month ends and move weekends to weekdays',()=>{
 const m=harness({tickers:{A:{frequency:'monthly',dividend_rate:12,last_payments:[{ex_date:'2026-12-20',pay_date:'2026-12-31',amount:1}]}}},[{ticker:'A',shares:1}]);
 const jan=m.calendar(2027,0), feb=m.calendar(2027,1);assert.equal(jan['2027-01-31'],undefined);assert.equal(feb['2027-02-01'][0].type,'est');
 for(const date of Object.keys(feb)){assert(![0,6].includes(new Date(date+'T00:00:00').getDay()));}
});
test('older cache and date-only fallback cannot erase published pay dates; current corrections apply',()=>{
 const d={meta:{generated_at:'2026-09-08T12:00:00Z'},tickers:{A:{last_payments:[{ex_date:'2026-09-01',pay_date:'2026-09-15',amount:.5}]}}};const m=harness(d,[]);const correction=[{ex_date:'2026-09-01',pay_date:'2026-09-16',amount:.6}];
 m.apply({A:{ts:1,source:'massive',payments:correction}});assert.equal(d.tickers.A.last_payments[0].amount,.5);
 m.apply({A:{ts:Date.parse('2026-09-09'),source:'yahoo',payments:correction}});assert.equal(d.tickers.A.last_payments[0].amount,.5);
 m.apply({A:{ts:Date.parse('2026-09-09'),source:'massive',payments:correction}});assert.equal(d.tickers.A.last_payments[0].amount,.6);
});

for (const script of ['js/dividends.js', 'dividend-tracker-engine.js', 'next-site/public/dividend-tracker-engine.js']) {
 test(`${script}: XBCI October estimate survives its projected date and month rollover`, () => {
  const data = {tickers: {XBCI: {frequency: 'monthly', annualization_method: 'latest_payment', last_payments: [
   {ex_date: '2026-09-02', pay_date: '2026-09-04', amount: 1.2488}
  ]}}};
  for (const today of ['2026-10-04T12:00:00', '2026-10-06T12:00:00', '2026-11-01T12:00:00']) {
   const m = harness(data, [{ticker: 'XBCI', shares: 2000}], {today, script});
   const events = m.calendar(2026, 9);
   assert.deepEqual(Object.keys(events), ['2026-10-05']);
   assert.equal(events['2026-10-05'][0].amount, 2497.6);
   assert.equal(events['2026-10-05'][0].type, 'est');
   assert.equal(events['2026-10-05'][0].unconfirmed, today > '2026-10-05');
   m.renderCalendar(2026, 9);
   assert.match(m.elements['dividend-calendar'].innerHTML, today > '2026-10-05' ? /XBCI \(est.; unconfirmed\)/ : /XBCI \(est.\)/);
  }
 });
 test(`${script}: published October date replaces the guess without doubling income`, () => {
  const data = {tickers: {XBCI: {frequency: 'monthly', dividend_rate: 14.9856, last_payments: [
   {ex_date: '2026-09-02', pay_date: '2026-09-04', amount: 1.2488},
   {ex_date: '2026-10-07', pay_date: '2026-10-09', amount: null}
  ]}}};
  const m = harness(data, [{ticker: 'XBCI', shares: 2000}], {today: '2026-10-06T12:00:00', script});
  let events = m.calendar(2026, 9);
  assert.deepEqual(Object.keys(events), ['2026-10-09']);
  assert.equal(events['2026-10-09'][0].type, 'est');
  assert.equal(events['2026-10-09'][0].amount, 2497.6);
  data.tickers.XBCI.last_payments[1].amount = 1.3;
  events = m.calendar(2026, 9);
  assert.deepEqual(Object.keys(events), ['2026-10-09']);
  assert.equal(events['2026-10-09'][0].type, 'pay');
  assert.equal(events['2026-10-09'][0].amount, 2600);
  assert.equal(events['2026-10-09'][0].unconfirmed, false);
 });
}
test('weekly and quarterly estimates also remain visible after their projected dates', () => {
 for (const [frequency, payDate, projected] of [['weekly', '2026-09-25', '2026-10-02'], ['quarterly', '2026-07-02', '2026-10-02']]) {
  const m = harness({tickers: {A: {frequency, dividend_rate: 12, last_payments: [{ex_date: payDate, pay_date: payDate, amount: 1}]}}}, [{ticker: 'A', shares: 1}], {today: '2026-10-06T12:00:00'});
  assert.equal(m.calendar(2026, 9)[projected][0].unconfirmed, true);
 }
});
