"""Refreshes must not manufacture equity sessions from the UTC calendar date."""

import copy
import csv
import io
import json
import tempfile
import unittest
from contextlib import ExitStack, redirect_stdout, redirect_stderr
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from scripts import fetch_ema, market_sessions, process_ema, generate_summary


def instant(value):
    return datetime.fromisoformat(value)


class MarketSessions(unittest.TestCase):
    def test_completed_session_and_fetch_window(self):
        cases = [
            # Saturday, Sunday evening in New York (already Monday UTC).
            ("2026-11-21T17:00:00+00:00", "2026-11-20", None),
            ("2026-11-23T01:23:00+00:00", "2026-11-20", None),
            ("2026-11-23T13:00:00+00:00", "2026-11-20", None),
            ("2026-11-23T20:59:59+00:00", "2026-11-20", None),
            ("2026-11-23T21:00:00+00:00", "2026-11-23", "2026-11-23"),
            # After UTC midnight, use the New York date; next morning, freeze.
            ("2026-11-24T01:00:00+00:00", "2026-11-23", "2026-11-23"),
            ("2026-11-24T15:00:00+00:00", "2026-11-23", None),
            # Daylight saving time, Good Friday, and Thanksgiving early close.
            ("2026-07-06T19:59:59+00:00", "2026-07-02", None),
            ("2026-07-06T20:00:00+00:00", "2026-07-06", "2026-07-06"),
            ("2026-04-03T22:00:00+00:00", "2026-04-02", None),
            ("2026-11-26T22:00:00+00:00", "2026-11-25", None),
            ("2026-11-27T17:59:59+00:00", "2026-11-25", None),
            ("2026-11-27T18:00:00+00:00", "2026-11-27", "2026-11-27"),
        ]
        for timestamp, completed, fetch_date in cases:
            with self.subTest(timestamp=timestamp):
                now = instant(timestamp)
                self.assertEqual(market_sessions.last_completed_session(now), completed)
                self.assertEqual(market_sessions.equity_fetch_session(now), fetch_date)

    def test_naive_time_is_rejected(self):
        with self.assertRaises(ValueError):
            market_sessions.last_completed_session(datetime(2026, 11, 23))


class FetchSessions(unittest.TestCase):
    def test_closed_and_intraday_runs_only_process_btc(self):
        for timestamp in ("2026-11-23T01:23:00+00:00", "2026-11-23T17:00:00+00:00"):
            with patch.object(fetch_ema, "fetch_data") as fetch, \
                    patch.object(fetch_ema, "run_process_ema", return_value=True) as process, redirect_stdout(io.StringIO()):
                self.assertEqual(fetch_ema.main(["--process"], now=instant(timestamp)), 0)
                fetch.assert_not_called()
                process.assert_called_once_with(btc_only=True)

    def test_after_close_uses_new_york_session_for_all_equity_files(self):
        with patch.object(fetch_ema, "fetch_data"), patch.object(fetch_ema, "fetch_index_data"), \
                patch.object(fetch_ema, "build_csv_rows", return_value=[{"Symbol": "TEST"}]), \
                patch.object(fetch_ema, "write_csv") as write, patch.object(fetch_ema, "fetch_vix_data") as vix, \
                patch.object(fetch_ema, "run_process_ema", return_value=True) as process, redirect_stdout(io.StringIO()):
            self.assertEqual(fetch_ema.main(["--process"], now=instant("2026-11-24T01:00:00+00:00")), 0)
            self.assertEqual([Path(call.args[1]).name for call in write.call_args_list],
                             ["Weekly EMA Values_2026-11-23.csv", "Index_ETFs_2026-11-23.csv"])
            vix.assert_called_once_with("2026-11-23")
            process.assert_called_once_with()

    def test_override_cannot_backdate_intraday_or_weekend_quotes(self):
        with patch.object(fetch_ema, "fetch_data") as fetch, redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                fetch_ema.main(["--date", "2026-11-20"], now=instant("2026-11-23T17:00:00+00:00"))
            fetch.assert_not_called()

    def test_processor_failure_propagates(self):
        with patch.object(fetch_ema, "run_process_ema", return_value=False), redirect_stdout(io.StringIO()):
            self.assertEqual(fetch_ema.main(["--process"], now=instant("2026-11-23T01:23:00+00:00")), 1)


