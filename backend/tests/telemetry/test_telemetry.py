"""Telemetry contracts; run only against the isolated test database."""

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.testclient import TestClient

from app.core.deps import get_current_active_user
from app.core.security import create_access_token
from app.database import get_db
from app.models import TelemetryEvent, ApiKey as TelemetryApiKey, User
from app.telemetry.runtime import collector, emit, observe, sanitize, trace_context
from app.telemetry.middleware import TelemetryMiddleware
from app.api.v1.telemetry import router


@pytest.fixture
def telemetry_client(db_session, test_user):
    app = FastAPI()
    app.add_middleware(TelemetryMiddleware)
    app.include_router(router, prefix="/api/v1/telemetry")
    from app.api.v1.api_keys import router as key_router
    from app.core.rate_limit import limiter

    app.state.limiter = limiter
    app.include_router(key_router, prefix="/api/v1/api-keys")
    app.dependency_overrides[get_db] = lambda: db_session

    @app.get("/test-action")
    def action(user=Depends(get_current_active_user)):
        emit("operation", "test-action", attributes={"password": "hidden"})
        return {"ok": True}

    @app.get("/test-error")
    def error():
        raise RuntimeError("password=hidden https://provider.test/x?key=hidden")

    @app.get("/test-handled")
    def handled():
        raise HTTPException(503, "Unavailable")

    @app.get("/test-job")
    def job(background_tasks: BackgroundTasks):
        @observe("test-job", kind="job")
        def run():
            emit("operation", "test-job-child")

        background_tasks.add_task(run)
        return {"ok": True}

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    collector.drain()


@pytest.fixture
def admin_headers(test_user):
    return {
        "Authorization": f"Bearer {create_access_token(data={'sub': test_user.id})}"
    }


def create_key(client, headers):
    response = client.post(
        "/api/v1/api-keys",
        headers=headers,
        json={"name": "test-agent", "expiresInDays": 1, "access": "telemetry"},
    )
    assert response.status_code == 201, response.text
    return {**response.json()["data"], "api_key": response.json()["apiKey"]}


def test_redaction_is_recursive_and_removes_url_queries(monkeypatch):
    monkeypatch.setenv("TEST_PROVIDER_API_KEY", "test-private-provider-value")
    data = sanitize(
        {
            "Authorization": "Bearer secret",
            "nested": [
                {
                    "access_token": "secret",
                    "message": "password=hunter2 test-private-provider-value test@example.com https://x.test/path?key=secret#token",
                }
            ],
        }
    )
    value = json.dumps(data)
    for secret in (
        "hunter2",
        "test-private-provider-value",
        "test@example.com",
        "?key=",
        "Bearer secret",
    ):
        assert secret not in value
    assert data["Authorization"] == "[REDACTED]"


def test_key_lifecycle_and_scope(telemetry_client, admin_headers, db_session):
    created = create_key(telemetry_client, admin_headers)
    raw = created["api_key"]
    row = db_session.query(TelemetryApiKey).filter_by(id=created["id"]).one()
    assert row.key_hash == hashlib.sha256(raw.encode()).hexdigest()
    headers = {"X-API-Key": raw}
    assert (
        telemetry_client.get(
            "/api/v1/telemetry/capabilities", headers=headers
        ).status_code
        == 200
    )
    assert (
        raw not in telemetry_client.get("/api/v1/api-keys", headers=admin_headers).text
    )
    assert (
        telemetry_client.post(
            "/api/v1/api-keys", headers=headers, json={"name": "test-escalation"}
        ).status_code
        == 401
    )
    assert (
        telemetry_client.delete(
            f"/api/v1/api-keys/{created['id']}", headers=admin_headers
        ).status_code
        == 200
    )
    assert (
        telemetry_client.get("/api/v1/telemetry/events", headers=headers).status_code
        == 401
    )


def test_demoted_disabled_expired_keys_rejected(
    telemetry_client, admin_headers, test_user, db_session
):
    created = create_key(telemetry_client, admin_headers)
    headers = {"X-API-Key": created["api_key"]}
    test_user.roles = []
    db_session.commit()
    assert (
        telemetry_client.get("/api/v1/telemetry/events", headers=headers).status_code
        == 403
    )
    test_user.is_superuser = True
    test_user.is_active = False
    db_session.commit()
    assert (
        telemetry_client.get("/api/v1/telemetry/events", headers=headers).status_code
        == 401
    )
    test_user.is_active = True
    row = db_session.get(TelemetryApiKey, created["id"])
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    assert (
        telemetry_client.get("/api/v1/telemetry/events", headers=headers).status_code
        == 401
    )


