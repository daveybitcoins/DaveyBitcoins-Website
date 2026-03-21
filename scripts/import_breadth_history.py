#!/usr/bin/env python3
"""
Import historical breadth data from TradingView CSV exports.

Export chart data from TradingView for each indicator:
  - S5FD (% above 5D MA)
  - S5TW (% above 20D MA)
  - S5FI (% above 50D MA)
  - S5TH (% above 200D MA)

Place the CSV files in csv/ folder, then run:
    python3 scripts/import_breadth_history.py

The script auto-detects which file maps to which indicator based on filename.
It merges with any existing breadth_history.csv data (computed values take
precedence over imported values for the same date).
"""

import csv
import os
import sys
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
CSV_DIR = os.path.join(PROJECT_DIR, "csv")
HISTORY_FILE = os.path.join(PROJECT_DIR, "data", "breadth_history.csv")

# Map TradingView symbol names to our field names
SYMBOL_MAP = {
    "S5FD": "above_5d",   # % above 5-day MA
    "S5TW": "above_20d",  # % above 20-day MA
    "S5FI": "above_50d",  # % above 50-day MA
    "S5TH": "above_200d", # % above 200-day MA
}


def find_breadth_csvs():
    """Find TradingView export CSVs for breadth indicators in csv/ folder."""
    found = {}
    for filename in os.listdir(CSV_DIR):
        if not filename.endswith(".csv"):
            continue
        upper = filename.upper()
        for symbol, field in SYMBOL_MAP.items():
            if symbol in upper:
                found[field] = os.path.join(CSV_DIR, filename)
                print(f"  Found {symbol} -> {filename} (maps to {field})")
    return found


def parse_tradingview_csv(filepath):
    """Parse a TradingView chart export CSV. Returns {date_str: close_value}."""
    data = {}
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        print(f"    Columns: {headers}")

        # TradingView exports use "time" or "Date" for the date column
        date_col = None
        for candidate in ["time", "Time", "date", "Date", "timestamp"]:
            if candidate in headers:
                date_col = candidate
                break

        # Close column
        close_col = None
        for candidate in ["close", "Close", "CLOSE"]:
            if candidate in headers:
                close_col = candidate
                break

        if not date_col or not close_col:
            print(f"    WARNING: Could not find date ({date_col}) or close ({close_col}) columns")
            return data

        for row in reader:
            try:
                raw_date = row[date_col].strip()

                # Try Unix timestamp first (TradingView exports seconds)
                try:
                    ts = float(raw_date)
                    if ts > 1e9:  # looks like a Unix timestamp
                        dt = datetime.utcfromtimestamp(ts)
                    else:
                        raise ValueError
                except ValueError:
                    # Try string date formats
                    dt = None
                    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"]:
                        try:
                            dt = datetime.strptime(raw_date[:19], fmt)
                            break
                        except ValueError:
                            continue
                    if dt is None:
                        continue

                date_str = dt.strftime("%Y-%m-%d")
                close_val = float(row[close_col])
                data[date_str] = round(close_val, 1)
            except (ValueError, KeyError):
                continue

    print(f"    Parsed {len(data)} data points ({min(data.keys()) if data else 'N/A'} to {max(data.keys()) if data else 'N/A'})")
    return data


def load_existing_history():
    """Load existing breadth_history.csv."""
    data = {}  # date -> {above_5d, above_20d, above_50d, above_200d}
    if not os.path.exists(HISTORY_FILE):
        return data

    with open(HISTORY_FILE, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            data[row["date"]] = {
                "above_5d": float(row.get("above_5d", 0) or 0),
                "above_20d": float(row.get("above_20d", 0) or 0),
                "above_50d": float(row.get("above_50d", 0) or 0),
                "above_200d": float(row.get("above_200d", 0) or 0),
            }

    return data


def main():
    print("Breadth History Importer")
    print("=" * 50)
    print(f"Looking for TradingView CSVs in: {CSV_DIR}")
    print(f"Target: {HISTORY_FILE}")
    print()

    # Find CSV files
    csvs = find_breadth_csvs()
    if not csvs:
        print("\nNo breadth CSV files found!")
        print("Export chart data from TradingView for S5FD, S5TW, S5FI, S5TH")
        print(f"and place the CSV files in: {CSV_DIR}")
        print("\nFilenames should contain the symbol (e.g., 'S5TH_daily.csv')")
        sys.exit(1)

    print(f"\nFound {len(csvs)} of 4 indicators")

    # Parse each CSV
    imported = {}  # field -> {date: value}
    for field, filepath in csvs.items():
        print(f"\n  Parsing {os.path.basename(filepath)}...")
        imported[field] = parse_tradingview_csv(filepath)

    # Load existing history
    existing = load_existing_history()
    print(f"\nExisting history: {len(existing)} dates")

    # Merge: imported data fills gaps, existing computed data takes precedence
    all_dates = set()
    for field_data in imported.values():
        all_dates.update(field_data.keys())
    all_dates.update(existing.keys())

    merged = {}
    for date in sorted(all_dates):
        row = existing.get(date, {"above_5d": 0, "above_20d": 0, "above_50d": 0, "above_200d": 0})

        # Fill in imported values where existing is 0 or missing
        for field, field_data in imported.items():
            if date in field_data:
                # Imported data fills in; existing computed data takes precedence
                if date not in existing or existing[date].get(field, 0) == 0:
                    row[field] = field_data[date]

        # Only keep rows where at least one field has data
        if any(row[f] > 0 for f in ["above_5d", "above_20d", "above_50d", "above_200d"]):
            merged[date] = row

    # Write merged history
    fieldnames = ["date", "above_5d", "above_20d", "above_50d", "above_200d"]
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for date in sorted(merged.keys()):
            writer.writerow({"date": date, **merged[date]})

    print(f"\nMerged history: {len(merged)} dates")
    if merged:
        dates = sorted(merged.keys())
        print(f"  Range: {dates[0]} to {dates[-1]}")

    print("\nDone! Run 'python3 scripts/process_ema.py' to update scanner_data.json")


if __name__ == "__main__":
    main()
