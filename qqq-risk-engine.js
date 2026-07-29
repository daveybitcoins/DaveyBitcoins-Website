/* eslint-disable */
/* Generated from qqq-risk-metric.html by scripts/sync-risk-assets.mjs. */
// Restore theme before render
(function(){if(window.DaveyTheme)window.DaveyTheme.apply(window.DaveyTheme.get());})();

function themeColors() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    canvasBg: light ? '#fff9ef' : '#14130f',
    gridLine: light ? '#e3dbc8' : '#2b251a',
    gridLineMinor: light ? '#f2ecdf' : '#34332f',
    gridZero: light ? '#d6c7ad' : '#6c6558',
    axisText: light ? '#6d6a5f' : '#a59a88',
    trendLine: light ? 'rgba(184,101,11,0.52)' : 'rgba(247,147,26,0.52)',
    zoneLabels: light ? '#837765' : '#a59a88',
    zoneA: light ? 'rgba(114,192,106,0.06)' : 'rgba(114,192,106,0.07)',
    zoneB: light ? 'rgba(132,204,22,0.03)' : 'rgba(132,204,22,0.035)',
    zoneC: light ? 'rgba(247,147,26,0.04)' : 'rgba(247,147,26,0.05)',
    zoneD: light ? 'rgba(230,109,96,0.06)' : 'rgba(230,109,96,0.07)',
    zoneDash: light ? '#d6c7ad' : '#6c6558',
    barValueText: light ? '#211b12' : '#f8f2e6',
    areaGrad0: light ? 'rgba(230,109,96,0.14)' : 'rgba(230,109,96,0.18)',
    areaGrad5: light ? 'rgba(247,147,26,0.08)' : 'rgba(247,147,26,0.10)',
    areaGrad1: light ? 'rgba(114,192,106,0.04)' : 'rgba(114,192,106,0.05)',
  };
}

async function loadCSV(url) {
  const resp = await fetch(url);
  const text = await resp.text();
  const rows = text.trim().split('\n').slice(1);
  return rows.map(r => { const [d,p] = r.split(','); return [d, parseFloat(p)]; }).filter(r => !isNaN(r[1]));
}

function upperBound(values, target) {
  let lo = 0, hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function assignTrailingPercentiles(pts, valueKey, outputKey) {
  const valid = pts.filter(p => Number.isFinite(p[valueKey]));
  const coordinates = Array.from(new Set(valid.map(p => p[valueKey]))).sort((a,b) => a-b);
  const bit = new Int32Array(coordinates.length + 1);
  const add = (idx, delta) => {
    for (let i = idx + 1; i < bit.length; i += i & -i) bit[i] += delta;
  };
  const sum = idx => {
    let total = 0;
    for (let i = idx; i > 0; i -= i & -i) total += bit[i];
    return total;
  };
  const windowMs = 20 * 365.25 * 864e5;
  let left = 0;
  valid.forEach((p, i) => {
    const cutoff = p.ms - windowMs;
    while (left < i && valid[left].ms < cutoff) {
      add(upperBound(coordinates, valid[left][valueKey]) - 1, -1);
      left++;
    }
    add(upperBound(coordinates, p[valueKey]) - 1, 1);
    const count = i - left + 1;
    p[outputKey] = sum(upperBound(coordinates, p[valueKey])) / count;
  });
}

function buildDataset(rawQQQ, vixMap) {
  const pts = rawQQQ.map(([ds, price]) => ({
    date: ds,
    price,
    ms: new Date(ds + 'T00:00:00Z').getTime(),
    vix: vixMap[ds] || null
  })).filter(p => p.price > 0);

  const weekly = [];
  const weekKey = p => {
    const d = new Date(p.ms);
    const daysFromMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysFromMonday);
    return d.toISOString().slice(0,10);
  };
  let activeWeek = null;
  let activeWeeklyClose = null;
  pts.forEach(p => {
    const key = weekKey(p);
    if (activeWeek !== null && key !== activeWeek) weekly.push(activeWeeklyClose);
    activeWeek = key;
    activeWeeklyClose = { date: p.date, ms: p.ms, price: p.price };
  });
  if (activeWeeklyClose) weekly.push(activeWeeklyClose);

  let weeklySum = 0;
  weekly.forEach((p, i) => {
    weeklySum += p.price;
    if (i >= 200) weeklySum -= weekly[i - 200].price;
    if (i >= 199) {
      p.ma200W = weeklySum / 200;
      p.dev200W = Math.log(p.price / p.ma200W);
    }
  });
  assignTrailingPercentiles(weekly, 'dev200W', 'risk200W');

  let weeklyIdx = 0;
  let latestWeekly = null;
  pts.forEach(p => {
    while (weeklyIdx < weekly.length && weekly[weeklyIdx].ms <= p.ms) latestWeekly = weekly[weeklyIdx++];
    if (latestWeekly && Number.isFinite(latestWeekly.risk200W)) {
      p.ma200W = latestWeekly.ma200W;
      p.dev200W = latestWeekly.dev200W;
      p.risk200W = latestWeekly.risk200W;
      p.riskCombo = latestWeekly.risk200W;
    } else {
      p.riskCombo = 0.5;
    }
  });

  let peak = 0;
  pts.forEach(p => {
    peak = Math.max(peak, p.price);
    p.drawdown = p.price / peak - 1;
  });

  return { pts, weekly };
}

function riskColor(r, a) {
  a = a || 1;
  const stops = [[0,[104,130,156]],[0.16,[80,155,118]],[0.32,[88,197,111]],[0.48,[255,191,99]],[0.64,[247,147,26]],[0.78,[228,96,69]],[0.90,[239,93,79]],[1,[122,32,25]]];
  let lo=stops[0], hi=stops[stops.length-1];
  for (let i=0;i<stops.length-1;i++) { if(r>=stops[i][0]&&r<=stops[i+1][0]){lo=stops[i];hi=stops[i+1];break;} }
  const t=(r-lo[0])/(hi[0]-lo[0]||1);
  const c=lo[1].map((v,j)=>Math.round(v+t*(hi[1][j]-v)));
  return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';
}

function vixColor(v) {
  if (v < 15) return '#58c56f';
  if (v < 20) return '#ffbf63';
  if (v < 30) return '#f7931a';
  return '#ef5d4f';
}

// ====== FETCH LIVE PRICE VIA CLOUDFLARE WORKER ======
const WORKER_URL = 'https://daveybitcoins-api.dave-erazo78.workers.dev';
async function fetchLivePrice(rawData, symbol) {
  try {
    const resp = await fetch(WORKER_URL + '/api/quote?symbol=' + symbol);
    if (!resp.ok) throw new Error('API ' + resp.status);
    const data = await resp.json();
    if (!data.c || data.c === 0) return false;
    const price = data.c;
    const dt = new Date(data.t * 1000);
    const dateStr = dt.toISOString().slice(0, 10);
    const lastDate = rawData[rawData.length-1][0];
    if (dateStr === lastDate) {
      rawData[rawData.length-1][1] = price;
    } else if (dateStr > lastDate) {
      rawData.push([dateStr, price]);
    }
    return true;
  } catch(e) {
    return false;
  }
}

