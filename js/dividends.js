(function () {
    "use strict";

    const WORKER_URL = "https://daveybitcoins-api.dave-erazo78.workers.dev";
    var IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    var API_BASE = IS_LOCAL ? "" : WORKER_URL;
    const STORAGE_KEY = "dividend_holdings";
    const PORTFOLIOS_KEY = "dividend_portfolios";
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    let dividendData = null;
    let portfolios = [];
    let activePortfolioIndex = 0;
    let liveQuotes = {};
    let calYear, calMonth;

    function getHoldings() {
        var p = portfolios[activePortfolioIndex];
        return p ? p.holdings : [];
    }

    // === LOCALSTORAGE ===
    function loadPortfolios() {
        try {
            var saved = JSON.parse(localStorage.getItem(PORTFOLIOS_KEY));
            if (saved && saved.length > 0) return saved;
        } catch {}

        // Migrate from old flat holdings format
        try {
            var old = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (old && old.length > 0) {
                return [{ name: "Main", holdings: old }];
            }
        } catch {}

        return [{ name: "Main", holdings: [] }];
    }

    function savePortfolios() {
        localStorage.setItem(PORTFOLIOS_KEY, JSON.stringify(portfolios));
    }

    // === FORMATTING ===
    function fmtUSD(n) {
        if (n == null || isNaN(n)) return "--";
        return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtPct(n) {
        if (n == null || isNaN(n)) return "--";
        return n.toFixed(2) + "%";
    }

    // === THEME ===
    function setupTheme() {
        const saved = localStorage.getItem("theme");
        if (saved) document.documentElement.setAttribute("data-theme", saved);
        var icon = document.getElementById("theme-icon");
        if (icon) icon.textContent = (saved === "light") ? "☀" : "☽";

        document.getElementById("theme-toggle").addEventListener("click", function () {
            var current = document.documentElement.getAttribute("data-theme");
            var next = current === "light" ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("theme", next);
            icon.textContent = next === "light" ? "☀" : "☽";
        });
    }

    // === INIT ===
    async function init() {
        setupTheme();
        portfolios = loadPortfolios();
        activePortfolioIndex = 0;

        try {
            var resp = await fetch("data/dividend_data.json?v=" + Date.now());
            dividendData = await resp.json();
        } catch {
            dividendData = { meta: { date: "N/A", total_tickers: 0 }, tickers: {} };
        }

        document.getElementById("data-date").innerHTML =
            '<span class="pill pill-date">' + (dividendData.meta.date || "N/A") + '</span>' +
            '<span class="pill pill-count">' + (dividendData.meta.total_tickers || 0) + ' dividend stocks</span>';

        if (getHoldings().length > 0) {
            await fetchLivePrices();
            await fetchDividendHistory();
        }

        var now = new Date();
        calYear = now.getFullYear();
        calMonth = now.getMonth();

        document.getElementById("loading").style.display = "none";
        document.getElementById("app-content").style.display = "";

        renderAll();
        setupEventListeners();
    }

    // === LIVE PRICES ===
    async function fetchLivePrices() {
        var allTickers = {};
        portfolios.forEach(function (p) {
            p.holdings.forEach(function (h) { allTickers[h.ticker] = true; });
        });
        var symbols = Object.keys(allTickers);
        if (symbols.length === 0) { liveQuotes = {}; return; }
        try {
            var resp = await fetch(WORKER_URL + "/api/quotes?symbols=" + encodeURIComponent(symbols.join(",")));
            liveQuotes = await resp.json();
        } catch {
            liveQuotes = {};
        }
    }

    function getLivePrice(ticker) {
        var q = liveQuotes[ticker];
        if (q && q.c && q.c > 0) return q.c;
        var div = getDividendInfo(ticker);
        if (div && div.close) return div.close;
        return null;
    }

    // === DIVIDEND HISTORY (fetched from Yahoo Finance via worker) ===
    var DIV_HISTORY_TTL = 24 * 60 * 60 * 1000;

    function getDivHistoryCache() {
        try {
            var raw = localStorage.getItem("dividend_history_cache");
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    function setDivHistoryCache(cache) {
        localStorage.setItem("dividend_history_cache", JSON.stringify(cache));
    }

    async function fetchDividendHistory() {
        var cache = getDivHistoryCache();
        var now = Date.now();
        var stale = [];
        var holdings = getHoldings();

        holdings.forEach(function (h) {
            var entry = cache[h.ticker];
            if (!entry || now - entry.ts > DIV_HISTORY_TTL) {
                stale.push(h.ticker);
            }
        });

        if (stale.length === 0) {
            applyDividendHistory(cache);
            return;
        }

        await Promise.all(stale.map(async function (ticker) {
            try {
                var resp = await fetch(API_BASE + "/api/dividends/" + encodeURIComponent(ticker));
                var data = await resp.json();
                if (data.payments && data.payments.length > 0) {
                    cache[ticker] = { ts: now, payments: data.payments };
                }
            } catch {}
        }));

        setDivHistoryCache(cache);
        applyDividendHistory(cache);
    }

    function applyDividendHistory(cache) {
        for (var ticker in cache) {
            var div = dividendData.tickers[ticker];
            if (div && cache[ticker].payments && cache[ticker].payments.length > 0) {
                var existing = div.last_payments || [];
                if (existing.length < cache[ticker].payments.length) {
                    div.last_payments = cache[ticker].payments;
                }
            }
        }
    }

    // === PORTFOLIO MANAGEMENT ===
    function switchPortfolio(index) {
        activePortfolioIndex = index;
        renderAll();
        fetchLivePrices().then(function () {
            fetchDividendHistory().then(function () {
                renderAll();
            });
        });
    }

    function addPortfolio() {
        var name = prompt("Portfolio name:");
        if (!name || !name.trim()) return;
        portfolios.push({ name: name.trim(), holdings: [] });
        savePortfolios();
        activePortfolioIndex = portfolios.length - 1;
        renderAll();
    }

    function renamePortfolio(index) {
        var current = portfolios[index].name;
        var name = prompt("Rename portfolio:", current);
        if (!name || !name.trim() || name.trim() === current) return;
        portfolios[index].name = name.trim();
        savePortfolios();
        renderPortfolioTabs();
    }

    function deletePortfolio(index) {
        if (portfolios.length <= 1) return;
        if (!confirm('Delete portfolio "' + portfolios[index].name + '"? This removes all its holdings.')) return;
        portfolios.splice(index, 1);
        if (activePortfolioIndex >= portfolios.length) {
            activePortfolioIndex = portfolios.length - 1;
        }
        savePortfolios();
        renderAll();
    }

    // === TICKER AUTOCOMPLETE ===
    function setupEventListeners() {
        var tickerInput = document.getElementById("ticker-input");
        var dropdown = document.getElementById("ticker-dropdown");

        tickerInput.addEventListener("input", function () {
            var val = tickerInput.value.trim().toUpperCase();
            if (val.length < 1) { dropdown.style.display = "none"; return; }

            var matches = [];
            var tickers = dividendData.tickers;
            for (var sym in tickers) {
                if (sym.startsWith(val) || (tickers[sym].name && tickers[sym].name.toLowerCase().includes(val.toLowerCase()))) {
                    matches.push({ symbol: sym, name: tickers[sym].name || sym });
                }
                if (matches.length >= 10) break;
            }

            var html = matches.map(function (m) {
                return '<div class="ticker-option" data-symbol="' + m.symbol + '"><strong>' + m.symbol + '</strong><span>' + m.name + '</span></div>';
            }).join("");

            if (matches.length === 0 && val.length >= 1) {
                html = '<div class="ticker-option" data-symbol="' + val + '"><strong>' + val + '</strong><span style="opacity:0.6">Not in dividend data — add anyway</span></div>';
            }

            dropdown.innerHTML = html;
            dropdown.style.display = "block";

            dropdown.querySelectorAll(".ticker-option").forEach(function (opt) {
                opt.addEventListener("click", function () {
                    tickerInput.value = opt.dataset.symbol;
                    dropdown.style.display = "none";
                    document.getElementById("shares-input").focus();
                });
            });
        });

        tickerInput.addEventListener("keydown", function (e) {
            if (e.key === "Escape") dropdown.style.display = "none";
            if (e.key === "Enter") {
                var first = dropdown.querySelector(".ticker-option");
                if (first) { tickerInput.value = first.dataset.symbol; dropdown.style.display = "none"; }
            }
        });

        document.addEventListener("click", function (e) {
            if (!e.target.closest("#ticker-search-wrap")) dropdown.style.display = "none";
        });

        document.getElementById("btn-add").addEventListener("click", addHolding);

        document.getElementById("shares-input").addEventListener("keydown", function (e) {
            if (e.key === "Enter") addHolding();
        });
        document.getElementById("cost-input").addEventListener("keydown", function (e) {
            if (e.key === "Enter") addHolding();
        });

        document.getElementById("cal-prev").addEventListener("click", function () {
            calMonth--;
            if (calMonth < 0) { calMonth = 11; calYear--; }
            renderCalendar();
        });
        document.getElementById("cal-next").addEventListener("click", function () {
            calMonth++;
            if (calMonth > 11) { calMonth = 0; calYear++; }
            renderCalendar();
        });
    }

    // === ADD / DELETE HOLDINGS ===
    async function addHolding() {
        var tickerInput = document.getElementById("ticker-input");
        var sharesInput = document.getElementById("shares-input");
        var costInput = document.getElementById("cost-input");

        var ticker = tickerInput.value.trim().toUpperCase();
        var shares = parseFloat(sharesInput.value);
        var cost = costInput.value ? parseFloat(costInput.value) : null;

        if (!ticker || isNaN(shares) || shares <= 0) return;

        var holdings = getHoldings();
        var existing = holdings.findIndex(function (h) { return h.ticker === ticker; });
        if (existing >= 0) {
            var old = holdings[existing];
            var oldTotal = old.shares * (old.costBasis || 0);
            var newTotal = shares * (cost || 0);
            old.shares += shares;
            if (old.costBasis && cost) {
                old.costBasis = Math.round(((oldTotal + newTotal) / old.shares) * 100) / 100;
            } else if (cost) {
                old.costBasis = cost;
            }
        } else {
            holdings.push({ ticker: ticker, shares: shares, costBasis: cost });
        }

        savePortfolios();
        tickerInput.value = "";
        sharesInput.value = "";
        costInput.value = "";
        tickerInput.focus();

        await fetchLivePrices();
        renderAll();
    }

    function deleteHolding(index) {
        getHoldings().splice(index, 1);
        savePortfolios();
        renderAll();
    }

    function updateShares(index, newShares) {
        if (isNaN(newShares) || newShares <= 0) return;
        getHoldings()[index].shares = newShares;
        savePortfolios();
        renderAll();
    }

    function updateCostBasis(index, newCost) {
        if (isNaN(newCost) || newCost < 0) return;
        getHoldings()[index].costBasis = newCost || null;
        savePortfolios();
        renderAll();
    }

    // === RENDER ALL ===
    function renderAll() {
        renderPortfolioControls();
        renderSummaryCards();
        renderHoldingsTable();
        renderCalendar();
    }

    // === PORTFOLIO CONTROLS ===
    function renderPortfolioControls() {
        var wrap = document.getElementById("portfolio-controls");
        var html = '<select class="portfolio-select" id="portfolio-select">';

        portfolios.forEach(function (p, i) {
            var sel = i === activePortfolioIndex ? " selected" : "";
            html += '<option value="' + i + '"' + sel + '>' + p.name + '</option>';
        });

        html += '</select>';
        html += '<button class="portfolio-btn" id="portfolio-add-btn" title="New portfolio">+ New</button>';
        html += '<button class="portfolio-btn" id="portfolio-rename-btn" title="Rename portfolio">Rename</button>';
        if (portfolios.length > 1) {
            html += '<button class="portfolio-btn btn-del" id="portfolio-del-btn" title="Delete portfolio">Delete</button>';
        }

        wrap.innerHTML = html;

        document.getElementById("portfolio-select").addEventListener("change", function () {
            switchPortfolio(parseInt(this.value));
        });
        document.getElementById("portfolio-add-btn").addEventListener("click", addPortfolio);
        document.getElementById("portfolio-rename-btn").addEventListener("click", function () {
            renamePortfolio(activePortfolioIndex);
        });
        var delBtn = document.getElementById("portfolio-del-btn");
        if (delBtn) {
            delBtn.addEventListener("click", function () {
                deletePortfolio(activePortfolioIndex);
            });
        }
    }

    // === SUMMARY CARDS ===
    function renderSummaryCards() {
        var totalAnnual = 0;
        var totalValue = 0;
        var holdings = getHoldings();

        holdings.forEach(function (h) {
            var div = getDividendInfo(h.ticker);
            if (div && div.dividend_rate) {
                totalAnnual += h.shares * div.dividend_rate;
            }
            var price = getLivePrice(h.ticker);
            if (price) totalValue += h.shares * price;
        });

        document.getElementById("annual-income").textContent = fmtUSD(totalAnnual);
        document.getElementById("monthly-income").textContent = fmtUSD(totalAnnual / 12);
        document.getElementById("portfolio-yield").textContent =
            totalValue > 0 ? fmtPct((totalAnnual / totalValue) * 100) : "0.00%";
        document.getElementById("portfolio-value").textContent = fmtUSD(totalValue);
    }

    function getDividendInfo(ticker) {
        if (!dividendData || !dividendData.tickers) return null;
        return dividendData.tickers[ticker] || null;
    }

    // === HOLDINGS TABLE ===
    function renderHoldingsTable() {
        var wrap = document.getElementById("holdings-table-wrap");
        var holdings = getHoldings();

        if (holdings.length === 0) {
            wrap.innerHTML =
                '<div class="empty-state">' +
                '<div class="empty-state-icon">&#128176;</div>' +
                '<p>No holdings yet.</p>' +
                '<p>Add a ticker above to start tracking your dividend income.</p>' +
                '</div>';
            return;
        }

        var totalValue = 0;
        holdings.forEach(function (h) {
            var price = getLivePrice(h.ticker);
            if (price) totalValue += h.shares * price;
        });

        var html = '<div class="table-wrap"><table id="holdings-table"><thead><tr>' +
            '<th>Ticker</th><th>Name</th><th>Shares</th><th>Cost Basis / Share</th><th>Cost Basis / Total</th><th>Price</th><th>Current Value</th>' +
            '<th>Yield</th><th>Div / Share</th><th>Annual Div</th><th>Monthly Div</th><th>Frequency</th>' +
            '<th>% of Portfolio</th><th></th>' +
            '</tr></thead><tbody>';

        holdings.forEach(function (h, i) {
            var div = getDividendInfo(h.ticker);
            var price = getLivePrice(h.ticker);
            var value = price ? h.shares * price : null;
            var annualDiv = (div && div.dividend_rate) ? h.shares * div.dividend_rate : null;
            var pctPortfolio = (value && totalValue > 0) ? (value / totalValue) * 100 : null;
            var yld = (div && div.dividend_yield) ? div.dividend_yield : null;
            var freq = (div && div.frequency) ? div.frequency : null;
            var exDate = (div && div.ex_dividend_date) ? div.ex_dividend_date : null;
            var name = (div && div.name) ? div.name : h.ticker;

            var freqBadge = "";
            if (freq) {
                var cls = "freq-" + freq.replace("_", "-");
                freqBadge = '<span class="freq-badge ' + cls + '">' + freq + '</span>';
            }

            var gainLoss = "";
            if (h.costBasis && price) {
                var gl = ((price - h.costBasis) / h.costBasis) * 100;
                var glClass = gl >= 0 ? "pos" : "neg";
                gainLoss = '<span class="' + glClass + '">' + (gl >= 0 ? "+" : "") + gl.toFixed(1) + '%</span>';
            }

            html += '<tr>' +
                '<td><strong style="font-family:JetBrains Mono,monospace">' + h.ticker + '</strong></td>' +
                '<td class="name-cell">' + name + '</td>' +
                '<td class="num editable-cell" data-index="' + i + '" data-field="shares" title="Click to edit">' + h.shares + '</td>' +
                '<td class="num editable-cell" data-index="' + i + '" data-field="costBasis" title="Click to edit">' + (h.costBasis ? fmtUSD(h.costBasis) : "--") + '</td>' +
                '<td class="num">' + (h.costBasis ? fmtUSD(h.costBasis * h.shares) : "--") + '</td>' +
                '<td class="num">' + (price ? fmtUSD(price) + (gainLoss ? ' ' + gainLoss : '') : "--") + '</td>' +
                '<td class="num">' + (value ? fmtUSD(value) : "--") + '</td>' +
                '<td class="num">' + (yld ? fmtPct(yld) : "--") + '</td>' +
                '<td class="num">' + (div && div.dividend_rate ? fmtUSD(div.dividend_rate) : "--") + '</td>' +
                '<td class="num pos">' + (annualDiv ? fmtUSD(annualDiv) : "--") + '</td>' +
                '<td class="num pos">' + (annualDiv ? fmtUSD(annualDiv / 12) : "--") + '</td>' +
                '<td style="text-align:center">' + freqBadge + '</td>' +
                '<td class="num">' + (pctPortfolio ? fmtPct(pctPortfolio) : "--") + '</td>' +
                '<td><button class="btn-action btn-delete" data-index="' + i + '" title="Remove">&#10005;</button></td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        wrap.innerHTML = html;

        wrap.querySelectorAll(".btn-delete").forEach(function (btn) {
            btn.addEventListener("click", function () {
                deleteHolding(parseInt(btn.dataset.index));
            });
        });

        wrap.querySelectorAll(".editable-cell").forEach(function (cell) {
            cell.addEventListener("click", function () {
                if (cell.querySelector(".inline-edit")) return;
                var idx = parseInt(cell.dataset.index);
                var field = cell.dataset.field;
                var h = getHoldings()[idx];
                var raw = field === "shares" ? h.shares : (h.costBasis || "");

                var input = document.createElement("input");
                input.type = "number";
                input.className = "inline-edit";
                input.value = raw;
                input.step = "any";
                input.min = field === "shares" ? "0.01" : "0";

                cell.textContent = "";
                cell.appendChild(input);
                input.focus();
                input.select();

                function commit() {
                    var val = parseFloat(input.value);
                    if (field === "shares") {
                        updateShares(idx, val);
                    } else {
                        updateCostBasis(idx, val);
                    }
                }

                input.addEventListener("blur", commit);
                input.addEventListener("keydown", function (e) {
                    if (e.key === "Enter") { input.blur(); }
                    if (e.key === "Escape") { renderHoldingsTable(); }
                });
            });
        });
    }

    // === CALENDAR ===
    function renderCalendar() {
        var label = document.getElementById("cal-month-label");
        label.textContent = MONTHS[calMonth] + " " + calYear;

        var cal = document.getElementById("dividend-calendar");
        var events = buildCalendarEvents(calYear, calMonth);

        var firstDay = new Date(calYear, calMonth, 1).getDay();
        var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        var todayStr = new Date().toISOString().slice(0, 10);

        var html = '<div class="cal-header">';
        ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(function (d) {
            html += '<div class="cal-day-header">' + d + '</div>';
        });
        html += '</div><div class="cal-grid">';

        for (var i = 0; i < firstDay; i++) {
            html += '<div class="cal-cell empty"></div>';
        }

        for (var d = 1; d <= daysInMonth; d++) {
            var dateStr = calYear + "-" + String(calMonth + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
            var dayEvents = events[dateStr] || [];
            var isToday = dateStr === todayStr;
            var hasDiv = dayEvents.length > 0;

            var cls = "cal-cell";
            if (isToday) cls += " today";
            if (hasDiv) cls += " has-dividend";

            html += '<div class="' + cls + '">';
            html += '<span class="cal-day-num">' + d + '</span>';

            if (hasDiv) {
                html += '<div class="cal-events">';
                var total = 0;
                dayEvents.forEach(function (ev) {
                    html += '<span class="cal-event ' + ev.type + '" title="' + ev.ticker + ': ' + fmtUSD(ev.amount) + ' (' + ev.type + ')">' + ev.ticker + '</span>';
                    total += ev.amount;
                });
                html += '</div>';
                html += '<div class="cal-total">' + fmtUSD(total) + '</div>';
            }

            html += '</div>';
        }

        html += '</div>';
        cal.innerHTML = html;
    }

    function buildCalendarEvents(year, month) {
        var events = {};
        var holdings = getHoldings();

        function addEvent(dateStr, ticker, amount, type) {
            var d = new Date(dateStr + "T00:00:00");
            if (d.getFullYear() !== year || d.getMonth() !== month) return;
            if (!events[dateStr]) events[dateStr] = [];
            events[dateStr].push({ ticker: ticker, amount: amount, type: type });
        }

        holdings.forEach(function (h) {
            var div = getDividendInfo(h.ticker);
            if (!div) return;

            var rate = div.dividend_rate;
            var freq = div.frequency;
            if (!rate || !freq) return;

            var perPayment;
            if (freq === "monthly") perPayment = rate / 12;
            else if (freq === "quarterly") perPayment = rate / 4;
            else if (freq === "semi-annual") perPayment = rate / 2;
            else perPayment = rate;

            var income = h.shares * perPayment;

            if (div.ex_dividend_date) {
                addEvent(div.ex_dividend_date, h.ticker, income, "ex");
            }

            if (div.last_payments && div.last_payments.length > 0) {
                var payments = div.last_payments;

                payments.forEach(function (p) {
                    var d = new Date(p.ex_date + "T00:00:00");
                    if (d.getFullYear() === year) {
                        addEvent(p.ex_date, h.ticker, h.shares * p.amount, "ex");
                    }
                });

                var daySum = 0;
                payments.forEach(function (p) {
                    daySum += new Date(p.ex_date + "T00:00:00").getDate();
                });
                var avgDay = Math.round(daySum / payments.length);

                var monthsPerPayment;
                if (freq === "monthly") monthsPerPayment = 1;
                else if (freq === "quarterly") monthsPerPayment = 3;
                else if (freq === "semi-annual") monthsPerPayment = 6;
                else monthsPerPayment = 12;

                var lastP = payments[payments.length - 1];
                var lastPDate = new Date(lastP.ex_date + "T00:00:00");
                var lastPMonth = lastPDate.getFullYear() * 12 + lastPDate.getMonth();

                var knownDates = {};
                payments.forEach(function (p) { knownDates[p.ex_date] = true; });

                for (var p = 1; p <= 12; p++) {
                    var projMonth = lastPMonth + p * monthsPerPayment;
                    var projYear = Math.floor(projMonth / 12);
                    var projM = projMonth % 12;
                    var daysInMonth = new Date(projYear, projM + 1, 0).getDate();
                    var day = Math.min(avgDay, daysInMonth);
                    var projDate = new Date(projYear, projM, day);
                    var projStr = projDate.toISOString().slice(0, 10);
                    if (!knownDates[projStr] && projDate.getFullYear() === year) {
                        addEvent(projStr, h.ticker, income, "est");
                    }
                }
            } else {
                var monthsPerPayment;
                if (freq === "monthly") monthsPerPayment = 1;
                else if (freq === "quarterly") monthsPerPayment = 3;
                else if (freq === "semi-annual") monthsPerPayment = 6;
                else monthsPerPayment = 12;

                for (var m = 0; m < 12; m += monthsPerPayment) {
                    var mid = 15;
                    var projDate = new Date(year, m, mid);
                    var pStr = projDate.toISOString().slice(0, 10);
                    if (pStr === div.ex_dividend_date) continue;
                    addEvent(pStr, h.ticker, income, "est");
                }
            }
        });

        return events;
    }

    // === BOOT ===
    document.addEventListener("DOMContentLoaded", init);
})();
