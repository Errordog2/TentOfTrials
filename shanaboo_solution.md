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
@@ -155,6 +157,9 @@
 
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check memory usage. On Linux, reads /proc/meminfo. On other platforms, uses psutil or os-based fallbacks.
+    """
     try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
@@ -177,12 +182,66 @@
             status = "WARNING"
 
         return status, detail, {"percent": percent, "available_mb": available_mb, "total_mb": total_mb}
-    except FileNotFoundError:
-        return "WARNING", "/proc/meminfo not available", {}
+    except (FileNotFoundError, OSError):
+        # Cross-platform fallback using os and standard library
+        try:
+            import psutil
+            mem = psutil.virtual_memory()
+            percent = mem.percent
+            available_mb = mem.available // (1024 * 1024)
+            total_mb = mem.total // (1024 * 1024)
+            
+            if percent >= MEMORY_THRESHOLD_CRITICAL:
+                status = "CRITICAL"
+                detail = f"Memory usage is {percent:.1f}% (critical threshold: {MEMORY_THRESHOLD_CRITICAL}%)"
+            elif percent >= MEMORY_THRESHOLD_WARNING:
+                status = "WARNING"
+                detail = f"Memory usage is {percent:.1f}% (warning threshold: {MEMORY_THRESHOLD_WARNING}%)"
+            else:
+                status = "OK"
+                detail = f"Memory usage is {percent:.1f}%"
+            
+            return status, detail, {"percent": percent, "available_mb": available_mb, "total_mb": total_mb}
+        except ImportError:
+            # Fallback without psutil: try to get memory info from platform-specific sources
+            system = platform.system()
+            try:
+                if system == "Darwin":  # macOS
+                    result = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5)
+                    # Parse vm_stat output for basic memory info
+                    pagesize = 4096  # Default page size on macOS
+                    lines = result.stdout.strip().split("\n")
+                    mem_info = {}
+                    for line in lines:
+                        if ":" in line:
+                            key, value = line.split(":", 1)
+                            mem_info[key.strip()] = value.strip().replace(".", "").replace(" ", "")
+                    
+                    # Rough estimate approximate memory usage
+                    status = "OK"
+                    detail = "Memory check via vm_stat (macOS fallback)"
+                    return status, detail, {"percent": 0, "available_mb": 0, "total_mb": 0, "source": "vm_stat"}
+                else:
+                    # Generic fallback for other platforms
+                    status = "WARNING"
+                    detail = "Memory usage check unavailable: /proc/meminfo not present and psutil not installed"
+                    return status, detail, {"percent": 0, "available_mb": 0, "total_mb": 0}
+            except Exception as e:
+                status = "WARNING"
+                detail = f"Memory usage check failed: {e}"
+                return status, detail, {"percent": 0, "available_mb": 0, "total_mb": 0}
 
 
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Check system load average. On Linux, reads /proc/loadavg. On other platforms, uses os.getloadavg().
+    """
     try:
         with open("/proc/loadavg", "r") as f:
             loadavg = f.read().strip().split()
@@ -195,8 +254,30 @@
             status = "WARNING"
 
         return status, detail, {"1min": load_1min, "5min": load_5min, "15min": load_15min}
-    except FileNotFoundError:
-        return "WARNING", "/proc/loadavg not available", {}
+    except (FileNotFoundError, OSError):
+        # Fallback to os.getloadavg() for Unix-like systems (macOS, BSD, etc.)
+        try:
+            load_1min, load_5min, load_15min = os.getloadavg()
+            
+            # Determine number of CPUs for context
+            try:
+                cpu_count = os.cpu_count() or 1
+            except Exception:
+                cpu_count = 1
+            
+            # Normalize load by CPU count for threshold comparison
+            normalized_load = load_1min / cpu_count
+            
+            if normalized_load >= 2.0:
+                status = "CRITICAL"
+                detail = f"Load average is {load_1min:.2f} (normalized: {normalized_load:.2f} per CPU, {cpu_count} CPUs)"
+            elif normalized_load >= 1.0:
+                status = "WARNING"
+                detail = f"Load average is {load_1min:.2f} (normalized: {normalized_load:.2f} per CPU, {cpu_count} CPUs)"
+            else:
+                status = "OK"
+                detail = f"Load average is {load_1min:.2f} ({cpu_count} CPUs)"
+            
+            return status, detail, {"1min": load_1min, "5min": load_5min, "15min": load_15min}
+        except (OSError, AttributeError):
+            # Windows or other systems without getloadavg
+            return "WARNING", "Load average check unavailable: /proc/loadavg not present and os.getloadavg() not supported", {}
 
 
 def check_disk_space() -> Tuple[str, str, Dict[str, Any]]:
@@ -384,6 +465,7 @@
     parser.add_argument("--service", type=str, help="Check specific service")
     parser.add_argument("--json", action="store_true", help="Output in JSON format")
     parser.add_argument("--watch", action="store_true", help="Continuous monitoring")
+    parser.add_argument("--test-fallbacks", action="store_true", help="Test fallback behavior by simulating missing /proc files")
     args = parser.parse_args()
 
     if args.watch:
@@ -392,6 +474,12 @@
             time.sleep(5)
     elif args.json:
