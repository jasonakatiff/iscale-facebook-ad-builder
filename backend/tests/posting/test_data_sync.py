from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from decimal import Decimal
from unittest.mock import Mock

import pytest

from app.delivery.models import DeliverySync, AdInsight, ManagedAd
from app.delivery.provider import ProviderError, decimal_value
from app.delivery.queue import enqueue, persist_ad
from app.delivery.sync import sync_tick


def setup_ad(sessions, buyer):
    with sessions() as db:
        job = enqueue(
            db,
            buyer.id,
            "test-import",
            "act_789",
            "ad",
            {
                "name": "test-ad",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        persist_ad(db, job, "987")
        status = db.query(DeliverySync).filter_by(kind="status").one()
        status.next_run_at = datetime.now(timezone.utc) + timedelta(days=1)
        db.commit()


def provider_for(rows):
    provider = Mock()
    provider.account_info.return_value = {
        "id": "act_789",
        "currency": "USD",
        "timezone_name": "America/Los_Angeles",
    }
    provider.insight_pages.return_value = iter([rows])
    return provider


def test_replayed_report_replaces_snapshot_and_updates_late_spend(
    sessions, engine, buyer
):
    setup_ad(sessions, buyer)
    today = datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    row = {
        "ad_id": "987",
        "date_start": today,
        "date_stop": today,
        "impressions": "100",
        "clicks": "3",
        "spend": "0.29",
        "actions": [],
    }
    sync_tick(engine, lambda: provider_for([row]))
    with sessions() as db:
        sync = db.query(DeliverySync).filter_by(kind="performance").one()
        assert sync.last_success_at is not None
        sync.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    sync_tick(engine, lambda: provider_for([{**row, "spend": "0.58"}]))
    with sessions() as db:
        assert db.query(AdInsight).count() == 1
        assert db.query(AdInsight).one().spend == Decimal("0.58")


def test_partial_report_failure_does_not_commit_or_advance_checkpoint(
    sessions, engine, buyer
):
    setup_ad(sessions, buyer)
    provider = provider_for([])

    def pages(*args):
        yield [
            {
                "ad_id": "987",
                "date_start": datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat(),
                "date_stop": datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat(),
                "impressions": "1",
                "clicks": "1",
                "spend": "0.29",
            }
        ]
        raise ProviderError("test-transient", retryable=True)

    provider.insight_pages.side_effect = pages
    sync_tick(engine, lambda: provider)
    with sessions() as db:
        assert db.query(AdInsight).count() == 0
        sync = db.query(DeliverySync).filter_by(kind="performance").one()
        assert sync.last_success_at is None
        assert sync.failures == 1
        assert sync.status == "retry_wait"


def test_exhausted_retries_stay_failed_on_scheduler_ticks(sessions, engine, buyer):
    setup_ad(sessions, buyer)
    provider = provider_for([])
    provider.account_info.side_effect = ProviderError("test-transient", retryable=True)
    for _ in range(6):
        with sessions() as db:
            sync = db.query(DeliverySync).filter_by(kind="performance").one()
            sync.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
        sync_tick(engine, lambda: provider)
    assert provider.account_info.call_count == 4
    with sessions() as db:
        assert (
            db.query(DeliverySync).filter_by(kind="performance").one().status
            == "failed"
        )


def test_permanent_error_is_not_retried(sessions, engine, buyer):
    setup_ad(sessions, buyer)
    provider = provider_for([])
    provider.account_info.side_effect = ProviderError("test-denied")
    sync_tick(engine, lambda: provider)
    with sessions() as db:
        sync = db.query(DeliverySync).filter_by(kind="performance").one()
        assert sync.failures == 1
        assert sync.status == "failed"


@pytest.mark.parametrize(
    "value", ["NaN", "Infinity", "-0.01", "0.0000001", "1000000000000000000"]
)
def test_invalid_money_is_rejected(value):
    with pytest.raises(ValueError):
        decimal_value(value)


def test_decimal_spend_is_exact():
    assert decimal_value("0.29") + decimal_value("0.01") == Decimal("0.30")


def test_successful_empty_reimport_removes_old_snapshot(sessions, engine, buyer):
    setup_ad(sessions, buyer)
    today = datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    row = {
        "ad_id": "987",
        "date_start": today,
        "date_stop": today,
        "impressions": "100",
        "clicks": "3",
        "spend": "0.29",
    }
    sync_tick(engine, lambda: provider_for([row]))
    with sessions() as db:
        sync = db.query(DeliverySync).filter_by(kind="performance").one()
        sync.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    sync_tick(engine, lambda: provider_for([]))
    with sessions() as db:
        assert db.query(AdInsight).count() == 0


def test_interrupted_import_consumes_retry_budget(sessions, engine, buyer):
    setup_ad(sessions, buyer)
    with sessions() as db:
        sync = db.query(DeliverySync).filter_by(kind="performance").one()
        sync.status, sync.failures = "running", 3
        sync.run_started_at = datetime.now(timezone.utc)
        db.commit()
    provider = provider_for([])
    sync_tick(engine, lambda: provider)
    provider.account_info.assert_not_called()
    with sessions() as db:
        assert (
            db.query(DeliverySync).filter_by(kind="performance").one().status
            == "failed"
        )


def test_status_import_batches_reads_and_verifies_identity(sessions, engine, buyer):
    setup_ad(sessions, buyer)
    with sessions() as db:
        status = db.query(DeliverySync).filter_by(kind="status").one()
        status.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=2)
        db.commit()
    provider = provider_for([])
    provider.ad_statuses.return_value = {
        "987": {"id": "987", "account_id": "789", "effective_status": "ACTIVE"}
    }
    sync_tick(engine, lambda: provider)
    provider.ad_statuses.assert_called_once_with(["987"])
    with sessions() as db:
        ad = db.query(ManagedAd).one()
        assert ad.effective_status == "ACTIVE" and ad.status_synced_at is not None


def test_same_account_imports_keep_buyers_and_credentials_separate(
    sessions, engine, buyer
):
    from app.models import User

    setup_ad(sessions, buyer)
    with sessions() as db:
        other = User(
            id="test-other-buyer",
            email="test-other@example.com",
            name="test-other",
            hashed_password="test-unused",
            is_active=True,
            is_superuser=True,
        )
        db.add(other)
        db.commit()
        job = enqueue(
            db,
            other.id,
            "test-other-import",
            "act_789",
            "ad",
            {
                "name": "test-other-ad",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        persist_ad(db, job, "988")
        assert db.query(DeliverySync).count() == 4
        for sync in db.query(DeliverySync):
            sync.next_run_at = datetime.now(timezone.utc) + timedelta(days=1)
        own = db.query(DeliverySync).filter_by(owner_id=buyer.id, kind="status").one()
        own.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    provider = provider_for([])
    provider.ad_statuses.return_value = {
        "987": {"id": "987", "account_id": "789", "effective_status": "PAUSED"}
    }
    sync_tick(engine, lambda: provider)
    provider.ad_statuses.assert_called_once_with(["987"])
    with sessions() as db:
        assert (
            db.query(ManagedAd).filter_by(fb_ad_id="988").one().status_synced_at is None
        )
