"""Exercise the real BTC shell step with GitHub's fail-fast shell settings."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PriceWorkflowTests(unittest.TestCase):
    def run_history_step(self, exit_code=0, payload=''):
        workflow = (ROOT / '.github/workflows/update-csv.yml').read_text()
        step = workflow.split('      - name: Fetch latest daily close and append to CSV\n', 1)[1]
        step = step.split('      - name:', 1)[0].split('        run: |\n', 1)[1]
        script = textwrap.dedent(step)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initial = 'date,price\n2026-10-25,90000\n2026-10-26,91000\n'
            (root / 'data.csv').write_text(initial)
            (root / 'response.json').write_text(payload)
            (root / 'curl').write_text(
                '#!/bin/sh\ncat response.json\nexit "$TEST_CURL_EXIT"\n')
            (root / 'curl').chmod(0o755)
            env = dict(os.environ, PATH=f'{root}{os.pathsep}{os.environ["PATH"]}',
                       TEST_CURL_EXIT=str(exit_code))
            result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', script],
                                    cwd=root, env=env, text=True, capture_output=True)
            return result, initial, (root / 'data.csv').read_text()

    def test_http_error_does_not_abort_workflow_or_change_history(self):
        result, initial, updated = self.run_history_step(exit_code=22)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('::warning::CoinGecko history unavailable', result.stdout)
        self.assertEqual(updated, initial)

    def test_empty_response_preserves_history(self):
        result, initial, updated = self.run_history_step()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('::warning::CoinGecko returned empty', result.stdout)
        self.assertEqual(updated, initial)

    def test_successful_response_updates_and_appends(self):
        payload = json.dumps({'prices': [
            [1792972800000, 92000],  # 2026-10-26 UTC
            [1793059200000, 93000],  # 2026-10-27 UTC
        ]})
        result, _, updated = self.run_history_step(payload=payload)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(updated, 'date,price\n2026-10-25,90000\n2026-10-26,92000\n2026-10-27,93000\n')


if __name__ == '__main__':
    unittest.main()
