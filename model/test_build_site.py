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

    def test_coast_parts_keep_everything_but_the_cross_sections_west_to_east(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            (data / "wind").mkdir(); (data / "nearshore").mkdir()
            (data / "coast.json").write_text("{}")
            wind = {"schema": 1, "spotId": "a", "spot": {"id": "a", "lon": 18.6}, "data": {"hourly": {"time": [1]}}}
            wave = {"schema": 2, "spot": {"id": "a", "lon": 18.6}, "windUsed": [{"time": 1, "speed": 4}],
                    "hourly": [{"time": 1, "height": 0.5, "profile": [{"distance": 0}]}],
                    "history": [{"time": 0, "height": 0.4, "profile": []}]}
            (data / "wind/a.json").write_text(json.dumps(wind)); (data / "nearshore/a.json").write_text(json.dumps(wave))
            (data / "wind/b.json").write_text(json.dumps({**wind, "spotId": "b", "spot": {"id": "b", "lon": 14.2}}))
            (data / "wind/c.json").write_text(json.dumps({**wind, "spotId": "c", "spot": None}))
            write_coast(data)
            self.assertFalse((data / "coast.json").exists())
            parts = [json.loads((data / f"coast-{i}.json").read_text(encoding="utf-8")) for i in (1, 2, 3)]
            self.assertFalse((data / "coast-4.json").exists())
            self.assertEqual([(part["part"], part["parts"], list(part["spots"])) for part in parts], [(1, 3, ["b"]), (2, 3, ["a"]), (3, 3, ["c"])])
            self.assertEqual(parts[1]["spots"]["a"]["wind"], wind)
            self.assertEqual(parts[1]["spots"]["a"]["nearshore"], {**wave, "hourly": [{"time": 1, "height": 0.5}], "history": [{"time": 0, "height": 0.4}]})
            self.assertEqual(parts[0]["spots"]["b"], {"wind": {**wind, "spotId": "b", "spot": {"id": "b", "lon": 14.2}}})

    def test_staging_writes_the_coast_parts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); target = root / "dist"
            (target / "data").mkdir(parents=True)
            (target / "data/status.json").write_text(json.dumps({"version": VERSION}))
            for name in ["index.html", "cloud-config.json", "sw.js", "assets/app.js", "assets/app.css", "assets/mark.svg",
                         "data/routes.json", "data/route-map.geojson", "data/access-points.json", "data/river-network.json"]:
                path = root / "sup" / name
                path.parent.mkdir(parents=True, exist_ok=True); path.write_text("fixture")
            stage_site(root, target)
            self.assertEqual(json.loads((target / "data/coast-1.json").read_text()), {"schema": 1, "part": 1, "parts": 1, "spots": {}})
