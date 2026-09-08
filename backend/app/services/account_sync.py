"""Durable, fenced Meta metadata refreshes; provider I/O never holds a DB lock."""
from app.telemetry.runtime import capture_exception

from datetime import timedelta, timezone
from uuid import uuid4

from facebook_business.api import FacebookAdsApi
from facebook_business.session import FacebookSession
from fastapi import HTTPException
from sqlalchemy import and_, or_, func
from sqlalchemy.dialects.postgresql import insert

from app.core import workspace_config as config
from app.core.config import settings
from app.models import AccountSnapshot, AccountSyncJob, Workspace, WorkspaceAccount
from app.services.workspace_access import account_access, account_credential, audit


def utc(value):
    if value is None:
        return None
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def iso(value):
    return utc(value).isoformat() if value is not None else None


def db_now(db):
    return utc(db.query(func.clock_timestamp()).scalar())


def lock_workspace(db, workspace_id):
    return db.query(Workspace).filter_by(id=workspace_id).with_for_update().first()


def job_payload(job):
    return {
        "id": job.id,
        "workspace_id": job.workspace_id,
        "account_id": job.account_id,
        "resource": job.resource,
        "status": job.status,
        "attempts": job.attempts,
        "pages_fetched": job.pages_fetched,
        "created_at": iso(job.created_at),
        "started_at": iso(job.started_at),
        "completed_at": iso(job.completed_at),
        "error": safe_error(job.error_code),
    }


def safe_error(code):
    messages = {
        "SYNC_FAILED": "Refresh failed. Retry sync to update the last complete snapshot.",
        "ACCESS_CHANGED": "Account access changed. Request a new sync after access is restored.",
        "LEASE_RETRY_LIMIT": "Refresh recovery limit reached. Request a new sync.",
    }
    if code is None:
        return None
    return {
        "code": code,
        "message": messages.get(code, messages["SYNC_FAILED"]),
        "details": None,
    }


def authorized_job(db, job):
    account, member, grant = account_access(
        db,
        job.account_id,
        job.requested_by_user_id,
        sync=True,
        lock=True,
    )
    connection, token, owner = account_credential(db, account, lock=True)
    if (
        job.workspace_id != account.workspace_id
        or member.version != job.membership_version
        or grant.version != job.grant_version
        or connection.id != job.connection_id
        or owner.version != job.credential_owner_version
    ):
        raise HTTPException(409, "Account access changed.")
    return account.external_account_id, token


def settle(db, job, state, code=None):
    completed_at = db_now(db)
    job.status = state
    job.error_code = code
    job.completed_at = completed_at
    job.lease_token = None
    job.lease_expires_at = None
    job.worker_id = None
    audit(
        db,
        job.workspace_id,
        job.requested_by_user_id,
        "sync." + state,
        job.id,
        error_code=code,
        pages_fetched=job.pages_fetched,
    )


def enqueue_sync(db, account_id, user_id):
    account = db.get(WorkspaceAccount, account_id)
    if account is None:
        raise HTTPException(404, "Resource not found.")
    lock_workspace(db, account.workspace_id)
    account, member, grant = account_access(
        db, account_id, user_id, sync=True, lock=True
    )
    connection, _token, owner = account_credential(db, account, lock=True)
    existing = (
        db.query(AccountSyncJob)
        .filter(
            AccountSyncJob.account_id == account_id,
            AccountSyncJob.resource == "campaigns",
            AccountSyncJob.status.in_(("queued", "running")),
        )
        .with_for_update()
        .first()
    )
    if existing:
        try:
            authorized_job(db, existing)
        except HTTPException:
            settle(db, existing, "blocked", "ACCESS_CHANGED")
            db.flush()
        else:
            result = job_payload(existing)
            audit(db, account.workspace_id, user_id, "sync.coalesced", existing.id)
            db.commit()
            return result
    job = AccountSyncJob(
        id=str(uuid4()),
        workspace_id=account.workspace_id,
        account_id=account_id,
        resource="campaigns",
        requested_by_user_id=user_id,
        membership_version=member.version,
        grant_version=grant.version,
        connection_id=connection.id,
        credential_owner_version=owner.version,
        status="queued",
        attempts=0,
        pages_fetched=0,
    )
    db.add(job)
    audit(
        db,
        account.workspace_id,
        user_id,
        "sync.requested",
        job.id,
        resource="campaigns",
    )
    db.flush()
    result = job_payload(job)
    db.commit()
    return result