def test_unauthenticated_and_non_admin_queries_rejected(
    telemetry_client, admin_headers, test_user, db_session
):
    assert telemetry_client.get("/api/v1/telemetry/events").status_code == 401
    test_user.roles = []
    db_session.commit()
    assert (
        telemetry_client.get(
            "/api/v1/telemetry/events", headers=admin_headers
        ).status_code
        == 403
    )
    assert (
        telemetry_client.post(
            "/api/v1/api-keys",
            headers=admin_headers,
            json={"name": "test-denied", "access": "telemetry"},
        ).status_code
        == 403
    )


def test_request_trace_user_and_background_correlation(
    telemetry_client, admin_headers, test_user
):
    parent = "00-" + "1" * 32 + "-" + "2" * 16 + "-01"
    response = telemetry_client.get(
        "/test-action?secret=hidden", headers={**admin_headers, "traceparent": parent}
    )
    assert response.status_code == 200
    assert response.headers["traceparent"].split("-")[1] == "1" * 32
    collector.drain()
    result = telemetry_client.get(
        "/api/v1/telemetry/traces/" + "1" * 32, headers=admin_headers
    ).json()
    events = result["data"]
    assert any(e["kind"] == "request" and e["user_id"] == test_user.id for e in events)
    assert any(e["name"] == "test-action" for e in events)
    assert "hidden" not in json.dumps(events)
    job = telemetry_client.get("/test-job")
    collector.drain()
    result = telemetry_client.get(
        "/api/v1/telemetry/traces/" + job.headers["traceparent"].split("-")[1],
        headers=admin_headers,
    ).json()
    assert {e["name"] for e in result["data"]} >= {"test-job", "test-job-child"}


def test_errors_carry_reference_and_are_searchable(telemetry_client, admin_headers):
    response = telemetry_client.get("/test-error")
    assert response.status_code == 500
    assert response.headers["x-request-id"]
    assert "hidden" not in response.text
    collector.drain()
    events = telemetry_client.get(
        "/api/v1/telemetry/events?level=error", headers=admin_headers
    ).json()
    assert events["pagination"]["total"] > 0
    assert "hidden" not in json.dumps(events)
    assert telemetry_client.get(
        "/api/v1/telemetry/errors", headers=admin_headers
    ).json()["data"]


def test_feedback_persists_and_pagination(telemetry_client, admin_headers):
    response = telemetry_client.post(
        "/api/v1/telemetry/feedback",
        headers=admin_headers,
        json={
            "message": "test-feedback: generation was confusing",
            "category": "bug",
            "page": "/image-ads?token=secret",
        },
    )
    assert response.status_code == 201, response.text
    result = telemetry_client.get(
        "/api/v1/telemetry/events?kind=feedback&limit=1", headers=admin_headers
    ).json()
    assert result["data"][0]["id"] == response.json()["id"]
    assert result["pagination"]["limit"] == 1
    assert "token=secret" not in json.dumps(result)
    assert (
        telemetry_client.get(
            "/api/v1/telemetry/events?limit=1001", headers=admin_headers
        ).status_code
        == 422
    )


def test_client_ingestion_is_authenticated_bounded_and_not_server_truth(
    telemetry_client, admin_headers
):
    payload = {
        "events": [{"name": "browser.error", "message": "test-error", "level": "error"}]
    }
    assert (
        telemetry_client.post(
            "/api/v1/telemetry/client-events", json=payload
        ).status_code
        == 401
    )
    response = telemetry_client.post(
        "/api/v1/telemetry/client-events", json=payload, headers=admin_headers
    )
    assert response.status_code == 202
    assert (
        telemetry_client.post(
            "/api/v1/telemetry/client-events",
            json={"events": payload["events"] * 21},
            headers=admin_headers,
        ).status_code
        == 422
    )
    collector.drain()
    event = telemetry_client.get(
        "/api/v1/telemetry/events?kind=browser", headers=admin_headers
    ).json()["data"][0]
    assert event["attributes"]["source"] == "untrusted_client"


