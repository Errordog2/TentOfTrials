# Fix for Issue #3: [$50 BOUNTY] [Python/Ops] Automate backup restore integrity verification

#!/usr/bin/env python3
"""
Backup Restore Integrity Verification Tool

Validates restored database snapshots against expected table and row-count specifications.
Supports multiple database backends and dry-run mode for operator validation.

Usage:
    python3 tools/verify_backup.py --spec expected.json --db-url postgresql://...
    python3 tools/verify_backup.py --spec expected.json --dry-run
    python3 tools/verify_backup.py --spec expected.json --metadata-file exported_meta.json
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional


class VerificationStatus(Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"


@dataclass
class TableVerificationResult:
    table_name: str
    expected_count: int
    actual_count: Optional[int]
    status: VerificationStatus
    message: str = ""


@dataclass
class VerificationReport:
    results: list[TableVerificationResult] = field(default_factory=list)
    missing_tables: list[str] = field(default_factory=list)
    extra_tables: list[str] = field(default_factory=list)
    
    @property
    def passed(self) -> bool:
        if self.missing_tables:
            return False
        return all(r.status == VerificationStatus.PASS for r in self.results)
    
    @property
    def exit_code(self) -> int:
        return 0 if self.passed else 1
    
    def summary(self) -> str:
        lines = ["=" * 60, "BACKUP VERIFICATION REPORT", "=" * 60, ""]
        
        if self.missing_tables:
            lines.append(f"MISSING TABLES ({len(self.missing_tables)}):")
            for t in self.missing_tables:
                lines.append(f"  ✗ {t}")
            lines.append("")
        
        if self.extra_tables:
            lines.append(f"UNEXPECTED TABLES ({len(self.extra_tables)}):")
            for t in self.extra_tables:
                lines.append(f"  ? {t}")
            lines.append("")
        
        lines.append("TABLE ROW COUNTS:")
        for result in self.results:
            if result.status == VerificationStatus.PASS:
                icon = "✓"
            elif result.status == VerificationStatus.WARN:
                icon = "⚠"
            else:
                icon = "✗"
            
            actual_str = str(result.actual_count) if result.actual_count is not None else "N/A"
            lines.append(f"  {icon} {result.table_name}: expected={result.expected_count}, actual={actual_str}")
            if result.message:
                lines.append(f"      {result.message}")
        
        lines.append("")
        lines.append("-" * 60)
        passed_count = sum(1 for r in self.results if r.status == VerificationStatus.PASS)
        total_count = len(self.results)
        
        overall = "PASSED" if self.passed else "FAILED"
        lines.append(f"OVERALL: {overall} ({passed_count}/{total_count} tables verified)")
        lines.append("=" * 60)
        
        return "\n".join(lines)
    
    def to_json(self) -> dict:
        return {
            "passed": self.passed,
            "missing_tables": self.missing_tables,
            "extra_tables": self.extra_tables,
            "results": [
                {
                    "table": r.table_name,
                    "expected": r.expected_count,
                    "actual": r.actual_count,
                    "status": r.status.value,
                    "message": r.message
                }
                for r in self.results
            ]
        }


def load_spec(spec_path: Path) -> dict:
    """Load expected table/count specification from JSON file."""
    with open(spec_path, 'r') as f:
        spec = json.load(f)
    
    if "tables" not in spec:
        raise ValueError("Specification file must contain 'tables' key")
    
    return spec


def get_db_counts_live(db_url: str, tables: list[str]) -> dict[str, int]:
    """Query actual row counts from a live database connection."""
    try:
        import sqlalchemy
        from sqlalchemy import create_engine, text, inspect
    except ImportError:
        print("ERROR: sqlalchemy is required for live database verification.", file=sys.stderr)
        print("Install with: pip install sqlalchemy", file=sys.stderr)
        sys.exit(2)
    
    engine = create_engine(db_url)
    counts = {}
    
    with engine.connect() as conn:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        
        for table in tables:
            if table in existing_tables:
                result = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
                counts[table] = result.scalar()
            # Missing tables will not be in counts dict
        
        # Also track what tables exist in DB
        counts["__existing_tables__"] = list(existing_tables)
    
    return counts


def get_db_counts_from_metadata(metadata_path: Path) -> dict[str, int]:
    """Load row counts from an exported metadata JSON file."""
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    if "table_counts" in metadata:
        counts = dict(metadata["table_counts"])
        counts["__existing_tables__"] = list(metadata["table_counts"].keys())
        return counts
    
    raise ValueError("Metadata file must contain 'table_counts' key")


def get_dry_run_counts(spec: dict) -> dict[str, int]:
    """
    Generate simulated counts for dry-run mode.
    Uses sample_data from spec if provided, otherwise returns expected counts.
    """
    counts = {}
    
    if "sample_data" in spec:
        # Use provided sample data for simulation
        sample = spec["sample_data"]
        counts = dict(sample.get("table_counts", {}))
        counts["__existing_tables__"] = list(sample.get("existing_tables", counts.keys()))
    else:
        # Default: return expected counts (perfect match simulation)
        tables = spec["tables"]
        counts = {name: info["expected_count"] for name, info in tables.items()}
        counts["__existing_tables__"] = list(tables.keys())
    
    return counts


def verify_backup(
    spec: dict,
    actual_counts: dict[str, int],
    tolerance_percent: float = 0.0
) -> VerificationReport:
    """
    Compare expected specification against actual database state.
    
    Args:
        spec: Expected table/count specification
        actual_counts: Actual row counts from database or metadata
        tolerance_percent: Allowed percentage deviation (0.0 = exact match required)
    
    Returns:
        VerificationReport with results
    """
    report = VerificationReport()
    expected_tables = spec["tables"]
    existing_tables = set(actual_counts.get("__existing_tables__", actual_counts.keys()))
    
    # Check for missing tables
    for table_name in expected_tables:
        if table_name not in existing_tables:
            report.missing_tables.append(table_name)
    
    # Check for unexpected tables (informational)
    expected_table_set = set(expected_tables.keys())
    for table_name in existing_tables:
        if table_name not in expected_table_set:
            report.extra_tables.append(table_name)
    
    # Verify row counts
    for table_name, table_spec in expected_tables.items():
        expected_count = table_spec["expected_count"]
        actual_count = actual_counts.get(table_name)
        
        if actual_count is None:
            report.results.append(TableVerificationResult(
                table_name=table_name,
                expected_count=expected_count,
                actual_count=None,
                status=VerificationStatus.FAIL,
                message="Table not found in database"
            ))
            continue
        
        # Check if within tolerance
        if expected_count == 0:
            matches = actual_count == 0
        else:
            deviation = abs(actual_count - expected_count) / expected_count * 100
            matches = deviation <= tolerance_percent
        
        if matches:
            status = VerificationStatus.PASS
            message = ""
        else:
            status = VerificationStatus.FAIL
            diff = actual_count - expected_count
            sign = "+" if diff > 0 else ""
            message = f"Row count mismatch: {sign}{diff} rows"
        
        report.results.append(TableVerificationResult(
            table_name=table_name,
            expected_count=expected_count,
            actual_count=actual_count,
            status=status,
            message=message
        ))
    
    return report


def main():
    parser = argparse.ArgumentParser(
        description="Verify backup restore integrity against expected specifications",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Verify against live database
  python3 verify_backup.py --spec expected.json --db-url postgresql://user:pass@host/db
  
  # Verify against exported metadata
  python3 verify_backup.py --spec expected.json --metadata-file backup_meta.json
  
  # Dry-run with sample data
  python3 verify_backup.py --spec expected.json --dry-run
  
  # Output as JSON
  python3 verify_backup.py --spec expected.json --dry-run --output-format json
"""
    )
    
    parser.add_argument(
        "--spec", "-s",
        type=Path,
        required=True,
        help="Path to JSON specification file with expected tables/counts"
    )
    
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--db-url",
        help="Database connection URL (e.g., postgresql://user:pass@host/db)"
    )
    source_group.add_argument(
        "--metadata-file", "-m",
        type=Path,
        help="Path to exported metadata JSON file"
    )
    source_group.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Run with sample data for validation (no database connection)"
    )
    
    parser.add_argument(
        "--tolerance", "-t",
        type=float,
        default=0.0,
        help="Allowed row count deviation percentage (default: 0.0 = exact match)"
    )
    
    parser.add_argument(
        "--output-format", "-f",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)"
    )
    
    parser.add_argument(
        "--output-file", "-o",
        type=Path,
        help="Write output to file instead of stdout"
    )
    
    args = parser.parse_args()
    
    # Load specification
    try:
        spec = load_spec(args.spec)
    except (FileNotFoundError, json.JSONDecodeError, ValueError) as e:
        print(f"ERROR: Failed to load specification: {e}", file=sys.stderr)
        sys.exit(2)
    
    # Get actual counts based on mode
    try:
        if args.dry_run:
            print("Running in DRY-RUN mode with sample data...\n", file=sys.stderr)
            actual_counts = get_dry_run_counts(spec)
        elif args.metadata_file:
            actual_counts = get_db_counts_from_metadata(args.metadata_file)
        else:
            actual_counts = get_db_counts_live(args.db_url, list(spec["tables"].keys()))
    except Exception as e:
        print(f"ERROR: Failed to get database counts: {e}", file=sys.stderr)
        sys.exit(2)
    
    # Run verification
    report = verify_backup(spec, actual_counts, args.tolerance)
    
    # Generate output
    if args.output_format == "json":
        output = json.dumps(report.to_json(), indent=2)
    else:
        output = report.summary()
    
    # Write output
    if args.output_file:
        with open(args.output_file, 'w') as f:
            f.write(output)
        print(f"Report written to {args.output_file}", file=sys.stderr)
    else:
        print(output)
    
    sys.exit(report.exit_code)


if __name__ == "__main__":
    main()