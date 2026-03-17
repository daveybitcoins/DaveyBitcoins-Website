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
        if (activeTab && activeTab.dataset.tab !== "ai-summary") {
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
        var tabId = tab || "ai-summary";
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
                fetch("data/scanner_data.json?v=" + Date.now()),
                computeSpyRisk(),
                computeQqqRisk()
            ]);
            DATA = await scannerResp.json();
            document.getElementById("loading").style.display = "none";
            document.getElementById("data-date").textContent =
                `Data: ${DATA.meta.date} | ${DATA.meta.total_stocks} stocks`;
            renderIndexHeader();
            renderAll();
            setupTabs();
            setupScrollFade();
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
                syncURL();
            });
        });
    }

    // === RENDER ALL ===
    function renderAll() {
        renderSummary();
        renderDashboard();
        renderScanner();
        renderPullbacks();
        renderMomentum();
        renderBears();
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
        return `<span class="signal ${signalClass(signal)}">${signal}</span>`;
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
        return `<span class="vol-badge vol-normal">${volQuality}</span>`;
    }

    function pctCell(val) {
        return `<td class="num ${colorClass(val)}">${fmtPct(val)}</td>`;
    }

    function formatAlert(text) {
        if (!text) return "-";
        return text.split("; ").map((part) => {
            if (part.includes("bullish cross potential")) {
                return `<span class="alert-bull">${part}</span>`;
            } else if (part.includes("bearish cross risk")) {
                return `<span class="alert-bear">${part}</span>`;
            }
            return part;
        }).join("<br>");
    }

    // === INDEX CONTEXT ===
    function renderIndexHeader() {
        if (!DATA.index_context || DATA.index_context.length === 0) return;
        const el = document.getElementById("data-date");
        let html = `<span>${el.textContent}`;
        DATA.index_context.forEach(idx => {
            html += ` | <strong>${idx.symbol}</strong> ${fmtPrice(idx.price)}`;
        });
        if (DATA.vix_context) {
            const vix = DATA.vix_context.level;
            const vc = vix < 15 ? "var(--green)" : vix < 20 ? "var(--yellow)" : vix < 30 ? "#f97316" : "var(--red)";
            const dailyPct = vix / Math.sqrt(252);
            const spyIdx = DATA.index_context.find(i => i.symbol === "SPY");
            const dailyDollar = spyIdx ? (spyIdx.price * dailyPct / 100) : null;
            html += ` | <strong style="color:${vc}">VIX</strong> <span style="color:${vc}">${vix.toFixed(1)}</span>`;
            html += ` <span style="color:#ffffff;font-size:0.85em;">(±${dailyPct.toFixed(2)}%`;
            if (dailyDollar) html += ` / ±$${dailyDollar.toFixed(2)}`;
            html += `)</span>`;
        }
        html += `</span>`;
        if (DATA.ai_summary && DATA.ai_summary.market_overview) {
            const s = DATA.ai_summary.market_overview;
            const biasColor = { bullish: "var(--green)", bearish: "var(--red)", neutral: "var(--yellow)", mixed: "var(--yellow)" };
            const color = biasColor[s.bias] || "var(--text)";
            html += `<span style="margin-left:auto;white-space:nowrap;">| Market Bias: <strong style="color:${color}">${s.bias_label}</strong></span>`;
        }
        el.innerHTML = html;
    }

    function riskColor(r) {
        const stops = [[0,[37,99,235]],[0.12,[6,182,212]],[0.25,[16,185,129]],[0.40,[132,204,22]],[0.55,[234,179,8]],[0.70,[249,115,22]],[0.85,[239,68,68]],[1,[153,27,27]]];
        let lo = stops[0], hi = stops[stops.length - 1];
        for (let i = 0; i < stops.length - 1; i++) {
            if (r >= stops[i][0] && r <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
        }
        const t = (r - lo[0]) / (hi[0] - lo[0] || 1);
        const c = lo[1].map((v, j) => Math.round(v + t * (hi[1][j] - v)));
        return `rgb(${c[0]},${c[1]},${c[2]})`;
    }

    function renderRiskBar(risk_combo, zone, zone_color, href, label, riskLabel) {
        if (risk_combo == null) return "";
        const r = risk_combo;
        const color = riskColor(r);
        const barGrad = "linear-gradient(90deg,#2563eb 0%,#06b6d4 15%,#10b981 30%,#84cc16 45%,#eab308 60%,#f97316 75%,#ef4444 90%,#991b1b 100%)";
        return `
            <div class="risk-bar-wrap" style="margin-top:0.5rem;padding:0.4rem 0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;">
                    <span style="color:var(--text-dim);">${riskLabel}</span>
                    <strong style="color:${color};font-family:'JetBrains Mono',monospace;font-size:0.85rem;">${r.toFixed(3)}</strong>
                </div>
                <div style="position:relative;height:6px;margin:0.3rem 0;border-radius:3px;background:${barGrad};">
                    <div style="position:absolute;top:-2px;left:${r*100}%;width:2px;height:10px;background:#fff;border-radius:1px;transform:translateX(-1px);box-shadow:0 0 3px rgba(0,0,0,0.5);"></div>
                </div>
                <div style="text-align:center;font-size:0.7rem;font-weight:600;color:${zone_color || color};letter-spacing:0.05em;">${(zone || "").toUpperCase()}</div>
                <a href="${href}" style="display:block;text-align:center;margin-top:0.3rem;font-size:0.65rem;color:var(--accent);text-decoration:none;opacity:0.8;">View Full ${label} Metrics \u2192</a>
            </div>`;
    }

    function renderBtcRisk(idx) {
        return renderRiskBar(idx.risk_combo, idx.zone, idx.zone_color, "risk-metric.html", "BTC", "Combined Risk");
    }

    // SPY structural risk — computed client-side from data_spy.csv
    let spyRiskData = null;
    // QQQ structural risk — computed client-side from data_qqq.csv
    let qqqRiskData = null;

    async function computeSpyRisk() {
        try {
            const resp = await fetch('data_spy.csv?v=' + Date.now());
            const text = await resp.text();
            const rows = text.trim().split('\n').slice(1);
            const raw = rows.map(r => { const [d,p] = r.split(','); return [d, parseFloat(p)]; }).filter(r => !isNaN(r[1]));
            if (raw.length < 252) return;

            const GENESIS = new Date('1960-01-04T00:00:00Z').getTime();
            const pts = raw.map(([ds, p]) => {
                const ms = new Date(ds + 'T00:00:00Z').getTime();
                const days = (ms - GENESIS) / 864e5;
                return { days, logPrice: Math.log10(p), price: p };
            }).filter(p => p.days > 0 && p.price > 0);

            const n = pts.length;
            let sx=0,sy=0,sxy=0,sxx=0;
            pts.forEach(p => { sx+=p.days; sy+=p.logPrice; sxy+=p.days*p.logPrice; sxx+=p.days*p.days; });
            const slope = (n*sxy - sx*sy) / (n*sxx - sx*sx);
            const intercept = (sy - slope*sx) / n;

            let minRes=Infinity, maxRes=-Infinity;
            pts.forEach(p => {
                p.regLogPrice = slope * p.days + intercept;
                p.residual = p.logPrice - p.regLogPrice;
                if (p.residual < minRes) minRes = p.residual;
                if (p.residual > maxRes) maxRes = p.residual;
            });

            const resRange = maxRes - minRes;
            const last = pts[pts.length - 1];
            const risk = Math.max(0, Math.min(1, (last.residual - minRes) / resRange));

            let zone, zone_color;
            if (risk < 0.25) { zone = "Accumulate"; zone_color = "#2563eb"; }
            else if (risk < 0.50) { zone = "Neutral"; zone_color = "#10b981"; }
            else if (risk < 0.75) { zone = "Caution"; zone_color = "#eab308"; }
            else { zone = "Euphoria"; zone_color = "#ef4444"; }

            spyRiskData = { risk_combo: risk, zone, zone_color };
        } catch (e) {
            console.warn('SPY risk computation failed:', e);
        }
    }

    function renderSpyRisk() {
        if (!spyRiskData) return "";
        return renderRiskBar(spyRiskData.risk_combo, spyRiskData.zone, spyRiskData.zone_color, "spy-risk-metric.html", "SPY", "Structural Risk");
    }

    async function computeQqqRisk() {
        try {
            const resp = await fetch('data_qqq.csv?v=' + Date.now());
            const text = await resp.text();
            const rows = text.trim().split('\n').slice(1);
            const raw = rows.map(r => { const [d,p] = r.split(','); return [d, parseFloat(p)]; }).filter(r => !isNaN(r[1]));
            if (raw.length < 252) return;

            const GENESIS = new Date('1999-03-10T00:00:00Z').getTime();
            const pts = raw.map(([ds, p]) => {
                const ms = new Date(ds + 'T00:00:00Z').getTime();
                const days = (ms - GENESIS) / 864e5;
                return { days, logPrice: Math.log10(p), price: p };
            }).filter(p => p.days > 0 && p.price > 0);

            const n = pts.length;
            let sx=0,sy=0,sxy=0,sxx=0;
            pts.forEach(p => { sx+=p.days; sy+=p.logPrice; sxy+=p.days*p.logPrice; sxx+=p.days*p.days; });
            const slope = (n*sxy - sx*sy) / (n*sxx - sx*sx);
            const intercept = (sy - slope*sx) / n;

            let minRes=Infinity, maxRes=-Infinity;
            pts.forEach(p => {
                p.regLogPrice = slope * p.days + intercept;
                p.residual = p.logPrice - p.regLogPrice;
                if (p.residual < minRes) minRes = p.residual;
                if (p.residual > maxRes) maxRes = p.residual;
            });

            const resRange = maxRes - minRes;
            const last = pts[pts.length - 1];
            const risk = Math.max(0, Math.min(1, (last.residual - minRes) / resRange));

            let zone, zone_color;
            if (risk < 0.25) { zone = "Accumulate"; zone_color = "#2563eb"; }
            else if (risk < 0.50) { zone = "Neutral"; zone_color = "#10b981"; }
            else if (risk < 0.75) { zone = "Caution"; zone_color = "#eab308"; }
            else { zone = "Euphoria"; zone_color = "#ef4444"; }

            qqqRiskData = { risk_combo: risk, zone, zone_color };
        } catch (e) {
            console.warn('QQQ risk computation failed:', e);
        }
    }

    function renderQqqRisk() {
        if (!qqqRiskData) return "";
        return renderRiskBar(qqqRiskData.risk_combo, qqqRiskData.zone, qqqRiskData.zone_color, "qqq-risk-metric.html", "QQQ", "Structural Risk");
    }

    function renderIndexCard() {
        if (!DATA.index_context || DATA.index_context.length === 0) return "";
        return `
            <div class="card index-context-card">
                <h2>Market Index Context</h2>
                <div class="stats-row">
                    ${DATA.index_context.map(idx => `
                        <div class="stat-box">
                            <div class="value" style="font-size:1.2rem;">
                                ${idx.symbol === 'BTC' ? `<a href="risk-metric.html" style="color:inherit;text-decoration:none;">${idx.symbol}</a>` : idx.symbol === 'SPY' ? `<a href="spy-risk-metric.html" style="color:inherit;text-decoration:none;">${idx.symbol}</a>` : idx.symbol === 'QQQ' ? `<a href="qqq-risk-metric.html" style="color:inherit;text-decoration:none;">${idx.symbol}</a>` : idx.symbol} ${signalBadge(idx.signal)} ${idx.vol_quality ? volBadge(idx.vol_quality) : ''}
                            </div>
                            <div class="label">${fmtPrice(idx.price)} <span style="font-size:0.7rem;color:var(--text-dim);">${idx.rel_vol ? idx.rel_vol.toFixed(2) + 'x vol' : ''}</span></div>
                            <div style="font-size:0.75rem;margin-top:0.4rem;color:var(--text-dim);font-family:'JetBrains Mono',monospace;">
                                8W: ${fmtPrice(idx.ema8)} | 13W: ${fmtPrice(idx.ema13)} | 21W: ${fmtPrice(idx.ema21)}
                            </div>
                            <div style="font-size:0.75rem;margin-top:0.25rem;">
                                <span class="${colorClass(idx.price_vs_8w)}">${fmtPct(idx.price_vs_8w)} vs 8W</span> |
                                <span class="${colorClass(idx.price_vs_13w)}">${fmtPct(idx.price_vs_13w)} vs 13W</span> |
                                <span class="${colorClass(idx.price_vs_21w)}">${fmtPct(idx.price_vs_21w)} vs 21W</span>
                            </div>
                            <div style="font-size:0.72rem;margin-top:0.2rem;color:var(--text-dim);">
                                1D: <span class="${colorClass(idx.chg_1d)}">${fmtPct(idx.chg_1d)}</span> |
                                1W: <span class="${colorClass(idx.chg_1w)}">${fmtPct(idx.chg_1w)}</span> |
                                1M: <span class="${colorClass(idx.chg_1m)}">${fmtPct(idx.chg_1m)}</span>
                            </div>
                            ${idx.crossover_alert ? `<div class="alert-text" style="font-size:0.72rem;margin:0.4rem auto 0;padding:0.35rem 0.5rem;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--bg);">${formatAlert(idx.crossover_alert)}</div>` : `<div class="alert-text" style="font-size:0.72rem;margin:0.4rem auto 0;padding:0.35rem 0.5rem;text-align:center;border:1px solid transparent;border-radius:4px;">&nbsp;<br>&nbsp;</div>`}
                            ${idx.symbol === 'BTC' ? renderBtcRisk(idx) : idx.symbol === 'SPY' ? renderSpyRisk() : idx.symbol === 'QQQ' ? renderQqqRisk() : ''}
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
        filterHeaders.forEach((h) => {
            const values = [...new Set(data.map((d) => d[h.key]))].filter(Boolean).sort();
            if (values.length > 1) {
                const id = 'ms-' + tabId + '-' + h.key;
                html += '<div class="multi-select" id="' + id + '" data-tab-id="' + tabId + '" data-key="' + h.key + '">';
                var pluralLabel = h.label.endsWith('s') || h.label.endsWith('y') ? h.label : h.label + 's';
                html += '<button type="button" class="multi-select-btn">All ' + pluralLabel + ' <span class="multi-select-badge" style="display:none"></span></button>';
                html += '<div class="multi-select-dropdown">';
                values.forEach((v) => {
                    html += '<label class="multi-select-item"><input type="checkbox" value="' + v + '"> ' + v + '</label>';
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
                filtered = filtered.filter((d) => val.includes(d[key]));
            } else if (val && !Array.isArray(val)) {
                filtered = filtered.filter((d) => d[key] === val);
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
        syncURL();
    }

    function renderChips(tabId) {
        const container = document.getElementById("chips-" + tabId);
        if (!container) return;
        const tickers = filterState[tabId].selectedTickers || [];
        container.innerHTML = tickers.map(t =>
            '<span class="ticker-chip">' + t + '<button type="button" class="chip-remove" data-ticker="' + t + '">&times;</button></span>'
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
            '<div class="ticker-option" data-symbol="' + d.symbol + '"><strong>' + d.symbol + '</strong> <span>' + d.name + '</span></div>'
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

    function renderChips(tabId) {
        const container = document.getElementById("chips-" + tabId);
        if (!container) return;
        const tickers = filterState[tabId].selectedTickers || [];
        container.innerHTML = tickers.map(t =>
            '<span class="ticker-chip">' + t + '<button type="button" class="chip-remove" data-ticker="' + t + '">&times;</button></span>'
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
            '<div class="ticker-option" data-symbol="' + d.symbol + '"><strong>' + d.symbol + '</strong> <span>' + d.name + '</span></div>'
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
    function renderSummary() {
        const el = document.getElementById("tab-ai-summary");
        const s = DATA.ai_summary;

        if (!s) {
            el.innerHTML = `
                <div class="card">
                    <h2>AI Market Summary</h2>
                    <p>AI summary not available for this data set.
                       It will be generated automatically on the next data pull.</p>
                </div>`;
            return;
        }

        el.innerHTML = `
            ${renderIndexCard()}

            <div class="card">
                <h2>${s.market_overview.headline}</h2>
                <p>${s.market_overview.detail}</p>
                <p class="summary-meta">Generated by Claude AI &mdash;
                   ${new Date(s.generated_at).toLocaleString()}</p>
            </div>

            ${s.reversal_candidates.items.length > 0 ? `
            <div class="card">
                <h2>${s.reversal_candidates.headline}</h2>
                <div class="notes-grid">
                    ${s.reversal_candidates.items.map(item => `
                        <div class="note-item ${item.type || "bull"}">
                            <strong>${item.symbol} ${signalBadge(item.signal)}</strong>
                            ${item.crossover_detail
                                ? '<span class="alert-text"><span class="alert-bull">'
                                  + item.crossover_detail + '</span></span><br>'
                                : ''}
                            ${item.note}
                        </div>
                    `).join("")}
                </div>
            </div>` : ''}

            ${s.pullback_setups.items.length > 0 ? `
            <div class="card">
                <h2>${s.pullback_setups.headline}</h2>
                <div class="notes-grid">
                    ${s.pullback_setups.items.map(item => `
                        <div class="note-item ${item.type || "bull"}">
                            <strong>${item.symbol} ${signalBadge(item.signal)} ${item.vol_quality ? volBadge(item.vol_quality) : ''}</strong>
                            ${item.price_vs_21w != null
                                ? '<span class="num ' + colorClass(item.price_vs_21w) + '">'
                                  + fmtPct(item.price_vs_21w) + ' vs 21W</span><br>'
                                : ''}
                            ${item.note}
                        </div>
                    `).join("")}
                </div>
            </div>` : ''}

            <div class="card">
                <h2>${s.momentum_themes.headline}</h2>
                <p>${s.momentum_themes.detail}</p>
                <p><strong>Top names:</strong> ${s.momentum_themes.top_names
                    .map(t => '<strong>' + t + '</strong>').join(", ")}</p>
            </div>

            <div class="card">
                <h2>${s.sector_analysis.headline}</h2>
                <div class="notes-grid">
                    ${(s.sector_analysis.strongest || []).map(sec => `
                        <div class="note-item bull">
                            <strong>${sec.sector}</strong>
                            Net: <span class="pos">${sec.net_score > 0 ? '+' : ''}${sec.net_score}</span>
                            | Bull: ${sec.bull_pct}%<br>
                            ${sec.note}
                        </div>
                    `).join("")}
                    ${(s.sector_analysis.weakest || []).map(sec => `
                        <div class="note-item bear">
                            <strong>${sec.sector}</strong>
                            Net: <span class="neg">${sec.net_score > 0 ? '+' : ''}${sec.net_score}</span>
                            | Bear: ${sec.bear_pct}%<br>
                            ${sec.note}
                        </div>
                    `).join("")}
                </div>
                ${s.sector_analysis.detail ? '<p>' + s.sector_analysis.detail + '</p>' : ''}
            </div>

            <div class="card">
                <h2>${s.risk_warnings.headline}</h2>
                <div class="notes-grid">
                    ${s.risk_warnings.items.map(item => `
                        <div class="note-item ${item.type || "caution"}">
                            ${item.text}
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // === DASHBOARD ===
    function renderDashboard() {
        const el = document.getElementById("tab-dashboard");
        const d = DATA.dashboard;

        const bullCount = d.signals
            .filter((s) => ["Full Bull", "Bullish (unstacked)", "Bull Pullback \u2192 13W", "Bull Pullback \u2192 21W"].includes(s.signal))
            .reduce((sum, s) => sum + s.count, 0);
        const bearCount = d.signals
            .filter((s) => ["Full Bear", "Bearish (unstacked)", "Bear Rally \u2192 13W", "Bear Rally above 13W"].includes(s.signal))
            .reduce((sum, s) => sum + s.count, 0);

        el.innerHTML = `
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

            <div class="card">
                <h2>Signal Distribution</h2>
                <div class="table-wrap">
                    <table>
                        <thead><tr>
                            <th>Signal</th>
                            <th>Count</th>
                            <th>% of Total</th>
                            <th>Avg Price vs 21W EMA</th>
                        </tr></thead>
                        <tbody>
                            ${d.signals.map((s) => `
                                <tr>
                                    <td>${signalBadge(s.signal)}</td>
                                    <td class="num">${s.count}</td>
                                    <td class="num">${(s.pct * 100).toFixed(1)}%</td>
                                    ${pctCell(s.avg_vs_21w)}
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <h2>Strategy Notes</h2>
                <div class="notes-grid">
                    <div class="note-item bull">
                        <strong>Full Bull (Price > 8W > 13W > 21W)</strong>
                        Strongest uptrend. Trend-following entries on pullbacks to 8W EMA.
                    </div>
                    <div class="note-item bull">
                        <strong>Bull Pullback &rarr; 13W</strong>
                        Price pulled back to 13W EMA support. Potential swing entry if 13W holds.
                    </div>
                    <div class="note-item bull">
                        <strong>Bull Pullback &rarr; 21W</strong>
                        Deeper pullback to 21W EMA. High-risk/reward entry, watch for bounce.
                    </div>
                    <div class="note-item caution">
                        <strong>Bull Breakdown</strong>
                        EMAs still bullish but price broke below 21W. Caution, trend may be reversing.
                    </div>
                    <div class="note-item bear">
                        <strong>Full Bear (Price < 8W < 13W < 21W)</strong>
                        Strongest downtrend. Avoid longs, consider puts on rallies to EMA resistance.
                    </div>
                    <div class="note-item bear">
                        <strong>Bear Rally &rarr; 13W</strong>
                        Price rallied up to 13W resistance in downtrend. Potential short entry.
                    </div>
                    <div class="note-item alert">
                        <strong>Crossover Alerts</strong>
                        EMAs within 1% of crossing signal potential trend changes in 1-3 weeks.
                    </div>
                </div>
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
            { label: "Fwd P/E", key: "fwd_pe", defaultAsc: true },
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
                <td><strong>${s.symbol}</strong></td>
                <td class="name-cell" title="${s.name}">${s.name}</td>
                <td>${s.sector}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${fmt(s.rel_vol)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
                <td class="num">${fmtPrice(s.ema8)}</td>
                <td class="num">${fmtPrice(s.ema13)}</td>
                <td class="num">${fmtPrice(s.ema21)}</td>
                ${pctCell(s.price_vs_8w)}
                ${pctCell(s.price_vs_13w)}
                ${pctCell(s.price_vs_21w)}
                <td>${signalBadge(s.signal)}</td>
                ${pctCell(s.chg_1d)}
                ${pctCell(s.chg_1w)}
                <td>${s.analyst}</td>
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
            { label: "Fwd P/E", key: "fwd_pe", defaultAsc: true },
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
                <td><strong>${s.symbol}</strong></td>
                <td class="name-cell" title="${s.name}">${s.name}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
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
                    ${volBadge("Low Vol")} <span style="color:var(--text-dim);">< 0.8x avg &mdash; orderly selling, higher quality entry</span>
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
            { label: "Fwd P/E", key: "fwd_pe", defaultAsc: true },
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
                <td><strong>${s.symbol}</strong></td>
                <td class="name-cell" title="${s.name}">${s.name}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
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
                <p>Sorted by EMA Spread Score (8W vs 13W% + 13W vs 21W%). Widening spread = accelerating momentum.</p>
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
            { label: "Fwd P/E", key: "fwd_pe", defaultAsc: true },
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
                <td><strong>${s.symbol}</strong></td>
                <td class="name-cell" title="${s.name}">${s.name}</td>
                <td class="num">${fmtPrice(s.price)}</td>
                <td class="num">${fmtCap(s.mkt_cap_b)}</td>
                <td class="num">${s.fwd_pe != null ? s.fwd_pe.toFixed(1) + '×' : '—'}</td>
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
                    <td><strong>${s.sector}</strong></td>
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
                <td><strong>${s.symbol}</strong></td>
                <td class="name-cell" title="${s.name}">${s.name}</td>
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
        const saved = localStorage.getItem("ema-theme");
        if (saved) {
            document.documentElement.setAttribute("data-theme", saved);
        }
        updateThemeIcon();

        const btn = document.getElementById("theme-toggle");
        if (btn) {
            btn.addEventListener("click", () => {
                const current = document.documentElement.getAttribute("data-theme");
                const next = current === "light" ? "dark" : "light";
                document.documentElement.setAttribute("data-theme", next);
                localStorage.setItem("ema-theme", next);
                updateThemeIcon();
            });
        }
    }

    function updateThemeIcon() {
        const icon = document.getElementById("theme-icon");
        if (!icon) return;
        const theme = document.documentElement.getAttribute("data-theme");
        icon.textContent = theme === "light" ? "\u2600" : "\u263D";
    }

    // === START ===
    setupTheme();
    document.addEventListener("DOMContentLoaded", init);
})();
