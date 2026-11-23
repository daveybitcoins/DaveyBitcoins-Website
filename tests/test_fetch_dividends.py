import unittest
from datetime import datetime, timedelta

from scripts.fetch_dividends import frequency_from_payment_dates, annualized_rate_from_payments, apply_instrument_status
from scripts import fetch_dividends
from unittest.mock import patch
import io, json


class FetchDividendsTests(unittest.TestCase):
    def test_closed_status_persists_without_deleting_historical_cash(self):
        data = {"ABNY": {"dividend_rate": 2000, "last_payments": [{"ex_date": "2026-06-18", "amount": 39.4274}]}}
        apply_instrument_status(data)
        self.assertEqual(data["ABNY"]["dividend_rate"], 0)
        self.assertEqual(data["ABNY"]["last_payments"][0]["amount"], 39.4274)
        self.assertEqual(data["ABNY"]["last_payments"][0]["distribution_type"], "liquidation")

    def test_special_payment_excluded_from_run_rate(self):
        payments = [{"ex_date": "2026-08-01", "amount": .5}, {"ex_date": "2026-09-01", "amount": 20, "distribution_type": "SC"}]
        self.assertEqual(annualized_rate_from_payments(payments, "monthly"), 6)

    def test_missing_provider_history_preserves_closed_fund_cash(self):
        previous = {"ABNY": {"last_payments": [{"ex_date": "2026-06-18", "pay_date": "2026-06-24", "amount": 39.4274, "distribution_type": "liquidation"}]}}
        current = {"ABNY": {"dividend_rate": 2000, "last_payments": []}}
        apply_instrument_status(current, previous)
        self.assertEqual(current["ABNY"]["last_payments"], previous["ABNY"]["last_payments"])
        self.assertIsNot(current["ABNY"]["last_payments"][0], previous["ABNY"]["last_payments"][0])
        self.assertEqual(current["ABNY"]["dividend_rate"], 0)

    def test_new_provider_history_takes_precedence_over_saved_closed_fund_history(self):
        previous = {"ABNY": {"last_payments": [{"ex_date": "2026-06-18", "amount": 39.4274}]}}
        current = {"ABNY": {"last_payments": [{"ex_date": "2026-06-18", "amount": 39.5}]}}
        apply_instrument_status(current, previous)
        self.assertEqual(current["ABNY"]["last_payments"][0]["amount"], 39.5)
        self.assertEqual(current["ABNY"]["last_payments"][0]["distribution_type"], "liquidation")

    def test_weekly_ttm_and_distinct_supplemental_events_are_not_truncated(self):
        rows = [{"id": str(i), "ticker": "ABC", "ex_dividend_date": (datetime.now() - timedelta(days=i * 7)).strftime("%Y-%m-%d"), "cash_amount": 1, "frequency": 52} for i in range(52)]
        rows += [dict(rows[0]), dict(rows[0], id="special", cash_amount=2, dividend_type="SC")]
        with patch.object(fetch_dividends, "MASSIVE_API_KEY", "test"), patch.object(fetch_dividends.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps({"results": rows}).encode())):
            _, rates, payments = fetch_dividends.fetch_massive_dividends(["ABC"])
        self.assertEqual(rates["ABC"], 52)
        self.assertEqual(len(payments["ABC"]), 53)

    def test_frequency_uses_payment_spacing_for_short_histories(self):
        start = datetime(2026, 1, 1)

        monthly = [start + timedelta(days=28 * index) for index in range(4)]
        weekly = [start + timedelta(days=7 * index) for index in range(4)]
        quarterly = [start + timedelta(days=91 * index) for index in range(4)]

        self.assertEqual(frequency_from_payment_dates(monthly), "monthly")
        self.assertEqual(frequency_from_payment_dates(weekly), "weekly")
        self.assertEqual(frequency_from_payment_dates(quarterly), "quarterly")

    def test_frequency_handles_one_or_no_payments(self):
        # One observation does not establish an annual cadence.
        self.assertIsNone(frequency_from_payment_dates([datetime(2026, 1, 1)]))
        self.assertIsNone(frequency_from_payment_dates([]))


if __name__ == "__main__":
    unittest.main()
