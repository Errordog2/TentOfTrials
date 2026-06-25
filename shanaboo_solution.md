 ```diff
--- a/tools/health_check.py
+++ b/tools/health_check.py
@@ -10,6 +10,7 @@
   - The monitoring system (periodic health checks)
   - The on-call engineer (manual troubleshooting)
 
+
 The health check performs the following checks:
   1. Service availability (HTTP health endpoints)
   2. Database connectivity (connection test)
@@ -30,6 +31,7 @@
 import argparse
 import json
 import os
+import platform
 import socket
 import ssl
 import subprocess
@@ -37,6 +39,7 @@
 import time
 from datetime import datetime
 from typing import Any, Dict, List, Optional, Tuple
+import ctypes
 
 # ---------------------------------------------------------------------------
 # CONSTANTS
@@ -148,6 +150,9 @@
 
 
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check system load average. Uses /proc/loadavg on Linux, falls back to os.getloadavg() on other platforms.
+    """
     try:
         with open("/proc/loadavg", "r") as f:
             data = f.read().strip()
@@ -162,12 +167,50 @@
             "load_15m": load_15m,
             "load_1m": load_1m,
         }
-    except FileNotFoundError:
-        return "WARNING", "/proc/loadavg not available", {}
+    except (FileNotFoundError, OSError):
+        # Fallback for non-Linux systems
+        try:
+            load_1m, load_5m, load_15m = os.getloadavg()
+            # Determine number of CPUs for threshold calculation
+            cpu_count = os.cpu_count() or 1
+            threshold_warning = cpu_count * 0.7
+            threshold_critical = cpu_count * 1.0
+
+            if load_1m > threshold_critical:
+                status = "CRITICAL"
+            elif load_1m > threshold_warning:
+                status = "WARNING"
+            else:
+                status = "OK"
+
+            detail = f"Load average (1m/5m/15m): {load_1m:.2f}/{load_5m:.2f}/{load_15m:.2f} (fallback via os.getloadavg)"
+            return status, detail, {
+                "load_1m": load_1m,
+                "load_5m": load_5m,
+                "load_15m": load_15m,
+                "cpu_count": cpu_count,
+                "method": "os.getloadavg",
+            }
+        except (AttributeError, OSError):
+            # os.getloadavg() not available on this platform (e.g., Windows)
+            return "WARNING", "Load average not available on this platform", {"method": "unavailable"}
 
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check system memory usage. Uses /proc/meminfo on Linux, falls back to platform-specific methods on other systems.
+    """
+    if platform.system() == "Linux":
+        return _check_memory_linux()
+    else:
+        return _check_memory_fallback()
+
+
+def _check_memory_linux() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Linux-specific memory check using /proc/meminfo.
+    """
     try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
@@ -202,8 +245,111 @@
             "swap_total_kb": swap_total,
             "swap_free_kb": swap_free,
         }
-    except FileNotFoundError:
-        return "WARNING", "/proc/meminfo not available", {}
+    except (FileNotFoundError, OSError):
+        # /proc/meminfo not available, use fallback
+        return _check_memory_fallback()
+
+
+def _check_memory_fallback() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Cross-platform fallback for memory checking using standard library and ctypes.
+    """
+    try:
+        # Try using psutil if available (common but not stdlib)
+        import psutil
+        mem = psutil.virtual_memory()
+        total = mem.total // 1024  # Convert to KB
+        available = mem.available // 1024
+        used = total - available
+        percent = mem.percent
+
+        if percent > MEMORY_THRESHOLD_CRITICAL:
+            status = "CRITICAL"
+        elif percent > MEMORY_THRESHOLD_WARNING:
+            status = "WARNING"
+        else:
+            status = "OK"
+
+        detail = f"Memory: {used / 1024 / 1024:.1f}GB used / {total / 1024 / 1024:.1f}GB total ({percent:.1f}%) (psutil fallback)"
+        return status, detail, {
+            "total_kb": total,
+            "available_kb": available,
+            "used_kb": used,
+            "percent": percent,
+            "method": "psutil",
+        }
+    except ImportError:
+        pass
+
+    # Try platform-specific fallbacks
+    if platform.system() == "Darwin":  # macOS
+        try:
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
+                        # Remove trailing period and parse number
+                        val_str = value.strip().replace(".", "").replace(",", "")
+                        try:
+                            stats[key.strip()] = int(val_str)
+                        except ValueError:
+                            pass
+
+                # vm_stat reports in pages (typically 4096 bytes on macOS)
+                page_size = 4096
+                total = stats.get("Pages free", 0) + stats.get("Pages active", 0) + stats.get("Pages inactive", 0) + stats.get("Pages wired down", 0) + stats.get("Pages speculative", 0)
+                free = stats.get("Pages free", 0)
+                used = total - free
+                percent = (used / total * 100) if total > 0 else 0
+
+                if percent > MEMORY_THRESHOLD_CRITICAL:
+                    status = "CRITICAL"
+                elif percent > MEMORY_THRESHOLD_WARNING:
+                    status = "WARNING"
+                else:
+                    status = "OK"
+
+                total_kb = (total * page_size) // 1024
+                used_kb = (used * page_size) // 102