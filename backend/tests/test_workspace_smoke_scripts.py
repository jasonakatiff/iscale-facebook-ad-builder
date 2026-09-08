"""Exercise deployed smoke runner control flow with a deterministic browser CLI."""

import os
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize(
    "snapshot,expected",
    [
        ("textbox Email Address\ntextbox Password\nbutton Sign In", 0),
        ("textbox Email Address\nbutton Sign In", 1),
    ],
)
def test_login_smoke_accepts_visible_labels_and_finishes_runner(
    tmp_path, snapshot, expected
):
    cli = tmp_path / "agent-browser"
    cli.write_text(
        '#!/bin/sh\nif [ "$1" = "snapshot" ]; then printf "%s\\n" "$TEST_BROWSER_SNAPSHOT"; fi\n'
    )
    cli.chmod(0o755)
    sleep = tmp_path / "sleep"
    sleep.write_text("#!/bin/sh\nexit 0\n")
    sleep.chmod(0o755)
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        ["bash", str(root / "frontend/tests/agent-browser/run-all.sh")],
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "PATH": str(tmp_path) + os.pathsep + os.environ["PATH"],
            "TEST_BROWSER_SNAPSHOT": snapshot,
            "TEST_EMAIL": "",
            "TEST_PASSWORD": "",
        },
    )
    assert result.returncode == expected, result.stdout + result.stderr
    assert "Results:" in result.stdout
    assert (
        "1 passed, 0 failed" if expected == 0 else "0 passed, 1 failed"
    ) in result.stdout
