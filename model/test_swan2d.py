"""SWAN 2D areas: the grid along the coast, the sea bed, breakwaters, 1D-shaped records and the merge into the spots."""
import math
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import swan2d
from nearshore import install_engine
from swan2d import Frame, elevation, layout, merge, node, read_table, reported_bed, simplify, spot_rows
from test_waves_sealevel import inputs

COAST = {"landDistance": -50, "waterDistance": 50, "distance": 0}


def bed(depth_at, west=18.37, south=54.79, east=18.43, north=54.84):
    """A raster like EMODnet's (elevation, negative under water), depth_at(lat, lon) in metres."""
    d = 1 / 960
    rows, cols = round((north - south) / d), round((east - west) / d)
    return {"west": west, "north": north, "dx": d, "dy": d,
            "values": [[-depth_at(north - (r + .5) * d, west + (c + .5) * d) for c in range(cols)] for r in range(rows)]}


def beach(lat, lon):
    """A straight coast along 54.80 N, the sea to the north deepening 1 m per 100 m, land 2 m high."""
    metres = (lat - 54.8) * 110570
    return metres / 100 if metres > 0 else -2


def profile(lat, lon):
    """The 11 points 0-500 m north of the shore."""
    return [(d, lat + d / 110570, lon) for d in range(0, 501, 50)]


class Geometry(unittest.TestCase):
    def test_metres_round_trip(self):
        frame = Frame(54.5, 18.0)
        self.assertEqual(frame.xy(54.5, 18.0), (0, 0))
        lat, lon = frame.latlon(*frame.xy(54.52, 18.07))
        self.assertAlmostEqual(lat, 54.52, places=9)
        self.assertAlmostEqual(lon, 18.07, places=9)

    def test_the_grid_lies_along_the_coast_with_the_sea_on_its_far_side(self):
        spots = [{"id": "a", "normal": 0}, {"id": "b", "normal": 0}]
        grid = layout(spots, {"a": {"lat": 54.8, "lon": 18.39}, "b": {"lat": 54.8, "lon": 18.41}})
        self.assertAlmostEqual(grid["turn"], 0, places=6)
        width = 1300 + 2 * swan2d.MARGIN   # 0.02 deg of longitude at 54.8 N is ~1280 m
        self.assertAlmostEqual(grid["mx"] * swan2d.CELL, width, delta=swan2d.CELL)
        self.assertEqual(grid["my"] * swan2d.CELL, swan2d.LANDWARD + swan2d.SEAWARD)
        lat, _ = grid["frame"].latlon(*node(grid, 0, grid["my"]))
        self.assertAlmostEqual((lat - 54.8) * 110570, swan2d.SEAWARD, delta=1, msg="The outer side is 5 km off the shore")
        east = layout([{"id": "e", "normal": 90}], {"e": {"lat": 54.8, "lon": 18.4}})
        self.assertAlmostEqual(east["turn"], -90, places=6, msg="Sea to the east: the grid's x axis points south")
        x, _ = node(east, 0, east["my"])
        self.assertAlmostEqual(x, swan2d.SEAWARD, delta=1)

    def test_spread_shores_set_the_direction_of_the_grid(self):
        # Shores on a line 10 degrees north of east, 6 km long; the spots' own normals say 335.
        frame = Frame(54.19, 15.6)
        shores = {k: dict(zip(("lat", "lon"), frame.latlon(d * math.cos(math.radians(10)), d * math.sin(math.radians(10)))))
                  for k, d in (("a", -3000), ("b", 0), ("c", 3000))}
        grid = layout([{"id": k, "normal": 335} for k in shores], shores)
        self.assertAlmostEqual(grid["normal"], 350, places=6, msg="Square to the coast, on the side of the sea")
        self.assertEqual(grid["my"] * swan2d.CELL, swan2d.LANDWARD + swan2d.SEAWARD, "The shores all lie on one grid line")

    def test_the_bed_is_interpolated_between_cell_centres_and_skips_missing_cells(self):
        flat = bed(lambda lat, lon: 4.0)
        self.assertAlmostEqual(elevation(flat, 54.81, 18.40), -4)
        holes = dict(flat, values=[[None if c % 2 else v for c, v in enumerate(row)] for row in flat["values"]])
        self.assertAlmostEqual(elevation(holes, 54.81, 18.40), -4)
        self.assertIsNone(elevation(flat, 55.5, 18.40), "Outside the raster")

    def test_breakwater_outlines_are_simplified(self):
        straight = [(x, 0.0) for x in range(0, 101, 10)]
        self.assertEqual(simplify(straight, 5), [(0, 0.0), (100, 0.0)])
        corner = [(0, 0), (50, 1), (100, 0), (100, 100)]
        self.assertEqual(simplify(corner, 5), [(0, 0), (100, 0), (100, 100)])


