"""Several offshore wave models at the SWAN boundary and the DMI DKSS sea level."""
from datetime import datetime, timezone
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import requests

import nearshore
from nearshore import (DX, ICE, LENGTH, SEA_LEVEL, SPINUP_HOURS, HISTORY_HOURS, WIND_MODELS, available_end, boundary_models,
                       calculation_grid, central_model, coverage_points, dmi_forecast, install_engine, merge_dmi, models_agree,
                       parse_output, prepare_run, simulate, swan_time, wave_members)


def member(model, height, period=5, direction=330):
    return {"model": model, "height": height, "period": period, "direction": direction}


def iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def coverage(times, xs, ys, values):
    """A DMI CoverageJSON grid; values maps a parameter to f(hour, y, x) -> value or None (land)."""
    axis = lambda a: {"start": a[0], "stop": a[-1], "num": len(a)}
    return {"domain": {"axes": {"t": {"values": [iso(t) for t in times]}, "x": axis(xs), "y": axis(ys)}},
            "ranges": {name: {"axisNames": ["t", "y", "x"], "shape": [len(times), len(ys), len(xs)],
                              "values": [f(t, y, x) for t in range(len(times)) for y in range(len(ys)) for x in range(len(xs))]}
                       for name, f in values.items()}}


class BoundaryModels(unittest.TestCase):
    def test_a_model_that_disagrees_with_the_rest_is_not_chosen(self):
        # Tomorrow at Chałupy: the 25 km GFS cell over the peninsula gives a smaller wave from the north.
        hour = [member("ecmwf_wam", 1.42, 5.5, 329), member("dmi_wam_nsb", 1.34, 6.07, 327),
                member("dwd_ewam", 1.36, 6.1, 336), member("ncep_gfswave025", .9, 6.8, 2)]
        self.assertNotEqual(central_model(hour)["model"], "ncep_gfswave025")
        self.assertNotEqual(boundary_models([hour] * 3)[0]["model"], "ncep_gfswave025")
        self.assertTrue(models_agree(hour), "Without the one model farthest away the others agree")

    def test_two_models_keep_ecmwf_wam_and_a_strong_difference_is_disagreement(self):
        week_two = [member("ecmwf_wam", 1.4), member("ncep_gfswave025", .7)]
        self.assertEqual([m["model"] for m in boundary_models([week_two] * 4)], ["ecmwf_wam"] * 4)
        self.assertFalse(models_agree(week_two))
        self.assertTrue(models_agree([member("ecmwf_wam", 1.4), member("ncep_gfswave025", 1.1)]))
        self.assertFalse(models_agree([member("ecmwf_wam", 1.4, direction=300), member("ncep_gfswave025", 1.3, direction=20)]))
        self.assertTrue(models_agree([member("ecmwf_wam", .2, direction=300), member("ncep_gfswave025", .25, direction=20)]),
                        "The direction of almost flat water does not count")

    def test_spread_models_disagree(self):
        self.assertFalse(models_agree([member("ecmwf_wam", .5), member("dmi_wam_nsb", 1.2), member("dwd_ewam", 2)]))

    def test_the_model_does_not_jump_between_two_almost_equally_central_ones(self):
        hours = []
        for i in range(12):
            # The two middle models trade places every hour by a hair.
            wobble = .01 if i % 2 else -.01
            hours.append([member("ecmwf_wam", 1.0 + wobble), member("dmi_wam_nsb", 1.0 - wobble), member("dwd_ewam", .7), member("ncep_gfswave025", .8)])
        self.assertNotEqual(central_model(hours[0])["model"], central_model(hours[1])["model"], "Hour by hour the central one alternates")
        chosen = [m["model"] for m in boundary_models(hours)]
        self.assertEqual(len(set(chosen)), 1, chosen)

    def test_an_ending_model_hands_over_where_the_waves_meet(self):
        # DMI ends after hour 5; ECMWF WAM approaches it and equals it at hour 3.
        hours = []
        for i in range(8):
            row = [member("ecmwf_wam", [1.6, 1.4, 1.2, 1.0, 1.2, 1.4, 1.6, 1.8][i]), member("ncep_gfswave025", 1.05, 5.1)]
            if i <= 5:
                row.insert(1, member("dmi_wam_nsb", 1.0))
                row.insert(2, member("dwd_ewam", 1.0, 5.2))
            hours.append(row)
        chosen = boundary_models(hours)
        self.assertEqual(chosen[0]["model"], "dmi_wam_nsb")
        self.assertEqual(chosen[-1]["model"], "ecmwf_wam")
        handover = next(i for i, m in enumerate(chosen) if m["model"] == "ecmwf_wam")
        self.assertEqual(handover, 3, "The change happens where both give the same height")

    def test_members_skip_missing_or_impossible_values(self):
        hourly = {"wave_height_ecmwf_wam": [1, None], "wave_period_ecmwf_wam": [5, 5], "wave_direction_ecmwf_wam": [370, 0],
                  "wave_height_dmi_wam_nsb": [1.2, 1], "wave_period_dmi_wam_nsb": [0, 5], "wave_direction_dmi_wam_nsb": [10, 10],
                  "wave_height_dwd_ewam": [0, 0], "wave_period_dwd_ewam": [0, 0], "wave_direction_dwd_ewam": [0, 0]}
        self.assertEqual([(m["model"], m["direction"]) for m in wave_members(hourly, 0)], [("ecmwf_wam", 10), ("dwd_ewam", 0)])
        self.assertEqual([m["model"] for m in wave_members(hourly, 1)], ["dmi_wam_nsb", "dwd_ewam"])

    def test_the_horizon_needs_a_wave_model_every_hour(self):
        times = list(range(0, 10 * 3600, 3600))
        hourly = {"time": times}
        for model, last in [("dwd_ewam", 3), ("dmi_wam_nsb", 6)]:
            for v in ["wave_height", "wave_period", "wave_direction"]:
                hourly[f"{v}_{model}"] = [1.0 if i <= last else None for i in range(len(times))]
        winds = [{"data": {"hourly": {"time": times, **{f"wind_speed_10m_{m}": [5] * len(times) for m in WIND_MODELS},
                                      **{f"wind_direction_10m_{m}": [180] * len(times) for m in WIND_MODELS}}}}] * 3
        self.assertEqual(available_end({"data": {"hourly": hourly}}, winds, 0), 6 * 3600)


