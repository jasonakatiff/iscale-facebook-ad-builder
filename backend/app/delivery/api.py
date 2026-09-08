from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.routing import APIRoute
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import Date, DateTime, cast, literal, func, select, delete
from sqlalchemy.orm import Session

from app.core.deps import get_current_active_user, require_permission, require_role
from app.database import get_db, engine
from app.models import FacebookAdSet, GeneratedAd, User
from app.delivery import config, docs
from app.delivery.models import (
    AdInsight,
    DeliveryJob,
    DeliveryNotification,
    DeliverySettings,
    DeliverySync,
    ManagedAd,
    StagedInsight,
)
from app.delivery.provider import DeliveryProvider, ProviderError, matches_job
from app.delivery.queue import enqueue, get_settings, persist_ad, utcnow, worker_session
from app.delivery.schemas import (
    DeliveryConfig,
    LaunchRequest,
    ReconcileRequest,
    RetryRequest,
)
from app.delivery.recovery import retry_job
from app.delivery.budget import RequestDeferred


class DeliveryRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handle(request):
            try:
                return await original(request)
            except RequestDeferred as error:
                return JSONResponse(
                    status_code=429,
                    headers={
                        "Retry-After": str(
                            max(1, int((error.until - utcnow()).total_seconds()) + 1)
                        )
                    },
                    content={
                        "error": {
                            "code": "REQUEST_BUDGET_BUSY",
                            "message": str(error),
                            "details": None,
                        }
                    },
                )
            except HTTPException as error:
                content = (
                    error.detail
                    if isinstance(error.detail, dict) and "error" in error.detail
                    else {
                        "error": {
                            "code": "REQUEST_FAILED",
                            "message": str(error.detail),
                            "details": None,
                        }
                    }
                )
                return JSONResponse(
                    status_code=error.status_code,
                    content=content,
                    headers=error.headers,
                )
            except RequestValidationError as error:
                return JSONResponse(
                    status_code=422,
                    content={
                        "error": {
                            "code": "VALIDATION_ERROR",
                            "message": "; ".join(
                                item["msg"].removeprefix("Value error, ")
                                for item in error.errors()
                            ),
                            "details": [
                                {
                                    "field": ".".join(
                                        str(part) for part in item["loc"]
                                    ),
                                    "message": item["msg"],
                                }
                                for item in error.errors()
                            ],
                        }
                    },
                )

        return handle


router = APIRouter(route_class=DeliveryRoute, responses=docs.ERROR_RESPONSES)


def problem(status, code, message):
    raise HTTPException(
        status, detail={"error": {"code": code, "message": message, "details": None}}
    )


def page(data, total, limit, offset):
    return {
        "data": data,
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + limit < total,
        },
    }


def job_json(job):
    return {
        key: getattr(job, key)
        for key in [
            "id",
            "owner_id",
            "name",
            "account_id",
            "kind",
            "status",
            "stage",
            "results",
            "created_at",
            "updated_at",
            "post_started_at",
            "finished_at",
            "error_message",
            "error_code",
            "provider_error_code",
            "provider_error_subcode",
            "retry_allowed",
            "failure_id",
            "write_failures",
            "available_at",
            "generated_ad_id",
            "creative_asset_id",
            "creative_snapshot",
        ]
    }


def visible_jobs(user):
    statement = select(DeliveryJob)
    return (
        statement
        if user.has_role("admin")
        else statement.where(DeliveryJob.owner_id == user.id)
    )


def owned_job(db, user, job_id, lock=False):
    statement = visible_jobs(user).where(DeliveryJob.id == job_id)
    job = db.scalar(statement.with_for_update() if lock else statement)
    if not job:
        problem(404, "NOT_FOUND", "Posting job not found")
    return job


@router.get(
    "/settings",
    responses={200: {"model": docs.DeliverySettingsResult}},
    description="Any active user. Read effective config, current defaults and UTC worker heartbeats. "
    "The enabled flag describes this API process; heartbeats cover the shared workers.",
)
def read_settings(
    db: Session = Depends(get_db), user: User = Depends(get_current_active_user)
):
    settings = get_settings(db)
    db.commit()
    return {
        "config": {key: getattr(settings, key) for key in DeliveryConfig.model_fields},
        "defaults": DeliveryConfig().model_dump(),
        "posting_heartbeat": settings.posting_heartbeat,
        "sync_heartbeat": settings.sync_heartbeat,
        "worker_enabled_on_this_server": config.WORKER_ENABLED,
    }


