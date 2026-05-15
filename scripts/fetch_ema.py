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
import json
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
    "Perf.YTD",             # Performance % Year-to-Date
    "SMA5",                 # Simple Moving Average (5 days)
    "SMA20",                # Simple Moving Average (20 days)
    "SMA50",                # Simple Moving Average (50 days)
    "SMA200",               # Simple Moving Average (200 days)
    "price_earnings_ttm",   # Trailing P/E ratio
    "earnings_per_share_forecast_next_fq",  # Next quarter EPS forecast
    "earnings_per_share_diluted_yoy_growth_ttm",  # EPS growth YoY (TTM) for PEG
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
    "Performance % YTD",
    "SMA 5",
    "SMA 20",
    "SMA 50",
    "SMA 200",
    "PE Ratio TTM",
    "EPS Forecast Next Qtr",
    "EPS Growth YoY TTM",
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

    try:
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
    except Exception as e:
        print(f"  TradingView API error: {e}")
        raise SystemExit(1)

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
            "Performance % YTD": row.get("Perf.YTD", 0) or 0,
            "SMA 5": row.get("SMA5", "") or "",
            "SMA 20": row.get("SMA20", "") or "",
            "SMA 50": row.get("SMA50", "") or "",
            "SMA 200": row.get("SMA200", "") or "",
            "PE Ratio TTM": row.get("price_earnings_ttm", "") or "",
            "EPS Forecast Next Qtr": row.get("earnings_per_share_forecast_next_fq", "") or "",
            "EPS Growth YoY TTM": row.get("earnings_per_share_diluted_yoy_growth_ttm", "") or "",
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
    """Fetch index ETF data (SPY, QQQ) from TradingView scanner API,
    falling back to yfinance if TradingView returns nothing."""
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

    if len(df) == 0:
        print("  TradingView returned 0 — falling back to yfinance...")
        df = _fetch_index_yfinance()

    return df


def _fetch_index_yfinance():
    """Fetch SPY/QQQ data from yfinance as a fallback.
    Calculates weekly EMAs from historical data to match TradingView format."""
    try:
        import yfinance as yf
        import pandas as pd

        rows = []
        for symbol in INDEX_TICKERS:
            tk = yf.Ticker(symbol)
            # Need ~6 months of weekly data to compute 21-week EMA
            hist = tk.history(period="6mo", interval="1wk")
            daily = tk.history(period="5d", interval="1d")
            if hist.empty or daily.empty:
                print(f"    {symbol}: no data from yfinance, skipping")
                continue

            # Current price and daily stats from the latest daily bar
            last_daily = daily.iloc[-1]
            prev_daily = daily.iloc[-2] if len(daily) >= 2 else last_daily
            price = float(last_daily["Close"])
            change_pct = ((price - float(prev_daily["Close"])) / float(prev_daily["Close"])) * 100
            volume = int(last_daily["Volume"])

            # Relative volume: today's volume vs 20-day average
            vol_hist = tk.history(period="1mo", interval="1d")
            if not vol_hist.empty and len(vol_hist) >= 5:
                avg_vol = float(vol_hist["Volume"].iloc[:-1].tail(20).mean())
                rel_vol = volume / avg_vol if avg_vol > 0 else 1.0
            else:
                rel_vol = 1.0

            # Weekly EMAs from weekly close data
            weekly_close = hist["Close"].astype(float)
            ema8 = float(weekly_close.ewm(span=8, adjust=False).mean().iloc[-1])
            ema13 = float(weekly_close.ewm(span=13, adjust=False).mean().iloc[-1])
            ema21 = float(weekly_close.ewm(span=21, adjust=False).mean().iloc[-1])

            # Weekly change from open
            last_week = hist.iloc[-1]
            week_open = float(last_week["Open"])
            chg_from_open_w = ((price - week_open) / week_open) * 100 if week_open else 0

            # Performance metrics from daily history
            daily_close = daily["Close"].astype(float)
            month_hist = tk.history(period="1mo", interval="1d")
            month_close = month_hist["Close"].astype(float) if not month_hist.empty else daily_close
            perf_1m = ((price - float(month_close.iloc[0])) / float(month_close.iloc[0])) * 100 if not month_close.empty else 0
            ytd_hist = tk.history(period="ytd", interval="1d")
            ytd_close = ytd_hist["Close"].astype(float) if not ytd_hist.empty else daily_close
            perf_ytd = ((price - float(ytd_close.iloc[0])) / float(ytd_close.iloc[0])) * 100 if not ytd_close.empty else 0

            # SMAs from daily data (use a longer fetch for SMA200)
            sma_hist = tk.history(period="1y", interval="1d")
            sma_close = sma_hist["Close"].astype(float) if not sma_hist.empty else daily_close
            sma5 = float(sma_close.tail(5).mean()) if len(sma_close) >= 5 else price
            sma20 = float(sma_close.tail(20).mean()) if len(sma_close) >= 20 else price
            sma50 = float(sma_close.tail(50).mean()) if len(sma_close) >= 50 else price
            sma200 = float(sma_close.tail(200).mean()) if len(sma_close) >= 200 else price

            info = tk.info or {}
            rows.append({
                "ticker": symbol,
                "name": symbol,
                "description": info.get("shortName", symbol),
                "close": price,
                "change": change_pct,
                "volume": volume,
                "relative_volume": rel_vol,
                "market_cap_basic": 0,
                "sector": "Miscellaneous",
                "recommendation_mark": None,
                "EMA8|1W": ema8,
                "EMA13|1W": ema13,
                "EMA21|1W": ema21,
                "change_from_open|1W": chg_from_open_w,
                "Perf.1M": perf_1m,
                "Perf.YTD": perf_ytd,
                "SMA5": sma5,
                "SMA20": sma20,
                "SMA50": sma50,
                "SMA200": sma200,
                "price_earnings_ttm": None,
                "earnings_per_share_forecast_next_fq": None,
                "earnings_per_share_diluted_yoy_growth_ttm": None,
            })
            print(f"    {symbol}: ${price:.2f} (8W: {ema8:.2f}, 13W: {ema13:.2f}, 21W: {ema21:.2f})")

        if rows:
            return pd.DataFrame(rows)
        return pd.DataFrame()

    except ImportError:
        print("    yfinance not installed, cannot fall back")
        return pd.DataFrame()
    except Exception as e:
        print(f"    yfinance fallback failed: {e}")
        return pd.DataFrame()


def fetch_vix_data(date_str):
    """Fetch current VIX level from Yahoo Finance via yfinance."""
    try:
        import yfinance as yf
        vix = yf.Ticker("^VIX")
        hist = vix.history(period="5d")
        if hist.empty:
            print("  Warning: No VIX data returned")
            return
        last_close = float(hist["Close"].iloc[-1])
        prev_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else last_close
        change_pct = ((last_close - prev_close) / prev_close) * 100 if prev_close else 0
        print(f"  VIX: {last_close:.2f} ({change_pct:+.2f}%)")
        vix_filepath = os.path.join(CSV_DIR, f"VIX_{date_str}.json")
        os.makedirs(CSV_DIR, exist_ok=True)
        with open(vix_filepath, "w") as f:
            json.dump({"level": round(last_close, 2), "change": round(change_pct, 2)}, f)
    except ImportError:
        print("  Warning: yfinance not installed, skipping VIX fetch")
    except Exception as e:
        print(f"  Warning: Failed to fetch VIX: {e}")


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

    # Fetch VIX data
    print("Fetching VIX data...")
    fetch_vix_data(date_str)

    # Optionally run the processor
    if args.process:
        run_process_ema()

    print("\nDone!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
