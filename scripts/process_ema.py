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
import math
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
                chg_ytd = float(row.get("Performance % YTD", 0) or 0)
                rel_vol = float(row.get("Relative Volume 1 day", 0) or 0)

                # Daily SMAs for breadth calculation
                def _safe_float(val):
                    try:
                        v = float(val) if val else None
                        return v if v is not None and v == v else None
                    except (ValueError, TypeError):
                        return None
                sma5 = _safe_float(row.get("SMA 5", "").strip() if row.get("SMA 5") else "")
                sma20 = _safe_float(row.get("SMA 20", "").strip() if row.get("SMA 20") else "")
                sma50 = _safe_float(row.get("SMA 50", "").strip() if row.get("SMA 50") else "")
                sma200 = _safe_float(row.get("SMA 200", "").strip() if row.get("SMA 200") else "")

                # Forward P/E: price / (4 * next quarter EPS forecast)
                pe_ttm_raw = row.get("PE Ratio TTM", "").strip()
                eps_fwd_raw = row.get("EPS Forecast Next Qtr", "").strip()
                try:
                    pe_val = float(pe_ttm_raw) if pe_ttm_raw else None
                    pe_ttm = round(pe_val, 1) if pe_val is not None and pe_val == pe_val else None  # NaN check
                except (ValueError, TypeError):
                    pe_ttm = None
                try:
                    eps_fwd = float(eps_fwd_raw) if eps_fwd_raw else None
                    if eps_fwd is not None and eps_fwd != eps_fwd:  # NaN check
                        eps_fwd = None
                except (ValueError, TypeError):
                    eps_fwd = None
                fwd_pe = round(price / (4 * eps_fwd), 1) if eps_fwd and eps_fwd > 0 else None

                # PEG ratio: fwd_pe / EPS growth rate (YoY TTM)
                eps_growth_raw = row.get("EPS Growth YoY TTM", "").strip()
                try:
                    eps_growth = float(eps_growth_raw) if eps_growth_raw else None
                    if eps_growth is not None and eps_growth != eps_growth:  # NaN check
                        eps_growth = None
                except (ValueError, TypeError):
                    eps_growth = None
                peg_raw = round(fwd_pe / eps_growth, 2) if fwd_pe and eps_growth and eps_growth > 0 else None
                peg = peg_raw if peg_raw is not None and 0 < peg_raw <= 5 else None

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
                    "chg_ytd": round(chg_ytd, 2),
                    "rel_vol": round(rel_vol, 2),
                    "signal": signal,
                    "price_vs_8w": price_vs_8w,
                    "price_vs_13w": price_vs_13w,
                    "price_vs_21w": price_vs_21w,
                    "ema8_vs_13": ema8_vs_13,
                    "ema13_vs_21": ema13_vs_21,
                    "spread_score": spread_score,
                    "pe_ttm": pe_ttm,
                    "fwd_pe": fwd_pe,
                    "peg": peg,
                    "sma5": sma5,
                    "sma20": sma20,
                    "sma50": sma50,
                    "sma200": sma200,
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
    # Classify volume quality
    for s in filtered:
        rv = s.get("rel_vol", 0)
        if rv < 0.8:
            s["vol_quality"] = "Low Vol"
        elif rv > 1.5:
            s["vol_quality"] = "High Vol"
        else:
            s["vol_quality"] = "Normal Vol"
    return sorted(filtered, key=lambda s: (signal_priority.get(s["signal"], 9), -s["price_vs_21w"]))


def build_momentum_leaders(stocks):
    full_bull = [s for s in stocks if s["signal"] == "Full Bull"]
    return sorted(full_bull, key=lambda s: s["spread_score"], reverse=True)


def build_bear_list(stocks):
    full_bear = [s for s in stocks if s["signal"] == "Full Bear"]
    return sorted(full_bear, key=lambda s: s["price_vs_8w"])


