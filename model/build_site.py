"""Stage only public files. Raw forcing, executable and logs stay in Actions artifacts."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
target = root / "dist"
target.mkdir(exist_ok=True)
for pattern in ("*.html", "*.css", "*.js", "*.md", ".nojekyll"):
    for file in root.glob(pattern):
        if file.is_file():
            shutil.copy2(file, target / file.name)