def table(time, rows):
    return {time: rows}


def point(depth, height=.8, period=4.5, energy=5.5, direction=350, qb=0, peak=6.5):
    """A SWAN 2D table row: XP YP DEPTH HSIGN TM01 TMM10 DIR QB TRANSPx TRANSPy TPS."""
    return [0, 0, depth, height, period, energy, direction, qb, 300, 400, peak]


DRY = [0, 0, -99, -9, -9, -9, -999, -9, 0, 0, -9]


class Records(unittest.TestCase):
    def setUp(self):
        self.points = profile(54.8, 18.4)
        self.depths = [0, .6, 1.1, 1.6, 2.1, 2.6, 3.1, 3.6, 4.1, 4.6, 5.1]
        self.boundary = {"levels": {100: .2}, "choices": {100: {"model": "ecmwf_wam", "models": 4, "agree": True}}}

    def test_the_records_have_the_1d_shape_and_point(self):
        rows = [DRY] + [point(d) for d in self.depths[1:]]
        rows[3] = point(1.6, qb=.2)
        [record] = spot_rows(table(100, rows), self.points, self.depths, COAST, 100, 100, self.boundary)
        self.assertEqual(record["shoreDistance"], 200, "The first point no deeper than 2 m from the sea: 2.1 m at 200 m")
        self.assertEqual(record["depth"], 2.1)
        self.assertEqual(record["direction"], 350)
        self.assertEqual(record["powerKWm"], .5)
        self.assertEqual(record["peakPeriod"], 6.5)
        self.assertEqual(record["seaLevel"], .2)
        self.assertEqual(record["boundary"]["model"], "ecmwf_wam")
        self.assertEqual([p["shoreDistance"] for p in record["profile"]], list(range(0, 501, 50)))
        self.assertEqual(record["profile"][0]["kind"], "land-boundary")
        self.assertEqual({p["kind"] for p in record["profile"][1:]}, {"swan-node"})
        self.assertEqual(record["breaking"]["shoreDistance"], 150)
        self.assertEqual((record["shoreDistanceMin"], record["shoreDistanceMax"]), (150, 250))

    def test_a_point_dried_by_a_low_sea_and_incomplete_output(self):
        wet = [DRY] + [point(d) for d in self.depths[1:]]
        dry = [DRY, DRY] + [point(d) for d in self.depths[2:]]
        dry[4] = DRY
        hours = [100 + h * 3600 for h in range(20)]
        records = spot_rows({t: dry if t == hours[0] else wet for t in hours}, self.points, self.depths, COAST, hours[0], hours[-1], self.boundary)
        self.assertTrue(records[0]["dry"])
        self.assertEqual((records[0]["height"], records[0]["depth"]), (0, 0))
        self.assertEqual(records[0]["profile"][4]["kind"], "dry-model-node")
        self.assertNotIn("dry", records[1])
        mostly = {t: dry if t in hours[:3] else wet for t in hours}
        self.assertIsNone(spot_rows(mostly, self.points, self.depths, COAST, hours[0], hours[-1], self.boundary), "Dry in 3 of 20 hours")
        self.assertIsNone(spot_rows(table(100, wet[:-1]), self.points, self.depths, COAST, 100, 100, self.boundary))
        self.assertIsNone(spot_rows(table(100, wet), self.points, self.depths, COAST, 100, 3700, self.boundary), "An hour missing")
        self.assertIsNone(spot_rows(table(100, wet), self.points, [5] * 11, COAST, 100, 100, self.boundary), "No point in 0.3-4 m")

    def test_the_bed_is_what_swan_reported(self):
        # SWAN leaves out a point in a cell touching land (here the third one) even though the bed under it is wet.
        rows = lambda level: [DRY, DRY, DRY] + [point(d + level) for d in self.depths[3:]]
        table = {100: rows(.5), 3700: rows(-.2)}
        bed = reported_bed(table, {100: .5, 3700: -.2}, 11)
        self.assertEqual(bed[:3], [0, 0, 0])
        self.assertAlmostEqual(bed[3], 1.6)
        self.assertAlmostEqual(bed[10], 5.1)

    def test_the_table_reader(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "p00.tbl"
            path.write_text("20261114.000000 1 2 3.0 0.5 4 5 300 0 10 20 6\n20261114.000000 1 2 2.0 0.4 4 5 300 0 10 20 6\n")
            rows = read_table(path)
        self.assertEqual(list(rows), [1794614400])
        self.assertEqual([r[2] for r in rows[1794614400]], [3.0, 2.0])


class Merge(unittest.TestCase):
    def test_the_2d_hours_replace_the_1d_ones_and_the_ice_stays(self):
        document = {"spot": {"id": "a"}, "assumptions": ["1D transect"],
                    "history": [{"time": 0, "height": .5, "ice": 0}], "hourly": [{"time": 3600, "height": .6, "ice": .2}, {"time": 7200, "height": .7}]}
        area = {"id": "x", "name": "X", "from": 0, "to": 3600, "cellM": 100, "timeStepMinutes": 30, "obstacles": 2,
                "spots": {"a": [{"time": 0, "height": .4}, {"time": 3600, "height": .3}]}}
        merged = merge(document, area)
        self.assertEqual([r["height"] for r in merged["history"] + merged["hourly"]], [.4, .3, .7])
        self.assertEqual(merged["hourly"][0]["ice"], .2)
        self.assertEqual(merged["area2d"]["id"], "x")
        self.assertIn("2D SWAN", merged["assumptions"][-1])
        self.assertIs(merge({**document, "spot": {"id": "b"}}, area)["hourly"], document["hourly"], "Other spots stay 1D")
        self.assertIs(merge(document, None), document)


@unittest.skipUnless(os.environ.get("SWAN_INTEGRATION") == "1", "Set SWAN_INTEGRATION=1 to execute the real solver")
class SwanBreakwater(unittest.TestCase):
    def test_a_breakwater_shelters_the_beach_behind_it(self):
        cache = Path(os.environ.get("SWAN_TEST_CACHE", ".forecast-cache"))
        cache.mkdir(parents=True, exist_ok=True)
        executable = install_engine(cache)
        start = 1792497600
        times = list(range(start, start + 8 * 3600 + 1, 3600))
        marine, winds = inputs(times)
        with mock.patch.object(swan2d, "MARGIN", 1500), mock.patch.object(swan2d, "SEAWARD", 2500):
            grid = layout([{"id": "a", "normal": 0}], {"a": {"lat": 54.8, "lon": 18.4}})
            sea = bed(beach)
            # A 700 m breakwater 300 m off the shore, west of 18.40.
            wall = [grid["frame"].xy(54.8 + 300 / 110570, lon) for lon in (18.385, 18.396)]
            behind, open_beach = profile(54.8, 18.391), profile(54.8, 18.41)
            with tempfile.TemporaryDirectory(dir=cache) as temp:
                directory = Path(temp)
                swan2d.prepare(directory, grid, sea, [wall], [behind, open_beach], marine, [winds], start, times[-1], times[-2])
                swan2d.run(directory, executable)
                sheltered, exposed = read_table(directory / "p00.tbl"), read_table(directory / "p01.tbl")
        at = times[-1]
        # 150 m off the shore (index 3): in the lee of the breakwater against the open beach.
        self.assertGreater(exposed[at][3][3], .4)
        self.assertLess(sheltered[at][3][3], .6 * exposed[at][3][3])


if __name__ == "__main__":
    unittest.main()
