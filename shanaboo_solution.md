 ```diff
--- a/tools/data_generator.py
+++ b/tools/data_generator.py
@@ -1,4 +1,5 @@
 #!/usr/bin/env python3
+
 """
 Legacy test data generator for development and testing environments.
 Generates realistic-looking market data, orders, trades, and user data
@@ -15,7 +16,6 @@
 """
 
 import argparse
-import csv
 import json
 import math
 import os
@@ -24,7 +24,8 @@
 import time
 from datetime import datetime, timedelta, timezone
 from typing import Any, Dict, List, Optional, Tuple
-
+import csv
+ 
 # ---------------------------------------------------------------------------
 # CONSTANTS
 # ---------------------------------------------------------------------------
@@ -93,7 +94,7 @@
 DOMAINS = ["example.com", "test.org", "demo.net", "sample.io", "mock.dev",
            "fictitious.co", "imaginary.app", "pretend.tech", "dummy.biz",
            "simulated.com", "testmail.com", "inbox.test"]
-
+ 
 # ---------------------------------------------------------------------------
 # HELPERS
 # ---------------------------------------------------------------------------
@@ -101,7 +102,7 @@
 def _random_price(rng: random.Random, base: float, volatility: float) -> float:
     """Return a price around base with given volatility."""
     return base + rng.uniform(-volatility, volatility)
-
+ 
 def _random_timestamp(rng: random.Random, days_back: int = 30) -> datetime:
     """Return a random timestamp within the last days_back days."""
     now = datetime.now(timezone.utc)
@@ -109,7 +110,7 @@
     random_seconds = rng.randint(0, int(delta.total_seconds()))
     return now - timedelta(seconds=random_seconds)
 
-
+ 
 # ---------------------------------------------------------------------------
 # DATA GENERATOR CLASS
 # ---------------------------------------------------------------------------
@@ -126,7 +127,7 @@
         self.rng = random.Random(seed)
         self.now = datetime.now(timezone.utc)
         self.instruments = INSTRUMENTS
-
+ 
     # -----------------------------------------------------------------------
     # Public API
     # -----------------------------------------------------------------------
@@ -140,7 +141,7 @@
             "users": self.generate_users(user_count),
         }
         return data
-
+ 
     def generate_market_data(self, count: int) -> List[Dict[str, Any]]:
         """Generate count market data snapshots."""
         result: List[Dict[str, Any]] = []
@@ -159,7 +160,7 @@
                 "volume_24h": round(self.rng.uniform(1_000_000, 10_000_000), 2),
             })
         return result
-
+ 
     def generate_orders(self, count: int) -> List[Dict[str, Any]]:
         """Generate count orders."""
         result: List[Dict[str, Any]] = []
@@ -186,7 +187,7 @@
                 "updated_at": updated_at.isoformat(),
             })
         return result
-
+ 
     def generate_trades(self, count: int) -> List[Dict[str, Any]]:
         """Generate count trades."""
         result: List[Dict[str, Any]] = []
@@ -208,7 +209,7 @@
                 "settlement_status": self.rng.choice(["pending", "settled", "failed"]),
             })
         return result
-
+ 
     def generate_users(self, count: int) -> List[Dict[str, Any]]:
         """Generate count users."""
         result: List[Dict[str, Any]] = []
@@ -231,7 +232,7 @@
                 "created_at": created_at.isoformat(),
             })
         return result
-
+ 
     # -----------------------------------------------------------------------
     # Writers
     # -----------------------------------------------------------------------
@@ -243,7 +244,7 @@
         with open(path, "w", encoding="utf-8") as f:
             json.dump(data, f, indent=2, default=str)
         return path
-
+ 
     def _write_csv(self, data: List[Dict[str, Any]], path: str) -> str:
         """Write a list of dicts to a CSV file. Return the path written."""
         if not data:
@@ -255,7 +256,7 @@
             for row in data:
                 writer.writerow({k: _csv_safe(v) for k, v in row.items()})
         return path
-
+ 
     def write(self, data: Dict[str, Any], output_dir: str, fmt: str) -> Dict[str, List[str]]:
         """Write data to output_dir in the requested format(s).
 
@@ -272,7 +273,7 @@
             for key, items in data.items():
                 path = os.path.join(output_dir, f"{key}.csv")
                 written["csv"].append(self._write_csv(items, path))
-
+ 
         return written
 
 
@@ -283,7 +284,7 @@
 def _csv_safe(value: Any) -> str:
     """Convert a value to a string safe for CSV writing."""
     if value is None:
-        return ""
+        return "None"
     if isinstance(value, bool):
         return "true" if value else "false"
     if isinstance(value, (list, dict)):
@@ -296,7 +297,7 @@
 # ---------------------------------------------------------------------------
 
 def _positive_int(value: str) -> int:
-    """Validate a positive integer argument."""
+    """Validate a non-negative integer argument."""
     try:
         ivalue = int(value)
     except ValueError as exc:
@@ -305,7 +306,7 @@
         raise argparse.ArgumentTypeError(f"Count must be non-negative, got {value}")
     return ivalue
 
-
+ 
 def build_parser() -> argparse.ArgumentParser:
     """Build and return the argument parser."""
     parser = argparse.ArgumentParser(
@@ -316,7 +317,7 @@
         "--seed",
         type=int,
         default=42,
-        help="Random seed for reproducible output (default: 42)",
+        help="Random seed for reproducible output (default: 42)"
     )
     parser.add_argument(
         "-o", "--output",
@@ -328,7 +329,7 @@
         "--format",
         choices=["json", "csv", "both"],
         default="json",
-        help="Output format (default: json)",
+        help="Output format (default: json)"
     )
     parser.add_argument(
         "--market-data-count",
@@ -356,20 +357,20 @@
         default=10,
         help="Number of users to generate (default: 10)",
     )
-    # Legacy flags – kept for backward compatibility but ignored
+    # Legacy flags – kept for backward compatibility but ignored.
     parser.add_argument(
         "--json",
         action="store_true",
         default=False,
-        help=argparse.SUPPRESS,
+        help=argparse.SUPPRESS
     )
     parser.add_argument(
         "--csv",
         action="store_true",
         default=False,
-        help=argparse.SUPPRESS,
+        help=argparse.SUPPRESS
     )
     return parser
 
@@ -