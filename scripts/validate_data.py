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
VALUATION_MAX_AGE_DAYS = 14


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


def validate_price_csv(path, min_rows, max_age_days, today=None):
    full_path = os.path.join(ROOT_DIR, path)
    if not os.path.exists(full_path):
        fail(f"{path} is missing")

    with open(full_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        expected_header = ["date", "price", "total_return_index"] if path == "data_spy.csv" else ["date", "price"]
        if header != expected_header:
            fail(f"{path} header must be {expected_header}")

        prev_date = None
        count = 0
        for line_no, row in enumerate(reader, start=2):
            if len(row) != len(expected_header):
                fail(f"{path}:{line_no} expected {len(expected_header)} columns")
            date_value, price = row[:2]
            if path == "data_spy.csv":
                if date_value < "1993-01-22":
                    fail(f"{path}:{line_no} contains pre-inception proxy prices")
                if not is_number(row[2]) or float(row[2]) <= 0:
                    fail(f"{path}:{line_no} invalid total_return_index")
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
    require_fresh_date(prev_date, f"{path} latest date", max_age_days, today)
    print(f"OK {path}: {count} rows through {prev_date}")


def validate_breadth_history(expected_date):
    path = "data/breadth_top300_history.csv"
    full_path = os.path.join(ROOT_DIR, path)
    if not os.path.exists(full_path):
        fail(f"{path} is missing")

    import exchange_calendars as xcals
    calendar = xcals.get_calendar("XNYS", start="2000-01-01", end=f"{int(expected_date[:4]) + 1}-12-31")
    expected_session = calendar.date_to_session(expected_date, direction="previous").strftime("%Y-%m-%d")
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
            if not calendar.is_session(date_value):
                fail(f"{path}:{line_no} is not an NYSE session")
            for key in expected[1:]:
                if row[key] == "":
                    continue  # Missing is distinct from a valid zero.
                if not is_number(row[key]) or not 0 <= float(row[key]) <= 100:
                    fail(f"{path}:{line_no} invalid {key} value {row[key]!r}")
            prev_date = date_value
            count += 1
    if count < 100:
        fail(f"{path} has only {count} rows")
    if prev_date != expected_session:
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
    allowed_signals = {
        "Full Bull", "Bullish (unstacked)", "Bull Pullback → 13W",
        "Bull Pullback → 21W", "Bull Breakdown", "Full Bear",
        "Bear Rally → 13W", "Bear Rally above 13W", "Bearish (unstacked)",
    }
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
        if row["signal"] not in allowed_signals:
            fail(f"full_scanner row {idx} invalid signal")
        expected_diffs = {
            "price_vs_8w": (float(row["price"]) / float(row["ema8"]) - 1) * 100,
            "price_vs_13w": (float(row["price"]) / float(row["ema13"]) - 1) * 100,
            "price_vs_21w": (float(row["price"]) / float(row["ema21"]) - 1) * 100,
            "ema8_vs_13": (float(row["ema8"]) / float(row["ema13"]) - 1) * 100,
            "ema13_vs_21": (float(row["ema13"]) / float(row["ema21"]) - 1) * 100,
        }
        for key, expected in expected_diffs.items():
            if not is_number(row.get(key)) or abs(float(row[key]) - expected) > 0.03:
                fail(f"full_scanner row {idx} {key} does not reconcile")
        expected_spread = float(row["ema8_vs_13"]) + float(row["ema13_vs_21"])
        if not is_number(row.get("spread_score")) or abs(float(row["spread_score"]) - expected_spread) > 0.02:
            fail(f"full_scanner row {idx} spread_score does not reconcile")
        if row.get("fwd_pe") is not None:
            if not is_number(row.get("next_fy_eps")) or float(row["next_fy_eps"]) <= 0:
                fail(f"full_scanner row {idx} forward P/E lacks next-FY EPS")
            expected_pe = float(row["price"]) / float(row["next_fy_eps"])
            if abs(float(row["fwd_pe"]) - expected_pe) > 0.11:
                fail(f"full_scanner row {idx} forward P/E does not reconcile")
        if row.get("peg") is not None:
            growth = row.get("eps_growth_yoy_ttm")
            if not is_number(growth) or float(growth) <= 0:
                fail(f"full_scanner row {idx} PEG lacks positive EPS growth")
            if abs(float(row["peg"]) - float(row["fwd_pe"]) / float(growth)) > 0.011:
                fail(f"full_scanner row {idx} PEG does not reconcile")

    if meta.get("total_stocks") and int(meta["total_stocks"]) != len(rows):
        fail("scanner meta.total_stocks does not match full_scanner length")
    ranks = [int(row.get("rank", 0)) for row in rows]
    if sorted(ranks) != list(range(1, len(rows) + 1)):
        fail("scanner ranks must be unique and consecutive")
    dashboard = data["dashboard"]
    if int(dashboard.get("total", 0)) != len(rows):
        fail("scanner dashboard total does not match rows")
    signal_counts = {signal: 0 for signal in allowed_signals}
    for row in rows:
        signal_counts[row["signal"]] += 1
    for item in dashboard.get("signals", []):
        if int(item["count"]) != signal_counts.get(item["signal"], -1):
            fail(f"scanner dashboard count is wrong for {item['signal']}")
        if abs(float(item["pct"]) - int(item["count"]) / len(rows)) > 0.0006:
            fail(f"scanner dashboard percentage is wrong for {item['signal']}")

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
    allowed_frequencies = {"weekly", "monthly", "quarterly", "semi-annual", "annual"}
    for symbol in ["AAPL", "T", "O", "SCHD", "JEPI", "TDAQ", "IAUI"]:
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
        if row["frequency"] not in allowed_frequencies:
            fail(f"dividend ticker {symbol} invalid frequency")
        if row.get("instrument_status", {}).get("status") == "liquidated" and row["dividend_rate"] != 0:
            fail(f"dividend ticker {symbol} liquidation cannot produce recurring income")
        previous_payment_date = None
        payment_keys = set()
        for index, payment in enumerate(row["last_payments"], start=1):
            label = f"dividend ticker {symbol} payment {index}"
            if not isinstance(payment, dict):
                fail(f"{label} must be an object")
            require_keys(payment, ["ex_date", "amount"], label)
            parse_date(payment["ex_date"], f"{label} ex_date")
            if not is_number(payment["amount"]) or float(payment["amount"]) <= 0:
                fail(f"{label} invalid amount {payment['amount']!r}")
            for date_key in ["pay_date", "record_date"]:
                if payment.get(date_key):
                    parse_date(payment[date_key], f"{label} {date_key}")
            payment_key = payment.get("event_id") or (payment["ex_date"], payment.get("pay_date"), float(payment["amount"]), payment.get("distribution_type"))
            if payment_key in payment_keys:
                fail(f"{label} duplicates a distribution event")
            payment_keys.add(payment_key)
            if previous_payment_date and payment["ex_date"] < previous_payment_date:
                fail(f"{label} dates must be nondecreasing")
            previous_payment_date = payment["ex_date"]
        if row.get("close") and row["dividend_rate"] is not None:
            expected_yield = float(row["dividend_rate"]) / float(row["close"]) * 100
            if not is_number(row["dividend_yield"]) or abs(float(row["dividend_yield"]) - expected_yield) > 0.011:
                fail(f"dividend ticker {symbol} yield does not reconcile")
        recurring = [p for p in row["last_payments"] if p.get("distribution_type") not in {"SC", "LT", "ST", "special", "supplemental", "liquidation", "redemption", "capital_gain"}]
        if row.get("annualization_method") == "latest_payment" and recurring:
            payments_per_year = {
                "weekly": 52, "monthly": 12, "quarterly": 4,
                "semi-annual": 2, "annual": 1,
            }[row["frequency"]]
            expected_rate = sum(float(p["amount"]) for p in recurring if p["ex_date"] == recurring[-1]["ex_date"]) * payments_per_year
            if abs(float(row["dividend_rate"]) - expected_rate) > 0.011:
                fail(f"dividend ticker {symbol} latest-payment annual rate does not reconcile")

    print(f"OK data/dividend_data.json: {len(tickers)} tickers")


def validate_valuation(today=None):
    data = load_json("data/spy_valuation.json")
    require_keys(
        data,
        ["as_of", "source", "source_url", "reported_forward_pe",
         "reference_close_date", "reference_spx_close", "forward_12m_eps",
         "actual_year", "actual_eps", "current_year", "current_year_growth_pct",
         "current_year_eps", "next_year", "next_year_growth_pct", "next_year_eps"],
        "spy valuation",
    )
    require_fresh_date(
        data["as_of"], "spy valuation as_of", VALUATION_MAX_AGE_DAYS, today
    )
    if data["source"] != "FactSet Earnings Insight":
        fail("spy valuation source must be FactSet Earnings Insight")
    if not str(data["source_url"]).startswith("https://advantage.factset.com/"):
        fail("spy valuation source_url must be a FactSet URL")
    for key, low, high in (
        ("reported_forward_pe", 10, 40),
        ("reference_spx_close", 1000, 20000),
        ("forward_12m_eps", 50, 1000),
    ):
        if not is_number(data[key]) or not low <= float(data[key]) <= high:
            fail(f"spy valuation has invalid {key}")
    implied_pe = float(data["reference_spx_close"]) / float(data["forward_12m_eps"])
    if abs(implied_pe - float(data["reported_forward_pe"])) > 0.05:
        fail("spy valuation forward EPS does not reconcile to the reported P/E")
    if int(data["current_year"]) != int(data["actual_year"]) + 1:
        fail("spy valuation current_year must follow actual_year")
    if int(data["next_year"]) != int(data["current_year"]) + 1:
        fail("spy valuation next_year must follow current_year")
    expected_current_eps = float(data["actual_eps"]) * (1 + float(data["current_year_growth_pct"]) / 100)
    expected_next_eps = float(data["current_year_eps"]) * (1 + float(data["next_year_growth_pct"]) / 100)
    if abs(expected_current_eps - float(data["current_year_eps"])) > 0.02:
        fail("spy valuation current-year EPS does not reconcile to growth")
    if abs(expected_next_eps - float(data["next_year_eps"])) > 0.02:
        fail("spy valuation next-year EPS does not reconcile to growth")
    print(f"OK data/spy_valuation.json through {data['as_of']}")


def validate_prices():
    for path, max_age_days in PRICE_MAX_AGE_DAYS.items():
        validate_price_csv(path, 1000, max_age_days)


def main():
    parser = argparse.ArgumentParser(description="Validate generated website data files")
    parser.add_argument("--prices", action="store_true", help="validate BTC/SPY/QQQ/VIX CSV files")
    parser.add_argument("--scanner", action="store_true", help="validate EMA scanner JSON and breadth CSV")
    parser.add_argument("--dividends", action="store_true", help="validate dividend tracker JSON")
    parser.add_argument("--valuation", action="store_true", help="validate SPY valuation JSON")
    args = parser.parse_args()

    if not (args.prices or args.scanner or args.dividends or args.valuation):
        args.prices = args.scanner = args.dividends = args.valuation = True

    try:
        if args.prices:
            validate_prices()
        if args.scanner:
            validate_scanner()
        if args.dividends:
            validate_dividends()
        if args.valuation:
            validate_valuation()
    except Exception as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        return 1

    print("All requested data validations passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
