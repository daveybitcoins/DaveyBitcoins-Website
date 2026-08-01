#!/usr/bin/env python3
"""Backfill missing market-breadth history from retained EMA CSV snapshots."""

import argparse
import csv
import os
import tempfile

import process_ema


FIELD_MAP = [
    ("above_5d", "sma5"),
    ("above_20d", "sma20"),
    ("above_50d", "sma50"),
    ("above_200d", "sma200"),
]
FIELDNAMES = ["date", *(name for name, _ in FIELD_MAP)]


def calculate_breadth(snapshot_path):
    stocks = [
        stock
        for stock in process_ema.parse_csv(snapshot_path)
        if process_ema.is_common_stock(stock["symbol"])
    ]
    stocks.sort(key=lambda stock: stock["mkt_cap_b"], reverse=True)
    stocks = stocks[: process_ema.TOP_N]

    if len(stocks) != process_ema.TOP_N:
        raise ValueError(
            f"{os.path.basename(snapshot_path)} produced {len(stocks)} stocks; "
            f"expected {process_ema.TOP_N}"
        )

    breadth = {}
    for output_key, sma_key in FIELD_MAP:
        valid = [stock for stock in stocks if stock.get(sma_key) is not None]
        if not valid:
            raise ValueError(
                f"{os.path.basename(snapshot_path)} has no valid {sma_key} values"
            )
        above = sum(stock["price"] > stock[sma_key] for stock in valid)
        breadth[output_key] = round(above / len(valid) * 100, 1)

    return breadth


def load_history():
    with open(process_ema.BREADTH_HISTORY, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def find_snapshots(start, end):
    snapshots = []
    for filename in os.listdir(process_ema.CSV_DIR):
        if not filename.startswith("Weekly EMA Values_") or not filename.endswith(".csv"):
            continue
        snapshot_path = os.path.join(process_ema.CSV_DIR, filename)
        snapshot_date = process_ema._date_from_path(snapshot_path)
        if snapshot_date and start <= snapshot_date <= end:
            snapshots.append((snapshot_date, snapshot_path))
    return sorted(snapshots)


def write_history(rows):
    history_dir = os.path.dirname(process_ema.BREADTH_HISTORY)
    with tempfile.NamedTemporaryFile(
        "w",
        newline="",
        encoding="utf-8",
        dir=history_dir,
        delete=False,
    ) as handle:
        writer = csv.DictWriter(
            handle, fieldnames=FIELDNAMES, lineterminator="\r\n"
        )
        writer.writeheader()
        writer.writerows(rows)
        temporary_path = handle.name
    os.replace(temporary_path, process_ema.BREADTH_HISTORY)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, help="first snapshot date, YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="last snapshot date, YYYY-MM-DD")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="calculate and report missing rows without changing the history file",
    )
    args = parser.parse_args()

    if args.start > args.end:
        parser.error("--start must not be after --end")

    rows = load_history()
    existing_dates = {row["date"] for row in rows}
    additions = []

    for snapshot_date, snapshot_path in find_snapshots(args.start, args.end):
        if snapshot_date in existing_dates:
            continue
        additions.append({"date": snapshot_date, **calculate_breadth(snapshot_path)})

    if not additions:
        print("No missing breadth-history rows found")
        return 0

    for row in additions:
        print(
            f"{row['date']}: "
            f"5D={row['above_5d']} 20D={row['above_20d']} "
            f"50D={row['above_50d']} 200D={row['above_200d']}"
        )

    if args.dry_run:
        print(f"Dry run: {len(additions)} rows would be added")
        return 0

    rows.extend(additions)
    rows.sort(key=lambda row: row["date"])
    write_history(rows)
    print(f"Added {len(additions)} rows to {process_ema.BREADTH_HISTORY}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
