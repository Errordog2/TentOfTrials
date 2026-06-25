 ```diff
--- a/tools/health_check.py
+++ b/tools/health_check.py
@@ -12,6 +12,7 @@
 import argparse
 import json
 import os
+import platform
 import socket
 import ssl
 import subprocess
@@ -19,6 +20,7 @@
 import time
 from datetime import datetime
 from typing import Any, Dict, List, Optional, Tuple
+import ctypes
 
 # ---------------------------------------------------------------------------
 # CONSTANTS
@@ -110,6 +112,7 @@
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system memory usage.
+    On Linux, reads /proc/meminfo. On other platforms, uses standard library fallbacks.
 
     Returns:
         Tuple of (status, detail, diagnostics)
@@ -117,6 +120,7 @@
     try:
         if os.path.exists("/proc/meminfo"):
             with open("/proc/meminfo", "r") as f:
+                # Linux path: parse /proc/meminfo
                 meminfo = f.read()
 
             mem_total = 0
@@ -149,6 +153,55 @@
                     "available_mb": available_mb,
                 },
             )
+        else:
+            # Non-Linux fallback using standard library
+            total_mb = 0
+            available_mb = 0
+            percent_used = 0.0
+
+            # Try to get memory info using platform-specific approaches
+            try:
+                if platform.system() == "Darwin":  # macOS
+                    # Use vm_stat and sysctl for macOS
+                    sysctl_result = subprocess.run(
+                        ["sysctl", "-n", "hw.memsize"],
+                        capture_output=True, text=True, timeout=5
+                    )
+                    if sysctl_result.returncode == 0:
+                        total_bytes = int(sysctl_result.stdout.strip())
+                        total_mb = total_bytes / (1024 * 1024)
+
+                    vm_stat = subprocess.run(
+                        ["vm_stat"],
+                        capture_output=True, text=True, timeout=5
+                    )
+                    if vm_stat.returncode == 0:
+                        # Parse vm_stat output for page info
+                        pages_free = 0
+                        pages_inactive = 0
+                        for line in vm_stat.stdout.splitlines():
+                            if "Pages free:" in line:
+                                pages_free = int(line.split(":")[1].strip().replace(".", ""))
+                            elif "Pages inactive:" in line:
+                                pages_inactive = int(line.split(":")[1].strip().replace(".", ""))
+                        # macOS page size is typically 4096 bytes
+                        page_size = 4096
+                        free_mb = ((pages_free + pages_inactive) * page_size) / (1024 * 1024)
+                        available_mb = free_mb
+                        if total_mb > 0:
+                            percent_used = ((total_mb - available_mb) / total_mb) * 100
+                else:
+                    # Generic fallback: try psutil if available, otherwise use a basic estimate
+                    try:
+                        import psutil
+                        mem = psutil.virtual_memory()
+                        total_mb = mem.total / (1024 * 1024)
+                        available_mb = mem.available / (1024 * 1024)
+                        percent_used = mem.percent
+                    except ImportError:
+                        # Last resort: return warning with no detailed metrics
+                        return (
+                            "WARNING",
+                            "Memory check: /proc/meminfo not available and psutil not installed; "
+                            "install psutil for cross-platform memory monitoring",
+                            {"total_mb": 0, "available_mb": 0, "percent_used": 0},
+                        )
+            except Exception as e:
+                return "WARNING", f"Memory check fallback failed: {e}", {"error": str(e)}
 
         # Determine status based on thresholds
         if percent_used >= MEMORY_THRESHOLD_CRITICAL:
@@ -162,7 +215,7 @@
             detail = f"Memory usage is normal ({percent_used:.1f}%)"
 
         return status, detail, {"total_mb": total_mb, "available_mb": available_mb, "percent_used": percent_used}
-    except Exception as e:
+    except Exception:
         # If we can't read memory info, return warning (not critical)
         return "WARNING", "Unable to determine memory usage", {"error": "Failed to read memory information"}
 
@@ -170,6 +223,7 @@
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system load average.
+    On Linux, reads /proc/loadavg. On other platforms, uses os.getloadavg() fallback.
 
     Returns:
         Tuple of (status, detail, diagnostics)
@@ -177,6 +231,7 @@
     try:
         if os.path.exists("/proc/loadavg"):
             with open("/proc/loadavg", "r") as f:
+                # Linux path: parse /proc/loadavg
                 load_data = f.read().strip().split()
 
             load_1min = float(load_data[0])
@@ -184,6 +239,18 @@
             load_15min = float(load_data[2])
 
             detail = f"Load average: {load_1min:.2f} {load_5min:.2f} {load_15min:.2f}"
+        else:
+            # Non-Linux fallback using os.getloadavg()
+            try:
+                load_1min, load_5min, load_15min = os.getloadavg()
+                detail = f"Load average: {load_1min:.2f} {load_5min:.2f} {load_15min:.2f}"
+            except OSError as e:
+                # os.getloadavg() not available on this platform
+                return (
+                    "WARNING",
+                    f"Load average check unavailable: {e}",
+                    {"error": str(e)},
+                )
+
 
         # Determine status based on load (simplified: compare to CPU count)
         try:
@@ -203,7 +270,7 @@
             detail = f"Load average is high ({load_1min:.2f} on {cpu_count} CPUs)"
 
         return status, detail, {"load_1min": load_1min, "load_5min": load_5min, "load_15min": load_15min}
-    except Exception as e:
+    except Exception:
         # If we can't read load info, return warning (not critical)
         return "WARNING", "Unable to determine load average", {"error": "Failed to read load information"}
 
@@ -211,6 +278,7 @@
 def check_disk_space() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check disk space usage.
+    Uses shutil.disk_usage for cross-platform compatibility.
 
     Returns:
         Tuple of (