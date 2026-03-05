#!/usr/bin/env python3
"""
Weekly EMA Strategy Scanner Processor
Reads TradingView CSV export and generates scanner_data.json for the website.

Usage: python3 scripts/process_ema.py
  - Finds the most recent CSV in csv/ folder
  - Outputs data/scanner_data.json
"""

import csv
import json
import glob
import os
import re
from datetime import datetime, timedelta
from collections import defaultdict, OrderedDict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
CSV_DIR = os.path.join(PROJECT_DIR, "csv")
OUTPUT_FILE = os.path.join(PROJECT_DIR, "data", "scanner_data.json")
BTC_CSV = os.path.join(PROJECT_DIR, "data.csv")

CROSSOVER_THRESHOLD = 1.0  # percent
TOP_N = 300  # Filter to top N stocks by market cap


def find_latest_csv():
    pattern = os.path.join(CSV_DIR, "Weekly EMA Values_*.csv")
    files = glob.glob(pattern)
    if not files:
        raise FileNotFoundError(f"No Weekly EMA CSV files found in {CSV_DIR}")
    return max(files, key=os.path.getmtime)


def find_latest_index_csv():
    """Find the most recent Index ETF CSV."""
    pattern = os.path.join(CSV_DIR, "Index_ETFs_*.csv")
    files = glob.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getmtime)


def extract_date_from_filename(filepath):
    basename = os.path.basename(filepath)
    match = re.search(r"(\d{4}-\d{2}-\d{2})", basename)
    if match:
        return match.group(1)
    return datetime.now().strftime("%Y-%m-%d")


def pct_diff(a, b):
    if b == 0:
        return 0
    return ((a - b) / b) * 100


def classify_signal(price, ema8, ema13, ema21):
    bull_stack = ema8 > ema13 > ema21
    bear_stack = ema8 < ema13 < ema21

    if bull_stack:
        if price > ema8:
            return "Full Bull"
        elif price > ema13:
            return "Bull Pullback \u2192 13W"
        elif price > ema21:
            return "Bull Pullback \u2192 21W"
        else:
            return "Bull Breakdown"
    elif bear_stack:
        if price < ema8:
            return "Full Bear"
        elif price < ema13:
            return "Bear Rally \u2192 13W"
        else:
            return "Bear Rally above 13W"
    else:
        if price > ema21:
            return "Bullish (unstacked)"
        else:
            return "Bearish (unstacked)"


def parse_csv(filepath):
    stocks = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                symbol = row["Symbol"].strip()
                name = row.get("Description", "").strip()
                price = float(row["Price"])
                mkt_cap_raw = float(row.get("Market capitalization", 0))
                mkt_cap_b = round(mkt_cap_raw / 1e9, 1)

                ema8_col = "Exponential Moving Average (8) 1 week"
                ema13_col = "Exponential Moving Average (13) 1 week"
                ema21_col = "Exponential Moving Average (21) 1 week"

                ema8_val = row.get(ema8_col, "").strip()
                ema13_val = row.get(ema13_col, "").strip()
                ema21_val = row.get(ema21_col, "").strip()

                if not ema8_val or not ema13_val or not ema21_val:
                    continue

                ema8 = float(ema8_val)
                ema13 = float(ema13_val)
                ema21 = float(ema21_val)

                sector = row.get("Sector", "").strip()
                analyst = row.get("Analyst Rating", "").strip()
                chg_1d = float(row.get("Price Change % 1 day", 0) or 0)
                chg_1w = float(row.get("Change from Open % 1 week", 0) or 0)
                chg_1m = float(row.get("Performance % 1 month", 0) or 0)
                rel_vol = float(row.get("Relative Volume 1 day", 0) or 0)

                signal = classify_signal(price, ema8, ema13, ema21)

                price_vs_8w = round(pct_diff(price, ema8), 2)
                price_vs_13w = round(pct_diff(price, ema13), 2)
                price_vs_21w = round(pct_diff(price, ema21), 2)
                ema8_vs_13 = round(pct_diff(ema8, ema13), 2)
                ema13_vs_21 = round(pct_diff(ema13, ema21), 2)
                spread_score = round(ema8_vs_13 + ema13_vs_21, 2)

                stocks.append({
                    "symbol": symbol,
                    "name": name,
                    "price": round(price, 2),
                    "mkt_cap_b": mkt_cap_b,
                    "ema8": round(ema8, 2),
                    "ema13": round(ema13, 2),
                    "ema21": round(ema21, 2),
                    "sector": sector,
                    "analyst": analyst,
                    "chg_1d": round(chg_1d, 2),
                    "chg_1w": round(chg_1w, 2),
                    "chg_1m": round(chg_1m, 2),
                    "rel_vol": round(rel_vol, 2),
                    "signal": signal,
                    "price_vs_8w": price_vs_8w,
                    "price_vs_13w": price_vs_13w,
                    "price_vs_21w": price_vs_21w,
                    "ema8_vs_13": ema8_vs_13,
                    "ema13_vs_21": ema13_vs_21,
                    "spread_score": spread_score,
                })
            except (ValueError, KeyError):
                continue

    return stocks