def build_best_opportunities(stocks):
    """
    Find stocks with attractive PEG ratios that represent opportunistic buys.
    Criteria: PEG 0-2.0, Fwd PE < 30, Market cap > $50B, analyst Buy or Strong Buy.
    Adds buy zone levels based on SMA support.
    """
    buy_ratings = {"Buy", "Strong buy"}
    candidates = []
    for s in stocks:
        peg = s.get("peg")
        fwd_pe = s.get("fwd_pe")
        mkt_cap = s.get("mkt_cap_b", 0)
        analyst = s.get("analyst", "")

        if not (peg and 0 < peg < 2.0 and fwd_pe and fwd_pe < 30 and mkt_cap >= 50 and analyst in buy_ratings):
            continue

        # Calculate distance from key SMAs for buy zone context
        price = s["price"]
        sma50 = s.get("sma50")
        sma200 = s.get("sma200")
        pct_from_50 = round(((price - sma50) / sma50) * 100, 1) if sma50 else None
        pct_from_200 = round(((price - sma200) / sma200) * 100, 1) if sma200 else None

        # Implied growth rate from PEG: growth = fwd_pe / peg
        implied_growth = round(fwd_pe / peg, 1) if peg > 0 else None

        candidates.append({
            **s,
            "pct_from_50": pct_from_50,
            "pct_from_200": pct_from_200,
            "implied_growth": implied_growth,
        })

    # Sort by PEG (cheapest growth-adjusted first)
    return sorted(candidates, key=lambda s: s["peg"])


def build_outperformers(stocks, index_context):
    """Find stocks outperforming SPY on both 1W and YTD basis."""
    spy = next((s for s in index_context if s["symbol"] == "SPY"), None)
    if not spy:
        return []

    spy_1w = spy.get("chg_1w", 0)
    spy_ytd = spy.get("chg_ytd", 0)

    outperformers = []
    for s in stocks:
        alpha_1w = round(s["chg_1w"] - spy_1w, 2)
        alpha_ytd = round(s.get("chg_ytd", 0) - spy_ytd, 2)
        if alpha_1w > 0 and alpha_ytd > 0:
            outperformers.append({
                **s,
                "spy_1w": spy_1w,
                "spy_ytd": spy_ytd,
                "alpha_1w": alpha_1w,
                "alpha_ytd": alpha_ytd,
            })

    return sorted(outperformers, key=lambda s: s["alpha_ytd"], reverse=True)


BREADTH_HISTORY = os.path.join(PROJECT_DIR, "data", "breadth_history.csv")


def build_breadth_context(stocks, data_date):
    """Calculate market breadth: % of stocks above each daily SMA."""
    sma_fields = [
        ("above_5d", "sma5"),
        ("above_20d", "sma20"),
        ("above_50d", "sma50"),
        ("above_200d", "sma200"),
    ]

    totals = {key: {"above": 0, "valid": 0} for key, _ in sma_fields}

    for s in stocks:
        for key, field in sma_fields:
            sma_val = s.get(field)
            if sma_val is not None:
                totals[key]["valid"] += 1
                if s["price"] > sma_val:
                    totals[key]["above"] += 1

    # Current readings
    current = {}
    for key, _ in sma_fields:
        t = totals[key]
        current[key] = round(t["above"] / t["valid"] * 100, 1) if t["valid"] > 0 else 0

    # Append to history CSV (dedup on date)
    _append_breadth_history(data_date, current)

    # Load history and compute historical stats
    history = _load_breadth_history()
    stats = _compute_breadth_stats(history, current)

    return {
        **current,
        "total_stocks": len(stocks),
        "stats": stats,
    }


