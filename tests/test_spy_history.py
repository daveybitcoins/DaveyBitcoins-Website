"""Completed-session boundaries and history output; no network required."""
import csv
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd
from scripts import rebuild_spy_history as history


class SpyHistoryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / 'data').mkdir()
        for target, name, value in [
            (history, 'ROOT', self.root),
            (history.validate_data, 'ROOT_DIR', str(self.root)),
        ]:
            patcher = patch.object(target, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.now = datetime.fromisoformat('2026-09-09T17:00:00-04:00')
        self.frame = pd.DataFrame(
            {'Close': 100.0, 'Adj Close': 50.0},
            index=pd.bdate_range('1993-01-29', '2026-09-09'))

    def seed_cache(self):
        history.write_history(self.frame, now=self.now)
        return {path: path.read_bytes() for path in [
            self.root / 'data_spy.csv', self.root / 'data/spy_history_metadata.json']}

    @patch.object(history.time, 'sleep')
    def test_retries_empty_and_invalid_downloads_then_publishes(self, sleep):
        invalid = self.frame.copy()
        invalid.iloc[-1, 0] = float('nan')
        download = Mock(side_effect=[pd.DataFrame(), invalid, self.frame])
        result = history.refresh_history(download, now=self.now)
        self.assertEqual(result['last_date'], '2026-09-09')
        self.assertEqual(download.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [10, 30])
        self.assertTrue((self.root / 'data_spy.csv').exists())

    @patch.object(history.time, 'sleep')
    def test_retries_provider_exceptions_and_preserves_fresh_cache(self, sleep):
        before = self.seed_cache()
        download = Mock(side_effect=RuntimeError('Too Many Requests'))
        result = history.refresh_history(download, now=self.now)
        self.assertEqual(result['last_date'], '2026-09-09')
        self.assertEqual(download.call_count, 3)
        for path, content in before.items():
            self.assertEqual(path.read_bytes(), content)

    @patch.object(history.time, 'sleep')
    def test_stale_download_and_cache_still_fail(self, sleep):
        before = self.seed_cache()
        download = Mock(return_value=self.frame)
        with self.assertRaisesRegex(ValueError, 'is stale'):
            history.refresh_history(
                download, now=datetime.fromisoformat('2026-09-16T17:00:00-04:00'))
        self.assertEqual(download.call_count, 3)
        for path, content in before.items():
            self.assertEqual(path.read_bytes(), content)

    @patch.object(history.time, 'sleep')
    def test_invalid_cache_still_fails(self, sleep):
        for replacement, message in [('nan', 'invalid price'), ('101.000000', 'does not match')]:
            with self.subTest(replacement=replacement):
                self.seed_cache()
                path = self.root / 'data_spy.csv'
                path.write_text(path.read_text().replace('100.000000', replacement, 1))
                with self.assertRaisesRegex((ValueError, RuntimeError), message):
                    history.refresh_history(Mock(return_value=pd.DataFrame()), now=self.now)

    @patch.object(history.time, 'sleep')
    def test_missing_cache_still_fails(self, sleep):
        with self.assertRaisesRegex(ValueError, 'is missing'):
            history.refresh_history(Mock(return_value=pd.DataFrame()), now=self.now)

    @patch.object(history.time, 'sleep')
    def test_local_write_errors_are_not_treated_as_provider_failures(self, sleep):
        download = Mock(return_value=self.frame)
        with patch.object(history, 'write_history', side_effect=OSError('disk full')):
            with self.assertRaisesRegex(OSError, 'disk full'):
                history.refresh_history(download, now=self.now)
        self.assertEqual(download.call_count, 1)
        sleep.assert_not_called()

    def test_session_boundaries(self):
        cases = [
            ('2026-09-09T11:00:00-04:00', '2026-09-08'),
            ('2026-09-09T15:59:59-04:00', '2026-09-08'),
            ('2026-09-09T16:00:00-04:00', '2026-09-09'),
            ('2026-09-09T17:00:00-04:00', '2026-09-09'),
            ('2026-09-12T17:00:00-04:00', '2026-09-11'),
            ('2026-09-07T17:00:00-04:00', '2026-09-04'),
            ('2026-11-27T12:59:59-05:00', '2026-11-25'),
            ('2026-11-27T13:00:00-05:00', '2026-11-27'),
            ('2026-12-09T20:59:59+00:00', '2026-12-08'),
            ('2026-12-09T21:00:00+00:00', '2026-12-09'),
        ]
        for timestamp, expected in cases:
            with self.subTest(timestamp=timestamp):
                self.assertEqual(str(history.latest_completed_session(
                    datetime.fromisoformat(timestamp))), expected)

    def test_history_includes_today_only_after_close(self):
        dates = pd.bdate_range('1993-01-29', '2026-09-10')
        frame = pd.DataFrame({'Close': 100.0, 'Adj Close': 50.0}, index=dates)
        for timestamp, expected in [
            ('2026-09-09T11:00:00-04:00', '2026-09-08'),
            ('2026-09-09T17:00:00-04:00', '2026-09-09'),
        ]:
            with self.subTest(timestamp=timestamp), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'data').mkdir()
                with patch.object(history, 'ROOT', root):
                    metadata = history.write_history(frame, now=datetime.fromisoformat(timestamp))
                with (root / 'data_spy.csv').open() as stream:
                    rows = list(csv.DictReader(stream))
                self.assertEqual(rows[-1]['date'], expected)
                self.assertEqual(metadata['last_date'], expected)
                self.assertEqual(float(rows[-1]['total_return_index']), 100.0)


if __name__ == '__main__':
    unittest.main()
