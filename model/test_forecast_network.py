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


class SharedConnection(unittest.TestCase):
    def test_a_session_carries_the_request_instead_of_a_new_connection(self):
        session, success = Mock(), Mock(status_code=200)
        session.get.return_value = success
        with patch.object(nearshore.requests, "get") as plain:
            self.assertIs(nearshore.request("https://api.open-meteo.com/v1/forecast", {"latitude": 54}, session), success)
        plain.assert_not_called()
        session.get.assert_called_once()

    def test_all_batches_share_one_connection_and_the_last_one_is_not_followed_by_a_pause(self):
        response = Mock()
        response.json.return_value = [{"hourly": {"time": [1]}}] * 18
        session = Mock()
        with patch.object(nearshore.requests, "Session", return_value=session) as opened, \
                patch.object(nearshore, "request", return_value=response) as get, patch.object(nearshore.time, "sleep") as pause:
            self.assertEqual(len(nearshore.bulk_forecast([(54, 18)] * 36)), 36)
        opened.assert_called_once()
        self.assertEqual([call.args[2] for call in get.call_args_list], [session, session])
        self.assertEqual(pause.call_count, 1)
        session.close.assert_called_once()
