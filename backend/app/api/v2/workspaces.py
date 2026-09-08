"""Additive workspace account APIs; legacy provider routes retain their contracts."""

from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.api.v1.campaign_settings import SettingsRoute
from app.core.deps import get_current_active_user
from app.core.workspace_config import SYNC_ROLES
from app.database import get_db
from app.models import (
    AccountSyncJob,
    MetaAdsConnection,
    User,
    Workspace,
    WorkspaceAccount,
    WorkspaceAccountGrant,
    WorkspaceAuditEvent,
    WorkspaceMembership,
)
from app.services.account_sync import (
    enqueue_sync,
    iso,
    job_payload,
    lock_workspace,
    read_snapshot,
)
from app.services.meta_connection import personal_meta_connection
from app.services.workspace_access import (
    account_access,
    account_credential,
    audit,
    membership,
    missing,
)

router = APIRouter(route_class=SettingsRoute)


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WorkspaceRequest(StrictRequest):
    name: str = Field(min_length=1, max_length=120, strict=True)


class MemberRequest(StrictRequest):
    role: Literal["viewer", "creative_editor", "buyer", "publisher", "admin"]
    is_active: bool = Field(default=True, strict=True)


class GrantRequest(StrictRequest):
    can_sync: bool = Field(default=False, strict=True)
    is_active: bool = Field(default=True, strict=True)


class ConnectionRequest(StrictRequest):
    meta_connection_id: UUID


class SyncRequest(StrictRequest):
    resource: Literal["campaigns"] = "campaigns"


def page(query, limit, offset, serialize):
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {
        "data": [serialize(row) for row in rows],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + limit < total,
        },
    }


def workspace_payload(row, role="admin"):
    return {
        "id": row.id,
        "name": row.name,
        "role": role,
        "created_at": iso(row.created_at),
    }


