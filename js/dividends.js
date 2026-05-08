(function () {
    "use strict";

    const WORKER_URL = "https://daveybitcoins-api.dave-erazo78.workers.dev";
    const STORAGE_KEY = "dividend_holdings";
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    let dividendData = null;
    let holdings = [];
    let liveQuotes = {};
    let calYear, calMonth;

    // === LOCALSTORAGE ===
    function loadHoldings() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch { return []; }
    }

    function saveHoldings() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
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
        holdings = loadHoldings();

        try {
            var resp = await fetch("data/dividend_data.json?v=" + Date.now());
            dividendData = await resp.json();
        } catch {
            dividendData = { meta: { date: "N/A", total_tickers: 0 }, tickers: {} };
        }

        document.getElementById("data-date").innerHTML =
            '<span class="pill pill-date">' + (dividendData.meta.date || "N/A") + '</span>' +
            '<span class="pill pill-count">' + (dividendData.meta.total_tickers || 0) + ' dividend stocks</span>';

        if (holdings.length > 0) {
            await fetchLivePrices();
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
        if (holdings.length === 0) { liveQuotes = {}; return; }
        var symbols = holdings.map(function (h) { return h.ticker; }).join(",");
        try {
            var resp = await fetch(WORKER_URL + "/api/quotes?symbols=" + encodeURIComponent(symbols));
            liveQuotes = await resp.json();
        } catch {
            liveQuotes = {};
        }
    }

    function getLivePrice(ticker) {
        var q = liveQuotes[ticker];
        if (q && q.c && q.c > 0) return q.c;
        return null;
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

        var existing = holdings.findIndex(function (h) { return h.ticker === ticker; });
        if (existing >= 0) {
            holdings[existing].shares = shares;
            if (cost != null) holdings[existing].costBasis = cost;
        } else {
            holdings.push({ ticker: ticker, shares: shares, costBasis: cost });
        }

        saveHoldings();
        tickerInput.value = "";
        sharesInput.value = "";
        costInput.value = "";
        tickerInput.focus();

        await fetchLivePrices();
        renderAll();
    }

    function deleteHolding(index) {
        holdings.splice(index, 1);
        saveHoldings();
        renderAll();
    }

    function updateShares(index, newShares) {
        if (isNaN(newShares) || newShares <= 0) return;
        holdings[index].shares = newShares;
        saveHoldings();
        renderAll();
    }

    // === RENDER ALL ===
    function renderAll() {
        renderSummaryCards();
        renderHoldingsTable();
        renderCalendar();
    }

    // === SUMMARY CARDS ===
    function renderSummaryCards() {
        var totalAnnual = 0;
        var totalValue = 0;

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

        // Next ex-date
        var nextDate = null;
        var today = new Date().toISOString().slice(0, 10);
        holdings.forEach(function (h) {
            var div = getDividendInfo(h.ticker);
            if (div && div.ex_dividend_date && div.ex_dividend_date >= today) {
                if (!nextDate || div.ex_dividend_date < nextDate) {
                    nextDate = div.ex_dividend_date;
                }
            }
        });
        document.getElementById("next-payout").textContent = nextDate || "--";
    }

    function getDividendInfo(ticker) {
        if (!dividendData || !dividendData.tickers) return null;
        return dividendData.tickers[ticker] || null;
    }

    // === HOLDINGS TABLE ===
    function renderHoldingsTable() {
        var wrap = document.getElementById("holdings-table-wrap");

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
            '<th>Ticker</th><th>Name</th><th>Shares</th><th>Price</th><th>Value</th>' +
            '<th>Yield</th><th>Annual Div</th><th>Frequency</th><th>Next Ex-Date</th>' +
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

            var exDateClass = "";
            if (exDate) {
                var today = new Date().toISOString().slice(0, 10);
                exDateClass = exDate < today ? " neutral" : " pos";
            }

            html += '<tr>' +
                '<td><strong style="font-family:JetBrains Mono,monospace">' + h.ticker + '</strong></td>' +
                '<td class="name-cell">' + name + '</td>' +
                '<td class="num">' + h.shares + '</td>' +
                '<td class="num">' + (price ? fmtUSD(price) : "--") + '</td>' +
                '<td class="num">' + (value ? fmtUSD(value) : "--") + '</td>' +
                '<td class="num">' + (yld ? fmtPct(yld) : "--") + '</td>' +
                '<td class="num pos">' + (annualDiv ? fmtUSD(annualDiv) : "--") + '</td>' +
                '<td style="text-align:center">' + freqBadge + '</td>' +
                '<td class="num' + exDateClass + '">' + (exDate || "--") + '</td>' +
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

            // Use known ex-date
            if (div.ex_dividend_date) {
                addEvent(div.ex_dividend_date, h.ticker, income, "ex");
            }

            // Project from last_payments
            if (div.last_payments && div.last_payments.length > 0) {
                var lastPayment = div.last_payments[div.last_payments.length - 1];
                var lastDate = new Date(lastPayment.ex_date + "T00:00:00");
                var gapDays;
                if (freq === "monthly") gapDays = 30;
                else if (freq === "quarterly") gapDays = 91;
                else if (freq === "semi-annual") gapDays = 182;
                else gapDays = 365;

                for (var p = 1; p <= 12; p++) {
                    var projected = new Date(lastDate.getTime() + p * gapDays * 86400000);
                    var projStr = projected.toISOString().slice(0, 10);
                    if (projStr === div.ex_dividend_date) continue;
                    addEvent(projStr, h.ticker, income, "ex");
                }
            }
        });

        return events;
    }

    // === BOOT ===
    document.addEventListener("DOMContentLoaded", init);
})();
