from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from app.core.deps import get_current_active_user, require_permission, require_role
from app.core.config import settings
from app.database import get_db
from app.models import (
    User,
    GoogleAdsConnection,
    TikTokAdsConnection,
    WinningAd,
    Brand,
    Product,
)
from app.analytics.models import (
    AnalyticsSettings,
    AnalyticsSource,
    AnalyticsAccount,
    AnalyticsAd,
    AnalyticsStagedRow,
    AnalyticsAudit,
)
from app.analytics.schemas import (
    SourceConfig,
    PatternConfig,
    SourceCreate,
    SourceEdit,
    CreativeLink,
)
from app.analytics.sync import options, authorized
from app.analytics.patterns import analyze_patterns
from app.analytics.reporting import observations
from app.analytics import config
from app.delivery.api import DeliveryRoute, problem, page
from app.delivery.models import ManagedAd
from app.creatives.models import CreativeAsset
from app.creatives.service import lock_asset, snapshot, event

router = APIRouter(route_class=DeliveryRoute)


def now():
    return datetime.now(timezone.utc)


def audit(db, user, subject, action, details):
    db.add(
        AnalyticsAudit(
            actor_id=user.id, subject_id=subject, action=action, details=details
        )
    )


def scope(user, all_users):
    if all_users and not user.has_role("admin"):
        problem(403, "ADMIN_REQUIRED", "Only admins can report across users")


def source_owned(db, user, identity):
    source = db.get(AnalyticsSource, identity)
    if not source or source.owner_id != user.id:
        problem(404, "NOT_FOUND", "Import source not found")
    return source


def account_owned(db, user, identity):
    account = db.get(AnalyticsAccount, identity)
    if not account:
        problem(404, "NOT_FOUND", "Reporting account not found")
    return account, source_owned(db, user, account.source_id)


def configured(platform):
    return (
        settings.google_ads_enabled
        if platform == "google"
        else settings.tiktok_ads_enabled
    )


def pattern_options(db):
    row = db.get(AnalyticsSettings, "patterns")
    return PatternConfig.model_validate(row.values if row else {})


@router.get("/settings")
def get_settings(
    db: Session = Depends(get_db), user: User = Depends(get_current_active_user)
):
    return {
        "providers": {p: options(db, p).model_dump() for p in config.PLATFORMS},
        "patterns": pattern_options(db).model_dump(),
        "configured": {p: configured(p) for p in config.PLATFORMS},
        "can_edit": user.has_role("admin"),
    }


