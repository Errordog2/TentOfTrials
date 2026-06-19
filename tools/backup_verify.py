#!/usr/bin/env python3
"""
backup_verify.py - Backup Restore Integrity Verification

Validates that a restored database matches expected table structure and row
counts. Accepts a JSON manifest of expected tables and row-count ranges,
then compares against the actual restored state.

Usage:
    python tools/backup_verify.py --manifest expected.json --snapshot restored.json
    python tools/backup_verify.py --manifest expected.json --snapshot restored.json --dry-run
    python tools/backup_verify.py --manifest expected.json --snapshot restored.json --format json
    python tools/backup_verify.py --sample  # print a sample manifest to stdout

Exit codes:
    0  All checks passed
    1  Missing tables or row-count mismatches found
    2  Invalid arguments or missing files
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_json(path: str) -> Any:
    with open(path) as f:
        return json.load(f)


def print_sample_manifest() -> None:
    manifest = {
        "tables": {
            "users": {"min_rows": 1000, "max_rows": 50000},
            "orders": {"min_rows": 500, "max_rows": 100000},
            "products": {"min_rows": 50, "max_rows": 5000},
            "sessions": {"min_rows": 0, "max_rows": 10000},
        },
        "required_tables": ["users", "orders", "products"],
    }
    print(json.dumps(manifest, indent=2))


def verify_backup(
    manifest: dict, snapshot: dict, dry_run: bool = False
) -> tuple[bool, list[str]]:
    expected_tables = manifest.get("tables", {})
    required_tables = manifest.get("required_tables", [])
    actual_tables = snapshot.get("tables", {})

    errors: list[str] = []

    for table in required_tables:
        if table not in actual_tables:
            errors.append(f"MISSING REQUIRED TABLE: {table}")

    for table, spec in expected_tables.items():
        if table not in actual_tables:
            if table not in required_tables:
                continue
            errors.append(f"MISSING TABLE: {table} (expected {spec.get('min_rows', 0)}-{spec.get('max_rows', '?')} rows)")
            continue

        actual_count = actual_tables[table].get("row_count", 0)
        min_rows = spec.get("min_rows", 0)
        max_rows = spec.get("max_rows", float("inf"))

        if actual_count < min_rows:
            errors.append(
                f"ROW COUNT TOO LOW: {table} has {actual_count} rows, expected >= {min_rows}"
            )
        elif actual_count > max_rows:
            errors.append(
                f"ROW COUNT TOO HIGH: {table} has {actual_count} rows, expected <= {max_rows}"
            )

    extra_tables = set(actual_tables.keys()) - set(expected_tables.keys())
    for table in sorted(extra_tables):
        errors.append(f"UNEXPECTED TABLE: {table} (not in manifest)")

    return len(errors) == 0, errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify restored database integrity against expected manifest"
    )
    parser.add_argument(
        "--manifest",
        help="Path to expected tables/counts JSON manifest",
    )
    parser.add_argument(
        "--snapshot",
        help="Path to restored database snapshot JSON",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print expected manifest and exit without verifying",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Print a sample manifest to stdout and exit",
    )
    args = parser.parse_args()

    if args.sample:
        print_sample_manifest()
        return 0

    if not args.manifest:
        parser.error("--manifest is required (or use --sample)")

    if args.dry_run:
        manifest = load_json(args.manifest)
        print("Dry-run: expected manifest:")
        print(json.dumps(manifest, indent=2))
        return 0

    if not args.snapshot:
        parser.error("--snapshot is required for verification")

    manifest = load_json(args.manifest)
    snapshot = load_json(args.snapshot)

    passed, errors = verify_backup(manifest, snapshot)

    if args.format == "json":
        result = {
            "passed": passed,
            "errors": errors,
            "error_count": len(errors),
        }
        print(json.dumps(result, indent=2))
    else:
        if passed:
            print("PASS: All backup integrity checks passed.")
        else:
            print(f"FAIL: {len(errors)} integrity check(s) failed:")
            for err in errors:
                print(f"  - {err}")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
