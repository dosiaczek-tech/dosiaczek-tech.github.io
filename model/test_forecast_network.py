import unittest
from unittest.mock import Mock, patch

import requests
import nearshore


class ForecastNetwork(unittest.TestCase):
    def tearDown(self):
        nearshore._dns_overrides.clear()

    def test_connection_failure_refreshes_dns_without_changing_https_url(self):
        dns = Mock()
        dns.json.return_value = {"Status": 0, "Answer": [{"type": 1, "data": "157.90.83.168"}]}
        success = Mock()
        url = "https://api.open-meteo.com/v1/forecast"
        with patch.object(nearshore.requests, "get", side_effect=[requests.ReadTimeout("handshake"), dns, success]) as get:
            self.assertIs(nearshore.request(url, {"latitude": 54.8}), success)
            self.assertEqual(get.call_args_list[0].args[0], url)
            self.assertEqual(get.call_args_list[2].args[0], url)
            self.assertNotIn("verify", get.call_args_list[2].kwargs)
        with patch.object(nearshore, "_original_getaddrinfo", return_value=[]) as resolve:
            nearshore.resolve_address("api.open-meteo.com", 443)
            resolve.assert_called_once_with("157.90.83.168", 443)

    def test_http_rate_limit_does_not_change_dns(self):
        response = Mock(status_code=429)
        response.raise_for_status.side_effect = requests.HTTPError("429")
        with patch.object(nearshore.requests, "get", return_value=response), patch.object(nearshore.time, "sleep"), patch.object(nearshore, "refresh_forecast_dns") as refresh:
            with self.assertRaises(requests.HTTPError):
                nearshore.request("https://api.open-meteo.com/v1/forecast")
            refresh.assert_not_called()

    def test_nonpublic_addresses_are_not_accepted(self):
        dns = Mock()
        dns.json.return_value = {"Status": 0, "Answer": [{"type": 1, "data": "127.0.0.1"}]}
        with patch.object(nearshore.requests, "get", return_value=dns):
            self.assertFalse(nearshore.refresh_forecast_dns("https://api.open-meteo.com/v1/forecast"))
        self.assertFalse(nearshore._dns_overrides)
