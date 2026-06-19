import socket
import unittest
from unittest.mock import patch

from tools import health_check


class HealthCheckTimeoutTests(unittest.TestCase):
    def test_http_timeout_is_classified_as_critical_without_network(self):
        with patch("http.client.HTTPConnection", side_effect=TimeoutError):
            status, detail, code = health_check.check_http_service(
                "example.invalid", 8080, "/health", timeout=3
            )

        self.assertEqual(status, "CRITICAL")
        self.assertEqual(detail, "HTTP timeout (3s)")
        self.assertEqual(code, 0)

    def test_tcp_timeout_is_classified_as_critical_without_network(self):
        with patch("socket.create_connection", side_effect=socket.timeout):
            status, detail, latency = health_check.check_tcp_port(
                "example.invalid", 5432, timeout=7
            )

        self.assertEqual(status, "CRITICAL")
        self.assertEqual(detail, "Connection timeout (7s)")
        self.assertEqual(latency, 0)

    def test_timeout_summary_preserves_endpoint_and_latency_metadata(self):
        with patch.dict(
            health_check.SERVICES,
            {"backend": {"host": "example.invalid", "port": 8080, "path": "/health", "timeout": 2}},
            clear=True,
        ), patch.dict(health_check.INFRASTRUCTURE, {}, clear=True), patch(
            "tools.health_check.check_http_service",
            return_value=("CRITICAL", "HTTP timeout (2s)", 0),
        ), patch("tools.health_check.check_disk_usage", return_value=("OK", "disk ok", 1.0)), patch(
            "tools.health_check.check_memory_usage", return_value=("OK", "memory ok", 1.0)
        ), patch("tools.health_check.check_load_average", return_value=("OK", "load ok", 0.1)):
            results = health_check.run_health_checks(service="backend")

        service = results["services"]["backend"]
        self.assertEqual(results["overall_status"], "DEGRADED")
        self.assertEqual(service["status"], "CRITICAL")
        self.assertEqual(service["detail"], "HTTP timeout (2s)")
        self.assertEqual(service["endpoint"], "http://example.invalid:8080/health")
        self.assertIn("latency_ms", service)
        self.assertIsInstance(service["latency_ms"], float)


if __name__ == "__main__":
    unittest.main()
