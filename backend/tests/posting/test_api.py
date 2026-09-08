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
    response = client.post("/api/v1/delivery/launches", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ADSET_REQUIRED"


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
