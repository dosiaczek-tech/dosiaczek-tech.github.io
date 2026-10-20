import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from reuse_forecast import restore


class ReusePublishedForecast(unittest.TestCase):
    def test_preserves_data_and_times_without_restoring_old_interface(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "artifact.tar"
            wind = b'{"fetchedAt":123,"data":{"hourly":{"time":[100]}}}'
            swan = b'{"generatedAt":456,"hourly":[{"time":100,"height":0.7}]}'
            with tarfile.open(archive, "w") as tar:
                for name, data in [("./data/status.json", b'{"generatedAt":789}'),
                                   ("./data/wind/test.json", wind), ("./data/nearshore/test.json", swan),
                                   ("./index.html", b'old interface')]:
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    tar.addfile(entry, io.BytesIO(data))
            target = root / "dist" / "data"
            target.mkdir(parents=True)
            (target / "partial.json").write_text("incomplete failed refresh")
            restore(archive, target)
            self.assertEqual((target / "wind/test.json").read_bytes(), wind)
            self.assertEqual((target / "nearshore/test.json").read_bytes(), swan)
            self.assertFalse((target / "partial.json").exists())
            self.assertFalse((target.parent / "index.html").exists())
            status = json.loads((target / "status.json").read_text())
            self.assertEqual(status["generatedAt"], 789)
            self.assertTrue(status["lastRefreshFailed"])

    def test_incomplete_bundle_does_not_replace_existing_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "empty.tar"
            with tarfile.open(archive, "w"):
                pass
            target = root / "data"
            target.mkdir()
            (target / "keep.txt").write_text("keep")
            with self.assertRaises((ValueError, FileNotFoundError)):
                restore(archive, target)
            self.assertEqual((target / "keep.txt").read_text(), "keep")
