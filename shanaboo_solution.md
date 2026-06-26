 ```diff
--- a/tools/health_check.py
+++ b/tools/health_check.py
@@ -10,6 +10,7 @@
 import json
 import os
 import socket
+import platform
 import ssl
 import subprocess
 import sys
@@ -17,6 +18,7 @@
 from datetime import datetime
 from typing import Any, Dict, List, Optional, Tuple
 
+
 # ---------------------------------------------------------------------------
 # CONSTANTS
 # ---------------------------------------------------------------------------
@@ -108,6 +110,9 @@
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system memory usage.
+
+    On Linux, reads /proc/meminfo for detailed memory statistics.
+    On other platforms, uses psutil if available or falls back to generic checks.
     """
     try:
         with open("/proc/meminfo", "r") as f:
@@ -134,6 +139,50 @@
             "percent": percent,
             "detail": detail,
         }
+    except FileNotFoundError:
+        # Fallback for non-Linux systems
+        try:
+            # Try psutil first (commonly available)
+            import psutil
+            mem = psutil.virtual_memory()
+            percent = mem.percent
+            total_mb = mem.total / (1024 * 1024)
+            available_mb = mem.available / (1024 * 1024)
+            used_mb = total_mb - available_mb
+
+            if percent >= MEMORY_THRESHOLD_CRITICAL:
+                status = "CRITICAL"
+            elif percent >= MEMORY_THRESHOLD_WARNING:
+                status = "WARNING"
+            else:
+                status = "OK"
+
+            detail = f"Memory usage: {percent:.1f}% ({used_mb:.0f}MB / {total_mb:.0f}MB)"
+            return status, detail, {
+                "total_mb": total_mb,
+                "used_mb": used_mb,
+                "percent": percent,
+                "detail": detail,
+            }
+        except ImportError:
+            # Final fallback using os and sys info
+            try:
+                # Try to get memory info using platform-specific commands
+                if platform.system() == "Darwin":  # macOS
+                    result = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5)
+                    # Parse vm_stat output for basic memory info
+                    status = "WARNING"
+                    detail = "Memory check on macOS without psutil: install psutil for accurate readings"
+                else:
+                    status = "WARNING"
+                    detail = "Memory check unavailable: /proc/meminfo not found and psutil not installed"
+
+                return status, detail, {
+                    "detail": detail,
+                }
+            except Exception as e:
+                status = "WARNING"
+                detail = f"Memory check fallback failed: {e}"
+                return status, detail, {"detail": detail}
     except Exception as e:
         return "WARNING", f"Could not read memory info: {e}", {"detail": str(e)}
 
@@ -141,6 +190,9 @@
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system load average.
+
+    On Linux, reads /proc/loadavg for detailed load statistics.
+    On other platforms, falls back to os.getloadavg() or platform-specific methods.
     """
     try:
         with open("/proc/loadavg", "r") as f:
@@ -157,6 +209,32 @@
             "load15": load15,
             "detail": detail,
         }
+    except FileNotFoundError:
+        # Fallback for non-Linux systems
+        try:
+            # Use os.getloadavg() which works on Unix-like systems including macOS
+            load1, load5, load15 = os.getloadavg()
+
+            # Try to get CPU count for normalization
+            try:
+                cpu_count = os.cpu_count() or 1
+            except Exception:
+                cpu_count = 1
+
+            # Normalize load by CPU count for threshold comparison
+            normalized_load = load1 / cpu_count
+
+            if normalized_load >= 4.0:
+                status = "CRITICAL"
+            elif normalized_load >= 2.0:
+                status = "WARNING"
+            else:
+                status = "OK"
+
+            detail = f"Load average: {load1:.2f} {load5:.2f} {load15:.2f} ({cpu_count} CPUs)"
+            return status, detail, {"load1": load1, "load5": load5, "load15": load15, "cpus": cpu_count, "detail": detail}
+        except (AttributeError, OSError):
+            # os.getloadavg() not available (e.g., Windows without Unix compatibility)
+            status = "WARNING"
+            detail = "Load average check unavailable: /proc/loadavg not found and os.getloadavg() not supported"
+            return status, detail, {"detail": detail}
     except Exception as e:
         return "WARNING", f"Could not read load average: {e}", {"detail": str(e)}
 
@@ -164,6 +242,9 @@
 def check_disk_space(path: str = "/") -> Tuple[str, str, Dict[str, Any]]:
     """
     Check disk space usage for the given path.
+
+    Uses shutil.disk_usage for cross-platform compatibility.
+    Falls back to df command on Unix-like systems if needed.
     """
     try:
         total, used, free = shutil.disk_usage(path)
@@ -184,6 +265,31 @@
             "free_gb": free_gb,
             "detail": detail,
         }
+    except Exception:
+        # Fallback using df command for Unix-like systems
+        try:
+            result = subprocess.run(["df", "-k", path], capture_output=True, text=True, timeout=5)
+            lines = result.stdout.strip().split("\n")
+            if len(lines) >= 2:
+                # Parse df output: Filesystem 1K-blocks Used Available Use% Mounted on
+                parts = lines[1].split()
+                total_kb = int(parts[1])
+                used_kb = int(parts[2])
+                total_gb = total_kb / (1024 * 1024)
+                used_gb = used_kb / (1024 * 1024)
+                percent = (used_kb / total_kb) * 100
+
+                if percent >= DISK_THRESHOLD_CRITICAL:
+                    status = "CRITICAL"
+                elif percent >= DISK_THRESHOLD_WARNING:
+                    status = "WARNING"
+                else:
+                    status = "OK"
+
+                detail = f"Disk usage: {percent:.1f}% ({used_gb:.1f}GB / {total_gb:.1f}GB)"
+                return status, detail, {"total_gb": total_gb, "used_gb":