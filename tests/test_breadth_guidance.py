"""Guidance must not mistake missing sessions for a persistent market condition."""
import unittest
from scripts import process_ema as model


def reading(date, short=35.7, long=59.2):
    return dict(date=date, above_50d=short, above_200d=long)


class BreadthGuidance(unittest.TestCase):
    def test_conditions_and_boundary(self):
        for short, long, expected in [(60, 60, 'broad'), (40, 60, 'caution'),
                                      (40, 40, 'concern'), (60, 40, 'recovery'),
                                      (50, 60, 'midpoint'), (40, 50, 'midpoint'),
                                      (None, 60, 'unavailable'), (float('nan'), 60, 'unavailable'),
                                      (0, 0, 'concern')]:
            with self.subTest(short=short, long=long):
                self.assertEqual(model._breadth_condition(reading('2026-09-24', short, long)), expected)

    def test_holiday_does_not_break_count_and_change_uses_five_sessions(self):
        dates = model._exchange_sessions('2026-09-01', '2026-09-09')
        rows = [reading(date, 30 + i, 60 + i) for i, date in enumerate(dates)]
        result = model._compute_breadth_guidance(rows, rows[-1], dates[-1])
        self.assertEqual(result['consecutive_sessions'], 6)
        self.assertEqual(result['change_5_sessions'], dict(above_50d=5, above_200d=5))

    def test_missing_session_breaks_streak(self):
        rows = [reading(d) for d in ['2026-09-21', '2026-09-23', '2026-09-24']]
        result = model._compute_breadth_guidance(rows, rows[-1], '2026-09-24')
        self.assertEqual(result['consecutive_sessions'], 2)

    def test_missing_endpoint_is_not_replaced_by_nearby_observation(self):
        dates = model._exchange_sessions('2026-09-14', '2026-09-24')
        rows = [reading(d) for d in dates if d != dates[-6]]
        result = model._compute_breadth_guidance(rows, rows[-1], dates[-1])
        self.assertEqual(result['change_5_sessions'], dict(above_50d=None, above_200d=None))

    def test_missing_value_and_new_condition_break_count(self):
        rows = [reading('2026-09-21'), reading('2026-09-22', None), reading('2026-09-23')]
        self.assertEqual(model._compute_breadth_guidance(rows, rows[-1], '2026-09-23')['consecutive_sessions'], 1)
        current = reading('2026-09-24', 60, 60)
        self.assertEqual(model._compute_breadth_guidance(rows, current, '2026-09-24')['consecutive_sessions'], 1)

    def test_closed_day_and_unavailable_current_do_not_extend_count(self):
        rows = [reading('2026-09-04')]
        self.assertEqual(model._compute_breadth_guidance(rows, rows[0], '2026-09-07')['consecutive_sessions'], 0)
        current = reading('2026-09-08', None)
        result = model._compute_breadth_guidance(rows, current, '2026-09-08')
        self.assertEqual(result['consecutive_sessions'], 0)
        self.assertEqual(result['condition'], 'unavailable')


if __name__ == '__main__':
    unittest.main()
