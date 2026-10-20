"""Recover only data/ from a successful Pages artifact, retaining forecast ages."""
import json
from pathlib import Path, PurePosixPath
import shutil
import sys
import tarfile
import tempfile
import time


def restore(archive_path, output):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent, prefix="previous-forecast-") as temp:
        stage = Path(temp)
        with tarfile.open(archive_path, "r:*") as archive:
            for member in archive.getmembers():
                path = PurePosixPath(member.name)
                if not path.parts or path.parts[0] != "data" or member.isdir():
                    continue
                if ".." in path.parts or path.is_absolute() or not member.isfile():
                    raise ValueError("Unexpected forecast artifact entry")
                destination = stage.joinpath(*path.parts[1:])
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as stream:
                    destination.write_bytes(stream.read())
        status_path = stage / "status.json"
        status = json.loads(status_path.read_text())
        if not status.get("generatedAt") or not list((stage / "wind").glob("*.json")) or not list((stage / "nearshore").glob("*.json")):
            raise ValueError("Previous artifact has no complete forecast bundle")
        # Do not replace generatedAt / fetchedAt: the UI must still reject old data.
        status["lastRefreshFailed"] = True
        status["lastRefreshAttemptAt"] = int(time.time())
        status_path.write_text(json.dumps(status, ensure_ascii=False))
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(stage, output)


if __name__ == "__main__":
    restore(sys.argv[1], sys.argv[2])
