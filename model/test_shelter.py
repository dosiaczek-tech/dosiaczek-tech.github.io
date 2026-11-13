"""Wind shelter from the surface model: windbreak, short open water behind obstacles, the surfing point."""
import math
import unittest

import shelter
from shelter import FETCH, MAXIMUM, WATER, parse_grid, profile, ray, sampler, surf_point, windbreak

LAT, LON = 54.19, 15.55
CELL = 5  # metres


def grid(height_at, size=900):
    """A square grid centred on (LAT, LON); height_at(x, y) in metres east / north of the centre, above the sea."""
    dlat, dlon = CELL / 110570, CELL / (111320 * math.cos(math.radians(LAT)))
    half = size // 2
    values = [height_at((c - half) * CELL, (half - r) * CELL) + WATER for r in range(size) for c in range(size)]
    return {"west": LON - (half + .5) * dlon, "south": LAT + (half + .5 - size) * dlat, "dx": dlon, "dy": dlat,
            "ncols": size, "nrows": size, "values": values}


class Shelter(unittest.TestCase):
    def test_windbreak_fades_out_by_thirty_heights(self):
        self.assertEqual([round(windbreak(x), 3) for x in (0, 5, 7.5, 10, 20, 30, 40)], [.7, .7, .575, .45, .2, 0, 0])

    def test_a_breakwater_upwind_leaves_little_open_water_for_chop(self):
        # A 4 m wall 100 m west of the surfers, running north-south.
        height = sampler(grid(lambda x, y: 4 if -102 <= x <= -98 else 0))
        along_coast = ray(height, LAT, LON, 270, chop=True)
        self.assertAlmostEqual(along_coast, 1 - math.sqrt(100 / FETCH), places=2)
        self.assertAlmostEqual(ray(height, LAT, LON, 270, chop=False), windbreak(100 / 4), places=3,
                               msg="Offshore wind: only the windbreak counts")
        self.assertEqual(ray(height, LAT, LON, 90, chop=True), 0, "Open water to the east")

    def test_profile_by_direction_only_shelters_the_blocked_sector(self):
        height = sampler(grid(lambda x, y: 4 if -102 <= x <= -98 else 0))
        values = profile(height, (LAT, LON), normal=0)
        self.assertEqual(len(values), 72)
        self.assertGreater(values[270 // 5], .7)
        self.assertEqual(values[90 // 5], 0)
        self.assertTrue(all(0 <= v <= MAXIMUM for v in values))
        # Wind from the south blows from land: a low wall at 100 m barely slows it.
        self.assertLess(values[180 // 5], .25)

    def test_the_surfing_point_moves_from_land_onto_the_water(self):
        # Land (5 m dunes) south of y = 100 m, the sea to the north; the beach faces north.
        height = sampler(grid(lambda x, y: 5 if y < 100 else 0))
        sea = (LAT + 300 / 110570, LON)
        on_land = {"lat": LAT, "lon": LON, "normal": 0}
        lat, lon = surf_point(height, on_land, sea)
        self.assertAlmostEqual((lat - LAT) * 110570, 175, delta=12, msg="Waterline at 100 m, then 75 m out")
        self.assertAlmostEqual(lon, LON)
        at_sea = {"lat": LAT + 200 / 110570, "lon": LON, "normal": 0}
        self.assertEqual(surf_point(height, at_sea, sea), (at_sea["lat"], at_sea["lon"]))
        # A point marked right at the waterline goes out to where the waves break.
        lat, _ = surf_point(height, {"lat": LAT + 110 / 110570, "lon": LON, "normal": 0}, sea)
        self.assertAlmostEqual((lat - LAT) * 110570, 175, delta=6)

    def test_a_spot_on_a_lake_behind_the_beach_is_moved_to_the_sea(self):
        # Lake south of y = 100 m, a 5 m sand barrier up to 200 m, then the sea.
        height = sampler(grid(lambda x, y: 5 if 100 <= y < 200 else 0))
        on_lake = {"lat": LAT + 50 / 110570, "lon": LON, "normal": 0}
        lat, _ = surf_point(height, on_lake, (LAT + 400 / 110570, LON))
        self.assertAlmostEqual((lat - LAT) * 110570, 275, delta=12)

    def test_a_straight_beach_alone_gives_no_chop_shelter_but_a_breakwater_does(self):
        # Coast along y = 0 (5 m dunes to the south), surfers 150 m out; the beach faces north.
        point = (LAT + 150 / 110570, LON)
        values = profile(sampler(grid(lambda x, y: 5 if y < 0 else 0)), point, normal=0)
        self.assertLess(values[100 // 5], .05, "A wind just from the land: its angle already rates the short water")
        self.assertEqual(values[270 // 5], 0)
        mole = profile(sampler(grid(lambda x, y: 5 if y < 0 or (-102 <= x <= -98 and y < 400) else 0)), point, normal=0)
        self.assertGreater(mole[270 // 5], .7, "A breakwater 100 m upwind: the westerly cannot raise chop")
        self.assertGreater(mole[260 // 5], .6)

    def test_parse_the_services_ascii_grid(self):
        text = ("\r\n--wcs\r\nContent-Type: image/x-aaigrid\r\n\r\nncols        2\nnrows        2\nxllcorner    15.5\n"
                "yllcorner    54.1\ndx           0.001\ndy           0.0005\n 0.3 4.1\n 0.25 12\n--wcs--\n")
        parsed = parse_grid(text)
        self.assertEqual((parsed["ncols"], parsed["nrows"], parsed["west"], parsed["south"], parsed["dx"], parsed["dy"]), (2, 2, 15.5, 54.1, .001, .0005))
        self.assertEqual(parsed["values"], [.3, 4.1, .25, 12])
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            parse_grid(text.replace(" 0.25 12\n", ""))

    def test_a_finer_grid_wins_where_both_cover_a_point(self):
        coarse, fine = grid(lambda x, y: 10, size=200), grid(lambda x, y: 2, size=100)
        self.assertAlmostEqual(sampler(fine, coarse)(LAT, LON), 2)
        self.assertAlmostEqual(sampler(fine, coarse)(LAT + 400 / 110570, LON), 10, msg="Outside the fine grid")
        self.assertIsNone(sampler(fine)(LAT + 5000 / 110570, LON))


if __name__ == "__main__":
    unittest.main()
