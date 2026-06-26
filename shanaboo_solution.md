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
 import socket
 import ssl
 import subprocess
+import platform
 import sys
 import time
 from datetime import datetime
@@ -143,6 +145,9 @@
 
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
+    if platform.system() == "Linux":
+        return _check_memory_usage_linux()
+    
     try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
@@ -168,6 +173,61 @@
         return "CRITICAL", f"Failed to read memory info: {e}", {}
 
 
+def _check_memory_usage_linux() -> Tuple[str, str, Dict[str, Any]]:
+    try:
+        with open("/proc/meminfo", "r") as f:
+            meminfo = f.read()
+    except Exception as e:
+        return "CRITICAL", f"Failed to read /proc/meminfo: {e}", {}
+
+    mem_data = {}
+    for line in meminfo.splitlines():
+        if ":" in line:
+            key, value = line.split(":", 1)
+            mem_data[key.strip()] = value.strip()
+
+    total_kb = _parse_kb(mem_data.get("MemTotal", "0"))
+    available_kb = _parse_kb(mem_data.get("MemAvailable", "0"))
+    if available_kb == 0:
+        available_kb = _parse_kb(mem_data.get("MemFree", "0"))
+
+    if total_kb > 0:
+        used_percent = ((total_kb - available_kb) / total_kb) * 100
+    else:
+        used_percent = 0
+
+    detail = f"Memory used: {used_percent:.1f}% ({(total_kb - available_kb) // 1024}MB / {total_kb // 1024}MB)"
+
+    if used_percent >= MEMORY_THRESHOLD_CRITICAL:
+        return "CRITICAL", detail, {"used_percent": used_percent, "total_kb": total_kb, "available_kb": available_kb}
+    elif used_percent >= MEMORY_THRESHOLD_WARNING:
+        return "WARNING", detail, {"used_percent": used_percent, "total_kb": total_kb, "available_kb": available_kb}
+    else:
+        return "OK", detail, {"used_percent": used_percent, "total_kb": total_kb, "available_kb": available_kb}
+
+
+def _check_memory_usage_fallback() -> Tuple[str, str, Dict[str, Any]]:
+    import psutil
+    try:
+        mem = psutil.virtual_memory()
+        used_percent = mem.percent
+        total_mb = mem.total // (1024 * 1024)
+        available_mb = mem.available // (1024 * 1024)
+
+        detail = f"Memory used: {used_percent:.1f}% ({mem.used // (1024 * 1024)}MB / {total_mb}MB)"
+
+        result_data = {
+            "used_percent": used_percent,
+            "total_kb": mem.total // 1024,
+            "available_kb": mem.available // 1024,
+        }
+
+        if used_percent >= MEMORY_THRESHOLD_CRITICAL:
+            return "CRITICAL", detail, result_data
+        elif used_percent >= MEMORY_THRESHOLD_WARNING:
+            return "WARNING", detail, result_data
+        else:
+            return "OK", detail, result_data
+    except Exception as e:
+        return "CRITICAL", f"Failed to get memory info: {e}", {}
+
+
 def _parse_kb(value_str: str) -> int:
     try:
         return int(value_str.split()[0])
@@ -176,6 +236,9 @@
 
 
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
+    if platform.system() == "Linux":
+        return _check_load_average_linux()
+    
     try:
         with open("/proc/loadavg", "r") as f:
             loadavg = f.read().strip()
@@ -196,6 +259,37 @@
         return "CRITICAL", f"Failed to read load average: {e}", {}
 
 
+def _check_load_average_linux() -> Tuple[str, str, Dict[str, Any]]:
+    try:
+        with open("/proc/loadavg", "r") as f:
+            loadavg = f.read().strip()
+        parts = loadavg.split()
+        one_min = float(parts[0])
+        five_min = float(parts[1])
+        fifteen_min = float(parts[2])
+
+        detail = f"Load average: {one_min:.2f} (1m), {five_min:.2f} (5m), {fifteen_min:.2f} (15m)"
+        return "OK", detail, {"1min": one_min, "5min": five_min, "15min": fifteen_min}
+    except Exception as e:
+        return "CRITICAL", f"Failed to read /proc/loadavg: {e}", {}
+
+
+def _check_load_average_fallback() -> Tuple[str, str, Dict[str, Any]]:
+    try:
+        one_min, five_min, fifteen_min = os.getloadavg()
+        detail = f"Load average: {one_min:.2f} (1m), {five_min:.2f} (5m), {fifteen_min:.2f} (15m)"
+        return "OK", detail, {"1min": one_min, "5min": five_min, "15min": fifteen_min}
+    except OSError as e:
+        return "CRITICAL", f"Failed to get load average: {e}", {}
+
+
+# Set up cross-platform functions
+if platform.system() != "Linux":
+    try:
+        import psutil
+        check_memory_usage = _check_memory_usage_fallback
+    except ImportError:
+        pass
+    check_load_average = _check_load_average_fallback
+
+
 def check_disk_usage() -> Tuple[str, str, Dict[str, Any]]:
     try:
         stat = os.statvfs("/")
@@ -396,6 +490,8 @@
     parser.add_argument("--service", type=str, help="Check specific service")
     parser.add_argument("--json", action="store_true", help="Output results as JSON")
     parser.add_argument("--watch", action="store_true", help="Continuous monitoring")
+    parser.add_argument("--test-fallbacks", action="store_true", 
+                      help="Test fallback behavior by simulating missing /proc files")
     args = parser