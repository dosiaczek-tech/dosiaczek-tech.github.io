import json
import tempfile
import unittest
from pathlib import Path
from build_site import stage_site
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
