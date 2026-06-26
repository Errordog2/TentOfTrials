 ```diff
--- a/tools/health_check.py
+++ b/tools/health_check.py
@@ -9,6 +9,7 @@
   - The monitoring system (periodic health checks)
   - The on-call engineer (manual troubleshooting)
 
+
 The health check performs the following checks:
   1. Service availability (HTTP health endpoints)
   2. Database connectivity (connection test)
@@ -30,6 +31,7 @@
 import socket
 import ssl
 import subprocess
+import platform
 import sys
 import time
 from datetime import datetime
@@ -120,6 +122,7 @@
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system load average.
+    Uses /proc/loadavg on Linux, falls back to os.getloadavg() on other platforms.
 
     Returns:
         Tuple of (status, detail, data)
@@ -129,7 +131,7 @@
         "detail": {},
     }
 
-    try:
+    if os.path.exists("/proc/loadavg"):
         with open("/proc/loadavg", "r") as f:
             line = f.read().strip()
             parts = line.split()
@@ -139,9 +141,20 @@
             data["detail"]["load_1min"] = float(parts[0])
             data["detail"]["load_5min"] = float(parts[1])
             data["detail"]["load_15min"] = float(parts[2])
-    except Exception as e:
-        return "WARNING", f"Could not read load average: {e}", data
-
+    else:
+        try:
+            load1, load5, load15 = os.getloadavg()
+            data["detail"]["load_1min"] = load1
+            data["detail"]["load_5min"] = load5
+            data["detail"]["load_15min"] = load15
+        except OSError as e:
+            return "WARNING", f"Could not read load average: {e}", data
+
+    # Ensure we have values to evaluate
+    if "load_1min" not in data["detail"]:
+        return "WARNING", "Load average data unavailable", data
+
+    load_1min = data["detail"]["load_1min"]
     # Determine status based on load (assuming CPU count as a rough threshold)
     try:
         cpu_count = os.cpu_count() or 1
@@ -149,7 +162,6 @@
         cpu_count = 1
 
     # Normalize load by CPU count for threshold comparison
-    load_1min = data["detail"]["load_1min"]
     normalized_load = load_1min / cpu_count
 
     if normalized_load > 2.0:
@@ -165,6 +177,7 @@
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system memory usage.
+    Uses /proc/meminfo on Linux, falls back to psutil-like standard library approaches on other platforms.
 
     Returns:
         Tuple of (status, detail, data)
@@ -174,7 +187,7 @@
         "detail": {},
     }
 
-    try:
+    if os.path.exists("/proc/meminfo"):
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
 
@@ -196,8 +209,44 @@
             data["detail"]["used_percent"] = round(used_percent, 2)
             data["detail"]["total_mb"] = round(total / 1024, 2)
             data["detail"]["available_mb"] = round(available / 1024, 2)
-    except Exception as e:
-        return "WARNING", f"Could not read memory info: {e}", data
+    else:
+        # Fallback for non-Linux systems using standard library
+        try:
+            # Try using vm_statistics on macOS or other platform-specific approaches
+            # First, try to use subprocess to get memory info in a cross-platform way
+            if platform.system() == "Darwin":
+                # macOS: use vm_statistics or sysctl
+                result = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5)
+                if result.returncode == 0:
+                    # Parse vm_stat output
+                    vm_output = result.stdout
+                    page_size = 4096  # Default page size on macOS
+                    
+                    # Extract values from vm_stat output
+                    pages_free = 0
+                    pages_active = 0
+                    pages_inactive = 0
+                    pages_wired = 0
+                    
+                    for line in vm_output.splitlines():
+                        if "Pages free:" in line:
+                            pages_free = int(line.split(":")[1].strip().replace(".", ""))
+                        elif "Pages active:" in line:
+                            pages_active = int(line.split(":")[1].strip().replace(".", ""))
+                        elif "Pages inactive:" in line:
+                            pages_inactive Dupcheck
+                            pages_inactive = int(line.split(":")[1].strip().replace(".", ""))
+                        elif "Pages wired down:" in line:
+                            pages_wired = int(line.split(":")[1].strip().replace(".", ""))
+                    
+                    total_pages = pages_free + pages_active + pages_inactive + pages_wired
+                    used_pages = pages_active + pages_inactive + pages_wired
+                    
+                    if total_pages > 0:
+                        total_mb = (total_pages * page_size) / (1024 * 1024)
+                        used_mb = (used_pages * page_size) / (1024 * 1024)
+                        available_mb = total_mb - used_mb
+                        used_percent = (used_mb / total_mb) * 100
+                        
+                        data["detail"]["used_percent"] = round(used_percent, 2)
+                        data["detail"]["total_mb"] = round(total_mb, 2)
+                        data["detail"]["available_mb"] = round(available_mb, 2)
+            else:
+                # Generic fallback: try to read from /sys or use a simple heuristic
+                # This is a best-effort fallback for other Unix-like systems
+                try:
+                    # Try to get memory info from sysconf or other means
+                    result = subprocess.run(["free", "-m"], capture_output=True, text=True, timeout=5)
+                    if result.returncode == 0:
+                        lines = result.stdout.strip().splitlines()
+                        if len(lines) > 1:
+                            mem_line = lines[1].split()
+                            if len(mem_line) >= 3:
+                                total_mb = float(mem_line[1])
+                                used_mb = float(mem_line[2])
+                                available_mb = total_mb - used_mb
+                                used_percent = (used_mb / total_mb) * 100
+                                data["detail"]["used_percent"] = round