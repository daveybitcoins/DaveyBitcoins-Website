#!/usr/bin/env python3
"""
AI Market Summary Generator
Reads scanner_data.json, sends key data to Claude, and writes an AI-generated
market summary back into scanner_data.json for the website.

Usage: python3 scripts/generate_summary.py [--force]
  - Requires ANTHROPIC_API_KEY environment variable
  - Use --force to regenerate even if summary already exists for today
  - Reads data/scanner_data.json (must exist)
  - Adds "ai_summary" key to scanner_data.json
"""

import json
import os
import sys
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_FILE = os.path.join(PROJECT_DIR, "data", "scanner_data.json")

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 2500

SYSTEM_PROMPT = """You are a senior market analyst writing a concise daily EMA scanner briefing.
You analyze weekly EMA trend data (8W, 13W, 21W) across the top 300 US stocks by market cap.

Your audience is an active swing trader who uses weekly EMA structure to find entries.
They especially value:
- Bear Rally stocks that also have bullish crossover alerts (early reversal signals)
- Pullback entry opportunities in established uptrends
- Sector rotation themes and momentum acceleration
- Risk warnings about deteriorating trends

You will also receive EMA positioning data for SPY (S&P 500), QQQ (Nasdaq 100), and BTC (Bitcoin) as market context.
Use their EMA structure to inform your overall market bias. For example:
- Both Full Bull = strong broad market uptrend, pullbacks are higher conviction
- SPY Full Bull but QQQ in pullback = tech rotation out
- Both in bear structure = defensive market environment
- BTC Full Bull with SPY Full Bull = max risk-on environment
- BTC in bear structure while SPY bull = divergence, watch for correlation snap

Be direct, use trader language, and focus on actionable observations.
Concise bullet points preferred over long paragraphs.
Only mention common stocks — skip preferred shares (tickers with / or . in them)."""

SCHEMA = {
    "market_overview": {
        "bias": "one of: bullish, bearish, neutral, mixed",
        "bias_label": "human-readable like 'Leaning Bullish', 'Cautiously Bearish'",
        "headline": "1 sentence market summary",
        "detail": "1-2 sentences with key stats backing the headline",
        "index_signals": {
            "SPY": "signal string e.g. Full Bull",
            "QQQ": "signal string e.g. Bull Pullback \u2192 13W",
            "BTC": "signal string e.g. Full Bear"
        }
    },
    "reversal_candidates": {
        "headline": "section title for bear rally + crossover setups",
        "items": [
            {
                "symbol": "TICKER",
                "name": "Company Name",
                "signal": "exact signal string from data",
                "crossover_detail": "crossover alert text if applicable, or null",
                "note": "1 sentence on why this is interesting",
                "type": "bull"
            }
        ]
    },
    "pullback_setups": {
        "headline": "section title for pullback entries",
        "items": [
            {
                "symbol": "TICKER",
                "name": "Company Name",
                "signal": "exact signal string from data",
                "price_vs_21w": 0.0,
                "note": "1 sentence on the setup quality",
                "type": "bull"
            }
        ]
    },
    "momentum_themes": {
        "headline": "section title for momentum",
        "detail": "1-2 sentences on which themes/sectors are showing accelerating momentum",
        "top_names": ["TICKER1", "TICKER2", "TICKER3"]
    },
    "sector_analysis": {
        "headline": "section title",
        "strongest": [
            {"sector": "Name", "net_score": 0.0, "bull_pct": 0.0, "note": "1 sentence"}
        ],
        "weakest": [
            {"sector": "Name", "net_score": 0.0, "bear_pct": 0.0, "note": "1 sentence"}
        ],
        "detail": "1-2 sentences on sector rotation narrative"
    },
    "risk_warnings": {
        "headline": "section title",
        "items": [
            {"text": "concise risk warning", "type": "caution or bear"}
        ]
    }
}