def _compute_breadth_stats(history, current):
    """Compute historical percentiles, extremes, and composite breadth score."""
    if len(history) < 30:
        return None

    fields = ["above_5d", "above_20d", "above_50d", "above_200d"]
    labels = {
        "above_5d": "% > 5D MA",
        "above_20d": "% > 20D MA",
        "above_50d": "% > 50D MA",
        "above_200d": "% > 200D MA",
    }

    indicators = []
    percentile_scores = []

    for field in fields:
        values = sorted([h[field] for h in history if h.get(field, 0) > 0])
        if not values:
            continue

        cur = current[field]
        n = len(values)

        # Percentile rank of current reading
        rank = sum(1 for v in values if v <= cur)
        percentile = round(rank / n * 100, 1)
        percentile_scores.append(percentile)

        # Historical stats
        hist_min = min(values)
        hist_max = max(values)
        hist_avg = round(sum(values) / n, 1)
        hist_median = values[n // 2]

        # Quintile thresholds (20th/80th percentile — typical rebound/decline zones)
        p10 = values[int(n * 0.10)]
        p20 = values[int(n * 0.20)]
        p80 = values[min(int(n * 0.80), n - 1)]
        p90 = values[min(int(n * 0.90), n - 1)]

        # Zone classification
        if cur <= p10:
            zone = "Extreme Oversold"
        elif cur <= p20:
            zone = "Oversold"
        elif cur >= p90:
            zone = "Extreme Overbought"
        elif cur >= p80:
            zone = "Overbought"
        else:
            zone = "Neutral"

        indicators.append({
            "field": field,
            "label": labels[field],
            "current": cur,
            "percentile": percentile,
            "zone": zone,
            "hist_min": round(hist_min, 1),
            "hist_max": round(hist_max, 1),
            "hist_avg": hist_avg,
            "hist_median": round(hist_median, 1),
            "p10": round(p10, 1),
            "p20": round(p20, 1),
            "p80": round(p80, 1),
            "p90": round(p90, 1),
            "data_points": n,
        })

    # Composite breadth score: average of percentile ranks (0-100)
    composite = round(sum(percentile_scores) / len(percentile_scores), 1) if percentile_scores else 50

    # Composite zone
    if composite <= 10:
        composite_zone = "Extreme Oversold"
    elif composite <= 20:
        composite_zone = "Oversold"
    elif composite <= 40:
        composite_zone = "Weak"
    elif composite <= 60:
        composite_zone = "Neutral"
    elif composite <= 80:
        composite_zone = "Healthy"
    elif composite <= 90:
        composite_zone = "Overbought"
    else:
        composite_zone = "Extreme Overbought"

    # Forward-return analysis: what historically happens after readings this low/high
    # Pass the computed indicator zones so forward returns uses the same classification
    indicator_zones = {ind["field"]: ind["zone"] for ind in indicators}
    forward_analysis = _compute_forward_returns(history, current, fields, indicator_zones)

    return {
        "indicators": indicators,
        "composite_score": composite,
        "composite_zone": composite_zone,
        "history_days": len(history),
        "forward_returns": forward_analysis,
    }


def _compute_forward_returns(history, current, fields, indicator_zones):
    """Compute what historically happens N days after breadth hits current levels.

    Uses the same zone classification from the stats table (percentile-based)
    to determine direction. Only shows forward returns for indicators that are
    actually in an oversold or overbought zone — skips Neutral indicators.
    """
    labels = {
        "above_5d": "% > 5D MA",
        "above_20d": "% > 20D MA",
        "above_50d": "% > 50D MA",
        "above_200d": "% > 200D MA",
    }
    horizons = [5, 10, 20, 60]
    results = []

    for field in fields:
        zone = indicator_zones.get(field, "Neutral")

        # Determine direction from the zone classification (same as stats table)
        if zone in ("Extreme Oversold", "Oversold"):
            is_low = True
            direction = "oversold"
        elif zone in ("Extreme Overbought", "Overbought"):
            is_low = False
            direction = "overbought"
        else:
            # Neutral — skip this indicator, no signal
            continue

        # Build ordered list of (index, value) for valid data points
        valid = [(i, h[field]) for i, h in enumerate(history) if h.get(field, 0) > 0]
        if len(valid) < 100:
            continue

        cur = current[field]
        threshold = cur

        # Collect forward observations
        forward = {h: [] for h in horizons}
        valid_indices = {idx for idx, _ in valid}

        for idx, val in valid:
            if is_low and val <= threshold:
                for h in horizons:
                    target_idx = idx + h
                    if target_idx < len(history) and target_idx in valid_indices:
                        future_val = history[target_idx][field]
                        if future_val > 0:
                            forward[h].append(future_val - val)
            elif not is_low and val >= threshold:
                for h in horizons:
                    target_idx = idx + h
                    if target_idx < len(history) and target_idx in valid_indices:
                        future_val = history[target_idx][field]
                        if future_val > 0:
                            forward[h].append(future_val - val)

        # Summarize
        horizon_stats = []
        for h in horizons:
            changes = forward[h]
            if not changes:
                continue
            if is_low:
                pct_revert = round(sum(1 for c in changes if c > 0) / len(changes) * 100, 0)
            else:
                pct_revert = round(sum(1 for c in changes if c < 0) / len(changes) * 100, 0)

            horizon_stats.append({
                "days": h,
                "occurrences": len(changes),
                "avg_change": round(sum(changes) / len(changes), 1),
                "median_change": round(sorted(changes)[len(changes) // 2], 1),
                "pct_revert": pct_revert,
            })

        results.append({
            "field": field,
            "label": labels[field],
            "current": cur,
            "direction": direction,
            "zone": zone,
            "threshold": round(threshold, 1),
            "horizons": horizon_stats,
        })

    return results


def _append_breadth_history(data_date, current):
    """Append today's breadth reading to history CSV, deduplicating on date."""
    fieldnames = ["date", "above_5d", "above_20d", "above_50d", "above_200d"]
    rows = []

    # Read existing
    if os.path.exists(BREADTH_HISTORY):
        with open(BREADTH_HISTORY, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row["date"] != data_date:
                    rows.append(row)

    # Add today
    rows.append({
        "date": data_date,
        "above_5d": current["above_5d"],
        "above_20d": current["above_20d"],
        "above_50d": current["above_50d"],
        "above_200d": current["above_200d"],
    })

    # Sort by date
    rows.sort(key=lambda r: r["date"])

    # Write back
    os.makedirs(os.path.dirname(BREADTH_HISTORY), exist_ok=True)
    with open(BREADTH_HISTORY, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _load_breadth_history(days=None):
    """Load last N days of breadth history for charting."""
    if not os.path.exists(BREADTH_HISTORY):
        return []

    rows = []
    with open(BREADTH_HISTORY, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "date": row["date"],
                "above_5d": float(row["above_5d"]),
                "above_20d": float(row["above_20d"]),
                "above_50d": float(row["above_50d"]),
                "above_200d": float(row["above_200d"]),
            })

    return rows[-days:] if days else rows


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

        # Classify volume quality
        rv = s.get("rel_vol", 0)
        if rv < 0.8:
            vol_quality = "Low Vol"
        elif rv > 1.5:
            vol_quality = "High Vol"
        else:
            vol_quality = "Normal Vol"

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
            "chg_ytd": s.get("chg_ytd", 0),
            "rel_vol": s.get("rel_vol", 0),
            "vol_quality": vol_quality,
            "crossover_alert": "; ".join(alert_parts) if alert_parts else None,
        })
    print(f"Loaded {len(context)} index ETFs: {', '.join(s['symbol'] for s in context)}")
    return context


GENESIS_MS = datetime(2009, 1, 3).timestamp() * 1000  # BTC genesis date
RISK_WINDOW = 1460  # 4-year rolling window (days)


def _norm_cdf(z):
    """Gaussian CDF via Abramowitz & Stegun approximation (matches risk-metric.html)."""
    t = 1.0 / (1.0 + 0.2316419 * abs(z))
    d = 0.3989422804 * math.exp(-z * z / 2)
    p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.330274))))
    return 1 - p if z > 0 else p


