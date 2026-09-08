import random
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert

from app.delivery import config
from app.delivery.models import AdInsight, DeliverySync, ManagedAd
from app.delivery.provider import DeliveryProvider, ProviderError, decimal_value
from app.delivery.queue import utcnow, worker_session, get_settings
from app.models import FacebookAd


def retry_delay(failures, retry_after=0):
    base = min(
        config.RETRY_CAP_SECONDS, config.RETRY_BASE_SECONDS * 2 ** max(0, failures - 1)
    )
    return max(
        retry_after, min(config.RETRY_CAP_SECONDS, base + random.uniform(0, base / 4))
    )


def record_failure(db, sync, settings, error):
    sync.failures += 1
    delay = retry_delay(sync.failures, getattr(error, "retry_after", 0))
    now = utcnow()
    deadline = sync.run_started_at + timedelta(seconds=config.READ_DEADLINE_SECONDS)
    can_retry = (
        isinstance(error, ProviderError)
        and error.retryable
        and sync.failures <= settings.max_read_retries
        and now + timedelta(seconds=delay) < deadline
    )
    sync.status = "retry_wait" if can_retry else "failed"
    sync.next_run_at = now + timedelta(seconds=delay)
    sync.error_message = (
        "Facebook import failed; waiting to retry"
        if can_retry
        else "Facebook import stopped: permanent error, retry limit or time limit reached"
    )
    db.commit()


def check_deadline(sync):
    if utcnow() >= sync.run_started_at + timedelta(
        seconds=config.READ_DEADLINE_SECONDS
    ):
        raise ProviderError("Import exceeded its time limit")


def import_status(db, provider, sync, ads):
    for offset in range(0, len(ads), config.STATUS_BATCH_SIZE):
        check_deadline(sync)
        batch = ads[offset : offset + config.STATUS_BATCH_SIZE]
        records = provider.ad_statuses([ad.fb_ad_id for ad in batch])
        for ad in batch:
            data = records.get(ad.fb_ad_id, {})
            if (
                str(data.get("id")) != ad.fb_ad_id
                or "act_" + str(data.get("account_id", "")).removeprefix("act_")
                != sync.account_id
            ):
                raise ProviderError(
                    "Facebook returned an unexpected or inaccessible ad identity"
                )
            status = data.get("effective_status")
            if not isinstance(status, str) or len(status) > 80:
                raise ProviderError("Facebook returned an invalid delivery status")
            ad.effective_status, ad.status_synced_at = status, utcnow()
            if ad.local_ad_id:
                local = db.get(FacebookAd, ad.local_ad_id)
                if local:
                    local.status = status
    check_deadline(sync)


def import_performance(db, provider, sync, ads):
    info = provider.account_info(sync.account_id)
    currency = info.get("currency", "")
    timezone_name = info.get("timezone_name", "")
    if (
        info.get("id") != sync.account_id
        or not isinstance(currency, str)
        or len(currency) != 3
    ):
        raise ProviderError("Facebook returned invalid account metadata")
    today = utcnow().astimezone(ZoneInfo(timezone_name)).date()
    wide = (
        not sync.last_reconciled_at
        or utcnow() - sync.last_reconciled_at >= timedelta(days=1)
    )
    since = today - timedelta(
        days=(config.RECONCILE_DAYS if wide else config.LOOKBACK_DAYS) - 1
    )
    imported_at = utcnow()
    by_fb_id = {ad.fb_ad_id: ad for ad in ads}
    # The entire account window is one transaction. Failed/partial pagination preserves old data.
    # Removing old rows also reconciles previously reported activity that Meta now omits.
    db.execute(
        delete(AdInsight).where(
            AdInsight.managed_ad_id.in_([ad.id for ad in ads]),
            AdInsight.dataset == config.DATASET,
            AdInsight.report_date.between(since, today),
        )
    )
    ids = list(by_fb_id)
    for offset in range(0, len(ids), 100):
        for page in provider.insight_pages(
            sync.account_id, ids[offset : offset + 100], since, today
        ):
            check_deadline(sync)
            for row in page:
                ad = by_fb_id.get(str(row.get("ad_id")))
                if not ad:
                    raise ProviderError("Facebook report included an unexpected ad")
                report_date = date.fromisoformat(row["date_start"])
                if (
                    not since <= report_date <= today
                    or row.get("date_stop") != row["date_start"]
                ):
                    raise ProviderError(
                        "Facebook returned an unexpected reporting period"
                    )
                actions = row.get("actions", [])
                if not isinstance(actions, list):
                    raise ProviderError("Facebook returned invalid action metrics")
                values = dict(
                    managed_ad_id=ad.id,
                    report_date=report_date,
                    dataset=config.DATASET,
                    currency=currency,
                    account_timezone=timezone_name,
                    impressions=decimal_value(row.get("impressions", "0"), 0),
                    clicks=decimal_value(row.get("clicks", "0"), 0),
                    spend=decimal_value(row.get("spend", "0")),
                    actions=actions,
                    imported_at=imported_at,
                )
                statement = insert(AdInsight).values(**values)
                db.execute(
                    statement.on_conflict_do_update(
                        constraint="uq_ad_insight_snapshot",
                        set_={key: statement.excluded[key] for key in values},
                    )
                )
    check_deadline(sync)
    if wide:
        sync.last_reconciled_at = utcnow()


def sync_tick(engine, provider_factory=None):
    with worker_session(engine, "sync") as db:
        if db is None:
            return
        now = utcnow()
        settings = get_settings(db)
        settings.sync_heartbeat = now
        for stale in db.scalars(
            select(DeliverySync).where(DeliverySync.status == "running")
        ).all():
            record_failure(
                db, stale, settings, ProviderError("Interrupted import", retryable=True)
            )
        db.commit()
        if not settings.imports_enabled:
            return
        sync = db.scalar(
            select(DeliverySync)
            .where(
                DeliverySync.status.in_(["idle", "retry_wait"]),
                DeliverySync.next_run_at <= now,
            )
            .order_by(DeliverySync.next_run_at, DeliverySync.id)
            .limit(1)
        )
        if not sync:
            return
        if sync.status == "idle":
            sync.run_started_at, sync.failures = now, 0
        sync.status = "running"
        db.commit()
        try:
            check_deadline(sync)
            ads = db.scalars(
                select(ManagedAd).where(
                    ManagedAd.account_id == sync.account_id,
                    ManagedAd.owner_id == sync.owner_id,
                )
            ).all()
            if ads:
                provider = (
                    provider_factory()
                    if provider_factory
                    else DeliveryProvider.for_user(db, sync.owner_id)
                )
                if sync.kind == "status":
                    import_status(db, provider, sync, ads)
                else:
                    import_performance(db, provider, sync, ads)
            sync.last_success_at = utcnow()
            sync.status, sync.failures, sync.error_message = "idle", 0, None
            interval = (
                settings.status_interval_seconds
                if sync.kind == "status"
                else settings.performance_interval_seconds
            )
            sync.next_run_at = utcnow() + timedelta(seconds=interval)
            db.commit()
        except Exception as error:
            if db.get_bind().invalidated or getattr(
                error, "connection_invalidated", False
            ):
                raise
            db.rollback()
            db.refresh(sync)
            record_failure(db, sync, settings, error)
