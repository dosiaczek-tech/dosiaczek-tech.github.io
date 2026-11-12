import json
import tempfile
import unittest
from pathlib import Path
from build_site import stage_site, write_coast
from nearshore import VERSION


class PublicSite(unittest.TestCase):
    def test_both_apps_are_staged_without_private_or_build_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); target = root / "dist"
            (target / "data").mkdir(parents=True)
            (target / "data/status.json").write_text(json.dumps({"version": VERSION}))
            (root / "index.html").write_text("surf")
            files = ["index.html", "cloud-config.json", "sw.js", "assets/app.js", "assets/app.css", "assets/mark.svg",
                     "data/routes.json", "data/route-map.geojson", "data/access-points.json", "data/river-network.json",
                     "android/release.p12", "node_modules/private.js", "supabase/private.sql", ".cache/journal.json"]
            for name in files:
                path = root / "sup" / name
                path.parent.mkdir(parents=True, exist_ok=True); path.write_text("fixture")
            stage_site(root, target)
            self.assertTrue((target / "sup/data/river-network.json").is_file())
            self.assertEqual((target / "index.html").read_text(), "surf")
            for name in files[-4:]: self.assertFalse((target / "sup" / name).exists())

    def test_missing_sup_bundle_blocks_publication(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); target = root / "dist"
            (target / "data").mkdir(parents=True)
            (target / "data/status.json").write_text(json.dumps({"version": VERSION}))
            with self.assertRaisesRegex(ValueError, "SUP public file"):
                stage_site(root, target)

    def test_coast_file_keeps_everything_but_the_cross_sections(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            (data / "wind").mkdir(); (data / "nearshore").mkdir()
            wind = {"schema": 1, "spotId": "a", "data": {"hourly": {"time": [1]}}}
            wave = {"schema": 2, "spot": {"id": "a"}, "windUsed": [{"time": 1, "speed": 4}],
                    "hourly": [{"time": 1, "height": 0.5, "profile": [{"distance": 0}]}],
                    "history": [{"time": 0, "height": 0.4, "profile": []}]}
            (data / "wind/a.json").write_text(json.dumps(wind)); (data / "nearshore/a.json").write_text(json.dumps(wave))
            (data / "wind/b.json").write_text(json.dumps({**wind, "spotId": "b"}))
            write_coast(data)
            coast = json.loads((data / "coast.json").read_text(encoding="utf-8"))
            self.assertEqual(coast["schema"], 1)
            self.assertEqual(coast["spots"]["a"]["wind"], wind)
            self.assertEqual(coast["spots"]["a"]["nearshore"], {**wave, "hourly": [{"time": 1, "height": 0.5}], "history": [{"time": 0, "height": 0.4}]})
            self.assertEqual(coast["spots"]["b"], {"wind": {**wind, "spotId": "b"}})

    def test_staging_writes_the_coast_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); target = root / "dist"
            (target / "data").mkdir(parents=True)
            (target / "data/status.json").write_text(json.dumps({"version": VERSION}))
            for name in ["index.html", "cloud-config.json", "sw.js", "assets/app.js", "assets/app.css", "assets/mark.svg",
                         "data/routes.json", "data/route-map.geojson", "data/access-points.json", "data/river-network.json"]:
                path = root / "sup" / name
                path.parent.mkdir(parents=True, exist_ok=True); path.write_text("fixture")
            stage_site(root, target)
            self.assertEqual(json.loads((target / "data/coast.json").read_text()), {"schema": 1, "spots": {}})
