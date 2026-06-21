 ```diff
--- a/tools/data_generator.py
+++ b/tools/data_generator.py
@@ -1,4 +1,5 @@
 #!/usr/bin/env python3
+
 """
 Legacy test data generator for development and testing environments.
 Generates realistic-looking market data, orders, trades, and user data
@@ -19,6 +20,7 @@
 import csv
 import json
 import math
+import functools
 import os
 import random
 import sys
@@ -96,7 +98,7 @@
 DOMAINS = ["example.com", "test.org", "demo.net", "sample.io", "mock.dev",
            "fictitious.co", "imaginary.app", "pretend.tech", "dummy.biz",
            "simulated.com", "testmail.com", "inbox.test"]
 
-de
+
 # ---------------------------------------------------------------------------
 # RNG HELPER
 # ---------------------------------------------------------------------------
@@ -105,7 +106,7 @@
 class SeededRandom:
     """Wrapper around random.Random for deterministic generation."""
 
-    def __init__(self, seed: Optional[int] = None):
+    def __init__(self, seed=None):
         self.rng = random.Random(seed)
 
     def random(self):
@@ -129,7 +130,7 @@ def choice(self, seq):
     def sample(self, population, k):
         return self.rng.sample(population, k)
 
-    def gauss(self, mu: float = 0.0, sigma: float = 1.0):
+    def gauss(self, mu=0.0, sigma=1.0):
         return self.rng.gauss(mu, sigma)
 
 
@@ -138,7 +139,7 @@ def gauss(self, mu: float = 0.0, sigma: float = 1.0):
 # ---------------------------------------------------------------------------
 
 def generate_instruments(rng, count=None):
-    """Return a list of instrument dicts, optionally limited to *count*."""
+    """Return a list of instrument dicts, optionally limited to count."""
     if count is None or count >= len(INSTRUMENTS):
         return [dict(i) for i in INSTRUMENTS]
     return [dict(i) for i in INSTRUMENTS[:count]]
@@ -148,7 +149,7 @@ def generate_market_data(rng, instruments, count=100):
     """Generate synthetic market data (price / volume snapshots)."""
     data = []
     for _ in range(count):
-        instrument = rng.choice(instruments)
+        instrument = dict(rng.choice(instruments))
         base_price = instrument["price"]
         # Random walk around base price
         price = base_price * (1 + rng.gauss(0, instrument["vol"] / 100))
@@ -169,7 +170,7 @@ def generate_orders(rng, instruments, count=50):
     """Generate synthetic orders."""
     orders = []
     for _ in range(count):
-        instrument = rng.choice(instruments)
+        instrument = dict(rng.choice(instruments))
         side = rng.choice(ORDER_SIDES)
         order_type = rng.choice(ORDER_TYPES)
         status = rng.choice(ORDER_STATUSES)
@@ -196,7 +197,7 @@ def generate_trades(rng, instruments, count=50):
     """Generate synthetic trades."""
     trades = []
     for _ in range(count):
-        instrument = rng.choice(instruments)
+        instrument = dict(rng.choice(instruments))
         side = rng.choice(ORDER_SIDES)
         base_price = instrument["price"]
         price = base_price * (1 + rng.gauss(0, instrument["vol"] / 200))
@@ -219,7 +220,7 @@ def generate_trades(rng, instruments, count=50):
 def generate_users(rng, count=20):
     """Generate synthetic user records."""
     users = []
-    for i in range(count):
+    for _ in range(count):
         first = rng.choice(FIRST_NAMES)
         last = rng.choice(LAST_NAMES)
         username = f"{first.lower()}.{last.lower()}{rng.randint(1, 999)}"
@@ -243,7 +244,7 @@ def generate_users(rng, count=20):
 def write_json(data, filepath):
     """Write *data* to *filepath* as JSON."""
     os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
-    with open(filepath, "w", encoding="utf-8") as f:
+    with open(filepath, "w", encoding="utf-8") as f:  # noqa: P201
         json.dump(data, f, indent=2, default=str)
     return filepath
 
@@ -251,7 +252,7 @@ def write_json(data, filepath):
 def write_csv(data, filepath):
     """Write *data* to *filepath* as CSV (flattened)."""
     os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
-    with open(filepath, "w", newline="", encoding="utf-8") as f:
+    with open(filepath, "w", newline="", encoding="utf-8") as f:  # noqa: P201
         if not data:
             return filepath
         writer = csv.DictWriter(f, fieldnames=data[0].keys())
@@ -264,7 +265,7 @@ def write_csv(data, filepath):
 # ---------------------------------------------------------------------------
 
 def parse_args(argv=None):
-    parser = argparse.ArgumentParser(description="Generate synthetic market data.")
+    parser = argparse.ArgumentParser(description="Generate synthetic market data.")
     parser.add_argument(
         "--seed",
         type=int,
@@ -275,6 +276,7 @@ def parse_args(argv=None):
         "--output-dir",
         "-o",
         default="data",
+        dest="output_dir",
         help="Directory to write generated files (default: data)",
     )
     parser.add_argument(
@@ -282,6 +284,7 @@ def parse_args(argv=None):
         type=int,
         default=100,
         metavar="N",
+        dest="market_count",
         help="Number of market data points to generate (default: 100)",
     )
     parser.add_argument(
@@ -289,6 +292,7 @@ def parse_args(argv=None):
         type=int,
         default=50,
         metavar="N",
+        dest="order_count",
         help="Number of orders to generate (default: 50)",
     )
     parser.add_argument(
@@ -296,6 +300,7 @@ def parse_args(argv=None):
         type=int,
         default=50,
         metavar="N",
+        dest="trade_count",
         help="Number of trades to generate (default: 50)",
     )
     parser.add_argument(
@@ -303,6 +308,7 @@ def parse_args(argv=None):
         type=int,
         default=20,
         metavar="N",
+        dest="user_count",
         help="Number of users to generate (default: 20)",
     )
     parser.add_argument(
@@ -310,6 +316,7 @@ def parse_args(argv=None):
         choices=["json", "csv", "both"],
         default="