 ```diff
--- a/tools/health_check.py
+++ b/tools/health_check.py
@@ -14,6 +14,7 @@
 import argparse
 import json
 import os
+import platform
 import socket
 import ssl
 import subprocess
@@ -21,6 +22,7 @@
 import time
 from datetime import datetime
 from typing import Any, Dict, List, Optional, Tuple
+import unittest
 
 # ---------------------------------------------------------------------------
 # CONSTANTS
@@ -148,6 +150,7 @@
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system memory usage by reading /proc/meminfo on Linux.
+    Falls back to psutil or os-based methods on non-Linux platforms.
     Returns (status, detail, diagnostics)
     """
     try:
@@ -186,9 +189,63 @@
             "swap_total_kb": swap_total,
             "swap_used_kb": swap_used,
         }
+        return status, detail, diagnostics
     except FileNotFoundError:
-        return "WARNING", "/proc/meminfo not available", {}
+        pass
     except Exception as e:
-        return "WARNING", f"Error reading memory info: {e}", {}
+        return "WARNING", f"Error reading /proc/meminfo: {e}", {}
+
+    # Fallback for non-Linux platforms
+    try:
+        # Try psutil first (commonly available)
+        import psutil
+        mem = psutil.virtual_memory()
+        swap = psutil.swap_memory()
+
+        mem_percent = mem.percent
+        mem_used = mem.used // 102  # Convert to KB approximation
+        mem_total = mem.total // 1024  # Convert to KB
+
+        swap_total = swap.total // 1024
+        swap_used = swap.used // 1024
+
+        if mem_percent >= MEMORY_THRESHOLD_CRITICAL:
+            status = "CRITICAL"
+        elif mem_percent >= MEMORY_THRESHOLD_WARNING:
+            status = "WARNING"
+        else:
+            status = "OK"
+
+        detail = f"Memory {mem_percent:.1f}% used ({mem_used // 1024}MB / {mem_total // 1024}MB)"
+
+        diagnostics = {
+            "mem_percent": mem_percent,
+            "mem_used_kb": mem_used,
+            "mem_total_kb": mem_total,
+            "swap_total_kb": swap_total,
+            "swap_used_kb": swap_used,
+            "source": "psutil",
+        }
+        return status, detail, diagnostics
+    except ImportError:
+        pass
+
+    # Final fallback using os-level information
+    try:
+        # Use sysctl on macOS/BSD
+        result = subprocess.run(
+            ["sysctl", "-n", "hw.memsize"],
+            capture_output=True,
+            text=True,
+            timeout=5,
+        )
+        if result.returncode == 0:
+            total_bytes = int(result.stdout.strip())
+            total_kb = total_bytes // 1024
+            # We can't easily get used memory without more complex tools
+            return "WARNING", f"Memory check limited on {platform.system()}: total {total_kb // 1024}MB (install psutil for full stats)", {
+                "mem_total_kb": total_kb,
+                "source": "sysctl",
+            }
+    except Exception:
+        pass
+
+    return "WARNING", f"Memory check unavailable on {platform.system()} (install psutil for full support)", {}
 
 
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
@@ -196,7 +253,7 @@
     Check system load average.
     Returns (status, detail, diagnostics)
     """
-    # Try /proc/loadavg first (Linux)
+    # Try /proc/loadavg first (Linux native)
     try:
         with open("/proc/loadavg", "r") as f:
             load_data = f.read().strip().split()
@@ -213,9 +270,34 @@
             "load_15m": load_15m,
         }
         return status, detail, diagnostics
-    except FileNotFoundError:
-        return "WARNING", "/proc/loadavg not available", {}
     except Exception as e:
+        # If /proc/loadavg fails for any reason, try fallback
+        pass
+
+    # Fallback to os.getloadavg() (POSIX standard, works on macOS, Linux, etc.)
+    try:
+        load_1m, load_5m, load_15m = os.getloadavg()
+
+        # Determine status based on 1-minute load
+        # Use CPU count as reference if available
+        try:
+            cpu_count = os.cpu_count() or 1
+            load_ratio = load_1m / cpu_count
+        except Exception:
+            load_ratio = load_1m
+
+        if load_ratio >= 2.0:
+            status = "CRITICAL"
+        elif load_ratio >= 1.0:
+            status = "WARNING"
+        else:
+            status = "OK"
+
+        detail = f"Load average: {load_1m:.2f} {load_5m:.2f} {load_15m:.2f} (fallback)"
+
+        diagnostics = {
+            "load_1m": load_1m,
+            "load_5m": load_5m,
+            "load_15m": load_15m,
+            "source": "os.getloadavg",
+        }
+        return status, detail, diagnostics
+    except (AttributeError, OSError) as e:
         return "WARNING", f"Load average check unavailable: {e}", {}
 
 
@@ -223,6 +305,7 @@
     """
     Check disk usage for the root filesystem.
     """
+    # Linux path
     try:
         stat = os.statvfs("/")
         total = stat.f_blocks * stat.f_frsize
@@ -240,6 +323,7 @@
             "disk_used_percent": percent,
         }
         return status, detail, diagnostics
+    # Fallback for Windows or other platforms
     except Exception as e:
         return "WARNING", f"Disk check error: {e}", {}
 
@@ -247,6 +331,7 @@
 # MAIN
 # ---------------------------------------------------------------------------
 
+
 def run_all_checks(args) -> Dict[str, Any]:
     results = {
         "timestamp": datetime.utcnow().isoformat() + "Z",
@@ -332,6 +417,7 @@
         print(f"  {check_name:20s} {status:8s} {detail}")
     print(f"\nOverall: {overall_status}")
 
+
 def main():
     parser = argparse.ArgumentParser(description="Tent of Trials Health Check")
     parser.add_argument("--service", help="Check specific service")
@@ -358,5 +444