/* eslint-disable */
/* Generated from risk-metric.html by scripts/sync-risk-assets.mjs. */
// Restore theme before render
(function(){if(window.DaveyTheme)window.DaveyTheme.apply(window.DaveyTheme.get());})();

// ====== THEME-AWARE CANVAS COLORS ======
function themeColors() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    canvasBg: light ? '#fff9ef' : '#14130f',
    gridLine: light ? '#e3dbc8' : '#2b251a',
    gridLineMinor: light ? '#f2ecdf' : '#34332f',
    gridZero: light ? '#d6c7ad' : '#6c6558',
    axisText: light ? '#6d6a5f' : '#a59a88',
    regressionLine: light ? 'rgba(184,101,11,0.46)' : 'rgba(247,147,26,0.46)',
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

// ====== LOAD DATA FROM CSV ======
async function loadCSV() {
  const resp = await fetch('/data.csv?v=' + Date.now());
  const text = await resp.text();
  const rows = text.trim().split('\n').slice(1); // skip header
  return rows.map(r => { const [d,p] = r.split(','); return [d, parseFloat(p)]; });
}

function calculateWeeklyMovingAverages(rawData) {
  const weeklyCloses = [];
  let activeWeek = null;
  let activeClose = null;
  rawData.forEach(([date, price]) => {
    if (!Number.isFinite(price) || price <= 0) return;
    const d = new Date(date + 'T00:00:00Z');
    const daysFromMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysFromMonday);
    const week = d.toISOString().slice(0, 10);
    if (activeWeek !== null && week !== activeWeek) weeklyCloses.push(activeClose);
    activeWeek = week;
    activeClose = { date, price };
  });
  if (activeClose) weeklyCloses.push(activeClose);

  const values = {};
  [300, 200, 50, 21, 13, 8].forEach(period => {
    const sample = weeklyCloses.slice(-period);
    values[period] = sample.length === period
      ? sample.reduce((sum, point) => sum + point.price, 0) / period
      : null;
  });
  return { values, weeklyCloses };
}

function renderWeeklyMovingAverages(rawData) {
  const { values, weeklyCloses } = calculateWeeklyMovingAverages(rawData);
  [300, 200, 50, 21, 13, 8].forEach(period => {
    const el = document.getElementById('vMa' + period + 'W');
    const value = values[period];
    if (!el) return;
    el.textContent = Number.isFinite(value)
      ? '$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : '—';
    if (Number.isFinite(value)) el.dataset.value = value.toFixed(2);
  });
  const card = document.getElementById('movingAveragesCard');
  const latest = weeklyCloses[weeklyCloses.length - 1];
  if (card) {
    card.dataset.weeklyObservations = String(weeklyCloses.length);
    card.dataset.latestWeeklyClose = latest ? latest.date : '';
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, timeoutMs || 3500);
  try {
    return await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

const GENESIS = new Date('2009-01-03T00:00:00Z').getTime();
const WINDOW = 1460;
const ENV_UPPER_A = 4.6;
const ENV_UPPER_B = -1.10;
const ENV_LOWER = -0.45;
const ENV_MIN_MAX = 0.05;
const STRUCTURAL_SOFT_FLOOR_SCALE = 0.15;
const STRUCTURAL_SOFT_FLOOR_MAX = 0.02;
const STRUCTURAL_SOFT_FLOOR_MIN = 0.005;
const STRUCTURAL_FLOOR_BREAK_RISK = 0.01;
const FAIR_VALUE_DAMPENING_MARKET_CAP = 20e12;
const FAIR_VALUE_PROJECTION_SUPPLY = 20.8e6;
const FAIR_VALUE_LONG_RUN_GROWTH = 0.06;
const FAIR_VALUE_DAMPENING_POWER = 2;
const FAIR_VALUE_DAYS_PER_YEAR = 365.2425;
const FAIR_VALUE_PROJECTION_END_MS = Date.UTC(2040, 11, 1);

function buildDampedFairValuePath(startMs, startValue, slope, endMs) {
  const path = [{ ms: startMs, value: startValue }];
  let projectionMs = startMs;
  let dampedValue = startValue;
  while (projectionMs < endMs) {
    const stepDays = Math.min(1, (endMs - projectionMs) / 864e5);
    const modelDays = (projectionMs - GENESIS) / 864e5;
    const nextModelDays = modelDays + stepDays;
    const rawPowerLawLogGrowth = slope * Math.log(nextModelDays / modelDays);
    const longRunLogGrowth = Math.log1p(FAIR_VALUE_LONG_RUN_GROWTH) *
      stepDays / FAIR_VALUE_DAYS_PER_YEAR;
    const modeledMarketCap = dampedValue * FAIR_VALUE_PROJECTION_SUPPLY;
    const dampingShare = 1 / (1 + Math.pow(
      modeledMarketCap / FAIR_VALUE_DAMPENING_MARKET_CAP,
      FAIR_VALUE_DAMPENING_POWER
    ));
    const dampedLogGrowth = longRunLogGrowth +
      (rawPowerLawLogGrowth - longRunLogGrowth) * dampingShare;
    dampedValue *= Math.exp(dampedLogGrowth);
    projectionMs += stepDays * 864e5;
    path.push({ ms: projectionMs, value: dampedValue });
  }
  return path;
}

function dampedFairValueAt(path, targetMs) {
  const index = Math.max(0, Math.min(
    path.length - 1,
    Math.round((targetMs - path[0].ms) / 864e5)
  ));
  return path[index].value;
}

function buildDataset(rawData) {
  const pts = rawData.map(([ds, p]) => {
    const ms = new Date(ds + 'T00:00:00Z').getTime();
    const days = (ms - GENESIS) / 864e5;
    return { date: ds, price: p, days, logDays: Math.log10(days), logPrice: Math.log10(p) };
  }).filter(p => p.days > 0 && p.price > 0);

  const n = pts.length;
  function fitRegression(endExclusive) {
    let sx=0,sy=0,sxy=0,sxx=0;
    for (let i=0; i<endExclusive; i++) {
      const p = pts[i];
      sx+=p.logDays; sy+=p.logPrice; sxy+=p.logDays*p.logPrice; sxx+=p.logDays*p.logDays;
    }
    const count = endExclusive;
    const slope = (count*sxy - sx*sy) / (count*sxx - sx*sx);
    const intercept = (sy - slope*sx) / count;
    return { slope, intercept };
  }
  const { slope, intercept } = fitRegression(n);

  pts.forEach((p, i) => {
    const asOf = i >= 365 ? fitRegression(i + 1) : { slope, intercept };
    p.trendLogPrice = slope * p.logDays + intercept;
    p.trendPrice = Math.pow(10, p.trendLogPrice);
    p.regLogPrice = asOf.slope * p.logDays + asOf.intercept;
    p.regPrice = Math.pow(10, p.regLogPrice);
    p.residual = p.logPrice - p.regLogPrice;
    const envMax = Math.max(ENV_MIN_MAX, ENV_UPPER_A + ENV_UPPER_B * p.logDays);
    const envRange = envMax - ENV_LOWER;
    const structuralRaw = (p.residual - ENV_LOWER) / envRange;
    if (structuralRaw < 0) {
      const floorDepth = ENV_LOWER - p.residual;
      p.riskMM = Math.max(
        STRUCTURAL_SOFT_FLOOR_MIN,
        STRUCTURAL_SOFT_FLOOR_MAX * Math.exp(-floorDepth / STRUCTURAL_SOFT_FLOOR_SCALE)
      );
    } else {
      p.riskMM = Math.min(1, structuralRaw);
    }
  });

  // Prior-window rolling Z-score. The current point is compared with the
  // previous window, so historical risk readings do not use the current close
  // to set their own momentum baseline.
  const residuals = pts.map(p => p.residual);
  let rSum=0, rSumSq=0;
  for (let i=0; i<n; i++) {
    const cnt = Math.min(i, WINDOW);
    if (cnt >= 180) {
      const mean = rSum/cnt;
      const vari = Math.max(0.0001, rSumSq/cnt - mean*mean);
      const std = Math.sqrt(vari);
      const z = (residuals[i]-mean)/std;
      pts[i].riskZS = normCdf(z);
      pts[i].rollMean = mean;
      pts[i].rollStd = std;
    } else {
      pts[i].riskZS = 0.5;
      pts[i].rollMean = 0;
      pts[i].rollStd = 0.1;
    }
    rSum += residuals[i]; rSumSq += residuals[i]*residuals[i];
    if (i >= WINDOW - 1) { rSum -= residuals[i-WINDOW+1]; rSumSq -= residuals[i-WINDOW+1]*residuals[i-WINDOW+1]; }
  }

  pts.forEach(p => {
    p.riskCombo = Math.sqrt(p.riskMM * p.riskZS);
  });

  return { pts, slope, intercept };
}

function normCdf(z) {
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-z*z/2);
  const p = d*t*(0.3193815 + t*(-0.3565638 + t*(1.781478 + t*(-1.8212560 + t*1.330274))));
  return z > 0 ? 1-p : p;
}

function riskColor(r, a) {
  a = a || 1;
  const stops = [[0,[104,130,156]],[0.16,[80,155,118]],[0.32,[88,197,111]],[0.48,[255,191,99]],[0.64,[247,147,26]],[0.78,[228,96,69]],[0.90,[239,93,79]],[1,[122,32,25]]];
  let lo=stops[0], hi=stops[stops.length-1];
  for (let i=0;i<stops.length-1;i++) { if(r>=stops[i][0]&&r<=stops[i+1][0]){lo=stops[i];hi=stops[i+1];break;} }
  const t=(r-lo[0])/(hi[0]-lo[0]||1);
  const c=lo[1].map((v,j)=>Math.round(v+t*(hi[1][j]-v)));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// ====== FETCH LIVE PRICE ======
async function fetchCurrentBtcPrice() {
  const providers = [
    async function coingecko() {
      const resp = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true');
      if (!resp.ok) throw new Error('API ' + resp.status);
      const data = await resp.json();
      return { price: data.bitcoin.usd, updatedAt: new Date(data.bitcoin.last_updated_at * 1000), source: 'CoinGecko' };
    },
    async function coinbase() {
      const resp = await fetchWithTimeout('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      if (!resp.ok) throw new Error('API ' + resp.status);
      const data = await resp.json();
      return { price: parseFloat(data.data.amount), updatedAt: new Date(), source: 'Coinbase' };
    }
  ];
  return await new Promise(function(resolve) {
    let settled = false;
    let pending = providers.length;
    const timer = setTimeout(function() { finish(null); }, 3800);
    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }
    providers.forEach(function(provider) {
      provider().then(function(result) {
        if (Number.isFinite(result.price) && result.price > 0) finish(result);
      }).catch(function() {}).finally(function() {
        pending -= 1;
        if (pending === 0) finish(null);
      });
    });
  });
}

async function fetchLivePrice(rawData) {
  const live = await fetchCurrentBtcPrice();
  if (live) {
    const price = live.price;
    const dt = live.updatedAt;
    const dateStr = dt.toISOString().slice(0,10);
    const lastDate = rawData[rawData.length-1][0];
    if (dateStr === lastDate) {
      rawData[rawData.length-1][1] = price;
    } else if (dateStr > lastDate) {
      rawData.push([dateStr, price]);
    }
    return live;
  }
  return null;
}

// ====== BITCOIN HALVING COUNTDOWN ======
const HALVING_INTERVAL = 210000;
const BLOCK_MS = 10 * 60 * 1000;
const FALLBACK_HALVING_ANCHOR = {
  height: 840000,
  minedAt: Date.parse('2024-04-20T00:09:27Z')
};

function formatHalvingDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function fallbackBlockHeight(nowMs) {
  return Math.max(FALLBACK_HALVING_ANCHOR.height, Math.floor(
    FALLBACK_HALVING_ANCHOR.height + (nowMs - FALLBACK_HALVING_ANCHOR.minedAt) / BLOCK_MS
  ));
}

function bitcoinSupplyAtHeight(height) {
  let remainingBlocks = Math.max(0, Math.floor(height) + 1);
  let reward = 50;
  let supply = 0;
  while (remainingBlocks > 0 && reward > 0) {
    const blocks = Math.min(remainingBlocks, HALVING_INTERVAL);
    supply += blocks * reward;
    remainingBlocks -= blocks;
    reward /= 2;
  }
  return Math.min(21000000, supply);
}

async function fetchBlockHeight() {
  const endpoints = [
    'https://blockstream.info/api/blocks/tip/height',
    'https://mempool.space/api/blocks/tip/height'
  ];
  for (const url of endpoints) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const height = parseInt((await resp.text()).trim(), 10);
      if (Number.isFinite(height) && height > 0) return height;
    } catch {}
  }
  return null;
}

