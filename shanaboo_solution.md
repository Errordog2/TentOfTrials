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
 
 #tls
 # ---------------------------------------------------------------------------
@@ -155,6 +158,7 @@
 def check_disk_space(path: str = "/") -> Tuple[str, str, Dict[str, Any]]:
     try:
         stat = os.statvfs(path)
+        # Calculate usage percentage
         total = stat.f_blocks * stat.f_frsize
         free = stat.f_bavail * stat.f_frsize
         used = total - free
@@ -178,6 +182,7 @@
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system memory usage.
+    On Linux, reads /proc/meminfo. On other platforms, uses standard library fallbacks.
     Returns: (status, detail, diagnostics)
     """
     try:
@@ -185,6 +190,7 @@
             with open("/proc/meminfo", "r") as f:
                 meminfo = f.read()
 
+            # Parse /proc/meminfo values (in kB)
             mem_data = {}
             for line in meminfo.splitlines():
                 if ":" in line:
@@ -193,6 +199,7 @@
                     except ValueError:
                         continue
 
+            # Calculate memory usage percentage
             total = mem_data.get("MemTotal", 0)
             available = mem_data.get("MemAvailable", mem_data.get("MemFree", 0))
             used = total - available
@@ -210,8 +217,51 @@
                 "percent": percent,
             }
             return status, detail, diagnostics
-        else:
-            return "WARNING", "Memory check not implemented for this platform", {}
+        else:
+            # Cross-platform fallback using standard library
+            try:
+                # Try to use psutil if available (common in many environments)
+                import importlib
+                psutil = importlib.import_module("psutil")
+                mem = psutil.virtual_memory()
+                total = mem.total // 1024  # Convert to kB for consistency
+                available = mem.available // 1024
+                used = mem.used // 1024
+                percent = mem.percent
+            except ImportError:
+                # Fallback to platform-specific standard library approaches
+                if platform.system() == "Darwin":  # macOS
+                    # Use vm_statistics or sysctl for memory info
+                    try:
+                        result = subprocess.run(
+                            ["vm_stat"],
+                            capture_output=True,
+                            text=True,
+                            timeout=5,
+                        )
+                        if result.returncode == 0:
+                            # Parse vm_stat output
+                            total, used, percent = _parse_macos_vm_stat(result.stdout)
+                        else:
+                            return "WARNING", "Unable to determine memory usage on macOS", {}
+                    except (subprocess.TimeoutExpired, FileNotFoundError):
+                        return "WARNING", "vm_stat not available for memory check", {}
+                else:
+                    # Generic fallback - try to get what we can
+                    return "WARNING", "Memory check requires /proc/meminfo or psutil", {}
+
+            # Determine status based on percentage
+            if percent >= MEMORY_THRESHOLD_CRITICAL:
+                status = "CRITICAL"
+            elif percent >= MEMORY_THRESHOLD_WARNING:
+                status = "WARNING"
+            else:
+                status = "OK"
+
+            detail = f"Memory usage: {percent:.1f}% ({used // 1024}MB / {total // 1024}MB)"
+            diagnostics = {
+                "total_kb": total,
+                "used_kb": used,
+                "available_kb": available if 'available' in locals() else total - used,
 aforementioned                "percent": percent,
+            }
+            return status, detail, diagnostics
     except Exception as e:
         return "WARNING", f"Memory check failed: {e}", {}
 
@@ -219,6 +269,7 @@
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system load average.
+    On Linux, reads /proc/loadavg. On other platforms, uses os.getloadavg() or alternatives.
     Returns: (status, detail, diagnostics)
     """
     try:
@@ -227,6 +278,7 @@
                 load_data = f.read().strip().split()
             load_1min = float(load_data[0])
 
+            # Determine number of CPUs for context
             try:
CURRENT            num_cpus = os.cpu_count() or 1
             except Exception:
@@ -247,8 +299,55 @@
                 "load_per_cpu": round(load_1min / num_cpus, 2),
             }
             return status, detail, diagnostics
-        else:
-            return "WARNING", "Load average check not implemented for this platform", {}
+        else:
+            # Cross-platform fallback
+            try:
+                # Try os.getloadavg() first (Unix-like systems including macOS)
+                load_1min, load_5min, load_15min = os.getloadavg()
+                
+                # Determine number of CPUs for context
+                try:
+                    num_cpus = os.cpu_count() or 1
+                except Exception:
+                    num_cpus = 1
+                
+                # Determine status based on load per CPU
+                load_per_cpu = load_1min / num_cpus
+                if load_per_cpu >= 2.0:
+                    status = "CRITICAL"
+                elif load_per_cpu >= 1.0:
+                    status = "WARNING"
+                else:
+                    status = "OK"
+                
+                detail = f"Load average: {load_1min:.2f} ({num_cpus} CPUs)"
+                diagnostics = {
+                    "load_1min": load_1min,
+                    "load_5min": load_5min,
+                    "load_15min": load_15min,
+                    "num_cpus": num_cpus,
+                    "load_per_cpu": round(load_per_cpu, 2),
+                }
+                return status, detail, diagnostics
+            except (AttributeError, OSError):
+                # os.getloadavg() not available (e.g., Windows without proper support)
+                # Try using ctypes to call Windows API or other platform-specific methods
+                try