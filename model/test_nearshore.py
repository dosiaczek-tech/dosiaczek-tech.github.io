import math
import os
from pathlib import Path
import tempfile
import unittest

from nearshore import (DX, COMPUTE_DX, LENGTH, SPINUP_HOURS, WIND_MODELS, calculation_grid, consensus, install_engine,
                       local_direction, offshore, parse_output, shoreline_reference, simulate, swan_time, wind_components)


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
                parse_output(path, {"normal": 0, "lat":54.8,"lon":18.4},
                    {"wetStart": 1, "depth": [None]+[10]*50, "elevation":[1]+[-10]*50, "distances":list(range(0,5100,100))}, 1792497600, 1792501200)

    def test_point_is_within_500_m_even_if_deeper_target_is_farther_away(self):
        self.check_coastal_selection(0)

    def test_shallow_dry_cells_are_distinguished_from_missing_wet_results(self):
        row = self.check_coastal_selection(0, first_depth=.02)
        self.assertEqual(row["profile"][1]["kind"], "dry-model-node")
        self.assertEqual(row["profile"][1]["height"], 0)
        with self.assertRaisesRegex(ValueError, "Incomplete SWAN profile"):
            self.check_coastal_selection(0, mask_wet=True)

    def test_inland_map_pin_does_not_shift_the_distance_reference(self):
        row = self.check_coastal_selection(900)
        self.assertGreater(row["distance"], 500)
        self.assertLessEqual(row["shoreDistanceMax"], 500)

    def test_offshore_barrier_is_not_used_as_the_spots_beach(self):
        bath={"distances":[-100,0,100,200,300,400],"depth":[None,1,None,None,2,3],
              "elevation":[1,-1,0,0,-2,-3],"wetStart":4}
        with self.assertRaisesRegex(ValueError,"za przeszkodą"):
            shoreline_reference({"lat":54.3,"lon":18.8,"normal":0},bath)

    def check_coastal_selection(self, shore, first_depth=.5, mask_wet=False):
        distances = list(range(-1000, LENGTH+1, DX))
        depth = [None if d < shore else first_depth + (d-shore)*.0018 for d in distances]
        bath = {"depth":depth,"distances":distances,"wetStart":distances.index(shore),
                "elevation":[1 if d is None else -d for d in depth]}
        spot = {"lat":54.35,"lon":18.831,"normal":0}
        timestamp=1792497600
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"profile.tbl"
            lines=[]
            coast, grid_distances, grid_depths = calculation_grid(spot, bath)
            self.assertEqual(grid_distances[0], coast["distance"])
            self.assertEqual(grid_depths[0], 0)
            for d, z in zip(grid_distances,grid_depths):
                # At 800 m from the first wet node the depth is closer to 2 m,
                # but that attractive-looking wave must not be selected.
                active = z > .05 and not (mask_wet and d == shore + 300)
                lines.append(f'{swan_time(timestamp)} {LENGTH-d} {z if active else -99} {1+(d-shore)/1000 if active else -9} 5 6 270 {0.2 if d-shore>=800 else 0} 1000 0')
            path.write_text('\n'.join(lines))
            row=parse_output(path,spot,bath,timestamp,timestamp)[0]
        self.assertEqual(row["distance"], shore+400)
        self.assertEqual(row["shoreDistance"], 450)
        self.assertEqual(row["shoreDistanceMax"], 500)
        self.assertIsNone(row["breaking"])
        self.assertEqual([p["shoreDistance"] for p in row["profile"]],list(range(0,501,COMPUTE_DX)))
        self.assertEqual(row["profile"][0]["kind"],"land-boundary")
        self.assertEqual(row["profile"][0]["height"],0)
        self.assertEqual(row["profile"][-1]["kind"],"swan-node")
        self.assertGreater(row["profile"][-1]["height"],row["profile"][-2]["height"])
        # 500 m is a real solver sample, not a held/extrapolated 450 m value.
        self.assertAlmostEqual(row["profile"][-1]["height"],1.45)
        bath["elevation"][bath["wetStart"]-1]=None
        with self.assertRaisesRegex(ValueError,"Luka danych"):
            shoreline_reference(spot,bath)
        return row


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
        depths = [None] + [.2 + d*.003 for d in range(0, LENGTH+1, DX)]
        bath = {"wetStart": 1, "depth": depths, "distances": list(range(-100,LENGTH+1,DX)),
                "elevation": [1 if d is None else -d for d in depths]}
        cache = Path(os.environ.get("SWAN_TEST_CACHE", ".forecast-cache"))
        cache.mkdir(parents=True, exist_ok=True)
        executable = install_engine(cache)
        result = simulate(spot, bath, marine, winds, executable, cache, now, hours=6)
        calm = simulate(spot, bath, marine, winds, executable, cache, now, hours=6, calm_test=True)
        self.assertEqual(len(result["hourly"]), 7)
        row = result["hourly"][-1]
        self.assertTrue(0 < row["height"] < 2)
        self.assertTrue(row["period"] > 0)
        self.assertLessEqual(row["shoreDistanceMax"], 500)
        self.assertTrue(row["energyPeriod"] > 0)
        self.assertTrue(math.isfinite(row["powerKWm"]) and row["powerKWm"] >= 0)
        self.assertGreater(abs(row["height"] - calm["hourly"][-1]["height"]), .01,
                           "Changing wind must change the actual SWAN solution, not just a UI rating")
        self.assertTrue(all(0 <= p["qb"] <= 1 for p in row["profile"]))
        self.assertEqual([p["shoreDistance"] for p in row["profile"]],list(range(0,501,50)))
        self.assertEqual(row["profile"][0]["kind"],"land-boundary")
        self.assertEqual(result["grid"]["spacingM"],50)
        self.assertTrue((cache/"reproducibility/test.tar.gz").exists())
        print("SWAN physical check: onshore Hs=", row["height"], "no-wind Hs=", calm["hourly"][-1]["height"])


if __name__ == "__main__":
    unittest.main()
