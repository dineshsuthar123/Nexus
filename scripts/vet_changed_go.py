"""Run go vet for changed modules, plus standalone Go command files."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
targets = set()
standalone = []
for name in sys.argv[1:]:
    path = (root / name).resolve()
    directory = path.parent
    while directory != root and not (directory / "go.mod").is_file():
        directory = directory.parent
    if directory == root:
        standalone.append(path)
    else:
        targets.add("./" + directory.relative_to(root).as_posix() + "/...")

if targets:
    subprocess.run(["go", "vet", *sorted(targets)], cwd=root, check=True)
for path in standalone:
    subprocess.run(["go", "vet", str(path)], cwd=root, check=True)
