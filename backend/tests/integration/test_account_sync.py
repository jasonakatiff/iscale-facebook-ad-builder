"""Durable account synchronization with real transactions and simulated Meta transport."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from facebook_business.api import FacebookAdsApi, FacebookResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from tests.workspace_fixtures import workspace_data, member, grant  # noqa: F401


def api_enqueue(data, headers=None):
    response = data["client"].post(
        f"/api/v2/accounts/{data['account']}/sync",
        json={},
        headers=headers or data["headers"],
    )
    assert response.status_code == 202, response.text
    return response.json()


def runner(data):
    from app.services.account_sync import claim_sync_job, run_sync_job

    factory = sessionmaker(bind=data["db"].bind)

    def run():
        with factory() as db:
            lease = claim_sync_job(db, "test-worker")
        assert lease
        return run_sync_job(factory, lease)

    return factory, run


def transport(monkeypatch, pages):
    calls = []

    def call(self, method, path, params=None, **kwargs):
        assert method == "GET" and path[-1] == "campaigns"
        calls.append(params or {})
        value = pages[len(calls) - 1]
        if isinstance(value, Exception):
            raise value
        if callable(value):
            value = value()
        return FacebookResponse(body=json.dumps(value), http_status=200, headers={})

    monkeypatch.setattr(FacebookAdsApi, "call", call)
    return calls


def snapshot(data):
    response = data["client"].get(
        f"/api/v2/accounts/{data['account']}/snapshot", headers=data["headers"]
    )
    assert response.status_code == 200
    return response.json()


def test_atomic_snapshot_pagination_corrections_and_restart(
    workspace_data, monkeypatch
):
    data = workspace_data
    job = api_enqueue(data)
    calls = transport(
        monkeypatch,
        [
            {
                "data": [
                    {
                        "id": "test-1",
                        "name": "test-old",
                        "access_token": "test-must-redact",
                    }
                ],
                "paging": {
                    "cursors": {"after": "test-page-2"},
                    "next": "https://example.invalid/ignored",
                },
            },
            {
                "data": [
                    {"id": "test-1", "name": "test-corrected"},
                    {"id": "test-2", "name": "test-second"},
                ]
            },
        ],
    )
    factory, run = runner(data)
    assert run() == "succeeded"
    result = snapshot(data)
    assert [row["name"] for row in result["data"]] == ["test-corrected", "test-second"]
    assert "test-must-redact" not in json.dumps(result)
    assert result["sync"]["coverage"] == "complete" and result["sync"]["stale"] is False
    assert calls[1]["after"] == "test-page-2"
    fresh_engine = create_engine(data["db"].bind.url)
    from app.models import AccountSnapshot

    with sessionmaker(bind=fresh_engine)() as db:
        stored = db.query(AccountSnapshot).filter_by(account_id=data["account"]).one()
        assert len(stored.items) == 2 and stored.generation_id == job["id"]
    fresh_engine.dispose()


def test_failed_later_page_preserves_last_complete_generation(
    workspace_data, monkeypatch
):
    data = workspace_data
    factory, run = runner(data)
    api_enqueue(data)
    transport(monkeypatch, [{"data": [{"id": "test-old", "name": "test-keep"}]}])
    assert run() == "succeeded"
    before = snapshot(data)
    api_enqueue(data)
    transport(
        monkeypatch,
        [
            {
                "data": [{"id": "test-new"}],
                "paging": {"cursors": {"after": "test-next"}, "next": "ignored"},
            },
            RuntimeError("test-secret-provider-token"),
        ],
    )
    assert run() == "failed"
    after = snapshot(data)
    assert after["data"] == before["data"]
    assert after["sync"]["last_success_at"] == before["sync"]["last_success_at"]
    assert after["sync"]["stale"] is True
    assert "test-secret-provider-token" not in json.dumps(after)


def test_empty_snapshot_is_complete_not_pending(workspace_data, monkeypatch):
    data = workspace_data
    api_enqueue(data)
    transport(monkeypatch, [{"data": []}])
    factory, run = runner(data)
    assert run() == "succeeded"
    result = snapshot(data)
    assert result["data"] == [] and result["sync"]["coverage"] == "complete"


def test_concurrent_enqueue_coalesces_and_workers_claim_once(workspace_data):
    from app.services.account_sync import enqueue_sync, claim_sync_job

    data = workspace_data
    factory = sessionmaker(bind=data["db"].bind)

    def enqueue(_):
        with factory() as db:
            return enqueue_sync(db, data["account"], data["admin"])["id"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        ids = list(pool.map(enqueue, range(4)))
    assert len(set(ids)) == 1

    def claim(index):
        with factory() as db:
            return claim_sync_job(db, f"test-worker-{index}")

    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(claim, range(2)))
    assert sum(item is not None for item in claims) == 1


def test_expired_lease_cannot_publish_after_another_worker_claims(
    workspace_data, monkeypatch
):
    from app.models import AccountSyncJob
    from app.services.account_sync import claim_sync_job, run_sync_job

    data = workspace_data
    api_enqueue(data)
    factory = sessionmaker(bind=data["db"].bind)
    with factory() as db:
        first = claim_sync_job(db, "test-old-worker")
        job = db.get(AccountSyncJob, first["id"])
        job.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    with factory() as db:
        second = claim_sync_job(db, "test-new-worker")
    assert first["id"] == second["id"] and first["lease_token"] != second["lease_token"]
    calls = transport(monkeypatch, [{"data": [{"id": "test-current"}]}])
    assert run_sync_job(factory, first) == "lease_lost"
    assert calls == []
    assert run_sync_job(factory, second) == "succeeded"


def test_revocation_between_pages_blocks_publication_and_no_db_network_lock(
    workspace_data, monkeypatch
):
    data = workspace_data
    member(data)
    grant(data)
    api_enqueue(data, data["user_headers"])
    factory, run = runner(data)

    def first_page():
        from sqlalchemy import text

        with factory() as db:
            count = db.execute(
                text(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction' AND pid<>pg_backend_pid()"
                )
            ).scalar_one()
            assert count == 0
        member(data, active=False)
        return {
            "data": [{"id": "test-first"}],
            "paging": {"cursors": {"after": "test-next"}, "next": "ignored"},
        }

    data["db"].commit()
    calls = transport(monkeypatch, [first_page])
    assert run() == "blocked"
    assert len(calls) == 1 and snapshot(data)["sync"]["coverage"] == "none"


def test_regrant_does_not_resurrect_a_job_authorized_before_revocation(
    workspace_data, monkeypatch
):
    data = workspace_data
    member(data)
    grant(data)
    api_enqueue(data, data["user_headers"])
    grant(data, active=False)
    grant(data, active=True)
    calls = transport(monkeypatch, [])
    factory, run = runner(data)
    assert run() == "blocked" and calls == []


def test_queued_refresh_retains_previous_attempt_time(workspace_data, monkeypatch):
    data = workspace_data
    api_enqueue(data)
    transport(monkeypatch, [{"data": []}])
    factory, run = runner(data)
    assert run() == "succeeded"
    previous = snapshot(data)["sync"]["last_attempt_at"]
    api_enqueue(data)
    assert snapshot(data)["sync"]["last_attempt_at"] == previous


def test_separate_worker_process_completes_durable_job(workspace_data):
    import os
    import subprocess
    import sys
    from pathlib import Path

    data = workspace_data
    job = api_enqueue(data)
    code = """
