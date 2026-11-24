"""Briefings must identify the exact equity snapshot they describe."""

import io
import json
import tempfile
import unittest
from contextlib import ExitStack, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from scripts import generate_summary
from scripts.scanner_summary import summary_matches_snapshot


META = {"date": "2026-11-20", "generated_at": "2026-11-20T22:00:00+00:00"}


def briefing():
    return {
        "market_overview": {"bias": "mixed", "bias_label": "Mixed", "headline": "Test briefing", "detail": "Test data"},
        "reversal_candidates": {"items": []}, "pullback_setups": {"items": []},
        "risk_warnings": {"items": []}, "momentum_themes": {}, "sector_analysis": {},
    }


class SummaryFreshness(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.path = self.root / "scanner.json"
        self.stack.enter_context(patch.object(generate_summary, "DATA_FILE", str(self.path)))
        self.stack.enter_context(patch.object(generate_summary.sys, "argv", ["generate_summary.py"]))
        self.stack.enter_context(patch.dict(generate_summary.os.environ, {"OPENAI_API_KEY": "test"}))
        self.stack.enter_context(patch.object(generate_summary, "equity_fetch_session", return_value=META["date"]))
        self.stack.enter_context(patch.object(generate_summary, "fetch_market_news", return_value=[]))
        self.stack.enter_context(patch.object(generate_summary, "extract_prompt_data", return_value={}))
        self.stack.enter_context(patch.object(generate_summary, "build_user_prompt", return_value="test"))
        self.call = self.stack.enter_context(patch.object(generate_summary, "call_openai", return_value=briefing()))
        self.stack.enter_context(redirect_stdout(io.StringIO()))

    def save(self, summary=None):
        payload = {"meta": dict(META)}
        if summary is not None:
            payload["ai_summary"] = summary
        self.path.write_text(json.dumps(payload))

    def test_date_alone_cannot_prove_current_inputs(self):
        valid = {"source_date": META["date"], "source_generated_at": META["generated_at"]}
        self.assertTrue(summary_matches_snapshot(valid, META))
        for summary in (None, {}, {"generated_at": META["generated_at"]},
                        {**valid, "source_date": "2026-05-21"},
                        {**valid, "source_generated_at": "2026-11-20T21:00:00+00:00"}):
            self.assertFalse(summary_matches_snapshot(summary, META))
        self.assertFalse(summary_matches_snapshot(valid, {**META, "latest_completed_session": "2026-11-23"}))

    def test_generation_records_source_and_skips_duplicate(self):
        self.save()
        self.assertEqual(generate_summary.main(), 0)
        summary = json.loads(self.path.read_text())["ai_summary"]
        self.assertTrue(summary_matches_snapshot(summary, META))
        self.assertTrue(summary["generated_at"].endswith("+00:00"))
        self.assertEqual(generate_summary.main(), 0)
        self.call.assert_called_once()

    def test_missing_key_and_api_failure_do_not_leave_old_signal(self):
        for failure in ("missing_key", "api_error"):
            with self.subTest(failure=failure):
                self.save({**briefing(), "generated_at": "2026-05-21T22:26:13"})
                with patch.dict(generate_summary.os.environ, {"OPENAI_API_KEY": "" if failure == "missing_key" else "test"}), \
                        patch.object(generate_summary, "call_openai", side_effect=RuntimeError("unavailable")):
                    self.assertEqual(generate_summary.main(), 0)
                self.assertNotIn("ai_summary", json.loads(self.path.read_text()))

    def test_same_session_changed_inputs_require_new_summary(self):
        self.save({**briefing(), "source_date": META["date"], "source_generated_at": "2026-11-20T21:00:00+00:00"})
        self.assertEqual(generate_summary.main(), 0)
        self.call.assert_called_once()
        self.assertTrue(summary_matches_snapshot(json.loads(self.path.read_text())["ai_summary"], META))


if __name__ == "__main__":
    unittest.main()
