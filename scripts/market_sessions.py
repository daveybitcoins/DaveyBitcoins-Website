"""NYSE session boundaries shared by scanner fetches and processing."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import exchange_calendars as xcals


def exchange_calendar(start, end):
    return xcals.get_calendar(
        "XNYS", start=f"{int(start[:4]) - 1}-01-01", end=f"{int(end[:4]) + 1}-12-31"
    )


def exchange_sessions(start, end):
    calendar = exchange_calendar(start, end)
    return [day.strftime("%Y-%m-%d") for day in calendar.sessions_in_range(start, end)]


def utc_now(now=None):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("Session checks require a timezone-aware timestamp")
    return now.astimezone(timezone.utc)


def last_completed_session(now=None):
    """Return the last session whose actual close has passed, including early closes."""
    now = utc_now(now)
    day = now.astimezone(ZoneInfo("America/New_York")).date().isoformat()
    calendar = exchange_calendar(day, day)
    session = calendar.date_to_session(day, direction="previous")
    if calendar.session_close(session).to_pydatetime() > now:
        session = calendar.previous_session(session)
    return session.strftime("%Y-%m-%d")


def equity_fetch_session(now=None):
    """Fetch live equity snapshots only after today's New York session closes.

    During another session, on holidays, and over weekends, reuse retained data;
    a live quote must never be relabeled as the previous session's close.
    """
    now = utc_now(now)
    day = now.astimezone(ZoneInfo("America/New_York")).date().isoformat()
    return day if last_completed_session(now) == day else None