import json, runpy, sys
from facebook_business.api import FacebookAdsApi, FacebookResponse
from sqlalchemy import text
from app.database import engine
from app.models import InstallationState
from app.database import SessionLocal
from app.core.installation import REQUIRED_SCHEMA_REVISION
with engine.begin() as connection:
    connection.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num varchar(32) PRIMARY KEY)"))
    connection.execute(text("DELETE FROM alembic_version"))
    connection.execute(text("INSERT INTO alembic_version VALUES (:head)"), {"head": REQUIRED_SCHEMA_REVISION})
with SessionLocal.begin() as db:
    state = db.get(InstallationState, 1)
    if state is None:
        db.add(InstallationState(id=1, initialized=True))
    else:
        state.initialized = True

def transport(self, method, path, params=None, **kwargs):
    assert method == 'GET' and path[-1] == 'campaigns'
    return FacebookResponse(body=json.dumps({'data':[{'id':'test-subprocess','name':'test-persisted'}]}),http_status=200,headers={})

FacebookAdsApi.call=transport
sys.argv=['app.sync_worker','--once']
runpy.run_module('app.sync_worker',run_name='__main__')
"""
    result = subprocess.run(
        [sys.executable, "-c", code],
        env=os.environ.copy(),
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert f"{job['id']}: succeeded" in result.stdout
    assert snapshot(data)["data"][0]["id"] == "test-subprocess"


def test_database_rejects_cross_workspace_grants_and_duplicate_live_jobs(
    workspace_data,
):
    import pytest
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy import text
    from uuid import uuid4
    from app.models import WorkspaceAccountGrant

    data = workspace_data
    with pytest.raises(IntegrityError, match="foreign key"):
        with data["db"].begin_nested():
            data["db"].add(
                WorkspaceAccountGrant(
                    workspace_id=data["other_workspace"],
                    account_id=data["account"],
                    user_id=data["admin"],
                    can_sync=True,
                )
            )
            data["db"].flush()
    job = api_enqueue(data)
    with pytest.raises(IntegrityError, match="uq_active_account_sync"):
        with data["db"].begin_nested():
            data["db"].execute(
                text(
                    """INSERT INTO account_sync_jobs
                (id,workspace_id,account_id,membership_version,grant_version,connection_id,credential_owner_version)
                SELECT :new_id,workspace_id,account_id,membership_version,grant_version,connection_id,credential_owner_version
                FROM account_sync_jobs WHERE id=:old_id"""
                ),
                {"new_id": str(uuid4()), "old_id": job["id"]},
            )


def test_repeated_cursor_fails_without_publishing_partial_data(
    workspace_data, monkeypatch
):
    data = workspace_data
    api_enqueue(data)
    page = {
        "data": [{"id": "test-partial"}],
        "paging": {"cursors": {"after": "test-loop"}, "next": "ignored"},
    }
    calls = transport(monkeypatch, [page, page])
    factory, run = runner(data)
    assert run() == "failed"
    assert len(calls) == 2 and snapshot(data)["sync"]["coverage"] == "none"


def test_lease_lost_during_provider_request_cannot_commit(workspace_data, monkeypatch):
    from app.models import AccountSyncJob
    from app.services.account_sync import claim_sync_job

    data = workspace_data
    api_enqueue(data)
    factory, run = runner(data)

    def lose_lease():
        with factory() as db:
            job = db.query(AccountSyncJob).filter_by(account_id=data["account"]).one()
            job.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
            assert claim_sync_job(db, "test-replacement-worker")
        return {"data": [{"id": "test-obsolete-result"}]}

    transport(monkeypatch, [lose_lease])
    assert run() == "lease_lost"
    assert snapshot(data)["sync"]["coverage"] == "none"


def test_worker_recovery_stops_at_retry_limit(workspace_data):
    from app.core.workspace_config import SYNC_MAX_ATTEMPTS
    from app.models import AccountSyncJob
    from app.services.account_sync import claim_sync_job

    data = workspace_data
    job_id = api_enqueue(data)["id"]
    factory = sessionmaker(bind=data["db"].bind)
    with factory() as db:
        lease = claim_sync_job(db, "test-lost-worker")
        job = db.get(AccountSyncJob, job_id)
        job.attempts = SYNC_MAX_ATTEMPTS
        job.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        assert claim_sync_job(db, "test-recovery-worker") is None
    result = (
        data["client"]
        .get(f"/api/v2/sync-jobs/{job_id}", headers=data["headers"])
        .json()
    )
    assert (
        result["status"] == "failed" and result["error"]["code"] == "LEASE_RETRY_LIMIT"
    )
    assert lease["lease_token"] not in json.dumps(result)


def test_connection_owner_regrant_invalidates_previously_queued_work(
    workspace_data, monkeypatch
):
    data = workspace_data
    member(data, "admin")
    grant(data)
    api_enqueue(data, data["user_headers"])
    for active in [False, True]:
        result = data["client"].put(
            f"/api/v2/workspaces/{data['workspace']}/members/{data['admin']}",
            json={"role": "admin", "is_active": active},
            headers=data["user_headers"],
        )
        assert result.status_code == 200
    calls = transport(monkeypatch, [])
    factory, run = runner(data)
    assert run() == "blocked" and calls == []