def build_dashboard(stocks):
    signal_order = [
        "Full Bull", "Bullish (unstacked)",
        "Bull Pullback \u2192 13W", "Bull Pullback \u2192 21W",
        "Bear Rally above 13W", "Bear Rally \u2192 13W",
        "Bearish (unstacked)", "Full Bear", "Bull Breakdown"
    ]
    total = len(stocks)
    counts = defaultdict(list)
    for s in stocks:
        counts[s["signal"]].append(s)

    signals = []
    for sig in signal_order:
        group = counts.get(sig, [])
        count = len(group)
        avg_vs_21w = 0
        if group:
            avg_vs_21w = round(sum(s["price_vs_21w"] for s in group) / len(group), 2)
        signals.append({
            "signal": sig,
            "count": count,
            "pct": round(count / total, 3) if total > 0 else 0,
            "avg_vs_21w": avg_vs_21w,
        })

    return {"signals": signals, "total": total}


def build_full_scanner(stocks):
    sorted_stocks = sorted(stocks, key=lambda s: s["price_vs_21w"], reverse=True)
    for i, s in enumerate(sorted_stocks):
        s["rank"] = i + 1
    return sorted_stocks


def build_pullbacks(stocks):
    pullback_signals = {
        "Bull Pullback \u2192 13W", "Bull Pullback \u2192 21W", "Bull Breakdown"
    }
    filtered = [s for s in stocks if s["signal"] in pullback_signals]
    signal_priority = {
        "Bull Pullback \u2192 13W": 0,
        "Bull Pullback \u2192 21W": 1,
        "Bull Breakdown": 2,
    }
    return sorted(filtered, key=lambda s: (signal_priority.get(s["signal"], 9), -s["price_vs_21w"]))


def build_momentum_leaders(stocks):
    full_bull = [s for s in stocks if s["signal"] == "Full Bull"]
    return sorted(full_bull, key=lambda s: s["spread_score"], reverse=True)


def build_bear_list(stocks):
    full_bear = [s for s in stocks if s["signal"] == "Full Bear"]
    return sorted(full_bear, key=lambda s: s["price_vs_8w"])


