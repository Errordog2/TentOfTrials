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
@@ -143,6 +144,9 @@
 
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check memory usage. On Linux, reads /proc/meminfo. On other platforms, uses psutil or os-level fallbacks.
+    """
 ht
     try:
         with open("/proc/meminfo", "r") as f:
@@ -163,8 +167,55 @@
             detail = f"Memory usage is {usage_percent:.1f}% ({used_mb:.0f}MB / {total_mb:.0f}MB)"
 
         return status, detail, {"usage_percent": usage_percent, "used_mb": used_mb, "total_mb": total_mb}
-    except FileNotFoundError:
-        return "WARNING", "/proc/meminfo not available", {}
+    except (FileNotFoundError, OSError):
+        # Fallback for non-Linux systems
+        try:
+            # Try psutil first (commonly available)
+            import psutil
+            mem = psutil.virtual_memory()
+            usage_percent = mem.percent
+            used_mb = (mem.used) / (1024 * 1024)
+            total_mb = (mem.total) / (1024 * 1024)
+
+            if usage_percent >= MEMORY_THRESHOLD_CRITICAL:
+                status = "CRITICAL"
+            elif usage_percent >= MEMORY_THRESHOLD_WARNING:
+                status = "WARNING"
+            else:
+                status = "OK"
+
+            detail = f"Memory usage is {usage_percent:.1f}% ({used_mb:.0f}MB / {total_mb:.0f}MB)"
+            return status, detail, {"usage_percent": usage_percent, "used_mb": used_mb, "total_mb": total_mb}
+        except ImportError:
+            pass
+
+        # Fallback to sysctl on macOS/BSD
+        try:
+            if platform.system() == "Darwin":
+                result = subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=5)
+                if result.returncode == 0:
+                    total_bytes = int(result.stdout.strip())
+                    total_mb = total_bytes / (1024 * 1024)
+                    # Try to get used memory via vm_statistics (approximate)
+                    vm_result = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5)
+                    if vm_result.returncode == 0:
+                        # Parse vm_stat output for active + wired pages
+                        lines = vm_result.stdout.splitlines()
+                        page_size = 4096  # Default macOS page size
+                        active_pages = wired_pages = 0
+                        for line in lines:
+                            if "page size" in line.lower():
+                                page_size = int(line.split()[-2])
+                            elif "Pages active" in line:
+                                active_pages = int(line.split()[-1].rstrip("."))
+                            elif "Pages wired down" in line:
+                                wired_pages = int(line.split()[-1].rstrip("."))
+                        used_mb = ((active_pages + wired_pages) * page_size) / (1024 * 1024)
+                        usage_percent = (used_mb / total_mb) * 100
+                        detail = f"Memory usage is {usage_percent:.1f}% ({used_mb:.0f}MB / {total_mb:.0f}MB)"
+                        status = "CRITICAL" if usage_percent >= MEMORY_THRESHOLD_CRITICAL else ("WARNING" if usage_percent >= MEMORY_THRESHOLD_WARNING else "OK")
+                        return status, detail, {"usage_percent": usage_percent, "used_mb": used_mb, "total_mb": total_mb}
+        except Exception:
+            pass
+
+        return "WARNING", "Memory check: /proc/meminfo not available and no fallback succeeded", {}
     except Exception as e:
         return "CRITICAL", f"Memory check failed: {e}", {}
 
@@ -172,6 +223,9 @@
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check the system load average.
+
+    On Linux, reads /proc/loadavg. On other platforms, falls back to os.getloadavg()
+    or other standard-library mechanisms.
     """
     try:
         with open("/proc/loadavg", "r") as f:
@@ -188,8 +242,35 @@
                 status = "OK"
 
             return status, f"Load average (1m): {load_1m:.2f}", {"load_1m": load_1m}
-    except FileNotFoundError:
-        return "WARNING", "/proc/loadavg not available", {}
+    except (FileNotFoundError, OSError):
+        # Fallback for non-Linux systems
+        try:
+            load_1m, load_5m, load_15m = os.getloadavg()
+            # Try to get CPU count for context
+            try:
+                cpu_count = os.cpu_count() or 1
+            except Exception:
+                cpu_count = 1
+
+            # Normalize load by CPU count for threshold comparison
+            normalized_load = load_1m / cpu_count
+
+            if normalized_load >= 2.0:
+                status = "CRITICAL"
+            elif normalized_load >= 1.0:
+                status = "WARNING"
+            else:
+                status = "OK"
+
+            detail = f"Load average (1m): {load_1m:.2f} (normalized: {normalized_load:.2f} on {cpu_count} CPUs)"
+            return status, detail, {"load_1m": load_1m, "load_5m": load_5m, "load_15m": load_15m, "cpu_count": cpu_count, "normalized_load": normalized_load}
+        except (AttributeError, OSError):
+            # os.getloadavg() not available on this platform (e.g., Windows)
+            pass
+
+        # Final fallback: try uptime command
+        try:
+            result = subprocess.run(["uptime"], capture_output=True, text=True, timeout=5)
+            if result.returncode == 0:
+                return "WARNING", f"Load check fallback: {result.stdout.strip()}", {}
+        except Exception:
+            pass
+
+        return "WARNING", "Load average: /proc/loadavg not available and no fallback succeeded", {}
     except Exception as e:
         return "CRITICAL", f"Load check failed: {e}", {}
 
@@ -345,6 +426,9 @@
     parser.add_argument("--service", type=str, help="Check specific service")
