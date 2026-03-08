#!/usr/bin/env python3
"""One-time seed script to download historical SPY and VIX data from Yahoo Finance."""

import os
import sys

try:
    import yfinance as yf
except ImportError:
    print("Error: yfinance not installed. Run: pip3 install yfinance")
    sys.exit(1)

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def download_and_save(ticker, filename):
    """Download max history for a ticker, save as date,price CSV."""
    filepath = os.path.join(PROJECT_DIR, filename)
    print(f"Downloading {ticker}...")
    data = yf.download(ticker, period="max", interval="1d", progress=False)

    if data.empty:
        print(f"  Error: No data returned for {ticker}")
        return

    with open(filepath, "w") as f:
        f.write("date,price\n")
        for date, row in data.iterrows():
            date_str = date.strftime("%Y-%m-%d")
            close = round(float(row["Close"]), 2)
            f.write(f"{date_str},{close}\n")

    print(f"  Wrote {len(data)} rows to {filename}")


if __name__ == "__main__":
    download_and_save("SPY", "data_spy.csv")
    download_and_save("^VIX", "data_vix.csv")
    print("Done!")
