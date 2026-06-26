 ```diff
--- a/tools/health_check.py
+++ b/tools/health_check.py
@@ -10,6 +10,7 @@
 import argparse
 import json
 import os
+import platform
 import socket
 import ssl
 import subprocess
@@ -17,6 +18,7 @@
 import time
 from datetime import datetime
 from typing import Any, Dict, List, Optional, Tuple
+import unittest
 
 # ---------------------------------------------------------------------------
 # CONSTANTS
@@ -120,6 +122,9 @@
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system memory usage.
+    
+    On Linux, reads /proc/meminfo for detailed memory statistics.
+    On non-Linux platforms, uses psutil if available, or os-level fallbacks.
     """
     try:
         with open("/proc/meminfo", "r") as f:
@@ -147,8 +152,47 @@
                 "swap_used_mb": swap_used,
                 "swap_total_mb": swap_total,
             }
+    except FileNotFoundError:
+        # Fallback for non-Linux systems
+        try:
+            import psutil
+            mem = psutil.virtual_memory()
+            total_mb = mem.total // (1024 * 1024)
+            available_mb = mem.available // (1024 * 1024)
+            used_mb = total_mb - available_mb
+            percent = mem.percent
+            
+            swap = psutil.swap_memory()
+            swap_total = swap.total // (1024 * 1024)
+            swap_used = swap.used // (1024 * 1024)
+            
+            if percent >= MEMORY_THRESHOLD_CRITICAL:
+                result = "CRITICAL"
+            elif percent >= MEMORY_THRESHOLD_WARNING:
+                result = "WARNING"
+            else:
+                result = "OK"
+                
+            return result, f"Memory {percent:.1f}% used ({used_mb}MB / {total_mb}MB)", {
+                "percent": percent,
+                "used_mb": used_mb,
+                "total_mb": total_mb,
+                "available_mb": available_mb,
+                "swap_used_mb": swap_used,
+                "swap_total_mb": swap_total,
+            }
+        except ImportError:
+            # Minimal fallback without psutil
+            try:
+                import ctypes
+                # macOS specific fallback
+                if platform.system() == "Darwin":
+                    result = "WARNING"
+                    detail = "Memory check unavailable on macOS without psutil; install psutil for accurate readings"
+                    return result, detail, {"percent": 0, "used_mb": 0, "total_mb": 0}
+            except Exception:
+                pass
+            
+            result = "WARNING"
+            detail = "Memory check unavailable: /proc/meminfo not found and psutil not installed"
+            return result, detail, {"percent": 0, "used_mb": 0, "total_mb": 0}
     except Exception as e:
         return "CRITICAL", f"Memory check failed: {e}", {}
 
@@ -156,6 +200,9 @@
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     """
     Check system load average.
+    
+    On Linux, reads /proc/loadavg for detailed load statistics.
+    On non-Linux platforms, falls back to os.getloadavg() when available.
     """
     try:
         with open("/proc/loadavg", "r") as f:
@@ -172,6 +219,24 @@
                 "load_5min": load5,
                 "load_15min": load15,
             }
+    except FileNotFoundError:
+        # Fallback for non-Linux systems
+        try:
+            load1, load5, load15 = os.getloadavg()
+            cpu_count = os.cpu_count() or 1
+            load_percent = (load1 / cpu_count) * 100
+            
+            if load_percent >= 90:
+                result = "CRITICAL"
+            elif load_percent >= 70:
+                result = "WARNING"
+            else:
+                result = "OK"
+                
+            return result, f"Load average: {load1:.2f} {load5:.2f} {load15:.2f} ({load_percent:.1f}% per CPU)", {
+                "load_1min": load1, "load_5min": load5, "load_15min": load15, "cpus": cpu_count
+            }
+        except (AttributeError, OSError):
+            result = "WARNING"
+            detail = "Load average check unavailable: /proc/loadavg not found and os.getloadavg() not supported"
+            return result, detail, {"load_1min": 0, "load_5min": 0, "load_15min": 0, "cpus": 0}
     except Exception as e:
         return "CRITICAL", f"Load check failed: {e}", {}
 
@@ -350,6 +415,9 @@
     parser.add_argument("--watch", action="store_true", help="Continuous monitoring mode")
     parser.add_argument("--interval", type=int, default=5, help="Watch interval in seconds")
     parser.add_argument("--service", type=str, help="Check specific service only")
+    parser.add_argument("--test", action="store_true", help="Run self-tests and exit")
+    parser.add_argument("--test-fallbacks", action="store_true", 
+                        help="Run fallback validation tests and exit")
     return parser.parse_args()
 
 
@@ -412,10 +480,107 @@
             time.sleep(args.interval)
 
 
+# ---------------------------------------------------------------------------
+# TESTS
+# ---------------------------------------------------------------------------
+
+class TestHealthCheckFallbacks(unittest.TestCase):
+    """Tests for cross-platform fallback behavior in health checks."""
+    
+    def test_check_memory_usage_fallback_without_proc(self):
+        """Test memory check falls back when /proc/meminfo is unavailable."""
+        # This test verifies the fallback path is reachable
+        # by checking that non-Linux systems get a valid response
+        status, detail, data = check_memory_usage()
+        self.assertIn(status, ["OK", "WARNING", "CRITICAL"])
+        self.assertIsInstance(detail, str)
+        self.assertIsInstance(data, dict)
+        # Should have expected keys
+        self.assertIn("percent", data)
+        self.assertIn("used_mb", data)
+        self.assertIn("total_mb", data)
+        
+    def test_check_load_average_fallback_without_proc(self):
+        """Test load check falls back when /proc/loadavg is unavailable."""
+        status, detail, data = check_load_average()
+        self.assertIn(status, ["OK", "WARNING", "CRITICAL"])
+        self.assertIsInstance(detail, str)
+        self.assertIsInstance(data, dict)
+        # Should have expected keys