def claim_sync_job(db, worker_id):
    if not worker_id or len(worker_id) > 120:
        raise ValueError("Worker ID must contain 1–120 characters")
    while True:
        now = db_now(db)
        job = (
            db.query(AccountSyncJob)
            .filter(
                or_(
                    AccountSyncJob.status == "queued",
                    and_(
                        AccountSyncJob.status == "running",
                        AccountSyncJob.lease_expires_at <= now,
                    ),
                )
            )
            .order_by(AccountSyncJob.created_at, AccountSyncJob.id)
            .with_for_update(skip_locked=True)
            .first()
        )
        if job is None:
            db.commit()
            return None
        if job.attempts >= config.SYNC_MAX_ATTEMPTS:
            settle(db, job, "failed", "LEASE_RETRY_LIMIT")
            db.commit()
            continue
        job.status = "running"
        job.attempts += 1
        job.pages_fetched = 0
        job.worker_id = worker_id
        job.lease_token = str(uuid4())
        job.lease_expires_at = now + timedelta(seconds=config.SYNC_LEASE_SECONDS)
        job.started_at = now
        lease = {"id": job.id, "lease_token": job.lease_token}
        db.commit()
        return lease


class LeaseLost(Exception):
    pass


def checked_lease(db, lease):
    hint = db.get(AccountSyncJob, lease["id"])
    if hint is None:
        raise LeaseLost()
    lock_workspace(db, hint.workspace_id)
    job = (
        db.query(AccountSyncJob)
        .filter_by(id=lease["id"])
        .populate_existing()
        .with_for_update()
        .first()
    )
    if (
        job is None
        or job.status != "running"
        or job.lease_token != lease["lease_token"]
        or utc(job.lease_expires_at) <= db_now(db)
    ):
        raise LeaseLost()
    return job


def fetch_campaign_page(account_id, token, after):
    session = FacebookSession(
        app_id=settings.FACEBOOK_APP_ID,
        app_secret=settings.FACEBOOK_APP_SECRET,
        access_token=token,
        timeout=config.SYNC_REQUEST_TIMEOUT_SECONDS,
    )
    api = FacebookAdsApi(session)
    params = {"fields": ",".join(config.SYNC_FIELDS), "limit": config.SYNC_PAGE_SIZE}
    if after is not None:
        params["after"] = after
    return api.call("GET", (account_id, "campaigns"), params=params).json()


def normalized_page(page):
    if not isinstance(page, dict) or not isinstance(page.get("data"), list):
        raise ValueError("Invalid provider page")
    rows = []
    for raw in page["data"]:
        if (
            not isinstance(raw, dict)
            or not isinstance(raw.get("id"), str)
            or not raw["id"]
        ):
            raise ValueError("Invalid provider entity")
        row = {field: raw.get(field) for field in config.SYNC_FIELDS}
        if any(
            value is not None and not isinstance(value, str) for value in row.values()
        ):
            raise ValueError("Invalid provider field")
        if len(row["id"]) > 100 or any(
            len(value) > 4096 for value in row.values() if value
        ):
            raise ValueError("Provider field exceeds limit")
        rows.append(row)
    paging = page.get("paging") or {}
    if not isinstance(paging, dict):
        raise ValueError("Invalid pagination")
    after = None
    if paging.get("next"):
        cursors = paging.get("cursors") or {}
        after = cursors.get("after") if isinstance(cursors, dict) else None
        if not isinstance(after, str) or not after or len(after) > 2000:
            raise ValueError("Missing continuation cursor")
    return rows, after


