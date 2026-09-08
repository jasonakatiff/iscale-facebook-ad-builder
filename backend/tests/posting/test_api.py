from zoneinfo import ZoneInfo
from datetime import date
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.deps import get_current_active_user
from app.database import get_db
from app.models import User
from app.delivery.api import router
from app.delivery.queue import enqueue, persist_ad
from app.delivery.models import AdInsight
from app.delivery import config
from app.delivery.queue import utcnow


@pytest.fixture
def api(sessions, buyer):
    application = FastAPI()
    application.include_router(router, prefix="/api/v1/delivery")

    def database():
        with sessions() as db:
            yield db

    application.dependency_overrides[get_db] = database
    application.dependency_overrides[get_current_active_user] = lambda: buyer
    with TestClient(application) as client:
        yield client, application


def test_admin_settings_validate_and_persist(api):
    client, _ = api
    settings = client.get("/api/v1/delivery/settings").json()
    assert settings["config"]["min_interval_seconds"] == 2
    config = settings["config"]
    bad = client.put(
        "/api/v1/delivery/settings", json={**config, "max_read_retries": -1}
    )
    assert bad.status_code == 422
    good = client.put(
        "/api/v1/delivery/settings", json={**config, "max_read_retries": 0}
    )
    assert good.status_code == 200
    assert (
        client.get("/api/v1/delivery/settings").json()["config"]["max_read_retries"]
        == 0
    )


def test_low_traffic_settings_defaults_and_validation(api):
    client, _ = api
    config = client.get("/api/v1/delivery/settings").json()["config"]
    assert config["performance_interval_seconds"] == 14400
    assert config["lookback_days"] == 2
    assert config["reconcile_days"] == 35
    response = client.put(
        "/api/v1/delivery/settings",
        json={
            **config,
            "api_requests_per_minute": 10,
            "import_requests_per_minute": 11,
        },
    )
    assert response.status_code == 422
    response = client.put(
        "/api/v1/delivery/settings",
        json={
            **config,
            "lookback_days": 7,
            "reconcile_days": 2,
        },
    )
    assert response.status_code == 422
    response = client.put(
        "/api/v1/delivery/settings",
        json={
            **config,
            "performance_interval_seconds": 3600,
            "api_requests_per_minute": 20,
            "import_requests_per_minute": 10,
        },
    )
    assert response.status_code == 200
    saved = client.get("/api/v1/delivery/settings").json()["config"]
    assert saved["api_requests_per_minute"] == 20
    assert saved["performance_interval_seconds"] == 3600


