/**
 * DaveyBitcoins Cloudflare Worker
 *
 * 1. Proxies Finnhub API calls (hides API key from browser)
 * 2. Triggers GitHub Actions workflows on a reliable cron schedule
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ====== FINNHUB PROXY ======
async function handleFinnhubProxy(request, env) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');

  if (!symbol) {
    return new Response(JSON.stringify({ error: 'Missing symbol parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${env.FINNHUB_KEY}`;
  const resp = await fetch(finnhubUrl);
  const data = await resp.json();

  return new Response(JSON.stringify(data), {
    status: resp.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      ...CORS_HEADERS,
    },
  });
}

// ====== YAHOO FINANCE OPTIONS PROXY ======
let yahooCrumb = null;
let yahooCookie = null;
let crumbExpiry = 0;

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

async function handleOptionsProxy(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/'); // /api/options/NVDA
  const symbol = parts[3]?.toUpperCase();
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'Missing symbol' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  try {
    await getYahooCrumb();
    let yahooUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(yahooCrumb)}`;
    const date = url.searchParams.get('date');
    if (date) yahooUrl += `&date=${date}`;

    let resp = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Cookie': yahooCookie,
      },
    });

    // Retry once on auth failure
    if (resp.status === 401) {
      yahooCrumb = null;
      crumbExpiry = 0;
      await getYahooCrumb();
      yahooUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(yahooCrumb)}` + (date ? `&date=${date}` : '');
      resp = await fetch(yahooUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': yahooCookie,
        },
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
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
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Finnhub quote proxy: /api/quote?symbol=SPY
    if (url.pathname === '/api/quote') {
      return handleFinnhubProxy(request, env);
    }

    // Yahoo Finance options proxy: /api/options/NVDA?date=1716595200
    if (url.pathname.startsWith('/api/options/')) {
      return handleOptionsProxy(request);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', time: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
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
