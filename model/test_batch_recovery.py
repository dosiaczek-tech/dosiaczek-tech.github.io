import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import requests
import nearshore as n


class BatchRecovery(unittest.TestCase):
    def test_one_failed_batch_does_not_drop_other_points_and_keeps_original_dates(self):
        points = [(54 + i / 1000, 18) for i in range(36)]
        response = Mock()
        response.json.return_value = [{"hourly": {"time": [100000]}} for _ in range(18)]
        with tempfile.TemporaryDirectory() as temp, patch.object(n.time, "sleep"):
            cache = Path(temp)
            with patch.object(n.time, "time", return_value=100000), patch.object(n, "request", return_value=response):
                first = n.bulk_forecast(points, cache=cache)
            with patch.object(n.time, "time", return_value=112000), patch.object(n, "request", side_effect=[response, requests.ConnectionError()]):
                second = n.bulk_forecast(points, cache=cache)
            self.assertEqual(len(second), 36)
            self.assertEqual(second[0]["fetchedAt"], 112000)
            self.assertEqual(second[18]["fetchedAt"], first[18]["fetchedAt"])
            self.assertTrue(second[18]["reusedInputs"])
            with patch.object(n.time, "time", return_value=130000), patch.object(n, "request", side_effect=[response, requests.ConnectionError()]):
                expired = n.bulk_forecast(points, cache=cache)
            self.assertIsNotNone(expired[0])
            self.assertEqual(expired[18:], [None] * 18)

    def test_rate_limit_stops_further_requests_in_same_download(self):
        response = Mock(status_code=429)
        error = requests.HTTPError(response=response)
        with tempfile.TemporaryDirectory() as temp, patch.object(n.time, "sleep"), patch.object(n, "request", side_effect=error) as get:
            result = n.bulk_forecast([(54, 18)] * 36, cache=Path(temp))
        self.assertEqual(result, [None] * 36)
        get.assert_called_once()

    def test_changed_coordinates_do_not_reuse_another_batch(self):
        response = Mock()
        response.json.return_value = {"hourly": {"time": [100000]}}
        with tempfile.TemporaryDirectory() as temp, patch.object(n.time, "sleep"), patch.object(n.time, "time", return_value=100000):
            with patch.object(n, "request", return_value=response):
                n.bulk_forecast([(54, 18)], cache=Path(temp))
            with patch.object(n, "request", side_effect=requests.ConnectionError()):
                self.assertEqual(n.bulk_forecast([(54.1, 18)], cache=Path(temp)), [None])