async function refreshHalvingCountdown() {
  const nowMs = Date.now();
  const liveHeight = await fetchBlockHeight();
  const height = liveHeight || fallbackBlockHeight(nowMs);
  const currentEpoch = Math.floor(height / HALVING_INTERVAL);
  const nextHalvingHeight = (currentEpoch + 1) * HALVING_INTERVAL;
  const epochStartHeight = currentEpoch * HALVING_INTERVAL;
  const blocksRemaining = Math.max(0, nextHalvingHeight - height);
  const daysRemaining = Math.ceil((blocksRemaining * BLOCK_MS) / 864e5);
  const estimateMs = nowMs + blocksRemaining * BLOCK_MS;
  const epochProgress = Math.max(0, Math.min(100, ((height - epochStartHeight) / HALVING_INTERVAL) * 100));

  const daysEl = document.getElementById('vHalvingDays');
  const subEl = document.getElementById('vHalvingSub');
  const blocksEl = document.getElementById('vHalvingBlocks');
  const progressEl = document.getElementById('vHalvingProgress');
  const barEl = document.getElementById('halvingProgressBar');
  if (!daysEl || !subEl || !blocksEl || !progressEl || !barEl) return;

  daysEl.textContent = daysRemaining.toLocaleString() + 'd';
  subEl.textContent = 'Est. ' + formatHalvingDate(estimateMs) + (liveHeight ? '' : ' · clock estimate');
  blocksEl.textContent = blocksRemaining.toLocaleString() + ' blocks';
  progressEl.textContent = epochProgress.toFixed(1) + '% epoch';
  barEl.style.width = epochProgress + '%';
}

// ====== BITCOIN DIFFICULTY ADJUSTMENT ======
function formatDifficulty(value) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e15) return (value / 1e15).toFixed(2) + 'Q';
  if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  return Math.round(value).toLocaleString();
}

