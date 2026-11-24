"""A generated briefing belongs to one specific equity snapshot."""


def summary_matches_snapshot(summary, meta):
    return bool(
        isinstance(summary, dict)
        and meta.get("date")
        and meta.get("generated_at")
        and meta.get("latest_completed_session", meta["date"]) == meta["date"]
        and summary.get("source_date") == meta["date"]
        and summary.get("source_generated_at") == meta["generated_at"]
    )
