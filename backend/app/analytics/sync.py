from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.analytics import config
from app.analytics.models import (
    AnalyticsSource,
    AnalyticsAccount,
    AnalyticsAd,
    AnalyticsInsight,
    AnalyticsStagedRow,
    AnalyticsSettings,
)
from app.analytics.schemas import SourceConfig
from app.analytics.providers import ReportProvider, ImportFailure, normalize_row
from app.delivery.budget import RequestDeferred
from app.models import GoogleAdsConnection, TikTokAdsConnection, User
from app.telemetry.runtime import capture_exception


def now():
    return datetime.now(timezone.utc)


def options(db, platform):
    stored = db.get(AnalyticsSettings, platform)
    return SourceConfig.model_validate(stored.values if stored else {})


def authorized(db, source):
    owner = db.get(User, source.owner_id)
    model = GoogleAdsConnection if source.platform == "google" else TikTokAdsConnection
    connection = db.get(
        model, source.google_connection_id or source.tiktok_connection_id
    )
    return bool(
        owner
        and owner.is_active
        and owner.has_permission("campaigns:write")
        and connection
        and connection.is_active
        and connection.user_id == source.owner_id
    )


def discover(db, source, provider, settings):
    state = source.discovery_state or {"cursor": None, "accounts": [], "seen": []}
    rows, cursor = provider.discover(state["cursor"])
    import json

    marker = json.dumps(cursor, sort_keys=True) if cursor is not None else None
    if marker and marker in state["seen"]:
        raise ImportFailure("Account discovery cursor repeated")
    accounts = state["accounts"] + rows
    if len(accounts) > config.MAX_ACCOUNTS:
        raise ImportFailure("Source exceeds 1,000 accounts")
    if cursor is not None:
        source.discovery_state = {
            "cursor": cursor,
            "accounts": accounts,
            "seen": state["seen"] + [marker],
        }
        source.next_discovery_at = now()
        db.commit()
        return
    if not accounts:
        raise ImportFailure("No reporting accounts were discovered")
    known = set()
    for values in accounts:
        if values["external_id"] in known:
            raise ImportFailure("Account discovery returned duplicate IDs")
        known.add(values["external_id"])
        row = db.scalar(
            select(AnalyticsAccount).where(
                AnalyticsAccount.source_id == source.id,
                AnalyticsAccount.external_id == values["external_id"],
            )
        )
        if row is None:
            row = AnalyticsAccount(source_id=source.id, **values)
            db.add(row)
        else:
            for key, value in values.items():
                setattr(row, key, value)
            row.enabled = True
    for row in db.scalars(
        select(AnalyticsAccount).where(AnalyticsAccount.source_id == source.id)
    ):
        if row.external_id not in known:
            row.enabled = False
    source.discovery_state = None
    source.discovered_at = now()
    source.next_discovery_at = now() + timedelta(hours=settings.metadata_cache_hours)
    source.failures = 0
    source.error_message = None
    db.commit()


def start_state(account, settings):
    today = now().astimezone(ZoneInfo(account.timezone)).date()
    correction = (
        not account.last_reconciled_at
        or now() - account.last_reconciled_at
        >= timedelta(hours=settings.reconcile_interval_hours)
    )
    since = today - timedelta(
        days=(settings.reconcile_days if correction else settings.lookback_days) - 1
    )
    return {
        "since": since.isoformat(),
        "until": today.isoformat(),
        "chunk_since": since.isoformat(),
        "chunk_until": min(
            today, since + timedelta(days=config.REPORT_CHUNK_DAYS - 1)
        ).isoformat(),
        "cursor": None,
        "seen": [],
        "pages": 0,
        "rows": 0,
        "correction": correction,
        "started_at": now().isoformat(),
    }


def import_page(db, account, provider, settings):
    state = account.report_state
    if not state:
        state = start_state(account, settings)
        db.execute(
            delete(AnalyticsStagedRow).where(
                AnalyticsStagedRow.account_id == account.id
            )
        )
        account.report_state = state
        account.status = "waiting"
        db.commit()
    since, until = date.fromisoformat(state["chunk_since"]), date.fromisoformat(
        state["chunk_until"]
    )
    if now() - datetime.fromisoformat(state["started_at"]) > timedelta(hours=24):
        raise ImportFailure("Report expired after 24 hours; request a fresh import")
    if state["pages"] >= config.MAX_PAGES:
        raise ImportFailure("Report exceeded its page limit")
    rows, cursor = provider.page(account, since, until, state["cursor"])
    if cursor and cursor in state["seen"]:
        raise ImportFailure("Report cursor repeated")
    if state["rows"] + len(rows) > config.MAX_REPORT_ROWS:
        raise ImportFailure(
            "Report exceeded 100,000 rows; use a shorter correction window"
        )
    for row in rows:
        payload = normalize_row(row, account, since, until)
        db.add(
            AnalyticsStagedRow(
                account_id=account.id,
                external_key=payload["external_key"],
                report_date=date.fromisoformat(payload["report_date"]),
                payload=payload,
            )
        )
    db.flush()
    next_state = {
        **state,
        "pages": state["pages"] + 1,
        "rows": state["rows"] + len(rows),
        "cursor": cursor,
        "seen": state["seen"] + ([cursor] if cursor else []),
    }
    if cursor:
        account.report_state = next_state
        account.status = "waiting"
        account.next_run_at = now()
        db.commit()
        return
    last = date.fromisoformat(state["until"])
    if until < last:
        next_since = until + timedelta(days=1)
        account.report_state = {
            **next_state,
            "cursor": None,
            "seen": [],
            "chunk_since": next_since.isoformat(),
            "chunk_until": min(
                last, next_since + timedelta(days=config.REPORT_CHUNK_DAYS - 1)
            ).isoformat(),
        }
        account.status = "waiting"
        account.next_run_at = now()
        db.commit()
        return
    promote(db, account, date.fromisoformat(state["since"]), last)
    account.report_state = None
    account.status = "idle"
    account.failures = 0
    account.error_message = None
    account.last_success_at = now()
    if state["correction"]:
        account.last_reconciled_at = now()
    account.next_run_at = now() + timedelta(
        seconds=settings.performance_interval_seconds
    )
    if account.last_reconciled_at:
        account.next_run_at = min(
            account.next_run_at,
            account.last_reconciled_at
            + timedelta(hours=settings.reconcile_interval_hours),
        )
    db.commit()


