#!/usr/bin/env python3
"""Fetch dividend data for the portfolio tracker.

Uses TradingView scanner API exclusively — single bulk request per asset type,
no per-ticker API calls, no rate limiting issues.

Output: data/dividend_data.json
"""

import json
import math
import os
import sys
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "dividend_data.json")

TV_FIELDS = [
    "name",
    "description",
    "close",
    "sector",
    "market_cap_basic",
    "dividend_yield_recent",
    "dividends_per_share_fq",
    "dividend_payout_ratio_ttm",
    "dps_common_stock_prim_issue_fy",
]

MONTHLY_ETFS = {
    "JEPI", "JEPQ", "QQQI", "SPYI", "DIVO", "NUSI", "QYLD", "XYLD",
    "RYLD", "SDIV", "SPHD", "MAIN", "O", "STAG", "AGNC", "NLY",
    "PFLT", "PSEC", "OXLC", "PNNT", "GLAD", "TPVG", "ARCC", "HTGC",
    "HRZN", "OXSQ", "SLRC", "GBDC", "BXSL", "OBDC", "CSWC", "FDUS",
    "MFIC", "CCAP", "TRIN", "ADIT", "LTC", "EPR", "SLG", "LAND",
    "GOOD", "ADC",
}


def fetch_tv_data():
    """Fetch all US dividend-paying stocks and ETFs from TradingView."""
    from tradingview_screener import col, Query
    import pandas as pd

    dfs = []

    print("Fetching dividend-paying stocks from TradingView...")
    _, stock_df = (
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

    print("Fetching dividend-paying ETFs/funds from TradingView...")
    try:
        _, etf_df = (
            Query()
            .select(*TV_FIELDS)
            .where(
                col("dividend_yield_recent") > 0,
                col("exchange").isin(["NYSE", "NASDAQ", "AMEX"]),
                col("type") == "fund",
            )
            .order_by("dividend_yield_recent", ascending=False)
            .limit(5000)
            .get_scanner_data()
        )
        print(f"  {len(etf_df)} dividend-paying ETFs/funds")
        dfs.append(etf_df)
    except Exception as e:
        print(f"  Warning: ETF fetch failed: {e}")

    df = pd.concat(dfs, ignore_index=True)
    df = df.drop_duplicates(subset=["name"], keep="first")
    print(f"  {len(df)} total unique tickers")
    return df


def build_ticker_data(df):
    """Convert TradingView dataframe to dividend_data.json format."""
    tickers = {}

    for _, row in df.iterrows():
        symbol = row.get("name", "")
        if not symbol:
            continue

        price = row.get("close")
        yld = row.get("dividend_yield_recent")
        dps_fq = row.get("dividends_per_share_fq")
        dps_fy = row.get("dps_common_stock_prim_issue_fy")
        payout = row.get("dividend_payout_ratio_ttm")
        desc = row.get("description", symbol)

        if not yld or (isinstance(yld, float) and math.isnan(yld)):
            continue

        dividend_yield = round(yld, 2)

        # Compute annual dividend rate
        dividend_rate = None
        if dps_fy and not (isinstance(dps_fy, float) and math.isnan(dps_fy)):
            dividend_rate = round(abs(dps_fy), 4)
        elif dps_fq and not (isinstance(dps_fq, float) and math.isnan(dps_fq)):
            dividend_rate = round(dps_fq * 4, 4)
        elif price and dividend_yield:
            dividend_rate = round(price * dividend_yield / 100, 4)

        # Estimate frequency
        if symbol in MONTHLY_ETFS:
            frequency = "monthly"
        elif dps_fq and not (isinstance(dps_fq, float) and math.isnan(dps_fq)):
            frequency = "quarterly"
        else:
            frequency = "quarterly"

        payout_ratio = None
        if payout and not (isinstance(payout, float) and math.isnan(payout)):
            payout_ratio = round(payout, 2)

        close_price = None
        if price and not (isinstance(price, float) and math.isnan(price)):
            close_price = round(price, 2)

        tickers[symbol] = {
            "name": desc,
            "sector": row.get("sector", ""),
            "close": close_price,
            "dividend_yield": dividend_yield,
            "dividend_rate": dividend_rate,
            "payout_ratio": payout_ratio,
            "frequency": frequency,
            "ex_dividend_date": None,
            "last_payments": [],
        }

    return tickers


def main():
    print(f"Dividend Data Fetcher — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    df = fetch_tv_data()
    tickers = build_ticker_data(df)

    print(f"\n{len(tickers)} tickers with dividend data")

    for check in ["QQQI", "SCHD", "JEPI", "O", "SPY", "AAPL", "T"]:
        status = "FOUND" if check in tickers else "MISSING"
        print(f"  {check}: {status}")

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
