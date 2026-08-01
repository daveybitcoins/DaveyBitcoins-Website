import csv
import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from scripts import validate_data


class ValidateDataTests(unittest.TestCase):
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
                "dashboard": {},
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
                "dashboard": {},
                "full_scanner": rows,
                "sector_heatmap": [],
            }
            (root / "data" / "scanner_data.json").write_text(
                json.dumps(scanner), encoding="utf-8"
            )
            self.write_breadth_history(root, today - timedelta(days=1))

            with mock.patch.object(validate_data, "ROOT_DIR", str(root)):
                with self.assertRaisesRegex(ValueError, "scanner meta.date"):
                    validate_data.validate_scanner()

    def test_dividends_check_every_payment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            today = datetime.now(timezone.utc).date()
            required_symbols = ["AAPL", "T", "O", "SCHD", "JEPI"]
            symbols = required_symbols + [f"S{index}" for index in range(95)]
            tickers = {
                symbol: {
                    "name": f"Company {symbol}",
                    "dividend_yield": 2.5,
                    "dividend_rate": 1.0,
                    "frequency": "Quarterly",
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
        }

    @staticmethod
    def write_breadth_history(root, end_date):
        path = root / "data" / "breadth_history.csv"
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
            for offset in range(99, -1, -1):
                writer.writerow(
                    {
                        "date": (end_date - timedelta(days=offset)).isoformat(),
                        "above_5d": 50,
                        "above_20d": 50,
                        "above_50d": 50,
                        "above_200d": 50,
                    }
                )


if __name__ == "__main__":
    unittest.main()
