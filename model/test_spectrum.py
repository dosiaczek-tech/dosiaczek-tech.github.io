"""The boundary spectrum: swell and wind sea as two peaks, SWAN's spectral file and the peak period at the spot."""
import math
from pathlib import Path
import tempfile
import unittest

from nearshore import (MEAN_TO_PEAK, SPECTRUM_DIRECTIONS, SPECTRUM_FREQUENCIES, boundary_spectrum, local_direction,
                       parse_output, prepare_run, swan_time, wave_members, write_spectra)
from test_waves_sealevel import inputs, transect


def height(spectrum):
    f = SPECTRUM_FREQUENCIES
    variance = sum((sum(spectrum[i]) + sum(spectrum[i + 1])) / 2 * 10 * (f[i + 1] - f[i]) for i in range(len(f) - 1))
    return 4 * math.sqrt(variance)


def peak(spectrum):
    return 1 / SPECTRUM_FREQUENCIES[max(range(len(spectrum)), key=lambda i: sum(spectrum[i]))]


def heading(spectrum):
    return SPECTRUM_DIRECTIONS[max(range(len(SPECTRUM_DIRECTIONS)), key=lambda j: sum(row[j] for row in spectrum))]


class Spectrum(unittest.TestCase):
    def test_one_peak_keeps_the_height_the_period_and_the_direction(self):
        spectrum = boundary_spectrum({"model": "ecmwf_wam", "height": 1.2, "period": 5.5, "direction": 330}, 350)
        self.assertAlmostEqual(height(spectrum), 1.2, places=2)
        self.assertAlmostEqual(peak(spectrum), 5.5 / MEAN_TO_PEAK, delta=.4)
        self.assertEqual(heading(spectrum), local_direction(330, 350))

    def test_swell_and_wind_sea_are_two_peaks_scaled_to_the_total(self):
        member = {"model": "dwd_ewam", "height": 1.0, "period": 5, "direction": 330,
                  "swell": {"height": .8, "period": 7.5, "direction": 350}, "sea": {"height": .4, "period": 3.5, "direction": 290}}
        spectrum = boundary_spectrum(member, 0)
        self.assertAlmostEqual(height(spectrum), 1.0, places=2)
        self.assertAlmostEqual(peak(spectrum), 7.5 / MEAN_TO_PEAK, delta=.8, msg="The swell holds most of the energy")
        self.assertEqual(heading(spectrum), local_direction(350, 0))
        # The wind sea is still there: energy around its own period and direction.
        sea_frequency = min(range(len(SPECTRUM_FREQUENCIES)), key=lambda i: abs(SPECTRUM_FREQUENCIES[i] - MEAN_TO_PEAK / 3.5))
        sea_direction = SPECTRUM_DIRECTIONS.index(local_direction(290, 0))
        self.assertGreater(spectrum[sea_frequency][sea_direction], 0)

    def test_members_take_the_parts_only_when_the_model_gives_both(self):
        hourly = {"wave_height_dwd_ewam": [1, 1], "wave_period_dwd_ewam": [5, 5], "wave_direction_dwd_ewam": [330, 330],
                  "swell_wave_height_dwd_ewam": [.5, .5], "swell_wave_period_dwd_ewam": [7, None], "swell_wave_direction_dwd_ewam": [340, 340],
                  "wind_wave_height_dwd_ewam": [.8, .8], "wind_wave_period_dwd_ewam": [4, 4], "wind_wave_direction_dwd_ewam": [300, 300]}
        with_parts, without = wave_members(hourly, 0)[0], wave_members(hourly, 1)[0]
        self.assertEqual(with_parts["swell"], {"height": .5, "period": 7, "direction": 340})
        self.assertEqual(with_parts["sea"]["height"], .8)
        self.assertNotIn("swell", without, "A part with a missing period makes one peak")

    def test_the_swell_share_comes_from_the_chosen_model_or_else_from_the_models_that_give_it(self):
        spot, bath = transect()
        times = [1792497600, 1792501200]
        marine, winds = inputs(times)
        hourly = marine["data"]["hourly"]

        def parts(model, swell, sea):
            hourly.update({f"swell_wave_height_{model}": [swell] * 2, f"swell_wave_period_{model}": [7] * 2, f"swell_wave_direction_{model}": [350] * 2,
                           f"wind_wave_height_{model}": [sea] * 2, f"wind_wave_period_{model}": [4] * 2, f"wind_wave_direction_{model}": [10] * 2})

        def choice():
            with tempfile.TemporaryDirectory() as temp:
                return prepare_run(Path(temp), spot, bath, marine, winds, times[0], times[-1])[0]["choices"][times[0]]

        self.assertNotIn("swell", choice(), "No model tells swell and wind sea apart")
        # DMI WAM is chosen (see the sea level tests) but gives only the total: the median of the others' shares.
        parts("dwd_ewam", .6, .8)
        parts("ncep_gfswave025", .3, .3)
        self.assertEqual(choice(), {"model": "dmi_wam_nsb", "models": 4, "agree": True, "swell": round((.36 + .5) / 2, 2)})
        parts("dmi_wam_nsb", .8, .6)
        self.assertEqual(choice()["swell"], .64, "The chosen model's own share wins")

    def test_spectral_file_for_swan(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "boundary.sp2"
            calm = [[0.0] * len(SPECTRUM_DIRECTIONS) for _ in SPECTRUM_FREQUENCIES]
            write_spectra(path, [1792497600, 1792501200], [boundary_spectrum({"height": 1, "period": 5, "direction": 0}, 0), calm])
            lines = path.read_text().splitlines()
        self.assertEqual(lines[0], "SWAN   1")
        self.assertEqual(lines[lines.index("AFREQ") + 1].strip(), "32")
        self.assertEqual(lines[lines.index("NDIR") + 1].strip(), "36")
        first = lines.index(swan_time(1792497600))
        self.assertEqual(lines[first + 1], "FACTOR")
        rows = lines[first + 3:first + 3 + 32]
        self.assertTrue(all(len(row.split()) == 36 for row in rows))
        self.assertEqual(max(int(v) for row in rows for v in row.split()), 99999)
        self.assertEqual(lines[lines.index(swan_time(1792501200)) + 1], "ZERO", "Flat sea")

    def test_the_peak_period_at_the_spot_is_read_from_the_eleventh_column(self):
        spot = {"lat": 54.35, "lon": 18.831, "normal": 0}
        distances = list(range(-1000, 5001, 100))
        depth = [None if d < 0 else .5 + d * .0018 for d in distances]
        bath = {"depth": depth, "distances": distances, "wetStart": distances.index(0), "elevation": [1 if d is None else -d for d in depth]}
        from nearshore import calculation_grid, LENGTH
        _, grid, depths = calculation_grid(spot, bath)
        timestamp = 1792497600
        lines = [f"{swan_time(timestamp)} {LENGTH - d} {z if z > .05 else -99} {1 if z > .05 else -9} {4.2 if z > .05 else -9} "
                 f"{5 if z > .05 else -9} {270 if z > .05 else -9} 0 1000 0 {6.5 if z > .05 else -9}" for d, z in zip(grid, depths)]
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "profile.tbl"
            path.write_text("\n".join(lines))
            row = parse_output(path, spot, bath, timestamp, timestamp)[0]
        self.assertEqual(row["peakPeriod"], 6.5)
        self.assertEqual(row["period"], 4.2)


if __name__ == "__main__":
    unittest.main()
