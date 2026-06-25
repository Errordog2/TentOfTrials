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
@@ -21,6 +22,7 @@
 import time
 from datetime import datetime
 from typing import Any, Dict, List, Optional, Tuple
+import unittest
 
 # ---------------------------------------------------------------------------
 # CONSTANTS
@@ -148,6 +150,9 @@
 
 
 def check_memory_usage() -> Tuple[str, str, Dict[str, Any]]:
+    if platform.system() == "Linux":
+        return _check_memory_usage_linux()
+    
     try:
         with open("/proc/meminfo", "r") as f:
             meminfo = f.read()
@@ -178,6 +183,9, return result, detail, {"meminfo": meminfo[:500]}
+    except FileNotFoundError:
+        return _check_memory_usage_fallback()
     except Exception as e:
         return "WARNING", f"Unable to read memory info: {e}", {}
 
@@ -185,6 +193,9 @@
 def check_load_average() -> Tuple[str, str, Dict[str, Any]]:
     Loads are returned as 1, 5, and 15 minute averages.
     """
+    if platform.system() == "Linux":
+        return _check_load_average_linux()
+    
     try:
         with open("/proc/loadavg", "r") as f:
             loadavg = f.read().strip()
@@ -203,6 +214,9 @@
             "load_15m": float(parts[2]),
         }
         return result, detail, data
+    except FileNotFoundError:
+        return _check_load_average_fallback()
     except Exception as e:
         return "WARNING", f"Unable to read load average: {e}", {}
 
@@ -210,6 +224,9 @@
 def check_disk_space() -> Tuple[str, str, Dict[str, Any]]:
     Check disk space usage for the root filesystem.
     """
+    return _check_disk_space_impl()
+
+def _check_disk_space_impl() -> Tuple[str, str, Dict[str, Any]]:
     try:
         stat = os.statvfs("/")
         total = stat.f_blocks * stat.f_frsize
@@ -241,6 +258,9 @@
     Check certificate expiry for the configured TLS certificate.
     """
     cert_path = os.environ.get("TLS_CERT_PATH", "/etc/ssl/certs/tent-of-trials.crt")
+    return _check_certificate_expiry_impl(cert_path)
+
+def _check_certificate_expiry_impl(cert_path: str) -> Tuple[str, str, Dict[str, Any]]:
     try:
         with open(cert_path, "rb") as f:
             cert_data = f.read()
@@ -277,6 +297,9 @@
     """
     Check if the message queue depth is within acceptable limits.
     """
+    return _check_message_queue_impl()
+
+def _check_message_queue_impl() -> Tuple[str, str, Dict[str, Any]]:
     # Placeholder for message queue check
     # In a real implementation, this would check Kafka consumer lag
     return "OK", "Message queue depth normal", {"lag": 0}
@@ -287,6 +310,9 @@
     """
     Check database connectivity and basic health.
     """
+    return _check_database_health_impl()
+
+def _check_database_health_impl() -> Tuple[str, str, Dict[str, Any]]:
     # Placeholder for database health check
     # In a real implementation, this would check connection pool status
     return "OK", "Database connection healthy", {"connections": 5, "max_connections": 20}
@@ -297,6 +323,9 @@
     """
     Check Redis connectivity and basic health.
     """
+    return _check_redis_health_impl()
+
+def _check_redis_health_impl() -> Tuple[str, str, Dict[str, Any]]:
     # Placeholder for Redis health check
     # In a real implementation, this would check Redis ping and memory usage
     return "OK", "Redis connection healthy", {"used_memory": 1024, "max_memory": 4096}
@@ -307,6 +336,9 @@
     """
     Check Kafka connectivity and basic health.
     """
+    return _check_kafka_health_impl()
+
+def _check_kafka_health_impl() -> Tuple[str, str, Dict[str, Any]]:
     # Placeholder for Kafka health check
     # In a real implementation, this would check broker connectivity
     return "OK", "Kafka connection healthy", {"brokers": 3, "topics": 10}
@@ -317,6 +349,9 @@
     """
     Check service health via HTTP endpoint.
     """
+    return _check_service_health_impl(service_name)
+
+def _check_service_health_impl(service_name: str) -> Tuple[str, str, Dict[str, Any]]:
     if service_name not in SERVICES:
         return "CRITICAL", f"Unknown service: {service_name}", {}
 
@@ -345,6 +380,9 @@
     """
     Check infrastructure component via TCP port.
     """
+    return _check_infrastructure_impl(component_name)
+
+def _check_infrastructure_impl(component_name: str) -> Tuple[str, str, Dict[str, Any]]:
     if component_name not in INFRASTRUCTURE:
         return "CRITICAL", f"Unknown infrastructure component: {component_name}", {}
 
@@ -362,6 +400,9 @@
     """
     Run all health checks and return the results.
     """
+    return _run_all_checks_impl()
+
+def _run_all_checks_impl() -> Dict[str, Any]:
     checks = []
     overall_status = "OK"
 
@@ -419,6 +460,9 @@
     """
     Run health checks continuously with the specified interval.
     """
+    return _watch_mode_impl(interval, json_output)
+
+def _watch_mode_impl(interval: int, json_output: bool) -> None:
     try:
         while True:
             result = run_all_checks()
@@ -444,6 +488,9 @@
     """
     Main entry point for the health check tool.
     """
+    return _main_impl(args)
+
+def _main_impl(args: List[str]) -> int:
     parser = argparse.ArgumentParser(description="Tent of Trials Health Check")
     parser.add_argument("--service", help="Check specific service")
     parser.add_argument("--json", action="store_true", help="Output in JSON format")
@@ -487,6 +534,186 @@
     return 0
 
 
+# ---------------------------------------------------------------------------
+# FALLBACK IMPLEMENTATIONS
+# ---------------------------------------------------------------------------
+
+def _check_memory_usage_fallback() -> Tuple[str, str, Dict[str, Any]]:
+    """
+    Cross-platform fallback for memory check using psutil when available,
+    or basic Python stdlib alternatives.
+    """
+    try:
+        # Try psutil first (commonly available, though not stdlib)
+        import psutil
+        mem = ps