@router.get("/meta-connections")
def personal_connections(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    query = (
        db.query(MetaAdsConnection)
        .filter_by(user_id=user.id)
        .order_by(MetaAdsConnection.created_at, MetaAdsConnection.id)
    )
    return page(
        query,
        limit,
        offset,
        lambda row: {
            "id": row.id,
            "selected": row.is_active,
            **personal_meta_connection(row)[0],
        },
    )


@router.post("/workspaces", status_code=201)
def create_workspace(
    body: WorkspaceRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    if not user.has_role("admin"):
        raise HTTPException(403, "Administrator access required to create a workspace.")
    workspace = Workspace(id=str(uuid4()), name=body.name)
    db.add(workspace)
    db.flush()
    db.add(
        WorkspaceMembership(workspace_id=workspace.id, user_id=user.id, role="admin")
    )
    audit(db, workspace.id, user.id, "workspace.created", workspace.id)
    db.flush()
    result = workspace_payload(workspace)
    db.commit()
    return result


@router.get("/workspaces")
def list_workspaces(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    query = (
        db.query(Workspace, WorkspaceMembership.role)
        .join(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user.id,
            WorkspaceMembership.is_active.is_(True),
            Workspace.is_active.is_(True),
        )
        .order_by(Workspace.created_at, Workspace.id)
    )
    return page(query, limit, offset, lambda row: workspace_payload(row[0], row[1]))


def person_payload(user):
    return {"user_id": user.id, "name": user.name, "email": user.email}


@router.get("/workspaces/{workspace_id}/members")
def list_members(
    workspace_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    membership(db, str(workspace_id), user.id, admin=True)
    query = (
        db.query(WorkspaceMembership, User)
        .join(User, User.id == WorkspaceMembership.user_id)
        .filter(WorkspaceMembership.workspace_id == str(workspace_id))
        .order_by(User.email, User.id)
    )
    return page(
        query,
        limit,
        offset,
        lambda row: {
            **person_payload(row[1]),
            "role": row[0].role,
            "is_active": row[0].is_active,
            "user_active": row[1].is_active,
        },
    )


@router.get("/workspaces/{workspace_id}/member-candidates")
def member_candidates(
    workspace_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    membership(db, str(workspace_id), user.id, admin=True)
    if not user.is_superuser:
        raise HTTPException(
            403, "Application superuser access required to browse users."
        )
    query = db.query(User).filter_by(is_active=True).order_by(User.email, User.id)
    return page(query, limit, offset, person_payload)


@router.get("/workspaces/{workspace_id}/managed-connections")
def managed_connections(
    workspace_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    membership(db, str(workspace_id), user.id, admin=True)
    query = (
        db.query(WorkspaceAccount)
        .filter_by(workspace_id=str(workspace_id), is_active=True)
        .order_by(WorkspaceAccount.created_at, WorkspaceAccount.id)
    )
    return page(query, limit, offset, lambda row: connection_payload(db, row))


@router.get("/workspaces/{workspace_id}/accounts/{account_id}/grants")
def list_account_grants(
    workspace_id: UUID,
    account_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    workspace_id, account_id = str(workspace_id), str(account_id)
    membership(db, workspace_id, user.id, admin=True)
    account = (
        db.query(WorkspaceAccount)
        .filter_by(id=account_id, workspace_id=workspace_id, is_active=True)
        .first()
    )
    if account is None:
        missing()
    query = (
        db.query(WorkspaceMembership, User, WorkspaceAccountGrant)
        .join(User, User.id == WorkspaceMembership.user_id)
        .outerjoin(
            WorkspaceAccountGrant,
            and_(
                WorkspaceAccountGrant.workspace_id == WorkspaceMembership.workspace_id,
                WorkspaceAccountGrant.user_id == WorkspaceMembership.user_id,
                WorkspaceAccountGrant.account_id == account_id,
            ),
        )
        .filter(WorkspaceMembership.workspace_id == workspace_id)
        .order_by(User.email, User.id)
    )
    return page(
        query,
        limit,
        offset,
        lambda row: {
            **person_payload(row[1]),
            "role": row[0].role,
            "member_active": row[0].is_active,
            "user_active": row[1].is_active,
            "is_active": bool(row[2] and row[2].is_active),
            "can_sync": bool(row[2] and row[2].can_sync),
        },
    )


@router.put("/workspaces/{workspace_id}/members/{user_id}")
def put_member(
    workspace_id: UUID,
    user_id: UUID,
    body: MemberRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    workspace_id, user_id = str(workspace_id), str(user_id)
    lock_workspace(db, workspace_id)
    membership(db, workspace_id, user.id, admin=True)
    target = db.get(User, user_id)
    if target is None or (body.is_active and not target.is_active):
        missing()
    row = db.get(WorkspaceMembership, (workspace_id, user_id))
    if (
        row
        and row.is_active
        and row.role == "admin"
        and (not body.is_active or body.role != "admin")
    ):
        admins = (
            db.query(WorkspaceMembership)
            .filter_by(workspace_id=workspace_id, role="admin", is_active=True)
            .count()
        )
        if admins == 1:
            raise HTTPException(
                409, "Keep at least one active workspace administrator."
            )
    if row is None:
        row = WorkspaceMembership(
            workspace_id=workspace_id,
            user_id=user_id,
            role=body.role,
            is_active=body.is_active,
            version=1,
        )
        db.add(row)
    elif row.role != body.role or row.is_active != body.is_active:
        row.version += 1
        row.role, row.is_active = body.role, body.is_active
    audit(
        db,
        workspace_id,
        user.id,
        "member.updated",
        user_id,
        role=body.role,
        is_active=body.is_active,
    )
    result = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "role": row.role,
        "is_active": row.is_active,
        "version": row.version,
    }
    db.commit()
    return result


@router.put("/workspaces/{workspace_id}/accounts/{account_id}/grants/{user_id}")
def put_account_grant(
    workspace_id: UUID,
    account_id: UUID,
    user_id: UUID,
    body: GrantRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    workspace_id, account_id, user_id = str(workspace_id), str(account_id), str(user_id)
    lock_workspace(db, workspace_id)
    membership(db, workspace_id, user.id, admin=True)
    account = (
        db.query(WorkspaceAccount)
        .filter_by(id=account_id, workspace_id=workspace_id, is_active=True)
        .first()
    )
    target = db.get(WorkspaceMembership, (workspace_id, user_id))
    if account is None or target is None or (body.is_active and not target.is_active):
        missing()
    row = db.get(WorkspaceAccountGrant, (workspace_id, account_id, user_id))
    if row is None:
        row = WorkspaceAccountGrant(
            workspace_id=workspace_id,
            account_id=account_id,
            user_id=user_id,
            can_sync=body.can_sync,
            is_active=body.is_active,
            version=1,
        )
        db.add(row)
    elif row.can_sync != body.can_sync or row.is_active != body.is_active:
        row.version += 1
        row.can_sync, row.is_active = body.can_sync, body.is_active
    audit(
        db,
        workspace_id,
        user.id,
        "account.grant_updated",
        account_id,
        user_id=user_id,
        can_sync=body.can_sync,
        is_active=body.is_active,
    )
    result = {
        "workspace_id": workspace_id,
        "account_id": account_id,
        "user_id": user_id,
        "can_sync": row.can_sync,
        "is_active": row.is_active,
        "version": row.version,
    }
    db.commit()
    return result


def connection_payload(db, account, can_sync=False):
    try:
        account_credential(db, account)
        state = "connected"
    except HTTPException:
        state = "unavailable"
    connection = (
        db.get(MetaAdsConnection, account.meta_connection_id)
        if account.meta_connection_id
        else None
    )
    return {
        "id": account.id,
        "workspace_id": account.workspace_id,
        "provider": account.provider,
        "external_account_id": account.external_account_id,
        "account_name": connection.account_name if connection else None,
        "can_sync": can_sync,
        "state": state,
        "created_at": iso(account.created_at),
    }


@router.post("/workspaces/{workspace_id}/connections", status_code=201)
def register_connection(
    workspace_id: UUID,
    body: ConnectionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    workspace_id = str(workspace_id)
    lock_workspace(db, workspace_id)
    membership(db, workspace_id, user.id, admin=True)
    connection = (
        db.query(MetaAdsConnection)
        .filter_by(id=str(body.meta_connection_id), user_id=user.id)
        .first()
    )
    if connection is None:
        missing()
    public, _token = personal_meta_connection(connection)
    if not public["connected"]:
        raise HTTPException(
            409, "Reconnect your personal Meta account before sharing it."
        )
    exists = (
        db.query(WorkspaceAccount)
        .filter_by(
            workspace_id=workspace_id,
            provider="meta",
            external_account_id=connection.ad_account_id,
        )
        .first()
    )
    if exists:
        raise HTTPException(409, "This account is already registered in the workspace.")
    account = WorkspaceAccount(
        id=str(uuid4()),
        workspace_id=workspace_id,
        provider="meta",
        external_account_id=connection.ad_account_id,
        meta_connection_id=connection.id,
    )
    db.add(account)
    db.flush()
    db.add(
        WorkspaceAccountGrant(
            workspace_id=workspace_id,
            account_id=account.id,
            user_id=user.id,
            can_sync=True,
        )
    )
    audit(db, workspace_id, user.id, "account.registered", account.id, provider="meta")
    db.flush()
    result = connection_payload(db, account, can_sync=True)
    db.commit()
    return result


@router.get("/workspaces/{workspace_id}/connections")
def list_connections(
    workspace_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    workspace_id = str(workspace_id)
    member = membership(db, workspace_id, user.id)
    query = (
        db.query(WorkspaceAccount, WorkspaceAccountGrant.can_sync)
        .join(WorkspaceAccountGrant)
        .filter(
            WorkspaceAccount.workspace_id == workspace_id,
            WorkspaceAccount.is_active.is_(True),
            WorkspaceAccountGrant.user_id == user.id,
            WorkspaceAccountGrant.is_active.is_(True),
        )
        .order_by(WorkspaceAccount.created_at, WorkspaceAccount.id)
    )
    return page(
        query,
        limit,
        offset,
        lambda row: connection_payload(
            db, row[0], can_sync=member.role in SYNC_ROLES and row[1]
        ),
    )


@router.put("/workspaces/{workspace_id}/connections/{account_id}")
def reconnect_account(
    workspace_id: UUID,
    account_id: UUID,
    body: ConnectionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    workspace_id = str(workspace_id)
    lock_workspace(db, workspace_id)
    membership(db, workspace_id, user.id, admin=True)
    account = (
        db.query(WorkspaceAccount)
        .filter_by(id=str(account_id), workspace_id=workspace_id, is_active=True)
        .first()
    )
    connection = (
        db.query(MetaAdsConnection)
        .filter_by(id=str(body.meta_connection_id), user_id=user.id)
        .first()
    )
    if account is None or connection is None:
        missing()
    public, _token = personal_meta_connection(connection)
    if (
        not public["connected"]
        or account.external_account_id != connection.ad_account_id
    ):
        raise HTTPException(
            409, "Choose a usable personal connection for the same Meta account."
        )
    account.meta_connection_id = connection.id
    audit(db, workspace_id, user.id, "account.reconnected", account.id, provider="meta")
    db.flush()
    result = connection_payload(db, account)
    db.commit()
    return result


@router.get("/workspaces/{workspace_id}/audit")
def list_audit(
    workspace_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    membership(db, str(workspace_id), user.id, admin=True)
    query = (
        db.query(WorkspaceAuditEvent)
        .filter_by(workspace_id=str(workspace_id))
        .order_by(WorkspaceAuditEvent.created_at, WorkspaceAuditEvent.id)
    )
    return page(
        query,
        limit,
        offset,
        lambda row: {
            "id": row.id,
            "actor_user_id": row.actor_user_id,
            "action": row.action,
            "resource_id": row.resource_id,
            "details": row.details,
            "created_at": iso(row.created_at),
        },
    )


@router.post("/accounts/{account_id}/sync", status_code=202)
def request_sync(
    account_id: UUID,
    body: SyncRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    return enqueue_sync(db, str(account_id), user.id)


@router.get("/accounts/{account_id}/snapshot")
def account_snapshot(
    account_id: UUID,
    resource: Literal["campaigns"] = "campaigns",
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    return read_snapshot(db, str(account_id), user.id, limit, offset)


@router.get("/sync-jobs/{job_id}")
def sync_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    job = db.get(AccountSyncJob, str(job_id))
    if job is None:
        missing()
    account_access(db, job.account_id, user.id)
    return job_payload(job)