class DmiData(unittest.TestCase):
    times = [1794571200 + i * 3600 for i in range(3)]

    def test_nearest_sea_cell_on_a_descending_latitude_axis(self):
        xs, ys = [18.4, 18.5, 18.6], [54.9, 54.8]
        # Land at (54.8, 18.5): the nearest cell with data serves the point next to it.
        land = lambda t, y, x: None if (y, x) == (1, 1) else 10 * t + 3 * y + x
        grid = coverage(self.times, xs, ys, {"significant-wave-height": land})
        near, far = coverage_points(grid, [(54.802, 18.51), (55.5, 18.5)], {"significant-wave-height": "h"})
        self.assertEqual(near["time"], self.times)
        self.assertEqual(near["h"], [3 * 1 + 2 + 10 * t for t in range(3)], "(54.8, 18.6) is nearer than (54.9, 18.5)")
        self.assertIsNone(far, "No cell within reach")

    def test_unexpected_grid_layout_is_rejected(self):
        grid = coverage(self.times, [18.4, 18.5], [54.8, 54.9], {"sea-mean-deviation": lambda t, y, x: .1})
        grid["ranges"]["sea-mean-deviation"]["axisNames"] = ["t", "x", "y"]
        with self.assertRaisesRegex(ValueError, "layout"):
            coverage_points(grid, [(54.8, 18.4)], {"sea-mean-deviation": SEA_LEVEL})

    def respond(self, failing=()):
        latest, older = self.times[1], self.times[0] - 3 * 3600
        def get(url, params, session):
            if any(part in url for part in failing):
                raise requests.ConnectionError("down")
            response = mock.Mock()
            if url.endswith("/wam_nsb/cube"):
                values = {"significant-wave-height": lambda t, y, x: 1 + t / 10, "mean-wave-period": lambda t, y, x: 6, "mean-wave-dir": lambda t, y, x: 330,
                          "significant-totalswell-height": lambda t, y, x: .4, "mean-totalswell-period": lambda t, y, x: 7, "mean-totalswell-dir": lambda t, y, x: 340,
                          "significant-windwave-height": lambda t, y, x: .8, "mean-windwave-period": lambda t, y, x: 4, "mean-windwave-dir": lambda t, y, x: 300}
                asked = params["parameter-name"].split(",")
                response.json.return_value = coverage(self.times, [18.4, 18.5], [54.8, 54.9], {name: values[name] for name in asked})
            elif url.endswith("/dkss_nsbs/instances"):
                response.json.return_value = {"instances": [{"id": "2026-11-13T060000Z"}, {"id": "2026-11-13T120000Z"}, {"id": "2026-11-12T180000Z"}]}
            elif "2026-11-13T120000Z" in url:
                response.json.return_value = coverage([latest + i * 3600 for i in range(3)], [18.4, 18.5], [54.8, 54.9],
                                                      {"sea-mean-deviation": lambda t, y, x: .4, "ice-concentration": lambda t, y, x: .2})
            elif "2026-11-12T180000Z" in url:
                response.json.return_value = coverage([older + i * 3600 for i in range(6)], [18.4, 18.5], [54.8, 54.9],
                                                      {"sea-mean-deviation": lambda t, y, x: .1, "ice-concentration": lambda t, y, x: 0})
            else:
                raise AssertionError(url)
            return response
        return get

    def test_latest_sea_level_wins_and_the_oldest_run_covers_the_past(self):
        with mock.patch.object(nearshore, "request", side_effect=self.respond()) as get:
            (entry,), warnings = dmi_forecast([(54.81, 18.42)])
        self.assertEqual(warnings, [])
        self.assertEqual(entry["waves"]["wave_height_dmi_wam_nsb"], [1, 1.1, 1.2])
        older = self.times[0] - 3 * 3600
        self.assertEqual(entry["seaLevel"], {older: .1, older + 3600: .1, older + 7200: .1, self.times[0]: .1, self.times[1]: .4,
                                             self.times[1] + 3600: .4, self.times[1] + 7200: .4})
        self.assertEqual(len(get.call_args_list), 6, "One request per grid, not per spot: three for the waves, three for the sea level")
        self.assertEqual(entry["waves"]["swell_wave_height_dmi_wam_nsb"], [.4, .4, .4])
        self.assertEqual(entry["waves"]["wind_wave_period_dmi_wam_nsb"], [4, 4, 4])
        self.assertEqual(entry["ice"][self.times[1]], .2, "Sea ice comes with the sea level")
        self.assertEqual(entry["ice"][self.times[0]], 0)

    def test_a_failed_source_is_left_out_without_inventing_it(self):
        with mock.patch.object(nearshore, "request", side_effect=self.respond(failing=("wam_nsb",))), mock.patch.object(nearshore.time, "sleep"):
            (entry,), warnings = dmi_forecast([(54.81, 18.42)])
        self.assertNotIn("waves", entry)
        self.assertIn(.4, entry["seaLevel"].values())
        self.assertEqual(warnings, ["DMI WAM download failed: ConnectionError"])
        with mock.patch.object(nearshore, "request", side_effect=self.respond(failing=("2026-11-12T180000Z",))):
            (entry,), warnings = dmi_forecast([(54.81, 18.42)])
        self.assertEqual(set(entry["seaLevel"].values()), {.4}, "Without the older run only the latest remains")
        with mock.patch.object(nearshore, "request", side_effect=self.respond(failing=("2026-11-13T120000Z",))):
            (entry,), warnings = dmi_forecast([(54.81, 18.42)])
        self.assertNotIn("seaLevel", entry, "An older run alone does not stand in for the forecast")

    def test_merge_aligns_to_the_open_meteo_hours(self):
        bundle = {"fetchedAt": 100, "data": {"hourly": {"time": [self.times[0] - 3600, *self.times], "wave_height_ecmwf_wam": [1] * 4}}}
        extra = {"fetchedAt": 90, "waves": {"time": self.times[:2], "wave_height_dmi_wam_nsb": [1.1, 1.2],
                                            "wave_period_dmi_wam_nsb": [6, 6], "wave_direction_dmi_wam_nsb": [330, 331]},
                 "seaLevel": {self.times[1]: .3}, "ice": {self.times[0]: .4}}
        merged = merge_dmi(bundle, extra)
        hourly = merged["data"]["hourly"]
        self.assertEqual(hourly["wave_height_dmi_wam_nsb"], [None, 1.1, 1.2, None])
        self.assertEqual(hourly[SEA_LEVEL], [None, None, .3, None])
        self.assertEqual(hourly[ICE], [None, .4, None, None])
        self.assertEqual(merged["dmiFetchedAt"], 90)
        self.assertNotIn("wave_height_dmi_wam_nsb", bundle["data"]["hourly"], "The downloaded bundle stays as it was")
        self.assertIs(merge_dmi(bundle, {"fetchedAt": 90}), bundle)
        self.assertIsNone(merge_dmi(None, extra))