def _calc_btc_risk(daily):
    """Calculate BTC Combined Risk Score matching risk-metric.html logic.

    Returns dict with risk_combo, risk_mm, risk_zs, fair_value, dev_pct, zone, zone_color
    or None if insufficient data.
    """
    # Build points with log-log values
    pts = []
    for date, price in daily:
        ms = date.timestamp() * 1000
        days = (ms - GENESIS_MS) / 864e5
        if days > 0 and price > 0:
            pts.append({
                "days": days,
                "log_days": math.log10(days),
                "log_price": math.log10(price),
                "price": price,
            })

    if len(pts) < RISK_WINDOW:
        return None

    n = len(pts)

    # Linear regression on log-log scale
    sx = sy = sxy = sxx = 0
    for p in pts:
        sx += p["log_days"]
        sy += p["log_price"]
        sxy += p["log_days"] * p["log_price"]
        sxx += p["log_days"] * p["log_days"]
    slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    intercept = (sy - slope * sx) / n

    # Calculate residuals and find extremes
    min_res = float("inf")
    max_res = float("-inf")
    for p in pts:
        p["reg_log_price"] = slope * p["log_days"] + intercept
        p["reg_price"] = 10 ** p["reg_log_price"]
        p["residual"] = p["log_price"] - p["reg_log_price"]
        if p["residual"] < min_res:
            min_res = p["residual"]
        if p["residual"] > max_res:
            max_res = p["residual"]

    # Structural risk (min-max normalization)
    res_range = max_res - min_res
    for p in pts:
        p["risk_mm"] = max(0, min(1, (p["residual"] - min_res) / res_range))

    # Momentum risk (rolling z-score → Gaussian CDF)
    residuals = [p["residual"] for p in pts]
    r_sum = 0.0
    r_sum_sq = 0.0
    for i in range(n):
        r_sum += residuals[i]
        r_sum_sq += residuals[i] * residuals[i]
        if i >= RISK_WINDOW:
            r_sum -= residuals[i - RISK_WINDOW]
            r_sum_sq -= residuals[i - RISK_WINDOW] * residuals[i - RISK_WINDOW]
        cnt = min(i + 1, RISK_WINDOW)
        mean = r_sum / cnt
        vari = max(0.0001, r_sum_sq / cnt - mean * mean)
        std = math.sqrt(vari)
        z = (residuals[i] - mean) / std
        pts[i]["risk_zs"] = _norm_cdf(z)

    # Combined risk (geometric mean)
    for p in pts:
        p["risk_combo"] = math.sqrt(p["risk_mm"] * p["risk_zs"])

    last = pts[-1]
    risk_combo = round(last["risk_combo"], 3)
    fair_value = round(last["reg_price"], 2)
    dev_pct = round((last["price"] / last["reg_price"] - 1) * 100, 1)

    # Zone classification
    if risk_combo < 0.25:
        zone, zone_color = "Accumulate", "#2563eb"
    elif risk_combo < 0.50:
        zone, zone_color = "Neutral", "#10b981"
    elif risk_combo < 0.75:
        zone, zone_color = "Caution", "#eab308"
    else:
        zone, zone_color = "Euphoria", "#ef4444"

    return {
        "risk_combo": risk_combo,
        "risk_mm": round(last["risk_mm"], 3),
        "risk_zs": round(last["risk_zs"], 3),
        "fair_value": fair_value,
        "dev_pct": dev_pct,
        "zone": zone,
        "zone_color": zone_color,
    }


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

    # Calculate Combined Risk Score
    risk_data = _calc_btc_risk(daily)

    result = {
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

    if risk_data:
        result.update(risk_data)

    return result


def build_vix_context():
    """Load latest VIX data from csv/VIX_*.json if available."""
    pattern = os.path.join(CSV_DIR, "VIX_*.json")
    files = glob.glob(pattern)
    if not files:
        return None
    latest = max(files, key=os.path.getmtime)
    try:
        with open(latest, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def main():
    csv_path = find_latest_csv()
    data_date = extract_date_from_filename(csv_path)
    print(f"Processing: {os.path.basename(csv_path)}")

    all_stocks = parse_csv(csv_path)
    print(f"Parsed {len(all_stocks)} stocks from CSV")

    # Filter out preferred shares, depositary receipts, and foreign OTC tickers
    # Examples: BAC/PK, MS/PE, WFC/PD, T/PA, BRK.B is OK (class shares), MURGF (foreign OTC)
    import re
    def is_common_stock(ticker):
        # Exclude tickers with "/" (preferred shares like BAC/PK, MS/PE)
        if "/" in ticker:
            return False
        # Exclude 5-letter tickers ending in F (foreign OTC like MURGF)
        if len(ticker) == 5 and ticker.endswith("F"):
            return False
        # Exclude preferred shares without "/" (e.g., WFCNP, JPMPR, BRKPR)
        # These are typically 4-6 letter tickers ending in P/PR/NP
        if re.match(r'^[A-Z]{2,4}(PR|NP|P)$', ticker) and len(ticker) >= 4:
            return False
        return True

    before = len(all_stocks)
    all_stocks = [s for s in all_stocks if is_common_stock(s["symbol"])]
    filtered_out = before - len(all_stocks)
    if filtered_out:
        print(f"Removed {filtered_out} preferred shares / foreign OTC tickers")

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

    # Add VIX context
    vix_context = build_vix_context()
    if vix_context:
        print(f"Added VIX context: {vix_context['level']}")

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
        "best_opportunities": build_best_opportunities(stocks),
        "outperformers": build_outperformers(stocks, index_context),
        "sector_heatmap": build_sector_heatmap(stocks),
        "crossover_alerts": build_crossover_alerts(stocks),
        "breadth_context": build_breadth_context(stocks, data_date),
    }

    if vix_context:
        output["vix_context"] = vix_context

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
    print(f"  Best Opportunities: {len(output['best_opportunities'])} stocks")
    print(f"  Outperformers: {len(output['outperformers'])} stocks beating SPY")
    print(f"  Sector Heatmap: {len(output['sector_heatmap'])} sectors")
    print(f"  Crossover Alerts: {len(output['crossover_alerts'])} alerts")
    bc = output["breadth_context"]
    print(f"  Breadth: 5D={bc['above_5d']}% | 20D={bc['above_20d']}% | 50D={bc['above_50d']}% | 200D={bc['above_200d']}%")


if __name__ == "__main__":
    main()
