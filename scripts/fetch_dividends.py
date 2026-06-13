#!/usr/bin/env python3
"""Fetch dividend data for the portfolio tracker.

Uses TradingView scanner API for bulk ticker data, then Yahoo Finance
(via yfinance) to auto-detect dividend payment frequency from history.

Output: data/dividend_data.json
"""

import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

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

MONTHLY_FALLBACK = {
    "JEPI", "JEPQ", "QQQI", "SPYI", "DIVO", "NUSI", "QYLD", "XYLD",
    "RYLD", "SDIV", "SPHD", "MAIN", "O", "STAG", "AGNC", "NLY",
    "PFLT", "PSEC", "OXLC", "PNNT", "GLAD", "TPVG", "ARCC", "HTGC",
    "HRZN", "OXSQ", "SLRC", "GBDC", "BXSL", "OBDC", "CSWC", "FDUS",
    "MFIC", "CCAP", "TRIN", "ADIT", "LTC", "EPR", "SLG", "LAND",
    "GOOD", "ADC", "BTCI", "KSLV", "MLPI", "KGLD",
    "QDVO", "GPIX", "ROCQ", "ROCY", "SGOV", "XBCI", "AIPI",
}

WEEKLY_FALLBACK = {
    # YieldMax weekly payer groups
    "CHPY", "ABNY", "DISO", "MSFO", "TSMY", "MSST",
    "FEAT", "AIYY", "DRAY", "MSTY", "WNTR", "NVIT",
    "FIVY", "AMDY", "FBY", "NFLY", "XOMO", "TEST",
    "GPTY", "AMZY", "FIAT", "NVDY", "XYZY",
    "LFGY", "APLY", "GDXY", "OARK", "YBIT",
    "MINY", "BABO", "GMEY", "PLTY", "YQQQ",
    "QDTY", "BRKC", "GOOY", "PYPY",
    "RDTY", "CONY", "HIYY", "RBLY",
    "SDTY", "CRCO", "HOOY", "RDYY",
    "SLTY", "CRSH", "JPO", "SMCY",
    "ULTY", "CVNY", "MARO", "SNOY",
    "YMAG", "DIPS", "MRNY", "TSLY", "YMAX",

    # Roundhill WeeklyPay and weekly income ETFs
    "AAPW", "AMDW", "AMZW", "ARMW", "AVGW", "BABW", "BRKW", "COIW",
    "COSW", "GDXW", "GLDW", "GOOW", "HOOW", "METW", "MSFW", "MSTW",
    "NFLW", "NVDW", "PLTW", "TOPW", "TSLW", "TSYW", "UBEW", "UNHW",
    "MAGY", "QDTE", "RDTE", "TPAY", "WEEK", "XDTE", "XPAY", "YBTC", "YETH",

    # REX weekly income funds
    "FEPI", "AIPI", "CEPI", "NVII", "TSII", "WMTI", "MSII", "COII",
    "HOII", "PLTI", "CWII", "LLII", "GIF", "ULTI",
}

FREQ_WORKERS = 20


def payments_per_year(frequency):
    return {
        "weekly": 52,
        "monthly": 12,
        "quarterly": 4,
        "semi-annual": 2,
        "annual": 1,
    }.get(frequency)


def current_frequency_payments(payments, frequency):
    if not payments:
        return []

    recent_payments = sorted(payments, key=lambda p: p.get("ex_date") or "")

    if frequency != "weekly":
        expected = payments_per_year(frequency)
        return recent_payments[-expected:] if expected else recent_payments

    weekly_run = [recent_payments[-1]]
    for payment in reversed(recent_payments[:-1]):
        try:
            prev = datetime.strptime(payment.get("ex_date"), "%Y-%m-%d")
            current = datetime.strptime(weekly_run[-1].get("ex_date"), "%Y-%m-%d")
        except Exception:
            break

        gap_days = (current - prev).days
        if gap_days < 4 or gap_days > 14:
            break
        weekly_run.append(payment)
        if len(weekly_run) >= 8:
            break

    if len(weekly_run) >= 2:
        return list(reversed(weekly_run))

    return recent_payments[-4:]


def annualized_rate_from_payments(payments, frequency):
    """Estimate forward annual rate for funds with incomplete payment history."""
    expected = payments_per_year(frequency)
    if not expected or not payments:
        return None

    amounts = [
        p.get("amount")
        for p in current_frequency_payments(payments, frequency)
        if p.get("amount") is not None and p.get("amount") > 0
    ]
    if not amounts:
        return None

    if len(amounts) >= expected:
        return round(sum(amounts), 4)

    return round((sum(amounts) / len(amounts)) * expected, 4)


def should_annualize_incomplete_history(payments, frequency):
    expected = payments_per_year(frequency)
    return bool(expected and payments and len(payments) < expected)


