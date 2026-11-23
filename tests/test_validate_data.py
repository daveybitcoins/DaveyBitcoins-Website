import csv
import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from scripts import validate_data


class ValidateDataTests(unittest.TestCase):
    def test_spy_valuation_reconciles_forward_eps(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            payload = {
                "as_of": "2026-09-04",
                "source": "FactSet Earnings Insight",
                "source_url": "https://advantage.factset.com/report.pdf",
                "reported_forward_pe": 19.5,
                "reference_close_date": "2026-09-02",
                "reference_spx_close": 7666.6,
                "forward_12m_eps": 393.16,
                "actual_year": 2025,
                "actual_eps": 271.23,
                "current_year": 2026,
                "current_year_growth_pct": 31.5,
                "current_year_eps": 356.68,
                "next_year": 2027,
                "next_year_growth_pct": 15.0,
                "next_year_eps": 410.18,
            }
            (root / "data" / "spy_valuation.json").write_text(
                json.dumps(payload), encoding="utf-8"
            )
            with mock.patch.object(validate_data, "ROOT_DIR", str(root)):
                validate_data.validate_valuation(today=date(2026, 9, 7))
                payload["forward_12m_eps"] = 373.08
                (root / "data" / "spy_valuation.json").write_text(
                    json.dumps(payload), encoding="utf-8"
                )
                with self.assertRaisesRegex(ValueError, "does not reconcile"):
                    validate_data.validate_valuation(today=date(2026, 9, 7))

    def test_freshness_rejects_stale_and_future_dates(self):
        today = date(2026, 7, 31)

        validate_data.require_fresh_date("2026-07-27", "market data", 4, today)

        with self.assertRaisesRegex(ValueError, "is stale"):
            validate_data.require_fresh_date(
                "2026-07-26", "market data", 4, today
            )
        with self.assertRaisesRegex(ValueError, "in the future"):
            validate_data.require_fresh_date(
                "2026-08-01", "market data", 4, today
            )
        with self.assertRaisesRegex(ValueError, "invalid date"):
            validate_data.parse_date("2026-02-30", "market data")

    def test_scanner_checks_every_row(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            today = datetime.now(timezone.utc).date()
            rows = [self.scanner_row(index) for index in range(100)]
            rows[-1]["price"] = "not-a-number"
            scanner = {
                "meta": {"date": today.isoformat(), "total_stocks": len(rows)},
                "dashboard": self.scanner_dashboard(rows),
                "full_scanner": rows,
                "sector_heatmap": [],
            }
            (root / "data" / "scanner_data.json").write_text(
                json.dumps(scanner), encoding="utf-8"
            )
            self.write_breadth_history(root, today)

            with mock.patch.object(validate_data, "ROOT_DIR", str(root)):
                with self.assertRaisesRegex(ValueError, "row 100 invalid price"):
                    validate_data.validate_scanner()

    def test_scanner_requires_matching_breadth_date(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            today = datetime.now(timezone.utc).date()
            rows = [self.scanner_row(index) for index in range(100)]
            scanner = {
                "meta": {"date": today.isoformat(), "total_stocks": len(rows)},
                "dashboard": self.scanner_dashboard(rows),
                "full_scanner": rows,
                "sector_heatmap": [],
            }
            (root / "data" / "scanner_data.json").write_text(
                json.dumps(scanner), encoding="utf-8"
            )
            self.write_breadth_history(root, today - timedelta(days=7))

            with mock.patch.object(validate_data, "ROOT_DIR", str(root)):
                with self.assertRaisesRegex(ValueError, "scanner meta.date"):
                    validate_data.validate_scanner()

    def test_scanner_session_validation_handles_close_and_long_weekends(self):
        rows = [self.scanner_row(index) for index in range(100)]
        scanner = {
            "meta": {"date": "2026-11-23", "total_stocks": len(rows)},
            "dashboard": self.scanner_dashboard(rows),
            "full_scanner": rows,
            "sector_heatmap": [],
        }
        with mock.patch.object(validate_data, "load_json", return_value=scanner), \
                mock.patch.object(validate_data, "validate_breadth_history"):
            with self.assertRaisesRegex(ValueError, "completed NYSE session"):
                validate_data.validate_scanner(now=datetime.fromisoformat("2026-11-23T01:23:00+00:00"))
            validate_data.validate_scanner(now=datetime.fromisoformat("2026-11-23T21:01:00+00:00"))
            scanner["meta"]["date"] = "2026-11-22"
            with self.assertRaisesRegex(ValueError, "completed NYSE session"):
                validate_data.validate_scanner(now=datetime.fromisoformat("2026-11-23T21:01:00+00:00"))
            # Tuesday before the close after Labor Day: Friday is still current.
            scanner["meta"]["date"] = "2026-09-04"
            validate_data.validate_scanner(now=datetime.fromisoformat("2026-09-08T15:00:00+00:00"))
            scanner["breadth_context"] = {"guidance": {"as_of": "2026-09-08"}}
            with self.assertRaisesRegex(ValueError, "guidance must match"):
                validate_data.validate_scanner(now=datetime.fromisoformat("2026-09-08T15:00:00+00:00"))

    def test_dividends_check_every_payment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            today = datetime.now(timezone.utc).date()
            required_symbols = ["AAPL", "T", "O", "SCHD", "JEPI", "TDAQ", "IAUI"]
            symbols = required_symbols + [f"S{index}" for index in range(93)]
            tickers = {
                symbol: {
                    "name": f"Company {symbol}",
                    "dividend_yield": 2.5,
                    "dividend_rate": 1.0,
                    "frequency": "quarterly",
                    "last_payments": [
                        {"ex_date": today.isoformat(), "amount": 0.25}
                    ],
                }
                for symbol in symbols
            }
            tickers[symbols[-1]]["last_payments"][0]["amount"] = -1
            dividends = {
                "meta": {
                    "date": today.isoformat(),
                    "total_tickers": len(tickers),
                },
                "tickers": tickers,
            }
            (root / "data" / "dividend_data.json").write_text(
                json.dumps(dividends), encoding="utf-8"
            )

            with mock.patch.object(validate_data, "ROOT_DIR", str(root)):
                with self.assertRaisesRegex(ValueError, "invalid amount"):
                    validate_data.validate_dividends()

    def validate_dividend_fixture(self, target):
        today = datetime.now(timezone.utc).date().isoformat()
        symbols = ["AAPL", "T", "O", "SCHD", "JEPI", "TDAQ", "IAUI"] + [f"S{index}" for index in range(93)]
        tickers = {symbol: {"name": symbol, "dividend_yield": 1, "dividend_rate": 1, "frequency": "quarterly", "last_payments": [{"ex_date": today, "amount": .25}]} for symbol in symbols}
        tickers["AAPL"].update(target)
        payload = {"meta": {"date": today, "total_tickers": len(tickers)}, "tickers": tickers}
        with mock.patch.object(validate_data, "load_json", return_value=payload):
            validate_data.validate_dividends()

    def test_dividends_allow_distinct_same_date_events_and_reconcile_recurring_sum(self):
        today = datetime.now(timezone.utc).date().isoformat()
        self.validate_dividend_fixture({
            "annualization_method": "latest_payment", "dividend_rate": 3,
            "last_payments": [
                {"event_id": "regular", "ex_date": today, "amount": .5, "distribution_type": "CD"},
                {"event_id": "second_regular", "ex_date": today, "amount": .25, "distribution_type": "CD"},
                {"event_id": "supplemental", "ex_date": today, "amount": 2, "distribution_type": "SC"},
            ],
        })

    def test_dividends_reject_duplicate_events_with_and_without_provider_ids(self):
        for provider_id in [None, "same-provider-id"]:
            with self.subTest(provider_id=provider_id):
                payment = {"ex_date": datetime.now(timezone.utc).date().isoformat(), "amount": .25}
                if provider_id:
                    payment["event_id"] = provider_id
                with self.assertRaisesRegex(ValueError, "duplicates a distribution event"):
                    self.validate_dividend_fixture({"last_payments": [payment, dict(payment)]})

    def test_dividends_reject_positive_recurring_rate_for_liquidated_instrument(self):
        with self.assertRaisesRegex(ValueError, "liquidation cannot produce recurring income"):
            self.validate_dividend_fixture({"instrument_status": {"status": "liquidated"}, "dividend_rate": 100})
        # Historical liquidation cash remains valid with a zero recurring rate.
        self.validate_dividend_fixture({"instrument_status": {"status": "liquidated"}, "dividend_rate": 0,
            "last_payments": [{"ex_date": datetime.now(timezone.utc).date().isoformat(), "amount": 100, "distribution_type": "liquidation"}]})

    @staticmethod
    def scanner_row(index):
        return {
            "symbol": f"S{index}",
            "name": f"Stock {index}",
            "price": 100,
            "sector": "Technology",
            "signal": "Full Bull",
            "ema8": 99,
            "ema13": 98,
            "ema21": 97,
            "rank": index + 1,
            "price_vs_8w": 1.01,
            "price_vs_13w": 2.04,
            "price_vs_21w": 3.09,
            "ema8_vs_13": 1.02,
            "ema13_vs_21": 1.03,
            "spread_score": 2.05,
        }

    @staticmethod
    def scanner_dashboard(rows):
        return {
            "total": len(rows),
            "signals": [{"signal": "Full Bull", "count": len(rows), "pct": 1.0}],
        }

    @staticmethod
    def write_breadth_history(root, end_date):
        path = root / "data" / "breadth_top300_history.csv"
        fieldnames = [
            "date",
            "above_5d",
            "above_20d",
            "above_50d",
            "above_200d",
        ]
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            import exchange_calendars as xcals
            sessions = xcals.get_calendar("XNYS").sessions_in_range(end_date - timedelta(days=180), end_date)[-100:]
            for session in sessions:
                writer.writerow(
                    {
                        "date": session.strftime("%Y-%m-%d"),
                        "above_5d": 50,
                        "above_20d": 50,
                        "above_50d": 50,
                        "above_200d": 50,
                    }
                )


if __name__ == "__main__":
    unittest.main()