@router.put("/settings/patterns")
def save_patterns(
    data: PatternConfig,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    save_setting(db, user, "patterns", data.model_dump())
    db.commit()
    return {"config": data.model_dump()}


@router.put("/settings/{platform}")
def save_provider(
    platform: Literal["google", "tiktok"],
    data: SourceConfig,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    save_setting(db, user, platform, data.model_dump())
    for account in db.scalars(
        select(AnalyticsAccount)
        .join(AnalyticsSource)
        .where(AnalyticsSource.platform == platform, AnalyticsAccount.status == "idle")
    ):
        account.next_run_at = (
            max(
                now(),
                account.last_success_at
                + timedelta(seconds=data.performance_interval_seconds),
            )
            if account.last_success_at
            else now()
        )
        if account.last_reconciled_at:
            account.next_run_at = min(
                account.next_run_at,
                max(
                    now(),
                    account.last_reconciled_at
                    + timedelta(hours=data.reconcile_interval_hours),
                ),
            )
    db.commit()
    return {"config": data.model_dump()}


def save_setting(db, user, key, values):
    row = db.get(AnalyticsSettings, key)
    before = row.values if row else None
    if row is None:
        row = AnalyticsSettings(key=key, values=values)
        db.add(row)
    row.values = values
    row.updated_by_id = user.id
    row.updated_at = now()
    audit(db, user, key, "settings_updated", {"before": before, "after": values})


@router.get("/connections")
def connections(
    db: Session = Depends(get_db), user: User = Depends(get_current_active_user)
):
    rows = []
    for platform, model, field in [
        ("google", GoogleAdsConnection, "customer_id"),
        ("tiktok", TikTokAdsConnection, "advertiser_id"),
    ]:
        for c in db.scalars(
            select(model).where(model.user_id == user.id, model.is_active.is_(True))
        ):
            rows.append(
                {
                    "id": c.id,
                    "platform": platform,
                    "name": c.account_name or getattr(c, field),
                    "account_id": getattr(c, field),
                    "configured": configured(platform),
                }
            )
    return page(rows, len(rows), len(rows), 0)


@router.get("/sources")
def sources(
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    q = select(AnalyticsSource).where(AnalyticsSource.owner_id == user.id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    return page(
        [
            {
                "id": s.id,
                "platform": s.platform,
                "owner_id": s.owner_id,
                "enabled": s.enabled,
                "connection_active": authorized(db, s),
                "configured": configured(s.platform),
                "discovered_at": s.discovered_at,
                "next_discovery_at": s.next_discovery_at,
                "error_message": s.error_message,
                "discovering": s.discovery_state is not None,
            }
            for s in db.scalars(
                q.order_by(AnalyticsSource.created_at, AnalyticsSource.id)
                .limit(limit)
                .offset(offset)
            )
        ],
        total,
        limit,
        offset,
    )


@router.post("/sources", status_code=201)
def create_source(
    data: SourceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    model = GoogleAdsConnection if data.platform == "google" else TikTokAdsConnection
    c = db.get(model, data.connection_id)
    if not c or c.user_id != user.id or not c.is_active:
        problem(
            404, "CONNECTION_REQUIRED", "Select an active connection owned by your user"
        )
    if not configured(data.platform):
        problem(
            503,
            "PROVIDER_CONFIGURATION",
            "Configure this platform before enabling imports",
        )
    key = (
        "google_connection_id" if data.platform == "google" else "tiktok_connection_id"
    )
    lock_asset(db, "analytics-source:" + data.platform + ":" + c.id)
    source = db.scalar(
        select(AnalyticsSource).where(getattr(AnalyticsSource, key) == c.id)
    )
    if source is None:
        source = AnalyticsSource(
            platform=data.platform, owner_id=user.id, **{key: c.id}
        )
        db.add(source)
        db.flush()
    source.enabled = True
    audit(db, user, source.id, "source_enabled", {"platform": data.platform})
    db.commit()
    return {"id": source.id, "enabled": True}


@router.patch("/sources/{source_id}")
def edit_source(
    source_id: str,
    data: SourceEdit,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    source = source_owned(db, user, source_id)
    source.enabled = data.enabled
    audit(
        db, user, source.id, "source_enabled" if data.enabled else "source_paused", {}
    )
    db.commit()
    return {"id": source.id, "enabled": source.enabled}


@router.post("/sources/{source_id}/discover")
def refresh_discovery(
    source_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    source = source_owned(db, user, source_id)
    if not source.enabled or not authorized(db, source):
        problem(409, "SOURCE_INACTIVE", "Enable an active connected source first")
    if (
        source.next_discovery_at <= now()
        and source.failures <= options(db, source.platform).max_read_retries
    ) or (
        not source.error_message
        and (
            source.discovery_state
            or source.discovered_at
            and source.discovered_at
            > now() - timedelta(seconds=config.MANUAL_COOLDOWN_SECONDS)
        )
    ):
        return {"id": source.id, "coalesced": True}
    source.next_discovery_at = now()
    source.failures = 0
    source.discovery_state = None
    source.error_message = None
    audit(db, user, source.id, "discovery_requested", {})
    db.commit()
    return {"id": source.id, "coalesced": False}


@router.get("/accounts")
def accounts(
    platform: Optional[Literal["google", "tiktok"]] = None,
    all_users: bool = False,
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    scope(user, all_users)
    q = select(AnalyticsAccount, AnalyticsSource).join(AnalyticsSource)
    if not all_users:
        q = q.where(AnalyticsSource.owner_id == user.id)
    if platform:
        q = q.where(AnalyticsSource.platform == platform)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    result = []
    for a, s in db.execute(
        q.order_by(AnalyticsAccount.name, AnalyticsAccount.id)
        .limit(limit)
        .offset(offset)
    ):
        result.append(
            {
                **{
                    k: getattr(a, k)
                    for k in [
                        "id",
                        "external_id",
                        "name",
                        "currency",
                        "timezone",
                        "status",
                        "enabled",
                        "last_success_at",
                        "last_reconciled_at",
                        "next_run_at",
                        "failures",
                        "error_message",
                    ]
                },
                "platform": s.platform,
                "source_id": s.id,
                "owner_id": s.owner_id,
                "source_enabled": s.enabled,
                "can_manage": s.owner_id == user.id
                and user.has_permission("campaigns:write"),
            }
        )
    return page(result, total, limit, offset)


@router.post("/accounts/{account_id}/sync")
def request_sync(
    account_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    account, source = account_owned(db, user, account_id)
    if not source.enabled or not authorized(db, source) or not account.enabled:
        problem(409, "SOURCE_INACTIVE", "Enable an active connected source first")
    if account.status in {"waiting", "deferred", "retry_wait"} or (
        account.status != "failed"
        and (
            account.next_run_at <= now()
            or account.last_success_at
            and account.last_success_at
            > now() - timedelta(seconds=config.MANUAL_COOLDOWN_SECONDS)
        )
    ):
        return {"id": account.id, "coalesced": True}
    if account.status == "failed":
        account.report_state = None
        db.execute(
            delete(AnalyticsStagedRow).where(
                AnalyticsStagedRow.account_id == account.id
            )
        )
    account.status = "idle"
    account.next_run_at = now()
    account.failures = 0
    account.error_message = None
    account.requested_by_id = user.id
    audit(db, user, account.id, "sync_requested", {})
    db.commit()
    return {"id": account.id, "coalesced": False}


def ad_json(db, ad, account, source, user):
    linker = db.get(User, ad.linked_by_id) if ad.linked_by_id else None
    return {
        **{
            k: getattr(ad, k)
            for k in [
                "id",
                "external_id",
                "name",
                "dimensions",
                "creative_asset_id",
                "creative_snapshot",
                "binding_revision",
                "linked_at",
                "linked_by_id",
                "imported_at",
            ]
        },
        "linked_by_name": linker.name if linker else None,
        "platform": source.platform,
        "account_id": account.external_id,
        "account_name": account.name,
        "can_edit": source.owner_id == user.id
        and user.has_permission("campaigns:write"),
    }


@router.get("/ads")
def ads(
    platform: Optional[Literal["google", "tiktok"]] = None,
    account_id: Optional[str] = None,
    unlinked: bool = False,
    all_users: bool = False,
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    scope(user, all_users)
    q = (
        select(AnalyticsAd, AnalyticsAccount, AnalyticsSource)
        .select_from(AnalyticsAd)
        .join(AnalyticsAccount, AnalyticsAd.account_id == AnalyticsAccount.id)
        .join(AnalyticsSource, AnalyticsAccount.source_id == AnalyticsSource.id)
    )
    if not all_users:
        q = q.where(AnalyticsSource.owner_id == user.id)
    if platform:
        q = q.where(AnalyticsSource.platform == platform)
    if account_id:
        q = q.where(AnalyticsAccount.external_id == account_id)
    if unlinked:
        q = q.where(AnalyticsAd.creative_asset_id.is_(None))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(
        q.order_by(AnalyticsAd.imported_at.desc(), AnalyticsAd.id)
        .limit(limit)
        .offset(offset)
    )
    return page([ad_json(db, *r, user) for r in rows], total, limit, offset)


@router.put("/ads/{ad_id}/creative")
def link_creative(
    ad_id: str,
    data: CreativeLink,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    ad = db.scalar(select(AnalyticsAd).where(AnalyticsAd.id == ad_id).with_for_update())
    if not ad:
        problem(404, "NOT_FOUND", "Imported ad not found")
    account, source = account_owned(db, user, ad.account_id)
    if ad.binding_revision != data.expected_revision:
        problem(409, "REVISION_CONFLICT", "This link changed; reload before editing")
    before = ad.creative_snapshot
    old_asset_id = ad.creative_asset_id
    asset = None
    if data.creative_asset_id:
        lock_asset(db, data.creative_asset_id)
        asset = db.get(CreativeAsset, data.creative_asset_id)
        if not asset or asset.archived_at or asset.analysis_status != "ready":
            problem(
                422, "CREATIVE_NOT_READY", "Select an analyzed, active library creative"
            )
    ad.creative_asset_id = asset.id if asset else None
    ad.creative_snapshot = {**snapshot(asset), "name": asset.name} if asset else None
    ad.binding_revision += 1
    ad.linked_by_id = user.id
    ad.linked_at = now()
    details = {
        "before": before,
        "after": ad.creative_snapshot,
        "binding_revision": ad.binding_revision,
        "platform": source.platform,
        "account_id": account.external_id,
        "remote_ad_id": ad.external_id,
    }
    audit(db, user, ad.id, "creative_linked", details)
    target = asset or (db.get(CreativeAsset, old_asset_id) if old_asset_id else None)
    if target:
        event(
            db,
            target,
            user.id,
            "performance_linked",
            {"imported_ad_id": ad.id, **details},
        )
    db.commit()
    return ad_json(db, ad, account, source, user)


@router.get("/patterns")
def patterns(
    platform: Optional[Literal["meta", "google", "tiktok"]] = None,
    account_id: Optional[str] = Query(None, max_length=80),
    metric: Optional[Literal["cpa", "roas", "ctr"]] = None,
    days: Optional[int] = Query(None, ge=7, le=90),
    all_users: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    scope(user, all_users)
    setting = pattern_options(db)
    if metric:
        setting.metric = metric
    if days:
        setting.days = days
    try:
        result = analyze_patterns(
            observations(db, user, setting, platform, account_id, all_users), setting
        )
    except ValueError as error:
        problem(422, "ANALYSIS_SCOPE", str(error))
    for field, model in [
        ("created_by_id", User),
        ("template_id", WinningAd),
        ("brand_id", Brand),
        ("product_id", Product),
    ]:
        ids = {
            trait["value"]
            for item in result["data"]
            for trait in item["traits"]
            if trait["field"] == field
        }
        labels = (
            {
                row.id: row.name
                for row in db.scalars(select(model).where(model.id.in_(ids)))
            }
            if ids
            else {}
        )
        for item in result["data"]:
            for trait in item["traits"]:
                if trait["field"] == field and trait["value"] in labels:
                    trait["label"] = labels[trait["value"]]
    result["pagination"] = {
        "total": len(result["data"]),
        "limit": 50,
        "offset": 0,
        "hasMore": False,
    }
    return result


@router.get("/report")
def report(
    platform: Optional[Literal["meta", "google", "tiktok"]] = None,
    account_id: Optional[str] = Query(None, max_length=80),
    days: int = Query(28, ge=7, le=90),
    all_users: bool = False,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    scope(user, all_users)
    setting = pattern_options(db)
    setting.days = days
    try:
        rows = observations(db, user, setting, platform, account_id, all_users)
    except ValueError as error:
        problem(422, "REPORT_SCOPE", str(error))

    def in_window(r):
        today = now().astimezone(ZoneInfo(r["timezone"])).date()
        return (
            (today - timedelta(days=days - 1)).isoformat()
            <= r["report_date"]
            <= today.isoformat()
        )

    rows = sorted(
        (r for r in rows if in_window(r)),
        key=lambda r: (r["report_date"], r["id"]),
        reverse=True,
    )
    return page(rows[offset : offset + limit], len(rows), limit, offset)


@router.get("/report-accounts")
def report_accounts(
    all_users: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    scope(user, all_users)
    query = select(AnalyticsAccount, AnalyticsSource).join(AnalyticsSource)
    if not all_users:
        query = query.where(AnalyticsSource.owner_id == user.id)
    rows = {
        (source.platform, account.external_id): {
            "platform": source.platform,
            "external_id": account.external_id,
            "name": account.name,
        }
        for account, source in db.execute(query)
    }
    meta = select(ManagedAd.account_id).distinct()
    if not all_users:
        meta = meta.where(ManagedAd.owner_id == user.id)
    for identity in db.scalars(meta):
        rows[("meta", identity)] = {
            "platform": "meta",
            "external_id": identity,
            "name": identity,
        }
    result = sorted(
        rows.values(), key=lambda r: (r["platform"], r["name"], r["external_id"])
    )
    return page(result, len(result), len(result), 0)
