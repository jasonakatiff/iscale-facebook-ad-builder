"""Private plugin execution and third-party service boundaries on isolated PostgreSQL."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

BASE = "/api/v1/plugins"
WORKER = "/api/v1/plugin-worker"


def package(execution="template"):
    return {
        "schemaVersion": 1,
        "slug": "test-hook-pack",
        "name": "test-Hook pack",
        "version": "1.0.0",
        "description": "test-Generate a reusable creative brief.",
        "category": "prompts",
        "execution": execution,
        "inputs": [{"name": "product", "label": "Product", "required": True}],
        "configFields": [{"name": "voice", "label": "Voice", "default": "Direct"}],
        "template": (
            {"brief": "{{voice}}: {{product}}"} if execution == "template" else None
        ),
    }


def install(client, headers, execution="template"):
    response = client.post(BASE, headers=headers, json=package(execution))
    assert response.status_code == 201, response.text
    return response.json()["data"]


def run(client, headers, installation, request_id=None, inputs=None):
    return client.post(
        f"{BASE}/{installation['id']}/runs",
        headers=headers,
        json={
            "requestId": request_id or str(uuid4()),
            "inputs": inputs or {"product": "test-Coffee"},
        },
    )


def worker_key(client, headers, installation):
    response = client.post(
        f"{BASE}/{installation['id']}/worker-key",
        headers=headers,
        json={"expiresInDays": 30},
    )
    assert response.status_code == 201, response.text
    return response.json()["workerKey"]


def bearer(value):
    return {"Authorization": f"Bearer {value}"}


def test_local_package_configuration_execution_and_retained_history(
    client, auth_headers
):
    row = install(client, auth_headers)
    duplicate = client.post(BASE, headers=auth_headers, json=package())
    assert duplicate.status_code == 200
    assert duplicate.json()["data"]["id"] == row["id"]
    assert (
        client.patch(
            f"{BASE}/{row['id']}",
            headers=auth_headers,
            json={"configuration": {"voice": "test-Warm"}},
        ).status_code
        == 200
    )
    response = run(client, auth_headers, row)
    assert response.status_code == 201, response.text
    result = response.json()["data"]
    assert result["status"] == "succeeded"
    assert result["output"] == {"brief": "test-Warm: test-Coffee"}
    assert result["packageDigest"] == row["packageDigest"]
    exported = client.get(f"{BASE}/{row['id']}/package", headers=auth_headers).json()
    from app.schemas.plugins import PluginDocument

    assert exported == PluginDocument.model_validate(package()).model_dump(mode="json")
    assert "configuration" not in exported
    assert client.delete(f"{BASE}/{row['id']}", headers=auth_headers).status_code == 200
    assert client.get(f"{BASE}/{row['id']}", headers=auth_headers).status_code == 404
    assert (
        client.get(f"{BASE}/runs/{result['id']}", headers=auth_headers).json()["data"][
            "output"
        ]
        == result["output"]
    )
    assert (
        client.get(f"{BASE}/runs", headers=auth_headers).json()["pagination"]["total"]
        == 1
    )


@pytest.mark.parametrize(
    "change",
    [
        {"schemaVersion": 2},
        {"execution": "python"},
        {"code": "print('test')"},
        {"template": "{{undeclared}}"},
        {"template": "{{product.__class__}}"},
        {
            "inputs": [
                {"name": "product", "label": "Product"},
                {"name": "product", "label": "Duplicate"},
            ]
        },
        {"inputs": [{"name": "voice", "label": "Duplicate configuration"}]},
        {"version": "latest"},
        {"template": "x" * 131073},
    ],
)
def test_invalid_packages_rejected(client, auth_headers, change):
    body = {**package(), **change}
    response = client.post(f"{BASE}/validate", headers=auth_headers, json=body)
    assert response.status_code in {413, 422}, response.text
    assert "error" in response.json()


def test_conflicting_release_and_undeclared_inputs_are_rejected(client, auth_headers):
    row = install(client, auth_headers)
    assert (
        client.post(
            BASE, headers=auth_headers, json={**package(), "template": "changed"}
        ).status_code
        == 409
    )
    assert run(client, auth_headers, row, inputs={"unknown": "test"}).status_code == 422
    assert (
        client.patch(
            f"{BASE}/{row['id']}",
            headers=auth_headers,
            json={"configuration": {"undeclared": "test"}},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"{BASE}/{row['id']}", headers=auth_headers, json={"enabled": False}
        ).status_code
        == 200
    )
    assert run(client, auth_headers, row).status_code == 409


def test_run_idempotency_binds_inputs_and_config(client, auth_headers):
    row = install(client, auth_headers)
    request_id = str(uuid4())
    first = run(client, auth_headers, row, request_id).json()["data"]
    assert (
        run(client, auth_headers, row, request_id).json()["data"]["id"] == first["id"]
    )
    assert (
        run(
            client, auth_headers, row, request_id, {"product": "test-Changed"}
        ).status_code
        == 409
    )
    client.patch(
        f"{BASE}/{row['id']}",
        headers=auth_headers,
        json={"configuration": {"voice": "Changed"}},
    )
    assert run(client, auth_headers, row, request_id).status_code == 409


def test_service_claim_complete_and_duplicate_result(client, auth_headers):
    row = install(client, auth_headers, "service")
    raw = worker_key(client, auth_headers, row)
    headers = bearer(raw)
    pending = run(client, auth_headers, row)
    assert pending.status_code == 202
    job = pending.json()["data"]
    assert job["status"] == "queued"
    listing = client.get(f"{WORKER}/jobs", headers=headers).json()
    assert listing["data"][0]["id"] == job["id"]
    assert "inputs" not in listing["data"][0]
    claim = client.post(f"{WORKER}/jobs/{job['id']}/claim", headers=headers)
    assert claim.status_code == 200, claim.text
    body = claim.json()
    assert body["data"]["inputs"]["product"] == "test-Coffee"
    assert body["data"]["configuration"] == {"voice": "Direct"}
    assert (
        client.post(f"{WORKER}/jobs/{job['id']}/claim", headers=headers).status_code
        == 409
    )
    result = {
        "leaseToken": body["leaseToken"],
        "output": {"suggestion": "test-Service result"},
    }
    assert (
        client.post(
            f"{WORKER}/jobs/{job['id']}/heartbeat",
            headers=headers,
            json={"leaseToken": body["leaseToken"]},
        ).status_code
        == 200
    )
    for _ in range(2):
        response = client.post(
            f"{WORKER}/jobs/{job['id']}/result", headers=headers, json=result
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["status"] == "succeeded"
    assert (
        client.post(
            f"{WORKER}/jobs/{job['id']}/result",
            headers=headers,
            json={**result, "output": "different"},
        ).status_code
        == 409
    )
    assert (
        client.get(f"{BASE}/runs/{job['id']}", headers=auth_headers).json()["data"][
            "output"
        ]
        == result["output"]
    )


@pytest.mark.parametrize(
    "action", ["rotate", "revoke", "disable", "uninstall", "cancel"]
)
def test_revoked_or_cancelled_service_cannot_complete(client, auth_headers, action):
    row = install(client, auth_headers, "service")
    raw = worker_key(client, auth_headers, row)
    headers = bearer(raw)
    job = run(client, auth_headers, row).json()["data"]
    claim = client.post(f"{WORKER}/jobs/{job['id']}/claim", headers=headers).json()
    if action == "rotate":
        assert worker_key(client, auth_headers, row) != raw
    elif action == "revoke":
        client.delete(f"{BASE}/{row['id']}/worker-key", headers=auth_headers)
    elif action == "disable":
        client.patch(
            f"{BASE}/{row['id']}", headers=auth_headers, json={"enabled": False}
        )
    elif action == "uninstall":
        client.delete(f"{BASE}/{row['id']}", headers=auth_headers)
    else:
        client.post(f"{BASE}/runs/{job['id']}/cancel", headers=auth_headers)
    response = client.post(
        f"{WORKER}/jobs/{job['id']}/result",
        headers=headers,
        json={"leaseToken": claim["leaseToken"], "output": "test-Late result"},
    )
    assert response.status_code in {401, 403, 409}
    assert (
        client.get(f"{BASE}/runs/{job['id']}", headers=auth_headers).json()["data"][
            "status"
        ]
        == "cancelled"
    )


def test_worker_key_is_hash_only_and_cannot_use_user_api(
    client, auth_headers, db_session
):
    from app.models import PluginInstallation

    row = install(client, auth_headers, "service")
    raw = worker_key(client, auth_headers, row)
    stored = db_session.get(PluginInstallation, row["id"])
    assert raw not in repr(stored.__dict__)
    assert stored.worker_key_hash
    assert client.get(BASE, headers=bearer(raw)).status_code == 401
    assert client.get("/api/v1/brands", headers=bearer(raw)).status_code == 401
    for suffix in ["", "/package"]:
        text = client.get(f"{BASE}/{row['id']}{suffix}", headers=auth_headers).text
        assert raw not in text and stored.worker_key_hash not in text
    stored.worker_key_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    assert client.get(f"{WORKER}/jobs", headers=bearer(raw)).status_code == 401


def test_foreign_plugin_and_jobs_are_not_accessible(client, auth_headers, db_session):
    from app.models import User
    from app.core.security import create_access_token

    other = User(
        email=f"test-plugins-{uuid4()}@example.com",
        hashed_password="unused",
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    try:
        foreign = bearer(create_access_token({"sub": other.id}))
        row = install(client, auth_headers, "service")
        job = run(client, auth_headers, row).json()["data"]
        assert client.get(f"{BASE}/{row['id']}", headers=foreign).status_code == 404
        assert (
            client.get(f"{BASE}/runs/{job['id']}", headers=foreign).status_code == 404
        )
        assert run(client, foreign, row).status_code == 404
        assert client.get(BASE, headers=foreign).json()["data"] == []
        other_row = install(client, foreign, "service")
        other_key = worker_key(client, foreign, other_row)
        assert (
            client.post(
                f"{WORKER}/jobs/{job['id']}/claim", headers=bearer(other_key)
            ).status_code
            == 404
        )
    finally:
        db_session.delete(other)
        db_session.commit()


def test_user_api_keys_can_run_but_read_keys_cannot(client, auth_headers):
    row = install(client, auth_headers)
    for access in ["read", "write"]:
        response = client.post(
            "/api/v1/api-keys",
            headers=auth_headers,
            json={
                "name": "test-Plugin automation",
                "access": access,
                "expiresInDays": 1,
            },
        )
        headers = bearer(response.json()["apiKey"])
        assert client.get(BASE, headers=headers).status_code == 200
        assert run(client, headers, row).status_code == (
            201 if access == "write" else 403
        )
        assert (
            client.post(
                f"{BASE}/{row['id']}/worker-key",
                headers=headers,
                json={"expiresInDays": 1},
            ).status_code
            == 403
        )


def test_expired_lease_never_requeues_and_old_result_is_rejected(
    client, auth_headers, db_session
):
    from app.models import PluginRun

    row = install(client, auth_headers, "service")
    headers = bearer(worker_key(client, auth_headers, row))
    job = run(client, auth_headers, row).json()["data"]
    claim = client.post(f"{WORKER}/jobs/{job['id']}/claim", headers=headers).json()
    stored = db_session.get(PluginRun, job["id"])
    stored.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    response = client.get(f"{BASE}/runs/{job['id']}", headers=auth_headers)
    assert response.json()["data"]["status"] == "expired"
    assert client.get(f"{WORKER}/jobs", headers=headers).json()["data"] == []
    assert (
        client.post(
            f"{WORKER}/jobs/{job['id']}/result",
            headers=headers,
            json={"leaseToken": claim["leaseToken"], "output": "late"},
        ).status_code
        == 409
    )


def test_json_templates_preserve_values_and_never_evaluate_code(client, auth_headers):
    from app.schemas.plugins import PluginDocument
    from app.services.plugin_service import evaluate_template

    document = PluginDocument.model_validate(
        {**package(), "template": {"text": "{{product}}", "config": "{{voice}}"}}
    )
    payload = {"product": "{{voice}} $(echo test) <script>test</script>"}
    output = evaluate_template(document.template, {**payload, "voice": "test"})
    assert output["text"] == payload["product"]
    assert output["config"] == "test"


def test_openapi_and_downloadable_plugin_docs(client, auth_headers):
    schema = client.get("/api/v1/openapi.json").json()
    for route in [f"{BASE}/{{plugin_id}}/runs", f"{WORKER}/jobs/{{run_id}}/result"]:
        assert route in schema["paths"]
        assert schema["paths"][route]["post"]["requestBody"]
    docs = client.get("/api/v1/help/docs").json()["data"]
    assert {"plugins", "plugin-service-api"}.issubset({row["slug"] for row in docs})


def test_first_worker_key_preserves_waiting_jobs(client, auth_headers):
    row = install(client, auth_headers, "service")
    job = run(client, auth_headers, row).json()["data"]
    headers = bearer(worker_key(client, auth_headers, row))
    assert (
        client.get(f"{WORKER}/jobs", headers=headers).json()["data"][0]["id"]
        == job["id"]
    )


def test_oversized_nested_and_nonfinite_payloads_are_rejected(client, auth_headers):
    assert (
        client.post(
            BASE,
            headers={**auth_headers, "Content-Type": "application/json"},
            content=b"x" * 262145,
        ).status_code
        == 413
    )
    nested = "test"
    for _ in range(20):
        nested = {"nested": nested}
    assert (
        client.post(
            BASE, headers=auth_headers, json={**package(), "template": nested}
        ).status_code
        == 422
    )
    body = (
        __import__("json")
        .dumps(package())
        .replace('"template": {"brief": "{{voice}}: {{product}}"}', '"template": NaN')
    )
    assert (
        client.post(
            BASE,
            headers={**auth_headers, "Content-Type": "application/json"},
            content=body,
        ).status_code
        == 422
    )


def test_output_failure_and_invalid_lease_do_not_overwrite(client, auth_headers):
    row = install(client, auth_headers, "service")
    headers = bearer(worker_key(client, auth_headers, row))
    job = run(client, auth_headers, row).json()["data"]
    claim = client.post(f"{WORKER}/jobs/{job['id']}/claim", headers=headers).json()
    assert (
        client.post(
            f"{WORKER}/jobs/{job['id']}/result",
            headers=headers,
            json={"leaseToken": "x" * 43, "output": "forged"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"{WORKER}/jobs/{job['id']}/result",
            headers=headers,
            json={"leaseToken": claim["leaseToken"], "output": "x" * 65537},
        ).status_code
        == 422
    )
    result = client.post(
        f"{WORKER}/jobs/{job['id']}/result",
        headers=headers,
        json={"leaseToken": claim["leaseToken"], "failed": True, "output": "discarded"},
    )
    assert result.json()["data"]["status"] == "failed"
    assert result.json()["data"]["output"] is None


def test_two_workers_cannot_claim_same_job(client, auth_headers, db_session):
    from concurrent.futures import ThreadPoolExecutor
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker
    from app.api.v1.plugins import worker_router
    from app.database import get_db

    row = install(client, auth_headers, "service")
    headers = bearer(worker_key(client, auth_headers, row))
    job = run(client, auth_headers, row).json()["data"]
    factory = sessionmaker(bind=db_session.get_bind())
    worker_app = FastAPI()
    worker_app.include_router(worker_router, prefix=WORKER)

    def isolated_session():
        with factory() as db:
            yield db

    worker_app.dependency_overrides[get_db] = isolated_session

    def claim(_):
        with TestClient(worker_app) as worker_client:
            return worker_client.post(
                f"{WORKER}/jobs/{job['id']}/claim", headers=headers
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(claim, range(2))) == [200, 409]


def test_example_packages_and_worker_are_downloadable(client, auth_headers):
    examples = client.get(f"{BASE}/examples", headers=auth_headers)
    assert examples.status_code == 200
    assert {row["execution"] for row in examples.json()} == {"template", "service"}
    worker = client.get(f"{BASE}/example-worker", headers=auth_headers)
    assert worker.status_code == 200
    assert "BREADWINNER_PLUGIN_WORKER_KEY" in worker.text
    assert "attachment;" in worker.headers["content-disposition"]


def test_template_expansion_is_bounded_before_return(monkeypatch):
    from app.services.plugin_service import evaluate_template
    from app.core import plugin_config

    monkeypatch.setattr(plugin_config, "MAX_VALUE_BYTES", 64)
    with pytest.raises(ValueError, match="size limit"):
        evaluate_template("{{product}}" * 10000, {"product": "test-" * 200})
    with pytest.raises(ValueError, match="size limit"):
        evaluate_template(["{{product}}"] * 20, {"product": {"x": "test-value"}})
    assert evaluate_template("test-{{product}}", {"product": "coffee"}) == "test-coffee"