def promote(db, account, since, until):
    # All replacement and ad metadata changes share this transaction.
    db.execute(
        delete(AnalyticsInsight).where(
            AnalyticsInsight.ad_id.in_(
                select(AnalyticsAd.id).where(AnalyticsAd.account_id == account.id)
            ),
            AnalyticsInsight.report_date.between(since, until),
        )
    )
    ads = {
        a.external_key: a
        for a in db.scalars(
            select(AnalyticsAd).where(AnalyticsAd.account_id == account.id)
        )
    }
    for staged in db.scalars(
        select(AnalyticsStagedRow).where(AnalyticsStagedRow.account_id == account.id)
    ):
        p = staged.payload
        ad = ads.get(p["external_key"])
        if ad is None:
            ad = AnalyticsAd(
                account_id=account.id,
                external_key=p["external_key"],
                external_id=p["external_id"],
                name=p["name"],
                dimensions=p["dimensions"],
                imported_at=now(),
            )
            db.add(ad)
            db.flush()
            ads[p["external_key"]] = ad
        ad.name = p["name"]
        ad.dimensions = p["dimensions"]
        ad.imported_at = now()
        db.add(
            AnalyticsInsight(
                ad_id=ad.id,
                report_date=staged.report_date,
                dataset=p["dataset"],
                currency=p["currency"],
                timezone=p["timezone"],
                dimensions=p["dimensions"],
                **{
                    k: p[k]
                    for k in [
                        "impressions",
                        "clicks",
                        "spend",
                        "conversions",
                        "conversion_value",
                    ]
                },
                imported_at=now()
            )
        )
    db.execute(
        delete(AnalyticsStagedRow).where(AnalyticsStagedRow.account_id == account.id)
    )


def analytics_tick(engine, provider_factory=None):
    with engine.connect() as connection:
        locked = connection.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": config.LOCK_KEY}
        ).scalar_one()
        connection.commit()
        if not locked:
            return
        try:
            with Session(bind=connection, expire_on_commit=False) as db:
                sources = list(
                    db.scalars(
                        select(AnalyticsSource)
                        .where(AnalyticsSource.enabled.is_(True))
                        .order_by(AnalyticsSource.next_discovery_at, AnalyticsSource.id)
                    )
                )
                usable = {
                    s.id: s
                    for s in sources
                    if authorized(db, s) and options(db, s.platform).enabled
                }
                source = next(
                    (
                        s
                        for s in usable.values()
                        if s.next_discovery_at <= now()
                        and s.failures <= options(db, s.platform).max_read_retries
                    ),
                    None,
                )
                account = None
                if source is None:
                    account = db.scalar(
                        select(AnalyticsAccount)
                        .where(
                            AnalyticsAccount.source_id.in_(usable),
                            AnalyticsAccount.enabled.is_(True),
                            AnalyticsAccount.status != "failed",
                            AnalyticsAccount.next_run_at <= now(),
                        )
                        .order_by(AnalyticsAccount.next_run_at, AnalyticsAccount.id)
                        .limit(1)
                    )
                    if account is None:
                        return
                    source = usable[account.source_id]
                setting = options(db, source.platform)
                try:
                    provider = (provider_factory or ReportProvider)(db, source, engine)
                    if account is None:
                        discover(db, source, provider, setting)
                    else:
                        import_page(db, account, provider, setting)
                except RequestDeferred as error:
                    db.rollback()
                    if account is None:
                        source.next_discovery_at = error.until
                    else:
                        account.status = "deferred"
                        account.next_run_at = error.until
                    db.commit()
                except Exception as error:
                    db.rollback()
                    capture_exception(error, "analytics.import")
                    target = account or source
                    target.failures += 1
                    target.error_message = (
                        str(error)
                        if isinstance(error, ImportFailure)
                        else "Import failed validation; previous performance is retained"
                    )
                    retry = (
                        isinstance(error, ImportFailure)
                        and error.retryable
                        and target.failures <= setting.max_read_retries
                    )
                    if account is None:
                        source.next_discovery_at = now() + (
                            timedelta(seconds=min(300, 5 * 2**target.failures))
                            if retry
                            else timedelta(hours=setting.metadata_cache_hours)
                        )
                    else:
                        account.status = "retry_wait" if retry else "failed"
                        account.next_run_at = now() + timedelta(
                            seconds=min(300, 5 * 2**target.failures)
                        )
                    db.commit()
        finally:
            connection.rollback()
            connection.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": config.LOCK_KEY}
            )
            connection.commit()