def test_collector_failure_does_not_break_requests(telemetry_client, monkeypatch):
    monkeypatch.setattr(
        collector,
        "persist",
        lambda batch: (_ for _ in ()).throw(RuntimeError("database down")),
    )
    before = collector.dropped
    assert telemetry_client.get("/test-handled").status_code == 503
    collector.drain()
    assert collector.dropped > before


def test_invalid_trace_is_replaced_and_body_is_bounded(telemetry_client, admin_headers):
    response = telemetry_client.get(
        "/test-job", headers={"traceparent": "00-" + "0" * 32 + "-" + "0" * 16 + "-01"}
    )
    assert response.headers["traceparent"].split("-")[1] != "0" * 32
    response = telemetry_client.post(
        "/api/v1/telemetry/client-events", headers=admin_headers, content="x" * 65537
    )
    assert response.status_code == 413


def test_query_windows_metrics_and_health(telemetry_client, admin_headers):
    assert (
        telemetry_client.get(
            "/api/v1/telemetry/events?since=2026-09-07T12:00:00", headers=admin_headers
        ).status_code
        == 422
    )
    metrics = telemetry_client.get("/api/v1/telemetry/metrics", headers=admin_headers)
    assert metrics.status_code == 200
    assert metrics.json()["requests"] >= 0
    health = telemetry_client.get("/api/v1/telemetry/health", headers=admin_headers)
    assert health.status_code == 200
    assert health.json()["database"] == "reachable"
    assert "DATABASE_URL" not in health.text


def test_database_exceptions_never_include_sql_values():
    from sqlalchemy.exc import StatementError
    from app.telemetry.runtime import error_message

    error = StatementError(
        "failed",
        "INSERT INTO users VALUES (:password)",
        {"password": "private-value"},
        ValueError(),
    )
    assert "private-value" not in error_message(error)
    assert "INSERT" not in error_message(error)
    assert "private-value" not in sanitize(
        '{"api_key": "private-value", "password": "private-value"}'
    )


def test_dependency_spans_are_nested_and_omit_arguments():
    from app.telemetry.instrumentation import wrap_client
    from app.telemetry.runtime import Collector

    class Provider:
        def call(self, payload):
            raise ValueError("provider timeout")

    wrap_client(Provider, "call", "test-provider")
    token = trace_context.set({"trace_id": "a" * 32, "span_id": "b" * 16})
    try:
        with pytest.raises(ValueError):
            Provider().call({"password": "private-value"})
    finally:
        trace_context.reset(token)
    records = []
    while not collector.queue.empty():
        records.append(collector.queue.get_nowait())
    event = next(e for e in records if e["name"] == "test-provider")
    assert event["parent_span_id"] == "b" * 16
    assert event["level"] == "error"
    assert "private-value" not in json.dumps(event, default=str)


def test_queue_overflow_is_bounded():
    from app.telemetry.runtime import Collector

    instance = Collector()
    for i in range(instance.queue.maxsize + 3):
        instance.enqueue({"id": str(i)})
    assert instance.queue.qsize() == instance.queue.maxsize
    assert instance.dropped == 3


def test_retention_deletes_only_expired_telemetry(db_session):
    from app.telemetry.runtime import make_event

    old = make_event(
        "operation",
        "test-old",
        created_at=datetime.now(timezone.utc) - timedelta(days=100),
    )
    recent = make_event("operation", "test-recent")
    db_session.add_all([TelemetryEvent(**old), TelemetryEvent(**recent)])
    db_session.commit()
    collector.prune()
    db_session.expire_all()
    assert db_session.get(TelemetryEvent, old["id"]) is None
    assert db_session.get(TelemetryEvent, recent["id"]) is not None


