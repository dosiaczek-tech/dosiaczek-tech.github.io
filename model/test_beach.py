"""The beach slope at the waterline from the LiDAR surface model: the run-up band, noise in the water, walls."""
import math
import unittest
from unittest import mock

import beach
from beach import HIGH, LOW, REACH, line_slope, spot_beach

SEA_SURFACE = .3


def profile(shore, slope, noise=lambda d: 0):
    """Heights every metre from REACH m seawards to REACH m landwards (index 0 = the sea end); the beach starts at
    `shore` metres seaward of the spot and rises with `slope`, then flattens at 3 m."""
    heights = []
    for d in range(REACH, -REACH - 1, -1):
        rise = (shore - d) * slope
        heights.append(SEA_SURFACE + noise(d) if rise <= 0 else SEA_SURFACE + min(3, rise))
    return heights


class LineSlope(unittest.TestCase):
    def test_a_plain_beach(self):
        self.assertAlmostEqual(line_slope(profile(50, .05)), .05, delta=.003)
        self.assertAlmostEqual(line_slope(profile(-100, 1 / 12)), 1 / 12, delta=.005)

    def test_waves_stones_and_piles_in_the_water_do_not_count_as_the_beach(self):
        # Crests and stones up to 1.5 m above the sea, a few metres long, all over the water.
        noisy = profile(20, .05, noise=lambda d: 1.5 if d % 37 < 4 else .4 if d % 11 < 3 else 0)
        self.assertAlmostEqual(line_slope(noisy), .05, delta=.003)

    def test_a_wall_is_not_a_beach_face(self):
        self.assertIsNone(line_slope(profile(0, 2.0)), "A seawall rises 1 m in under 2 m")

    def test_a_line_that_does_not_start_on_the_sea(self):
        self.assertIsNone(line_slope([2.0] * (2 * REACH + 1)))
        self.assertIsNone(line_slope([None] * (2 * REACH + 1)))

    def test_the_band_is_measured_from_the_sea_surface_of_the_scan(self):
        # The same beach seen at a higher sea surface during the flight.
        raised = [h + .4 for h in profile(30, .04)]
        self.assertAlmostEqual(line_slope(raised), .04, delta=.003)
        self.assertEqual((LOW, HIGH), (.3, 1.3))


class SpotBeach(unittest.TestCase):
    def spot(self, height_north):
        """A spot facing north; height_north(y) in metres north of the spot."""
        spot = {"id": "test", "lat": 54.5, "lon": 18.0, "normal": 0}
        heights = lambda lat, lon: height_north((lat - spot["lat"]) * 110570)
        with mock.patch.object(beach, "heights", return_value=heights):
            return spot_beach(spot, None)

    def test_the_median_of_the_lines_across_the_beach(self):
        entry = self.spot(lambda y: SEA_SURFACE if y > 40 else SEA_SURFACE + min(3, (40 - y) * .06))
        self.assertEqual(entry["lines"], 7)
        self.assertAlmostEqual(entry["slope"], .06, delta=.004)
        self.assertEqual({k: entry[k] for k in ("lat", "lon", "normal")}, {"lat": 54.5, "lon": 18.0, "normal": 0})

    def test_no_beach_no_entry(self):
        self.assertIsNone(self.spot(lambda y: SEA_SURFACE if y > 0 else 6), "A wall along the whole spot")
        self.assertIsNone(self.spot(lambda y: SEA_SURFACE), "Only water")


if __name__ == "__main__":
    unittest.main()