def transect():
    spot = {"id": "test", "lat": 54.8, "lon": 18.4, "normal": 0}
    depths = [None] + [.2 + d * .003 for d in range(0, LENGTH + 1, DX)]
    bath = {"wetStart": 1, "depth": depths, "distances": list(range(-100, LENGTH + 1, DX)), "elevation": [1 if d is None else -d for d in depths]}
    return spot, bath


def inputs(times, levels=None):
    count = len(times)
    hourly = {"time": times}
    for model, height, direction in [("ecmwf_wam", .9, 20), ("dmi_wam_nsb", 1.0, 0), ("dwd_ewam", 1.05, 0), ("ncep_gfswave025", .4, 0)]:
        hourly.update({f"wave_height_{model}": [height] * count, f"wave_period_{model}": [5] * count, f"wave_direction_{model}": [direction] * count})
    if levels is not None:
        hourly[SEA_LEVEL] = levels
    weather = {"time": times}
    for model in WIND_MODELS:
        weather.update({f"wind_speed_10m_{model}": [6] * count, f"wind_direction_10m_{model}": [0] * count, f"wind_gusts_10m_{model}": [8] * count})
    return {"fetchedAt": times[-1], "data": {"hourly": hourly}}, [{"fetchedAt": times[-1], "data": {"hourly": weather}} for _ in range(3)]