def test_validation_errors_do_not_echo_payload(telemetry_client, admin_headers):
    response = telemetry_client.post(
        "/api/v1/telemetry/client-events",
        headers=admin_headers,
        json={
            "events": [{"name": "fake.server.event", "message": "private-input-value"}]
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "private-input-value" not in response.text


@pytest.mark.anyio
async def test_concurrent_request_contexts_are_isolated():
    import asyncio
    import httpx

    app = FastAPI()
    app.add_middleware(TelemetryMiddleware)

    @app.get("/test-concurrent")
    async def action():
        first = trace_context.get()["trace_id"]
        await asyncio.sleep(0.01)
        return {"first": first, "last": trace_context.get()["trace_id"]}

    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        results = await asyncio.gather(
            *[client.get("/test-concurrent") for _ in range(5)]
        )
    assert len({r.json()["first"] for r in results}) == 5
    assert all(r.json()["first"] == r.json()["last"] for r in results)
    assert trace_context.get() is None


def test_additive_migration_upgrade_and_downgrade():
    from importlib.util import spec_from_file_location, module_from_spec
    from pathlib import Path
    from sqlalchemy import inspect, text
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.database import engine

    path = (
        Path(__file__).resolve().parents[2] / "alembic/versions/telemetry_20260907.py"
    )
    spec = spec_from_file_location("test_telemetry_migration", path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("CREATE SCHEMA test_telemetry_migration"))
            connection.execute(
                text("SET LOCAL search_path TO test_telemetry_migration")
            )
            connection.execute(text("CREATE TABLE users (id VARCHAR PRIMARY KEY)"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                names = set(
                    inspect(connection).get_table_names(
                        schema="test_telemetry_migration"
                    )
                )
                assert names == {"users", "telemetry_events"}
                columns = {
                    c["name"]
                    for c in inspect(connection).get_columns(
                        "telemetry_events", schema="test_telemetry_migration"
                    )
                }
                assert columns == {c.name for c in TelemetryEvent.__table__.columns}
                migration.downgrade()
                assert set(
                    inspect(connection).get_table_names(
                        schema="test_telemetry_migration"
                    )
                ) == {"users"}
        finally:
            transaction.rollback()


def test_diagnostics_key_cannot_access_business_or_manage_keys(
    telemetry_client, admin_headers
):
    key = create_key(telemetry_client, admin_headers)
    headers = {"Authorization": f"Bearer {key['api_key']}"}
    assert telemetry_client.get("/test-action", headers=headers).status_code == 403
    assert telemetry_client.get("/api/v1/api-keys", headers=headers).status_code == 403
    assert (
        telemetry_client.post(
            "/api/v1/api-keys",
            headers=headers,
            json={"name": "test-escalation", "access": "write"},
        ).status_code
        == 403
    )
    assert (
        telemetry_client.post(
            "/api/v1/telemetry/client-events",
            headers=headers,
            json={"events": [{"name": "browser.error"}]},
        ).status_code
        == 403
    )
    assert (
        telemetry_client.post(
            "/api/v1/telemetry/feedback",
            headers=headers,
            json={"message": "test-agent feedback"},
        ).status_code
        == 201
    )


def test_existing_admin_keys_report_actual_capabilities(
    telemetry_client, admin_headers
):
    for access, expected_feedback in [("read", 403), ("write", 201)]:
        result = telemetry_client.post(
            "/api/v1/api-keys",
            headers=admin_headers,
            json={"name": f"test-{access}", "access": access},
        ).json()
        headers = {"Authorization": f"Bearer {result['apiKey']}"}
        result = telemetry_client.get("/api/v1/telemetry/capabilities", headers=headers)
        assert result.status_code == 200
        assert ("feedback:write" in result.json()["scopes"]) == (access == "write")
        assert (
            telemetry_client.post(
                "/api/v1/telemetry/feedback",
                headers=headers,
                json={"message": "test-existing agent"},
            ).status_code
            == expected_feedback
        )


def test_demotion_also_revokes_diagnostics_feedback(
    telemetry_client, admin_headers, test_user, db_session
):
    key = create_key(telemetry_client, admin_headers)
    test_user.roles = []
    db_session.commit()
    response = telemetry_client.post(
        "/api/v1/telemetry/feedback",
        headers={"Authorization": f"Bearer {key['api_key']}"},
        json={"message": "test-demoted agent"},
    )
    assert response.status_code == 403


def test_plugin_worker_credentials_are_redacted():
    result = sanitize(
        {
            "workerKey": "test-opaque-credential",
            "message": "bwp_worker_test-private-value worker_key=test-other-value",
        }
    )
    assert result["workerKey"] == "[REDACTED]"
    assert "test-private-value" not in result["message"]
    assert "test-other-value" not in result["message"]