def _fetch_yahoo_data(symbol):
    """Fetch dividend history and current price from Yahoo Finance."""
    import yfinance as yf

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        price = round(info.last_price, 2) if hasattr(info, "last_price") and info.last_price else None

        divs = ticker.dividends
        freq = None
        payments = []
        trailing_rate = None
        if divs is not None and len(divs) > 0:
            cutoff = datetime.now() - timedelta(days=730)
            recent = divs[divs.index >= str(cutoff.date())]
            count = len(recent)

            if count >= 40:
                freq = "weekly"
            elif count >= 18:
                freq = "monthly"
            elif count >= 6:
                freq = "quarterly"
            elif count >= 3:
                freq = "semi-annual"
            elif count >= 1:
                freq = "annual"

            one_year_cutoff = datetime.now() - timedelta(days=365)
            last_year = divs[divs.index >= str(one_year_cutoff.date())]
            trailing_rate = round(float(last_year.sum()), 4) if len(last_year) > 0 else None
            payments = [
                {
                    "ex_date": idx.strftime("%Y-%m-%d"),
                    "amount": round(float(amount), 4),
                }
                for idx, amount in recent.tail(12).items()
            ]

        return symbol, freq, price, trailing_rate, payments
    except Exception:
        return symbol, None, None, None, []


def enrich_from_yahoo(symbols):
    """Fetch frequency and price data from Yahoo Finance for all symbols."""
    print(f"\nEnriching data via Yahoo Finance ({len(symbols)} tickers)...")
    frequencies = {}
    prices = {}
    rates = {}
    payments = {}
    done = 0

    with ThreadPoolExecutor(max_workers=FREQ_WORKERS) as pool:
        futures = {pool.submit(_fetch_yahoo_data, s): s for s in symbols}
        for future in as_completed(futures):
            symbol, freq, price, trailing_rate, last_payments = future.result()
            if freq:
                frequencies[symbol] = freq
            if price:
                prices[symbol] = price
            if trailing_rate:
                rates[symbol] = trailing_rate
            if last_payments:
                payments[symbol] = last_payments
            done += 1
            if done % 500 == 0:
                print(f"  {done}/{len(symbols)} checked...")

    weekly = sum(1 for f in frequencies.values() if f == "weekly")
    monthly = sum(1 for f in frequencies.values() if f == "monthly")
    quarterly = sum(1 for f in frequencies.values() if f == "quarterly")
    other = len(frequencies) - weekly - monthly - quarterly
    print(f"  Frequencies: {weekly} weekly, {monthly} monthly, {quarterly} quarterly, {other} other "
          f"({len(symbols) - len(frequencies)} unknown)")
    print(f"  Prices: {len(prices)} fetched from Yahoo")
    print(f"  Dividend payment histories: {len(payments)} fetched from Yahoo")
    return frequencies, prices, rates, payments

