from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.routing import APIRoute
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import Date, DateTime, cast, func, literal, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_active_user, require_permission, require_role
from app.database import get_db, engine
from app.models import FacebookAdSet, GeneratedAd, User
from app.delivery import config
from app.delivery.models import (
    AdInsight,
    DeliveryJob,
    DeliverySettings,
    DeliverySync,
    ManagedAd,
)
from app.delivery.provider import DeliveryProvider, ProviderError, matches_job
from app.delivery.queue import enqueue, get_settings, persist_ad, utcnow, worker_session
from app.delivery.schemas import DeliveryConfig, LaunchRequest, ReconcileRequest


class DeliveryRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handle(request):
            try:
                return await original(request)
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
                            "message": "Check the submitted fields",
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


router = APIRouter(route_class=DeliveryRoute)


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
            "generated_ad_id",
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


@router.get("/settings")
def read_settings(
    db: Session = Depends(get_db), user: User = Depends(get_current_active_user)
):
    settings = get_settings(db)
    db.commit()
    return {
        "config": {key: getattr(settings, key) for key in DeliveryConfig.model_fields},
        "posting_heartbeat": settings.posting_heartbeat,
        "sync_heartbeat": settings.sync_heartbeat,
        "worker_enabled_on_this_server": config.WORKER_ENABLED,
    }


@router.put("/settings")
def update_settings(
    data: DeliveryConfig,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    settings = get_settings(db)
    for key, value in data.model_dump().items():
        setattr(settings, key, value)
    db.commit()
    return {"config": data.model_dump()}


@router.post("/launches", status_code=202)
def launch(
    data: LaunchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    adset = db.get(FacebookAdSet, data.local_adset_id)
    if not adset or not adset.fb_adset_id:
        problem(422, "ADSET_REQUIRED", "Save the Facebook ad set before queueing ads")
    if data.generated_ad_id and not db.get(GeneratedAd, data.generated_ad_id):
        problem(422, "SOURCE_NOT_FOUND", "Generated ad not found")
    payload = data.model_dump(mode="json", exclude={"request_key", "account_id"})
    payload["adset_id"] = adset.fb_adset_id
    try:
        job = enqueue(db, user.id, data.request_key, data.account_id, "launch", payload)
    except ValueError as error:
        db.rollback()
        problem(409, "SUBMISSION_CONFLICT", str(error))
    return job_json(job)


@router.get("/jobs")
def jobs(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    statement = visible_jobs(user)
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    data = db.scalars(
        statement.order_by(DeliveryJob.created_at.desc(), DeliveryJob.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return page([job_json(job) for job in data], total, limit, offset)


@router.get("/jobs/{job_id}")
def job_details(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    return job_json(owned_job(db, user, job_id))


@router.post("/jobs/{job_id}/cancel")
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


@router.get("/jobs/{job_id}/candidates")
def candidates(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    job = owned_job(db, user, job_id)
    if job.status != "needs_reconciliation" or job.stage != "ad":
        problem(409, "NOT_RECONCILABLE", "This job is not awaiting ad reconciliation")
    try:
        found = DeliveryProvider.for_user(db, job.owner_id).reconciliation_candidates(
            job
        )
    except ProviderError:
        problem(
            502, "FACEBOOK_READ_FAILED", "Could not complete the Facebook ad lookup"
        )
    return page(found, len(found), len(found), 0)


@router.post("/jobs/{job_id}/reconcile")
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
            remote = DeliveryProvider.for_user(db, job.owner_id).ad_status(
                data.fb_ad_id
            )
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


@router.get("/syncs")
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


@router.post("/syncs/{sync_id}/restart")
def restart_sync(sync_id: str, user: User = Depends(require_role("admin"))):
    with worker_session(engine, "sync") as db:
        if db is None:
            problem(409, "WORKER_BUSY", "An import is in progress; try again shortly")
        sync = db.get(DeliverySync, sync_id)
        if not sync:
            problem(404, "NOT_FOUND", "Import not found")
        sync.status, sync.failures, sync.error_message = "idle", 0, None
        sync.run_started_at, sync.next_run_at = None, utcnow()
        db.commit()
        return {"id": sync.id, "status": sync.status}


@router.get("/report")
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
    data = [
        {
            "id": insight.id,
            "name": ad.name,
            "account_id": ad.account_id,
            "fb_ad_id": ad.fb_ad_id,
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