@router.put(
    "/settings",
    responses={200: {"model": docs.DeliveryConfigResult}},
    description="Admin only. Replace the shared configuration across buyers and replicas. "
    "Omitted fields reset to schema defaults: GET first, edit config, then PUT the full object. "
    "Running provider requests finish; pause prevents subsequent posting work. "
    "Both cadence and rolling-window limits count final-ad attempts, including retries. "
    "Separate request budgets cover Meta transport calls. Idle import schedules are recalculated.",
)
def update_settings(
    data: DeliveryConfig,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    settings = get_settings(db)
    for key, value in data.model_dump().items():
        setattr(settings, key, value)
    now = utcnow()
    for sync in db.scalars(select(DeliverySync).where(DeliverySync.status == "idle")):
        interval = (
            data.status_interval_seconds
            if sync.kind == "status"
            else data.performance_interval_seconds
        )
        sync.next_run_at = (
            max(now, sync.last_success_at + timedelta(seconds=interval))
            if sync.last_success_at
            else now
        )
        if sync.kind == "performance":
            correction_due = (sync.last_reconciled_at or now) + timedelta(
                hours=data.reconcile_interval_hours
            )
            sync.next_run_at = min(sync.next_run_at, max(now, correction_due))
    db.commit()
    return {"config": data.model_dump()}


@router.post(
    "/launches",
    status_code=202,
    responses={202: {"model": docs.DeliveryJobResult}, **docs.CONFLICT},
    description="Requires campaigns:write. Queue durable media/creative/ad creation. "
    "local_adset_id is a saved application ad-set ID with a Facebook identity. "
    "New launches require creative_asset_id for analyzed, unarchived saved media matching the body. "
    "The server freezes creator/metadata provenance; pre-release key replays retain compatibility. "
    "request_key is unique per buyer across both submission APIs: reuse the same key and "
    "payload after a lost response. A changed payload or 1,000 pending jobs yields "
    "SUBMISSION_CONFLICT. HTTP 202 confirms receipt; poll the job for completion. "
    "Default status is PAUSED; ACTIVE is allowed through this API.",
)
def launch(
    data: LaunchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    adset = db.get(FacebookAdSet, data.local_adset_id)
    if not adset or not adset.fb_adset_id:
        problem(422, "ADSET_REQUIRED", "Save the Facebook ad set before queueing ads")
    from app.creatives.models import CreativeAsset
    from app.creatives.service import lock_asset, snapshot

    if not data.creative_asset_id:
        previous = db.scalar(
            select(DeliveryJob).where(
                DeliveryJob.owner_id == user.id,
                DeliveryJob.request_key == data.request_key,
            )
        )
        if previous and not previous.creative_asset_id:
            payload = data.model_dump(
                mode="json", exclude={"request_key", "account_id", "creative_asset_id"}
            )
            payload["adset_id"] = adset.fb_adset_id
            try:
                return job_json(
                    enqueue(
                        db,
                        user.id,
                        data.request_key,
                        data.account_id,
                        "launch",
                        payload,
                    )
                )
            except ValueError as error:
                db.rollback()
                problem(409, "SUBMISSION_CONFLICT", str(error))
        problem(
            422,
            "CREATIVE_REQUIRED",
            "Select saved creative before starting a new launch",
        )
    lock_asset(db, data.creative_asset_id)
    asset = db.get(CreativeAsset, data.creative_asset_id)
    if not asset or asset.analysis_status != "ready" or asset.archived_at:
        problem(
            422,
            "CREATIVE_NOT_READY",
            "Select a saved creative and complete its metadata analysis before launch",
        )
    if (
        str(data.media_url) != asset.media_url
        or data.media_type != asset.media_type
        or (data.generated_ad_id and data.generated_ad_id != asset.generated_ad_id)
    ):
        problem(
            422,
            "CREATIVE_MISMATCH",
            "Launch media must match the selected saved creative",
        )
    payload = data.model_dump(mode="json", exclude={"request_key", "account_id"})
    payload["adset_id"] = adset.fb_adset_id
    payload["generated_ad_id"] = asset.generated_ad_id
    payload["thumbnail_url"] = asset.thumbnail_url
    payload["creative_snapshot"] = snapshot(asset)
    try:
        job = enqueue(db, user.id, data.request_key, data.account_id, "launch", payload)
    except ValueError as error:
        db.rollback()
        problem(409, "SUBMISSION_CONFLICT", str(error))
    return job_json(job)


@router.get(
    "/jobs",
    responses={200: {"model": docs.DeliveryList[docs.DeliveryJobResult]}},
    description="Own jobs only; admins see all buyers. Newest first. Optional job_id "
    "filters to one exact job. Polling reads the local database, without a Facebook request.",
)
def jobs(
    job_id: Optional[str] = Query(None, max_length=36),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    statement = visible_jobs(user)
    if job_id:
        statement = statement.where(DeliveryJob.id == job_id)
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    data = db.scalars(
        statement.order_by(DeliveryJob.created_at.desc(), DeliveryJob.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return page([job_json(job) for job in data], total, limit, offset)


@router.get(
    "/jobs/{job_id}",
    responses={200: {"model": docs.DeliveryJobResult}, **docs.NOT_FOUND},
    description="Owner or admin. Read progress and confirmed object IDs. succeeded means "
    "the ad was created and saved locally; it does not mean Meta approval or active delivery. "
    "An automatic retry remains queued until available_at. needs_reconciliation stops writes.",
)
def job_details(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    return job_json(owned_job(db, user, job_id))


@router.post(
    "/jobs/{job_id}/cancel",
    responses={
        200: {"model": docs.DeliveryJobResult},
        **docs.NOT_FOUND,
        **docs.CONFLICT,
    },
    description="Owner or admin. No body. Cancel only a queued job; other states return "
    "NOT_CANCELLABLE. Confirmed media/creative objects are preserved.",
)
def cancel(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    job = owned_job(db, user, job_id, lock=True)
    if job.status != "queued":
        problem(409, "NOT_CANCELLABLE", "Only queued jobs can be cancelled")
    job.status, job.finished_at = "cancelled", utcnow()
    db.commit()
    return job_json(job)


@router.post(
    "/jobs/{job_id}/retry",
    responses={
        200: {"model": docs.DeliveryJobResult},
        **docs.NOT_FOUND,
        **docs.CONFLICT,
    },
    description="Owner or admin with campaigns:write. Requires failed status, retry_allowed=true "
    "and the current failure_id. Requeues the same job and preserves confirmed object IDs. "
    "Resets counters for a new bounded cycle. Stale/duplicate retries, unknown outcomes or "
    "an existing ad_id return NOT_RETRYABLE. After a timeout, GET the job before retrying.",
)
def retry_posting(
    job_id: str,
    data: RetryRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    job = owned_job(db, user, job_id, lock=True)
    try:
        retry_job(db, job, str(data.failure_id))
    except ValueError as error:
        problem(409, "NOT_RETRYABLE", str(error))
    return job_json(job)


def visible_notifications(user):
    statement = (
        select(DeliveryNotification)
        .join(DeliveryJob)
        .where(
            DeliveryNotification.user_id == user.id,
            DeliveryNotification.failure_id == DeliveryJob.failure_id,
            DeliveryJob.status.in_(["failed", "needs_reconciliation"]),
        )
    )
    return (
        statement
        if user.has_role("admin")
        else statement.where(DeliveryJob.owner_id == user.id)
    )


@router.get(
    "/notifications",
    responses={200: {"model": docs.DeliveryList[docs.DeliveryNotificationResult]}},
    description="Current recipient's unread, unresolved posting failures, newest first. "
    "Admins also receive their own copies. Requeued/resolved jobs leave this list. "
    "Role revocation removes access to other buyers' notices. In-app only; no email or Slack.",
)
def notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    statement = visible_notifications(user).where(
        DeliveryNotification.read_at.is_(None)
    )
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    records = db.execute(
        statement.add_columns(DeliveryJob.name, DeliveryJob.status)
        .order_by(DeliveryNotification.created_at.desc(), DeliveryNotification.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return page(
        [
            dict(
                id=n.id,
                job_id=n.job_id,
                name=name,
                status=status,
                message=n.message,
                created_at=n.created_at,
                read_at=n.read_at,
            )
            for n, name, status in records
        ],
        total,
        limit,
        offset,
    )


@router.post(
    "/notifications/{notification_id}/read",
    responses={200: {"model": docs.DeliveryNotificationReadResult}, **docs.NOT_FOUND},
    description="Current recipient only. No body. Acknowledge this recipient's copy without "
    "changing the job or other recipients. Repeating while the failure remains current "
    "returns the original read_at; a resolved or inaccessible notice returns NOT_FOUND.",
)
def read_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    notice = db.scalar(
        visible_notifications(user).where(DeliveryNotification.id == notification_id)
    )
    if not notice:
        problem(404, "NOT_FOUND", "Posting notification not found")
    notice.read_at = notice.read_at or utcnow()
    db.commit()
    return {"id": notice.id, "read_at": notice.read_at}


@router.get(
    "/jobs/{job_id}/candidates",
    responses={
        200: {"model": docs.DeliveryList[docs.DeliveryCandidate]},
        **docs.NOT_FOUND,
        **docs.CONFLICT,
        **docs.PROVIDER_READ_ERROR,
    },
    description="Admin only; needs_reconciliation at stage ad, otherwise NOT_RECONCILABLE. "
    "Read Facebook candidates with the exact launch marker, account, ad set and creative. "
    "Returns all verified matches in one envelope (limit equals count, including zero). "
    "Lookup is bounded to 20 pages/120 seconds. Empty results do not prove no ad exists.",
)
def candidates(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    job = owned_job(db, user, job_id)
    if job.status != "needs_reconciliation" or job.stage != "ad":
        problem(409, "NOT_RECONCILABLE", "This job is not awaiting ad reconciliation")
    try:
        provider = DeliveryProvider.for_user(db, job.owner_id)
        if hasattr(provider, "configure_budget"):
            provider.configure_budget(engine, job.account_id, "interactive")
        found = provider.reconciliation_candidates(job)
    except ProviderError:
        problem(
            502, "FACEBOOK_READ_FAILED", "Could not complete the Facebook ad lookup"
        )
    return page(found, len(found), len(found), 0)


@router.post(
    "/jobs/{job_id}/reconcile",
    responses={
        200: {"model": docs.DeliveryJobResult},
        **docs.NOT_FOUND,
        **docs.CONFLICT,
        **docs.PROVIDER_READ_ERROR,
    },
    description="Admin only. Link a verified existing Facebook ad; creates no new Meta object. "
    "Requires needs_reconciliation at stage ad. Returns IDENTITY_MISMATCH unless account, "
    "ad set, creative and launch marker match. WORKER_BUSY means try again after the active "
    "posting operation. Linking saves the local identity and starts managed-ad imports.",
)
def reconcile(
    job_id: str, data: ReconcileRequest, user: User = Depends(require_role("admin"))
):
    with worker_session(engine, "posting") as db:
        if db is None:
            problem(
                409,
                "WORKER_BUSY",
                "A posting operation is in progress; try again shortly",
            )
        job = owned_job(db, user, job_id, lock=True)
        if job.status != "needs_reconciliation" or job.stage != "ad":
            problem(
                409, "NOT_RECONCILABLE", "This job is not awaiting ad reconciliation"
            )
        try:
            provider = DeliveryProvider.for_user(db, job.owner_id)
            if hasattr(provider, "configure_budget"):
                provider.configure_budget(engine, job.account_id, "interactive")
            remote = provider.ad_status(data.fb_ad_id)
        except ProviderError:
            problem(502, "FACEBOOK_READ_FAILED", "Could not verify this Facebook ad")
        if str(remote.get("id")) != data.fb_ad_id or not matches_job(job, remote):
            problem(
                409,
                "IDENTITY_MISMATCH",
                "The Facebook account, ad set, creative and launch marker must all match",
            )
        persist_ad(db, job, data.fb_ad_id)
        return job_json(job)


@router.get(
    "/syncs",
    responses={200: {"model": docs.DeliveryList[docs.DeliverySyncResult]}},
    description="Own buyer/account import schedules; admins see all. Status defaults to "
    "300 seconds for new/pending ads and 3600 for stable ads; performance defaults to "
    "14400 seconds after a successful run. waiting means report processing; deferred means "
    "request capacity is unavailable without consuming retries. "
    "failed stays stopped until an admin restarts it. UI polling does not start an import.",
)
def syncs(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    statement = select(DeliverySync)
    if not user.has_role("admin"):
        statement = statement.where(DeliverySync.owner_id == user.id)
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    records = db.scalars(
        statement.order_by(DeliverySync.account_id, DeliverySync.kind)
        .limit(limit)
        .offset(offset)
    ).all()
    fields = [
        "id",
        "account_id",
        "kind",
        "status",
        "failures",
        "next_run_at",
        "last_success_at",
        "last_reconciled_at",
        "error_message",
    ]
    return page(
        [{field: getattr(record, field) for field in fields} for record in records],
        total,
        limit,
        offset,
    )


@router.post(
    "/syncs/{sync_id}/restart",
    responses={
        200: {"model": docs.DeliverySyncRestartResult},
        **docs.NOT_FOUND,
        **docs.CONFLICT,
    },
    description="Admin only. No body. Request a refresh/restart. Active, already-due or recently fresh "
    "work returns coalesced=true with its current status. Otherwise reset the failure "
    "counter/deadline and return idle/coalesced=false. Failed report staging is cleared. "
    "Does not synchronously fetch data or enable disabled imports. Repair access first.",
)
def restart_sync(
    sync_id: str,
    user: User = Depends(require_role("admin")),
    lookup: Session = Depends(get_db),
):
    existing = lookup.get(DeliverySync, sync_id)
    if not existing:
        problem(404, "NOT_FOUND", "Import not found")
    with worker_session(engine, "sync") as db:
        if db is None:
            return {"id": sync_id, "status": existing.status, "coalesced": True}
        sync = db.get(DeliverySync, sync_id)
        if not sync:
            problem(404, "NOT_FOUND", "Import not found")
        newest_ad = db.scalar(
            select(func.max(ManagedAd.created_at)).where(
                ManagedAd.account_id == sync.account_id,
                ManagedAd.owner_id == sync.owner_id,
            )
        )
        fresh = (
            sync.last_success_at
            and utcnow()
            < sync.last_success_at
            + timedelta(seconds=config.MANUAL_REFRESH_COOLDOWN_SECONDS)
            and (
                not newest_ad
                or newest_ad <= (sync.run_started_at or sync.last_success_at)
            )
        )
        if sync.status in {"waiting", "deferred", "retry_wait", "running"} or (
            sync.status != "failed" and (fresh or sync.next_run_at <= utcnow())
        ):
            return {"id": sync.id, "status": sync.status, "coalesced": True}
        if sync.status == "failed":
            sync.report_state = None
            db.execute(delete(StagedInsight).where(StagedInsight.sync_id == sync.id))
        sync.status, sync.failures, sync.error_message = "idle", 0, None
        sync.run_started_at, sync.next_run_at = None, utcnow()
        db.commit()
        return {"id": sync.id, "status": sync.status, "coalesced": False}


@router.get(
    "/report",
    responses={200: {"model": docs.DeliveryReportResult}},
    description="Own managed-ad daily snapshots; admins see all. Inclusive days window uses "
    "each account's timezone. Decimal amounts and counts are strings. Returns the current "
    "attribution dataset only; keep currencies and action types separate. Reimports replace "
    "snapshots rather than increment totals. days=90 reads retained data, without scheduling "
    "a historical backfill. Recent/correction windows default to 2/35 days and are configurable.",
)
def report(
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    account_today = cast(
        func.timezone(
            AdInsight.account_timezone, literal(utcnow(), type_=DateTime(timezone=True))
        ),
        Date,
    )
    statement = (
        select(AdInsight, ManagedAd)
        .join(ManagedAd, AdInsight.managed_ad_id == ManagedAd.id)
        .where(
            AdInsight.report_date.between(account_today - (days - 1), account_today),
            AdInsight.dataset == config.DATASET,
        )
    )
    if not user.has_role("admin"):
        statement = statement.where(ManagedAd.owner_id == user.id)
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    rows = db.execute(
        statement.order_by(AdInsight.report_date.desc(), ManagedAd.name, AdInsight.id)
        .limit(limit)
        .offset(offset)
    ).all()
    user_ids = {ad.owner_id for _, ad in rows}
    user_ids.update((ad.creative_snapshot or {}).get("created_by_id") for _, ad in rows)
    names = {
        member.id: member.name
        for member in db.scalars(
            select(User).where(
                User.id.in_([identity for identity in user_ids if identity])
            )
        )
    }
    data = [
        {
            "id": insight.id,
            "name": ad.name,
            "account_id": ad.account_id,
            "fb_ad_id": ad.fb_ad_id,
            "launched_by_id": ad.owner_id,
            "launched_by_name": names.get(ad.owner_id),
            "creative_created_by_name": names.get(
                (ad.creative_snapshot or {}).get("created_by_id")
            ),
            "creative_asset_id": ad.creative_asset_id,
            "creative_snapshot": ad.creative_snapshot,
            "effective_status": ad.effective_status,
            "report_date": insight.report_date,
            "currency": insight.currency,
            "account_timezone": insight.account_timezone,
            "impressions": str(insight.impressions),
            "clicks": str(insight.clicks),
            "spend": str(insight.spend),
            "actions": insight.actions,
            "imported_at": insight.imported_at,
        }
        for insight, ad in rows
    ]
    return {**page(data, total, limit, offset), "dataset": config.DATASET}
