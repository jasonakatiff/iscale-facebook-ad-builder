from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from decimal import Decimal
from unittest.mock import Mock

import pytest

from app.delivery.models import DeliverySync, AdInsight, ManagedAd
from app.delivery.provider import ProviderError, decimal_value
from app.delivery.queue import enqueue, persist_ad
from app.delivery.sync import sync_tick as tick_once


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
    provider.start_report.return_value = "123456"
    provider.report_status.return_value = {
        "id": "123456",
        "async_status": "Job Completed",
    }
    provider.report_page.return_value = (
        [{"account_id": "789", **row} for row in rows],
        None,
    )
    return provider


def sync_tick(engine, factory):
    """Drive scheduled report phases without sleeping; keep retry failures observable."""
    from sqlalchemy.orm import Session

    tick_once(engine, factory)
    for _ in range(10):
        with Session(engine) as db:
            waiting = db.query(DeliverySync).filter_by(status="waiting").first()
            if not waiting:
                return
            waiting.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
        tick_once(engine, factory)
    raise AssertionError("Report did not reach a terminal or retry state")


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

    row = {
        "account_id": "789",
        "ad_id": "987",
        "date_start": datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat(),
        "date_stop": datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat(),
        "impressions": "1",
        "clicks": "1",
        "spend": "0.29",
    }
    provider.report_page.side_effect = [
        ([row], "page-2"),
        ProviderError("test-transient", retryable=True),
    ]
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


def test_report_resumes_saved_page_after_quota_deferral(sessions, engine, buyer):
    from app.delivery.budget import RequestDeferred
    from app.delivery.models import StagedInsight

    setup_ad(sessions, buyer)
    row = {
        "account_id": "789",
        "ad_id": "987",
        "date_start": datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat(),
        "date_stop": datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat(),
        "impressions": "100",
        "clicks": "3",
        "spend": "0.29",
    }
    provider = provider_for([])
    provider.report_page.side_effect = [
        ([row], "second"),
        RequestDeferred(datetime.now(timezone.utc) + timedelta(minutes=1)),
        ([], None),
    ]
    sync_tick(engine, lambda: provider)
    with sessions() as db:
        sync = db.query(DeliverySync).filter_by(kind="performance").one()
        assert sync.status == "deferred" and sync.failures == 0
        assert sync.report_state["cursor"] == "second"
        assert db.query(StagedInsight).count() == 1
        assert db.query(AdInsight).count() == 0
        sync.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    sync_tick(engine, lambda: provider)
    provider.start_report.assert_called_once()
    assert [call.args[1] for call in provider.report_page.call_args_list] == [
        None,
        "second",
        "second",
    ]
    with sessions() as db:
        assert db.query(AdInsight).one().spend == Decimal("0.29")
        assert db.query(StagedInsight).count() == 0


def test_completed_report_only_promotes_managed_ads(sessions, engine, buyer):
    setup_ad(sessions, buyer)
    row = {
        "account_id": "789",
        "ad_id": "unmanaged",
        "date_start": datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat(),
        "date_stop": datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat(),
        "spend": "1000",
    }
    provider = provider_for([row])
    sync_tick(engine, lambda: provider)
    provider.start_report.assert_called_once()
    assert len(provider.start_report.call_args.args) == 3
    with sessions() as db:
        assert db.query(AdInsight).count() == 0
        assert (
            db.query(DeliverySync).filter_by(kind="performance").one().last_success_at
        )


def test_correction_and_recent_windows_follow_saved_settings(sessions, engine, buyer):
    from app.delivery.queue import get_settings

    setup_ad(sessions, buyer)
    with sessions() as db:
        settings = get_settings(db)
        settings.reconcile_days, settings.lookback_days = 60, 3
        db.commit()
    provider = provider_for([])
    sync_tick(engine, lambda: provider)
    _, since, until = provider.start_report.call_args.args
    assert (until - since).days == 59
    with sessions() as db:
        sync = db.query(DeliverySync).filter_by(kind="performance").one()
        sync.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    sync_tick(engine, lambda: provider)
    _, since, until = provider.start_report.call_args.args
    assert (until - since).days == 2


def test_stable_statuses_are_not_refetched_at_new_ad_cadence(sessions, engine, buyer):
    setup_ad(sessions, buyer)
    with sessions() as db:
        ad = db.query(ManagedAd).one()
        ad.created_at = datetime.now(timezone.utc) - timedelta(days=2)
        ad.effective_status, ad.status_synced_at = "ACTIVE", datetime.now(
            timezone.utc
        ) - timedelta(minutes=6)
        db.query(DeliverySync).filter_by(kind="status").one().next_run_at = (
            datetime.now(timezone.utc) - timedelta(seconds=1)
        )
        db.commit()
    provider = provider_for([])
    tick_once(engine, lambda: provider)
    provider.ad_statuses.assert_not_called()


def test_new_launch_during_report_schedules_follow_up(sessions, engine, buyer):
    setup_ad(sessions, buyer)
    provider = provider_for([])
    tick_once(engine, lambda: provider)
    with sessions() as db:
        job = enqueue(
            db,
            buyer.id,
            "test-during-report",
            "act_789",
            "ad",
            {
                "name": "test-during-report",
                "adset_id": "123",
                "creative_id": "456",
                "status": "PAUSED",
            },
        )
        persist_ad(db, job, "988")
    sync_tick(engine, lambda: provider)
    with sessions() as db:
        sync = db.query(DeliverySync).filter_by(kind="performance").one()
        assert sync.status == "idle" and sync.next_run_at <= datetime.now(timezone.utc)
        assert sync.last_success_at is not None


def test_large_managed_account_uses_one_bulk_report(sessions, engine, buyer):
    from app.delivery.models import DeliveryJob
    from app.delivery.queue import get_settings

    with sessions() as db:
        get_settings(db)
        db.add_all(
            [
                DeliveryJob(
                    id=f"test-job-{i}",
                    owner_id=buyer.id,
                    request_key=f"test-report-{i}",
                    request_hash="0" * 64,
                    account_id="act_789",
                    name=f"test-ad-{i}",
                    kind="ad",
                    payload={},
                )
                for i in range(201)
            ]
        )
        db.flush()
        db.add_all(
            [
                ManagedAd(
                    id=f"test-managed-{i}",
                    job_id=f"test-job-{i}",
                    owner_id=buyer.id,
                    account_id="act_789",
                    fb_ad_id=str(1000 + i),
                    fb_adset_id="123",
                    fb_creative_id="456",
                    name=f"test-ad-{i}",
                )
                for i in range(201)
            ]
        )
        db.add(
            DeliverySync(owner_id=buyer.id, account_id="act_789", kind="performance")
        )
        db.commit()
    provider = provider_for([])
    sync_tick(engine, lambda: provider)
    provider.start_report.assert_called_once()
    provider.report_page.assert_called_once_with("123456", None)


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