class SwanInput(unittest.TestCase):
    def test_the_boundary_uses_the_chosen_model_and_the_sea_level_is_read_every_hour(self):
        spot, bath = transect()
        times = list(range(1792497600, 1792497600 + 4 * 3600, 3600))
        marine, winds = inputs(times, levels=[None, .35, None, .2])
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            boundary, _, chunks = prepare_run(directory, spot, bath, marine, winds, times[0], times[-1])
            spectra = (directory / "boundary.sp2").read_text()
            self.assertTrue(spectra.startswith("SWAN   1"))
            self.assertEqual(spectra.count("FACTOR"), 4, "One spectrum per hour")
            # DMI WAM is the central one: 0.4 m is far off and ECMWF WAM comes from 20°.
            self.assertIn("boundary.sp2", chunks[0]["input"])
            self.assertEqual(boundary["choices"][times[0]], {"model": "dmi_wam_nsb", "models": 4, "agree": True})
            self.assertEqual(boundary["levels"], {times[0]: None, times[1]: .35, times[2]: None, times[3]: .2})
            self.assertIn("INPGRID WLEVEL REGULAR", chunks[0]["input"])
            self.assertEqual(chunks[0]["input"].count("READINP WLEVEL"), 3)
            # Each step carries the level of the hour it ends with, which SWAN reports for that hour.
            self.assertEqual((directory / "level000.dat").read_text(), "0.350 0.350\n")
            self.assertEqual((directory / "level001.dat").read_text(), "0.000 0.000\n", "An hour without DKSS keeps level 0")
            self.assertEqual((directory / "level002.dat").read_text(), "0.200 0.200\n")
        marine, winds = inputs(times)
        with tempfile.TemporaryDirectory() as temp:
            boundary, _, chunks = prepare_run(Path(temp), spot, bath, marine, winds, times[0], times[-1])
            self.assertNotIn("WLEVEL", chunks[0]["input"], "Without DKSS the run is exactly as before")
            self.assertFalse(list(Path(temp).glob("level*.dat")))

    def table(self, spot, bath, timestamp, level):
        """A SWAN table of the transect at one sea level: cells shallower than depmin are dry (exception values)."""
        coast, distances, depths = calculation_grid(spot, bath)
        lines = []
        for d, z in zip(distances, depths):
            wet = z + level > .05
            lines.append(f"{swan_time(timestamp)} {LENGTH - d} {z + level if wet else -99} {.5 + (d - coast['distance']) / 2000 if wet else -9} "
                         f"{5 if wet else -9} {6 if wet else -9} {270 if wet else -9} 0 1000 0")
        return "\n".join(lines)

    def parse(self, level):
        distances = list(range(-1000, LENGTH + 1, DX))
        depth = [None if d < 0 else .5 + d * .0018 for d in distances]
        bath = {"depth": depth, "distances": distances, "wetStart": distances.index(0), "elevation": [1 if d is None else -d for d in depth]}
        spot, timestamp = {"lat": 54.35, "lon": 18.831, "normal": 0}, 1792497600
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "profile.tbl"
            path.write_text(self.table(spot, bath, timestamp, level))
            return parse_output(path, spot, bath, timestamp, timestamp, levels={timestamp: level},
                                choices={timestamp: {"model": "ecmwf_wam", "models": 2, "agree": True}}, ice={timestamp: .2})[0]

    def test_a_raised_sea_level_deepens_the_point_and_keeps_the_shore_at_zero(self):
        row = self.parse(.4)
        self.assertEqual(row["shoreDistance"], 450)
        self.assertAlmostEqual(row["depth"], .5 + 400 * .0018 + .4, places=3)
        self.assertEqual(row["seaLevel"], .4)
        self.assertEqual(row["boundary"]["model"], "ecmwf_wam")
        self.assertEqual(row["ice"], .2)
        self.assertEqual(row["profile"][0]["kind"], "land-boundary")
        self.assertTrue(all(p["kind"] == "swan-node" for p in row["profile"][1:]))

    def test_a_low_sea_level_dries_the_shallow_cells(self):
        row = self.parse(-.6)
        self.assertEqual([p["kind"] for p in row["profile"][:3]], ["land-boundary", "dry-model-node", "dry-model-node"])
        self.assertTrue(all(p["depth"] == 0 for p in row["profile"][1:3]))
        self.assertAlmostEqual(row["depth"], .5 + 400 * .0018 - .6, places=3)

    def test_a_point_left_dry_has_no_wave_that_hour_but_the_run_survives(self):
        row = self.parse(-1.3)
        self.assertTrue(row["dry"])
        self.assertEqual((row["height"], row["depth"], row["powerKWm"]), (0, 0, 0))
        self.assertIsNone(row["period"])
        self.assertEqual(row["shoreDistance"], 450, "The point does not move to wetter water")