class ProcessorSessions(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.output = self.root / "scanner.json"
        self.history = self.root / "history.csv"
        for name, value in (("CSV_DIR", str(self.root)), ("OUTPUT_FILE", str(self.output)),
                            ("BREADTH_HISTORY", str(self.history))):
            self.stack.enter_context(patch.object(process_ema, name, value))
        self.btc = {"symbol": "BTC", "signal": "Full Bear", "price": 90000, "as_of": "2026-11-23"}
        self.stack.enter_context(patch.object(process_ema, "build_btc_context", side_effect=lambda: dict(self.btc)))
        self.stack.enter_context(redirect_stdout(io.StringIO()))
        self.stock = {
            "Symbol": "TEST", "Description": "Test Stock", "Price": 40,
            "Market capitalization": 10000000000, "Sector": "Technology",
            "Exponential Moving Average (8) 1 week": 50,
            "Exponential Moving Average (13) 1 week": 60,
            "Exponential Moving Average (21) 1 week": 70,
            "SMA 5": 100, "SMA 20": 100, "SMA 50": 100, "SMA 200": 100,
        }
        self.write_snapshot("2026-11-20")
        with self.history.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["date", "above_5d", "above_20d", "above_50d", "above_200d"])
            writer.writeheader()
            for day in process_ema._exchange_sessions("2026-11-13", "2026-11-19"):
                writer.writerow({"date": day, **dict.fromkeys(writer.fieldnames[1:], 60)})

    def write_snapshot(self, day):
        for prefix, symbol in (("Weekly EMA Values", "TEST"), ("Index_ETFs", "SPY")):
            with (self.root / f"{prefix}_{day}.csv").open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(self.stock))
                writer.writeheader()
                writer.writerow({**self.stock, "Symbol": symbol})
        (self.root / f"VIX_{day}.json").write_text(json.dumps({"level": 20, "change": 1}))

    def test_btc_refresh_preserves_equity_payload_history_and_provenance(self):
        process_ema.main([], now=instant("2026-11-20T22:00:00+00:00"))
        original = json.loads(self.output.read_text())
        guidance = original["breadth_context"]["guidance"]
        self.assertEqual(guidance["consecutive_sessions"], 1)
        self.assertEqual(guidance["change_5_sessions"]["above_50d"], -60)
        saved_history = self.history.read_bytes()
        manifest = self.history.with_suffix(".provenance.json")
        saved_manifest = manifest.read_bytes()
        self.write_snapshot("2026-11-23")  # A stale legacy input must not advance the panel.
        for timestamp in ("2026-11-21T21:00:00+00:00", "2026-11-23T01:23:00+00:00", "2026-11-23T17:00:00+00:00"):
            self.btc["price"] += 100
            process_ema.main(["--btc-only"], now=instant(timestamp))
            updated = json.loads(self.output.read_text())
            self.assertEqual(updated["index_context"][-1]["price"], self.btc["price"])
            expected = copy.deepcopy(original)
            expected["index_context"][-1] = updated["index_context"][-1]
            self.assertEqual(updated, expected)
            self.assertEqual(self.history.read_bytes(), saved_history)
            self.assertEqual(manifest.read_bytes(), saved_manifest)
        process_ema.main([], now=instant("2026-11-23T22:00:00+00:00"))
        updated = json.loads(self.output.read_text())
        self.assertEqual(updated["meta"]["date"], "2026-11-23")
        self.assertEqual(updated["breadth_context"]["guidance"]["consecutive_sessions"], 2)

    def test_repairs_future_payload_and_ignores_closed_day_inputs(self):
        for day in ("2026-11-21", "2026-11-22", "2026-11-23"):
            self.write_snapshot(day)
        self.output.write_text(json.dumps({"meta": {"date": "2026-11-23"}}))
        process_ema.main(["--btc-only"], now=instant("2026-11-23T01:23:00+00:00"))
        updated = json.loads(self.output.read_text())
        self.assertEqual(updated["meta"]["date"], "2026-11-20")
        self.assertEqual(updated["breadth_context"]["guidance"]["as_of"], "2026-11-20")
        self.assertEqual(updated["breadth_context"]["guidance"]["consecutive_sessions"], 1)

    def test_index_and_vix_cannot_use_a_different_session(self):
        self.write_snapshot("2026-11-23")
        (self.root / "Index_ETFs_2026-11-20.csv").unlink()
        (self.root / "VIX_2026-11-20.json").unlink()
        self.assertEqual(process_ema.build_index_context("2026-11-20"), [])
        self.assertIsNone(process_ema.build_vix_context("2026-11-20"))

    def test_no_completed_snapshot_fails_without_relabeling(self):
        (self.root / "Weekly EMA Values_2026-11-20.csv").unlink()
        self.write_snapshot("2026-11-23")
        with self.assertRaises(FileNotFoundError):
            process_ema.main([], now=instant("2026-11-23T17:00:00+00:00"))
        self.assertFalse(self.output.exists())

    def test_history_append_rejects_unfinished_session(self):
        previous = self.history.read_bytes()
        process_ema._append_breadth_history("2026-11-23", {}, now=instant("2026-11-23T17:00:00+00:00"))
        self.assertEqual(self.history.read_bytes(), previous)


class SummarySessions(unittest.TestCase):
    def test_force_cannot_regenerate_equity_briefing_on_btc_only_run(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "scanner.json"
            path.write_text(json.dumps({"meta": {"date": "2026-11-20"}}))
            with patch.object(generate_summary, "DATA_FILE", str(path)), \
                    patch.dict(generate_summary.os.environ, {"OPENAI_API_KEY": "test"}), \
                    patch.object(generate_summary, "equity_fetch_session", return_value=None), \
                    patch.object(generate_summary, "call_openai") as call, \
                    patch.object(generate_summary.sys, "argv", ["generate_summary.py", "--force"]), redirect_stdout(io.StringIO()):
                self.assertEqual(generate_summary.main(), 0)
                call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
