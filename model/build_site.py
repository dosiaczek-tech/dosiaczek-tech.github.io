"""Stage public Surf and SUP files; never copy journals, tools, keys or caches."""
from pathlib import Path
import shutil
import json
from nearshore import VERSION


def slim_nearshore(document):
    """The ranking ("Pokaż najlepsze") and the heat map draw no cross-sections: every hour keeps all but its 0–500 m profile."""
    slim = dict(document)
    for key in ("hourly", "history"):
        rows = slim.get(key)
        if isinstance(rows, list):
            slim[key] = [{k: v for k, v in row.items() if k != "profile"} if isinstance(row, dict) else row for row in rows]
    return slim


def write_coast(data):
    """One file for "Pokaż najlepsze" and the heat map instead of two requests per spot.
    scripts/coast-bundle.cjs builds the same file for the local preview."""
    spots = {}
    for kind in ("wind", "nearshore"):
        for path in sorted((data / kind).glob("*.json")):
            document = json.loads(path.read_text(encoding="utf-8"))
            spots.setdefault(path.stem, {})[kind] = slim_nearshore(document) if kind == "nearshore" else document
    (data / "coast.json").write_text(json.dumps({"schema": 1, "spots": spots}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def stage_site(root, target):
    target.mkdir(exist_ok=True)
    status = json.loads((target / "data" / "status.json").read_text())
    if status.get("version") != VERSION:
        raise ValueError("Forecast bundle is incompatible with this frontend/model version; retain the existing public site")
    write_coast(target / "data")
    for pattern in ("*.html", "*.css", "*.js", "*.md", ".nojekyll"):
        for file in root.glob(pattern):
            if file.is_file():
                shutil.copy2(file, target / file.name)
    # The SUP bundle is built before staging. Its public data is a route catalogue,
    # not the user's journal (which lives in browser storage / their cloud account).
    sup = root / "sup"
    public = ["index.html", "cloud-config.json", "sw.js", "assets/app.js", "assets/app.css", "assets/mark.svg",
              "data/routes.json", "data/route-map.geojson", "data/access-points.json", "data/river-network.json"]
    for name in public:
        source = sup / name
        if not source.is_file() or source.is_symlink():
            raise ValueError(f"Missing or unsafe SUP public file: {name}")
    for name in public:
        destination = target / "sup" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(sup / name, destination)
    for directory in ("downloads", "sup/android/releases"):
        source = root / directory
        if source.is_dir():
            for file in source.iterdir():
                if file.is_file() and not file.is_symlink() and (file.suffix in (".apk", ".sha256") or file.name == "index.html"):
                    destination = target / directory / file.name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(file, destination)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    stage_site(root, root / "dist")
