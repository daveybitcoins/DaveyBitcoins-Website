#!/usr/bin/env python3
"""Validate generated data files before automated commits."""

import argparse
import csv
import json
import math
import os
import sys
from datetime import date, datetime, timezone

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRICE_MAX_AGE_DAYS = {
    "data.csv": 2,
    "data_spy.csv": 4,
    "data_qqq.csv": 4,
    "data_vix.csv": 4,
}
SCANNER_MAX_AGE_DAYS = 3
DIVIDEND_MAX_AGE_DAYS = 10


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


def parse_date(value, label):
    if not isinstance(value, str):
        fail(f"{label} must be a YYYY-MM-DD string")
    try:
        return date.fromisoformat(value)
    except ValueError:
        fail(f"{label} has invalid date {value!r}")


def require_fresh_date(value, label, max_age_days, today=None):
    parsed = parse_date(value, label)
    current_date = today or datetime.now(timezone.utc).date()
    age_days = (current_date - parsed).days
    if age_days < 0:
        fail(f"{label} is {abs(age_days)} day(s) in the future")
    if age_days > max_age_days:
        fail(
            f"{label} is stale: {age_days} days old; "
            f"maximum allowed is {max_age_days}"
        )
    return parsed


def validate_price_csv(path, min_rows, max_age_days):
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
            date_value, price = row
            parse_date(date_value, f"{path}:{line_no}")
            if prev_date and date_value <= prev_date:
                fail(f"{path}:{line_no} dates must be strictly increasing")
            numeric_price = float(price) if is_number(price) else None
            if (
                numeric_price is None
                or numeric_price < 0
                or (numeric_price == 0 and path != "data.csv")
            ):
                fail(f"{path}:{line_no} invalid price {price!r}")
            prev_date = date_value
            count += 1

    if count < min_rows:
        fail(f"{path} has only {count} rows; expected at least {min_rows}")
    require_fresh_date(prev_date, f"{path} latest date", max_age_days)
    print(f"OK {path}: {count} rows through {prev_date}")


def validate_breadth_history(expected_date):
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
            date_value = row["date"]
            parse_date(date_value, f"{path}:{line_no}")
            if prev_date and date_value <= prev_date:
                fail(f"{path}:{line_no} dates must be strictly increasing")
            for key in expected[1:]:
                if not is_number(row[key]) or not 0 <= float(row[key]) <= 100:
                    fail(f"{path}:{line_no} invalid {key} value {row[key]!r}")
            prev_date = date_value
            count += 1
    if count < 100:
        fail(f"{path} has only {count} rows")
    if prev_date != expected_date:
        fail(
            f"{path} ends on {prev_date}, but scanner meta.date is {expected_date}"
        )
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
    require_fresh_date(
        meta["date"], "scanner meta.date", SCANNER_MAX_AGE_DAYS
    )
    if int(meta["total_stocks"]) < 100:
        fail("scanner meta.total_stocks looks too small")

    rows = data["full_scanner"]
    if not isinstance(rows, list) or len(rows) < 100:
        fail("full_scanner must contain at least 100 rows")
    required_row_keys = ["symbol", "name", "price", "sector", "signal", "ema8", "ema13", "ema21"]
    symbols = set()
    for idx, row in enumerate(rows, start=1):
        require_keys(row, required_row_keys, f"full_scanner row {idx}")
        if not row["symbol"] or not row["name"]:
            fail(f"full_scanner row {idx} missing symbol/name")
        if row["symbol"] in symbols:
            fail(f"full_scanner row {idx} duplicates symbol {row['symbol']}")
        symbols.add(row["symbol"])
        for key in ["price", "ema8", "ema13", "ema21"]:
            if not is_number(row[key]) or float(row[key]) <= 0:
                fail(f"full_scanner row {idx} invalid {key}")

    if meta.get("total_stocks") and int(meta["total_stocks"]) != len(rows):
        fail("scanner meta.total_stocks does not match full_scanner length")

    for key in ["pullbacks", "momentum_leaders", "bear_list", "sector_heatmap", "crossover_alerts"]:
        if key in data and not isinstance(data[key], list):
            fail(f"{key} must be a list")

    if "ai_summary" in data and data["ai_summary"]:
        require_keys(data["ai_summary"], ["market_overview", "risk_warnings"], "ai_summary")

    validate_breadth_history(meta["date"])
    print(f"OK data/scanner_data.json: {len(rows)} scanner rows")


def validate_dividends():
    data = load_json("data/dividend_data.json")
    require_keys(data, ["meta", "tickers"], "dividend_data.json")
    meta = data["meta"]
    require_keys(meta, ["date", "total_tickers"], "dividend meta")
    require_fresh_date(
        meta["date"], "dividend meta.date", DIVIDEND_MAX_AGE_DAYS
    )

    tickers = data["tickers"]
    if not isinstance(tickers, dict) or len(tickers) < 100:
        fail("dividend tickers must contain at least 100 symbols")
    if int(meta["total_tickers"]) != len(tickers):
        fail("dividend meta.total_tickers does not match ticker count")

    required = ["name", "dividend_yield", "dividend_rate", "frequency", "last_payments"]
    for symbol in ["AAPL", "T", "O", "SCHD", "JEPI"]:
        if symbol not in tickers:
            fail(f"expected dividend ticker {symbol} is missing")

    for symbol, row in tickers.items():
        require_keys(row, required, f"dividend ticker {symbol}")
        if not symbol or not row["name"]:
            fail(f"dividend ticker {symbol} missing name")
        if row["dividend_yield"] is not None and (
            not is_number(row["dividend_yield"])
            or float(row["dividend_yield"]) < 0
        ):
            fail(f"dividend ticker {symbol} invalid dividend_yield")
        if row["dividend_rate"] is not None and (
            not is_number(row["dividend_rate"])
            or float(row["dividend_rate"]) < 0
        ):
            fail(f"dividend ticker {symbol} invalid dividend_rate")
        if not isinstance(row["last_payments"], list):
            fail(f"dividend ticker {symbol} last_payments must be a list")
        for index, payment in enumerate(row["last_payments"], start=1):
            label = f"dividend ticker {symbol} payment {index}"
            if not isinstance(payment, dict):
                fail(f"{label} must be an object")
            require_keys(payment, ["ex_date", "amount"], label)
            parse_date(payment["ex_date"], f"{label} ex_date")
            if not is_number(payment["amount"]) or float(payment["amount"]) <= 0:
                fail(f"{label} invalid amount {payment['amount']!r}")

    print(f"OK data/dividend_data.json: {len(tickers)} tickers")


def validate_prices():
    for path, max_age_days in PRICE_MAX_AGE_DAYS.items():
        validate_price_csv(path, 1000, max_age_days)


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
