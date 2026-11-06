"""Audit selection against archived raw SWAN tables, independently of forecast downloads.

Does not modify caches or publish. Input dates remain unchanged in the replayed
documents; output lives in a separate audit directory. This is a regression and
consistency audit, not observational skill validation.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tarfile
import tempfile

from nearshore import ROOT, VERSION, dump, geometry_key, parse_output, swan_time


def audit(cache, output):
    catalogue = json.loads(subprocess.check_output(
        ["node", "-e", "console.log(JSON.stringify(require('./surf-spots.js')))"], cwd=ROOT, text=True))
    report = {"version": VERSION, "checkedSpots": 0, "checkedHours": 0, "changedSpots": [], "skipped": [], "failures": []}
    for spot in catalogue:
        path = cache / "results" / f'{spot["id"]}.json'
        if not path.exists():
            report["skipped"].append({"id": spot["id"], "reason": "No saved successful simulation"})
            continue
        before = json.loads(path.read_text())
        if before.get("geometryKey") != geometry_key(spot):
            report["skipped"].append({"id": spot["id"], "reason": "Saved geometry differs from the current catalogue"})
            continue
        try:
            with tarfile.open(cache / "reproducibility" / f'{spot["id"]}.tar.gz') as archive:
                def read(name):
                    return archive.extractfile(name).read()
                source = json.loads(read("sources.json"))
                assert geometry_key(source["spot"]) == geometry_key(spot), "Archive geometry mismatch"
                forcing = read("INPUT") + read("boundary.tpar") + read("bottom.dat")
                forcing += b"".join(read(name) for name in sorted(archive.getnames()) if name.startswith("wind") and name.endswith(".dat"))
                assert hashlib.sha256(forcing).hexdigest() == before["inputHash"], "Archive does not belong to the saved simulation"
                table = read("profile.tbl").decode()
            original = before.get("history", []) + before["hourly"]
            with tempfile.TemporaryDirectory() as temp:
                raw = Path(temp) / "profile.tbl"
                raw.write_text(table)
                replay = parse_output(raw, spot, source["bathymetry"], original[0]["time"], original[-1]["time"])
            # Independent checks use the actual serialized grid and raw table,
            # not summary_location() or its candidate-search implementation.
            raw_by_key = {}
            for line in table.splitlines():
                parts = line.split()
                if parts and not parts[0].startswith("%"):
                    raw_by_key[(parts[0], round(float(parts[1])))] = list(map(float, parts[1:]))
            assert len(replay) == len(original), "Time coverage changed"
            assert len({r["distance"] for r in replay}) == 1, "Point moves with wave conditions"
            changes = []
            for old, new in zip(original, replay):
                assert new["time"] == old["time"], "Timestamp changed"
                assert new["profile"] == old["profile"], "Physical wave profile was altered"
                assert new["breaking"] == old["breaking"], "Breaking zone was altered"
                assert 0 <= new["shoreDistanceMin"] <= new["shoreDistance"] <= new["shoreDistanceMax"] <= 500
                assert .3 <= new["depth"] <= 4
                target = next(p for p in new["profile"] if p["distance"] == new["distance"])
                assert target["kind"] == "swan-node" and target["height"] == new["height"]
                assert all(p["depth"] > 2 for p in new["profile"] if
                           p["shoreDistanceMax"] <= 500 and p["distance"] > new["distance"]), "Point lies landwards of an earlier 2 m contour"
                raw = raw_by_key[(swan_time(new["time"]), round(5000 - new["distance"]))]
                expected = {"depth": round(raw[1], 3), "height": round(raw[2], 3),
                    "period": round(raw[3], 3) if raw[3] > 0 else None,
                    "energyPeriod": round(raw[4], 3) if raw[4] > 0 else None,
                    "direction": round((raw[5] - 270 + spot["normal"]) % 360, 1) if raw[5] >= 0 else None,
                    "breakingFraction": round(raw[6], 4),
                    "energyKJm2": round(1025 * 9.81 * raw[2] ** 2 / 16000, 4),
                    "powerKWm": round(math.hypot(raw[7], raw[8]) / 1000, 4)}
                assert all(new[k] == value for k, value in expected.items()), "Metrics do not come from the same raw SWAN node"
                if old["distance"] == new["distance"]:
                    assert old == new, "Unchanged point has changed metrics"
                else:
                    changes.append({"time": new["time"], "oldHeight": old["height"], "height": new["height"]})
            if changes:
                report["changedSpots"].append({"id": spot["id"], "oldDistance": original[0]["shoreDistance"],
                    "distance": replay[0]["shoreDistance"], "hours": len(changes),
                    "minHeightDelta": round(min(r["height"] - r["oldHeight"] for r in changes), 3),
                    "maxHeightDelta": round(max(r["height"] - r["oldHeight"] for r in changes), 3)})
            split = len(before.get("history", []))
            document = {**before, "version": VERSION, "history": replay[:split], "hourly": replay[split:], "verificationOnly": True}
            dump(output / "nearshore" / f'{spot["id"]}.json', document)
            report["checkedSpots"] += 1
            report["checkedHours"] += len(replay)
        except (AssertionError, ValueError, KeyError, OSError, tarfile.TarError) as error:
            report["failures"].append({"id": spot["id"], "reason": str(error)})
    dump(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.cache.resolve()):
        parser.error("Audit output must be separate from the input cache")
    result = audit(args.cache, args.output)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["failures"] or not result["checkedHours"]:
        raise SystemExit(1)
