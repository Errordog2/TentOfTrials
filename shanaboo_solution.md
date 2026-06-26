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
 import json
 import os
 import socket
+import platform
 import ssl
 import subprocess
 import sys
@@ -141,6 +143,9 @@
 
 
 def check_disk_space() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check disk space usage.
+    """
     usage = shutil.disk_usage("/")
     percent = usage.used / usage.total * 100
     free_gb = usage.free / (1024 ** 3)
@@ -157,6 +162,9 @@
 
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check memory usage. On Linux, reads /proc/meminfo. On other platforms, falls back to psutil or os-based methods.
+    """
     try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
@@ -177,12 +185,68 @@
             result = "OK"
             detail = f"Memory usage {percent_used:.1f}% ({used_gb:.1f}GB / {total_gb:.1f}GB)"
 
-        return result, detail, {"percent": percent_used, "used_mb": used_mb, "total_mb": total_mb}
+        return result, detail, {
+            "percent": percent_used,
+            "used_mb": used_mb,
+            "total_mb": total_mb,
+        }
     except FileNotFoundError:
-        return "WARNING", "/proc/meminfo not available", {}
+        # Fallback for non-Linux systems
+        try:
+            import psutil
+            mem = psutil.virtual_memory()
+            percent_used = mem.percent
+            used_mb = mem.used / (1024 * 1024)
+            total_mb = mem.total / (1024 * 1024)
+
+            if percent_used >= MEMORY_THRESHOLD_CRITICAL:
+                result = "CRITICAL"
+                detail = f"Memory usage {percent_used:.1f}% ({used_mb:.1f}MB / {total_mb:.1f}MB)"
+            elif percent_used >= MEMORY_THRESHOLD_WARNING:
+                result = "WARNING"
+                detail = f"Memory usage {percent_used:.1f}% ({used_mb:.1f}MB / {total_mb:.1f}MB)"
+            else:
+                result = "OK"
+                detail = f"Memory usage {percent_used:.1f}% ({used_mb:.1f}MB / {total_mb:.1f}MB)"
+
+            return result, detail, {
+                "percent": percent_used,
+                "used_mb": used_mb,
+                "total_mb": total_mb,
+            }
+        except ImportError:
+            # Last resort: try to use platform-specific commands
+            try:
+                if platform.system() == "Darwin":  # macOS
+                    vm_stat = subprocess.run(["vm_stat"], capture_output=True, text=True, check=True)
+                    # Parse vm_stat output
+                    lines = vm_stat.stdout.strip().split("\n")
+                    page_size = 4096  # Default page size on macOS
+                    for line in lines:
+                        if "page size of" in line:
+                            page_size = int(line.split("page size of ")[1].split(" ")[0])
+                    
+                    # This is a simplified fallback; psutil is preferred
+                    return "WARNING", "Memory check: install psutil for accurate memory stats on macOS", {}
+                else:
+                    return "WARNING", "/proc/meminfo not available and psutil not installed", {}
+            except Exception:
+                return "WARNING", "/proc/meminfo not available and fallback failed", {}
 
 
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check system load average. On Linux, reads /proc/loadavg. On other platforms, falls back to os.getloadavg().
+    """
     try:
         with open("/proc/loadavg", "r") as f:
             load_data = f.read().strip().split()
@@ -190,9 +254,26 @@
         load_1min = float(load_data[0])
         load_5min = float(load_data[1])
         load_15min = float(load_data[2])
-        return "OK", f"Load average: {load_1min:.2f}, {load_5min:.2f}, {load_15min:.2f}", {"1min": load_1min, "5min": load_5min, "15min": load_15min}
+        return "OK", f"Load average: {load_1min:.2f}, {load_5min:.2f}, {load_15min:.2f}", {
+            "1min": load_1min,
+            "5min": load_5min,
+            "15min": load_15min,
+        }
     except FileNotFoundError:
-        return "WARNING", "/proc/loadavg not available", {}
+        # Fallback to os.getloadavg() for Unix-like systems (macOS, BSD, etc.)
+        try:
+            load_1min, load_5min, load_15min = os.getloadavg()
+            return "OK", f"Load average: {load_1min:.2f}, {load_5min:.2f}, {load_15min:.2f}", {
+                "1min": load_1min,
+                "5min": load_5min,
+                "15min": load_15min,
+            }
+        except (AttributeError, OSError):
+            # os.getloadavg() not available on Windows or other systems
+            return "WARNING", "Load average not available on this platform", {}
 
 
 def check_certificate_expiry(host: str, port: int = 443, timeout: int = 5) -> Tuple[str, str, Dict[str, Any]]:
@@ -340,6 +421,9 @@
 
 
 def run_health_checks(args) -> Dict[str, Any]:
+    """
+    Run all health checks and return results.
+    """
     results = {
         "timestamp": datetime.now().isoformat(),
         "overall_status": "OK",
@@ -431,6 +515,9 @@
 
 
 def main():
+    """
+    Main entry point for the health check tool.
+    """
     parser = argparse.ArgumentParser(description="Tent of Trials Health Check")
     parser.add_argument("--service", help="Check specific service")
     parser.add_argument("--json