// ====== MAIN ======
async function main() {
  const bust = Date.now();
  const [rawQQQ, rawVIX] = await Promise.all([loadCSV('/data_qqq.csv?v='+bust), loadCSV('/data_vix.csv?v='+bust)]);

  // Fetch live price via Cloudflare Worker proxy
  const live = await fetchLivePrice(rawQQQ, 'QQQ');

  // Build VIX lookup map (carry forward last known value for live-price dates)
  const vixMap = {};
  rawVIX.forEach(([d, p]) => { vixMap[d] = p; });
  const lastVixDate = rawVIX[rawVIX.length - 1];
  const lastQqqDate = rawQQQ[rawQQQ.length - 1][0];
  if (lastVixDate && lastQqqDate > lastVixDate[0] && !vixMap[lastQqqDate]) {
    vixMap[lastQqqDate] = lastVixDate[1];
  }

  const { pts, weekly } = buildDataset(rawQQQ, vixMap);
  const n = pts.length;
  const last = pts[n-1];

  // Dashboard
  document.getElementById('vPrice').textContent = '$' + last.price.toLocaleString(undefined,{maximumFractionDigits:2});
  const hd = document.getElementById('headerDate');
  hd.innerHTML = '<span style="width:6px;height:6px;background:#58c56f;border-radius:50%;flex-shrink:0;animation:pulse 2s infinite;display:inline-block"></span> as of ' + last.date + (live ? ' · live' : '');
  const riskValue = document.getElementById('vRisk');
  riskValue.textContent = last.riskCombo.toFixed(3);
  riskValue.dataset.risk200w = last.risk200W.toFixed(3);
  riskValue.dataset.model = '200W trailing-20-year weekly percentile';
  riskValue.style.setProperty('--val-color', riskColor(last.riskCombo));
  document.getElementById('vFair').textContent = '$' + last.ma200W.toLocaleString(undefined,{maximumFractionDigits:2});
  document.getElementById('vGrowth').textContent = 'Trailing 20Y weekly percentile';
  const devPct = ((last.price/last.ma200W-1)*100).toFixed(1);
  document.getElementById('vDev').textContent = (devPct>0?'+':'') + devPct + '%';
  document.getElementById('needle').style.left = (last.riskCombo*100)+'%';
  // VIX card with implied daily move (Rule of 16)
  if (last.vix != null) {
    const vixEl = document.getElementById('vVixLevel');
    vixEl.textContent = last.vix.toFixed(1);
    vixEl.style.setProperty('--val-color', vixColor(last.vix));
    const impliedPct = (last.vix / 16).toFixed(2);
    const impliedPts = (last.price * last.vix / 16 / 100).toFixed(0);
    const vc = vixColor(last.vix);
    document.getElementById('vVixImplied').innerHTML = '<div style="color:var(--text-dim);font-size:0.6rem;letter-spacing:1px;margin-bottom:2px">IMPLIED MOVE</div><span style="font-family:JetBrains Mono,monospace;color:var(--text-heading);font-weight:400;font-size:0.75rem">&#177;' + impliedPct + '%</span> <span style="color:var(--text-dim);font-size:0.6rem">/</span> <span style="font-family:JetBrains Mono,monospace;color:var(--text-heading);font-weight:400;font-size:0.75rem">&#177;$' + impliedPts + '</span>';
  }

  // 200W risk-price table. Invert the current trailing weekly empirical
  // distribution rather than interpolating between all-time extremes.
  {
    const cutoff = last.ms - 20 * 365.25 * 864e5;
    const recentWeekly = weekly.filter(p => p.ms >= cutoff);
    const deviations200W = recentWeekly.map(p => p.dev200W).filter(Number.isFinite).sort((a,b) => a-b);
    const percentile = (values, value) => upperBound(values, value) / values.length;
    const riskAtPrice = price => percentile(deviations200W, Math.log(price / last.ma200W));
    const priceAtRisk = target => {
      let lo = last.ma200W * 0.15;
      let hi = last.ma200W * 4;
      for (let i = 0; i < 64; i++) {
        const mid = Math.sqrt(lo * hi);
        if (riskAtPrice(mid) < target) lo = mid; else hi = mid;
      }
      return Math.sqrt(lo * hi);
    };
    const tbl = document.getElementById('riskTable');
    tbl.dataset.model = '200w-trailing20y-weekly';
    const riskLevels = [0.10,0.20,0.30,0.40,0.50,0.60,0.70,0.80,0.90,1.00];
    riskLevels.forEach(r => {
      const price = priceAtRisk(r);
      const cell = document.createElement('div');
      cell.className = 'risk-cell';
      const pStr = price >= 1e4 ? '$'+Math.round(price).toLocaleString() : '$'+price.toFixed(2);
      const pctMove = ((price / last.price - 1) * 100).toFixed(1);
      const pctStr = pctMove >= 0 ? '+'+pctMove+'%' : pctMove+'%';
      const pctColor = pctMove >= 0 ? '#58c56f' : '#ef5d4f';
      cell.innerHTML='<div class="rc-risk" style="color:'+riskColor(r)+'">'+r.toFixed(2)+'</div><div class="rc-price">'+pStr+'</div><div style="font-size:0.62rem;margin-top:2px;color:'+pctColor+';letter-spacing:0.3px">'+pctStr+'</div>';
      tbl.appendChild(cell);
    });
  }

  // Historical Market Bottoms
  {
    const BOTTOMS = [
      { date: "2001-09-20", event: "9/11 Attacks (Peak Fear)", peak: true, vixHigh: 43.8, info: "Terrorist attacks on World Trade Center and Pentagon. Markets closed for 4 days. Tech-heavy Nasdaq was already reeling from the dot-com bust." },
      { date: "2002-10-09", event: "Dot-com Bust", vixHigh: 42.6, info: "Nasdaq fell 78% from its 2000 peak. QQQ lost over 80% of its value. Enron, WorldCom scandals destroyed confidence." },
      { date: "2008-11-20", event: "GFC (Peak Fear)", peak: true, vixHigh: 81.5, info: "Lehman Brothers collapsed, AIG bailout, credit markets froze. Banks faced insolvency. VIX hit all-time intraday high of 89.5." },
      { date: "2009-03-09", event: "Global Financial Crisis", vixHigh: 51.3, info: "QQQ bottomed down ~54% from 2007 highs. Fed launched QE, TARP stabilized banks. Generational buying opportunity for tech." },
      { date: "2011-08-08", event: "US Downgrade (Peak Fear)", peak: true, vixHigh: 48.0, info: "S&P downgraded US debt from AAA for the first time. European sovereign debt crisis spreading. Markets fell 17% in 3 weeks." },
      { date: "2011-10-03", event: "European Debt Crisis", vixHigh: 45.6, info: "Greece, Portugal, Ireland bailouts. Fear of eurozone breakup. ECB's Draghi 'whatever it takes' speech eventually calmed markets." },
      { date: "2015-08-24", event: "China Devaluation (Peak Fear)", peak: true, vixHigh: 53.3, info: "China devalued the yuan, sparking fears of global slowdown. Dow fell 1,000 points at the open. Flash crash in ETFs." },
      { date: "2018-02-05", event: "Volmageddon (Peak Fear)", peak: true, vixHigh: 38.8, info: "XIV (inverse VIX ETN) blew up, losing 96% in a day. VIX doubled in hours. Short-volatility trade unwound violently." },
      { date: "2018-12-24", event: "Fed Tightening Panic", vixHigh: 36.1, info: "Fed raised rates 4 times in 2018 despite slowing growth. QQQ fell ~23% in Q4. Christmas Eve marked the exact bottom." },
      { date: "2020-03-16", event: "COVID-19 (Peak Fear)", peak: true, vixHigh: 83.6, info: "Global pandemic lockdowns. Circuit breakers triggered multiple times. VIX hit 83.6 intraday. Fed cut rates to zero." },
      { date: "2020-03-23", event: "COVID-19 Crash", vixHigh: 76.7, info: "QQQ bottomed down ~28% from highs. Fed launched unlimited QE, Congress passed $2T stimulus. Tech led the fastest recovery in history." },
      { date: "2022-10-12", event: "Fed Hiking Cycle", vixHigh: 34.5, info: "Fed raised rates from 0% to 5.25% in 18 months — fastest tightening in 40 years. QQQ fell ~37% as growth-to-value rotation hit tech hardest." },
      { date: "2024-08-05", event: "Yen Carry Trade (Peak Fear)", peak: true, vixHigh: 65.7, info: "Bank of Japan rate hike triggered massive yen carry trade unwind. Global equity selloff, Nikkei fell 12% in a day." },
      { date: "2025-04-08", event: "Tariff Fears (Peak Fear)", peak: true, vixHigh: 57.5, info: "Escalating US-China tariffs and trade war fears. Tech sector hit hard on semiconductor export restrictions and supply chain uncertainty." },
      { date: "2026-03-27", event: "US-Iran War (Peak Fear)", peak: true, vixHigh: 31.1, info: "US-Israel strikes on Iran and a prolonged Strait of Hormuz disruption pushed oil above $100, reviving inflation and growth fears. Tech sold off as the VIX closed at 31.05." },
    ];

    const tbody = document.getElementById('riskLowsBody');
    BOTTOMS.forEach(b => {
      // Find closest date in data
      let idx = pts.findIndex(p => p.date >= b.date);
      if (idx < 0) idx = n - 1;
      const low = pts[idx];
      const tr = document.createElement('tr');
      const pStr = '$' + low.price.toLocaleString(undefined, { maximumFractionDigits: 2 });
      function fwdCell(fromIdx, years) {
        var days = years * 365;
        var fIdx = Math.min(fromIdx + days, n - 1);
        if (fIdx - fromIdx < days * 0.75) return '<td class="rl-return" style="color:var(--text-dimmer)">—</td>';
        var ret = ((pts[fIdx].price / pts[fromIdx].price - 1) * 100);
        var col = ret >= 0 ? '#58c56f' : '#ef5d4f';
        return '<td class="rl-return" style="color:' + col + '">' + (ret >= 0 ? '+' : '') + Math.round(ret) + '%</td>';
      }
      const vixNum = b.vixHigh != null ? b.vixHigh : low.vix;
      const vixVal = vixNum != null ? '<span style="color:' + vixColor(vixNum) + '">' + vixNum.toFixed(1) + '</span>' : '<span style="color:var(--text-dimmer)">N/A</span>';
      const infoHtml = b.info ? '<span class="info-btn">i<span class="info-popup">' + b.info + '</span></span>' : '';
      tr.innerHTML = '<td>' + low.date + '</td>' +
        '<td class="rl-event">' + b.event + infoHtml + '</td>' +
        '<td class="rl-price">' + pStr + '</td>' +
        (Number.isFinite(low.risk200W)
          ? '<td class="rl-risk" style="color:' + riskColor(low.riskCombo) + '">' + low.riskCombo.toFixed(3) + '</td>'
          : '<td class="rl-risk" style="color:var(--text-dimmer)">—</td>') +
        '<td>' + vixVal + '</td>' +
        fwdCell(idx, 1) + fwdCell(idx, 2) + fwdCell(idx, 3);
      tbody.appendChild(tr);
    });
  }

  // Zoom/pan state
  const comparisonStartIdx = Math.max(0, pts.findIndex(p => Number.isFinite(p.risk200W) && p.vix != null));
  const view = { startIdx: 0, endIdx: n-1 };
  (function restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from'), to = params.get('to');
    if (from) { const idx = pts.findIndex(p => p.date >= from); if (idx >= 0) view.startIdx = idx; }
    if (to) { for (let i = pts.length - 1; i >= 0; i--) { if (pts[i].date <= to) { view.endIdx = i; break; } } }
    if (view.endIdx - view.startIdx < 60) { view.startIdx = 0; view.endIdx = n - 1; }
  })();

  function syncURL() {
    const params = new URLSearchParams(window.location.search);
    const s = Math.max(0, Math.floor(view.startIdx)), e = Math.min(n - 1, Math.ceil(view.endIdx));
    if (s === 0 && e === n - 1) { params.delete('from'); params.delete('to'); }
    else { params.set('from', pts[s].date); params.set('to', pts[e].date); }
    const qs = params.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function getVisibleRange() { return { s: Math.max(0, Math.floor(view.startIdx)), e: Math.min(n-1, Math.ceil(view.endIdx)) }; }
  function visibleSample() { const { s, e } = getVisibleRange(); return Math.max(1, Math.floor((e - s) / 1500)); }
  function getComparisonRange() {
    const { s, e } = getVisibleRange();
    return { s: Math.max(s, comparisonStartIdx), e };
  }
  function sampleForRange(s, e) { return Math.max(1, Math.floor((e - s) / 1500)); }
  function shadeDrawdowns(ctx, xOf, top, bottom, s, e) {
    const rawBands = [];
    let start = null, worst = 0;
    for (let i = s; i <= e; i++) {
      if (pts[i].drawdown <= -0.10) {
        if (start == null) start = i;
        worst = Math.min(worst, pts[i].drawdown);
      } else if (start != null) {
        rawBands.push({ start, end: i, worst });
        start = null; worst = 0;
      }
    }
    if (start != null) rawBands.push({ start, end: e, worst });

    const merged = [];
    rawBands.forEach(band => {
      const prior = merged[merged.length - 1];
      if (prior && band.start - prior.end <= 63) {
        prior.end = band.end;
        prior.worst = Math.min(prior.worst, band.worst);
      } else {
        merged.push({ ...band });
      }
    });
    merged.forEach(band => {
      const color = band.worst <= -0.20 ? 'rgba(239,93,79,0.12)' : 'rgba(247,147,26,0.075)';
      const left = xOf(band.start), right = xOf(Math.max(band.start + 1, band.end));
      ctx.fillStyle = color;
      ctx.fillRect(left, top, Math.max(1, right - left), bottom - top);
    });
    return merged.length;
  }

  // Price chart
  function renderPriceChart() {
    const tc = themeColors();
    const cv=document.getElementById('priceCanvas'), ctx=cv.getContext('2d');
    const W=cv.width, H=cv.height;
    const P={t:24,r:60,b:48,l:80};
    const cw=W-P.l-P.r, ch=H-P.t-P.b;
    const { s, e } = getVisibleRange();
    const S = visibleSample();
    ctx.fillStyle=tc.canvasBg; ctx.fillRect(0,0,W,H);
    const xOf=i=>P.l+((i-s)/(e-s))*cw;
    const visPrices = pts.slice(s,e+1).map(p=>p.price);
    const minE=Math.floor(Math.log10(Math.min(...visPrices)));
    const maxE=Math.ceil(Math.log10(Math.max(...visPrices)));
    const yOf=p=>{const lp=Math.log10(p);return P.t+ch-((lp-minE)/(maxE-minE))*ch;};
    // Price grid
    ctx.textAlign='right'; ctx.font='10px JetBrains Mono';
    for(let e2=minE;e2<=maxE;e2++){
      const y=yOf(Math.pow(10,e2));
      ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);ctx.stroke();
      if(e2<maxE){const y3=yOf(3*Math.pow(10,e2));ctx.strokeStyle=tc.gridLineMinor;ctx.beginPath();ctx.moveTo(P.l,y3);ctx.lineTo(W-P.r,y3);ctx.stroke();}
      ctx.fillStyle=tc.axisText;
      const val=Math.pow(10,e2);
      ctx.fillText(val>=1000?'$'+val.toLocaleString():val>=1?'$'+val:'$'+val.toFixed(2),P.l-8,y+3);
    }
    // Year grid — 5-year ticks when zoomed out
    const seenYr=new Set(); ctx.textAlign='center';
    const span=e-s;
    const yrInterval=span>5000?5:span>1500?2:1;
    const showMonth=span<1500;
    for(let i=s;i<=e;i+=S){
      const yr=+pts[i].date.slice(0,4);
      const mo=+pts[i].date.slice(5,7);
      const key = showMonth ? pts[i].date.slice(0,7) : ''+yr;
      if(!seenYr.has(key)){
        const show=showMonth?(mo%3===1):(yr%yrInterval===0);
        if(show){
          seenYr.add(key);const x=xOf(i);
          ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,P.t);ctx.lineTo(x,H-P.b);ctx.stroke();
          ctx.fillStyle=tc.axisText;ctx.font='10px JetBrains Mono';
          ctx.fillText(showMonth?pts[i].date.slice(0,7):yr,x,H-P.b+18);
        }
      }
    }
    // 200-week moving-average trend
    ctx.strokeStyle=tc.trendLine;ctx.lineWidth=1.5;ctx.setLineDash([8,5]);
    ctx.beginPath();
    let trendStarted = false;
    for(let i=s;i<=e;i+=S){
      if (!Number.isFinite(pts[i].ma200W)) continue;
      const x=xOf(i),y=yOf(pts[i].ma200W);
      trendStarted ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
      trendStarted = true;
    }
    ctx.stroke();ctx.setLineDash([]);
    // Price line colored by risk
    for(let i=s+S;i<=e;i+=S){
      const prev=Math.max(s,i-S);
      ctx.strokeStyle=riskColor(pts[i].riskCombo);ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(xOf(prev),yOf(pts[prev].price));ctx.lineTo(xOf(i),yOf(pts[i].price));ctx.stroke();
    }
  }

  // Risk oscillator chart
  function renderRiskChart() {
    const tc = themeColors();
    const cv=document.getElementById('riskCanvas'), ctx=cv.getContext('2d');
    const W=cv.width, H=cv.height;
    const P={t:16,r:76,b:48,l:80};
    const cw=W-P.l-P.r, ch=H-P.t-P.b;
    const { s, e } = getComparisonRange();
    const S = sampleForRange(s, e);
    ctx.fillStyle=tc.canvasBg; ctx.fillRect(0,0,W,H);
    if (s >= e) return;
    const xOf=i=>P.l+((i-s)/(e-s))*cw;
    const yOf=r=>P.t+ch*(1-r);
    // Zone fills
    [[0,0.20,tc.zoneA],[0.20,0.50,tc.zoneB],[0.50,0.80,tc.zoneC],[0.80,1,tc.zoneD]].forEach(([lo,hi,c])=>{
      ctx.fillStyle=c;ctx.fillRect(P.l,yOf(hi),cw,yOf(lo)-yOf(hi));
    });
    const riskDrawdownBands = shadeDrawdowns(ctx, xOf, P.t, H-P.b, s, e);
    cv.dataset.comparisonStart = pts[s].date;
    cv.dataset.drawdownBands = String(riskDrawdownBands);
    cv.dataset.model = '200W trailing-20-year weekly percentile';
    [0.20,0.50,0.80].forEach(v=>{
      ctx.strokeStyle=tc.zoneDash;ctx.lineWidth=1;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(P.l,yOf(v));ctx.lineTo(W-P.r,yOf(v));ctx.stroke();ctx.setLineDash([]);
    });
    ctx.textAlign='right';ctx.font='10px JetBrains Mono';
    [0,0.25,0.5,0.75,1.0].forEach(v=>{
      const y=yOf(v);ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);ctx.stroke();
      ctx.fillStyle=tc.axisText;ctx.fillText(v.toFixed(2),P.l-8,y+3);
    });
    // Year grid — 5-year ticks when zoomed out
    const seenYr=new Set();ctx.textAlign='center';
    const span=e-s;
    const yrInterval=span>5000?5:span>1500?2:1;
    const showMonth=span<1500;
    for(let i=s;i<=e;i+=S){
      const yr=+pts[i].date.slice(0,4);const mo=+pts[i].date.slice(5,7);
      const key=showMonth?pts[i].date.slice(0,7):''+yr;
      if(!seenYr.has(key)){
        const show=showMonth?(mo%3===1):(yr%yrInterval===0);
        if(show){seenYr.add(key);ctx.strokeStyle=tc.gridLine;
        ctx.beginPath();ctx.moveTo(xOf(i),P.t);ctx.lineTo(xOf(i),H-P.b);ctx.stroke();
        ctx.fillStyle=tc.axisText;ctx.font='10px JetBrains Mono';ctx.fillText(showMonth?pts[i].date.slice(0,7):yr,xOf(i),H-P.b+18);}
      }
    }
    // Area fill
    ctx.beginPath();ctx.moveTo(xOf(s),yOf(0));
    for(let i=s;i<=e;i+=S) ctx.lineTo(xOf(i),yOf(pts[i].riskCombo));
    ctx.lineTo(xOf(e),yOf(0));ctx.closePath();
    const grd=ctx.createLinearGradient(0,yOf(1),0,yOf(0));
    grd.addColorStop(0,tc.areaGrad0);grd.addColorStop(0.5,tc.areaGrad5);grd.addColorStop(1,tc.areaGrad1);
    ctx.fillStyle=grd;ctx.fill();
    // Combined line
    for(let i=s+S;i<=e;i+=S){
      const prev=Math.max(s,i-S);
      ctx.strokeStyle=riskColor(pts[i].riskCombo,0.90);ctx.lineWidth=1.8;
      ctx.beginPath();ctx.moveTo(xOf(prev),yOf(pts[prev].riskCombo));ctx.lineTo(xOf(i),yOf(pts[i].riskCombo));ctx.stroke();
    }
    // Zone labels
    ctx.fillStyle=tc.zoneLabels;ctx.font='9px JetBrains Mono';ctx.textAlign='right';
    ctx.fillText('EUPHORIA',W-P.r-4,yOf(0.90));
    ctx.fillText('ELEVATED',W-P.r-4,yOf(0.65));
    ctx.fillText('NEUTRAL',W-P.r-4,yOf(0.35));
    ctx.fillText('ACCUMULATE',W-P.r-4,yOf(0.10));
  }

  // VIX chart
  function renderVixChart() {
    const tc = themeColors();
    const cv=document.getElementById('vixCanvas'), ctx=cv.getContext('2d');
    const W=cv.width, H=cv.height;
    const P={t:16,r:60,b:48,l:80};
    const cw=W-P.l-P.r, ch=H-P.t-P.b;
    let { s, e } = getComparisonRange();
    if (s >= e) { ctx.fillStyle=themeColors().canvasBg; ctx.fillRect(0,0,W,H); return; }
    const S = sampleForRange(s, e);
    ctx.fillStyle=tc.canvasBg; ctx.fillRect(0,0,W,H);
    const xOf=i=>P.l+((i-s)/(e-s))*cw;
    // Find visible VIX range
    let maxVix = 0;
    for (let i=s;i<=e;i++) { if (pts[i].vix != null && pts[i].vix > maxVix) maxVix = pts[i].vix; }
    maxVix = Math.max(40, Math.ceil(maxVix / 10) * 10);
    const yOf=v=>P.t+ch*(1-v/maxVix);
    // VIX zone fills
    const zones = [[0,15,'rgba(16,185,129,0.06)'],[15,20,'rgba(234,179,8,0.06)'],[20,30,'rgba(249,115,22,0.06)'],[30,maxVix,'rgba(239,68,68,0.06)']];
    zones.forEach(([lo,hi,c])=>{
      const y1=yOf(Math.min(hi,maxVix)),y2=yOf(lo);
      if(y2>y1){ctx.fillStyle=c;ctx.fillRect(P.l,y1,cw,y2-y1);}
    });
    const vixDrawdownBands = shadeDrawdowns(ctx, xOf, P.t, H-P.b, s, e);
    cv.dataset.comparisonStart = pts[s].date;
    cv.dataset.drawdownBands = String(vixDrawdownBands);
    // Grid
    ctx.textAlign='right';ctx.font='10px JetBrains Mono';
    for(let v=0;v<=maxVix;v+=10){
      const y=yOf(v);ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);ctx.stroke();
      ctx.fillStyle=tc.axisText;ctx.fillText(v,P.l-8,y+3);
    }
    // Zone thresholds
    [15,20,30].forEach(v=>{
      if(v<=maxVix){ctx.strokeStyle=tc.zoneDash;ctx.lineWidth=1;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(P.l,yOf(v));ctx.lineTo(W-P.r,yOf(v));ctx.stroke();ctx.setLineDash([]);}
    });
    // Year grid — 5-year ticks when zoomed out
    const seenYr=new Set();ctx.textAlign='center';
    const vSpan=e-s;
    const vYrInterval=vSpan>5000?5:vSpan>1500?2:1;
    const vShowMonth=vSpan<1500;
    for(let i=s;i<=e;i+=S){
      const yr=+pts[i].date.slice(0,4);const mo=+pts[i].date.slice(5,7);
      const key=vShowMonth?pts[i].date.slice(0,7):''+yr;
      if(!seenYr.has(key)){
        const show=vShowMonth?(mo%3===1):(yr%vYrInterval===0);
        if(show){seenYr.add(key);ctx.strokeStyle=tc.gridLine;
        ctx.beginPath();ctx.moveTo(xOf(i),P.t);ctx.lineTo(xOf(i),H-P.b);ctx.stroke();
        ctx.fillStyle=tc.axisText;ctx.font='10px JetBrains Mono';ctx.fillText(vShowMonth?pts[i].date.slice(0,7):yr,xOf(i),H-P.b+18);}
      }
    }
    // VIX line colored by zone
    for(let i=s+S;i<=e;i+=S){
      const prev=Math.max(s,i-S);
      if(pts[i].vix==null||pts[prev].vix==null) continue;
      ctx.strokeStyle=vixColor(pts[i].vix);ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(xOf(prev),yOf(pts[prev].vix));ctx.lineTo(xOf(i),yOf(pts[i].vix));ctx.stroke();
    }
    // Zone labels
    ctx.fillStyle=tc.zoneLabels;ctx.font='9px JetBrains Mono';ctx.textAlign='right';
    ctx.fillText('EXTREME',W-P.r-4,yOf(Math.min(maxVix-2,35)));
    ctx.fillText('ELEVATED',W-P.r-4,yOf(25));
    ctx.fillText('NORMAL',W-P.r-4,yOf(17.5));
    ctx.fillText('LOW FEAR',W-P.r-4,yOf(7.5));
  }

  function renderAll() { renderPriceChart(); renderRiskChart(); renderVixChart(); syncURL(); }

  // Zoom/pan
  function attachZoomPan(canvasId, tipId) {
    const cv = document.getElementById(canvasId);
    const W = cv.width;
    const P = { l:80, r: canvasId === 'priceCanvas' ? 60 : canvasId === 'vixCanvas' ? 60 : 76 };
    const cw = W - P.l - P.r;
    let brushing = false, brushStartX = 0;
    const panel = cv.closest('.chart-panel');
    const overlay = document.createElement('div');
    overlay.className = 'brush-overlay';
    panel.appendChild(overlay);
    function mouseIdxFromEvent(e) {
      const rect = cv.getBoundingClientRect();const scaleX = W / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      let { s, e: end } = (canvasId === 'riskCanvas' || canvasId === 'vixCanvas') ? getComparisonRange() : getVisibleRange();
      return Math.round(s + (mx - P.l) / cw * (end - s));
    }
    function canvasXToPercent(canvasX) { return Math.max(0, Math.min(100, (canvasX / W) * 100)); }
    cv.addEventListener('wheel', e => {
      e.preventDefault();const { s, e: end } = getVisibleRange();const range = end - s;
      const mouseIdx = mouseIdxFromEvent(e);const mouseRatio = (mouseIdx - s) / range;
      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
      const newRange = Math.max(60, Math.min(n-1, range * zoomFactor));
      view.startIdx = Math.max(0, mouseIdx - mouseRatio * newRange);
      view.endIdx = Math.min(n-1, mouseIdx + (1 - mouseRatio) * newRange);
      if (view.endIdx - view.startIdx < 60) return;
      renderAll();
    }, { passive: false });
    cv.addEventListener('mousedown', e => {
      brushing = true;const rect = cv.getBoundingClientRect();brushStartX = e.clientX - rect.left;
      const scaleX = W / rect.width;const pct = canvasXToPercent(brushStartX * scaleX);
      overlay.style.left = pct + '%';overlay.style.width = '0%';overlay.style.display = 'block';
    });
    window.addEventListener('mousemove', e => {
      if (!document.querySelector('[data-risk-dashboard="qqq"]')) return;
      if (!brushing) return;const rect = cv.getBoundingClientRect();const scaleX = W / rect.width;
      const currentX = e.clientX - rect.left;
      const left = Math.max(P.l, Math.min(brushStartX * scaleX, currentX * scaleX));
      const right = Math.min(W - P.r, Math.max(brushStartX * scaleX, currentX * scaleX));
      overlay.style.left = canvasXToPercent(left) + '%';overlay.style.width = canvasXToPercent(right - left) + '%';
    });
    window.addEventListener('mouseup', e => {
      if (!brushing) return;brushing = false;overlay.style.display = 'none';
      const rect = cv.getBoundingClientRect();const scaleX = W / rect.width;
      const currentX = e.clientX - rect.left;
      const left = Math.max(P.l, Math.min(brushStartX * scaleX, currentX * scaleX));
      const right = Math.min(W - P.r, Math.max(brushStartX * scaleX, currentX * scaleX));
      if (right - left < 20) return;
      const { s, e: end } = getVisibleRange();const range = end - s;
      const newS = s + ((left - P.l) / cw) * range;const newE = s + ((right - P.l) / cw) * range;
      if (newE - newS < 60) return;
      view.startIdx = Math.max(0, newS);view.endIdx = Math.min(n-1, newE);renderAll();
    });
    cv.style.cursor = 'crosshair';
    // Tooltip
    const tip = document.getElementById(tipId);
    cv.addEventListener('mousemove', e => {
      if (!document.querySelector('[data-risk-dashboard="qqq"]')) return;
      if (brushing) { tip.style.display='none'; return; }
      const idx = mouseIdxFromEvent(e);
      if (idx < 0 || idx >= n) { tip.style.display='none'; return; }
      const p = pts[idx];
      tip.querySelector('.tt-date').textContent = p.date;
      if (tip.querySelector('.tt-price')) tip.querySelector('.tt-price').textContent = '$' + p.price.toLocaleString(undefined,{maximumFractionDigits:2});
      const riskEl = tip.querySelector('.tt-risk');
      if (tipId === 'riskTip') riskEl.textContent = p.riskCombo.toFixed(3);
      else if (tipId === 'vixTip') riskEl.textContent = (p.vix != null ? p.vix.toFixed(2) : '—');
      else riskEl.textContent = p.riskCombo.toFixed(3);
      riskEl.style.color = tipId === 'vixTip' ? (p.vix != null ? vixColor(p.vix) : '') : riskColor(p.riskCombo);
      tip.style.display = 'block';
      const rect = cv.getBoundingClientRect();
      const tipX = e.clientX - rect.left + 16;const tipY = e.clientY - rect.top - 10;
      tip.style.left = (tipX + tip.offsetWidth > rect.width ? tipX - tip.offsetWidth - 32 : tipX) + 'px';
      tip.style.top = Math.max(0, tipY) + 'px';
    });
    cv.addEventListener('mouseleave', () => tip.style.display='none');
  }

  function addZoomButtons() {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;justify-content:center;gap:8px;margin:12px 0 4px;flex-wrap:wrap;';
    [['1Y',365],['2Y',730],['5Y',1825],['10Y',3650],['All',n],['Reset',-1]].forEach(([label,days])=>{
      const b = document.createElement('button');b.textContent=label;b.className='zoom-btn';
      b.addEventListener('click',()=>{
        if(days===-1||days>=n){view.startIdx=0;view.endIdx=n-1;}
        else{view.startIdx=Math.max(0,n-1-days);view.endIdx=n-1;}
        renderAll();
      });
      bar.appendChild(b);
    });
    document.getElementById('legendBar').parentNode.insertBefore(bar, document.getElementById('legendBar').nextSibling);
  }

  // Init
  renderAll();
  attachZoomPan('priceCanvas', 'priceTip');
  attachZoomPan('riskCanvas', 'riskTip');
  attachZoomPan('vixCanvas', 'vixTip');
  addZoomButtons();

  // ====== DCA SIMULATOR ======
  (function(){
    const ASSET = 'QQQ';
    let dcaResults = null;
    let dcaStrategy = 'linear';
    let dcaScale = 'lin';

    const threshSel = document.getElementById('dcaRiskThreshold');
    for (let i = 1; i <= 10; i++) {
      const lo = ((i-1)/10).toFixed(1), hi = (i/10).toFixed(1);
      const opt = document.createElement('option');
      opt.value = (i/10).toString();
      opt.textContent = lo + ' – ' + hi;
      if (i === 5) opt.selected = true;
      threshSel.appendChild(opt);
    }
    const alwaysOpt = document.createElement('option');
    alwaysOpt.value = '1.01'; alwaysOpt.textContent = 'Always Buy';
    threshSel.appendChild(alwaysOpt);

    const defaultAgo = new Date();
    defaultAgo.setFullYear(defaultAgo.getFullYear() - 10);
    const defaultStr = defaultAgo.toISOString().slice(0,10);
    document.getElementById('dcaStart').value = pts[0].date > defaultStr ? pts[0].date : defaultStr;
    document.getElementById('dcaEnd').value = last.date;

    function wireToggle(groupId, cb) {
      const btns = document.querySelectorAll('#'+groupId+' .zoom-btn');
      btns.forEach(function(b) {
        b.addEventListener('click', function(){
          btns.forEach(function(x){ x.classList.remove('active'); });
          b.classList.add('active');
          cb(b.dataset.val);
        });
      });
    }
    wireToggle('dcaStrategyToggle', function(v){
      dcaStrategy = v;
      var sel = document.getElementById('dcaRiskThreshold');
      sel.disabled = (v === 'fixed');
      sel.style.opacity = (v === 'fixed') ? '0.35' : '1';
    });
    wireToggle('dcaScaleToggle', function(v){
      dcaScale = v;
      if (dcaResults) renderDCAPortfolioChart(dcaResults);
    });

    document.getElementById('dcaRunBtn').addEventListener('click', function(){
      dcaResults = runDCASimulation();
      if (!dcaResults) return;
      document.getElementById('dcaStats').style.display = '';
      document.getElementById('dcaChartsWrap').style.display = '';
      renderDCAStats(dcaResults);
      renderDCAPortfolioChart(dcaResults);
      renderDCAStrategyChart(dcaResults);
      renderDCATradesTable(dcaResults);
    });

    function runDCASimulation() {
      const amount = parseFloat(document.getElementById('dcaAmount').value) || 1000;
      const freq = document.getElementById('dcaFrequency').value;
      const dayOfMonth = parseInt(document.getElementById('dcaDayOfMonth').value) || 1;
      const startDate = document.getElementById('dcaStart').value;
      const endDate = document.getElementById('dcaEnd').value;
      const threshold = parseFloat(document.getElementById('dcaRiskThreshold').value);

      const simPts = [];
      for (var i = 0; i < n; i++) {
        if (pts[i].date >= startDate && pts[i].date <= endDate) simPts.push(pts[i]);
      }
      if (simPts.length < 2) return null;

      var buyIndices = [];
      if (freq === 'monthly') {
        var seenMonth = {};
        for (var j = 0; j < simPts.length; j++) {
          var ym = simPts[j].date.slice(0,7);
          var day = +simPts[j].date.slice(8,10);
          if (!seenMonth[ym] && day >= dayOfMonth) {
            seenMonth[ym] = true;
            buyIndices.push(j);
          }
        }
      } else {
        var lastBuyMs = 0;
        for (var j = 0; j < simPts.length; j++) {
          var ms = new Date(simPts[j].date + 'T00:00:00Z').getTime();
          if (ms - lastBuyMs >= 6.5 * 864e5) {
            buyIndices.push(j);
            lastBuyMs = ms;
          }
        }
      }

      var bandSize = threshold / 4;
      function getMultiplier(risk) {
        if (dcaStrategy === 'fixed') return 1;
        if (risk >= threshold) return 0;
        if (threshold <= 0) return 0;
        var band = Math.min(3, Math.floor(risk / bandSize));
        if (dcaStrategy === 'linear') return [4,3,2,1][band];
        return [8,4,2,1][band];
      }

      var trades = [];
      var totalShares = 0, totalInvested = 0;
      for (var k = 0; k < buyIndices.length; k++) {
        var p = simPts[buyIndices[k]];
        var mult = getMultiplier(p.riskCombo);
        if (mult === 0) continue;
        var usd = amount * mult;
        var shares = usd / p.price;
        totalShares += shares;
        totalInvested += usd;
        trades.push({
          num: trades.length + 1,
          date: p.date, price: p.price, risk: p.riskCombo,
          mult: mult, usd: usd, shares: shares,
          cumShares: totalShares,
          portfolioValue: totalShares * p.price
        });
      }

      if (trades.length === 0) {
        document.getElementById('dcaStats').style.display = '';
        document.getElementById('dcaStats').innerHTML = '<div class="card"><div class="card-label" style="color:#f7931a">No Trades Executed</div><div class="card-sub">Risk never dropped below the threshold in this period. Try a higher risk threshold or wider date range.</div></div>';
        document.getElementById('dcaChartsWrap').style.display = 'none';
        return null;
      }

      var lumpSumShares = totalInvested / simPts[0].price;
      var timeline = [];
      var cumShares = 0, cumInvested = 0, tradeIdx = 0;
      for (var j = 0; j < simPts.length; j++) {
        while (tradeIdx < trades.length && trades[tradeIdx].date <= simPts[j].date) {
          cumShares = trades[tradeIdx].cumShares;
          cumInvested += trades[tradeIdx].usd;
          tradeIdx++;
        }
        timeline.push({
          date: simPts[j].date,
          price: simPts[j].price,
          risk: simPts[j].riskCombo,
          portfolioValue: cumShares * simPts[j].price,
          investedAmount: cumInvested,
          lumpSumValue: lumpSumShares * simPts[j].price,
          isBuy: trades.some(function(t){ return t.date === simPts[j].date; })
        });
      }

      var lastTl = timeline[timeline.length - 1];
      return {
        trades: trades, timeline: timeline,
        totalInvested: totalInvested, totalShares: totalShares,
        avgPrice: totalInvested / totalShares,
        lastPrice: lastTl.price,
        portfolioValue: lastTl.portfolioValue,
        lumpSumValue: lastTl.lumpSumValue,
        buyCount: trades.length, totalPeriods: buyIndices.length
      };
    }

    function renderDCAStats(r) {
      var gain = r.portfolioValue - r.totalInvested;
      var gainPct = (gain / r.totalInvested * 100).toFixed(1);
      var gainColor = gain >= 0 ? '#58c56f' : '#ef5d4f';
      var lumpGain = r.lumpSumValue - r.totalInvested;
      var lumpPct = (lumpGain / r.totalInvested * 100).toFixed(1);
      var lumpColor = lumpGain >= 0 ? '#58c56f' : '#ef5d4f';

      document.getElementById('dcaStats').innerHTML =
        '<div class="card" style="--glow:#f7931a"><div class="card-label">Total Invested</div>' +
        '<div class="card-value" style="font-size:1.5rem;--val-color:#f7931a">$' + r.totalInvested.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div>' +
        '<div class="card-sub">Buying ' + r.buyCount + ' of ' + r.totalPeriods + ' periods</div></div>' +
        '<div class="card" style="--glow:#ffbf63"><div class="card-label">Accumulated ' + ASSET + '</div>' +
        '<div class="card-value" style="font-size:1.5rem;--val-color:#ffbf63">' + r.totalShares.toFixed(2) + ' <span style="font-size:0.7rem;color:var(--text-dim)">' + ASSET + '</span></div>' +
        '<div class="card-sub">Avg: $' + r.avgPrice.toLocaleString(undefined,{maximumFractionDigits:2}) + ' · Last: $' + r.lastPrice.toLocaleString(undefined,{maximumFractionDigits:2}) + '</div></div>' +
        '<div class="card" style="--glow:' + gainColor + '"><div class="card-label">Current Portfolio Value</div>' +
        '<div class="card-value" style="font-size:1.5rem;--val-color:' + gainColor + '">$' + r.portfolioValue.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div>' +
        '<div class="card-sub" style="color:' + gainColor + '">' + (gain>=0?'+':'') + '$' + Math.abs(gain).toLocaleString(undefined,{maximumFractionDigits:0}) + ' (' + (gain>=0?'+':'') + gainPct + '%)</div></div>' +
        '<div class="card" style="--glow:' + lumpColor + '"><div class="card-label">vs Lump Sum</div>' +
        '<div class="card-value" style="font-size:1.5rem;--val-color:' + lumpColor + '">$' + r.lumpSumValue.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div>' +
        '<div class="card-sub" style="color:' + lumpColor + '">' + (lumpGain>=0?'+':'') + '$' + Math.abs(lumpGain).toLocaleString(undefined,{maximumFractionDigits:0}) + ' (' + (lumpGain>=0?'+':'') + lumpPct + '%)</div></div>';

      document.getElementById('dcaBuyNote').textContent = 'Buying ' + r.buyCount + ' of ' + r.totalPeriods + ' periods · $' + r.totalInvested.toLocaleString(undefined,{maximumFractionDigits:0}) + ' invested';
    }

    function renderDCAPortfolioChart(r) {
      var tc = themeColors();
      var cv = document.getElementById('dcaPortfolioCanvas'), ctx = cv.getContext('2d');
      var W = cv.width, H = cv.height;
      var P = {t:28, r:70, b:48, l:80};
      var cw = W-P.l-P.r, ch = H-P.t-P.b;
      var tl = r.timeline;
      var tn = tl.length;
      var S = Math.max(1, Math.floor(tn / 1500));

      ctx.fillStyle = tc.canvasBg; ctx.fillRect(0,0,W,H);

      var xOf = function(i){ return P.l + (i/(tn-1)) * cw; };

      var allVals = [];
      for (var i=0; i<tn; i+=S) {
        allVals.push(tl[i].portfolioValue, tl[i].investedAmount, tl[i].lumpSumValue);
      }
      var maxV = Math.max.apply(null, allVals.filter(function(v){return v>0;}));
      var minV = Math.min.apply(null, allVals.filter(function(v){return v>0;}));
      if (maxV <= 0) maxV = 1;
      if (minV <= 0) minV = 1;

      var yOf;
      if (dcaScale === 'log') {
        var logMin = Math.floor(Math.log10(minV));
        var logMax = Math.ceil(Math.log10(maxV));
        if (logMin === logMax) logMax = logMin + 1;
        yOf = function(v){ if(v<=0) v=1; var lv=Math.log10(v); return P.t + ch - ((lv-logMin)/(logMax-logMin))*ch; };
        ctx.textAlign='right'; ctx.font='10px JetBrains Mono';
        for (var e=logMin; e<=logMax; e++) {
          var y=yOf(Math.pow(10,e));
          ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);ctx.stroke();
          ctx.fillStyle=tc.axisText;
          ctx.fillText('$'+Math.pow(10,e).toLocaleString(),P.l-8,y+3);
        }
      } else {
        var niceMax = maxV * 1.1;
        yOf = function(v){ return P.t + ch - (v/niceMax)*ch; };
        var step = Math.pow(10, Math.floor(Math.log10(niceMax))) / 2;
        if (niceMax / step > 10) step *= 2;
        ctx.textAlign='right'; ctx.font='10px JetBrains Mono';
        for (var g=0; g<=niceMax; g+=step) {
          var y=yOf(g);
          ctx.strokeStyle = g===0 ? tc.gridZero : tc.gridLine;
          ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);ctx.stroke();
          ctx.fillStyle=tc.axisText;
          ctx.fillText('$'+Math.round(g).toLocaleString(),P.l-8,y+3);
        }
      }

      var seenYr = {};
      ctx.textAlign='center';
      for (var i=0; i<tn; i+=S) {
        var yr = tl[i].date.slice(0,4);
        if (!seenYr[yr]) {
          seenYr[yr] = true;
          var x = xOf(i);
          ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(x,P.t);ctx.lineTo(x,H-P.b);ctx.stroke();
          ctx.fillStyle=tc.axisText;ctx.font='10px JetBrains Mono';
          ctx.fillText(yr,x,H-P.b+18);
        }
      }

      ctx.strokeStyle='rgba(213,181,108,0.55)';ctx.lineWidth=1.5;ctx.setLineDash([4,4]);
      ctx.beginPath();
      for (var i=0; i<tn; i+=S) {
        var x=xOf(i), y=yOf(tl[i].lumpSumValue);
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.stroke(); ctx.setLineDash([]);

      ctx.strokeStyle='rgba(16,185,129,0.7)';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);
      ctx.beginPath();
      for (var i=0; i<tn; i+=S) {
        var x=xOf(i), y=yOf(tl[i].investedAmount);
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.stroke(); ctx.setLineDash([]);

      var light = document.documentElement.getAttribute('data-theme') === 'light';
      ctx.strokeStyle= light ? 'rgba(178,122,37,0.9)' : 'rgba(247,147,26,0.9)';
      ctx.lineWidth=2.5;
      ctx.beginPath();
      for (var i=0; i<tn; i+=S) {
        var x=xOf(i), y=yOf(tl[i].portfolioValue);
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.stroke();

      for (var i=0; i<tn; i++) {
        if (tl[i].isBuy) {
          var x=xOf(i), y=yOf(tl[i].portfolioValue);
          ctx.fillStyle=riskColor(tl[i].risk);
          ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
        }
      }

      var lx = P.l + 12, ly = P.t + 16;
      ctx.font='10px JetBrains Mono';
      [[light?'rgba(178,122,37,0.9)':'rgba(247,147,26,0.9)', ASSET + ' Portfolio', false],
       ['rgba(16,185,129,0.7)', 'Invested', true],
       ['rgba(213,181,108,0.55)', 'Lump Sum', true]].forEach(function(item, idx){
        var cy = ly + idx * 16;
        ctx.strokeStyle=item[0];ctx.lineWidth=2;
        if(item[2]) ctx.setLineDash([4,4]); else ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo(lx,cy);ctx.lineTo(lx+24,cy);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle=tc.axisText;ctx.textAlign='left';
        ctx.fillText(item[1],lx+30,cy+3);
      });

      attachDCATooltip(cv, 'dcaPortfolioTip', tl, function(p, tip){
        tip.querySelector('.tt-date').textContent = p.date;
        tip.querySelector('.tt-price').textContent = 'Portfolio: $' + p.portfolioValue.toLocaleString(undefined,{maximumFractionDigits:0}) + ' · Invested: $' + p.investedAmount.toLocaleString(undefined,{maximumFractionDigits:0});
        var g = p.portfolioValue - p.investedAmount;
        var gp = p.investedAmount > 0 ? (g/p.investedAmount*100).toFixed(1) : '0.0';
        tip.querySelector('.tt-risk').textContent = (g>=0?'+':'') + '$' + Math.abs(g).toLocaleString(undefined,{maximumFractionDigits:0}) + ' (' + (g>=0?'+':'') + gp + '%)';
        tip.querySelector('.tt-risk').style.color = g >= 0 ? '#58c56f' : '#ef5d4f';
      });
    }

    function renderDCAStrategyChart(r) {
      var tc = themeColors();
      var cv = document.getElementById('dcaStrategyCanvas'), ctx = cv.getContext('2d');
      var W = cv.width, H = cv.height;
      var P = {t:16, r:70, b:48, l:80};
      var cw = W-P.l-P.r, ch = H-P.t-P.b;
      var tl = r.timeline;
      var tn = tl.length;
      var S = Math.max(1, Math.floor(tn / 1500));
      var threshold = parseFloat(document.getElementById('dcaRiskThreshold').value);
      if (threshold > 1) threshold = 1;

      ctx.fillStyle = tc.canvasBg; ctx.fillRect(0,0,W,H);

      var xOf = function(i){ return P.l + (i/(tn-1)) * cw; };
      var yOf = function(rr){ return P.t + ch * (1 - rr); };

      [[0,0.20,tc.zoneA],[0.20,0.50,tc.zoneB],[0.50,0.80,tc.zoneC],[0.80,1,tc.zoneD]].forEach(function(z){
        ctx.fillStyle=z[2];ctx.fillRect(P.l,yOf(z[1]),cw,yOf(z[0])-yOf(z[1]));
      });

      if (dcaStrategy === 'fixed') {
        ctx.fillStyle = 'rgba(16,185,129,0.15)';
        ctx.fillRect(P.l, yOf(1), cw, yOf(0) - yOf(1));
        ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(16,185,129,0.7)';
        ctx.fillText('Buy $' + parseFloat(document.getElementById('dcaAmount').value).toLocaleString() + ' (1x) every period', P.l + cw/2 - 60, yOf(0.5) + 3);
      } else {
        var bandSize = threshold / 4;
        for (var b = 0; b < 4; b++) {
          var bLo = b * bandSize, bHi = (b+1) * bandSize;
          var intensity = dcaStrategy === 'linear' ? [0.25, 0.20, 0.15, 0.10][b] : [0.30, 0.22, 0.15, 0.08][b];
          ctx.fillStyle = 'rgba(16,185,129,' + intensity + ')';
          ctx.fillRect(P.l, yOf(bHi), cw, yOf(bLo) - yOf(bHi));
        }
        ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'left';
        for (var b = 0; b < 4; b++) {
          var bMid = (b + 0.5) * bandSize;
          var mult = dcaStrategy === 'linear' ? [4,3,2,1][b] : [8,4,2,1][b];
          var label = 'Buy $' + (parseFloat(document.getElementById('dcaAmount').value) * mult).toLocaleString() + ' (' + mult + 'x)';
          ctx.fillStyle = 'rgba(16,185,129,0.7)';
          ctx.fillText(label, P.l + cw/2 - 40, yOf(bMid) + 3);
        }
      }

      if (dcaStrategy !== 'fixed') {
        ctx.strokeStyle='rgba(16,185,129,0.8)';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);
        ctx.beginPath();ctx.moveTo(P.l,yOf(threshold));ctx.lineTo(W-P.r,yOf(threshold));ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.textAlign='right';ctx.font='10px JetBrains Mono';
      [0,0.25,0.5,0.75,1.0].forEach(function(v){
        var y=yOf(v);
        ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);ctx.stroke();
        ctx.fillStyle=tc.axisText;ctx.fillText(v.toFixed(2),P.l-8,y+3);
      });

      var seenYr = {};
      ctx.textAlign='center';
      for (var i=0; i<tn; i+=S) {
        var yr = tl[i].date.slice(0,4);
        if (!seenYr[yr]) {
          seenYr[yr] = true;
          var x = xOf(i);
          ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(x,P.t);ctx.lineTo(x,H-P.b);ctx.stroke();
          ctx.fillStyle=tc.axisText;ctx.font='10px JetBrains Mono';
          ctx.fillText(yr,x,H-P.b+18);
        }
      }

      ctx.beginPath();ctx.moveTo(xOf(0),yOf(0));
      for (var i=0; i<tn; i+=S) ctx.lineTo(xOf(i),yOf(tl[i].risk));
      ctx.lineTo(xOf(tn-1),yOf(0));ctx.closePath();
      var grd=ctx.createLinearGradient(0,yOf(1),0,yOf(0));
      grd.addColorStop(0,tc.areaGrad0);grd.addColorStop(0.5,tc.areaGrad5);grd.addColorStop(1,tc.areaGrad1);
      ctx.fillStyle=grd;ctx.fill();

      for (var i=S; i<tn; i+=S) {
        var prev = Math.max(0,i-S);
        ctx.strokeStyle=riskColor(tl[i].risk,0.90);ctx.lineWidth=1.8;
        ctx.beginPath();ctx.moveTo(xOf(prev),yOf(tl[prev].risk));ctx.lineTo(xOf(i),yOf(tl[i].risk));ctx.stroke();
      }

      for (var i=0; i<tn; i++) {
        if (tl[i].isBuy) {
          var x = xOf(i);
          ctx.strokeStyle='rgba(16,185,129,0.4)';ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(x,yOf(tl[i].risk));ctx.lineTo(x,yOf(0));ctx.stroke();
          ctx.fillStyle='#58c56f';
          ctx.beginPath();ctx.arc(x,yOf(tl[i].risk),3,0,Math.PI*2);ctx.fill();
        }
      }

      ctx.fillStyle=tc.zoneLabels;ctx.font='9px JetBrains Mono';ctx.textAlign='right';
      ctx.fillText('EUPHORIA',W-P.r-4,yOf(0.90));
      ctx.fillText('ELEVATED',W-P.r-4,yOf(0.65));
      ctx.fillText('NEUTRAL',W-P.r-4,yOf(0.35));
      ctx.fillText('ACCUMULATE',W-P.r-4,yOf(0.10));

      attachDCATooltip(cv, 'dcaStrategyTip', tl, function(p, tip){
        tip.querySelector('.tt-date').textContent = p.date;
        tip.querySelector('.tt-risk').textContent = 'Risk: ' + p.risk.toFixed(3) + (p.isBuy ? ' · BUY' : '');
        tip.querySelector('.tt-risk').style.color = riskColor(p.risk);
      });
    }

    function attachDCATooltip(cv, tipId, tl, fillFn) {
      var tip = document.getElementById(tipId);
      var W = cv.width;
      var P_l = 80, P_r = 70;
      var cw = W - P_l - P_r;
      cv.addEventListener('mousemove', function(e){
        if (!document.querySelector('[data-risk-dashboard="qqq"]')) return;
        var rect = cv.getBoundingClientRect();
        var scaleX = W / rect.width;
        var mx = (e.clientX - rect.left) * scaleX;
        var idx = Math.round((mx - P_l) / cw * (tl.length - 1));
        if (idx < 0 || idx >= tl.length) { tip.style.display='none'; return; }
        fillFn(tl[idx], tip);
        tip.style.display = 'block';
        var tipX = e.clientX - rect.left + 16;
        var tipY = e.clientY - rect.top - 40;
        tip.style.left = (tipX + tip.offsetWidth > rect.width ? tipX - tip.offsetWidth - 32 : tipX) + 'px';
        tip.style.top = tipY + 'px';
      });
      cv.addEventListener('mouseleave', function(){ tip.style.display='none'; });
    }

    function renderDCATradesTable(r) {
      var tbody = document.getElementById('dcaTradesBody');
      tbody.innerHTML = '';
      r.trades.forEach(function(t) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + t.num + '</td>' +
          '<td>' + t.date + '</td>' +
          '<td class="rl-price">$' + t.price.toLocaleString(undefined,{maximumFractionDigits:2}) + '</td>' +
          '<td class="rl-risk" style="color:' + riskColor(t.risk) + '">' + t.risk.toFixed(3) + '</td>' +
          '<td style="color:#58c56f;font-weight:600">' + t.mult + 'x</td>' +
          '<td>$' + t.usd.toLocaleString(undefined,{maximumFractionDigits:0}) + '</td>' +
          '<td>' + t.shares.toFixed(4) + '</td>' +
          '<td>' + t.cumShares.toFixed(2) + '</td>' +
          '<td class="rl-price">$' + t.portfolioValue.toLocaleString(undefined,{maximumFractionDigits:0}) + '</td>';
        tbody.appendChild(tr);
      });
    }

    window._dcaRerender = function() {
      if (dcaResults) {
        renderDCAPortfolioChart(dcaResults);
        renderDCAStrategyChart(dcaResults);
      }
    };
  })();

  // Legend bar
  (function(){
    const el=document.getElementById('legendBar');
    [{name:'Accumulate',range:'0.00–0.25',risk:0.12},{name:'Neutral',range:'0.25–0.50',risk:0.37},{name:'Caution',range:'0.50–0.75',risk:0.62},{name:'Euphoria',range:'0.75–1.00',risk:0.88}].forEach(s=>{
      const d=document.createElement('div');d.className='legend-seg';
      d.style.background=riskColor(s.risk,0.2);d.style.color=riskColor(s.risk);
      d.innerHTML=s.name+'<span class="seg-label">'+s.range+'</span>';el.appendChild(d);
    });
  })();

  // Repaint canvas charts when the shared Next.js theme changes.
  window.addEventListener('davey-theme-change', function() {
    if (!document.querySelector('[data-risk-dashboard="qqq"]')) return;
    renderAll();
    if (window._dcaRerender) window._dcaRerender();
  });
}

main();

// Auto-refresh QQQ price every 60 seconds
let refreshTimer = setInterval(async function () {
  if (document.visibilityState === 'hidden') return;
  try {
    const resp = await fetch(WORKER_URL + '/api/quote?symbol=QQQ');
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.c || data.c === 0) return;
    const el = document.getElementById('vPrice');
    if (el) el.textContent = '$' + data.c.toLocaleString(undefined, {maximumFractionDigits:2});
    const hd = document.getElementById('headerDate');
    const today = new Date().toISOString().slice(0,10);
    if (hd) hd.innerHTML = '<span style="width:6px;height:6px;background:#58c56f;border-radius:50%;flex-shrink:0;animation:pulse 2s infinite;display:inline-block"></span> as of ' + today + ' · live';
  } catch (e) { console.warn('QQQ refresh failed:', e); }
}, 60000);

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    refreshTimer = refreshTimer || setInterval(arguments.callee, 60000);
  }
});
