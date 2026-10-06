const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const {chromium}=require('@playwright/test');
(async()=>{
 const app=express();app.use(express.static(path.resolve('next-site/out')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https:/,r=>r.abort());
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base+'/spy-risk-metric/');await page.waitForFunction(()=>document.querySelector('#dcaRiskThreshold').options.length>0);
  await page.locator('#dcaStrategyToggle [data-val="fixed"]').click();await page.locator('#dcaRunBtn').click();
  const values=await page.locator('#dcaStats .card-value').allTextContents();assert.equal(values[2],values[3],'fixed allocation equals matched benchmark');
  assert.ok(!(await page.locator('#dcaStats').innerText()).includes('units'));
  await page.locator('#dcaStrategyToggle [data-val="linear"]').click();
  await page.locator('#dcaStart').fill('2026-08-01');await page.locator('#dcaEnd').fill('2026-09-04');await page.locator('#dcaRiskThreshold').selectOption('0.1');await page.locator('#dcaRunBtn').click();
  const skipped=await page.locator('#dcaStats .card-value').allTextContents();assert.equal(skipped[0],skipped[2],'all-skipped value remains contributed cash');assert.equal(skipped[1],skipped[0],'cash retained equals contribution');
  assert.match(await page.locator('#dcaBuyNote').innerText(),/Buying 0 of/);
  assert.doesNotMatch(await page.locator('#dcaStats').innerText(),/NaN|Infinity/);
  const before=await page.locator('#dcaStats').innerText();await page.getByRole('button',{name:'Toggle color theme'}).click();assert.equal(await page.locator('#dcaStats').innerText(),before);
  const dir='audits/model-validation-2026-09-08/remediation-screenshots';fs.mkdirSync(dir,{recursive:true});await page.locator('#dcaStats').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'spy-dca-cash.png')});
  // Keep this interaction regression independent of daily market-data refreshes.
  // ABNY's liquidation must contribute no recurring income; QQQI contributes
  // 100 shares * $0.6518 monthly * 12 months = $782.16 annually.
  await page.route('**/data/dividend_data.json*',route=>route.fulfill({json:{
   meta:{generated_at:'2026-09-08T12:00:00Z'},
   tickers:{
    ABNY:{name:'ABNY',close:null,frequency:'weekly',dividend_rate:0,annualization_method:'inactive',instrument_status:{status:'liquidated'},last_payments:[{ex_date:'2026-06-18',pay_date:'2026-06-24',amount:39.4274,distribution_type:'liquidation'}]},
    QQQI:{name:'QQQI',close:56.43,frequency:'monthly',dividend_rate:7.8216,annualization_method:'latest_payment',last_payments:[{ex_date:'2026-08-19',pay_date:'2026-08-21',amount:0.6518}]},
   },
  }}));
  await page.goto(base+'/dividend-tracker/');await page.evaluate(()=>localStorage.setItem('dividend_portfolios',JSON.stringify([{name:'Validation',holdings:[{ticker:'ABNY',shares:100,costBasis:null},{ticker:'QQQI',shares:100,costBasis:50}]}])));await page.reload();await page.locator('#holdings-table').waitFor();
  assert.equal(await page.locator('#annual-income').innerText(),'$782.16');assert.match(await page.locator('#dividend-coverage').innerText(),/prices 1\/2/);assert.match(await page.locator('#holdings-table').innerText(),/Liquidated; no recurring/);await page.screenshot({path:path.join(dir,'dividend-coverage.png')});
  assert.deepEqual(errors,[]);console.log('Model browser checks passed: matched DCA, cash retention, saved theme state, and inactive dividend coverage.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
