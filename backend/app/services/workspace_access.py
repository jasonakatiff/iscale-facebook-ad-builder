"""Explicit workspace membership and account access; no global-role bypass."""

from fastapi import HTTPException

from app.core.workspace_config import SYNC_ROLES
from app.models import (
    MetaAdsConnection,
    User,
    Workspace,
    WorkspaceAccount,
    WorkspaceAccountGrant,
    WorkspaceAuditEvent,
    WorkspaceMembership,
)
from app.services.meta_connection import personal_meta_connection


def missing():
    raise HTTPException(404, "Resource not found.")


def membership(db, workspace_id, user_id, *, admin=False, lock=False):
    query = (
        db.query(WorkspaceMembership)
        .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
        .join(User, User.id == WorkspaceMembership.user_id)
        .filter(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.is_active.is_(True),
            Workspace.is_active.is_(True),
            User.is_active.is_(True),
        )
        .populate_existing()
    )
    if lock:
        query = query.with_for_update(of=WorkspaceMembership)
    member = query.first()
    if member is None:
        missing()
    if admin and member.role != "admin":
        raise HTTPException(403, "Workspace administrator access required.")
    return member


def account_access(db, account_id, user_id, *, sync=False, lock=False):
    account = (
        db.query(WorkspaceAccount)
        .filter_by(id=account_id, is_active=True)
        .populate_existing()
        .first()
    )
    if account is None:
        missing()
    member = membership(db, account.workspace_id, user_id, lock=lock)
    query = (
        db.query(WorkspaceAccountGrant)
        .filter_by(
            workspace_id=account.workspace_id,
            account_id=account_id,
            user_id=user_id,
            is_active=True,
        )
        .populate_existing()
    )
    if lock:
        query = query.with_for_update()
    grant = query.first()
    if grant is None:
        missing()
    if sync and (member.role not in SYNC_ROLES or not grant.can_sync):
        raise HTTPException(403, "Account synchronization permission required.")
    return account, member, grant


def account_credential(db, account, *, lock=False):
    query = (
        db.query(MetaAdsConnection)
        .filter_by(
            id=account.meta_connection_id,
            ad_account_id=account.external_account_id,
        )
        .populate_existing()
    )
    if lock:
        query = query.with_for_update()
    connection = query.first() if account.meta_connection_id else None
    if connection is None:
        raise HTTPException(409, "Reconnect the workspace account before syncing.")
    try:
        owner = membership(db, account.workspace_id, connection.user_id, lock=lock)
    except HTTPException:
        raise HTTPException(
            409, "The account connection owner no longer has workspace access."
        )
    public, token = personal_meta_connection(connection)
    if not public["connected"]:
        raise HTTPException(409, "Reconnect the workspace account before syncing.")
    return connection, token, owner


def audit(db, workspace_id, actor_user_id, action, resource_id, **details):
    db.add(
        WorkspaceAuditEvent(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            action=action,
            resource_id=resource_id,
            details=details,
        )
    )
