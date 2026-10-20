"""Stage only public files. Raw forcing, executable and logs stay in Actions artifacts."""
from pathlib import Path
import shutil
import json
from nearshore import VERSION

root = Path(__file__).resolve().parents[1]
target = root / "dist"
target.mkdir(exist_ok=True)
status = json.loads((target / "data" / "status.json").read_text())
if status.get("version") != VERSION:
    raise ValueError("Forecast bundle is incompatible with this frontend/model version; retain the existing public site")
for pattern in ("*.html", "*.css", "*.js", "*.md", ".nojekyll"):
    for file in root.glob(pattern):
        if file.is_file():
            shutil.copy2(file, target / file.name)