def run_sync_job(factory, lease):
    items, seen_cursors = {}, set()
    after = None
    pages_fetched = 0
    try:
        for _ in range(config.SYNC_MAX_PAGES):
            with factory() as db:
                job = checked_lease(db, lease)
                account_id, token = authorized_job(db, job)
                job.lease_expires_at = db_now(db) + timedelta(
                    seconds=config.SYNC_LEASE_SECONDS
                )
                job.pages_fetched = pages_fetched
                db.commit()
            page = fetch_campaign_page(account_id, token, after)
            rows, after = normalized_page(page)
            pages_fetched += 1
            items.update({row["id"]: row for row in rows})
            if len(items) > config.SYNC_MAX_ITEMS:
                raise ValueError("Snapshot exceeds limit")
            if after is None:
                break
            if after in seen_cursors:
                raise ValueError("Repeated continuation cursor")
            seen_cursors.add(after)
        else:
            raise ValueError("Pagination exceeds limit")
        with factory() as db:
            job = checked_lease(db, lease)
            authorized_job(db, job)
            now = db_now(db)
            values = {
                "workspace_id": job.workspace_id,
                "account_id": job.account_id,
                "resource": job.resource,
                "generation_id": job.id,
                "items": [items[key] for key in sorted(items)],
                "last_success_at": now,
            }
            db.execute(
                insert(AccountSnapshot)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=["workspace_id", "account_id", "resource"],
                    set_={
                        key: values[key]
                        for key in ("generation_id", "items", "last_success_at")
                    },
                )
            )
            job.pages_fetched = pages_fetched
            settle(db, job, "succeeded")
            db.commit()
        return "succeeded"
    except LeaseLost:
        return "lease_lost"
    except Exception as error:
        capture_exception(error, "account_sync.run_sync_job")
        state, code = (
            ("blocked", "ACCESS_CHANGED")
            if isinstance(error, HTTPException)
            else ("failed", "SYNC_FAILED")
        )
        try:
            with factory() as db:
                job = checked_lease(db, lease)
                job.pages_fetched = pages_fetched
                settle(db, job, state, code)
                db.commit()
        except LeaseLost:
            return "lease_lost"
        return state


def read_snapshot(db, account_id, user_id, limit=50, offset=0):
    account_access(db, account_id, user_id)
    snapshot = (
        db.query(AccountSnapshot)
        .filter_by(account_id=account_id, resource="campaigns")
        .first()
    )
    latest = (
        db.query(AccountSyncJob)
        .filter_by(account_id=account_id, resource="campaigns")
        .order_by(AccountSyncJob.created_at.desc(), AccountSyncJob.id.desc())
        .first()
    )
    last_attempt = (
        db.query(func.max(AccountSyncJob.started_at))
        .filter_by(account_id=account_id, resource="campaigns")
        .scalar()
    )
    items = snapshot.items if snapshot else []
    last_success = utc(snapshot.last_success_at) if snapshot else None
    stale = (
        last_success is None
        or (db_now(db) - last_success).total_seconds() >= config.SYNC_FRESH_SECONDS
        or (latest is not None and latest.status != "succeeded")
    )
    return {
        "data": items[offset : offset + limit],
        "pagination": {
            "total": len(items),
            "limit": limit,
            "offset": offset,
            "hasMore": offset + limit < len(items),
        },
        "sync": {
            "last_success_at": iso(last_success),
            "last_attempt_at": iso(last_attempt),
            "stale": stale,
            "coverage": "complete" if snapshot else "none",
            "sync_job_id": latest.id if latest else None,
            "status": latest.status if latest else "pending",
            "error": safe_error(latest.error_code) if latest else None,
        },
    }