def build_sector_heatmap(stocks):
    sectors = defaultdict(list)
    for s in stocks:
        if s["sector"]:
            sectors[s["sector"]].append(s)

    bullish_signals = {
        "Full Bull", "Bullish (unstacked)",
        "Bull Pullback \u2192 13W", "Bull Pullback \u2192 21W"
    }
    bearish_signals = {"Full Bear", "Bearish (unstacked)", "Bear Rally \u2192 13W", "Bear Rally above 13W"}
    pullback_signals = {"Bull Pullback \u2192 13W", "Bull Pullback \u2192 21W", "Bull Breakdown"}

    heatmap = []
    for sector, group in sectors.items():
        n = len(group)
        full_bull = sum(1 for s in group if s["signal"] == "Full Bull")
        all_bullish = sum(1 for s in group if s["signal"] in bullish_signals)
        all_bearish = sum(1 for s in group if s["signal"] in bearish_signals)
        pullbacks = sum(1 for s in group if s["signal"] in pullback_signals)

        bull_pct = round(all_bullish / n * 100, 1) if n else 0
        bear_pct = round(all_bearish / n * 100, 1) if n else 0
        net_score = round(bull_pct - bear_pct, 1)

        avg_vs_21w = round(sum(s["price_vs_21w"] for s in group) / n, 2) if n else 0
        avg_vs_8w = round(sum(s["price_vs_8w"] for s in group) / n, 2) if n else 0

        heatmap.append({
            "sector": sector,
            "count": n,
            "full_bull": full_bull,
            "all_bullish": all_bullish,
            "all_bearish": all_bearish,
            "pullbacks": pullbacks,
            "bull_pct": bull_pct,
            "bear_pct": bear_pct,
            "net_score": net_score,
            "avg_vs_21w": avg_vs_21w,
            "avg_vs_8w": avg_vs_8w,
        })

    return sorted(heatmap, key=lambda s: s["net_score"], reverse=True)


def build_crossover_alerts(stocks):
    alerts = []
    for s in stocks:
        gap_8_13 = abs(s["ema8_vs_13"])
        gap_13_21 = abs(s["ema13_vs_21"])

        if gap_8_13 < CROSSOVER_THRESHOLD or gap_13_21 < CROSSOVER_THRESHOLD:
            alert_parts = []
            if gap_8_13 < CROSSOVER_THRESHOLD:
                if s["ema8"] > s["ema13"]:
                    alert_parts.append(
                        f"8W just above 13W ({gap_8_13:.2f}%) \u2014 bearish cross risk"
                    )
                else:
                    alert_parts.append(
                        f"8W just below 13W ({gap_8_13:.2f}%) \u2014 bullish cross potential"
                    )
            if gap_13_21 < CROSSOVER_THRESHOLD:
                if s["ema13"] > s["ema21"]:
                    alert_parts.append(
                        f"13W just above 21W ({gap_13_21:.2f}%) \u2014 bearish cross risk"
                    )
                else:
                    alert_parts.append(
                        f"13W just below 21W ({gap_13_21:.2f}%) \u2014 bullish cross potential"
                    )

            alerts.append({
                **s,
                "gap_8_13": round(gap_8_13, 2),
                "gap_13_21": round(gap_13_21, 2),
                "alert": "; ".join(alert_parts),
            })

    return sorted(alerts, key=lambda s: min(s["gap_8_13"], s["gap_13_21"]))


def build_index_context():
    """Load and process index ETF data (SPY, QQQ) if available."""
    index_csv = find_latest_index_csv()
    if not index_csv:
        print("No index ETF CSV found, skipping index context")
        return []

    index_stocks = parse_csv(index_csv)
    context = []
    for s in index_stocks:
        # Build crossover alert (same logic as build_crossover_alerts)
        gap_8_13 = abs(s["ema8_vs_13"])
        gap_13_21 = abs(s["ema13_vs_21"])
        alert_parts = []
        if gap_8_13 < CROSSOVER_THRESHOLD:
            if s["ema8"] > s["ema13"]:
                alert_parts.append(f"8W just above 13W ({gap_8_13:.2f}%) \u2014 bearish cross risk")
            else:
                alert_parts.append(f"8W just below 13W ({gap_8_13:.2f}%) \u2014 bullish cross potential")
        if gap_13_21 < CROSSOVER_THRESHOLD:
            if s["ema13"] > s["ema21"]:
                alert_parts.append(f"13W just above 21W ({gap_13_21:.2f}%) \u2014 bearish cross risk")
            else:
                alert_parts.append(f"13W just below 21W ({gap_13_21:.2f}%) \u2014 bullish cross potential")

        context.append({
            "symbol": s["symbol"],
            "name": s["name"],
            "price": s["price"],
            "ema8": s["ema8"],
            "ema13": s["ema13"],
            "ema21": s["ema21"],
            "signal": s["signal"],
            "price_vs_8w": s["price_vs_8w"],
            "price_vs_13w": s["price_vs_13w"],
            "price_vs_21w": s["price_vs_21w"],
            "ema8_vs_13": s["ema8_vs_13"],
            "ema13_vs_21": s["ema13_vs_21"],
            "spread_score": s["spread_score"],
            "chg_1d": s["chg_1d"],
            "chg_1w": s["chg_1w"],
            "chg_1m": s["chg_1m"],
            "crossover_alert": "; ".join(alert_parts) if alert_parts else None,
        })
    print(f"Loaded {len(context)} index ETFs: {', '.join(s['symbol'] for s in context)}")
    return context


