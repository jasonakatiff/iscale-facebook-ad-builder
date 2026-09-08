"""Report public-content hygiene findings without printing matching values."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess


RULES = {
    "hosted-deployment": re.compile(r"[a-z0-9-]{1,63}\.up\.railway\.app", re.I),
    "private-application": re.compile(r"breadwinner\.a4d\.com", re.I),
    "private-repository": re.compile(r"(?:https://github\.com/|git@github\.com:)A4DLLC/breadWinner\.com", re.I),
    "personal-home-path": re.compile(r"(?:/Users/[^/\s]+/|C:\\Users\\[^\\\s]+\\)"),
    "internal-email": re.compile(r"[\w.+-]{1,64}@(?:a4d|iscale)\.com", re.I),
    "private-evidence": re.compile(r"docs/evidence/.+(?:production|deployment)[^\s]*\.(?:json|png)"),
}
POLICY_FILES = {"scripts/check_public_hygiene.py", "tests/test_public_hygiene.py"}


def findings_for_text(path: str, content: str) -> list[dict]:
    if path in POLICY_FILES:
        return []
    return [
        {"path": path, "line": number, "rule": rule}
        for number, line in enumerate(content.splitlines(), 1)
        for rule, pattern in RULES.items()
        if pattern.search(line)
    ]


def scan(root: Path) -> dict:
    paths = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=root,
    ).decode().split("\0")
    findings = []
    checked = 0
    for name in sorted(set(paths) - {""}):
        path = root / name
        if name.startswith((".env", "backend/.env", "frontend/.env")) and not name.endswith(".example"):
            findings.append({"path": name, "line": 0, "rule": "secret-file"})
            continue
        if not path.is_file() or path.is_symlink():
            continue
        try:
            raw = path.read_bytes()
            if b"\x00" in raw:
                continue
            content = raw.decode()
        except UnicodeDecodeError:
            continue
        checked += 1
        findings.extend(findings_for_text(name, content))
    return {"files_checked": checked, "findings": findings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    report = scan(args.root)
    print(json.dumps(report, indent=2))
    return bool(report["findings"])


if __name__ == "__main__":
    raise SystemExit(main())