# Tickers TradingView often misses — merged into output as fallbacks.
# Values are periodically verified; the script prefers TradingView data
# when available.
FALLBACK_TICKERS = {
    "BTCI": {
        "name": "NEOS Bitcoin High Income ETF",
        "sector": "Digital Assets",
        "dividend_yield": 25.0,
        "dividend_rate": 9.58,
        "frequency": "monthly",
    },
    "SPYI": {
        "name": "NEOS S&P 500 High Income ETF",
        "sector": "Miscellaneous",
        "dividend_yield": 12.09,
        "dividend_rate": 6.23,
        "frequency": "monthly",
    },
    "KSLV": {
        "name": "Kurv Silver Enhanced Income ETF",
        "sector": "Miscellaneous",
        "dividend_yield": 27.35,
        "dividend_rate": 9.0,
        "frequency": "monthly",
    },
    "MLPI": {
        "name": "NEOS MLP & Energy Infrastructure High Income ETF",
        "sector": "Energy Minerals",
        "dividend_yield": 14.88,
        "dividend_rate": 8.17,
        "frequency": "monthly",
    },
    "KGLD": {
        "name": "Kurv Gold Enhanced Income ETF",
        "sector": "Miscellaneous",
        "dividend_yield": 10.36,
        "dividend_rate": 3.30,
        "frequency": "monthly",
    },
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

        frequency = None

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

    # Load existing data to preserve last_payments
    existing_data = {}
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE) as f:
                existing_data = json.load(f).get("tickers", {})
        except Exception:
            existing_data = {}

    df = fetch_tv_data()
    tickers = build_ticker_data(df)

    # Preserve last_payments from existing data
    for symbol, data in tickers.items():
        if symbol in existing_data and existing_data[symbol].get("last_payments"):
            data["last_payments"] = existing_data[symbol]["last_payments"]

    # Enrich with Yahoo Finance data (frequency, prices, rates, and payments)
    detected_freq, yahoo_prices, yahoo_rates, yahoo_payments = enrich_from_yahoo(list(tickers.keys()))
    price_backfills = 0
    payment_refreshes = 0
    rate_refreshes = 0
    for symbol, data in tickers.items():
        if symbol in WEEKLY_FALLBACK:
            data["frequency"] = "weekly"
        elif symbol in MONTHLY_FALLBACK:
            data["frequency"] = "monthly"
        elif symbol in detected_freq:
            data["frequency"] = detected_freq[symbol]
        else:
            data["frequency"] = "quarterly"

        if not data["close"] and symbol in yahoo_prices:
            data["close"] = yahoo_prices[symbol]
            if data["dividend_yield"] and not data["dividend_rate"]:
                data["dividend_rate"] = round(yahoo_prices[symbol] * data["dividend_yield"] / 100, 4)
            price_backfills += 1

        if symbol in yahoo_payments:
            data["last_payments"] = yahoo_payments[symbol]
            payment_refreshes += 1

        if symbol in yahoo_rates and yahoo_rates[symbol] > 0:
            data["dividend_rate"] = yahoo_rates[symbol]
            price = data["close"] or yahoo_prices.get(symbol)
            if price:
                data["dividend_yield"] = round((yahoo_rates[symbol] / price) * 100, 2)
            rate_refreshes += 1

        annualized_rate = annualized_rate_from_payments(data.get("last_payments", []), data.get("frequency"))
        if annualized_rate and should_annualize_incomplete_history(data.get("last_payments", []), data.get("frequency")):
            data["dividend_rate"] = annualized_rate
            price = data["close"] or yahoo_prices.get(symbol)
            if price:
                data["dividend_yield"] = round((annualized_rate / price) * 100, 2)

    if price_backfills:
        print(f"  Backfilled {price_backfills} missing prices from Yahoo Finance")
    if payment_refreshes:
        print(f"  Refreshed {payment_refreshes} dividend payment histories from Yahoo Finance")
    if rate_refreshes:
        print(f"  Refreshed {rate_refreshes} trailing dividend rates from Yahoo Finance")

    # Merge fallback data for tickers TradingView misses
    added_fallbacks = []
    for symbol, fb in FALLBACK_TICKERS.items():
        if symbol not in tickers:
            tickers[symbol] = {
                "name": fb["name"],
                "sector": fb.get("sector", ""),
                "close": None,
                "dividend_yield": fb.get("dividend_yield"),
                "dividend_rate": fb.get("dividend_rate"),
                "payout_ratio": None,
                "frequency": fb["frequency"],
                "ex_dividend_date": None,
                "last_payments": [],
            }
            added_fallbacks.append(symbol)

    for symbol in sorted(WEEKLY_FALLBACK):
        if symbol not in tickers:
            tickers[symbol] = {
                "name": symbol,
                "sector": "",
                "close": None,
                "dividend_yield": None,
                "dividend_rate": None,
                "payout_ratio": None,
                "frequency": "weekly",
                "ex_dividend_date": None,
                "last_payments": [],
            }
            added_fallbacks.append(symbol)

    if added_fallbacks:
        print(f"\n  Added {len(added_fallbacks)} fallback tickers: {', '.join(added_fallbacks)}")
        _, fb_prices, fb_rates, fb_payments = enrich_from_yahoo(added_fallbacks)
        for symbol in added_fallbacks:
            if symbol in fb_prices:
                tickers[symbol]["close"] = fb_prices[symbol]
                if tickers[symbol]["dividend_yield"] and not tickers[symbol]["dividend_rate"]:
                    tickers[symbol]["dividend_rate"] = round(
                        fb_prices[symbol] * tickers[symbol]["dividend_yield"] / 100, 4
                    )
            if symbol in fb_rates and fb_rates[symbol] > 0:
                tickers[symbol]["dividend_rate"] = fb_rates[symbol]
                price = tickers[symbol]["close"] or fb_prices.get(symbol)
                if price:
                    tickers[symbol]["dividend_yield"] = round((fb_rates[symbol] / price) * 100, 2)
            if symbol in fb_payments:
                tickers[symbol]["last_payments"] = fb_payments[symbol]
            annualized_rate = annualized_rate_from_payments(
                tickers[symbol].get("last_payments", []),
                tickers[symbol].get("frequency")
            )
            if annualized_rate and should_annualize_incomplete_history(
                tickers[symbol].get("last_payments", []),
                tickers[symbol].get("frequency")
            ):
                tickers[symbol]["dividend_rate"] = annualized_rate
                price = tickers[symbol]["close"] or fb_prices.get(symbol)
                if price:
                    tickers[symbol]["dividend_yield"] = round((annualized_rate / price) * 100, 2)

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
