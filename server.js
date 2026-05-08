const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Prevent Chrome from caching HTML pages (so updated cache-bust params take effect)
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
});

// Yahoo Finance options proxy — handles crumb/cookie auth + CORS
let yahooCrumb = null;
let yahooCookie = null;
let crumbExpiry = 0;

async function getYahooCrumb() {
    if (yahooCrumb && Date.now() < crumbExpiry) return;
    // Step 1: Get consent cookie
    const consentResp = await fetch('https://fc.yahoo.com', {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    });
    const setCookies = consentResp.headers.getSetCookie?.() || [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');
    // Step 2: Get crumb
    const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Cookie': cookies
        }
    });
    if (!crumbResp.ok) throw new Error('Failed to get Yahoo crumb: ' + crumbResp.status);
    yahooCrumb = await crumbResp.text();
    yahooCookie = cookies;
    crumbExpiry = Date.now() + 30 * 60 * 1000; // cache 30 min
}

app.get('/api/options/:symbol', async (req, res) => {
    const symbol = encodeURIComponent(req.params.symbol.toUpperCase());
    try {
        await getYahooCrumb();
        let url = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?crumb=${encodeURIComponent(yahooCrumb)}`;
        if (req.query.date) url += `&date=${req.query.date}`;
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                'Cookie': yahooCookie
            }
        });
        if (!resp.ok) {
            // Invalidate crumb on auth failure and retry once
            if (resp.status === 401) {
                yahooCrumb = null;
                crumbExpiry = 0;
                await getYahooCrumb();
                const retryUrl = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?crumb=${encodeURIComponent(yahooCrumb)}` + (req.query.date ? `&date=${req.query.date}` : '');
                const retry = await fetch(retryUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Cookie': yahooCookie }
                });
                if (!retry.ok) return res.status(retry.status).json({ error: `Yahoo returned ${retry.status}` });
                return res.json(await retry.json());
            }
            return res.status(resp.status).json({ error: `Yahoo returned ${resp.status}` });
        }
        res.json(await resp.json());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Yahoo Finance dividend history proxy
app.get('/api/dividends/:symbol', async (req, res) => {
    const symbol = encodeURIComponent(req.params.symbol.toUpperCase());
    try {
        await getYahooCrumb();
        const now = Math.floor(Date.now() / 1000);
        const oneYearAgo = now - 365 * 86400;
        let url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${oneYearAgo}&period2=${now}&interval=1mo&events=div&crumb=${encodeURIComponent(yahooCrumb)}`;

        let resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                'Cookie': yahooCookie
            }
        });

        if (resp.status === 401) {
            yahooCrumb = null;
            crumbExpiry = 0;
            await getYahooCrumb();
            url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${oneYearAgo}&period2=${now}&events=div&crumb=${encodeURIComponent(yahooCrumb)}`;
            resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Cookie': yahooCookie }
            });
        }

        const data = await resp.json();
        const events = data?.chart?.result?.[0]?.events?.dividends || {};
        const payments = Object.values(events)
            .map(e => ({
                ex_date: new Date(e.date * 1000).toISOString().slice(0, 10),
                amount: Math.round(e.amount * 10000) / 10000,
            }))
            .sort((a, b) => a.ex_date.localeCompare(b.ex_date));

        res.json({ symbol: req.params.symbol.toUpperCase(), payments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// This tells Express to serve your index.html and any other static files (like data.csv) in this folder
app.use(express.static(path.join(__dirname)));

// Start the server
app.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
});