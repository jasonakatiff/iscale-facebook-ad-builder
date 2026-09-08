from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import Mock
from app.analytics.models import (
    AnalyticsSource,
    AnalyticsAccount,
    AnalyticsAd,
    AnalyticsInsight,
    AnalyticsStagedRow,
)
from app.analytics.sync import analytics_tick
from app.models import GoogleAdsConnection
from app.delivery.budget import RequestDeferred


def seed(db, owner):
    from app.analytics.models import AnalyticsSettings
    from app.analytics.schemas import SourceConfig

    db.add(
        AnalyticsSettings(
            key="google", values=SourceConfig(reconcile_days=2).model_dump()
        )
    )
    connection = GoogleAdsConnection(
        user_id=owner.id,
        customer_id="123",
        encrypted_refresh_token="test-token",
        is_active=True,
    )
    db.add(connection)
    db.flush()
    source = AnalyticsSource(
        platform="google",
        owner_id=owner.id,
        google_connection_id=connection.id,
        next_discovery_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    db.add(source)
    db.flush()
    account = AnalyticsAccount(
        source_id=source.id,
        external_id="123",
        name="test-account",
        currency="USD",
        timezone="UTC",
    )
    db.add(account)
    db.commit()
    return source, account


def report_row(value="0.29"):
    return dict(
        external_key="test-remote-ad",
        external_id="987",
        name="test-ad",
        account_id="123",
        report_date=(datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat(),
        dataset="google:primary_conversions:interaction_date:v1",
        currency="USD",
        timezone="UTC",
        dimensions={"campaign_id": "456", "group_id": "789", "objective": "SEARCH"},
        impressions="1000",
        clicks="5",
        spend=value,
        conversions="1",
        conversion_value=None,
    )


def test_atomic_import_and_repeat_replace(
    analytics_db, analytics_owner, analytics_engine
):
    source, account = seed(analytics_db, analytics_owner)
    provider = Mock()
    provider.page.return_value = ([report_row()], None)
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_db.expire_all()
    assert analytics_db.query(AnalyticsInsight).one().spend == Decimal(".29")
    assert analytics_db.query(AnalyticsAccount).one().last_success_at
    account.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    analytics_db.commit()
    provider.page.return_value = ([report_row("0.58")], None)
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_db.expire_all()
    assert analytics_db.query(AnalyticsInsight).count() == 1
    assert analytics_db.query(AnalyticsInsight).one().spend == Decimal(".58")


def test_deferral_preserves_cursor_and_last_snapshot(
    analytics_db, analytics_owner, analytics_engine
):
    _, account = seed(analytics_db, analytics_owner)
    provider = Mock()
    provider.page.side_effect = [
        ([report_row()], "second"),
        RequestDeferred(datetime.now(timezone.utc) + timedelta(minutes=1)),
        ([], None),
    ]
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_db.expire_all()
    assert account.status == "deferred" and account.failures == 0
    assert account.report_state["cursor"] == "second"
    assert analytics_db.query(AnalyticsStagedRow).count() == 1
    assert analytics_db.query(AnalyticsInsight).count() == 0
    account.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    analytics_db.commit()
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_db.expire_all()
    assert analytics_db.query(AnalyticsInsight).count() == 1
    assert provider.page.call_args.args[-1] == "second"


def test_revoked_connection_does_not_call_provider(
    analytics_db, analytics_owner, analytics_engine
):
    seed(analytics_db, analytics_owner)
    analytics_db.query(GoogleAdsConnection).one().is_active = False
    analytics_db.commit()
    factory = Mock()
    analytics_tick(analytics_engine, factory)
    factory.assert_not_called()


def test_partial_bad_page_preserves_previous_complete_report(
    analytics_db, analytics_owner, analytics_engine
):
    _, account = seed(analytics_db, analytics_owner)
    provider = Mock()
    provider.page.return_value = ([report_row()], None)
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_db.expire_all()
    account.next_run_at = datetime.now(timezone.utc)
    analytics_db.commit()
    provider.page.side_effect = [
        ([report_row("0.58")], "next"),
        ([{**report_row(), "account_id": "999"}], None),
    ]
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_db.expire_all()
    assert account.status == "failed"
    assert analytics_db.query(AnalyticsInsight).one().spend == Decimal(".29")


def test_empty_correction_removes_old_rows_atomically(
    analytics_db, analytics_owner, analytics_engine
):
    _, account = seed(analytics_db, analytics_owner)
    provider = Mock()
    provider.page.return_value = ([report_row()], None)
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_db.expire_all()
    account.next_run_at = datetime.now(timezone.utc)
    analytics_db.commit()
    provider.page.return_value = ([], None)
    analytics_tick(analytics_engine, lambda *_: provider)
    assert analytics_db.query(AnalyticsInsight).count() == 0


def test_repeated_cursor_fails_without_partial_report(
    analytics_db, analytics_owner, analytics_engine
):
    _, account = seed(analytics_db, analytics_owner)
    provider = Mock()
    provider.page.side_effect = [([report_row()], "same"), ([], "same")]
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_tick(analytics_engine, lambda *_: provider)
    analytics_db.expire_all()
    assert account.status == "failed"
    assert analytics_db.query(AnalyticsInsight).count() == 0


def test_fractional_google_attribution_is_preserved(
    analytics_db, analytics_owner, analytics_engine
):
    seed(analytics_db, analytics_owner)
    provider = Mock()
    provider.page.return_value = (
        [
            {
                **report_row(),
                "conversions": "0.3333333333333333",
                "conversion_value": "100.29999999999997",
            }
        ],
        None,
    )
    analytics_tick(analytics_engine, lambda *_: provider)
    row = analytics_db.query(AnalyticsInsight).one()
    assert row.conversions == Decimal("0.3333333333333333")
    assert row.conversion_value == Decimal("100.29999999999997")
