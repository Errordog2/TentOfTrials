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
@@ -156,6 +159,10 @@
 
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check memory usage. On Linux, reads /proc/meminfo.
+    On other platforms, uses standard library fallbacks.
+    """
     try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
@@ -177,12 +184,56 @@
             status = "WARNING"
 
         return status, detail, {"percent": percent, "available_mb": available_mb}
-    except FileNotFoundError:
-        return "WARNING", "/proc/meminfo not available", {}
+    except (FileNotFoundError, OSError):
+        # Fallback for non-Linux systems using standard library
+        try:
+            # Try psutil first if available
+            try:
+                import psutil
+                mem = psutil.virtual_memory()
+                percent = mem.percent
+                available_mb = mem.available / (1024 * 1024)
+                detail = f"Memory usage: {percent:.1f}% ({available_mb:.0f}MB available)"
+                if percent >= MEMORY_THRESHOLD_CRITICAL:
+                    status = "CRITICAL"
+                elif percent >= MEMORY_THRESHOLD_WARNING:
+                    status = "WARNING"
+                else:
+                    status = "OK"
+                return status, detail, {"percent": percent, "available_mb": available_mb}
+            except ImportError:
+                pass
+
+            # Fallback to sys.getsizeof and resource module
+            import resource
+            import sys
+
+            # Get memory info using resource module (works on Unix-like systems)
+            try:
+                # ru_maxrss is in KB on Linux, bytes on macOS
+                rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
+                if platform.system() == "Linux":
+                    rss_mb = rss / 1024
+                else:
+                    rss_mb = rss / (1024 * 1024)
+                
+                # Try to get total system memory
+                total_mb = _get_total_memory_mb()
+                if total_mb and total_mb > 0:
+                    percent = (rss_mb / total_mb) * 100
+                else:
+                    percent = 0
+                
+                detail = f"Process memory: {rss_mb:.1f}MB (estimated {percent:.1f}%)"
+                if percent >= MEMORY_THRESHOLD_CRITICAL:
+                    status = "CRITICAL"
+                elif percent >= MEMORY_THRESHOLD_WARNING:
+                    status = "WARNING"
+                else:
+                    status = "OK"
+                return status, detail, {"percent": percent, "available_mb": max(0, total_mb - rss_mb) if total_mb else 0}
+            except Exception:
+                pass
+        except Exception:
+            pass
+        return "WARNING", "Memory information unavailable on this platform", {}
     except Exception as e:
         return "CRITICAL", str(e), {}
 
 
@@ -190,6 +241,50 @@
     return "OK", f"Disk usage: {percent:.1f}%", {"percent": percent}
 
 
+def _get_total_memory_mb() -> Optional[float]:
+    """Get total system memory in MB using platform-specific methods."""
+    system = platform.system()
+    
+    if system == "Darwin":  # macOS
+        try:
+            result = subprocess.run(["sysctl", "-n", "hw.memsize"], 
+                                    capture_output=True, text=True, timeout=5)
+            if result.returncode == 0:
+                return int(result.stdout.strip()) / (1024 * 1024)
+        except Exception:
+            pass
+    elif system == "Windows":
+        try:
+            kernel32 = ctypes.windll.kernel32
+            class MEMORYSTATUSEX(ctypes.Structure):
+                _fields_ = [
+                    ("dwLength", ctypes.c_ulong),
+                    ("dwMemoryLoad", ctypes.c_ulong),
+                    ("ullTotalPhys", ctypes.c_ulonglong),
+                    ("ullAvailPhys", ctypes.c_ulonglong),
+                    ("ullTotalPageFile", ctypes.c_ulonglong),
+                    ("ullAvailPageFile", ctypes.c_ulonglong),
+                    ("ullTotalVirtual", ctypes.c_ulonglong),
+                    ("ullAvailVirtual", ctypes.c_ulonglong),
+                    ("sullAvailExtended Pendular", ctypes.c_ulonglong),
+                ]
+            stat = MEMORYSTATUSEX()
+            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
+            if kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
+                return stat.ullTotalPhys / (1024 * 1024)
+        except Exception:
+            pass
+    elif system == "Linux":
+        try:
+            with open("/proc/meminfo", "r") as f:
+                for line in f:
+                    if line.startswith("MemTotal:"):
+                        kb = int(line.split()[1])
+                        return kb / 1024
+        except Exception:
+            pass
+    
+    return None
+
+
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     try:
         with open("/proc/loadavg", "r") as f:
@@ -202,8 +297,32 @@
             status = "WARNING"
 
         return status, detail, {"load_1min": load_1min, "load_5min": load_5min, "load_15min": load_15min}
-    except FileNotFoundError:
-        return "WARNING", "/proc/loadavg not available", {}
+    except (FileNotFoundError, OSError):
+        # Fallback to os.getloadavg() for Unix-like systems
+        try:
+            load_1min, load_5min, load_15min = os.getloadavg()
+            detail = f"Load average: {load_1min:.2f} {load_5min:.2f} {load_15min:.2f}"
+            if load_1min >= 4.0:
+                status = "CRITICAL"
+            elif load_1min >=