def _calc_ema(closes, period):
    """Calculate EMA from a list of closes. Seed with SMA of first `period` values."""
    if len(closes) < period:
        return None
    sma = sum(closes[:period]) / period
    mult = 2.0 / (period + 1)
    ema = sma
    for close in closes[period:]:
        ema = (close - ema) * mult + ema
    return ema


def _find_nearest_price(daily, target_date):
    """Find the price closest to target_date (looking backward)."""
    for date, price in reversed(daily):
        if date <= target_date:
            return price
    return daily[0][1]  # fallback to earliest


def build_btc_context():
    """Calculate BTC weekly EMA context from data.csv (daily BTC prices)."""
    if not os.path.exists(BTC_CSV):
        print("No data.csv found, skipping BTC context")
        return None

    # Load daily data
    daily = []
    with open(BTC_CSV, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                date = datetime.strptime(row["date"], "%Y-%m-%d")
                price = float(row["price"])
                if price > 0:
                    daily.append((date, price))
            except (ValueError, KeyError):
                continue

    if len(daily) < 200:  # need enough history for 21-week EMA
        print(f"Not enough BTC data for EMA calculation ({len(daily)} rows)")
        return None

    # Resample to weekly closes (ISO week, last price per week)
    weekly = OrderedDict()
    for date, price in daily:
        yr, wk, _ = date.isocalendar()
        key = (yr, wk)
        weekly[key] = price  # last value per week wins

    weekly_closes = list(weekly.values())

    # Calculate EMAs on weekly closes
    ema8 = _calc_ema(weekly_closes, 8)
    ema13 = _calc_ema(weekly_closes, 13)
    ema21 = _calc_ema(weekly_closes, 21)

    if not all([ema8, ema13, ema21]):
        print("Failed to calculate BTC EMAs")
        return None

    current_price = daily[-1][1]
    prev_price = daily[-2][1] if len(daily) >= 2 else current_price

    # 1D change
    chg_1d = round(pct_diff(current_price, prev_price), 2)

    # 1W change
    target_1w = daily[-1][0] - timedelta(days=7)
    price_1w = _find_nearest_price(daily, target_1w)
    chg_1w = round(pct_diff(current_price, price_1w), 2)

    # 1M change
    target_1m = daily[-1][0] - timedelta(days=30)
    price_1m = _find_nearest_price(daily, target_1m)
    chg_1m = round(pct_diff(current_price, price_1m), 2)

    price = round(current_price, 2)
    ema8 = round(ema8, 2)
    ema13 = round(ema13, 2)
    ema21 = round(ema21, 2)

    signal = classify_signal(price, ema8, ema13, ema21)

    price_vs_8w = round(pct_diff(price, ema8), 2)
    price_vs_13w = round(pct_diff(price, ema13), 2)
    price_vs_21w = round(pct_diff(price, ema21), 2)
    ema8_vs_13 = round(pct_diff(ema8, ema13), 2)
    ema13_vs_21 = round(pct_diff(ema13, ema21), 2)
    spread_score = round(ema8_vs_13 + ema13_vs_21, 2)

    # Crossover alert
    gap_8_13 = abs(ema8_vs_13)
    gap_13_21 = abs(ema13_vs_21)
    alert_parts = []
    if gap_8_13 < CROSSOVER_THRESHOLD:
        if ema8 > ema13:
            alert_parts.append(f"8W just above 13W ({gap_8_13:.2f}%) \u2014 bearish cross risk")
        else:
            alert_parts.append(f"8W just below 13W ({gap_8_13:.2f}%) \u2014 bullish cross potential")
    if gap_13_21 < CROSSOVER_THRESHOLD:
        if ema13 > ema21:
            alert_parts.append(f"13W just above 21W ({gap_13_21:.2f}%) \u2014 bearish cross risk")
        else:
            alert_parts.append(f"13W just below 21W ({gap_13_21:.2f}%) \u2014 bullish cross potential")

    return {
        "symbol": "BTC",
        "name": "Bitcoin",
        "price": price,
        "ema8": ema8,
        "ema13": ema13,
        "ema21": ema21,
        "signal": signal,
        "price_vs_8w": price_vs_8w,
        "price_vs_13w": price_vs_13w,
        "price_vs_21w": price_vs_21w,
        "ema8_vs_13": ema8_vs_13,
        "ema13_vs_21": ema13_vs_21,
        "spread_score": spread_score,
        "chg_1d": chg_1d,
        "chg_1w": chg_1w,
        "chg_1m": chg_1m,
        "crossover_alert": "; ".join(alert_parts) if alert_parts else None,
    }


def main():
    csv_path = find_latest_csv()
    data_date = extract_date_from_filename(csv_path)
    print(f"Processing: {os.path.basename(csv_path)}")

    all_stocks = parse_csv(csv_path)
    print(f"Parsed {len(all_stocks)} stocks from CSV")

    # Filter to top N by market cap
    all_stocks.sort(key=lambda s: s["mkt_cap_b"], reverse=True)
    stocks = all_stocks[:TOP_N]
    print(f"Filtered to top {len(stocks)} by market cap")

    # Load index ETF context
    index_context = build_index_context()

    # Add BTC context from data.csv
    btc_context = build_btc_context()
    if btc_context:
        index_context.append(btc_context)
        print(f"Added BTC context: {btc_context['signal']} at ${btc_context['price']:,.0f}")

    # Preserve existing ai_summary if present
    existing_summary = None
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r") as f:
                existing = json.load(f)
            existing_summary = existing.get("ai_summary")
        except (json.JSONDecodeError, IOError):
            pass

    output = {
        "meta": {
            "date": data_date,
            "total_stocks": len(stocks),
            "generated_at": datetime.now().isoformat(),
            "index_etfs": [s["symbol"] for s in index_context],
        },
        "index_context": index_context,
        "dashboard": build_dashboard(stocks),
        "full_scanner": build_full_scanner(stocks),
        "pullbacks": build_pullbacks(stocks),
        "momentum_leaders": build_momentum_leaders(stocks),
        "bear_list": build_bear_list(stocks),
        "sector_heatmap": build_sector_heatmap(stocks),
        "crossover_alerts": build_crossover_alerts(stocks),
    }

    if existing_summary:
        output["ai_summary"] = existing_summary

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Output: {OUTPUT_FILE}")
    print(f"  Dashboard: {len(output['dashboard']['signals'])} signal categories")
    print(f"  Full Scanner: {len(output['full_scanner'])} stocks")
    print(f"  Pullbacks: {len(output['pullbacks'])} setups")
    print(f"  Momentum Leaders: {len(output['momentum_leaders'])} stocks")
    print(f"  Bear List: {len(output['bear_list'])} stocks")
    print(f"  Sector Heatmap: {len(output['sector_heatmap'])} sectors")
    print(f"  Crossover Alerts: {len(output['crossover_alerts'])} alerts")


if __name__ == "__main__":
    main()
