#!/usr/bin/env python3
"""Fetch dividend data for the portfolio tracker.

Phase 1: TradingView scanner API for the top 300 stocks by market cap
Phase 2: yfinance for dividend details (ex-dates, payment history, frequency)

Output: data/dividend_data.json
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
CSV_DIR = os.path.join(ROOT_DIR, "csv")
OUTPUT_FILE = os.path.join(DATA_DIR, "dividend_data.json")

TV_FIELDS = [
    "name",
    "close",
    "sector",
    "market_cap_basic",
    "dividend_yield_recent",
    "dividends_per_share_fq",
]


def fetch_tv_universe():
    """Fetch all US dividend-paying stocks and ETFs from TradingView."""
    from tradingview_screener import col, Query
    import pandas as pd

    dfs = []

    # Dividend-paying stocks (no market cap floor — include everything)
    print("Fetching dividend-paying stocks from TradingView...")
    count, stock_df = (
        Query()
        .select(*TV_FIELDS)
        .where(
            col("dividend_yield_recent") > 0,
            col("is_primary") == True,
            col("exchange").isin(["NYSE", "NASDAQ", "AMEX"]),
            col("type") == "stock",
        )
        .order_by("dividend_yield_recent", ascending=False)
        .limit(5000)
        .get_scanner_data()
    )
    print(f"  {len(stock_df)} dividend-paying stocks")
    dfs.append(stock_df)

    # ETFs and funds — fetch ALL, let yfinance filter to dividend payers
    print("Fetching ETFs/funds from TradingView...")
    try:
        etf_count, etf_df = (
            Query()
            .select(*TV_FIELDS)
            .where(
                col("exchange").isin(["NYSE", "NASDAQ", "AMEX"]),
                col("type") == "fund",
            )
            .order_by("volume", ascending=False)
            .limit(5000)
            .get_scanner_data()
        )
        print(f"  {len(etf_df)} ETFs/funds")
        dfs.append(etf_df)
    except Exception as e:
        print(f"  Warning: ETF fetch failed: {e}")

    df = pd.concat(dfs, ignore_index=True)
    df = df.drop_duplicates(subset=["name"], keep="first")
    print(f"  {len(df)} total unique tickers")
    return df


def _enrich_one(symbol, tv_data):
    """Fetch dividend details for a single ticker via yfinance."""
    import yfinance as yf

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}

        dividend_yield = info.get("dividendYield")
        dividend_rate = info.get("dividendRate")
        ex_date_epoch = info.get("exDividendDate")
        payout_ratio = info.get("payoutRatio")

        if dividend_yield:
            dividend_yield = round(dividend_yield, 2)

        ex_date_str = None
        if ex_date_epoch:
            ex_date_str = datetime.utcfromtimestamp(ex_date_epoch).strftime("%Y-%m-%d")

        divs = ticker.dividends
        last_payments = []
        frequency = None

        if divs is not None and len(divs) > 0:
            recent = divs.tail(8)
            for dt, amount in recent.items():
                last_payments.append({
                    "ex_date": dt.strftime("%Y-%m-%d"),
                    "amount": round(float(amount), 4),
                })

            if len(divs) >= 2:
                dates = divs.index.sort_values()
                gaps = [(dates[j] - dates[j - 1]).days for j in range(max(1, len(dates) - 4), len(dates))]
                if gaps:
                    avg_gap = sum(gaps) / len(gaps)
                    if avg_gap < 45:
                        frequency = "monthly"
                    elif avg_gap < 120:
                        frequency = "quarterly"
                    elif avg_gap < 220:
                        frequency = "semi-annual"
                    else:
                        frequency = "annual"

        if dividend_yield is None and tv_data.get("dividend_yield_recent"):
            dividend_yield = round(tv_data["dividend_yield_recent"], 2)

        # Compute dividend_rate from history if yfinance didn't provide it
        if dividend_rate is None and last_payments:
            avg_payment = sum(p["amount"] for p in last_payments) / len(last_payments)
            if frequency == "monthly":
                dividend_rate = round(avg_payment * 12, 4)
            elif frequency == "semi-annual":
                dividend_rate = round(avg_payment * 2, 4)
            elif frequency == "annual":
                dividend_rate = round(avg_payment, 4)
            else:
                dividend_rate = round(avg_payment * 4, 4)

        if dividend_rate is None and tv_data.get("dividends_per_share_fq"):
            dps_fq = tv_data["dividends_per_share_fq"]
            if frequency == "monthly":
                dividend_rate = round(dps_fq * 12, 4)
            elif frequency == "semi-annual":
                dividend_rate = round(dps_fq * 2, 4)
            elif frequency == "annual":
                dividend_rate = round(dps_fq, 4)
            else:
                dividend_rate = round(dps_fq * 4, 4)

        if not dividend_yield and not dividend_rate and not last_payments:
            return symbol, None

        return symbol, {
            "name": tv_data.get("name_full", symbol),
            "sector": tv_data.get("sector", ""),
            "dividend_yield": dividend_yield,
            "dividend_rate": round(dividend_rate, 4) if dividend_rate else None,
            "payout_ratio": round(payout_ratio, 2) if payout_ratio else None,
            "frequency": frequency,
            "ex_dividend_date": ex_date_str,
            "last_payments": last_payments[-4:],
        }

    except Exception as e:
        return symbol, None


def enrich_with_yfinance(tickers):
    """Fetch detailed dividend info from yfinance using thread pool."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = {}
    total = len(tickers)
    done = 0

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            pool.submit(_enrich_one, sym, tv): sym
            for sym, tv in tickers.items()
        }
        for future in as_completed(futures):
            done += 1
            if done % 200 == 0:
                print(f"  Progress: {done}/{total}")
            sym, data = future.result()
            if data is not None:
                results[sym] = data

    return results


def main():
    parser = argparse.ArgumentParser(description="Fetch dividend data for portfolio tracker")
    parser.add_argument("--limit", type=int, default=None, help="Limit yfinance lookups (for testing)")
    args = parser.parse_args()

    print(f"Dividend Data Fetcher — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    # Phase 1: TradingView universe
    df = fetch_tv_universe()

    # Build lookup dict
    tv_data = {}
    for _, row in df.iterrows():
        symbol = row.get("name", "")
        if not symbol:
            continue
        tv_data[symbol] = {
            "name_full": row.get("name", symbol),
            "sector": row.get("sector", ""),
            "dividend_yield_recent": row.get("dividend_yield_recent"),
            "dividends_per_share_fq": row.get("dividends_per_share_fq"),
        }

    # Phase 2: yfinance enrichment
    if args.limit:
        limited = dict(list(tv_data.items())[:args.limit])
        print(f"\nEnriching {len(limited)} tickers with yfinance (limited)...")
        tickers = enrich_with_yfinance(limited)
    else:
        print(f"\nEnriching {len(tv_data)} tickers with yfinance...")
        tickers = enrich_with_yfinance(tv_data)

    print(f"\n{len(tickers)} tickers have dividend data")

    # Write output
    os.makedirs(DATA_DIR, exist_ok=True)
    output = {
        "meta": {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "generated_at": datetime.utcnow().isoformat(),
            "total_tickers": len(tickers),
        },
        "tickers": tickers,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Wrote {OUTPUT_FILE}")
    print("Done!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
