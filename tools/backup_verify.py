#!/usr/bin/env python3
"""
Verify restored database table counts against an expected manifest.

This helper is file-based so operators can validate a staging restore from
exported metadata without granting the tool production database credentials.
It accepts JSON manifests and simple CSV exports, reports missing tables and
row-count mismatches, and returns a non-zero exit code on failure.
"""

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Dict, Iterable, Mapping

SAMPLE_EXPECTED = {
    "users": 1250,
    "orders": 8042,
    "trades": 39110,
    "audit_logs": 122004,
}

SAMPLE_OBSERVED_PASS = {
    "users": 1250,
    "orders": 8042,
    "trades": 39110,
    "audit_logs": 122004,
}

SAMPLE_OBSERVED_FAIL = {
    "users": 1250,
    "orders": 7999,
    "trades": 39110,
}


def load_counts(path: Path) -> Dict[str, int]:
    if not path.exists():
        raise ValueError(f"file does not exist: {path}")

    suffix = path.suffix.lower()
    if suffix == ".json":
        return load_json_counts(path)
    if suffix == ".csv":
        return load_csv_counts(path)

    raise ValueError(f"unsupported file format for {path}; use .json or .csv")


def load_json_counts(path: Path) -> Dict[str, int]:
    data = json.loads(path.read_text())
    if isinstance(data, dict) and "tables" in data:
        data = data["tables"]

    if isinstance(data, dict):
        return normalize_counts(data.items(), path)

    if isinstance(data, list):
        rows = []
        for item in data:
            if not isinstance(item, Mapping):
                raise ValueError(f"{path}: list entries must be objects")
            rows.append((item.get("table") or item.get("name"), item.get("count") or item.get("row_count")))
        return normalize_counts(rows, path)

    raise ValueError(f"{path}: expected object, object with tables, or list of table/count objects")


def load_csv_counts(path: Path) -> Dict[str, int]:
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"{path}: missing CSV header")
        table_field = first_present(reader.fieldnames, ("table", "name", "table_name"))
        count_field = first_present(reader.fieldnames, ("count", "row_count", "rows"))
        if not table_field or not count_field:
            raise ValueError(f"{path}: CSV must include table/name and count/row_count columns")
        return normalize_counts(((row.get(table_field), row.get(count_field)) for row in reader), path)


def first_present(fields: Iterable[str], candidates: Iterable[str]) -> str:
    normalized = {field.lower(): field for field in fields}
    for candidate in candidates:
        if candidate in normalized:
            return normalized[candidate]
    return ""


def normalize_counts(rows: Iterable[tuple[object, object]], source: Path) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for table, count in rows:
        if not table:
            raise ValueError(f"{source}: table name is required")
        table_name = str(table).strip()
        if not table_name:
            raise ValueError(f"{source}: table name is required")
        try:
            row_count = int(count)  # type: ignore[arg-type]
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{source}: invalid count for {table_name}: {count}") from exc
        if row_count < 0:
            raise ValueError(f"{source}: negative count for {table_name}: {row_count}")
        counts[table_name] = row_count
    return counts


def compare_counts(expected: Mapping[str, int], observed: Mapping[str, int]) -> tuple[list[str], list[str], list[str]]:
    missing = sorted(table for table in expected if table not in observed)
    mismatched = sorted(
        table
        for table, expected_count in expected.items()
        if table in observed and observed[table] != expected_count
    )
    extra = sorted(table for table in observed if table not in expected)
    return missing, mismatched, extra


def print_report(expected: Mapping[str, int], observed: Mapping[str, int]) -> int:
    missing, mismatched, extra = compare_counts(expected, observed)

    print("Backup restore verification report")
    print(f"  expected tables: {len(expected)}")
    print(f"  observed tables: {len(observed)}")

    if missing:
        print("\nMissing tables:")
        for table in missing:
            print(f"  - {table} expected={expected[table]}")

    if mismatched:
        print("\nRow-count mismatches:")
        for table in mismatched:
            print(f"  - {table} expected={expected[table]} observed={observed[table]}")

    if extra:
        print("\nExtra observed tables:")
        for table in extra:
            print(f"  - {table} observed={observed[table]}")

    if missing or mismatched:
        print("\nResult: FAIL")
        return 1

    print("\nResult: PASS")
    return 0


def write_sample(path: Path, data: Mapping[str, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"tables": data}, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate restored database table counts against an expected manifest."
    )
    parser.add_argument("--expected", type=Path, help="Expected table counts as JSON or CSV")
    parser.add_argument("--observed", type=Path, help="Observed restored table counts as JSON or CSV")
    parser.add_argument("--dry-run", action="store_true", help="Parse inputs and return success without enforcing differences")
    parser.add_argument("--sample-pass", type=Path, help="Write a passing observed sample manifest to this path")
    parser.add_argument("--sample-fail", type=Path, help="Write a failing observed sample manifest to this path")
    parser.add_argument("--sample-expected", type=Path, help="Write a sample expected manifest to this path")
    args = parser.parse_args()

    wrote_sample = False
    for target, data in (
        (args.sample_expected, SAMPLE_EXPECTED),
        (args.sample_pass, SAMPLE_OBSERVED_PASS),
        (args.sample_fail, SAMPLE_OBSERVED_FAIL),
    ):
        if target:
            write_sample(target, data)
            print(f"wrote {target}")
            wrote_sample = True

    if wrote_sample and not args.expected and not args.observed:
        return 0

    if not args.expected or not args.observed:
        parser.error("--expected and --observed are required unless only writing samples")

    try:
        expected = load_counts(args.expected)
        observed = load_counts(args.observed)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    result = print_report(expected, observed)
    if args.dry_run:
        print("\nDry run: parsed inputs successfully; returning success without enforcing comparison result.")
        return 0
    return result


if __name__ == "__main__":
    sys.exit(main())
