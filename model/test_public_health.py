import unittest
from check_public_forecast import validate


class Health(unittest.TestCase):
    def test_fresh_status_timestamp_cannot_hide_missing_or_expired_inputs(self):
        now = 100000
        good = dict(spots=91, windAvailable=91, available=86, generatedAt=now,
                    oldestWaveInputAt=now-3600, oldestWindFetchedAt=now-3600)
        self.assertIn("OK", validate(good, now))
        for bad in [dict(windAvailable=0), dict(oldestWindFetchedAt=0),
                    dict(oldestWaveInputAt=now-19*3600), dict(oldestWindFetchedAt=now+301)]:
            with self.assertRaises(ValueError): validate({**good, **bad}, now)
