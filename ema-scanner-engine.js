/* eslint-disable */
/* Generated from js/app.js by scripts/sync-risk-assets.mjs. */
(function () {
    "use strict";

    let DATA = null;
    let sortState = {}; // { tabId: { col: string, asc: boolean } }
    let filterState = {}; // { tabId: { search: "", selectedTickers: [], filters: { key: value } } }
    let tabRegistry = {}; // { tabId: { data, tableId, renderRowFn } }

    // === URL STATE ===
    function syncURL() {
        var params = new URLSearchParams();
        // Active tab
        var activeTab = document.querySelector(".tab.active");
        if (activeTab && activeTab.dataset.tab !== "dashboard") {
            params.set("tab", activeTab.dataset.tab);
        }
        // Per-tab state: only persist for the active tab
        var tabId = activeTab ? activeTab.dataset.tab : null;
        if (tabId && filterState[tabId]) {
            var st = filterState[tabId];
            if (st.selectedTickers && st.selectedTickers.length > 0) {
                params.set("tickers", st.selectedTickers.join(","));
            }
            if (st.search) {
                params.set("q", st.search);
            }
            Object.entries(st.filters || {}).forEach(function(entry) {
                var key = entry[0], val = entry[1];
                if (Array.isArray(val) && val.length > 0) {
                    params.set("f_" + key, val.join(","));
                }
            });
        }
        if (tabId && sortState[tabId]) {
            var ss = sortState[tabId];
            params.set("sort", ss.col);
            params.set("asc", ss.asc ? "1" : "0");
        }
        var qs = params.toString();
        var url = window.location.pathname + (qs ? "?" + qs : "");
        history.replaceState(null, "", url);
    }

    function restoreFromURL() {
        var params = new URLSearchParams(window.location.search);
        // Restore active tab
        var tab = params.get("tab");
        if (tab) {
            var tabBtn = document.querySelector('.tab[data-tab="' + tab + '"]');
            if (tabBtn) {
                document.querySelectorAll(".tab").forEach(function(b) { b.classList.remove("active"); });
                document.querySelectorAll(".tab-content").forEach(function(s) { s.classList.remove("active"); });
                tabBtn.classList.add("active");
                var tabContent = document.getElementById("tab-" + tab);
                if (tabContent) tabContent.classList.add("active");
            }
        }
        var tabId = tab || "dashboard";
        // Restore tickers
        var tickers = params.get("tickers");
        if (tickers && filterState[tabId]) {
            filterState[tabId].selectedTickers = tickers.split(",").map(function(t) { return t.trim().toUpperCase(); }).filter(Boolean);
            renderChips(tabId);
        }
        // Restore search
        var q = params.get("q");
        if (q && filterState[tabId]) {
            filterState[tabId].search = q;
            var input = document.querySelector('.search-input[data-tab-id="' + tabId + '"]');
            if (input) input.value = q;
        }
        // Restore multi-select filters
        if (filterState[tabId]) {
            params.forEach(function(val, key) {
                if (key.startsWith("f_")) {
                    var filterKey = key.slice(2);
                    var values = val.split(",");
                    filterState[tabId].filters[filterKey] = values;
                    // Check the corresponding checkboxes
                    document.querySelectorAll('.multi-select[data-tab-id="' + tabId + '"][data-key="' + filterKey + '"] input[type="checkbox"]').forEach(function(cb) {
                        cb.checked = values.includes(cb.value);
                    });
                    // Update badge
                    var ms = document.querySelector('.multi-select[data-tab-id="' + tabId + '"][data-key="' + filterKey + '"]');
                    if (ms) {
                        var badge = ms.querySelector(".multi-select-badge");
                        if (badge) { badge.textContent = values.length; badge.style.display = ""; }
                    }
                }
            });
        }
        // Restore sort
        var sortCol = params.get("sort");
        var sortAsc = params.get("asc");
        if (sortCol && filterState[tabId]) {
            sortState[tabId] = { col: sortCol, asc: sortAsc !== "0" };
            // Apply sort to the data
            if (tabRegistry[tabId]) {
                var data = tabRegistry[tabId].data;
                var asc = sortAsc !== "0";
                data.sort(function(a, b) {
                    var va = a[sortCol], vb = b[sortCol];
                    if (typeof va === "string") {
                        va = va.toLowerCase();
                        vb = (vb || "").toLowerCase();
                        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
                    }
                    va = va ?? 0; vb = vb ?? 0;
                    return asc ? va - vb : vb - va;
                });
                // Update header styles
                var tableEl = document.getElementById(tabRegistry[tabId].tableId);
                if (tableEl) {
                    var ths = tableEl.querySelectorAll("thead th");
                    ths.forEach(function(h) { h.classList.remove("sorted-asc", "sorted-desc"); });
                    ths.forEach(function(h, i) {
                        // Match by finding the header def — use textContent comparison as fallback
                        if (h.textContent.trim().toLowerCase().replace(/[^a-z0-9]/g, "").includes(sortCol.replace(/[^a-z0-9]/g, ""))) {
                            h.classList.add(asc ? "sorted-asc" : "sorted-desc");
                        }
                    });
                }
            }
            applyFilters(tabId);
        } else if (filterState[tabId]) {
            applyFilters(tabId);
        }
    }

    // === INIT ===
    async function init() {
        try {
            const [scannerResp] = await Promise.all([
                fetch("/data/scanner_data.json?v=" + Date.now()),
                computeBtcRisk(),
                computeSpyRisk()
            ]);
            lastRiskRefreshClose = riskMarketCloseKey(new Date());
            DATA = await scannerResp.json();
            document.getElementById("loading").style.display = "none";
            document.getElementById("data-date").innerHTML =
                `<span class="pill pill-date">Data: ${DATA.meta.date}</span><span class="pill pill-count">${DATA.meta.total_stocks} stocks</span>`;
            renderIndexHeader();
            renderAll();
            setupTabs();
            setupScrollFade();
            requestAnimationFrame(sizeTableWraps);
            restoreFromURL();
        } catch (err) {
            document.getElementById("loading").textContent =
                "Error loading data. Run: python3 scripts/process_ema.py";
            console.error(err);
        }
    }

    // === TABS ===
    function setupTabs() {
        document.querySelectorAll(".tab").forEach((btn) => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
                document.querySelectorAll(".tab-content").forEach((s) => s.classList.remove("active"));
                btn.classList.add("active");
                document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
                // Scroll to top — sticky header stays in place
                window.scrollTo({ top: 0, behavior: "instant" });
                syncURL();
                requestAnimationFrame(sizeTableWraps);
            });
        });
    }

    // === RENDER ALL ===
    function renderAll() {
        renderDashboard();
        renderScanner();
        renderPullbacks();
        renderMomentum();
        renderBears();
        renderOpportunities();
        renderOutperformers();
        renderSectors();
        renderCrossovers();
    }

    // === HELPERS ===
    function fmt(val, decimals = 2) {
        if (val == null || isNaN(val)) return "-";
        return Number(val).toFixed(decimals);
    }

    function fmtPct(val) {
        if (val == null || isNaN(val)) return "-";
        const s = (val >= 0 ? "+" : "") + Number(val).toFixed(2) + "%";
        return s;
    }

    function fmtPrice(val) {
        if (val == null) return "-";
        if (val >= 10000) return "$" + Number(val).toLocaleString("en-US", { maximumFractionDigits: 0 });
        return "$" + Number(val).toFixed(2);
    }

    function fmtCap(val) {
        if (val == null) return "-";
        return "$" + Number(val).toFixed(1) + "B";
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (ch) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
        });
    }

    function safeNoteType(type, fallback) {
        const value = String(type || fallback || "caution");
        return /^[a-z0-9_-]+$/i.test(value) ? value : fallback;
    }

    function colorClass(val) {
        if (val > 0) return "pos";
        if (val < 0) return "neg";
        return "neutral";
    }

    function signalClass(signal) {
        if (signal === "Full Bull") return "signal-full-bull";
        if (signal.startsWith("Bull Pullback")) return "signal-bull-pullback";
        if (signal === "Bull Breakdown") return "signal-bull-breakdown";
        if (signal === "Bullish (unstacked)") return "signal-bullish-unstacked";
        if (signal === "Full Bear") return "signal-full-bear";
        if (signal.startsWith("Bear Rally")) return "signal-bear-rally";
        if (signal === "Bearish (unstacked)") return "signal-bearish-unstacked";
        return "";
    }

    function signalBadge(signal) {
        signal = signal || "";
        return `<span class="signal ${signalClass(signal)}">${escapeHtml(signal)}</span>`;
    }

    function volBadge(volQuality) {
        if (!volQuality || volQuality === "Normal" || volQuality === "Normal Vol") {
            return `<span class="vol-badge vol-normal">Normal Vol</span>`;
        }
        if (volQuality === "Low Vol") {
            return `<span class="vol-badge vol-low">Low Vol</span>`;
        }
        if (volQuality === "High Vol") {
            return `<span class="vol-badge vol-high">High Vol</span>`;
        }
        return `<span class="vol-badge vol-normal">${escapeHtml(volQuality)}</span>`;
    }

    const SPECIAL_SECTOR_FILTERS = {
        MAG7: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA"]
    };

    function matchesSpecialSectorFilter(row, filterName) {
        const symbols = SPECIAL_SECTOR_FILTERS[filterName];
        return !!(symbols && row.symbol && symbols.includes(row.symbol.toUpperCase()));
    }

    function pctCell(val) {
        return `<td class="num ${colorClass(val)}">${fmtPct(val)}</td>`;
    }

    function formatAlert(text) {
        if (!text) return "-";
        return text.split("; ").map((part) => {
            if (part.includes("bullish cross potential")) {
                return `<span class="alert-bull">${escapeHtml(part)}</span>`;
            } else if (part.includes("bearish cross risk")) {
                return `<span class="alert-bear">${escapeHtml(part)}</span>`;
            }
            return escapeHtml(part);
        }).join("<br>");
    }

    // === INDEX CONTEXT ===
    const WORKER_URL = 'https://daveybitcoins-api.dave-erazo78.workers.dev';

    function currentSummary() {
        const summary = DATA.ai_summary;
        if (!summary?.market_overview || !DATA.meta?.date || !DATA.meta?.generated_at
            || (DATA.meta.latest_completed_session && DATA.meta.latest_completed_session !== DATA.meta.date)
            || summary.source_date !== DATA.meta.date
            || summary.source_generated_at !== DATA.meta.generated_at
            || String(summary.model || "").toLowerCase().includes("claude")) return null;
        return summary;
    }

    function renderIndexHeader() {
        if (!DATA.index_context || DATA.index_context.length === 0) return;
        const el = document.getElementById("data-date");
        let html = el.innerHTML;
        if (DATA.meta.latest_completed_session && DATA.meta.date < DATA.meta.latest_completed_session) {
            html += `<span class="pill pill-neutral">Equity update pending · latest close ${escapeHtml(DATA.meta.latest_completed_session)}</span>`;
        }
        DATA.index_context.forEach(idx => {
            const cls = idx.symbol === "BTC" ? "pill-btc" : idx.symbol === "SPY" ? "pill-spy" : "pill-qqq";
            html += `<span class="pill ${cls}" id="pill-${escapeHtml(idx.symbol)}"><strong>${escapeHtml(idx.symbol)}</strong> <span class="pill-price">${fmtPrice(idx.price)}</span></span>`;
        });
        if (DATA.vix_context) {
            const vix = DATA.vix_context.level;
            const cls = vix < 15 ? "pill-vix-low" : vix < 20 ? "pill-vix-mid" : vix < 30 ? "pill-vix-high" : "pill-vix-extreme";
            const dailyPct = vix / Math.sqrt(252);
            const spyIdx = DATA.index_context.find(i => i.symbol === "SPY");
            const dailyDollar = spyIdx ? (spyIdx.price * dailyPct / 100) : null;
            let vixText = `<strong>VIX</strong> <span class="pill-price">${vix.toFixed(1)}</span> <span class="pill-detail">±${dailyPct.toFixed(2)}%`;
            if (dailyDollar) vixText += ` / ±$${dailyDollar.toFixed(2)}`;
            vixText += `</span>`;
            html += `<span class="pill ${cls}" id="pill-VIX">${vixText}</span>`;
        }
        const summary = currentSummary();
        if (summary) {
            const s = summary.market_overview;
            const cls = s.bias === "bullish" ? "pill-bull" : s.bias === "bearish" ? "pill-bear" : "pill-neutral";
            html += `<span class="pill ${cls}">${escapeHtml(s.bias_label)}</span>`;
        }
        el.innerHTML = html;
        refreshLivePrices();
    }

    async function refreshLivePrices() {
        const updates = [];
        updates.push(
            fetch(WORKER_URL + '/api/quote?symbol=SPY', { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null).then(d => d && d.c ? { symbol: 'SPY', price: d.c, timestamp: d.t } : null).catch(() => null),
            fetch(WORKER_URL + '/api/quote?symbol=QQQ', { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null).then(d => d && d.c ? { symbol: 'QQQ', price: d.c, timestamp: d.t } : null).catch(() => null),
            fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true', { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null).then(d => d && d.bitcoin ? { symbol: 'BTC', price: d.bitcoin.usd, timestamp: d.bitcoin.last_updated_at } : null).catch(() => null)
        );
        const results = await Promise.all(updates);
        results.forEach(r => {
            if (!r) return;
            // Update header pill
            const pill = document.getElementById('pill-' + r.symbol);
            if (pill) {
                const priceEl = pill.querySelector('.pill-price');
                if (priceEl) priceEl.textContent = fmtPrice(r.price);
                if (Number.isFinite(r.timestamp) && r.timestamp > 0) {
                    let stamp = pill.querySelector('.quote-time');
                    if (!stamp) { stamp = document.createElement('span'); stamp.className = 'quote-time'; pill.appendChild(stamp); }
                    stamp.textContent = ' · Quote ' + new Date(r.timestamp * 1000).toISOString().slice(0,16).replace('T',' ') + ' UTC';
                }
            }
            // Header quotes are live; analytical cards retain their saved price.
        });
    }

    setInterval(function() {
        if (document.visibilityState === 'hidden') return;
        refreshLivePrices();
        refreshRiskCards();
    }, 60000);
    // The timer checks eligibility; risk data is fetched only once after each
    // weekday close. Explicit New York time also handles daylight saving time.
    function riskMarketCloseKey(now) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York', weekday: 'short', year: 'numeric',
            month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
        }).formatToParts(now).map(part => [part.type, part.value]));
        if (parts.weekday === 'Sat' || parts.weekday === 'Sun' || Number(parts.hour) < 16) return null;
        return `${parts.year}-${parts.month}-${parts.day}`;
    }
    let lastRiskRefreshClose = null;
    let riskRefreshing = false;
    async function refreshRiskCards() {
        const closeKey = riskMarketCloseKey(new Date());
        if (!closeKey || closeKey === lastRiskRefreshClose || !DATA || riskRefreshing || document.visibilityState === 'hidden') return;
        lastRiskRefreshClose = closeKey;
        riskRefreshing = true;
        try {
            await Promise.all([computeBtcRisk(), computeSpyRisk()]);
            document.querySelectorAll('.index-context-card').forEach(card => {
                card.outerHTML = renderIndexCard();
            });
        } finally { riskRefreshing = false; }
    }
    document.addEventListener('visibilitychange', refreshRiskCards);

    function riskColor(r) {
        const stops = [[0,[104,130,156]],[0.16,[80,155,118]],[0.32,[88,197,111]],[0.48,[255,191,99]],[0.64,[247,147,26]],[0.78,[228,96,69]],[0.90,[239,93,79]],[1,[122,32,25]]];
        let lo = stops[0], hi = stops[stops.length - 1];
        for (let i = 0; i < stops.length - 1; i++) {
            if (r >= stops[i][0] && r <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
        }
        const t = (r - lo[0]) / (hi[0] - lo[0] || 1);
        const c = lo[1].map((v, j) => Math.round(v + t * (hi[1][j] - v)));
        return `rgb(${c[0]},${c[1]},${c[2]})`;
    }

    function classifyRisk(risk, symbol = "SPY") {
        const limits = [0.1, symbol === 'BTC' ? 0.25 : 0.3, 0.5, 0.75, 0.9, Infinity];
        const names = ['Generational', 'Accumulate', 'Neutral', 'Elevated', 'Caution', 'Euphoria'];
        const colors = ['#5b9ed1', '#62b582', '#d4b94f', '#d99048', '#d57350', '#d65d65'];
        const i = limits.findIndex(limit => risk < limit);
        return { zone: names[i], zone_color: colors[i] };
    }

    function renderRiskBar(risk_combo, zone, zone_color, href, label, riskLabel) {
        if (risk_combo == null) return "";
        const r = risk_combo;
        const color = riskColor(r);
        const barGrad = "linear-gradient(90deg,#68829c 0%,#509b76 18%,#58c56f 34%,#ffbf63 52%,#f7931a 70%,#e46045 86%,#7a2019 100%)";
        const model = riskLabel === "200W Risk" ? "200w-trailing20y-weekly" : "combined-structural-momentum";
        return `
            <div class="risk-bar-wrap" data-risk-asset="${label}" data-risk-model="${model}" data-risk-value="${r.toFixed(6)}" style="margin-top:0.5rem;padding:0.4rem 0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;">
                    <span class="index-risk-label">${riskLabel}</span>
                    <strong style="color:${color};font-family:'JetBrains Mono',monospace;font-size:0.85rem;">${r.toFixed(3)}</strong>
                </div>
                <div style="position:relative;height:6px;margin:0.3rem 0;border-radius:3px;background:${barGrad};">
                    <div style="position:absolute;top:-2px;left:${r*100}%;width:2px;height:10px;background:#fff;border-radius:1px;transform:translateX(-1px);box-shadow:0 0 3px rgba(0,0,0,0.5);"></div>
                </div>
                <div style="text-align:center;font-size:0.7rem;font-weight:600;color:${zone_color || color};letter-spacing:0.05em;">${(zone || "").toUpperCase()}</div>
                <div style="display:flex;justify-content:space-between;margin-top:0.25rem;font-size:0.56rem;color:var(--text-dim);opacity:0.75;">
                    <span>0.10</span><span>${label === "BTC" ? "0.25" : "0.30"}</span><span>0.50</span><span>0.75</span><span>0.90</span>
                </div>
                ${href ? `<a href="${href}" style="display:block;text-align:center;margin-top:0.3rem;font-size:0.65rem;color:var(--accent);text-decoration:none;opacity:0.8;">View Full ${label} Metric \u2192</a>` : ''}
            </div>`;
    }

    function renderBtcRisk(idx) {
        const src = btcRiskData;
        if (!src) return "";
        return renderRiskBar(src.risk_combo, src.zone, src.zone_color, "/risk-metric/", "BTC", "Combined Risk");
    }

    // BTC combined risk — computed client-side from data.csv + live CoinGecko price
    let btcRiskData = null;

    async function computeBtcRisk() {
        try {
            const { bitcoinSnapshot } = await import('/market-models.js?v=158dd10817750812');
            const resp = await fetch('/data.csv?v=' + Date.now());
            if (!resp.ok) throw new Error('BTC history unavailable');
            const raw = (await resp.text()).trim().split('\n').slice(1).map(row => {
                const [date, price] = row.split(',');
                return [date, Number(price)];
            }).filter(row => Number.isFinite(row[1]) && row[1] > 0);
            try {
                const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true', { signal: AbortSignal.timeout(5000) });
                const data = await response.json();
                const price = data.bitcoin?.usd, timestamp = data.bitcoin?.last_updated_at;
                if (Number.isFinite(price) && price > 0 && Number.isFinite(timestamp) && timestamp > 0 && timestamp * 1000 <= Date.now() + 60000 && Date.now() - timestamp * 1000 <= 3600000) {
                    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
                    if (date === raw.at(-1)[0]) raw.at(-1)[1] = price;
                    else if (date > raw.at(-1)[0]) raw.push([date, price]);
                }
            } catch { /* Use saved history when quotes are unavailable. */ }
            const point = bitcoinSnapshot(raw);
            btcRiskData = Object.assign({ risk_combo: point.risk }, classifyRisk(point.risk, 'BTC'));
        } catch (e) {
            console.warn('BTC risk computation failed:', e);
        }
    }

    // SPY uses the dashboard weekly model with its live-price overlay.
    let spyRiskData = null;

    async function computeEquityRisk(symbol, csvUrl) {
        const resp = await fetch(csvUrl + '?v=' + Date.now());
        if (!resp.ok) throw new Error('Risk history unavailable');
        const text = await resp.text();
        const rows = text.trim().split('\n').slice(1);
        const raw = rows.map(row => {
            const [date, price] = row.split(',');
            return [date, parseFloat(price)];
        }).filter(row => !isNaN(row[1]));

        let quote = null;
        try {
            const response = await fetch(WORKER_URL + '/api/quote?symbol=' + symbol, { signal: AbortSignal.timeout(5000) });
            if (response.ok) quote = await response.json();
        } catch { /* Fall back to the saved weekly signal. */ }
        const { spySnapshot } = await import('/market-models.js?v=158dd10817750812');
        const point = spySnapshot(raw, quote);
        return Object.assign({ risk_combo: point.risk }, classifyRisk(point.risk, symbol));
    }

    async function computeSpyRisk() {
        try {
            spyRiskData = await computeEquityRisk('SPY', '/data_spy.csv');
        } catch (e) {
            console.warn('SPY risk computation failed:', e);
        }
    }

    function renderSpyRisk() {
        if (!spyRiskData) return "";
        return renderRiskBar(spyRiskData.risk_combo, spyRiskData.zone, spyRiskData.zone_color, "/spy-risk-metric/", "SPY", "200W Risk");
    }

    function renderIndexCard() {
        if (!DATA.index_context || DATA.index_context.length === 0) return "";
        return `
            <div class="card index-context-card">
                <h2>Market Index Context</h2>
                <p class="index-data-note" style="color:var(--text-dim);font-size:0.75rem;margin:0 0 1rem;">Equities as of ${escapeHtml(DATA.meta.date)} (completed session).${DATA.index_context.find(idx => idx.symbol === 'BTC')?.as_of ? ` BTC as of ${escapeHtml(DATA.index_context.find(idx => idx.symbol === 'BTC').as_of)}; refreshes independently.` : ''} Header quotes refresh live when available.</p>
                <div class="stats-row">
                    ${DATA.index_context.filter(idx => idx.symbol !== 'QQQ').map(idx => `
                        <div class="stat-box">
                            <div class="value" style="font-size:1.2rem;">
                                ${idx.symbol === 'BTC' ? `<a href="/risk-metric/" style="color:inherit;text-decoration:none;">${idx.symbol}</a>` : idx.symbol === 'SPY' ? `<a href="/spy-risk-metric/" style="color:inherit;text-decoration:none;">${idx.symbol}</a>` : idx.symbol} ${signalBadge(idx.signal)} ${idx.vol_quality ? volBadge(idx.vol_quality) : ''}
                            </div>
                            <div class="label index-price-row"><strong class="index-price">${fmtPrice(idx.price)}</strong> <span class="${colorClass(idx.chg_1d)}">${fmtPct(idx.chg_1d)}</span> <span style="font-size:0.7rem;color:var(--text-dim);">${idx.rel_vol ? idx.rel_vol.toFixed(2) + 'x vol' : ''}</span></div>
                            <div class="index-ma-grid">
                                ${[[8, idx.ema8, idx.price_vs_8w], [13, idx.ema13, idx.price_vs_13w], [21, idx.ema21, idx.price_vs_21w]].map(([weeks, average, change]) => `
                                    <div class="index-ma ${colorClass(change)}">
                                        <strong class="index-ma-value"><span class="index-ma-label">${weeks}W:</span> ${fmtPrice(average)}</strong>
                                        <span class="index-ma-change">${fmtPct(change)} vs ${weeks}W</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="index-performance">
                                <span><strong>1D:</strong> <span class="${colorClass(idx.chg_1d)}">${fmtPct(idx.chg_1d)}</span></span>
                                <span><strong>1W:</strong> <span class="${colorClass(idx.chg_1w)}">${fmtPct(idx.chg_1w)}</span></span>
                                <span><strong>1M:</strong> <span class="${colorClass(idx.chg_1m)}">${fmtPct(idx.chg_1m)}</span></span>
                            </div>
                            ${idx.crossover_alert && !['SPY','QQQ','BTC'].includes(idx.symbol) ? `<div class="alert-text" style="font-size:0.72rem;margin:0.4rem auto 0;padding:0.35rem 0.5rem;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--bg);">${formatAlert(idx.crossover_alert)}</div>` : ''}
                            ${idx.symbol === 'BTC' ? renderBtcRisk(idx) : idx.symbol === 'SPY' ? renderSpyRisk() : ''}
                        </div>
                    `).join("")}
                </div>
            </div>`;
    }

    // === FILTER / SEARCH ===
    function registerTab(tabId, data, tableId, renderRowFn) {
        tabRegistry[tabId] = { data, tableId, renderRowFn };
        if (!filterState[tabId]) {
            filterState[tabId] = { search: "", selectedTickers: [], filters: {} };
        }
    }

    function buildToolbar(tabId, data, headers) {
        const filterHeaders = headers.filter((h) => h.filter);
        let html = '<div class="toolbar">';
        html += '<div class="ticker-search-wrap" data-tab-id="' + tabId + '">';
        html += '<div class="ticker-chips" id="chips-' + tabId + '"></div>';
        html += '<input type="text" class="search-input" placeholder="Search ticker or name\u2026" data-tab-id="' + tabId + '">';
        html += '<div class="ticker-dropdown" id="dropdown-' + tabId + '"></div>';
        html += '</div>';
        if (filterHeaders.some((h) => h.key === "sector")) {
            Object.keys(SPECIAL_SECTOR_FILTERS).forEach((filterName) => {
                html += '<button type="button" class="multi-select-btn special-filter-btn" data-tab-id="' + tabId + '" data-key="sector" data-value="' + escapeHtml(filterName) + '">' + escapeHtml(filterName) + '</button>';
            });
        }
        filterHeaders.forEach((h) => {
            let values = [...new Set(data.map((d) => d[h.key]))].filter(Boolean).sort();
            if (h.key === "sector") {
                values = Object.keys(SPECIAL_SECTOR_FILTERS).concat(values);
            }
            if (values.length > 1) {
                const id = 'ms-' + tabId + '-' + h.key;
                html += '<div class="multi-select" id="' + id + '" data-tab-id="' + tabId + '" data-key="' + h.key + '">';
                var pluralLabel = h.label.endsWith('s') || h.label.endsWith('y') ? h.label : h.label + 's';
                html += '<button type="button" class="multi-select-btn">All ' + pluralLabel + ' <span class="multi-select-badge" style="display:none"></span></button>';
                html += '<div class="multi-select-dropdown">';
                values.forEach((v) => {
                    html += '<label class="multi-select-item"><input type="checkbox" value="' + escapeHtml(v) + '"> ' + escapeHtml(v) + '</label>';
                });
                html += '<div class="multi-select-clear">Clear all</div>';
                html += '</div></div>';
            }
        });
        html += '<span class="filter-count" id="count-' + tabId + '"></span>';
        html += '</div>';
        return html;
    }

    function applyFilters(tabId) {
        const { data, tableId, renderRowFn } = tabRegistry[tabId];
        const state = filterState[tabId];
        let filtered = data;

        // If tickers are pinned, filter to only those symbols
        if (state.selectedTickers && state.selectedTickers.length > 0) {
            const pinned = state.selectedTickers.map(t => t.toUpperCase());
            filtered = filtered.filter((d) => d.symbol && pinned.includes(d.symbol.toUpperCase()));
        }

        // Text search further narrows (or live-filters if no chips)
        if (state.search) {
            const q = state.search.toLowerCase();
            filtered = filtered.filter((d) =>
                (d.symbol && d.symbol.toLowerCase().includes(q)) ||
                (d.name && d.name.toLowerCase().includes(q))
            );
        }

        Object.entries(state.filters).forEach(([key, val]) => {
            if (Array.isArray(val) && val.length > 0) {
                if (key === "sector") {
                    filtered = filtered.filter((d) =>
                        val.includes(d[key]) ||
                        val.some((filterName) => matchesSpecialSectorFilter(d, filterName))
                    );
                } else {
                    filtered = filtered.filter((d) => val.includes(d[key]));
                }
            } else if (val && !Array.isArray(val)) {
                if (key === "sector") {
                    filtered = filtered.filter((d) => d[key] === val || matchesSpecialSectorFilter(d, val));
                } else {
                    filtered = filtered.filter((d) => d[key] === val);
                }
            }
        });

        const table = document.getElementById(tableId);
        if (table) {
            table.querySelector("tbody").innerHTML = filtered.map(renderRowFn).join("");
        }

        const countEl = document.getElementById("count-" + tabId);
        if (countEl) {
            countEl.textContent = filtered.length < data.length
                ? filtered.length + " of " + data.length
                : "";
        }
        syncSpecialFilterButtons(tabId);
        syncURL();
    }

    function syncMultiSelectControl(tabId, key) {
        const selected = filterState[tabId] && Array.isArray(filterState[tabId].filters[key])
            ? filterState[tabId].filters[key]
            : [];
        const ms = document.querySelector('.multi-select[data-tab-id="' + tabId + '"][data-key="' + key + '"]');
        if (!ms) return;
        ms.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.checked = selected.includes(cb.value);
        });
        const badge = ms.querySelector(".multi-select-badge");
        if (badge) {
            if (selected.length > 0) {
                badge.textContent = selected.length;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    function syncSpecialFilterButtons(tabId) {
        const state = filterState[tabId];
        if (!state) return;
        document.querySelectorAll('.special-filter-btn[data-tab-id="' + tabId + '"]').forEach((btn) => {
            const selected = state.filters[btn.dataset.key];
            const isActive = Array.isArray(selected) && selected.includes(btn.dataset.value);
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function renderChips(tabId) {
        const container = document.getElementById("chips-" + tabId);
        if (!container) return;
        const tickers = filterState[tabId].selectedTickers || [];
        container.innerHTML = tickers.map(t =>
            '<span class="ticker-chip">' + escapeHtml(t) + '<button type="button" class="chip-remove" data-ticker="' + escapeHtml(t) + '">&times;</button></span>'
        ).join("");
        container.querySelectorAll(".chip-remove").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const ticker = btn.dataset.ticker;
                filterState[tabId].selectedTickers = filterState[tabId].selectedTickers.filter(t => t !== ticker);
                renderChips(tabId);
                applyFilters(tabId);
            });
        });
    }

    function showDropdown(tabId, query) {
        const dropdown = document.getElementById("dropdown-" + tabId);
        if (!dropdown || !tabRegistry[tabId]) return;
        const data = tabRegistry[tabId].data;
        const selected = filterState[tabId].selectedTickers || [];
        const q = query.toLowerCase();

        if (!q) { dropdown.innerHTML = ""; dropdown.style.display = "none"; return; }

        const matches = data.filter(d =>
            (d.symbol && d.symbol.toLowerCase().includes(q)) ||
            (d.name && d.name.toLowerCase().includes(q))
        ).filter(d => !selected.includes(d.symbol))
         .slice(0, 8);

        if (matches.length === 0) { dropdown.innerHTML = ""; dropdown.style.display = "none"; return; }

        dropdown.innerHTML = matches.map(d =>
            '<div class="ticker-option" data-symbol="' + escapeHtml(d.symbol) + '"><strong>' + escapeHtml(d.symbol) + '</strong> <span>' + escapeHtml(d.name) + '</span></div>'
        ).join("");
        dropdown.style.display = "block";

        dropdown.querySelectorAll(".ticker-option").forEach(opt => {
            opt.addEventListener("mousedown", (e) => {
                e.preventDefault();
                addTicker(tabId, opt.dataset.symbol);
            });
        });
    }

    function addTicker(tabId, symbol) {
        const state = filterState[tabId];
        if (!state.selectedTickers) state.selectedTickers = [];
        const upper = symbol.toUpperCase();
        if (state.selectedTickers.includes(upper)) return;
        state.selectedTickers.push(upper);
        state.search = "";
        const input = document.querySelector('.search-input[data-tab-id="' + tabId + '"]');
        if (input) input.value = "";
        const dropdown = document.getElementById("dropdown-" + tabId);
        if (dropdown) { dropdown.innerHTML = ""; dropdown.style.display = "none"; }
        renderChips(tabId);
        applyFilters(tabId);
    }

    function setupToolbar(tabId) {
        const searchInput = document.querySelector('.search-input[data-tab-id="' + tabId + '"]');
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                filterState[tabId].search = e.target.value;
                showDropdown(tabId, e.target.value);
                applyFilters(tabId);
            });
            searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const q = searchInput.value.trim();
                    if (!q) return;
                    // Try exact symbol match first, then first dropdown match
                    const data = tabRegistry[tabId] ? tabRegistry[tabId].data : [];
                    const exact = data.find(d => d.symbol && d.symbol.toUpperCase() === q.toUpperCase());
                    if (exact) {
                        addTicker(tabId, exact.symbol);
                    } else {
                        const partial = data.find(d =>
                            (d.symbol && d.symbol.toLowerCase().includes(q.toLowerCase())) ||
                            (d.name && d.name.toLowerCase().includes(q.toLowerCase()))
                        );
                        if (partial) addTicker(tabId, partial.symbol);
                    }
                } else if (e.key === "Backspace" && !searchInput.value) {
                    // Remove last chip on backspace in empty input
                    const tickers = filterState[tabId].selectedTickers;
                    if (tickers && tickers.length > 0) {
                        tickers.pop();
                        renderChips(tabId);
                        applyFilters(tabId);
                    }
                }
            });
            searchInput.addEventListener("blur", () => {
                setTimeout(() => {
                    const dropdown = document.getElementById("dropdown-" + tabId);
                    if (dropdown) { dropdown.style.display = "none"; }
                }, 150);
            });
            searchInput.addEventListener("focus", () => {
                if (searchInput.value.trim()) showDropdown(tabId, searchInput.value);
            });
        }
        document.querySelectorAll('.special-filter-btn[data-tab-id="' + tabId + '"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                const value = btn.dataset.value;
                const filters = filterState[tabId].filters;
                const selected = Array.isArray(filters[key]) ? filters[key].slice() : [];
                const idx = selected.indexOf(value);
                if (idx >= 0) selected.splice(idx, 1);
                else selected.push(value);
                filters[key] = selected;
                syncMultiSelectControl(tabId, key);
                applyFilters(tabId);
            });
        });
        // Multi-select dropdowns
        document.querySelectorAll('.multi-select[data-tab-id="' + tabId + '"]').forEach((ms) => {
            const key = ms.dataset.key;
            const btn = ms.querySelector('.multi-select-btn');
            const badge = ms.querySelector('.multi-select-badge');
            const checkboxes = ms.querySelectorAll('input[type="checkbox"]');
            const clearBtn = ms.querySelector('.multi-select-clear');
            const label = btn.textContent.trim();

            function updateState() {
                const selected = [];
                checkboxes.forEach((cb) => { if (cb.checked) selected.push(cb.value); });
                filterState[tabId].filters[key] = selected;
                if (selected.length > 0) {
                    badge.textContent = selected.length;
                    badge.style.display = '';
                } else {
                    badge.style.display = 'none';
                }
                applyFilters(tabId);
            }

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other open multi-selects
                document.querySelectorAll('.multi-select.open').forEach((other) => {
                    if (other !== ms) other.classList.remove('open');
                });
                ms.classList.toggle('open');
            });

            checkboxes.forEach((cb) => {
                cb.addEventListener('change', updateState);
            });

            clearBtn.addEventListener('click', () => {
                checkboxes.forEach((cb) => { cb.checked = false; });
                updateState();
            });
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.multi-select')) {
                document.querySelectorAll('.multi-select.open').forEach((ms) => ms.classList.remove('open'));
            }
        });
    }

    // === SORTABLE TABLE ===
    function makeSortable(tableEl, data, tabId, renderRowFn, headerDefs) {
        const thead = tableEl.querySelector("thead tr");
        thead.querySelectorAll("th").forEach((th, i) => {
            th.addEventListener("click", () => {
                const key = headerDefs[i].key;
                if (!key) return;
                const state = sortState[tabId] || {};
                const asc = state.col === key ? !state.asc : headerDefs[i].defaultAsc !== false;
                sortState[tabId] = { col: key, asc };

                data.sort((a, b) => {
                    let va = a[key], vb = b[key];
                    if (typeof va === "string") {
                        va = va.toLowerCase();
                        vb = (vb || "").toLowerCase();
                        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
                    }
                    va = va ?? 0;
                    vb = vb ?? 0;
                    return asc ? va - vb : vb - va;
                });

                // Update header styles
                thead.querySelectorAll("th").forEach((h) => {
                    h.classList.remove("sorted-asc", "sorted-desc");
                });
                th.classList.add(asc ? "sorted-asc" : "sorted-desc");

                // Re-render body (respects active filters)
                if (tabRegistry[tabId]) {
                    applyFilters(tabId);
                } else {
                    const tbody = tableEl.querySelector("tbody");
                    tbody.innerHTML = data.map(renderRowFn).join("");
                }
            });
        });
    }

    // === AI SUMMARY ===
    // === DASHBOARD (merged with AI Summary) ===
    function renderDashboard() {
        const el = document.getElementById("tab-dashboard");
        const d = DATA.dashboard;
        const s = currentSummary();

        const bullCount = d.signals
            .filter((s) => ["Full Bull", "Bullish (unstacked)", "Bull Pullback \u2192 13W", "Bull Pullback \u2192 21W"].includes(s.signal))
            .reduce((sum, s) => sum + s.count, 0);
        const bearCount = d.signals
            .filter((s) => ["Full Bear", "Bearish (unstacked)", "Bear Rally \u2192 13W", "Bear Rally above 13W"].includes(s.signal))
            .reduce((sum, s) => sum + s.count, 0);

        let aiHtml = "";
        if (s && s.market_overview) {
            aiHtml = `
            <div class="card">
                <h2>${escapeHtml(s.market_overview.headline)}</h2>
                <p>${escapeHtml(s.market_overview.detail)}</p>
                <p class="summary-meta">Equity snapshot: ${escapeHtml(s.source_date)}. Generated by Codex &mdash;
                   ${new Date(s.generated_at).toLocaleString()}</p>
            </div>

            ${s.news_drivers && s.news_drivers.items && s.news_drivers.items.length > 0 ? `
            <div class="card">
                <h2>${escapeHtml(s.news_drivers.headline || "What Moved Markets")}</h2>
                ${s.news_drivers.summary ? '<p>' + escapeHtml(s.news_drivers.summary) + '</p>' : ''}
                <ul class="news-drivers-list">
                    ${s.news_drivers.items.map(item => `
                        <li>${escapeHtml(item.text)}</li>
                    `).join("")}
                </ul>
            </div>` : ''}

            ${s.reversal_candidates.items.length > 0 ? `
            <div class="card">
                <h2>${escapeHtml(s.reversal_candidates.headline)}</h2>
                <div class="notes-grid">
                    ${s.reversal_candidates.items.map(item => `
                        <div class="note-item ${safeNoteType(item.type, "bull")}">
                            <strong>${escapeHtml(item.symbol)} ${signalBadge(item.signal)}</strong>
                            ${item.crossover_detail
                                ? '<span class="alert-text"><span class="alert-bull">'
                                  + escapeHtml(item.crossover_detail) + '</span></span><br>'
                                : ''}
                            ${escapeHtml(item.note)}
                        </div>
                    `).join("")}
                </div>
            </div>` : ''}

            ${s.pullback_setups.items.length > 0 ? `
            <div class="card">
                <h2>${escapeHtml(s.pullback_setups.headline)}</h2>
                <div class="notes-grid">
                    ${s.pullback_setups.items.map(item => `
                        <div class="note-item ${safeNoteType(item.type, "bull")}">
                            <strong>${escapeHtml(item.symbol)} ${signalBadge(item.signal)} ${item.vol_quality ? volBadge(item.vol_quality) : ''}</strong>
                            ${item.price_vs_21w != null
                                ? '<span class="num ' + colorClass(item.price_vs_21w) + '">'
                                  + fmtPct(item.price_vs_21w) + ' vs 21W</span><br>'
                                : ''}
                            ${escapeHtml(item.note)}
                        </div>
                    `).join("")}
                </div>
            </div>` : ''}

            <div class="card">
                <h2>${escapeHtml(s.risk_warnings.headline)}</h2>
                <div class="notes-grid">
                    ${s.risk_warnings.items.map(item => `
                        <div class="note-item ${safeNoteType(item.type, "caution")}">
                            ${escapeHtml(item.text)}
                        </div>
                    `).join("")}
                </div>
            </div>`;
        }

        el.innerHTML = `
            ${renderIndexCard()}

            ${renderBreadthCard()}

            <div class="stats-row">
                <div class="stat-box">
                    <div class="value">${d.total}</div>
                    <div class="label">Total Stocks</div>
                </div>
                <div class="stat-box">
                    <div class="value pos">${bullCount}</div>
                    <div class="label">Bullish</div>
                </div>
                <div class="stat-box">
                    <div class="value neg">${bearCount}</div>
                    <div class="label">Bearish</div>
                </div>
                <div class="stat-box">
                    <div class="value" style="color:var(--yellow)">${d.total - bullCount - bearCount}</div>
                    <div class="label">Transitional</div>
                </div>
            </div>

            ${aiHtml}
        `;
    }

    // === MARKET BREADTH ===
    function renderBreadthGuidance(bc) {
        const short = bc.above_50d, long = bc.above_200d;
        const valid = [short, long].every(v => Number.isFinite(v) && v >= 0 && v <= 100);
        const condition = !valid ? "unavailable" : short === 50 || long === 50 ? "midpoint"
            : short > 50 ? (long > 50 ? "broad" : "recovery") : (long > 50 ? "caution" : "concern");
        const states = {
            broad: ["Broad participation", "Most stocks are above both their medium- and long-term averages.", "var(--green)"],
            caution: ["Caution — weak short-term participation", "Most stocks are below their 50-day average, while a majority remain above their 200-day average.", "var(--yellow)"],
            concern: ["Elevated concern — widespread weakness", "Most stocks are below both their 50-day and 200-day averages. Persistence would strengthen this warning.", "var(--red)"],
            recovery: ["Recovery attempt", "A majority are above their 50-day average, but longer-term participation remains weak. This describes the current mix, not a confirmed upward trend.", "var(--yellow)"],
            midpoint: ["At the 50% boundary", "At least one measure is evenly split. Watch which side of 50% participation holds over subsequent sessions.", "var(--text-dim)"],
            unavailable: ["Guidance unavailable", "Valid 50-day and 200-day breadth readings are needed to assess participation.", "var(--text-dim)"],
        };
        const [label, description, color] = states[condition];
        const g = bc.guidance?.as_of === DATA.meta.date && bc.guidance.condition === condition ? bc.guidance : null;
        const change = field => {
            const value = g?.change_5_sessions?.[field];
            return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)} pp` : "Unavailable";
        };
        return `<section class="breadth-guidance" aria-labelledby="breadth-guidance-heading">
            <h3 id="breadth-guidance-heading">Breadth guidance</h3>
            <p class="breadth-guidance-status" style="color:${color}">${label}</p>
            <p>${description}</p>
            <div class="breadth-guidance-metrics">
                <div><strong>${g?.consecutive_sessions > 0 ? `${g.consecutive_sessions} recorded session${g.consecutive_sessions === 1 ? "" : "s"}` : "History unavailable"}</strong><span>Consecutive sessions in this condition</span></div>
                <div><strong>${change("above_50d")}</strong><span>50-day breadth · five-session change</span></div>
                <div><strong>${change("above_200d")}</strong><span>200-day breadth · five-session change</span></div>
            </div>
            <p><strong>Watch for deterioration:</strong> 200-day breadth holds below 50% while 50-day breadth remains below 50%; rallies fail to broaden participation.</p>
            <p><strong>Watch for improvement:</strong> 50-day breadth holds above 50% and 200-day participation stabilizes or improves.</p>
            <details><summary>How to read this guidance</summary>
                <ul><li>Broad participation: both readings above 50%.</li><li>Caution: 50-day below 50%, 200-day above 50%.</li><li>Elevated concern: both below 50%.</li><li>Recovery attempt: 50-day above 50%, 200-day below 50%.</li></ul>
                <p>Exactly 50% is a boundary. Persistence uses NYSE sessions; missing observations break the count. Changes compare with exactly five sessions earlier, in percentage points (pp); missing endpoints are unavailable. Snapshot dates are not independently verified close timestamps.</p>
            </details>
            <p class="breadth-guidance-note">Top ${bc.total_stocks} stocks by market cap, not S&amp;P 500 breadth. Descriptive rules, not backtested buy/sell signals. “Oversold” means low relative to recent history; it does not confirm a bottom.</p>
        </section>`;
    }

    function renderBreadthCard() {
        const bc = DATA.breadth_context;
        if (!bc) return "";

        const indicators = [
            { key: "above_5d", label: "Above 5D MA", shortLabel: "5D" },
            { key: "above_20d", label: "Above 20D MA", shortLabel: "20D" },
            { key: "above_50d", label: "Above 50D MA", shortLabel: "50D" },
            { key: "above_200d", label: "Above 200D MA", shortLabel: "200D" },
        ];

        function breadthColor(val) {
            if (val >= 70) return "var(--green)";
            if (val >= 30) return "var(--yellow)";
            return "var(--red)";
        }

        function breadthZone(val) {
            if (val >= 70) return "Strong";
            if (val >= 50) return "Healthy";
            if (val >= 30) return "Mixed";
            return "Weak";
        }

        const statBoxes = indicators.map(ind => {
            const val = bc[ind.key];
            return `<div class="stat-box">
                <div class="value" style="color:${breadthColor(val)}">${val == null ? "—" : val.toFixed(1) + "%"}</div>
                <div class="label">${ind.label}</div>
                <div style="font-size:0.7rem;color:${breadthColor(val)};margin-top:2px">${val == null ? "Unavailable" : breadthZone(val)} · ${bc.valid_counts?.[ind.key] ?? bc.total_stocks} valid stocks</div>
            </div>`;
        }).join("");

        // Historical stats table
        const stats = bc.stats;
        let statsHtml = "";
        if (stats) {
            function zoneColor(zone) {
                if (zone.includes("Extreme Oversold")) return "var(--green)";
                if (zone.includes("Oversold")) return "#58c56f";
                if (zone.includes("Extreme Overbought")) return "var(--red)";
                if (zone.includes("Overbought")) return "#f7931a";
                return "var(--text-dim)";
            }

            function zoneSignal(zone) {
                if (zone.includes("Extreme Oversold")) return "Historically bullish — high probability rebound zone";
                if (zone.includes("Oversold")) return "Approaching rebound levels — watch for reversal";
                if (zone.includes("Extreme Overbought")) return "Historically bearish — elevated pullback risk";
                if (zone.includes("Overbought")) return "Extended — momentum may be peaking";
                return "No extreme signal";
            }

            const compositeColor = stats.composite_score <= 10 ? "var(--green)"
                : stats.composite_score <= 20 ? "#58c56f"
                : stats.composite_score <= 40 ? "var(--yellow)"
                : stats.composite_score <= 60 ? "var(--text-dim)"
                : stats.composite_score <= 80 ? "var(--yellow)"
                : stats.composite_score <= 90 ? "#f7931a"
                : "var(--red)";

            const statsRows = stats.indicators.map(ind => `
                <tr>
                    <td><strong>${ind.label}</strong></td>
                    <td class="num" style="color:${breadthColor(ind.current)};font-weight:700">${ind.current.toFixed(1)}%</td>
                    <td class="num">${ind.percentile.toFixed(0)}th</td>
                    <td style="color:${zoneColor(ind.zone)};font-weight:600;text-align:center">${ind.zone}</td>
                    <td class="num" style="color:var(--text-dim)">${ind.hist_avg.toFixed(0)}%</td>
                    <td class="num" style="color:var(--text-dim)">${ind.p10.toFixed(0)}%</td>
                    <td class="num" style="color:var(--text-dim)">${ind.p90.toFixed(0)}%</td>
                    <td class="num" style="color:var(--text-dim)">${ind.hist_min.toFixed(0)}%&ndash;${ind.hist_max.toFixed(0)}%</td>
                </tr>`).join("");

            // Historical changes in breadth (percentage points, not investment returns)
            let forwardHtml = "";
            const fr = stats.forward_returns;
            if (fr && fr.length > 0) {
                const frRows = fr.map(ind => {
                    const dirColor = ind.direction === "oversold" ? "var(--green)" : "var(--red)";
                    const dirLabel = ind.zone || (ind.direction === "oversold" ? "Oversold" : "Overbought");
                    const actionWord = ind.direction === "oversold" ? "higher" : "lower";
                    return ind.horizons.map((h, i) => {
                        const chgColor = h.avg_change > 0 ? "var(--green)" : "var(--red)";
                        const pctColor = h.pct_revert >= 80 ? "var(--green)" : h.pct_revert >= 60 ? "var(--yellow)" : "var(--text-dim)";
                        return `<tr>
                            ${i === 0 ? `<td rowspan="${ind.horizons.length}" style="vertical-align:middle;border-right:1px solid var(--border)"><strong>${ind.label}</strong><br><span style="font-size:0.7rem;color:${dirColor}">${ind.current.toFixed(1)}% (${dirLabel})</span></td>` : ""}
                            <td class="num">+${h.days} sessions</td>
                            <td class="num" style="color:${chgColor};font-weight:700">${h.avg_change > 0 ? "+" : ""}${h.avg_change.toFixed(1)}pp</td>
                            <td class="num" style="color:${chgColor}">${h.median_change > 0 ? "+" : ""}${h.median_change.toFixed(1)}pp</td>
                            <td class="num" style="color:${pctColor};font-weight:700">${h.pct_revert.toFixed(0)}% ${actionWord}</td>
                            <td class="num" style="color:var(--text-dim)">${h.occurrences}</td>
                        </tr>`;
                    }).join("");
                }).join("");

                forwardHtml = `
                    <h3 style="margin-top:20px;margin-bottom:4px">Historical Breadth Changes</h3>
                    <p style="color:var(--text-dim);font-size:0.78rem;margin-bottom:10px">Changes in breadth, not investment returns. Oversold: starting breadth at or below today; overbought: at or above today. Horizons use NYSE sessions and skip missing target dates. Samples overlap and are not independent.</p>
                    <div class="table-wrap">
                        <table>
                            <thead><tr>
                                <th>Indicator</th>
                                <th>Horizon</th>
                                <th>Avg Change</th>
                                <th>Median Change</th>
                                <th>Direction Frequency</th>
                                <th>Observations</th>
                            </tr></thead>
                            <tbody>${frRows}</tbody>
                        </table>
                    </div>
                `;
            }

            statsHtml = `
                <div style="margin-top:16px">
                    <div class="stats-row">
                        <div class="stat-box" style="flex:2">
                            <div class="value" style="color:${compositeColor};font-size:2.2rem">${stats.composite_score.toFixed(0)}</div>
                            <div class="label">Composite Breadth Score</div>
                            <div style="font-size:0.72rem;color:${compositeColor};margin-top:2px;font-weight:600">${stats.composite_zone}</div>
                        </div>
                        <div class="stat-box" style="flex:3;text-align:left;padding:0.8rem 1rem">
                            <ul style="font-size:0.75rem;color:var(--text-dim);margin:0;padding:0 0 0 1rem;list-style:none;line-height:1.6">
                                <li><strong style="color:var(--green)">0&ndash;10</strong> Extreme Oversold</li>
                                <li><strong style="color:#58c56f">10&ndash;20</strong> Oversold</li>
                                <li><strong style="color:var(--yellow)">20&ndash;40</strong> Weak</li>
                                <li><strong style="color:var(--text-dim)">40&ndash;60</strong> Neutral</li>
                                <li><strong style="color:var(--yellow)">60&ndash;80</strong> Healthy</li>
                                <li><strong style="color:#f7931a">80&ndash;90</strong> Overbought</li>
                                <li><strong style="color:var(--red)">90&ndash;100</strong> Extreme Overbought</li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="table-wrap" style="margin-top:12px">
                    <table>
                        <thead><tr>
                            <th>Indicator</th>
                            <th>Current</th>
                            <th>Percentile</th>
                            <th>Zone</th>
                            <th>Hist Avg</th>
                            <th>10th %ile</th>
                            <th>90th %ile</th>
                            <th>Sample Range</th>
                        </tr></thead>
                        <tbody>${statsRows}</tbody>
                    </table>
                </div>
                ${forwardHtml}
            `;
        }

        return `
            <div class="card">
                <h2>Market Breadth — % Above Moving Averages</h2>
                <p style="color:var(--text-dim);font-size:0.8rem">Computed from top ${bc.total_stocks} stocks by market cap. This custom universe differs from S&amp;P 500 breadth indexes. Weekly indicators may include the unfinished week. <strong>Last updated: ${DATA.meta.date}</strong>${(() => { const today = new Date().toISOString().slice(0,10); const diff = Math.floor((new Date(today) - new Date(DATA.meta.date)) / 864e5); return diff > 1 ? ` <span style="color:var(--red);font-weight:700">⚠ ${diff} days old</span>` : ''; })()}</p>
                <div class="stats-row">${statBoxes}</div>
                ${renderBreadthGuidance(bc)}
                <p style="color:var(--text-dim);font-size:0.78rem">${escapeHtml(bc.history_basis || '')} ${stats ? `${stats.history_days} observations, ${stats.history_start} through ${stats.history_end}. Descriptive percentiles from a short sample; no validated forecast.` : 'Insufficient comparable history for historical statistics.'}</p>
                ${statsHtml}
            </div>
        `;
    }


    // === FULL SCANNER ===
    function renderScanner() {
        const el = document.getElementById("tab-scanner");
        const data = DATA.full_scanner;

        const headers = [
            { label: "#", key: "rank" },
            { label: "Symbol", key: "symbol" },
            { label: "Name", key: "name" },
            { label: "Sector", key: "sector", filter: true },
            { label: "Price", key: "price" },
            { label: "Mkt Cap", key: "mkt_cap_b", defaultAsc: false },
            { label: "Rel Vol", key: "rel_vol" },
            { label: "Next FY P/E", key: "fwd_pe", defaultAsc: true },
            { label: "PEG", key: "peg", defaultAsc: true },
            { label: "8W EMA", key: "ema8" },
            { label: "13W EMA", key: "ema13" },
            { label: "21W EMA", key: "ema21" },
            { label: "vs 8W%", key: "price_vs_8w", defaultAsc: false },
            { label: "vs 13W%", key: "price_vs_13w", defaultAsc: false },
            { label: "vs 21W%", key: "price_vs_21w", defaultAsc: false },
            { label: "Signal", key: "signal", filter: true },
            { label: "1D Chg%", key: "chg_1d" },
            { label: "1W Chg%", key: "chg_1w" },
            { label: "Rating", key: "analyst" },
        ];

        const renderRow = (s) => `
            <tr>
                <td class="num">${s.rank}</td>
                <td><strong>${escapeHtml(s.symbol)}</strong></td>
                <td class="name-cell" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</td>
                <td>${escapeHtml(s.sector)}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${fmt(s.rel_vol)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
                <td class="num">${s.peg != null ? s.peg.toFixed(2) + '×' : '—'}</td>
                <td class="num">${fmtPrice(s.ema8)}</td>
                <td class="num">${fmtPrice(s.ema13)}</td>
                <td class="num">${fmtPrice(s.ema21)}</td>
                ${pctCell(s.price_vs_8w)}
                ${pctCell(s.price_vs_13w)}
                ${pctCell(s.price_vs_21w)}
                <td>${signalBadge(s.signal)}</td>
                ${pctCell(s.chg_1d)}
                ${pctCell(s.chg_1w)}
                <td>${escapeHtml(s.analyst)}</td>
            </tr>`;

        el.innerHTML = `
            <div class="card">
                <h2>Full Scanner &mdash; ${data.length} Stocks</h2>
                <p>Sorted by Price vs 21W EMA. Click column headers to re-sort.</p>
                ${buildToolbar("scanner", data, headers)}
                <div class="table-wrap">
                    <table id="scanner-table">
                        <thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
                        <tbody>${data.map(renderRow).join("")}</tbody>
                    </table>
                </div>
            </div>
        `;

        registerTab("scanner", data, "scanner-table", renderRow);
        makeSortable(document.getElementById("scanner-table"), data, "scanner", renderRow, headers);
        setupToolbar("scanner");
    }

    // === PULLBACKS & ENTRIES ===
    function renderPullbacks() {
        const el = document.getElementById("tab-pullbacks");
        const data = DATA.pullbacks;

        const headers = [
            { label: "Symbol", key: "symbol" },
            { label: "Name", key: "name" },
            { label: "Price", key: "price" },
            { label: "Mkt Cap", key: "mkt_cap_b", defaultAsc: false },
            { label: "Next FY P/E", key: "fwd_pe", defaultAsc: true },
            { label: "PEG", key: "peg", defaultAsc: true },
            { label: "Signal", key: "signal", filter: true },
            { label: "Rel Vol", key: "rel_vol" },
            { label: "Vol Quality", key: "vol_quality", filter: true },
            { label: "8W EMA", key: "ema8" },
            { label: "13W EMA", key: "ema13" },
            { label: "21W EMA", key: "ema21" },
            { label: "vs 8W%", key: "price_vs_8w" },
            { label: "vs 13W%", key: "price_vs_13w" },
            { label: "vs 21W%", key: "price_vs_21w" },
            { label: "1W Chg%", key: "chg_1w" },
        ];

        const renderRow = (s) => `
            <tr>
                <td><strong>${escapeHtml(s.symbol)}</strong></td>
                <td class="name-cell" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
                <td class="num">${s.peg != null ? s.peg.toFixed(2) + '×' : '—'}</td>
                <td>${signalBadge(s.signal)}</td>
                <td class="num">${(s.rel_vol || 0).toFixed(2)}x</td>
                <td>${volBadge(s.vol_quality)}</td>
                <td class="num">${fmtPrice(s.ema8)}</td>
                <td class="num">${fmtPrice(s.ema13)}</td>
                <td class="num">${fmtPrice(s.ema21)}</td>
                ${pctCell(s.price_vs_8w)}
                ${pctCell(s.price_vs_13w)}
                ${pctCell(s.price_vs_21w)}
                ${pctCell(s.chg_1w)}
            </tr>`;

        el.innerHTML = `
            <div class="card">
                <h2>Actionable Setups: Bullish Pullbacks to Weekly EMAs</h2>
                <p>Stocks with bullish EMA structure (8W > 13W > 21W) but price has pulled back &mdash; potential entry zones.</p>
                <div style="margin-top:0.5rem;padding:0.5rem 0.75rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);font-size:0.78rem;line-height:1.6;">
                    <strong style="color:var(--text);">Volume Guide:</strong>
                    ${volBadge("Low Vol")} <span style="color:var(--text-dim);">&lt; 0.8x avg &mdash; orderly selling, higher quality entry</span>
                    <span style="margin:0 0.4rem;color:var(--border);">|</span>
                    ${volBadge("Normal Vol")} <span style="color:var(--text-dim);">0.8x&ndash;1.5x avg &mdash; neutral volume</span>
                    <span style="margin:0 0.4rem;color:var(--border);">|</span>
                    ${volBadge("High Vol")} <span style="color:var(--text-dim);">> 1.5x avg &mdash; potential institutional selling, use caution</span>
                </div>
            </div>
            <div class="card">
                <h3>${data.length} Setups Found</h3>
                ${buildToolbar("pullbacks", data, headers)}
                <div class="table-wrap">
                    <table id="pullbacks-table">
                        <thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
                        <tbody>${data.map(renderRow).join("")}</tbody>
                    </table>
                </div>
            </div>
        `;

        registerTab("pullbacks", data, "pullbacks-table", renderRow);
        makeSortable(document.getElementById("pullbacks-table"), data, "pullbacks", renderRow, headers);
        setupToolbar("pullbacks");
    }

    // === MOMENTUM LEADERS ===
    function renderMomentum() {
        const el = document.getElementById("tab-momentum");
        const data = DATA.momentum_leaders;

        const headers = [
            { label: "Symbol", key: "symbol" },
            { label: "Name", key: "name" },
            { label: "Price", key: "price" },
            { label: "Mkt Cap", key: "mkt_cap_b", defaultAsc: false },
            { label: "Next FY P/E", key: "fwd_pe", defaultAsc: true },
            { label: "PEG", key: "peg", defaultAsc: true },
            { label: "8W EMA", key: "ema8" },
            { label: "13W EMA", key: "ema13" },
            { label: "21W EMA", key: "ema21" },
            { label: "vs 21W%", key: "price_vs_21w", defaultAsc: false },
            { label: "8v13%", key: "ema8_vs_13", defaultAsc: false },
            { label: "13v21%", key: "ema13_vs_21", defaultAsc: false },
            { label: "Spread Score", key: "spread_score", defaultAsc: false },
            { label: "1W Chg%", key: "chg_1w" },
        ];

        const renderRow = (s) => `
            <tr>
                <td><strong>${escapeHtml(s.symbol)}</strong></td>
                <td class="name-cell" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
                <td class="num">${s.peg != null ? s.peg.toFixed(2) + '×' : '—'}</td>
                <td class="num">${fmtPrice(s.ema8)}</td>
                <td class="num">${fmtPrice(s.ema13)}</td>
                <td class="num">${fmtPrice(s.ema21)}</td>
                ${pctCell(s.price_vs_21w)}
                ${pctCell(s.ema8_vs_13)}
                ${pctCell(s.ema13_vs_21)}
                <td class="num pos">${fmt(s.spread_score)}</td>
                ${pctCell(s.chg_1w)}
            </tr>`;

        el.innerHTML = `
            <div class="card">
                <h2>Momentum Leaders: Strongest Full Bull Setups</h2>
                <p>Sorted by EMA Spread Score (8W vs 13W% + 13W vs 21W%). Larger spread describes greater separation between the EMAs; it does not measure acceleration.</p>
            </div>
            <div class="card">
                <h3>${data.length} Full Bull Stocks</h3>
                ${buildToolbar("momentum", data, headers)}
                <div class="table-wrap">
                    <table id="momentum-table">
                        <thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
                        <tbody>${data.map(renderRow).join("")}</tbody>
                    </table>
                </div>
            </div>
        `;

        registerTab("momentum", data, "momentum-table", renderRow);
        makeSortable(document.getElementById("momentum-table"), data, "momentum", renderRow, headers);
        setupToolbar("momentum");
    }

    // === BEAR LIST ===
    function renderBears() {
        const el = document.getElementById("tab-bears");
        const data = DATA.bear_list;

        const headers = [
            { label: "Symbol", key: "symbol" },
            { label: "Name", key: "name" },
            { label: "Price", key: "price" },
            { label: "Mkt Cap", key: "mkt_cap_b", defaultAsc: false },
            { label: "Next FY P/E", key: "fwd_pe", defaultAsc: true },
            { label: "PEG", key: "peg", defaultAsc: true },
            { label: "Signal", key: "signal", filter: true },
            { label: "8W EMA", key: "ema8" },
            { label: "13W EMA", key: "ema13" },
            { label: "21W EMA", key: "ema21" },
            { label: "vs 8W%", key: "price_vs_8w" },
            { label: "vs 21W%", key: "price_vs_21w" },
            { label: "1W Chg%", key: "chg_1w" },
        ];

        const renderRow = (s) => `
            <tr>
                <td><strong>${escapeHtml(s.symbol)}</strong></td>
                <td class="name-cell" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
                <td class="num">${s.peg != null ? s.peg.toFixed(2) + '×' : '—'}</td>
                <td>${signalBadge(s.signal)}</td>
                <td class="num">${fmtPrice(s.ema8)}</td>
                <td class="num">${fmtPrice(s.ema13)}</td>
                <td class="num">${fmtPrice(s.ema21)}</td>
                ${pctCell(s.price_vs_8w)}
                ${pctCell(s.price_vs_21w)}
                ${pctCell(s.chg_1w)}
            </tr>`;

        el.innerHTML = `
            <div class="card">
                <h2>Bear List: Stocks in Weekly Downtrend</h2>
                <p>Full Bear = Price &lt; 8W &lt; 13W &lt; 21W. Avoid longs, consider puts on rallies to EMA resistance.</p>
            </div>
            <div class="card">
                <h3>${data.length} Stocks in Full Bear</h3>
                ${buildToolbar("bears", data, headers)}
                <div class="table-wrap">
                    <table id="bears-table">
                        <thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
                        <tbody>${data.map(renderRow).join("")}</tbody>
                    </table>
                </div>
            </div>
        `;

        registerTab("bears", data, "bears-table", renderRow);
        makeSortable(document.getElementById("bears-table"), data, "bears", renderRow, headers);
        setupToolbar("bears");
    }

    // === BEST OPPORTUNITIES ===
    function renderOpportunities() {
        const el = document.getElementById("tab-opportunities");
        const data = DATA.best_opportunities || [];

        const headers = [
            { label: "Symbol", key: "symbol" },
            { label: "Name", key: "name" },
            { label: "Sector", key: "sector", filter: true },
            { label: "Price", key: "price" },
            { label: "Mkt Cap", key: "mkt_cap_b", defaultAsc: false },
            { label: "Next FY P/E", key: "fwd_pe", defaultAsc: true },
            { label: "PEG", key: "peg", defaultAsc: true },
            { label: "Trailing EPS Growth", key: "eps_growth_yoy_ttm", defaultAsc: false },
            { label: "Signal", key: "signal", filter: true },
            { label: "Analyst", key: "analyst", filter: true },
            { label: "vs 50D%", key: "pct_from_50" },
            { label: "vs 200D%", key: "pct_from_200" },
            { label: "YTD%", key: "chg_ytd" },
            { label: "1M Chg%", key: "chg_1m" },
        ];

        const renderRow = (s) => `
            <tr>
                <td><strong>${escapeHtml(s.symbol)}</strong></td>
                <td class="name-cell" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</td>
                <td>${escapeHtml(s.sector)}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
                <td class="num">${s.peg != null ? s.peg.toFixed(2) + '×' : '—'}</td>
                <td class="num">${s.eps_growth_yoy_ttm != null ? s.eps_growth_yoy_ttm.toFixed(2) + '%' : '—'}</td>
                <td>${signalBadge(s.signal)}</td>
                <td>${escapeHtml(s.analyst)}</td>
                ${pctCell(s.pct_from_50)}
                ${pctCell(s.pct_from_200)}
                ${pctCell(s.chg_ytd)}
                ${pctCell(s.chg_1m)}
            </tr>`;

        el.innerHTML = `
            <div class="card">
                <h2>Valuation Screen</h2>
                <p>Filtered for: PEG &lt; 2.0, next-fiscal-year P/E &lt; 30, Market cap &ge; $50B, Analyst Buy or Strong Buy. PEG divides next-FY P/E by trailing year-over-year EPS growth. The growth column shows that source growth rate, not an implied forecast. Cyclical rebounds can make PEG unusually low; this screen is not an expected-return ranking.</p>
            </div>
            <div class="card">
                <h3>${data.length} Stocks</h3>
                ${buildToolbar("opportunities", data, headers)}
                <div class="table-wrap">
                    <table id="opportunities-table">
                        <thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
                        <tbody>${data.map(renderRow).join("")}</tbody>
                    </table>
                </div>
            </div>
        `;

        registerTab("opportunities", data, "opportunities-table", renderRow);
        makeSortable(document.getElementById("opportunities-table"), data, "opportunities", renderRow, headers);
        setupToolbar("opportunities");
    }

    // === OUTPERFORMERS ===
    function renderOutperformers() {
        const el = document.getElementById("tab-outperformers");
        const data = DATA.outperformers || [];

        if (!data.length) {
            el.innerHTML = `<div class="card"><h2>Outperformers</h2><p>No outperformer data available. Ensure the data pipeline includes YTD performance.</p></div>`;
            return;
        }

        const spy1w = data[0].spy_1w;
        const spyYtd = data[0].spy_ytd;

        const headers = [
            { label: "#", key: "_index" },
            { label: "Symbol", key: "symbol" },
            { label: "Name", key: "name" },
            { label: "Sector", key: "sector", filter: true },
            { label: "Price", key: "price" },
            { label: "Signal", key: "signal", filter: true },
            { label: "1W Chg%", key: "chg_1w" },
            { label: "SPY 1W%", key: "spy_1w" },
            { label: "1W Rel to SPY", key: "alpha_1w" },
            { label: "YTD Chg%", key: "chg_ytd" },
            { label: "SPY YTD%", key: "spy_ytd" },
            { label: "YTD Rel to SPY", key: "alpha_ytd" },
        ];

        const renderRow = (s, i) => `
            <tr>
                <td class="num">${(i != null ? i : data.indexOf(s)) + 1}</td>
                <td><strong>${escapeHtml(s.symbol)}</strong></td>
                <td class="name-cell" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</td>
                <td>${escapeHtml(s.sector)}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td>${signalBadge(s.signal)}</td>
                ${pctCell(s.chg_1w)}
                <td class="num" style="color:var(--text);font-weight:700">${fmt(spy1w)}%</td>
                <td class="num" style="color:var(--green);font-weight:600">+${fmt(s.alpha_1w)}%</td>
                ${pctCell(s.chg_ytd)}
                <td class="num" style="color:var(--text);font-weight:700">${fmt(spyYtd)}%</td>
                <td class="num" style="color:var(--green);font-weight:600">+${fmt(s.alpha_ytd)}%</td>
            </tr>`;

        // Summary stats
        const avgAlpha1w = data.reduce((a, s) => a + s.alpha_1w, 0) / data.length;
        const avgAlphaYtd = data.reduce((a, s) => a + s.alpha_ytd, 0) / data.length;
        const topYtd = data.slice(0, 5).map(s => s.symbol).join(", ");

        el.innerHTML = `
            <div class="card">
                <h2>Outperformers: Beating SPY on 1W & YTD</h2>
                <p>Stocks outperforming SPY on both weekly and year-to-date basis. Alpha = stock return minus SPY return.</p>
                <div class="stat-row" style="margin-top:12px">
                    <div class="stat-box"><div class="stat-val">${data.length}</div><div class="stat-label">Stocks</div></div>
                    <div class="stat-box"><div class="stat-val" style="color:var(--green)">+${avgAlpha1w.toFixed(2)}%</div><div class="stat-label">Avg 1W Rel to SPY</div></div>
                    <div class="stat-box"><div class="stat-val" style="color:var(--green)">+${avgAlphaYtd.toFixed(2)}%</div><div class="stat-label">Avg YTD Rel to SPY</div></div>
                </div>
                <div style="margin-top:8px;font-size:0.75rem;color:var(--text-dim)">Top YTD: <strong>${escapeHtml(topYtd)}</strong> &middot; SPY 1W: ${fmt(spy1w)}% &middot; SPY YTD: ${fmt(spyYtd)}%</div>
            </div>
            <div class="card">
                <h3>${data.length} Outperformers</h3>
                ${buildToolbar("outperformers", data, headers)}
                <div class="table-wrap">
                    <table id="outperformers-table">
                        <thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
                        <tbody>${data.map(renderRow).join("")}</tbody>
                    </table>
                </div>
            </div>
        `;

        registerTab("outperformers", data, "outperformers-table", renderRow);
        makeSortable(document.getElementById("outperformers-table"), data, "outperformers", renderRow, headers);
        setupToolbar("outperformers");
    }

    // === SECTOR HEATMAP ===
    function renderSectors() {
        const el = document.getElementById("tab-sectors");
        const data = DATA.sector_heatmap;

        const maxNet = Math.max(...data.map((s) => Math.abs(s.net_score)), 1);

        const headers = [
            { label: "Sector", key: "sector" },
            { label: "# Stocks", key: "count" },
            { label: "Full Bull", key: "full_bull" },
            { label: "All Bullish", key: "all_bullish" },
            { label: "All Bearish", key: "all_bearish" },
            { label: "Pullbacks", key: "pullbacks" },
            { label: "Bull %", key: "bull_pct", defaultAsc: false },
            { label: "Bear %", key: "bear_pct", defaultAsc: false },
            { label: "Net Score", key: "net_score", defaultAsc: false },
            { label: "Avg vs 21W", key: "avg_vs_21w", defaultAsc: false },
            { label: "Avg vs 8W", key: "avg_vs_8w", defaultAsc: false },
            { label: "Strength", key: "net_score", defaultAsc: false },
        ];

        const renderRow = (s) => {
            const barWidth = Math.round(Math.abs(s.net_score) / maxNet * 100);
            const barClass = s.net_score >= 0 ? "bull" : "bear";
            const barSign = s.net_score >= 0 ? "+" : "";
            return `
                <tr>
                    <td><strong>${escapeHtml(s.sector)}</strong></td>
                    <td class="num">${s.count}</td>
                    <td class="num">${s.full_bull}</td>
                    <td class="num">${s.all_bullish}</td>
                    <td class="num">${s.all_bearish}</td>
                    <td class="num">${s.pullbacks}</td>
                    <td class="num pos">${fmt(s.bull_pct, 1)}%</td>
                    <td class="num neg">${fmt(s.bear_pct, 1)}%</td>
                    <td class="num ${colorClass(s.net_score)}">${barSign}${fmt(s.net_score, 1)}</td>
                    ${pctCell(s.avg_vs_21w)}
                    ${pctCell(s.avg_vs_8w)}
                    <td>
                        <span class="sector-bar ${barClass}" style="width:${barWidth}px"></span>
                        <span class="num ${colorClass(s.net_score)}" style="font-size:0.75rem"> ${barSign}${Math.round(s.net_score)}</span>
                    </td>
                </tr>`;
        };

        el.innerHTML = `
            <div class="card">
                <h2>Sector Heatmap: Weekly EMA Trend Distribution</h2>
                <p>Net Score = Bullish% - Bearish%. Higher = sector in stronger uptrend.</p>
            </div>
            <div class="card">
                <div class="table-wrap">
                    <table id="sectors-table">
                        <thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
                        <tbody>${data.map(renderRow).join("")}</tbody>
                    </table>
                </div>
            </div>
        `;

        makeSortable(document.getElementById("sectors-table"), data, "sectors", renderRow, headers);
    }

    // === CROSSOVER ALERTS ===
    function renderCrossovers() {
        const el = document.getElementById("tab-crossovers");
        const data = DATA.crossover_alerts;

        const headers = [
            { label: "Symbol", key: "symbol" },
            { label: "Name", key: "name" },
            { label: "Price", key: "price" },
            { label: "Signal", key: "signal", filter: true },
            { label: "8W EMA", key: "ema8" },
            { label: "13W EMA", key: "ema13" },
            { label: "21W EMA", key: "ema21" },
            { label: "8v13 Gap%", key: "gap_8_13" },
            { label: "13v21 Gap%", key: "gap_13_21" },
            { label: "Alert", key: "alert" },
        ];

        const renderRow = (s) => `
            <tr>
                <td><strong>${escapeHtml(s.symbol)}</strong></td>
                <td class="name-cell" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td>${signalBadge(s.signal)}</td>
                <td class="num">${fmtPrice(s.ema8)}</td>
                <td class="num">${fmtPrice(s.ema13)}</td>
                <td class="num">${fmtPrice(s.ema21)}</td>
                <td class="num">${fmt(s.gap_8_13)}%</td>
                <td class="num">${fmt(s.gap_13_21)}%</td>
                <td class="alert-text">${formatAlert(s.alert)}</td>
            </tr>`;

        el.innerHTML = `
            <div class="card">
                <h2>Crossover Proximity Alerts: EMAs Within 1.0% of Crossing</h2>
                <p>Stocks with weekly EMAs converging &mdash; potential trend change signals in 1-3 weeks.</p>
            </div>
            <div class="card">
                <h3>${data.length} Alerts</h3>
                ${buildToolbar("crossovers", data, headers)}
                <div class="table-wrap">
                    <table id="crossovers-table">
                        <thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join("")}</tr></thead>
                        <tbody>${data.map(renderRow).join("")}</tbody>
                    </table>
                </div>
            </div>
        `;

        registerTab("crossovers", data, "crossovers-table", renderRow);
        makeSortable(document.getElementById("crossovers-table"), data, "crossovers", renderRow, headers);
        setupToolbar("crossovers");
    }

    // === DYNAMIC TABLE HEIGHT ===
    function sizeTableWraps() {
        document.querySelectorAll(".table-wrap").forEach((wrap) => {
            const rect = wrap.getBoundingClientRect();
            const available = window.innerHeight - rect.top - 24;
            if (available > 200) wrap.style.maxHeight = available + "px";
        });
    }
    window.addEventListener("resize", sizeTableWraps);

    // === SCROLL FADE DETECTION ===
    function setupScrollFade() {
        document.querySelectorAll(".table-wrap").forEach((wrap) => {
            const check = () => {
                const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 5;
                wrap.classList.toggle("scrolled-end", atEnd);
            };
            wrap.addEventListener("scroll", check);
            check();
        });
    }

    // === THEME TOGGLE ===
    function setupTheme() {
        if (window.DaveyTheme) window.DaveyTheme.init();
        else updateThemeIcon();
    }

    function updateThemeIcon() {
        const icon = document.getElementById("theme-icon");
        if (!icon) return;
        const theme = document.documentElement.getAttribute("data-theme");
        icon.textContent = theme === "light" ? "\u2600" : "\u263D";
    }

    // === START ===
    setupTheme();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
