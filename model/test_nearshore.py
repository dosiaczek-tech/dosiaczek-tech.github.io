import math
import os
from pathlib import Path
import tempfile
import unittest

from nearshore import (DX, LENGTH, SPINUP_HOURS, WIND_MODELS, consensus, install_engine,
                       local_direction, offshore, parse_output, simulate, wind_components)


class ModelUtilities(unittest.TestCase):
    def test_direction_and_spatial_axes(self):
        self.assertEqual(local_direction(0, 0), 270)
        self.assertEqual(local_direction(90, 90), 270)
        self.assertEqual(local_direction(180, 0), 90)
        x, y = wind_components({"speed": 8, "direction": 0}, 0)
        self.assertAlmostEqual(x, 8)
        self.assertAlmostEqual(y, 0)
        x, y = wind_components({"speed": 3, "direction": 180}, 0)
        self.assertAlmostEqual(x, -3)
        x, y = wind_components({"speed": 3, "direction": 90}, 0)
        self.assertAlmostEqual(x, 0)
        self.assertAlmostEqual(y, -3)
        self.assertGreater(offshore({"normal": 0, "lat": 54.8, "lon": 18.4}, 5000)[0], 54.8)

    def test_consensus_wraps_and_marks_opposing_members(self):
        data = {}
        for model, direction in zip(WIND_MODELS, [359, 1, 0]):
            data[f"wind_speed_10m_{model}"] = [5]
            data[f"wind_direction_10m_{model}"] = [direction]
        result = consensus(data, 0)
        self.assertLess(min(result["direction"], 360-result["direction"]), .01)
        self.assertIsNone(result["fallback"])
        data["wind_speed_10m_ecmwf_ifs025"] = [None]
        data["wind_direction_10m_icon_seamless"] = [0]
        data["wind_direction_10m_gfs_seamless"] = [180]
        result = consensus(data, 0)
        self.assertEqual(result["speed"], 5)
        self.assertEqual(result["fallback"], "icon_seamless")

    def test_partial_solver_output_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/"short.tbl"
            path.write_text("20261020.120000 0 10 1 5 6 270 0 2000 0\n")
            with self.assertRaisesRegex(ValueError, "full requested horizon"):
                parse_output(path, {"normal": 0}, {"wetStart": 0, "depth": [10]*51}, 1792497600, 1792501200)


@unittest.skipUnless(os.environ.get("SWAN_INTEGRATION") == "1", "Set SWAN_INTEGRATION=1 to execute the real solver")
class SwanPhysics(unittest.TestCase):
    def test_wind_changes_spectral_solution_and_outputs_are_physical(self):
        now = 1792497600
        start = now - SPINUP_HOURS*3600
        times = list(range(start, now + 6*3600 + 1, 3600))
        count = len(times)
        marine = {"fetchedAt": now, "data": {"hourly": {"time": times,
            "wave_height_dwd_ewam": [.5]*count, "wave_period_dwd_ewam": [4]*count,
            "wave_direction_dwd_ewam": [0]*count}}}
        weather = {"time": times}
        for model in WIND_MODELS:
            weather[f"wind_speed_10m_{model}"] = [12]*count
            weather[f"wind_direction_10m_{model}"] = [0]*count
            weather[f"wind_gusts_10m_{model}"] = [14]*count
        winds = [{"fetchedAt": now, "data": {"hourly": weather}} for _ in range(3)]
        spot = {"id": "test", "lat": 54.8, "lon": 18.4, "normal": 0}
        bath = {"wetStart": 0, "depth": [.2 + d*.003 for d in range(0, LENGTH+1, DX)]}
        cache = Path(os.environ.get("SWAN_TEST_CACHE", ".forecast-cache"))
        cache.mkdir(parents=True, exist_ok=True)
        executable = install_engine(cache)
        result = simulate(spot, bath, marine, winds, executable, cache, now, hours=6)
        calm = simulate(spot, bath, marine, winds, executable, cache, now, hours=6, calm_test=True)
        self.assertEqual(len(result["hourly"]), 7)
        row = result["hourly"][-1]
        self.assertTrue(0 < row["height"] < 2)
        self.assertTrue(row["period"] > 0)
        self.assertTrue(row["energyPeriod"] > 0)
        self.assertTrue(math.isfinite(row["powerKWm"]) and row["powerKWm"] >= 0)
        self.assertGreater(abs(row["height"] - calm["hourly"][-1]["height"]), .01,
                           "Changing wind must change the actual SWAN solution, not just a UI rating")
        self.assertTrue(all(0 <= p["qb"] <= 1 for p in row["profile"]))
        self.assertTrue((cache/"reproducibility/test.tar.gz").exists())
        print("SWAN physical check: onshore Hs=", row["height"], "no-wind Hs=", calm["hourly"][-1]["height"])


if __name__ == "__main__":
    unittest.main()
