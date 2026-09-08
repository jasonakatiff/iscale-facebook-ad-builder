import random
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert

from app.delivery import config
from app.delivery.models import AdInsight, DeliverySync, ManagedAd, StagedInsight
from app.delivery.provider import DeliveryProvider, ProviderError, decimal_value
from app.delivery.budget import RequestDeferred
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


def import_status(db, provider, sync, ads, settings):
    def due(ad):
        recent = ad.created_at >= utcnow() - timedelta(hours=config.NEW_AD_HOURS)
        interval = (
            settings.status_interval_seconds
            if recent or ad.effective_status in {None, "PENDING_REVIEW", "PROCESSING"}
            else settings.stable_status_interval_seconds
        )
        return not ad.status_synced_at or utcnow() >= ad.status_synced_at + timedelta(
            seconds=interval
        )

    ads = [ad for ad in ads if due(ad)]
    batch_size = min(
        config.STATUS_BATCH_SIZE,
        settings.account_requests_per_minute,
        settings.import_requests_per_minute,
        settings.api_daily_request_limit,
    )
    for offset in range(0, len(ads), batch_size):
        check_deadline(sync)
        batch = ads[offset : offset + batch_size]
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
        db.commit()
    check_deadline(sync)


def import_performance(db, provider, sync, ads, settings):
    state = sync.report_state
    if not state:
        info = provider.account_info(sync.account_id)
        currency, timezone_name = info.get("currency", ""), info.get(
            "timezone_name", ""
        )
        if (
            info.get("id") != sync.account_id
            or not isinstance(currency, str)
            or len(currency) != 3
        ):
            raise ProviderError("Facebook returned invalid account metadata")
        today = utcnow().astimezone(ZoneInfo(timezone_name)).date()
        wide = (
            not sync.last_reconciled_at
            or utcnow()
            >= sync.last_reconciled_at
            + timedelta(hours=settings.reconcile_interval_hours)
        )
        since = today - timedelta(
            days=(settings.reconcile_days if wide else settings.lookback_days) - 1
        )
        report_id = provider.start_report(sync.account_id, since, today)
        sync.report_state = dict(
            id=report_id,
            phase="poll",
            since=since.isoformat(),
            until=today.isoformat(),
            currency=currency,
            timezone=timezone_name,
            wide=wide,
            ad_ids=[ad.id for ad in ads],
            cursor=None,
            seen_cursors=[],
            pages=0,
        )
        sync.next_run_at = utcnow() + timedelta(seconds=settings.async_poll_seconds)
        return False
    if state["phase"] == "poll":
        data = provider.report_status(state["id"])
        if str(data.get("id")) != state["id"]:
            raise ProviderError("Facebook returned an unexpected report identity")
        status = data.get("async_status")
        if status == "Job Completed":
            sync.report_state = {**state, "phase": "download"}
            sync.next_run_at = utcnow()
        elif status in {"Job Not Started", "Job Started", "Job Running"}:
            sync.next_run_at = utcnow() + timedelta(seconds=settings.async_poll_seconds)
        else:
            raise ProviderError("Facebook report failed or returned an unknown status")
        return False
    if state["pages"] >= config.MAX_REPORT_PAGES:
        raise ProviderError("Facebook report exceeded its page limit")
    page, cursor = provider.report_page(state["id"], state["cursor"])
    if cursor and cursor in state["seen_cursors"]:
        raise ProviderError("Facebook report pagination did not advance")
    by_fb_id = {ad.fb_ad_id: ad for ad in ads if ad.id in state["ad_ids"]}
    since, until = date.fromisoformat(state["since"]), date.fromisoformat(
        state["until"]
    )
    for row in page:
        if (
            "act_" + str(row.get("account_id", "")).removeprefix("act_")
            != sync.account_id
        ):
            raise ProviderError("Facebook report included an unexpected account")
        ad = by_fb_id.get(str(row.get("ad_id")))
        if not ad:
            continue
        report_date = date.fromisoformat(row["date_start"])
        if (
            not since <= report_date <= until
            or row.get("date_stop") != row["date_start"]
        ):
            raise ProviderError("Facebook returned an unexpected reporting period")
        actions = row.get("actions", [])
        if not isinstance(actions, list) or not isinstance(row.get("action_values", []), list):
            raise ProviderError("Facebook returned invalid action metrics")
        payload = dict(
            impressions=str(decimal_value(row.get("impressions", "0"), 0)),
            clicks=str(decimal_value(row.get("clicks", "0"), 0)),
            spend=str(decimal_value(row.get("spend", "0"))),
            actions=actions,
            action_values=row.get("action_values", []),
        )
        statement = insert(StagedInsight).values(
            sync_id=sync.id, ad_id=ad.fb_ad_id, report_date=report_date, payload=payload
        )
        db.execute(
            statement.on_conflict_do_update(
                index_elements=["sync_id", "ad_id", "report_date"],
                set_={"payload": statement.excluded.payload},
            )
        )
    check_deadline(sync)
    if cursor:
        sync.report_state = {
            **state,
            "cursor": cursor,
            "pages": state["pages"] + 1,
            "seen_cursors": state["seen_cursors"] + [cursor],
        }
        sync.next_run_at = utcnow()
        return False
    # Promote only a complete validated report; readers retain the previous snapshot until commit.
    db.execute(
        delete(AdInsight).where(
            AdInsight.managed_ad_id.in_(state["ad_ids"]),
            AdInsight.dataset == config.DATASET,
            AdInsight.report_date.between(since, until),
        )
    )
    imported_at = utcnow()
    for staged in db.scalars(
        select(StagedInsight).where(StagedInsight.sync_id == sync.id)
    ):
        ad = by_fb_id.get(staged.ad_id)
        if ad is None:
            continue
        values = dict(
            managed_ad_id=ad.id,
            report_date=staged.report_date,
            dataset=config.DATASET,
            currency=state["currency"],
            account_timezone=state["timezone"],
            imported_at=imported_at,
            **staged.payload
        )
        statement = insert(AdInsight).values(**values)
        db.execute(
            statement.on_conflict_do_update(
                constraint="uq_ad_insight_snapshot",
                set_={key: statement.excluded[key] for key in values},
            )
        )
    db.execute(delete(StagedInsight).where(StagedInsight.sync_id == sync.id))
    sync.report_state = None
    if state["wide"]:
        sync.last_reconciled_at = utcnow()
    return "catch_up" if any(ad.id not in state["ad_ids"] for ad in ads) else "complete"


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
                DeliverySync.status.in_(["idle", "retry_wait", "waiting", "deferred"]),
                DeliverySync.next_run_at <= now,
            )
            .order_by(DeliverySync.next_run_at, DeliverySync.id)
            .limit(1)
        )
        if not sync:
            return
        if sync.status == "idle" and not sync.report_state:
            sync.run_started_at, sync.failures = now, 0
        elif sync.run_started_at is None:
            sync.run_started_at = now
        sync.status = "running"
        db.commit()
        try:
            check_deadline(sync)
            catch_up = False
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
                if hasattr(provider, "configure_budget"):
                    provider.configure_budget(engine, sync.account_id, "import")
                if sync.kind == "status":
                    import_status(db, provider, sync, ads, settings)
                else:
                    result = import_performance(db, provider, sync, ads, settings)
                    if not result:
                        sync.status = "waiting"
                        db.commit()
                        return
                    catch_up = result == "catch_up"
            sync.last_success_at = utcnow()
            sync.status, sync.failures, sync.error_message = "idle", 0, None
            interval = (
                settings.status_interval_seconds
                if sync.kind == "status"
                else settings.performance_interval_seconds
            )
            if sync.kind == "performance":
                correction_due = (
                    sync.last_reconciled_at
                    + timedelta(hours=settings.reconcile_interval_hours)
                    if sync.last_reconciled_at
                    else utcnow()
                )
                sync.next_run_at = min(
                    utcnow() + timedelta(seconds=interval), correction_due
                )
            else:
                sync.next_run_at = utcnow() + timedelta(seconds=interval)
            if catch_up:
                sync.next_run_at = utcnow()
            db.commit()
        except RequestDeferred as error:
            db.rollback()
            db.refresh(sync)
            pause = max(timedelta(0), error.until - utcnow())
            sync.run_started_at += pause
            sync.status, sync.next_run_at = "deferred", error.until
            sync.error_message = "Waiting for shared Facebook request capacity"
            db.commit()
        except Exception as error:
            if db.get_bind().invalidated or getattr(
                error, "connection_invalidated", False
            ):
                raise
            db.rollback()
            db.refresh(sync)
            record_failure(db, sync, settings, error)
