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
@@ -118,6 +120,9 @@ def check_disk_space() -> Tuple[str, str, Dict[str, Any]]:
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
     """Check system memory usage."""
+    if platform.system() == "Linux":
+        return _check_memory_usage_linux()
+    
     try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
@@ -145,9 +150,77 @@ def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
         return "CRITICAL", f"Failed to read memory info: {e}", {}
 
 
+def _check_memory_usage_linux() -> Tuple[str, str, Dict[str, Any]]:
+    """Linux-specific memory check using /proc/meminfo."""
+    try:
+        with open("/proc/meminfo", "r") as f:
+            meminfo = f.read()
+        
+        mem_total = 0
+        mem_available = 0
+        
+        for line in meminfo.splitlines():
+            if line.startswith("MemTotal:"):
+                mem_total = int(line.split()[1]) * 1024
+            elif line.startswith("MemAvailable:"):
+                mem_available = int(line.split()[1]) * 1024
+        
+        if mem_total == 0:
+            return "WARNING", "Could not determine total memory", {}
+        
+        mem_used = mem_total - mem_available
+        percent_used = (mem_used / mem_total) * 100 if mem_total > 0 else 0
+        
+        detail = f"Memory usage: {percent_used:.1f}% ({mem_used // (1024*1024)}MB / {mem_total // (1024*1024)}MB)"
+        
+        if percent_used >= MEMORY_THRESHOLD_CRITICAL:
+            return "CRITICAL", detail, {"percent_used": percent_used, "total": mem_total, "available": mem_available}
+        elif percent_used >= MEMORY_THRESHOLD_WARNING:
+            return "WARNING", detail, {"percent_used": percent_used, "total": mem_total, "available": mem_available}
+        else:
+            return "OK", detail, {"percent_used": percent_used, "total": mem_total, "available": mem_available}
+    except Exception as e:
+        return "CRITICAL", f"Failed to read memory info: {e}", {}
+
+
+def _check_memory_usage_psutil() -> Tuple[str, str, Dict[str, Any]]:
+    """Fallback memory check using psutil if available."""
+    try:
+        import psutil
+        mem = psutil.virtual_memory()
+        percent_used = mem.percent
+        mem_total = mem.total
+        mem_available = mem.available
+        mem_used = mem.used
+        
+        detail = f"Memory usage: {percent_used:.1f}% ({mem_used // (1024*1024)}MB / {mem_total // (1024*1024)}MB)"
+        
+        if percent_used >= MEMORY_THRESHOLD_CRITICAL:
+            return "CRITICAL", detail, {"percent_used": percent_used, "total": mem_total, "available": mem_available}
+        elif percent_used >= MEMORY_THRESHOLD_WARNING:
+            return "WARNING", detail, {"percent_used": percent_used, "total": mem_total, "available": mem_available}
+        else:
+            return "OK", detail, {"percent_used": percent_used, "total": mem_total, "available": mem_available}
+    except ImportError:
+        return "WARNING", "psutil not available for memory check", {}
+
+
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     """Check system load average."""
+    # Try /proc/loadavg first (Linux)
+    if platform.system() == "Linux":
+        return _check_load_average_proc()
+    
+    # Fallback to os.getloadavg() for other platforms
+    return _check_load_average_os()
+
+
+def _check_load_average_proc() -> Tuple[str, str, Dict[str, Any]]:
+    """Check load average using /proc/loadavg (Linux-specific)."""
     try:
         with open("/proc/loadavg", "r") as f:
             loadavg = f.read().strip().split()
@@ -168,6 +241,36 @@ def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
         return "WARNING", f"Failed to read load average: {e}", {}
 
 
+def _check_load_average_os() -> Tuple[str, str, Dict[str, Any]]:
+    """Check load average using os.getloadavg() (cross-platform fallback)."""
+    try:
+        load1, load5, load15 = os.getloadavg()
+        
+        # Try to get CPU count for normalization
+        try:
+            cpu_count = os.cpu_count() or 1
+        except Exception:
+            cpu_count = 1
+        
+        # Normalize load by CPU count for threshold comparison
+        normalized_load = load1 / cpu_count if cpu_count > 0 else load1
+        
+        detail = f"Load average (1min): {load1:.2f} (cpus: {cpu_count})"
+        
+        # Use same thresholds as proc-based check (normalized)
+        if normalized_load >= 2.0:
+            return "CRITICAL", detail, {"load1": load1, "load5": load5, "load15": load15, "cpus": cpu_count}
+        elif normalized_load >= 1.0:
+            return "WARNING", detail, {"load1": load1, "load5": load5, "load15": load15, "cpus": cpu_count}
+        else:
+            return "OK", detail, {"load1": load1, "load5": load5, "load15": load15, "cpus": cpu_count}
+    except OSError:
 OS-specific functionality like os.getloadavg() is not available on Windows, but works on macOS and most Unix-like systems. We should handle this gracefully.
+        return "WARNING", "Load average not available on this platform", {}
+    except Exception as e:
+        return "WARNING", f"Failed to get load average: {e}", {}
+
+
 # ---------------------------------------------------------------------------
 # MAIN
 # ---------------------------------------------------------------------------
@@ -245,6 +348,7 @@ def main():
     parser.add_argument("--service", help="Check specific service")
     parser.add_argument("--json", action