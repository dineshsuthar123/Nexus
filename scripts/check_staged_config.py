"""Check staged source/configuration without traversing ignored local files.

Gitleaks and the PAN scanner provide additional secret detection. This narrower
check rejects literal credentials in non-test code and warns on production URLs.
"""
from pathlib import PurePosixPath
import re
import subprocess
import sys

mode = sys.argv[1]
names = subprocess.check_output(
    ["git", "ls-files", "--cached", "-z"], text=True, encoding="utf-8"
).split("\0")
errors = []
for name in filter(None, names):
    path = PurePosixPath(name)
    if mode == "production-hosts":
        selected = path.name == "values.yaml" or ("prod" in path.name and path.suffix in {".yml", ".yaml"})
    else:
        selected = path.suffix in {".go", ".java", ".yml", ".yaml"}
        # Test fixtures and development infrastructure have explicit fake values.
        selected &= not (name.endswith("_test.go") or "/test/" in name or "/tests/" in name)
    if not selected:
        continue
    content = subprocess.check_output(["git", "show", ":" + name]).decode("utf-8", errors="replace")
    for number, line in enumerate(content.splitlines(), 1):
        if mode == "production-hosts":
            if re.search(r"localhost|127\.0\.0\.1", line):
                print(f"WARNING: local host in production configuration: {name}:{number}")
        else:
            match = re.search(r'(?i)\b(password|secret|api_key)\s*=\s*"([^"\n]+)"', line)
            if match and not re.search(r"(?i)example|sample|placeholder|your[-_]|REPLACE_WITH_|test|dev", line):
                errors.append(f"{name}:{number}: literal {match.group(1)}")
if errors:
    print("Hardcoded credential assignments found:\n" + "\n".join(errors))
    raise SystemExit(1)
