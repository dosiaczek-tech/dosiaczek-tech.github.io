"""Hazard notes from map objects near a spot."""
import math
import unittest

from hazards import GROYNES, HARBOUR, MOUTH, STRUCTURE, distance, notes

LAT, LON = 54.19, 15.55


def way(tags, *offsets):
    """A way through points given in metres east / north of the spot."""
    geometry = [{"lat": LAT + north / 110570, "lon": LON + east / (111320 * math.cos(math.radians(LAT)))} for east, north in offsets]
    return {"type": "way", "tags": tags, "geometry": geometry}


class Hazards(unittest.TestCase):
    def test_distance_to_the_outline_not_to_the_corners(self):
        self.assertAlmostEqual(distance(LAT, LON, way({}, (-500, 100), (500, 100))), 100, delta=1)
        harbour = {"type": "relation", "tags": {"harbour": "yes"}, "bounds": {"minlat": LAT + .005, "maxlat": LAT + .01, "minlon": LON - .01, "maxlon": LON + .01}}
        self.assertAlmostEqual(distance(LAT, LON, harbour), .005 * 110570, delta=2)

    def test_notes_for_a_spot_next_to_a_harbour(self):
        spot = {"lat": LAT, "lon": LON}
        found = notes(spot, [way({"harbour": "yes"}, (-900, 0), (-700, 0)), way({"man_made": "breakwater"}, (-150, 0), (-150, 400)),
                             way({"waterway": "river"}, (-600, -500), (-600, 0)), way({"man_made": "groyne"}, (50, 0), (50, 60))])
        self.assertEqual(found, [HARBOUR[1], MOUTH[1], STRUCTURE[1], GROYNES[1]])

    def test_a_harbour_without_a_breakwater_and_far_structures_give_no_notes(self):
        spot = {"lat": LAT, "lon": LON}
        self.assertEqual(notes(spot, [way({"harbour": "yes"}, (-900, 0), (-700, 0)), way({"man_made": "pier"}, (600, 0), (600, 200))]), [])


if __name__ == "__main__":
    unittest.main()
