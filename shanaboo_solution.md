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
+import unittest
 
 # ---------------------------------------------------------------------------
 # CONSTANTS
@@ -126,6 +128,9 @@
 
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check memory usage. On Linux, reads /proc/meminfo. On other platforms, uses psutil fallback.
+    """
     try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
@@ -149,11 +154,46 @@
             status = "WARNING"
 
         return status, f"{used_percent:.1f}% used ({used_gb:.1f} GB / {total_gb:.1f} GB)", {"percent": used_percent", "used_gb": used_gb, "total_gb": total_gb}
-    except FileNotFoundError:
-        return "WARNING", "/proc/meminfo not available", {}
+    except (FileNotFoundError, OSError):
+        # Fallback for non-Linux systems
+        try:
+            import psutil
+            mem = psutil.virtual_memory()
+            used_percent = mem.percent
+            used_gb = (mem.total - mem.available) / (1024 ** 3)
+            total_gb = mem.total / (1024 ** 3)
+
+            if used_percent >= MEMORY_THRESHOLD_CRITICAL:
+                status = "CRITICAL"
+            elif used_percent >= MEMORY_THRESHOLD_WARNING:
+                status = "WARNING"
+            else:
+                status = "OK"
+
+            return status, f"{used_percent:.1f}% used ({used_gb:.1f} GB / {total_gb:.1f} GB)", {"percent": used_percent, "used_gb": used_gb, "total_gb": total_gb}
+        except ImportError:
+            # Fallback if psutil is not available: try using standard library only
+            try:
+                # Use os.getloadavg as a rough proxy for system load, but we need memory info
+                # Try to get memory from /usr/bin/vm_stat on macOS or free on other systems
+                if platform.system() == "Darwin":
+                    result = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5)
+                    # Parse vm_stat output (simplified)
+                    return "WARNING", "Memory check: /proc/meminfo not available, vm_stat fallback limited", {}
+                else:
+                    # Try free command
+                    result = subprocess.run(["free", "-m"], capture_output=True, text=True, timeout=5)
+                    if result.returncode == 0:
+                        lines = result.stdout.strip().split("\n")
+                        if len(lines) > 1:
+                            mem_line = lines[1].split()
+                            total_mb = int(mem_line[1])
+                            used_mb = int(mem_line[2])
+                            used_percent = (used_mb / total_mb) * 100
+                            used_gb = used_mb / 1024
+                            total_gb = total_mb / 1024
+                            status = "CRITICAL" if used_percent >= MEMORY_THRESHOLD_CRITICAL else "WARNING" if used_percent >= MEMORY_THRESHOLD_WARNING else "OK"
+                            return status, f"{used_percent:.1f}% used ({used_gb:.1f} GB / {total_gb:.1f} GB)", {"percent": used_percent, "used_gb": used_gb, "total_gb": total_gb}
+                    return "WARNING", "Memory check: /proc/meminfo not available, no fallback available", {}
+            except Exception:
+                return "WARNING", "Memory check: /proc/meminfo not available, fallback failed", {}
     except Exception as e:
         return "CRITICAL", f"Error reading memory: {e}", {}
 
@@ -161,6 +201,9 @@
 
 
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check system load average. On Linux, reads /proc/loadavg. On other platforms, uses os.getloadavg().
+    """
     try:
         with open("/proc/loadavg", "r") as f:
             loadavg = f.read().strip().split()
@@ -174,8 +217,24 @@
             status = "WARNING"
 
         return status, f"Load average: {load_1min:.2f} (1min)", {"load_1min": load_1min}
-    except FileNotFoundError:
-        return "WARNING", "/proc/loadavg not available", {}
+    except (FileNotFoundError, OSError):
+        # Fallback for non-Linux systems using os.getloadavg()
+        try:
+            load_1min, load_5min, load_15min = os.getloadavg()
+            # Normalize by CPU count for a comparable metric
+            cpu_count = os.cpu_count() or 1
+            normalized_load = load_1min / cpu_count
+            
+            if normalized_load >= 2.0:
+                status = "CRITICAL"
+            elif normalized_load >= 1.0:
+                status = "WARNING"
+            else:
+                status = "OK"
+
+            return status, f"Load average: {load_1min:.2f} (1min, {cpu_count} CPUs)", {"load_1min": load_1min, "load_5min": load_5min, "load_15min": load_15min, "cpu_count": cpu_count, "normalized_load": normalized_load}
+        except (AttributeError, OSError):
+            # os.getloadavg() not available on this platform
+            return "WARNING", "Load average: /proc/loadavg not available, os.getloadavg() not supported", {}
     except Exception as e:
         return "CRITICAL", f"Error reading load average: {e}", {}
 
@@ -330,6 +389,9 @@
 
 
 def main() -> None:
+    # Run tests if --test flag is provided
+    if "--test" in sys.argv:
+        run_tests()
+        return
     parser = argparse.ArgumentParser(description="Health check tool for Tent of Trials")
     parser.add_argument("--service", type=str, help="Check specific service")
     parser.add_argument("--json", action="store_true", help="Output in JSON format")
@@ -361,6 +423,67 @@
         time.sleep(5)
 
 
+# ---------------------------------------------------------------------------
+# TESTS
+# ---------------------------------------------------------------------------
+
+class TestHealthCheckFallbacks(unittest.TestCase):
+    """Tests for cross-platform fallback behavior in health checks."""
+
+    def test_check_memory_usage_fallback(self):
+        """