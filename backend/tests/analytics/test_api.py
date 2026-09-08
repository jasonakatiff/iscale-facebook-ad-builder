from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.analytics.api import router
from app.core.deps import get_current_active_user
from app.database import get_db
from app.analytics.models import AnalyticsAd, AnalyticsAudit
from app.creatives.models import CreativeAsset
from app.models import User
from .test_imports import seed
from datetime import datetime, timezone


def client_for(db, user):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/analytics")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_active_user] = lambda: user
    return TestClient(app)


def test_link_snapshot_and_revision_record_actual_actor(analytics_db, analytics_owner):
    _, account = seed(analytics_db, analytics_owner)
    asset = CreativeAsset(
        id="test-asset",
        name="test-asset",
        source_type="external_upload",
        created_by_id=analytics_owner.id,
        media_url="https://example.com/test.png",
        media_type="image",
        metadata_values={"lighting": "soft"},
        metadata_revision=1,
        analysis_status="ready",
    )
    ad = AnalyticsAd(
        account_id=account.id,
        external_key="test-ad",
        external_id="987",
        name="test-ad",
        dimensions={"group_id": "123"},
        imported_at=datetime.now(timezone.utc),
    )
    analytics_db.add_all([asset, ad])
    analytics_db.commit()
    with client_for(analytics_db, analytics_owner) as client:
        r = client.put(
            f"/api/v1/analytics/ads/{ad.id}/creative",
            json={"creative_asset_id": asset.id, "expected_revision": 0},
        )
        assert r.status_code == 200
        assert r.json()["creative_snapshot"]["metadata"]["lighting"] == "soft"
        asset.metadata_values = {"lighting": "hard"}
        analytics_db.commit()
        r = client.get("/api/v1/analytics/ads")
        assert (
            r.json()["data"][0]["creative_snapshot"]["metadata"]["lighting"] == "soft"
        )
        assert (
            client.put(
                f"/api/v1/analytics/ads/{ad.id}/creative",
                json={"creative_asset_id": None, "expected_revision": 0},
            ).status_code
            == 409
        )
        assert (
            analytics_db.query(AnalyticsAudit)
            .filter_by(action="creative_linked")
            .one()
            .actor_id
            == analytics_owner.id
        )


def test_buyer_cannot_read_other_owners_data_or_change_shared_settings(
    analytics_db, analytics_owner
):
    seed(analytics_db, analytics_owner)
    other = User(
        id="test-other",
        email="test-other@example.com",
        hashed_password="test-unused",
        is_active=True,
        is_superuser=False,
    )
    analytics_db.add(other)
    analytics_db.commit()
    with client_for(analytics_db, other) as client:
        assert client.get("/api/v1/analytics/accounts").json()["data"] == []
        assert (
            client.get("/api/v1/analytics/accounts?all_users=true").status_code == 403
        )
        assert (
            client.put("/api/v1/analytics/settings/google", json={}).status_code == 403
        )
        assert client.get("/api/v1/analytics/patterns").status_code == 200


def test_saved_performance_and_account_picker_are_read_only(
    analytics_db, analytics_owner, analytics_engine
):
    from .test_imports import report_row
    from app.analytics.sync import analytics_tick
    from unittest.mock import Mock, patch

    seed(analytics_db, analytics_owner)
    provider = Mock()
    provider.page.return_value = ([report_row()], None)
    analytics_tick(analytics_engine, lambda *_: provider)
    with client_for(analytics_db, analytics_owner) as client, patch(
        "app.analytics.providers.httpx.Client",
        side_effect=AssertionError("No remote requests"),
    ):
        result = client.get("/api/v1/analytics/report")
        assert (
            result.status_code == 200
            and result.json()["data"][0]["spend"] == "0.290000"
        )
        assert result.json()["data"][0]["launched_by_id"] is None
        assert (
            client.get("/api/v1/analytics/report-accounts").json()["data"][0][
                "external_id"
            ]
            == "123"
        )
        assert client.get("/api/v1/analytics/patterns").status_code == 200


def test_failed_discovery_can_restart_and_unrelated_work_does_not_lose_refresh(
    analytics_db, analytics_owner, analytics_engine
):
    from sqlalchemy import text
    from datetime import timedelta
    from app.analytics import config

    source, account = seed(analytics_db, analytics_owner)
    source.discovery_state = {"cursor": "test-failed", "accounts": [], "seen": []}
    source.failures = 4
    source.error_message = "test-failed-discovery"
    account.next_run_at = datetime.now(timezone.utc) + timedelta(hours=4)
    analytics_db.commit()
    with analytics_engine.connect() as worker, client_for(
        analytics_db, analytics_owner
    ) as client:
        worker.execute(text("SELECT pg_advisory_lock(:key)"), {"key": config.LOCK_KEY})
        try:
            result = client.post(f"/api/v1/analytics/accounts/{account.id}/sync")
            assert result.json()["coalesced"] is False
            assert account.next_run_at <= datetime.now(timezone.utc)
            assert (
                client.post(f"/api/v1/analytics/accounts/{account.id}/sync").json()[
                    "coalesced"
                ]
                is True
            )
            assert (
                client.post(f"/api/v1/analytics/sources/{source.id}/discover").json()[
                    "coalesced"
                ]
                is False
            )
            assert source.discovery_state is None and source.failures == 0
        finally:
            worker.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": config.LOCK_KEY}
            )