def extract_prompt_data(data):
    """Extract focused data for the Claude prompt."""
    dashboard = data["dashboard"]

    # Top pullback setups (first 10)
    pullbacks_top = [{
        "symbol": s["symbol"], "name": s["name"], "signal": s["signal"],
        "price_vs_21w": s["price_vs_21w"], "price_vs_13w": s["price_vs_13w"],
        "price_vs_8w": s["price_vs_8w"], "mkt_cap_b": s["mkt_cap_b"],
        "sector": s["sector"], "analyst": s.get("analyst", "")
    } for s in data["pullbacks"][:10]]

    # Top 8 momentum leaders
    momentum_top = [{
        "symbol": s["symbol"], "name": s["name"],
        "spread_score": s["spread_score"], "price_vs_21w": s["price_vs_21w"],
        "sector": s["sector"]
    } for s in data["momentum_leaders"][:8]]

    # Sector heatmap (all sectors)
    sectors = data["sector_heatmap"]

    # Bearish stocks: Bear Rally + Full Bear + Bearish (unstacked)
    bearish_signals = {"Bear Rally above 13W", "Bear Rally \u2192 13W", "Full Bear", "Bearish (unstacked)"}
    bear_rallies = [{
        "symbol": s["symbol"], "name": s["name"], "signal": s["signal"],
        "price_vs_8w": s["price_vs_8w"], "price_vs_13w": s["price_vs_13w"],
        "price_vs_21w": s["price_vs_21w"], "sector": s["sector"],
        "mkt_cap_b": s["mkt_cap_b"], "analyst": s.get("analyst", "")
    } for s in data["full_scanner"] if s["signal"] in bearish_signals]

    # Crossover alerts with bullish potential
    bullish_crossovers = [{
        "symbol": s["symbol"], "name": s["name"], "signal": s["signal"],
        "alert": s["alert"], "mkt_cap_b": s["mkt_cap_b"],
        "sector": s["sector"], "analyst": s.get("analyst", "")
    } for s in data["crossover_alerts"] if "bullish cross" in s.get("alert", "")]

    # Cross-reference: bearish stocks that also have bullish crossover alerts
    # Include the alert text so the AI can copy it verbatim
    crossover_by_symbol = {s["symbol"]: s["alert"] for s in bullish_crossovers}
    bear_rally_with_crossover = [{**s, "crossover_alert": crossover_by_symbol[s["symbol"]]}
                                  for s in bear_rallies if s["symbol"] in crossover_by_symbol]

    # Bull Breakdowns
    breakdowns = [s for s in data["full_scanner"] if s["signal"] == "Bull Breakdown"]

    # Worst bears (deepest below 21W)
    worst_bears = [{
        "symbol": s["symbol"], "name": s["name"],
        "price_vs_21w": s["price_vs_21w"], "sector": s["sector"],
        "mkt_cap_b": s["mkt_cap_b"]
    } for s in data["bear_list"][:5]]

    return {
        "date": data["meta"]["date"],
        "total_stocks": data["meta"]["total_stocks"],
        "index_context": data.get("index_context", []),
        "dashboard": dashboard,
        "pullbacks_top": pullbacks_top,
        "momentum_top": momentum_top,
        "sectors": sectors,
        "bear_rallies": bear_rallies,
        "bullish_crossovers": bullish_crossovers[:15],  # trim for token budget
        "bear_rally_with_crossover": bear_rally_with_crossover,
        "bull_breakdowns_count": len(breakdowns),
        "worst_bears": worst_bears,
    }


def build_user_prompt(d):
    """Construct the user prompt with scanner data."""
    index_section = ""
    if d.get("index_context"):
        index_section = f"""
## Market Index Context (SPY, QQQ & BTC)
{json.dumps(d['index_context'], indent=2)}
These represent the broad market (S&P 500), tech-heavy (Nasdaq 100), and crypto (Bitcoin) trend context.
Factor their EMA positioning into your overall market bias assessment.
Include their exact signal strings in market_overview.index_signals.
"""

    return f"""Analyze this EMA scanner data for {d['date']} and return a JSON summary.
{index_section}
## Signal Distribution
{json.dumps(d['dashboard'], indent=2)}

## Top Pullback Setups
{json.dumps(d['pullbacks_top'], indent=2)}

## Top Momentum Leaders (by spread score)
{json.dumps(d['momentum_top'], indent=2)}

## Sector Heatmap
{json.dumps(d['sectors'], indent=2)}

## Bear Rally Stocks (bearish EMA structure, price rallying up)
{json.dumps(d['bear_rallies'], indent=2)}

## Bear Rallies WITH Bullish Crossover Alerts (REVERSAL CANDIDATES — highlight these)
{json.dumps(d['bear_rally_with_crossover'], indent=2)}

## Bullish Crossover Alerts (EMAs about to cross bullish)
{json.dumps(d['bullish_crossovers'], indent=2)}

## Additional Context
- Bull Breakdowns (uptrend cracking): {d['bull_breakdowns_count']}
- Deepest Bears: {json.dumps(d['worst_bears'], indent=2)}

Return ONLY valid JSON matching this exact structure (no markdown, no code fences):
{json.dumps(SCHEMA, indent=2)}

Rules:
- market_overview.index_signals: include the exact signal string for SPY, QQQ, and BTC from the index context data. If no index data provided, omit this field
- market_overview.bias must be one of: "bullish", "bearish", "neutral", "mixed"
- market_overview.bias_label: human-readable like "Leaning Bullish", "Cautiously Bearish", "Neutral / Mixed"
- reversal_candidates.items: ONLY pick from the "Bear Rallies WITH Bullish Crossover Alerts" section. Each item.crossover_detail MUST be copied VERBATIM from the crossover_alert field in that data — do NOT rephrase or invent crossover text. Max 5 items. If that section is empty, pick the most notable bearish stocks with bullish crossover alerts. Each item.type = "bull". Skip preferred shares (tickers with / or .)
- pullback_setups.items: Pick the 3-5 most interesting pullback setups (prioritize large-cap, well-known names). Each item.type = "bull". Skip preferred shares
- momentum_themes.top_names: 3-5 tickers showing strongest momentum. Skip preferred shares
- sector_analysis.strongest: Top 3 sectors by net_score. sector_analysis.weakest: Bottom 3 sectors
- risk_warnings.items: 2-4 concise warnings. item.type is "caution" or "bear"
- All text fields should be concise (1-2 sentences max)
- Use ticker symbols in ALL CAPS
- signal field must use the exact signal string from the data (e.g. "Bear Rally above 13W", "Bull Pullback → 21W")
"""


