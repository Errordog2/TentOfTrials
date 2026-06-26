 ```diff
--- a/tools/health_check.py
+++ b/tools/health_check.py
@@ -10,6 +10,7 @@
 import argparse
 import json
 import os
+import platform
 import socket
 import ssl
 import subprocess
@@ -17,6 +18,7 @@
 import time
 from datetime import datetime
 from typing import Any, Dict, List, Optional, Tuple
+import unittest
 
 # ---------------------------------------------------------------------------
 # CONSTANTS
@@ -118,6 +120,9 @@
 MEMORY_THRESHOLD_WARNING = 80
 MEMORY_THRESHOLD_CRITICAL = 90
 
+# Platform detection
+IS_LINUX = platform.system() == "Linux"
+
 # ---------------------------------------------------------------------------
 # CHECK FUNCTIONS
 # ---------------------------------------------------------------------------
@@ -163,6 +168,7 @@
         return "CRITICAL", str(e), 0
 
 
+def check_certificate_expiry(host: str,
 def check_certificate_expiry(host: str, port: int, timeout: int = 5) -> Tuple[str, str, Optional[int]]:
     try:
         context = ssl.create_default_context()
@@ -194,8 +200,9 @@
         return "CRITICAL", str(e), None
 
 
-def check_memory_usage() -> Tuple[str, str, Optional[Dict[str, Any]]]:
-    try:
+def _check_memory_linux() -> Tuple[str, str, Optional[Dict[str, Any]]]:
+    """Linux-specific memory check using /proc/meminfo."""
+    try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
 
@@ -221,10 +228,76 @@
             "percent": percent,
         }
 
-        if percent >= MEMORY_THRESHOLD_CRITICAL:
-            return "CRITICAL", f"Memory usage {percent:.1f}%", data
-        elif percent >= MEMORY_THRESHOLD_WARNING:
-            return "WARNING", f"Memory usage {percent:.1f}%", data
+        return _memory_status_from_percent(percent, data)
+    except Exception as e:
+        return "WARNING", f"Failed to read /proc/meminfo: {e}", None
+
+
+def _check_memory_cross_platform() -> Tuple[str, str, Optional[Dict[str, Any]]]:
+    """Cross-platform memory check using psutil when available, or os-based fallbacks."""
+    try:
+        # Try psutil first (widely available, cross-platform)
+        import psutil
+        mem = psutil.virtual_memory()
+        percent = mem.percent
+        data: Dict[str, Any] = {
+            "total_kb": mem.total // 1024,
+            "available_kb": mem.available // 1024,
+            "percent": percent,
+        }
+        return _memory_status_from_percent(percent, data)
+    except ImportError:
+        pass
+
+    # Fallback: macOS vm_stat command
+    try:
+        if platform.system() == "Darwin":
+            result = subprocess.run(
+                ["vm_stat"],
+                capture_output=True,
+                text=True,
+                timeout=5,
+            )
+            if result.returncode == 0:
+                # Parse vm_stat output
+                lines = result.stdout.strip().split("\n")
+                stats = {}
+                for line in lines:
+                    if ":" in line:
+                        key, value = line.split(":", 1)
+                        # Remove 'Pages' prefix and extract number
+                        num_str = "".join(c for c in value if c.isdigit() or c == ".")
+                        if num_str:
+                            stats[key.strip()] = int(num_str)
+
+                # macOS page size is typically 4096 bytes
+                page_size = 4096
+                total = stats.get("Pages free", 0) + stats.get("Pages active", 0) + stats.get("Pages inactive", 0) + stats.get("Pages wired down", 0) + stats.get("Pages speculative", 0)
+                free = stats.get("Pages free", 0) + stats.get("Pages inactive", 0)
+
+                total_kb = (total * page_size) // 1024
+                available_kb = (free * page_size) // 1024
+
+                if total_kb > 0:
+                    percent = ((total_kb - available_kb) / total_kb) * 100
+                else:
+                    percent = 0
+
+                data: Dict[str, Any] = {
+                    "total_kb": total_kb,
+                    "available_kb": available_kb,
+                    "percent": percent,
+                }
+                return _memory_status_from_percent(percent, data)
+    except Exception:
+        pass
+
+    # Final fallback
+    return "WARNING", "Unable to determine memory usage on this platform", None
+
+
+def _memory_status_from_percent(percent: float, data: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any]]:
+    if percent >= MEMORY_THRESHOLD_CRITICAL:
+        return "CRITICAL", f"Memory usage {percent:.1f}%", data
+    elif percent >= MEMORY_THRESHOLD_WARNING:
+        return "WARNING", f"Memory usage {percent:.1f}%", data
+    else:
+        return "OK", f"Memory usage {percent:.1f}%", data
+
+
+def check_memory_usage() -> Tuple[str, str, Optional[Dict[str, Any]]]:
+    """Check memory usage with Linux /proc fallback for cross-platform support."""
+    if IS_LINUX:
+        return _check_memory_linux()
+    else:
+        return _check_memory_cross_platform()
+
+
+def _check_load_linux() -> Tuple[str, str, Optional[Dict[str, Any]]]:
+    """Linux-specific load check using /proc/loadavg."""
+    try:
+        with open("/proc/loadavg", "r") as f:
+            loadavg = f.read().strip().split()
+
+        one_min = float(loadavg[0])
+        five_min = float(loadavg[1])
+        fifteen_min = float(loadavg[2])
+
+        # Try to get CPU count for context
+        try:
+            cpu_count = os.cpu_count() or 1
+        except Exception:
+            cpu_count = 1
+
+        # Normalize load by CPU count for threshold comparison
+        normalized = one_min / cpu_count
+
+        data: Dict[str, Any] = {
+            "1min": one_min,
+            "5min": five_min,
+            "15min": fifteen_min,
+            "cpus": cpu_count,
+            "normalized": normalized,
+        }
+
+        if normalized >= 2.0:
+            return "CRITICAL", f"Load average {one_min:.2f} (normalized {normalized:.2f})", data
+        elif normalized >= 1.0:
+            return "WARNING", f"Load average {one_min:.2f} (normalized {