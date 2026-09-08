"""Release diagnostics fail closed without making production mutations."""

import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

from scripts.workspace_preflight import REQUIRED_API, public_checks, check_database


def transport(overrides=None):
    documents = {
        "https://test-backend.example/health": {"status": "healthy"},
        "https://test-backend.example/api/v1/openapi.json": {
            "paths": {
                path: {method: {} for method in methods}
                for path, methods in REQUIRED_API.items()
            }
        },
        "https://test-frontend.example/": "<html>test-app</html>",
    }
    documents.update(overrides or {})
    return Mock(side_effect=lambda url, **kwargs: documents[url])


def test_public_check_requires_actual_workspace_and_oauth_contract():
    fetch = transport()
    checks = public_checks(
        "https://test-backend.example/", "https://test-frontend.example", fetch=fetch
    )
    assert all(row["passed"] for row in checks)
    assert len(fetch.call_args_list) == 3
    stale = transport(
        {
            "https://test-backend.example/api/v1/openapi.json": {
                "paths": {"/health": {"get": {}}}
            }
        }
    )
    checks = public_checks("https://test-backend.example", None, fetch=stale)
    missing = next(row for row in checks if row["name"] == "api_contract")
    assert not missing["passed"] and "/api/v2/workspaces" in str(missing["missing"])


def test_matching_paths_with_wrong_http_methods_do_not_pass():
    wrong = {path: {"delete": {}} for path in REQUIRED_API}
    checks = public_checks(
        "https://test-backend.example",
        None,
        fetch=transport(
            {"https://test-backend.example/api/v1/openapi.json": {"paths": wrong}}
        ),
    )
    assert not next(row for row in checks if row["name"] == "api_contract")["passed"]


def test_prepared_application_satisfies_the_required_api_contract(client):
    def fetch(url, **kwargs):
        response = client.get(url.removeprefix("https://test-backend.example"))
        assert response.status_code == 200
        return response.json()

    checks = public_checks("https://test-backend.example", fetch=fetch)
    assert all(row["passed"] for row in checks), checks


@pytest.mark.parametrize("payload", [None, [], {"paths": []}, {"status": "failed"}])
def test_malformed_or_unhealthy_responses_are_failures(payload):
    checks = public_checks(
        "https://test-backend.example", None, fetch=Mock(return_value=payload)
    )
    assert not all(row["passed"] for row in checks)


def test_network_and_database_errors_do_not_disclose_secrets():
    checks = public_checks(
        "https://test-backend.example",
        None,
        fetch=Mock(side_effect=RuntimeError("test-private-password")),
    )
    assert "test-private-password" not in json.dumps(checks)
    result = check_database(
        "postgresql://test:private-password@invalid.example/test_db",
        connect=Mock(side_effect=RuntimeError("private-password")),
    )
    assert not result["passed"] and "private-password" not in json.dumps(result)


@pytest.mark.parametrize(
    "url",
    ["https://test:private-password@test.example", "https://test:private-password@["],
)
def test_cli_rejects_url_credentials_without_echoing_them(url):
    script = Path(__file__).resolve().parents[1] / "scripts/workspace_preflight.py"
    result = subprocess.run(
        [
            sys.executable,
            str(script),
            "--backend-url",
            url,
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "private-password" not in result.stdout + result.stderr


def test_worker_image_starts_only_the_worker():
    dockerfile = Path(__file__).resolve().parents[1] / "Dockerfile.sync-worker"
    text = dockerfile.read_text()
    assert 'CMD ["python", "-m", "app.sync_worker"]' in text
    assert "startup.py" not in text and "alembic upgrade" not in text
    assert "EXPOSE" not in text
