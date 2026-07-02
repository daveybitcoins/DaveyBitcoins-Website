/**
 * DaveyBitcoins Cloudflare Worker
 *
 * 1. Proxies Finnhub API calls (hides API key from browser)
 * 2. Triggers GitHub Actions workflows on a reliable cron schedule
 */

const ALLOWED_ORIGINS = ['https://daveybitcoins.com', 'https://www.daveybitcoins.com', 'http://localhost:3000'];
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.:-]{0,14}$/;

function corsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(request, body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...corsHeaders(request),
    },
  });
}

function errorResponse(request, message, status = 400, extraHeaders = {}) {
  return jsonResponse(request, { error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function normalizeSymbol(value) {
  const symbol = (value || '').trim().toUpperCase();
  return SYMBOL_RE.test(symbol) ? symbol : null;
}

// ====== FINNHUB PROXY ======
async function handleFinnhubProxy(request, env) {
  const url = new URL(request.url);
  const symbol = normalizeSymbol(url.searchParams.get('symbol'));

  if (!symbol) {
    return errorResponse(request, 'Missing or invalid symbol parameter');
  }

  try {
    const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${env.FINNHUB_KEY}`;
    const resp = await fetch(finnhubUrl);
    const data = await resp.json();
    const cacheHeader = resp.ok ? 'public, max-age=60' : 'no-store';

    return jsonResponse(request, data, {
      status: resp.status,
      headers: {
        'Cache-Control': cacheHeader,
      },
    });
  } catch (err) {
    return errorResponse(request, err.message, 502);
  }
}

// ====== FINNHUB BATCH QUOTES PROXY ======
const BATCH_CONCURRENCY = 10;
async function handleFinnhubBatchProxy(request, env) {
  const url = new URL(request.url);
  const symbols = (url.searchParams.get('symbols') || '')
    .split(',')
    .map(normalizeSymbol)
    .filter(Boolean)
    .slice(0, 50);

  if (!symbols.length) {
    return errorResponse(request, 'Missing or invalid symbols parameter');
  }

  const results = [];
  for (let i = 0; i < symbols.length; i += BATCH_CONCURRENCY) {
    const chunk = symbols.slice(i, i + BATCH_CONCURRENCY);
    const batch = await Promise.all(
      chunk.map(async (symbol) => {
        try {
          const resp = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${env.FINNHUB_KEY}`
          );
          const data = await resp.json();
          return [symbol, data];
        } catch (err) {
          console.warn(`Finnhub fetch failed for ${symbol}:`, err.message);
          return [symbol, { error: 'fetch failed' }];
        }
      })
    );
    results.push(...batch);
  }

  return jsonResponse(request, Object.fromEntries(results), {
    headers: {
      'Cache-Control': 'public, max-age=60',
    },
  });
}

// ====== DIVIDEND HISTORY PROXY ======
let yahooCrumb = null;
let yahooCookie = null;
let crumbExpiry = 0;

function normalizeMassiveDividend(item) {
  const exDate = item?.ex_dividend_date;
  const amount = Number(item?.cash_amount);
  if (!exDate || !Number.isFinite(amount) || amount <= 0) return null;

  const payment = {
    ex_date: exDate,
    amount: Math.round(amount * 10000) / 10000,
  };
  if (item.pay_date) payment.pay_date = item.pay_date;
  if (item.record_date) payment.record_date = item.record_date;
  if (item.declaration_date) payment.declaration_date = item.declaration_date;
  return payment;
}

async function fetchMassiveDividendHistory(symbol, env) {
  if (!env.MASSIVE_API_KEY) return null;

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    ticker: symbol,
    'ex_dividend_date.gte': oneYearAgo,
    limit: '100',
    sort: 'ex_dividend_date.asc',
    apiKey: env.MASSIVE_API_KEY,
  });
  const massiveUrl = `https://api.massive.com/stocks/v1/dividends?${params.toString()}`;
  const resp = await fetch(massiveUrl, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) throw new Error(`Massive dividends failed: ${resp.status}`);

  const data = await resp.json();
  const deduped = {};
  for (const item of data?.results || []) {
    const payment = normalizeMassiveDividend(item);
    if (payment) deduped[payment.ex_date] = payment;
  }

  return Object.values(deduped)
    .sort((a, b) => a.ex_date.localeCompare(b.ex_date))
    .slice(-12);
}