def test_buyer_cannot_change_settings_or_read_another_buyers_jobs(api, sessions, buyer):
    client, application = api
    with sessions() as db:
        job = enqueue(
            db,
            buyer.id,
            "test-private",
            "act_789",
            "ad",
            {
                "name": "test-private",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        job_id = job.id
    other = User(
        id="test-other",
        email="test-other@example.com",
        is_active=True,
        is_superuser=False,
    )
    application.dependency_overrides[get_current_active_user] = lambda: other
    assert client.put("/api/v1/delivery/settings", json={}).status_code == 403
    assert client.get("/api/v1/delivery/jobs").json()["data"] == []
    assert client.get("/api/v1/delivery/jobs/" + job_id).status_code == 404
    assert client.post("/api/v1/delivery/jobs/" + job_id + "/cancel").status_code == 404


def test_cancelled_job_is_not_requeued_on_duplicate_submission(api, sessions, buyer):
    client, _ = api
    payload = {
        "name": "test-cancel",
        "adset_id": "123",
        "creative_id": "456",
        "status": "PAUSED",
    }
    with sessions() as db:
        job_id = enqueue(db, buyer.id, "test-cancel", "act_789", "ad", payload).id
    assert client.post("/api/v1/delivery/jobs/" + job_id + "/cancel").status_code == 200
    with sessions() as db:
        assert (
            enqueue(db, buyer.id, "test-cancel", "act_789", "ad", payload).status
            == "cancelled"
        )


def test_report_is_owned_and_money_is_decimal_string(api, sessions, buyer):
    client, application = api
    with sessions() as db:
        job = enqueue(
            db,
            buyer.id,
            "test-report",
            "act_789",
            "ad",
            {
                "name": "test-report",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        persist_ad(db, job, "987")
        from app.delivery.models import ManagedAd

        ad = db.query(ManagedAd).one()
        db.add(
            AdInsight(
                managed_ad_id=ad.id,
                report_date=date.today(),
                dataset=config.DATASET,
                currency="USD",
                account_timezone="UTC",
                impressions=100,
                clicks=3,
                spend=Decimal("0.29"),
                actions=[],
                imported_at=utcnow(),
            )
        )
        db.commit()
    response = client.get("/api/v1/delivery/report")
    assert response.status_code == 200
    assert Decimal(response.json()["data"][0]["spend"]) == Decimal("0.29")
    other = User(
        id="test-other",
        email="test-other@example.com",
        is_active=True,
        is_superuser=False,
    )
    application.dependency_overrides[get_current_active_user] = lambda: other
    assert client.get("/api/v1/delivery/report").json()["data"] == []


def test_anonymous_requests_are_rejected_with_error_contract(api):
    client, application = api
    application.dependency_overrides.pop(get_current_active_user)
    response = client.get("/api/v1/delivery/jobs")
    assert response.status_code == 401
    assert "error" in response.json()


def test_launch_rejects_missing_adset_before_enqueuing(api):
    client, _ = api
    payload = {
        "request_key": "test-missing-adset",
        "account_id": "123",
        "name": "test-missing",
        "local_adset_id": "missing",
        "page_id": "789",
        "media_url": "https://example.com/test.png",
        "media_type": "image",
        "primary_text": "test",
        "headline": "test",
        "website_url": "https://example.com",
    }
    payload["creative_asset_id"] = "test-asset"
    response = client.post("/api/v1/delivery/launches", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ADSET_REQUIRED"


def test_settings_reschedule_idle_imports_without_resetting_failures(
    api, sessions, buyer
):
    from datetime import timedelta
    from app.delivery.models import DeliverySync

    client, _ = api
    config = client.get("/api/v1/delivery/settings").json()["config"]
    now = utcnow()
    with sessions() as db:
        db.add_all(
            [
                DeliverySync(
                    owner_id=buyer.id,
                    account_id="act_123",
                    kind="performance",
                    last_success_at=now,
                    last_reconciled_at=now,
                    next_run_at=now + timedelta(hours=4),
                ),
                DeliverySync(
                    owner_id=buyer.id,
                    account_id="act_456",
                    kind="performance",
                    status="failed",
                    failures=4,
                    next_run_at=now,
                ),
            ]
        )
        db.commit()
    assert (
        client.put(
            "/api/v1/delivery/settings",
            json={**config, "performance_interval_seconds": 3600},
        ).status_code
        == 200
    )
    with sessions() as db:
        assert db.query(DeliverySync).filter_by(
            account_id="act_123"
        ).one().next_run_at == now + timedelta(hours=1)
        failed = db.query(DeliverySync).filter_by(account_id="act_456").one()
        assert failed.status == "failed" and failed.failures == 4


def test_manual_refresh_coalesces_fresh_and_pending_work(api, sessions, buyer):
    from datetime import timedelta
    from app.delivery.models import DeliverySync

    client, _ = api
    now = utcnow()
    with sessions() as db:
        sync = DeliverySync(
            owner_id=buyer.id,
            account_id="act_123",
            kind="performance",
            last_success_at=now,
            next_run_at=now + timedelta(hours=4),
        )
        db.add(sync)
        db.commit()
        identity = sync.id
    for _ in range(3):
        response = client.post(f"/api/v1/delivery/syncs/{identity}/restart")
        assert response.status_code == 200 and response.json()["coalesced"]
    with sessions() as db:
        assert db.get(DeliverySync, identity).next_run_at == now + timedelta(hours=4)


def test_dashboard_reads_do_not_construct_a_provider(api, monkeypatch):
    from unittest.mock import Mock
    import app.delivery.api as delivery_api

    provider = Mock(side_effect=AssertionError("No platform calls on dashboards"))
    monkeypatch.setattr(delivery_api, "DeliveryProvider", provider)
    client, _ = api
    for path in ["report", "syncs", "jobs", "settings"]:
        assert client.get("/api/v1/delivery/" + path).status_code == 200
    provider.assert_not_called()


def test_legacy_routes_distinguish_budget_deferral_from_uncertain_write():
    from datetime import timedelta
    from fastapi import HTTPException
    from app.delivery.budget import RequestDeferred
    from app.api.v1.facebook import raise_if_budget_busy

    for written, expected in [(False, 429), (True, 409)]:
        with pytest.raises(HTTPException) as failure:
            raise_if_budget_busy(
                RequestDeferred(
                    utcnow() + timedelta(seconds=30), may_have_written=written
                )
            )
        assert failure.value.status_code == expected


def test_report_window_uses_each_accounts_date(api, sessions, buyer, monkeypatch):
    from datetime import datetime, timezone
    from app.delivery import api as delivery_api
    from app.delivery.models import ManagedAd

    monkeypatch.setattr(
        delivery_api, "utcnow", lambda: datetime(2026, 9, 8, 3, tzinfo=timezone.utc)
    )
    client, _ = api
    with sessions() as db:
        for index, zone in enumerate(["America/Los_Angeles", "UTC"]):
            job = enqueue(
                db,
                buyer.id,
                f"test-zone-{index}",
                f"act_{789+index}",
                "ad",
                {
                    "name": f"test-zone-{index}",
                    "adset_id": "123",
                    "creative_id": "456",
                    "status": "PAUSED",
                },
            )
            persist_ad(db, job, str(987 + index))
            ad = db.query(ManagedAd).filter_by(job_id=job.id).one()
            for day in [1, 2, 7, 8]:
                db.add(
                    AdInsight(
                        managed_ad_id=ad.id,
                        report_date=date(2026, 9, day),
                        dataset=config.DATASET,
                        currency="USD",
                        account_timezone=zone,
                        impressions=1,
                        clicks=1,
                        spend=Decimal("0.29"),
                        actions=[],
                        imported_at=utcnow(),
                    )
                )
        db.commit()
    response = client.get("/api/v1/delivery/report?days=7")
    assert response.status_code == 200
    rows = response.json()["data"]
    assert sorted(
        row["report_date"]
        for row in rows
        if row["account_timezone"] == "America/Los_Angeles"
    ) == ["2026-09-01", "2026-09-02", "2026-09-07"]
    assert sorted(
        row["report_date"] for row in rows if row["account_timezone"] == "UTC"
    ) == ["2026-09-02", "2026-09-07", "2026-09-08"]


def test_retry_endpoint_checks_owner_current_failure_and_permission(
    api, sessions, buyer
):
    from app.delivery.queue import fail_job
    from app.delivery.models import DeliveryJob

    client, application = api
    with sessions() as db:
        job = enqueue(
            db,
            buyer.id,
            "test-retry-api",
            "act_789",
            "ad",
            {
                "name": "test-retry-api",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        fail_job(db, job, "Reconnect Meta", code="META_CONNECTION", retry_allowed=True)
        job_id, failure_id = job.id, job.failure_id
    path = f"/api/v1/delivery/jobs/{job_id}/retry"
    other = User(
        id="test-other",
        email="test-other@example.com",
        is_active=True,
        is_superuser=False,
    )
    application.dependency_overrides[get_current_active_user] = lambda: other
    assert client.post(path, json={"failure_id": failure_id}).status_code in {403, 404}
    application.dependency_overrides[get_current_active_user] = lambda: buyer
    assert client.post(path, json={}).status_code == 422
    assert client.post(path, json={"failure_id": failure_id}).status_code == 200
    assert client.post(path, json={"failure_id": failure_id}).status_code == 409
    with sessions() as db:
        assert db.get(DeliveryJob, job_id).status == "queued"


def test_notifications_are_private_acknowledged_independently_and_respect_role_revocation(
    api, sessions, buyer
):
    from app.delivery.queue import fail_job
    from app.delivery.models import DeliveryJob

    client, application = api
    with sessions() as db:
        recipient = User(
            id="test-recipient",
            email="test-recipient@example.com",
            hashed_password="test-unused",
            is_active=True,
            is_superuser=True,
            roles=[],
        )
        db.add(recipient)
        db.commit()
        job = enqueue(
            db,
            buyer.id,
            "test-notify-api",
            "act_789",
            "ad",
            {
                "name": "test-notify-api",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        fail_job(db, job, "Meta result unknown", uncertain=True)
        job_id = job.id
    notifications = client.get("/api/v1/delivery/notifications")
    assert notifications.status_code == 200
    notice = notifications.json()["data"][0]
    assert (
        notice["job_id"] == job_id and notifications.json()["pagination"]["total"] == 1
    )
    assert (
        client.post(f"/api/v1/delivery/notifications/{notice['id']}/read").status_code
        == 200
    )
    assert (
        client.get("/api/v1/delivery/notifications").json()["pagination"]["total"] == 0
    )
    application.dependency_overrides[get_current_active_user] = lambda: recipient
    response = client.get("/api/v1/delivery/notifications").json()
    assert response["pagination"]["total"] == 1
    assert (
        client.post(f"/api/v1/delivery/notifications/{notice['id']}/read").status_code
        == 404
    )
    recipient.is_superuser = False
    assert (
        client.get("/api/v1/delivery/notifications").json()["pagination"]["total"] == 0
    )


@pytest.mark.parametrize("status", ["needs_reconciliation", "succeeded", "cancelled"])
def test_retry_endpoint_cannot_reopen_unsafe_or_completed_jobs(
    api, sessions, buyer, status
):
    from app.delivery.models import DeliveryJob
    from uuid import uuid4

    client, _ = api
    with sessions() as db:
        job = enqueue(
            db,
            buyer.id,
            "test-no-retry",
            "act_789",
            "ad",
            {
                "name": "test-no-retry",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        job.status, job.retry_allowed, job.failure_id = status, True, str(uuid4())
        db.commit()
        job_id, failure_id = job.id, job.failure_id
    assert (
        client.post(
            f"/api/v1/delivery/jobs/{job_id}/retry", json={"failure_id": failure_id}
        ).status_code
        == 409
    )


def test_reconciliation_reads_use_job_owner_and_shared_budget(
    api, sessions, monkeypatch
):
    from unittest.mock import Mock
    from app.delivery import api as delivery_api

    client, _ = api
    with sessions() as db:
        owner = User(
            id="test-job-owner",
            email="test-job-owner@example.com",
            hashed_password="test-unused",
            is_active=True,
        )
        db.add(owner)
        db.commit()
        job = enqueue(
            db,
            owner.id,
            "test-owner-reconcile",
            "act_123",
            "ad",
            {
                "name": "test-owner-reconcile",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        job.status = "needs_reconciliation"
        db.commit()
        identity = job.id
    provider = Mock()
    provider.reconciliation_candidates.return_value = []
    provider.ad_status.return_value = {"id": "987"}
    factory = Mock(
        side_effect=AssertionError(
            "Reconciliation must resolve the job owner's credentials"
        )
    )
    factory.for_user.return_value = provider
    monkeypatch.setattr(delivery_api, "DeliveryProvider", factory)
    assert client.get(f"/api/v1/delivery/jobs/{identity}/candidates").status_code == 200
    assert (
        client.post(
            f"/api/v1/delivery/jobs/{identity}/reconcile", json={"fb_ad_id": "987"}
        ).status_code
        == 409
    )
    assert factory.for_user.call_count == 2
    assert all(
        call.args[1] == "test-job-owner" for call in factory.for_user.call_args_list
    )
    assert provider.configure_budget.call_count == 2
    assert all(
        call.args[1:] == ("act_123", "interactive")
        for call in provider.configure_budget.call_args_list
    )
    factory.assert_not_called()
