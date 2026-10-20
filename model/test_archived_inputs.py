import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from nearshore import archived_inputs


class ArchivedInputs(unittest.TestCase):
    def test_reuses_only_recent_matching_inputs_and_retains_dates(self):
        spot = {"id":"test","lat":54.8,"lon":18.4,"normal":0}
        now = 1792530000
        bundle = {"fetchedAt":now-3600,"data":{"hourly":{"time":[now]}}}
        sources = {"spot":spot,"marine":bundle,"wind":[bundle,bundle,bundle]}
        with tempfile.TemporaryDirectory() as temp:
            cache=Path(temp);(cache/"reproducibility").mkdir()
            payload=json.dumps(sources).encode()
            with tarfile.open(cache/"reproducibility/test.tar.gz","w:gz") as tar:
                info=tarfile.TarInfo("sources.json");info.size=len(payload);tar.addfile(info,io.BytesIO(payload))
            result=archived_inputs(spot,cache,now)
            self.assertEqual(result["marine"]["fetchedAt"],now-3600)
            self.assertEqual(result["wind"][0]["fetchedAt"],now-3600)
            self.assertIsNone(archived_inputs(spot,cache,now+6*3600))
            self.assertIsNone(archived_inputs({**spot,"normal":90},cache,now))
            self.assertIsNone(archived_inputs({**spot,"id":"missing"},cache,now))