function formatSignedPct(value) {
  if (!Number.isFinite(value)) return '—';
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

async function fetchCurrentDifficulty() {
  try {
    const resp = await fetch('https://mempool.space/api/v1/blocks');
    if (!resp.ok) throw new Error('API ' + resp.status);
    const blocks = await resp.json();
    const difficulty = Array.isArray(blocks) && blocks[0] ? Number(blocks[0].difficulty) : null;
    if (Number.isFinite(difficulty) && difficulty > 0) return difficulty;
  } catch {}
  return null;
}

async function fetchDifficultyAdjustment() {
  try {
    const resp = await fetch('https://mempool.space/api/v1/difficulty-adjustment');
    if (!resp.ok) throw new Error('API ' + resp.status);
    const data = await resp.json();
    if (data && Number.isFinite(data.progressPercent)) return data;
  } catch {}
  return null;
}

async function fetchDifficultyAth() {
  try {
    const resp = await fetch('https://mempool.space/api/v1/mining/difficulty-adjustments/all');
    if (!resp.ok) throw new Error('API ' + resp.status);
    const rows = await resp.json();
    if (!Array.isArray(rows)) return null;
    let ath = null;
    rows.forEach(row => {
      const difficulty = Array.isArray(row) ? Number(row[2]) : Number(row && row.difficulty);
      if (Number.isFinite(difficulty) && difficulty > 0 && (ath == null || difficulty > ath)) ath = difficulty;
    });
    return ath;
  } catch {}
  return null;
}

async function refreshDifficultyAdjustment() {
  const [difficulty, adjustment, athDifficulty] = await Promise.all([
    fetchCurrentDifficulty(),
    fetchDifficultyAdjustment(),
    fetchDifficultyAth()
  ]);

  const valueEl = document.getElementById('vDifficulty');
  const subEl = document.getElementById('vDifficultySub');
  const blocksEl = document.getElementById('vDifficultyBlocks');
  const athEl = document.getElementById('vDifficultyAth');
  const barEl = document.getElementById('difficultyProgressBar');
  if (!valueEl || !subEl || !blocksEl || !athEl || !barEl) return;

  valueEl.textContent = difficulty ? formatDifficulty(difficulty) : '—';
  athEl.textContent = athDifficulty ? 'ATH ' + formatDifficulty(athDifficulty) : 'ATH —';

  if (!adjustment) {
    subEl.textContent = difficulty ? 'Adjustment estimate unavailable' : 'Difficulty data unavailable';
    blocksEl.textContent = '— blocks';
    barEl.style.width = '0%';
    return;
  }

  const progress = Math.max(0, Math.min(100, adjustment.progressPercent || 0));
  const retargetMs = Number.isFinite(adjustment.estimatedRetargetDate)
    ? adjustment.estimatedRetargetDate
    : Date.now() + (Number(adjustment.remainingTime) || 0);
  const change = Number(adjustment.difficultyChange);
  const changeText = Number.isFinite(change) ? formatSignedPct(change) : '—';
  const remainingBlocks = Number.isFinite(adjustment.remainingBlocks) ? adjustment.remainingBlocks : null;

  subEl.textContent = 'Next Change Est. ' + formatHalvingDate(retargetMs) + ' · ' + changeText;
  blocksEl.textContent = remainingBlocks == null ? '— blocks' : remainingBlocks.toLocaleString() + ' blocks';
  barEl.style.width = progress + '%';
}

// ====== BEAR MARKET PROGRESS ======
const COMPLETED_BEAR_CYCLES = [
  { peak: '2011-06-08', bottom: '2011-11-18' },
  { peak: '2013-11-30', bottom: '2015-01-14' },
  { peak: '2017-12-17', bottom: '2018-12-15' },
  { peak: '2021-11-10', bottom: '2022-11-21' }
];

function compactUsd(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return '$' + Math.round(value / 1e3) + 'K';
  if (value >= 1) return '$' + value.toFixed(0);
  return '$' + value.toFixed(4);
}

function formatMarketCap(value) {
  if (!Number.isFinite(value)) return '—';
  function trimDecimal(text) {
    return text.indexOf('.') >= 0 ? text.replace(/\.?0+$/, '') : text;
  }
  if (value >= 1e12) return '$' + trimDecimal((value / 1e12).toFixed(value % 1e12 === 0 ? 0 : 3)) + 'T';
  if (value >= 1e9) return '$' + trimDecimal((value / 1e9).toFixed(value % 1e9 === 0 ? 0 : 1)) + 'B';
  if (value >= 1e6) return '$' + trimDecimal((value / 1e6).toFixed(value % 1e6 === 0 ? 0 : 1)) + 'M';
  return '$' + Math.round(value).toLocaleString();
}

function renderMarketCapTable(supply, height, currentPrice) {
  const supplyEl = document.getElementById('currentSupply');
  const heightEl = document.getElementById('currentSupplyHeight');
  const body = document.getElementById('marketCapBody');
  if (!supplyEl || !heightEl || !body || !Number.isFinite(supply) || supply <= 0) return;

  supplyEl.textContent = supply.toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' BTC';
  heightEl.textContent = Number.isFinite(height) ? Math.floor(height).toLocaleString() : 'estimated';
  body.innerHTML = '';

  const fragment = document.createDocumentFragment();
  for (let marketCap = 500000000000; marketCap <= 10000000000000; marketCap += 500000000000) {
    const price = marketCap / supply;
    const movePct = Number.isFinite(currentPrice) && currentPrice > 0 ? ((price / currentPrice - 1) * 100) : null;
    const moveColor = movePct == null ? 'var(--text-dimmer)' : movePct >= 0 ? '#58c56f' : '#ef5d4f';
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="pj-date">' + formatMarketCap(marketCap) + '</td>' +
      '<td class="pj-price">$' + price.toLocaleString(undefined, { maximumFractionDigits: price >= 1000 ? 0 : 2 }) + '</td>' +
      '<td class="pj-growth" style="color:' + moveColor + '">' + (movePct == null ? '—' : (movePct >= 0 ? '+' : '') + movePct.toFixed(1) + '%') + '</td>';
    fragment.appendChild(tr);
  }
  body.appendChild(fragment);
}

function dateMs(dateStr) {
  return Date.parse(dateStr + 'T00:00:00Z');
}

function addDays(dateStr, days) {
  return dateMs(dateStr) + days * 864e5;
}

function nearestPoint(pts, dateStr) {
  let best = pts[0];
  let bestDelta = Math.abs(dateMs(best.date) - dateMs(dateStr));
  for (const p of pts) {
    const delta = Math.abs(dateMs(p.date) - dateMs(dateStr));
    if (delta < bestDelta) { best = p; bestDelta = delta; }
  }
  return best;
}

function priceAtRiskForDate(targetMs, slope, intercept, rollMean, rollStd, risk) {
  const days = (targetMs - GENESIS) / 864e5;
  const logDays = Math.log10(days);
  const regLogPrice = slope * logDays + intercept;
  const envMax = Math.max(ENV_MIN_MAX, ENV_UPPER_A + ENV_UPPER_B * logDays);
  const envRange = envMax - ENV_LOWER;
  let lo = ENV_LOWER, hi = envMax;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    const structural = (mid - ENV_LOWER) / envRange;
    const momentum = normCdf((mid - rollMean) / rollStd);
    if (Math.sqrt(structural * momentum) < risk) lo = mid; else hi = mid;
  }
  return Math.pow(10, ((lo + hi) / 2) + regLogPrice);
}

function renderBearMarketProgress(pts, slope, intercept) {
  const pctEl = document.getElementById('vBearPct');
  const subEl = document.getElementById('vBearSub');
  const targetEl = document.getElementById('vBearTarget');
  const rangeEl = document.getElementById('vBearRange');
  const barEl = document.getElementById('bearProgressBar');
  if (!pctEl || !subEl || !targetEl || !rangeEl || !barEl || pts.length === 0) return;

  const completedCycles = COMPLETED_BEAR_CYCLES.map(cycle => {
    const peak = nearestPoint(pts, cycle.peak);
    const bottom = nearestPoint(pts, cycle.bottom);
    return {
      days: Math.round((dateMs(bottom.date) - dateMs(peak.date)) / 864e5),
      drawdown: bottom.price / peak.price - 1
    };
  }).filter(cycle => cycle.days > 0 && Number.isFinite(cycle.drawdown));

  const avgDays = Math.round(completedCycles.reduce((sum, c) => sum + c.days, 0) / completedCycles.length);
  let athIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].price >= pts[athIdx].price) athIdx = i;
  }

  const peak = pts[athIdx];
  const last = pts[pts.length - 1];
  const elapsedDays = Math.max(0, Math.round((dateMs(last.date) - dateMs(peak.date)) / 864e5));
  const progressPct = avgDays > 0 ? (elapsedDays / avgDays) * 100 : 0;
  const drawdownPct = (last.price / peak.price - 1) * 100;
  const targetMs = addDays(peak.date, avgDays);
  const riskFloorPrice = priceAtRiskForDate(targetMs, slope, intercept, last.rollMean, last.rollStd, 0);
  let lowestRecentClose = last.price;
  for (let i = athIdx; i < pts.length; i++) {
    if (pts[i].price < lowestRecentClose) lowestRecentClose = pts[i].price;
  }
  const priceLow = Math.min(riskFloorPrice, lowestRecentClose);
  const priceHigh = Math.max(riskFloorPrice, lowestRecentClose);
  const status = athIdx === pts.length - 1 ? 'At cycle high' : drawdownPct <= -20 ? 'Active bear' : 'Cycle watch';
  const targetPrefix = progressPct > 115 ? 'Est. bottom was ' : 'Est. bottom ';

  pctEl.textContent = Math.round(progressPct) + '%';
  pctEl.style.setProperty('--val-color', riskColor(Math.min(1, progressPct / 100)));
  subEl.textContent = status + ' · ATH ' + formatHalvingDate(dateMs(peak.date)) + ' · ' + drawdownPct.toFixed(1) + '%';
  targetEl.textContent = targetPrefix + formatHalvingDate(targetMs);
  rangeEl.textContent = compactUsd(priceLow) + '–' + compactUsd(priceHigh);
  barEl.style.width = Math.max(0, Math.min(100, progressPct)) + '%';
}

