#!/usr/bin/env python3
"""Validate generated data files before automated commits."""

import argparse
import csv
import json
import math
import os
import re
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def fail(message):
    raise ValueError(message)


def load_json(path):
    with open(os.path.join(ROOT_DIR, path), "r", encoding="utf-8") as f:
        return json.load(f)


def is_number(value):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(n)


def validate_price_csv(path, min_rows):
    full_path = os.path.join(ROOT_DIR, path)
    if not os.path.exists(full_path):
        fail(f"{path} is missing")

    with open(full_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header != ["date", "price"]:
            fail(f"{path} header must be date,price")

        prev_date = None
        count = 0
        for line_no, row in enumerate(reader, start=2):
            if len(row) != 2:
                fail(f"{path}:{line_no} expected 2 columns")
            date, price = row
            if not DATE_RE.match(date):
                fail(f"{path}:{line_no} invalid date {date!r}")
            if prev_date and date <= prev_date:
                fail(f"{path}:{line_no} dates must be strictly increasing")
            if not is_number(price):
                fail(f"{path}:{line_no} invalid price {price!r}")
            prev_date = date
            count += 1

    if count < min_rows:
        fail(f"{path} has only {count} rows; expected at least {min_rows}")
    print(f"OK {path}: {count} rows through {prev_date}")


def validate_breadth_history():
    path = "data/breadth_history.csv"
    full_path = os.path.join(ROOT_DIR, path)
    if not os.path.exists(full_path):
        fail(f"{path} is missing")

    with open(full_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        expected = ["date", "above_5d", "above_20d", "above_50d", "above_200d"]
        if reader.fieldnames != expected:
            fail(f"{path} header must be {expected}")
        count = 0
        prev_date = None
        for line_no, row in enumerate(reader, start=2):
            date = row["date"]
            if not DATE_RE.match(date):
                fail(f"{path}:{line_no} invalid date {date!r}")
            if prev_date and date <= prev_date:
                fail(f"{path}:{line_no} dates must be strictly increasing")
            for key in expected[1:]:
                if not is_number(row[key]):
                    fail(f"{path}:{line_no} invalid {key} value {row[key]!r}")
            prev_date = date
            count += 1
    if count < 100:
        fail(f"{path} has only {count} rows")
    print(f"OK {path}: {count} rows through {prev_date}")


def require_keys(obj, keys, label):
    missing = [key for key in keys if key not in obj]
    if missing:
        fail(f"{label} missing keys: {', '.join(missing)}")


def validate_scanner():
    data = load_json("data/scanner_data.json")
    require_keys(data, ["meta", "dashboard", "full_scanner", "sector_heatmap"], "scanner_data.json")

    meta = data["meta"]
    require_keys(meta, ["date", "total_stocks"], "scanner meta")
    if not DATE_RE.match(meta["date"]):
        fail("scanner meta.date must be YYYY-MM-DD")
    if int(meta["total_stocks"]) < 100:
        fail("scanner meta.total_stocks looks too small")

    rows = data["full_scanner"]
    if not isinstance(rows, list) or len(rows) < 100:
        fail("full_scanner must contain at least 100 rows")
    required_row_keys = ["symbol", "name", "price", "sector", "signal", "ema8", "ema13", "ema21"]
    for idx, row in enumerate(rows[:25], start=1):
        require_keys(row, required_row_keys, f"full_scanner row {idx}")
        if not row["symbol"] or not row["name"]:
            fail(f"full_scanner row {idx} missing symbol/name")
        for key in ["price", "ema8", "ema13", "ema21"]:
            if not is_number(row[key]):
                fail(f"full_scanner row {idx} invalid {key}")

    if meta.get("total_stocks") and int(meta["total_stocks"]) != len(rows):
        fail("scanner meta.total_stocks does not match full_scanner length")

    for key in ["pullbacks", "momentum_leaders", "bear_list", "sector_heatmap", "crossover_alerts"]:
        if key in data and not isinstance(data[key], list):
            fail(f"{key} must be a list")

    if "ai_summary" in data and data["ai_summary"]:
        require_keys(data["ai_summary"], ["market_overview", "risk_warnings"], "ai_summary")

    validate_breadth_history()
    print(f"OK data/scanner_data.json: {len(rows)} scanner rows")


def validate_dividends():
    data = load_json("data/dividend_data.json")
    require_keys(data, ["meta", "tickers"], "dividend_data.json")
    meta = data["meta"]
    require_keys(meta, ["date", "total_tickers"], "dividend meta")
    if not DATE_RE.match(meta["date"]):
        fail("dividend meta.date must be YYYY-MM-DD")

    tickers = data["tickers"]
    if not isinstance(tickers, dict) or len(tickers) < 100:
        fail("dividend tickers must contain at least 100 symbols")
    if int(meta["total_tickers"]) != len(tickers):
        fail("dividend meta.total_tickers does not match ticker count")

    required = ["name", "dividend_yield", "dividend_rate", "frequency", "last_payments"]
    for symbol in ["AAPL", "T", "O", "SCHD", "JEPI"]:
        if symbol not in tickers:
            fail(f"expected dividend ticker {symbol} is missing")

    for idx, (symbol, row) in enumerate(tickers.items()):
        if idx >= 50:
            break
        require_keys(row, required, f"dividend ticker {symbol}")
        if not row["name"]:
            fail(f"dividend ticker {symbol} missing name")
        if row["dividend_yield"] is not None and not is_number(row["dividend_yield"]):
            fail(f"dividend ticker {symbol} invalid dividend_yield")
        if row["dividend_rate"] is not None and not is_number(row["dividend_rate"]):
            fail(f"dividend ticker {symbol} invalid dividend_rate")
        if not isinstance(row["last_payments"], list):
            fail(f"dividend ticker {symbol} last_payments must be a list")

    print(f"OK data/dividend_data.json: {len(tickers)} tickers")


def validate_prices():
    validate_price_csv("data.csv", 1000)
    validate_price_csv("data_spy.csv", 1000)
    validate_price_csv("data_qqq.csv", 1000)
    validate_price_csv("data_vix.csv", 1000)


def main():
    parser = argparse.ArgumentParser(description="Validate generated website data files")
    parser.add_argument("--prices", action="store_true", help="validate BTC/SPY/QQQ/VIX CSV files")
    parser.add_argument("--scanner", action="store_true", help="validate EMA scanner JSON and breadth CSV")
    parser.add_argument("--dividends", action="store_true", help="validate dividend tracker JSON")
    args = parser.parse_args()

    if not (args.prices or args.scanner or args.dividends):
        args.prices = args.scanner = args.dividends = True

    try:
        if args.prices:
            validate_prices()
        if args.scanner:
            validate_scanner()
        if args.dividends:
            validate_dividends()
    except Exception as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        return 1

    print("All requested data validations passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
