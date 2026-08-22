import unittest
from datetime import datetime, timedelta

from scripts.fetch_dividends import frequency_from_payment_dates


class FetchDividendsTests(unittest.TestCase):
    def test_frequency_uses_payment_spacing_for_short_histories(self):
        start = datetime(2026, 1, 1)

        monthly = [start + timedelta(days=28 * index) for index in range(4)]
        weekly = [start + timedelta(days=7 * index) for index in range(4)]
        quarterly = [start + timedelta(days=91 * index) for index in range(4)]

        self.assertEqual(frequency_from_payment_dates(monthly), "monthly")
        self.assertEqual(frequency_from_payment_dates(weekly), "weekly")
        self.assertEqual(frequency_from_payment_dates(quarterly), "quarterly")

    def test_frequency_handles_one_or_no_payments(self):
        self.assertEqual(frequency_from_payment_dates([datetime(2026, 1, 1)]), "annual")
        self.assertIsNone(frequency_from_payment_dates([]))


if __name__ == "__main__":
    unittest.main()
