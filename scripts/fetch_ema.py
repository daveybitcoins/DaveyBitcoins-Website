#!/usr/bin/env python3
"""
Automated Weekly EMA Data Fetcher
Pulls data from TradingView's scanner API and outputs a CSV
compatible with process_ema.py.

Replaces the manual TradingView screener CSV export.

Usage:
    python3 scripts/fetch_ema.py              # fetch only
    python3 scripts/fetch_ema.py --process    # fetch + run process_ema.py
"""

import argparse
import csv
import os
import subprocess
import sys
from datetime import datetime

try:
    from tradingview_screener import Query, col
except ImportError:
    print("Error: tradingview-screener not installed.")
    print("Run: pip3 install tradingview-screener")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
CSV_DIR = os.path.join(PROJECT_DIR, "csv")

# TradingView API fields → CSV column names expected by process_ema.py
API_FIELDS = [
    "name",                 # Symbol (ticker symbol like NVDA)
    "description",          # Company name
    "close",                # Price
    "change",               # Price Change % 1 day
    "volume",               # Volume 1 day
    "relative_volume",      # Relative Volume 1 day
    "market_cap_basic",     # Market capitalization
    "sector",               # Sector
    "recommendation_mark",  # Analyst consensus rating (1-5 scale)
    "EMA8|1W",              # Exponential Moving Average (8) 1 week
    "EMA13|1W",             # Exponential Moving Average (13) 1 week
    "EMA21|1W",             # Exponential Moving Average (21) 1 week
    "change_from_open|1W",  # Change from Open % 1 week
    "Perf.1M",              # Performance % 1 month
]

CSV_COLUMNS = [
    "Symbol",
    "Description",
    "Price",
    "Price - Currency",
    "Price Change % 1 day",
    "Volume 1 day",
    "Relative Volume 1 day",
    "Market capitalization",
    "Market capitalization - Currency",
    "Sector",
    "Analyst Rating",
    "Exponential Moving Average (8) 1 week",
    "Exponential Moving Average (13) 1 week",
    "Exponential Moving Average (21) 1 week",
    "Change from Open % 1 week",
    "Performance % 1 month",
]

# Batch size for API requests (API max is ~5000 per request)
BATCH_SIZE = 1000


def recommendation_to_text(value):
    """Convert TradingView's recommendation_mark (1-5 scale) to text rating.

    Scale: 1 = Strong buy, 2 = Buy, 3 = Neutral, 4 = Sell, 5 = Strong sell
    """
    if value is None or (isinstance(value, float) and value != value):
        return ""
    if value < 1.5:
        return "Strong buy"
    elif value < 2.5:
        return "Buy"
    elif value < 3.5:
        return "Neutral"
    elif value < 4.5:
        return "Sell"
    else:
        return "Strong sell"


def fetch_data():
    """Fetch stock data from TradingView scanner API."""
    print("Fetching data from TradingView scanner API...")

    count, df = (Query()
        .select(*API_FIELDS)
        .where(
            col("market_cap_basic") > 1_000_000_000,
            col("type") == "stock",
        )
        .order_by("market_cap_basic", ascending=False)
        .limit(BATCH_SIZE)
        .get_scanner_data()
    )

    print(f"  API returned {len(df)} stocks (of {count} matching)")
    return df


def build_csv_rows(df):
    """Convert API DataFrame to CSV rows matching TradingView export format."""
    rows = []
    skipped = 0

    for _, row in df.iterrows():
        # Extract symbol from ticker (e.g., "NASDAQ:NVDA" → "NVDA")
        ticker = row.get("ticker", "")
        symbol = ticker.split(":")[-1] if ":" in ticker else ticker

        # Skip rows missing EMA data
        ema8 = row.get("EMA8|1W")
        ema13 = row.get("EMA13|1W")
        ema21 = row.get("EMA21|1W")
        if any(v is None or (isinstance(v, float) and v != v) for v in [ema8, ema13, ema21]):
            skipped += 1
            continue

        csv_row = {
            "Symbol": symbol,
            "Description": row.get("description", ""),
            "Price": row.get("close", ""),
            "Price - Currency": "USD",
            "Price Change % 1 day": row.get("change", 0) or 0,
            "Volume 1 day": int(row.get("volume", 0) or 0),
            "Relative Volume 1 day": row.get("relative_volume", 0) or 0,
            "Market capitalization": row.get("market_cap_basic", 0) or 0,
            "Market capitalization - Currency": "USD",
            "Sector": (row.get("sector", "") or "").capitalize(),
            "Analyst Rating": recommendation_to_text(row.get("recommendation_mark")),
            "Exponential Moving Average (8) 1 week": ema8,
            "Exponential Moving Average (13) 1 week": ema13,
            "Exponential Moving Average (21) 1 week": ema21,
            "Change from Open % 1 week": row.get("change_from_open|1W", 0) or 0,
            "Performance % 1 month": row.get("Perf.1M", 0) or 0,
        }
        rows.append(csv_row)

    if skipped:
        print(f"  Skipped {skipped} stocks with missing EMA data")

    return rows


def write_csv(rows, filepath):
    """Write rows to CSV file."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Wrote {len(rows)} stocks to {os.path.basename(filepath)}")


INDEX_TICKERS = ["SPY", "QQQ"]


def fetch_index_data():
    """Fetch index ETF data (SPY, QQQ) from TradingView scanner API."""
    print("Fetching index ETF data (SPY, QQQ)...")

    count, df = (Query()
        .select(*API_FIELDS)
        .where(
            col("name").isin(INDEX_TICKERS),
        )
        .limit(10)
        .get_scanner_data()
    )

    print(f"  API returned {len(df)} index ETFs")
    return df


def run_process_ema():
    """Run process_ema.py to generate scanner_data.json."""
    script = os.path.join(SCRIPT_DIR, "process_ema.py")
    print(f"\nRunning process_ema.py...")
    result = subprocess.run(
        [sys.executable, script],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return False
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Weekly EMA data from TradingView scanner API"
    )
    parser.add_argument(
        "--process",
        action="store_true",
        help="Also run process_ema.py after fetching",
    )
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Override date in filename (YYYY-MM-DD). Default: today",
    )
    args = parser.parse_args()

    # Determine date for filename
    date_str = args.date or datetime.now().strftime("%Y-%m-%d")
    filename = f"Weekly EMA Values_{date_str}.csv"
    filepath = os.path.join(CSV_DIR, filename)

    print(f"Weekly EMA Fetcher — {date_str}")
    print("=" * 50)

    # Fetch from API
    df = fetch_data()

    # Convert to CSV format
    rows = build_csv_rows(df)
    print(f"  {len(rows)} stocks ready for export")

    # Write CSV
    write_csv(rows, filepath)

    # Fetch index ETFs (SPY, QQQ)
    index_df = fetch_index_data()
    index_rows = build_csv_rows(index_df)
    if index_rows:
        index_filename = f"Index_ETFs_{date_str}.csv"
        index_filepath = os.path.join(CSV_DIR, index_filename)
        write_csv(index_rows, index_filepath)

    # Optionally run the processor
    if args.process:
        run_process_ema()

    print("\nDone!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