@unittest.skipUnless(os.environ.get("SWAN_INTEGRATION") == "1", "Set SWAN_INTEGRATION=1 to execute the real solver")
class SwanSeaLevel(unittest.TestCase):
    def test_the_sea_level_changes_the_actual_solution(self):
        now = 1792497600
        start = now - (SPINUP_HOURS + HISTORY_HOURS) * 3600
        times = list(range(start, now + 6 * 3600 + 1, 3600))
        spot, bath = transect()
        cache = Path(os.environ.get("SWAN_TEST_CACHE", ".forecast-cache"))
        cache.mkdir(parents=True, exist_ok=True)
        executable = install_engine(cache)
        # The surge rises and falls by the hour; the last hour is +0.5 m.
        levels = [round(.5 - .1 * ((len(times) - 1 - i) % 5), 3) for i in range(len(times))]
        marine, winds = inputs(times)
        raised_marine, _ = inputs(times, levels)
        flat = simulate(spot, bath, marine, winds, executable, cache, now, hours=6)
        raised = simulate(spot, bath, raised_marine, winds, executable, cache, now, hours=6)
        level_at = dict(zip(times, levels))
        for before, after in zip(flat["history"] + flat["hourly"], raised["history"] + raised["hourly"]):
            self.assertEqual(before["distance"], after["distance"], "The point stays where the bottom puts it")
            self.assertAlmostEqual(after["depth"] - before["depth"], level_at[after["time"]], places=2,
                                   msg="Every published hour has the water of that hour, not of the hour before")
            self.assertEqual(after["seaLevel"], round(level_at[after["time"]], 3))
        before, after = flat["hourly"][-1], raised["hourly"][-1]
        self.assertAlmostEqual(after["seaLevel"], .5)
        self.assertGreater(abs(after["height"] - before["height"]), .01, "More water must change the SWAN solution")
        self.assertIsNone(flat["seaLevelModel"])
        self.assertEqual(raised["seaLevelModel"], "dmi_dkss_nsbs")
        self.assertNotEqual(flat["inputHash"], raised["inputHash"])
        print("SWAN sea level check: Hs at 0 m", before["height"], "at +0.5 m", after["height"])


if __name__ == "__main__":
    unittest.main()
