"""Regressions for the forecast point, including two real SWAN output tables."""
import json
from pathlib import Path
import tempfile
import unittest

from nearshore import LENGTH, parse_output, summary_location

FIXTURES = Path(__file__).parent / "fixtures" / "seaward2m"


class SeawardSelection(unittest.TestCase):
    def choose(self, points, offset=0):
        # Nominal shore at zero; the conservative wet range is 50..450 m.
        coast = {"distance": offset, "landDistance": offset - 50, "waterDistance": offset + 50}
        return summary_location(coast, [d + offset for d, _ in points], [z for _, z in points]) - offset

    def test_does_not_cross_a_bar_to_find_a_closer_depth_in_the_inner_trough(self):
        points = [(50, 2.26), (150, 2.5), (250, .34), (300, 1.33), (350, 2.32), (400, 3.12), (450, 3.92)]
        self.assertEqual(self.choose(points), 350)
        self.assertEqual(self.choose(points, offset=900), 350)

    def test_monotonic_profile_keeps_the_nearest_depth_and_never_uses_a_point_beyond_500(self):
        self.assertEqual(self.choose([(50, .5), (150, 1), (250, 1.8), (350, 2.4), (450, 3.2)]), 250)
        # 500 m nominal is 550 m from the landward edge: not an admissible summary.
        self.assertEqual(self.choose([(50, .5), (150, .8), (250, 1), (350, 1.2), (450, 1.5), (500, 2)]), 450)

    def test_equal_depths_and_ties_choose_the_seaward_node_without_numeric_jitter(self):
        self.assertEqual(self.choose([(50, 1), (150, 2.2), (250, 2.2), (350, 3), (450, 4)]), 250)
        self.assertEqual(self.choose([(50, .5), (150, 1.8), (250, 2.2), (350, 3)]), 250)

    def test_shallow_outer_edge_does_not_jump_into_a_deeper_inner_pool(self):
        self.assertEqual(self.choose([(50, 1), (150, 2), (250, 1.7), (350, 1.3), (450, .8)]), 450)
        with self.assertRaisesRegex(ValueError, "Brak poprawnego punktu"):
            self.choose([(50, 1), (150, 2), (250, .2), (350, .02), (450, .02)])

    def test_no_2m_contour_uses_a_valid_shallow_point_or_rejects_a_deep_profile(self):
        self.assertEqual(self.choose([(50, 2.7), (150, 2.9), (250, 3.2), (350, 4.1)]), 50)
        with self.assertRaisesRegex(ValueError, "Brak poprawnego punktu"):
            self.choose([(50, 5), (150, 6), (250, 7), (350, 8)])

    def read(self, name, transform=None):
        source = json.loads((FIXTURES / f"{name}.json").read_text())
        table = (FIXTURES / f"{name}.tbl").read_text()
        if transform:
            table = "\n".join(" ".join(transform(line.split())) for line in table.splitlines())
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "profile.tbl"
            path.write_text(table)
            return parse_output(path, source["spot"], source["bathymetry"], source["time"], source["time"])[0]

    def test_real_jantar_case_uses_one_unmodified_seaward_spectrum_for_all_metrics(self):
        row = self.read("jantar")
        self.assertEqual(row["shoreDistance"], 350)
        self.assertEqual(row["depth"], 2.32)
        self.assertEqual(row["height"], 1.188)
        self.assertEqual(row["period"], 5.516)
        self.assertEqual(row["direction"], 350.1)
        self.assertAlmostEqual(row["powerKWm"], 3.491, places=4)
        self.assertEqual(row["breaking"]["shoreDistance"], 250)
        self.assertEqual(row["profile"][1]["height"], .244, "Attenuation behind the bar remains visible")
        self.assertLess(row["height"], max(p["height"] for p in row["profile"]), "Do not select the largest wave")

    def test_real_stegna_case_keeps_its_point_and_the_dry_bar(self):
        row = self.read("stegna")
        self.assertEqual(row["shoreDistance"], 250)
        self.assertEqual(row["height"], 1.242)
        self.assertEqual(row["period"], 5.562)
        self.assertEqual(row["profile"][3]["kind"], "dry-model-node")

    def test_calm_water_does_not_move_the_point_or_resurrect_larger_inner_waves(self):
        def calm(parts):
            if float(parts[1]) == LENGTH - 300:  # Jantar, nominal 350 m from shore.
                for index in [3, 4, 5, 6, 8, 9]:
                    parts[index] = "0"
            return parts
        row = self.read("jantar", calm)
        self.assertEqual(row["shoreDistance"], 350)
        self.assertEqual(row["height"], 0)
        self.assertEqual(row["powerKWm"], 0)
        self.assertIsNone(row["period"])

    def test_missing_selected_node_does_not_fall_back_to_the_inner_trough(self):
        def missing(parts):
            if float(parts[1]) == LENGTH - 300:
                parts[2], parts[3] = "-99", "-9"
            return parts
        with self.assertRaisesRegex(ValueError, "Incomplete SWAN profile"):
            self.read("jantar", missing)


if __name__ == "__main__":
    unittest.main()