def call_claude(system_prompt, user_prompt):
    """Call Anthropic API and return parsed JSON."""
    import anthropic

    client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var

    message = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    )

    raw_text = message.content[0].text.strip()

    # Strip any accidental markdown code fences
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1]
    if raw_text.endswith("```"):
        raw_text = raw_text.rsplit("```", 1)[0]
    raw_text = raw_text.strip()

    return json.loads(raw_text)


def validate_summary(summary):
    """Basic validation of the AI response structure."""
    required_keys = [
        "market_overview", "reversal_candidates",
        "pullback_setups", "momentum_themes",
        "sector_analysis", "risk_warnings"
    ]
    for key in required_keys:
        if key not in summary:
            raise ValueError(f"Missing required key: {key}")

    # Validate market_overview
    mo = summary["market_overview"]
    if mo.get("bias") not in ("bullish", "bearish", "neutral", "mixed"):
        raise ValueError(f"Invalid bias value: {mo.get('bias')}")
    for field in ("bias_label", "headline", "detail"):
        if not mo.get(field):
            raise ValueError(f"Missing market_overview.{field}")

    # Validate items arrays exist
    if not isinstance(summary["reversal_candidates"].get("items"), list):
        raise ValueError("reversal_candidates.items must be a list")
    if not isinstance(summary["pullback_setups"].get("items"), list):
        raise ValueError("pullback_setups.items must be a list")
    if not isinstance(summary["risk_warnings"].get("items"), list):
        raise ValueError("risk_warnings.items must be a list")


def main():
    force = "--force" in sys.argv

    # Check for API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Warning: ANTHROPIC_API_KEY not set. Skipping AI summary generation.")
        return 0

    # Load existing scanner data
    if not os.path.exists(DATA_FILE):
        print(f"Warning: {DATA_FILE} not found. Skipping AI summary generation.")
        return 0

    with open(DATA_FILE, "r") as f:
        data = json.load(f)

    # Check if summary already exists for this date (skip unless --force)
    existing = data.get("ai_summary", {})
    if not force and existing.get("generated_at", "").startswith(data["meta"]["date"]):
        print(f"AI summary already generated for {data['meta']['date']}. Skipping. (use --force to override)")
        return 0

    try:
        prompt_data = extract_prompt_data(data)
        user_prompt = build_user_prompt(prompt_data)

        print("Generating AI market summary...")
        summary = call_claude(SYSTEM_PROMPT, user_prompt)

        # Validate structure
        validate_summary(summary)

        # Add metadata
        summary["generated_at"] = datetime.now().isoformat()
        summary["model"] = MODEL

        # Write back to scanner_data.json
        data["ai_summary"] = summary
        with open(DATA_FILE, "w") as f:
            json.dump(data, f, indent=2)

        print(f"AI summary written to {DATA_FILE}")
        print(f"  Bias: {summary['market_overview']['bias_label']}")
        print(f"  Reversal candidates: {len(summary['reversal_candidates']['items'])}")
        print(f"  Pullback setups: {len(summary['pullback_setups']['items'])}")
        print(f"  Risk warnings: {len(summary['risk_warnings']['items'])}")

    except Exception as e:
        print(f"Warning: AI summary generation failed: {e}")
        print("Pipeline continuing without AI summary.")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