// ====== MAIN ======
async function main() {
  let rawData = await loadCSV();

  // Fetch live price
  const live = await fetchLivePrice(rawData);
  const supplyHeightPromise = fetchBlockHeight();
  refreshHalvingCountdown();
  refreshDifficultyAdjustment();

  const { pts, slope, intercept } = buildDataset(rawData);
  const SAMPLE = Math.max(1, Math.floor(pts.length / 2000));
  const n = pts.length;
  const last = pts[n-1];
  const isLive = live;
  const lastDateMs = dateMs(last.date);
  const dampedFairValuePath = buildDampedFairValuePath(
    lastDateMs,
    last.trendPrice,
    slope,
    FAIR_VALUE_PROJECTION_END_MS
  );

  // Dashboard
  document.getElementById('vPrice').textContent = '$' + last.price.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('vPriceTime').textContent = last.date;
  const hd = document.getElementById('headerDate');
  hd.innerHTML = '<span style="width:6px;height:6px;background:#58c56f;border-radius:50%;flex-shrink:0;animation:pulse 2s infinite;display:inline-block"></span> as of ' + last.date + (isLive ? ' · live via ' + isLive.source : ' · historical fallback');
  document.getElementById('vRisk').textContent = last.riskCombo.toFixed(3);
  document.getElementById('vRisk').style.setProperty('--val-color', riskColor(last.riskCombo));
  document.getElementById('vFair').textContent = '$' + last.trendPrice.toLocaleString(undefined,{maximumFractionDigits:0});
  const devPct = ((last.price/last.trendPrice-1)*100).toFixed(1);
  document.getElementById('vDev').textContent = (devPct>0?'+':'') + devPct + '%';
  document.getElementById('needle').style.left = (last.riskCombo*100)+'%';
  renderWeeklyMovingAverages(rawData);
  renderBearMarketProgress(pts, slope, intercept);
  const fallbackSupplyHeight = fallbackBlockHeight(Date.now());
  renderMarketCapTable(bitcoinSupplyAtHeight(fallbackSupplyHeight), fallbackSupplyHeight, last.price);
  supplyHeightPromise.then(function(height) {
    if (Number.isFinite(height) && height > 0) {
      renderMarketCapTable(bitcoinSupplyAtHeight(height), height, last.price);
    }
  });

  // Risk-price table
  {
    const envMax = Math.max(ENV_MIN_MAX, ENV_UPPER_A + ENV_UPPER_B * last.logDays);
    const envRange = envMax - ENV_LOWER;
    const lastReg = last.regLogPrice;
    const rollMean = last.rollMean;
    const rollStd = last.rollStd;
    const tbl = document.getElementById('riskTable');
    const riskLevels=[0.01];
    for(let r=0.05;r<=0.50;r+=0.05) riskLevels.push(r);
    for(let r=0.60;r<=1.001;r+=0.10) riskLevels.push(r);
    for(const r of riskLevels){
      let lo=ENV_LOWER, hi=envMax;
      for(let it=0;it<80;it++){
        const mid=(lo+hi)/2;
        const S=(mid-ENV_LOWER)/envRange;
        const M=normCdf((mid-rollMean)/rollStd);
        if(Math.sqrt(S*M)<r) lo=mid; else hi=mid;
      }
      const price=Math.pow(10,(lo+hi)/2+lastReg);
      const cell=document.createElement('div');
      cell.className='risk-cell';
      const pStr=price>=1e6?'$'+(price/1e6).toFixed(1)+'M':price>=1e3?'$'+Math.round(price/1e3)+'K':'$'+Math.round(price);
      const pctMove=((price/last.price-1)*100).toFixed(1);
      const pctStr=pctMove>=0?'+'+pctMove+'%':pctMove+'%';
      const pctColor=pctMove>=0?'#58c56f':'#ef5d4f';
      const rLabel=r<0.02?'0.00':r.toFixed(2);
      cell.innerHTML='<div class="rc-risk" style="color:'+riskColor(r)+'">'+rLabel+'</div><div class="rc-price">'+pStr+'</div><div style="font-size:0.62rem;margin-top:3px;color:'+pctColor+';letter-spacing:0.3px">'+pctStr+'</div>';
      tbl.appendChild(cell);
    }
  }

  // ====== MARKET-CAP-DAMPED FAIR VALUE (semiannual through 2030, annual through 2040) ======
  {
    const projBody = document.getElementById('projBody');
    const todayFV = last.trendPrice;
    const todayPrice = last.price;
    const moNames = ['Jan','Feb','Mar','Apr','May','June','July','Aug','Sep','Oct','Nov','Dec'];
    const curDate = new Date(last.date + 'T00:00:00Z');
    const curYear = curDate.getUTCFullYear();
    const targets = [];
    function formatProjectionPrice(value) {
      return value >= 1e6 ? '$' + (value / 1e6).toFixed(2) + 'M' :
             value >= 1e3 ? '$' + Math.round(value).toLocaleString() :
             '$' + value.toFixed(2);
    }
    // Keep the existing June/December cadence through 2030.
    for (let y = curYear; y <= 2030; y++) {
      targets.push(new Date(Date.UTC(y, 5, 1)));  // June
      targets.push(new Date(Date.UTC(y, 11, 1))); // Dec
    }
    // After 2030, show one long-range update each December through 2040.
    for (let y = Math.max(curYear, 2031); y <= 2040; y++) {
      targets.push(new Date(Date.UTC(y, 11, 1)));
    }
    const futureDates = targets.filter(d => d.getTime() > curDate.getTime());
    for (const fd of futureDates) {
      const futureMs = fd.getTime();
      const futureDays = (futureMs - GENESIS) / 864e5;
      const futureFV = dampedFairValueAt(dampedFairValuePath, futureMs);
      const growthPct = ((futureFV / todayFV - 1) * 100).toFixed(1);
      const growthColor = growthPct >= 0 ? '#58c56f' : '#ef5d4f';
      const roiPct = ((futureFV / todayPrice - 1) * 100).toFixed(1);
      const roiColor = roiPct >= 0 ? '#58c56f' : '#ef5d4f';
      const pStr = formatProjectionPrice(futureFV);
      const dateLabel = moNames[fd.getUTCMonth()] + ' ' + fd.getUTCFullYear();
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="pj-date">' + dateLabel + '</td>' +
        '<td>' + Math.round(futureDays).toLocaleString() + '</td>' +
        '<td class="pj-price">' + pStr + '</td>' +
        '<td class="pj-growth" style="color:' + growthColor + '">' + (growthPct >= 0 ? '+' : '') + growthPct + '%</td>' +
        '<td class="pj-growth" style="color:' + roiColor + '">' + (roiPct >= 0 ? '+' : '') + roiPct + '%</td>';
      projBody.appendChild(tr);
    }
  }

  // ====== HISTORICAL RISK LOWS ======
  {
    // Intraday low prices and descriptions keyed by YYYY-MM
    const EVENT_META = {
      "2011-11": { label: "Post-bubble crash", lowPrice: 2.05, info: "Bitcoin crashed 93% from $32 to $2 after the first major bubble. Mt. Gox hacks and regulatory uncertainty crushed early adoption momentum." },
      "2012-06": { label: "Post-2011 bubble low", lowPrice: 5.21, info: "Extended bear market bottom. Bitcoin traded sideways for months before the next halving cycle ignited the 2013 rally to $1,100." },
      "2015-01": { label: "Post Mt. Gox bear bottom", lowPrice: 171.51, info: "Mt. Gox exchange collapsed in Feb 2014, losing 850K BTC. Bitcoin fell 86% from $1,100 to $170. Confidence in crypto infrastructure shattered." },
      "2015-08": { label: "Post Mt. Gox bear bottom", lowPrice: 211.08, info: "Final capitulation of the 2014-15 bear market. Bitcoin consolidated before beginning the rally that would lead to the 2017 $20K peak." },
      "2018-12": { label: "2018 bear market bottom", lowPrice: 3191.30, info: "ICO bubble burst, 85% drawdown from $20K peak. SEC crackdowns, BCH hash wars, and exhausted retail interest marked peak despair." },
      "2019-01": { label: "2018 bear market bottom", lowPrice: 3391.02, info: "Bitcoin bottomed near $3,200 after the ICO mania unwind. Institutional infrastructure (Bakkt, Fidelity) began building during the bear market." },
      "2019-02": { label: "2018 bear market bottom", lowPrice: 3394.22, info: "Final retest of the bear market lows before the recovery rally. Crypto winter thawed as fundamentals improved beneath the surface." },
      "2020-03": { label: "COVID-19 crash", lowPrice: 4860.35, info: "Global pandemic liquidity crisis. Bitcoin crashed 50% in 2 days to $3,800 as all assets were sold. Fed stimulus ignited the bull run to $69K." },
      "2022-11": { label: "FTX collapse / bear bottom", lowPrice: 15599.05, info: "FTX exchange and Alameda Research collapsed, $8B in customer funds lost. Contagion spread across crypto. Bitcoin fell to $15,500." },
      "2022-12": { label: "FTX collapse / bear bottom", lowPrice: 16256.25, info: "Post-FTX capitulation bottom. Genesis/DCG concerns lingered but selling exhausted. Set the floor for the 2023-24 recovery and ETF approvals." },
      "2026-06": { label: "2026 bear market bottom - in progress", lowPrice: 61540, info: "Potential bottoming setup still in progress: BTC is down roughly 50% from the 2025 cycle high, combined risk is back in the low-risk zone, and selling has accelerated into the model's estimated bottom window. Pressure appears tied to risk-asset de-risking, tariff/trade uncertainty, stretched equity valuations, labor-market worries, AI disruption concerns, and fading post-ETF momentum." }
    };

    function getEventMeta(dateStr) {
      const prefix = dateStr.slice(0, 7);
      if (EVENT_META[prefix]) return EVENT_META[prefix];
      const d = new Date(dateStr + 'T00:00:00Z');
      for (let offset = -2; offset <= 2; offset++) {
        if (offset === 0) continue;
        const check = new Date(d);
        check.setUTCMonth(check.getUTCMonth() + offset);
        const key = check.toISOString().slice(0, 7);
        if (EVENT_META[key]) return EVENT_META[key];
      }
      return null;
    }

    function findRiskLows(data) {
      const PEAK_THRESH = 0.65;
      const VALLEY_MAX = 0.35;
      const MIN_SEGMENT = 120;
      const dn = data.length;
      const peaks = [];
      for (let i = 30; i < dn - 30; i++) {
        if (data[i].riskCombo < PEAK_THRESH) continue;
        let isPeak = true;
        for (let j = i - 30; j <= i + 30; j++) {
          if (j !== i && data[j].riskCombo > data[i].riskCombo) { isPeak = false; break; }
        }
        if (!isPeak) continue;
        if (peaks.length > 0 && i - peaks[peaks.length - 1] < 180) {
          if (data[i].riskCombo > data[peaks[peaks.length - 1]].riskCombo) peaks[peaks.length - 1] = i;
          continue;
        }
        peaks.push(i);
      }
      const segments = [];
      for (let k = 0; k < peaks.length - 1; k++) segments.push([peaks[k], peaks[k + 1]]);
      if (peaks.length > 0 && dn - 1 - peaks[peaks.length - 1] > MIN_SEGMENT) segments.push([peaks[peaks.length - 1], dn - 1]);
      const lows = [];
      segments.forEach(function(seg) {
        var start = seg[0], end = seg[1];
        if (end - start < MIN_SEGMENT) return;
        var minIdx = start;
        for (var i = start; i <= end; i++) { if (data[i].riskCombo < data[minIdx].riskCombo) minIdx = i; }
        if (data[minIdx].riskCombo < VALLEY_MAX) lows.push({ _idx: minIdx });
      });
      return lows.map(function(l) { return Object.assign({}, data[l._idx], { _idx: l._idx }); });
    }

    function findLatest52WeekClosingLow(data) {
      if (!data.length) return null;
      const lastMs = dateMs(data[data.length - 1].date);
      const windowStartMs = lastMs - 364 * 864e5;
      let minIdx = -1;
      for (let i = data.length - 1; i >= 0; i--) {
        if (dateMs(data[i].date) < windowStartMs) break;
        if (minIdx < 0 || data[i].price < data[minIdx].price) minIdx = i;
      }
      if (minIdx < 0) return null;
      return Object.assign({}, data[minIdx], {
        _idx: minIdx,
        _latest52WeekLow: true,
        _windowStartMs: windowStartMs
      });
    }

    let lows = findRiskLows(pts);
    const latest52WeekLow = findLatest52WeekClosingLow(pts);
    if (latest52WeekLow) {
      lows = lows.filter(low => dateMs(low.date) < latest52WeekLow._windowStartMs);
      lows.push(latest52WeekLow);
      lows.sort((a, b) => a._idx - b._idx);
    }

    const tbody = document.getElementById('riskLowsBody');
    lows.forEach(low => {
      const tr = document.createElement('tr');
      const meta = low._latest52WeekLow ? {
        label: '2026 Bear Market Low - in progress',
        info: 'Latest row is anchored to the lowest BTC daily close over the trailing 52 weeks, rather than the lowest model-risk reading. This keeps the current-cycle event tied to the actual recent closing-price low as new daily data arrives.'
      } : getEventMeta(low.date);
      const price = low.price;
      const pStr = price >= 1e6 ? '$' + (price / 1e6).toFixed(1) + 'M' :
                   price >= 1000 ? '$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 }) :
                   '$' + price.toFixed(2);
      function fwdCell(idx, years) {
        var days = years * 365;
        var fIdx = Math.min(idx + days, n - 1);
        var actual = fIdx - idx;
        if (actual < days * 0.8) return '<td class="rl-return" style="color:var(--text-dimmer)">—</td>';
        var ret = ((pts[fIdx].price / pts[idx].price - 1) * 100);
        var col = ret >= 0 ? '#58c56f' : '#ef5d4f';
        return '<td class="rl-return" style="color:' + col + '">' + (ret >= 0 ? '+' : '') + Math.round(ret) + '%</td>';
      }
      function calibratedLowRisk(point) {
        const structural = point.riskMM <= 0 ? STRUCTURAL_FLOOR_BREAK_RISK : point.riskMM;
        return Math.sqrt(structural * point.riskZS);
      }
      function riskBand(score) {
        if (score < 0.05) return 'Extreme low';
        if (score < 0.15) return 'Very low';
        if (score < 0.30) return 'Low';
        if (score < 0.50) return 'Neutral';
        return 'Elevated';
      }
      function riskLowDisplay(point) {
        const score = calibratedLowRisk(point);
        return '<div>' + score.toFixed(3) + '</div><div class="rl-risk-sub">' + riskBand(score) + '</div>';
      }
      const infoHtml = meta && meta.info ? '<span class="info-btn">i<span class="info-popup">' + meta.info + '</span></span>' : '';
      const eventLabel = meta ? meta.label : '—';
      tr.innerHTML = '<td>' + low.date + '</td>' +
        '<td class="rl-event">' + eventLabel + infoHtml + '</td>' +
        '<td class="rl-price">' + pStr + '</td>' +
        '<td class="rl-risk" style="color:' + riskColor(calibratedLowRisk(low)) + '">' + riskLowDisplay(low) + '</td>' +
        fwdCell(low._idx, 1) + fwdCell(low._idx, 2) + fwdCell(low._idx, 3);
      tbody.appendChild(tr);
    });
  }

  // These charts intentionally stay on the complete historical view so the
  // log-price scale and the risk timeline always share one stable context.
  function getVisibleRange() {
    return { s: 0, e: n - 1 };
  }

  function visibleSample() {
    const { s, e } = getVisibleRange();
    const visible = e - s;
    return Math.max(1, Math.floor(visible / 1500));
  }

  // ====== RENDER PRICE CHART ======
  function renderPriceChart() {
    const tc = themeColors();
    const cv=document.getElementById('priceCanvas'), ctx=cv.getContext('2d');
    const W=cv.width, H=cv.height;
    const P={t:24,r:60,b:48,l:80};
    const cw=W-P.l-P.r, ch=H-P.t-P.b;
    const { s, e } = getVisibleRange();
    const S = visibleSample();
    const fullProjectionView = s === 0 && e === n - 1;
    const chartStartMs = dateMs(pts[s].date);
    const chartEndMs = fullProjectionView ? FAIR_VALUE_PROJECTION_END_MS : dateMs(pts[e].date);

    ctx.fillStyle=tc.canvasBg; ctx.fillRect(0,0,W,H);

    const xOfTime=ms=>P.l+((ms-chartStartMs)/(chartEndMs-chartStartMs))*cw;
    const xOf=i=>fullProjectionView ? xOfTime(dateMs(pts[i].date)) : P.l+((i-s)/(e-s))*cw;
    const visPrices = pts.slice(s,e+1).map(p=>p.price);
    if(fullProjectionView) {
      for(let i=0;i<dampedFairValuePath.length;i+=30) visPrices.push(dampedFairValuePath[i].value);
      visPrices.push(dampedFairValuePath[dampedFairValuePath.length-1].value);
    }
    const minE=Math.floor(Math.log10(Math.min(...visPrices)));
    const maxE=Math.ceil(Math.log10(Math.max(...visPrices)));
    const yOf=p=>{const lp=Math.log10(p);return P.t+ch-((lp-minE)/(maxE-minE))*ch;};
    cv.dataset.projectionEnd = fullProjectionView ? '2040-12-01' : '';
    cv.dataset.projectionPoints = fullProjectionView ? String(dampedFairValuePath.length) : '0';

    // Price grid
    ctx.textAlign='right'; ctx.font='10px JetBrains Mono';
    for(let e2=minE;e2<=maxE;e2++){
      const y=yOf(Math.pow(10,e2));
      ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);ctx.stroke();
      if(e2<maxE){const y3=yOf(3*Math.pow(10,e2));ctx.strokeStyle=tc.gridLineMinor;ctx.beginPath();ctx.moveTo(P.l,y3);ctx.lineTo(W-P.r,y3);ctx.stroke();}
      ctx.fillStyle=tc.axisText;
      const val=Math.pow(10,e2);
      ctx.fillText(val>=1000?'$'+val.toLocaleString():val>=1?'$'+val:'$'+val.toFixed(4),P.l-8,y+3);
    }

    // Year grid
    const seenYr=new Set(); ctx.textAlign='center';
    if(fullProjectionView) {
      for(let yr=new Date(chartStartMs).getUTCFullYear()+1;yr<=2040;yr++){
        if(yr%2!==0) continue;
        const x=xOfTime(Date.UTC(yr,0,1));
        ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,P.t);ctx.lineTo(x,H-P.b);ctx.stroke();
        ctx.fillStyle=tc.axisText;ctx.font='10px JetBrains Mono';ctx.fillText(yr,x,H-P.b+18);
      }
    } else {
      for(let i=s;i<=e;i+=S){
        const yr=+pts[i].date.slice(0,4);
        const mo=+pts[i].date.slice(5,7);
        const showMonth = (e-s) < 1500;
        const key = showMonth ? pts[i].date.slice(0,7) : ''+yr;
        if(!seenYr.has(key)){
          if(showMonth ? mo%3===1 : true) {
            seenYr.add(key);const x=xOf(i);
            ctx.strokeStyle=tc.gridLine;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,P.t);ctx.lineTo(x,H-P.b);ctx.stroke();
            ctx.fillStyle=tc.axisText;ctx.font='10px JetBrains Mono';
            ctx.fillText(showMonth?pts[i].date.slice(0,7):yr,x,H-P.b+18);
          }
        }
      }
    }

    // Regression
    ctx.strokeStyle=tc.regressionLine;ctx.lineWidth=1.5;ctx.setLineDash([8,5]);
    ctx.beginPath();
    for(let i=s;i<=e;i+=S){const x=xOf(i),y=yOf(pts[i].trendPrice);i===s?ctx.moveTo(x,y):ctx.lineTo(x,y);}
    ctx.stroke();ctx.setLineDash([]);

    // Market-cap-damped fair value projection
    if(fullProjectionView) {
      const forecastX=xOfTime(lastDateMs);
      ctx.fillStyle=tc.zoneA;ctx.fillRect(forecastX,P.t,W-P.r-forecastX,ch);
      ctx.strokeStyle=tc.gridZero;ctx.lineWidth=1;ctx.setLineDash([3,4]);
      ctx.beginPath();ctx.moveTo(forecastX,P.t);ctx.lineTo(forecastX,H-P.b);ctx.stroke();
      ctx.strokeStyle='#58c56f';ctx.lineWidth=2.4;ctx.setLineDash([10,5]);
      ctx.beginPath();
      // Draw the exact daily path used by the projection table and tooltip.
      for(let i=0;i<dampedFairValuePath.length;i++){
        const point=dampedFairValuePath[i];
        const x=xOfTime(point.ms), y=yOf(point.value);
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      const finalPoint=dampedFairValuePath[dampedFairValuePath.length-1];
      ctx.lineTo(xOfTime(finalPoint.ms),yOf(finalPoint.value));
      ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#58c56f';ctx.font='10px JetBrains Mono';ctx.textAlign='right';
      ctx.fillText('ADJUSTED FAIR VALUE',W-P.r-6,yOf(finalPoint.value)-8);
    }

    // Price line
    for(let i=s+S;i<=e;i+=S){
      const prev=Math.max(s,i-S);
      ctx.strokeStyle=riskColor(pts[i].riskCombo);ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(xOf(prev),yOf(pts[prev].price));ctx.lineTo(xOf(i),yOf(pts[i].price));ctx.stroke();
    }
  }

  // ====== RENDER RISK CHART ======
  function renderRiskChart() {
    const tc = themeColors();
    const cv=document.getElementById('riskCanvas'), ctx=cv.getContext('2d');
    const W=cv.width, H=cv.height;
    const P={t:16,r:76,b:48,l:80};
    const cw=W-P.l-P.r, ch=H-P.t-P.b;
    const { s, e } = getVisibleRange();
    const S = visibleSample();

    ctx.fillStyle=tc.canvasBg; ctx.fillRect(0,0,W,H);
    const xOf=i=>P.l+((i-s)/(e-s))*cw;
    const yOf=r=>P.t+ch*(1-r);

    // Zone fills
    [[0,0.20,tc.zoneA],[0.20,0.50,tc.zoneB],[0.50,0.80,tc.zoneC],[0.80,1,tc.zoneD]].forEach(([lo,hi,c])=>{
      ctx.fillStyle=c;ctx.fillRect(P.l,yOf(hi),cw,yOf(lo)-yOf(hi));
    });
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

    // Year grid
    const seenYr=new Set();ctx.textAlign='center';
    for(let i=s;i<=e;i+=S){
      const yr=+pts[i].date.slice(0,4);
      const mo=+pts[i].date.slice(5,7);
      const showMonth=(e-s)<1500;
      const key=showMonth?pts[i].date.slice(0,7):''+yr;
      if(!seenYr.has(key)){
        if(showMonth?mo%3===1:true){
          seenYr.add(key);ctx.strokeStyle=tc.gridLine;
          ctx.beginPath();ctx.moveTo(xOf(i),P.t);ctx.lineTo(xOf(i),H-P.b);ctx.stroke();
          ctx.fillStyle=tc.axisText;ctx.font='10px JetBrains Mono';
          ctx.fillText(showMonth?pts[i].date.slice(0,7):yr,xOf(i),H-P.b+18);
        }
      }
    }

    // Combo area fill
    ctx.beginPath();ctx.moveTo(xOf(s),yOf(0));
    for(let i=s;i<=e;i+=S) ctx.lineTo(xOf(i),yOf(pts[i].riskCombo));
    ctx.lineTo(xOf(e),yOf(0));ctx.closePath();
    const grd=ctx.createLinearGradient(0,yOf(1),0,yOf(0));
    grd.addColorStop(0,tc.areaGrad0);grd.addColorStop(0.5,tc.areaGrad5);grd.addColorStop(1,tc.areaGrad1);
    ctx.fillStyle=grd;ctx.fill();

    // Combined (bold colored)
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

  // ====== RENDER ALL ======
  function renderAll() {
    renderPriceChart();
    renderRiskChart();
  }

  // ====== CHART TOOLTIPS ======
  function attachChartTooltip(canvasId, tipId) {
    const cv = document.getElementById(canvasId);
    const W = cv.width;
    const P = { l:80, r: canvasId === 'priceCanvas' ? 60 : 76 };
    const cw = W - P.l - P.r;
    function fullPriceProjectionView() {
      const { s, e } = getVisibleRange();
      return canvasId === 'priceCanvas' && s === 0 && e === n - 1;
    }
    function historicalIndexForMs(ms) {
      if(ms <= dateMs(pts[0].date)) return 0;
      if(ms >= lastDateMs) return n - 1;
      let lo=0, hi=n-1;
      while(lo<hi){
        const mid=Math.floor((lo+hi)/2);
        if(dateMs(pts[mid].date)<ms) lo=mid+1; else hi=mid;
      }
      return lo;
    }
    function indexFromCanvasX(canvasX) {
      if(fullPriceProjectionView()) {
        const ratio=Math.max(0,Math.min(1,(canvasX-P.l)/cw));
        const ms=dateMs(pts[0].date)+ratio*(FAIR_VALUE_PROJECTION_END_MS-dateMs(pts[0].date));
        return historicalIndexForMs(ms);
      }
      const { s, e: end } = getVisibleRange();
      return Math.round(s + (canvasX - P.l) / cw * (end - s));
    }

    function mouseIdxFromEvent(e) {
      const rect = cv.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      return indexFromCanvasX(mx);
    }

    cv.style.cursor = 'crosshair';

    // Tooltip
    const tip = document.getElementById(tipId);
    cv.addEventListener('mousemove', e => {
      if (!document.querySelector('[data-risk-dashboard="btc"]')) return;
      const rect = cv.getBoundingClientRect();
      const scaleX = W / rect.width;
      const canvasX = (e.clientX - rect.left) * scaleX;
      const riskLabel = tip.querySelector('.tt-risk-label');
      if(fullPriceProjectionView()) {
        const ratio=Math.max(0,Math.min(1,(canvasX-P.l)/cw));
        const hoverMs=dateMs(pts[0].date)+ratio*(FAIR_VALUE_PROJECTION_END_MS-dateMs(pts[0].date));
        if(hoverMs>lastDateMs) {
          const value=dampedFairValueAt(dampedFairValuePath,hoverMs);
          tip.querySelector('.tt-date').textContent=new Date(hoverMs).toISOString().slice(0,10);
          tip.querySelector('.tt-price').textContent='$'+value.toLocaleString(undefined,{maximumFractionDigits:0});
          riskLabel.textContent='Path:';
          const riskEl=tip.querySelector('.tt-risk');
          riskEl.textContent='Adjusted fair value';
          riskEl.style.color='#58c56f';
          tip.style.display='block';
          const tipX=e.clientX-rect.left+16, tipY=e.clientY-rect.top-40;
          tip.style.left=(tipX+tip.offsetWidth>rect.width?tipX-tip.offsetWidth-32:tipX)+'px';
          tip.style.top=tipY+'px';
          return;
        }
      }
      const idx = mouseIdxFromEvent(e);
      if (idx < 0 || idx >= n) { tip.style.display='none'; return; }
      const p = pts[idx];
      if(riskLabel) riskLabel.textContent='Risk:';
      tip.querySelector('.tt-date').textContent = p.date;
      if (tip.querySelector('.tt-price')) {
        tip.querySelector('.tt-price').textContent = '$' + p.price.toLocaleString(undefined,{maximumFractionDigits:2});
      }
      const riskEl = tip.querySelector('.tt-risk');
      if (tipId === 'riskTip') {
        riskEl.textContent = 'C:'+p.riskCombo.toFixed(3)+' S:'+p.riskMM.toFixed(3)+' M:'+p.riskZS.toFixed(3);
      } else {
        riskEl.textContent = p.riskCombo.toFixed(3);
      }
      riskEl.style.color = riskColor(p.riskCombo);
      tip.style.display = 'block';
      const tipX = e.clientX - rect.left + 16;
      const tipY = e.clientY - rect.top - 40;
      tip.style.left = (tipX + tip.offsetWidth > rect.width ? tipX - tip.offsetWidth - 32 : tipX) + 'px';
      tip.style.top = tipY + 'px';
    });
    cv.addEventListener('mouseleave', () => tip.style.display='none');
  }

  // ====== MIDTERM YTD ROI CHART ======
  const MIDTERM_YEARS = [2014, 2018, 2022, 2026];

  // Build YTD ROI series for each midterm year + band + average
  function buildMidtermData() {
    const yearData = {};
    MIDTERM_YEARS.forEach(yr => { yearData[yr] = []; });
    const byYear = {};
    pts.forEach(p => {
      const yr = +p.date.slice(0, 4);
      if (MIDTERM_YEARS.includes(yr)) {
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(p);
      }
    });
    MIDTERM_YEARS.forEach(yr => {
      const data = byYear[yr];
      if (!data || !data.length) return;
      const jan1Price = data[0].price;
      data.forEach(p => {
        const d = new Date(p.date + 'T00:00:00Z');
        const jan1 = new Date(yr + '-01-01T00:00:00Z');
        const dayOfYear = Math.floor((d - jan1) / 864e5);
        yearData[yr].push({ day: dayOfYear, roi: p.price / jan1Price, date: p.date, price: p.price });
      });
    });

    // Build per-day min/max/avg using only past midterm years
    const pastMidterms = MIDTERM_YEARS.filter(y => y < 2026);
    const byDayMidterm = {};
    pastMidterms.forEach(yr => {
      yearData[yr].forEach(p => {
        if (!byDayMidterm[p.day]) byDayMidterm[p.day] = [];
        byDayMidterm[p.day].push(p.roi);
      });
    });
    const maxDayMid = Math.max(...pastMidterms.map(y => yearData[y].length ? yearData[y][yearData[y].length-1].day : 0));
    const rawBand = [];
    for (let d = 0; d <= maxDayMid; d++) {
      const vals = byDayMidterm[d];
      if (!vals || !vals.length) continue;
      const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      rawBand.push({ day: d, min, max, avg });
    }
    // Smooth the band edges with a moving average to eliminate pinch points
    const SMOOTH = 14;
    const bandData = rawBand.map((p, i) => {
      let sMin = 0, sMax = 0, sAvg = 0, count = 0;
      for (let j = Math.max(0, i - SMOOTH); j <= Math.min(rawBand.length - 1, i + SMOOTH); j++) {
        sMin += rawBand[j].min; sMax += rawBand[j].max; sAvg += rawBand[j].avg; count++;
      }
      return { day: p.day, min: sMin / count, max: sMax / count, avg: sAvg / count };
    });
    return { yearData, bandData };
  }

  function renderMidtermChart() {
    const tc = themeColors();
    const cv = document.getElementById('midtermCanvas'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const P = { t: 24, r: 90, b: 56, l: 80 };
    const cw = W - P.l - P.r, ch = H - P.t - P.b;

    ctx.fillStyle = tc.canvasBg; ctx.fillRect(0, 0, W, H);

    const { yearData, bandData } = buildMidtermData();

    // Find data range from band + 2026 data
    let minROI = 1, maxROI = 1, maxDay = 0;
    bandData.forEach(p => { minROI = Math.min(minROI, p.min); maxROI = Math.max(maxROI, p.max); maxDay = Math.max(maxDay, p.day); });
    yearData[2026].forEach(p => { minROI = Math.min(minROI, p.roi); maxROI = Math.max(maxROI, p.roi); maxDay = Math.max(maxDay, p.day); });
    const yPad = (maxROI - minROI) * 0.12;
    minROI = Math.floor((minROI - yPad) * 10) / 10;
    maxROI = Math.ceil((maxROI + yPad) * 10) / 10;
    maxDay = Math.min(365, Math.max(maxDay, 100));

    const xOf = d => P.l + (d / maxDay) * cw;
    const yOf = r => P.t + ch - ((r - minROI) / (maxROI - minROI)) * ch;

    // Horizontal grid lines
    ctx.textAlign = 'right'; ctx.font = '10px JetBrains Mono';
    for (let r = minROI; r <= maxROI + 0.001; r += 0.1) {
      const y = yOf(r);
      ctx.strokeStyle = Math.abs(r - 1.0) < 0.001 ? tc.gridZero : tc.gridLine;
      ctx.lineWidth = Math.abs(r - 1.0) < 0.001 ? 1.5 : 0.5;
      ctx.setLineDash(Math.abs(r - 1.0) < 0.001 ? [] : [4, 4]);
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = tc.axisText;
      ctx.fillText(r.toFixed(1) + 'x', P.l - 10, y + 3);
    }
    // Y-axis label
    ctx.save();
    ctx.translate(14, P.t + ch / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = tc.axisText; ctx.font = '11px JetBrains Mono'; ctx.textAlign = 'center';
    ctx.fillText('ROI', 0, 0);
    ctx.restore();

    // Vertical grid lines (dates)
    ctx.textAlign = 'center';
    const monthStarts = [0,31,59,90,120,151,181,212,243,273,304,334];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    monthStarts.forEach((d, i) => {
      if (d > maxDay) return;
      const x = xOf(d);
      ctx.strokeStyle = tc.gridLine; ctx.lineWidth = 0.5; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(x, P.t); ctx.lineTo(x, H - P.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = tc.axisText; ctx.font = '10px JetBrains Mono';
      ctx.fillText(monthNames[i], x, H - P.b + 18);
    });

    // Right Y-axis: 2026 BTC price
    const jan1Price2026 = yearData[2026].length ? yearData[2026][0].price / yearData[2026][0].roi : null;
    if (jan1Price2026) {
      ctx.textAlign = 'left'; ctx.font = '10px JetBrains Mono';
      for (let r = minROI; r <= maxROI + 0.001; r += 0.1) {
        const y = yOf(r);
        const price = jan1Price2026 * r;
        ctx.fillStyle = tc.axisText;
        ctx.fillText('$' + Math.round(price).toLocaleString(), W - P.r + 10, y + 3);
      }
      ctx.save();
      ctx.translate(W - 8, P.t + ch / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = tc.axisText; ctx.font = '11px JetBrains Mono'; ctx.textAlign = 'center';
      ctx.fillText('BTC Price', 0, 0);
      ctx.restore();
    }

    // ---- Shaded band: min to max across midterm years ----
    if (bandData.length > 1) {
      ctx.beginPath();
      bandData.forEach((p, i) => { i === 0 ? ctx.moveTo(xOf(p.day), yOf(p.max)) : ctx.lineTo(xOf(p.day), yOf(p.max)); });
      for (let i = bandData.length - 1; i >= 0; i--) ctx.lineTo(xOf(bandData[i].day), yOf(bandData[i].min));
      ctx.closePath();
      ctx.fillStyle = 'rgba(120, 125, 140, 0.45)';
      ctx.fill();
    }

    // ---- Average line (dashed white) ----
    if (bandData.length > 1) {
      ctx.strokeStyle = '#fff9ef'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.globalAlpha = 0.8;
      ctx.beginPath();
      bandData.forEach((p, i) => { i === 0 ? ctx.moveTo(xOf(p.day), yOf(p.avg)) : ctx.lineTo(xOf(p.day), yOf(p.avg)); });
      ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;

      const last = bandData[bandData.length - 1];
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'left';
      ctx.fillText('Avg', xOf(last.day) + 6, yOf(last.avg) + 3);
    }

    // ---- 2026 line (red, prominent) ----
    const data2026 = yearData[2026];
    if (data2026.length > 1) {
      ctx.strokeStyle = '#ef5d4f'; ctx.lineWidth = 3;
      ctx.beginPath();
      data2026.forEach((p, i) => { i === 0 ? ctx.moveTo(xOf(p.day), yOf(p.roi)) : ctx.lineTo(xOf(p.day), yOf(p.roi)); });
      ctx.stroke();

      // End dot
      const last = data2026[data2026.length - 1];
      ctx.beginPath(); ctx.arc(xOf(last.day), yOf(last.roi), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ef5d4f'; ctx.fill();

      // Label
      ctx.fillStyle = '#ef5d4f'; ctx.font = 'bold 11px JetBrains Mono'; ctx.textAlign = 'left';
      ctx.fillText('2026', xOf(last.day) + 8, yOf(last.roi) + 4);

      // Latest value above chart
      ctx.fillStyle = '#ef5d4f'; ctx.font = 'bold 12px JetBrains Mono'; ctx.textAlign = 'right';
      ctx.fillText('Latest: ' + last.roi.toFixed(3) + 'x ($' + Math.round(last.price).toLocaleString() + ')', W - P.r, P.t - 8);
    }

    // Build legend
    const legendEl = document.getElementById('midtermLegend');
    legendEl.innerHTML = '';
    const items = [
      { label: 'Midterm Range', color: 'rgba(120,125,140,0.55)', type: 'band' },
      { label: 'Midterm Average', color: '#fff9ef', type: 'dash' },
      { label: 'Current Year', color: '#ef5d4f', type: 'solid' },
    ];
    items.forEach(item => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.62rem;color:var(--text-dim)';
      const swatch = document.createElement('div');
      if (item.type === 'band') {
        swatch.style.cssText = 'width:24px;height:10px;background:' + item.color + ';border-radius:2px';
      } else if (item.type === 'dash') {
        swatch.style.cssText = 'width:24px;height:0;border-top:2px dashed ' + item.color;
      } else {
        swatch.style.cssText = 'width:24px;height:2px;background:' + item.color + ';border-radius:1px';
      }
      d.appendChild(swatch);
      d.appendChild(document.createTextNode(item.label));
      legendEl.appendChild(d);
    });
  }

  // Midterm chart tooltip
  (function() {
    const cv = document.getElementById('midtermCanvas');
    const tip = document.getElementById('midtermTip');
    cv.addEventListener('mousemove', function(e) {
      if (!document.querySelector('[data-risk-dashboard="btc"]')) return;
      const rect = cv.getBoundingClientRect();
      const scaleX = cv.width / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      const Pad = { t: 24, r: 90, b: 56, l: 80 };
      const chartW = cv.width - Pad.l - Pad.r;

      if (mx < Pad.l || mx > cv.width - Pad.r) { tip.style.display = 'none'; return; }

      const { yearData, bandData } = buildMidtermData();
      let maxDay = 0;
      bandData.forEach(p => { maxDay = Math.max(maxDay, p.day); });
      yearData[2026].forEach(p => { maxDay = Math.max(maxDay, p.day); });
      if (!bandData.length) { tip.style.display = 'none'; return; }
      maxDay = Math.min(365, Math.max(maxDay, 100));

      const hovDay = Math.round(((mx - Pad.l) / chartW) * maxDay);

      // Find closest band data
      const closestBand = bandData.reduce((best, p) => Math.abs(p.day - hovDay) < Math.abs(best.day - hovDay) ? p : best, bandData[0]);
      // Find closest 2026 data
      const data2026 = yearData[2026];
      const closest2026 = data2026.length ? data2026.reduce((best, p) => Math.abs(p.day - hovDay) < Math.abs(best.day - hovDay) ? p : best, data2026[0]) : null;

      const hovDate = new Date(Date.UTC(2026, 0, 1 + hovDay));
      const hovLabel = hovDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      let lines = '<div class="tt-date">' + hovLabel + '</div>';
      if (closestBand && Math.abs(closestBand.day - hovDay) <= 3) {
        lines += '<div style="color:#a59a88">Avg: ' + closestBand.avg.toFixed(3) + 'x</div>';
        lines += '<div style="color:#6c6252;font-size:0.55rem">Range: ' + closestBand.min.toFixed(3) + ' – ' + closestBand.max.toFixed(3) + '</div>';
      }
      if (closest2026 && Math.abs(closest2026.day - hovDay) <= 3) {
        lines += '<div style="color:#ef5d4f">2026: ' + closest2026.roi.toFixed(3) + 'x ($' + Math.round(closest2026.price).toLocaleString() + ')</div>';
      }
      tip.innerHTML = lines;
      tip.style.display = 'block';
      tip.style.left = (e.clientX - rect.left + 16) + 'px';
      tip.style.top = (e.clientY - rect.top - 10) + 'px';
    });
    cv.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  })();

  // ====== INIT ======
  renderAll();
  renderMidtermChart();
  attachChartTooltip('priceCanvas', 'priceTip');
  attachChartTooltip('riskCanvas', 'riskTip');

  // Legend bar — labeled segments
  (function(){
    const el=document.getElementById('legendBar');
    const segments=[
      {name:'Accumulate',range:'0.00–0.25',risk:0.12},
      {name:'Neutral',range:'0.25–0.50',risk:0.37},
      {name:'Caution',range:'0.50–0.75',risk:0.62},
      {name:'Euphoria',range:'0.75–1.00',risk:0.88}
    ];
    el.innerHTML='';
    segments.forEach(s=>{
      const d=document.createElement('div');
      d.className='legend-seg';
      d.style.background=riskColor(s.risk,0.2);
      d.style.color=riskColor(s.risk);
      d.innerHTML=s.name+'<span class="seg-label">'+s.range+'</span>';
      el.appendChild(d);
    });
  })();

  // Repaint canvas charts when the shared Next.js theme changes.
  window.addEventListener('davey-theme-change', function() {
    if (!document.querySelector('[data-risk-dashboard="btc"]')) return;
    renderAll();
    renderMidtermChart();
  });
}

main();

setInterval(refreshHalvingCountdown, 6 * 60 * 60 * 1000);
setInterval(refreshDifficultyAdjustment, 6 * 60 * 60 * 1000);

// Reinitialize the full model once per UTC date change so open tabs refresh
// every card, chart, table, and projection from the newest daily dataset.
const PAGE_LOAD_UTC_DATE = new Date().toISOString().slice(0, 10);
setInterval(function () {
  if (new Date().toISOString().slice(0, 10) !== PAGE_LOAD_UTC_DATE) {
    window.location.reload();
  }
}, 5 * 60 * 1000);

// Auto-refresh BTC price every 60 seconds
setInterval(async function () {
  try {
    const live = await fetchCurrentBtcPrice();
    if (!live) return;
    const price = live.price;
    const dt = live.updatedAt;
    const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const el = document.getElementById('vPrice');
    const sub = document.getElementById('vPriceTime');
    if (el) el.textContent = '$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (sub) sub.textContent = 'Updated ' + timeStr + ' via ' + live.source;
  } catch {}
}, 60000);