async function getYahooCrumb() {
  if (yahooCrumb && Date.now() < crumbExpiry) return;
  // Step 1: Get consent cookie
  const consentResp = await fetch('https://fc.yahoo.com', {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  });
  const raw = consentResp.headers.get('set-cookie') || '';
  const cookies = raw.split(',').map(c => c.trim().split(';')[0]).filter(Boolean).join('; ');
  // Step 2: Get crumb
  const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Cookie': cookies,
    },
  });
  if (!crumbResp.ok) throw new Error('Failed to get Yahoo crumb: ' + crumbResp.status);
  yahooCrumb = await crumbResp.text();
  yahooCookie = cookies;
  crumbExpiry = Date.now() + 25 * 60 * 1000; // cache 25 min
}

async function fetchYahooDividendHistory(symbol) {
  await getYahooCrumb();
  // Fetch last 12 months of dividend events
  const now = Math.floor(Date.now() / 1000);
  const oneYearAgo = now - 365 * 86400;
  const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${oneYearAgo}&period2=${now}&interval=1mo&events=div&crumb=${encodeURIComponent(yahooCrumb)}`;

  let resp = await fetch(yahooUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Cookie': yahooCookie,
    },
  });

  if (resp.status === 401) {
    yahooCrumb = null;
    crumbExpiry = 0;
    await getYahooCrumb();
    resp = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${oneYearAgo}&period2=${now}&interval=1mo&events=div&crumb=${encodeURIComponent(yahooCrumb)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Cookie': yahooCookie } }
    );
  }

  const data = await resp.json();
  const events = data?.chart?.result?.[0]?.events?.dividends || {};
  return Object.values(events)
    .map(e => ({
      ex_date: new Date(e.date * 1000).toISOString().slice(0, 10),
      amount: Math.round(e.amount * 10000) / 10000,
    }))
    .sort((a, b) => a.ex_date.localeCompare(b.ex_date));
}

async function handleDividendHistoryProxy(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const symbol = normalizeSymbol(parts[3]);
  if (!symbol) {
    return errorResponse(request, 'Missing or invalid symbol');
  }

  try {
    let source = 'massive';
    let payments = await fetchMassiveDividendHistory(symbol, env);
    if (!payments || payments.length === 0) {
      source = 'yahoo';
      payments = await fetchYahooDividendHistory(symbol);
    }

    return jsonResponse(request, { symbol, payments, source }, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return errorResponse(request, err.message, 500);
  }
}

// ====== GITHUB WORKFLOW TRIGGER ======
async function triggerGitHubWorkflow(env, workflowFile) {
  const resp = await fetch(
    `https://api.github.com/repos/daveybitcoins/DaveyBitcoins-Website/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'DaveyBitcoins-Worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );
  return resp.status;
}

// ====== REQUEST HANDLER ======
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    const url = new URL(request.url);

    // Finnhub quote proxy: /api/quote?symbol=SPY
    if (url.pathname === '/api/quote') {
      return handleFinnhubProxy(request, env);
    }

    // Finnhub batch quotes: /api/quotes?symbols=AAPL,MSFT,O
    if (url.pathname === '/api/quotes') {
      return handleFinnhubBatchProxy(request, env);
    }

    // Dividend history: /api/dividends/AAPL
    if (url.pathname.startsWith('/api/dividends/')) {
      return handleDividendHistoryProxy(request, env);
    }

    // Health check
    if (url.pathname === '/health') {
      return jsonResponse(request, { status: 'ok', time: new Date().toISOString() });
    }

    return new Response('Not found', { status: 404 });
  },

  // ====== CRON HANDLER ======
  async scheduled(event, env, ctx) {
    // Trigger the "Update price data" workflow
    // The EMA scanner auto-chains via workflow_run trigger
    const status = await triggerGitHubWorkflow(env, 'update-csv.yml');
    console.log(`Triggered update-csv.yml — GitHub responded ${status}`);
  },
};
