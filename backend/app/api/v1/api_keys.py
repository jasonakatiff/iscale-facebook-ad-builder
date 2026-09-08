"""Session-only self-service keys; every key stays bound to its issuing user."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.v1.campaign_settings import SettingsRoute
from app.core.deps import _hash_api_key, get_browser_user
from app.core.rate_limit import limiter
from app.database import get_db
from app.models import ApiKey, User
from app.schemas.platform import Pagination, PlatformError

router = APIRouter(
    route_class=SettingsRoute,
    responses={code: {"model": PlatformError} for code in (401, 403, 404, 409, 422)},
)
MAX_ACTIVE_KEYS = 20


class KeyName(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80, strict=True)


class KeyCreate(KeyName):
    access: Literal["read", "write", "telemetry"] = "read"
    expiresInDays: int = Field(default=90, ge=1, le=365, strict=True)


class KeyMetadata(BaseModel):
    id: UUID
    name: str
    prefix: str | None
    scopes: list[str]
    createdAt: datetime | None
    lastUsedAt: datetime | None
    expiresAt: datetime | None
    revokedAt: datetime | None


class KeyResult(BaseModel):
    data: KeyMetadata


class KeyCreated(KeyResult):
    apiKey: str = Field(
        description="Plaintext shown only in this response. Store securely; it cannot be retrieved later."
    )


class KeyList(BaseModel):
    data: list[KeyMetadata]
    pagination: Pagination


def iso(value):
    return value.astimezone(timezone.utc).isoformat() if value else None


def public_key(key):
    return {
        "id": key.id,
        "name": key.name,
        "prefix": key.key_prefix,
        "scopes": key.scopes,
        "createdAt": iso(key.created_at),
        "lastUsedAt": iso(key.last_used_at),
        "expiresAt": iso(key.expires_at),
        "revokedAt": iso(key.revoked_at),
    }


def owned_key(db, user, key_id):
    row = (
        db.query(ApiKey)
        .filter(ApiKey.id == str(key_id), ApiKey.created_by_user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "API key not found")
    return row


@router.get("", response_model=KeyList)
def list_keys(
    response: Response,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_browser_user),
):
    response.headers["Cache-Control"] = "no-store"
    query = db.query(ApiKey).filter(ApiKey.created_by_user_id == user.id)
    total = query.count()
    rows = (
        query.order_by(ApiKey.created_at.desc(), ApiKey.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "data": [public_key(row) for row in rows],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + len(rows) < total,
        },
    }


@router.post("", status_code=201, response_model=KeyCreated)
@limiter.limit("20/hour")
def create_key(
    request: Request,
    response: Response,
    body: KeyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_browser_user),
):
    response.headers["Cache-Control"] = "no-store"
    db.query(User).filter(User.id == user.id).with_for_update().one()
    if body.access == "telemetry" and not user.has_role("admin"):
        raise HTTPException(
            403, "Administrator access is required for diagnostics keys"
        )
    now = datetime.now(timezone.utc)
    active = (
        db.query(ApiKey)
        .filter(
            ApiKey.created_by_user_id == user.id,
            ApiKey.revoked_at.is_(None),
            or_(ApiKey.expires_at.is_(None), ApiKey.expires_at > now),
        )
        .count()
    )
    if active >= MAX_ACTIVE_KEYS:
        raise HTTPException(
            409, "Revoke an unused key before creating another. Limit: 20 active keys."
        )
    raw = "bw_live_" + secrets.token_urlsafe(32)
    key = ApiKey(
        name=body.name,
        key_hash=_hash_api_key(raw),
        key_prefix=raw[:16],
        scopes=(
            ["telemetry:read", "feedback:write"]
            if body.access == "telemetry"
            else ["platform:read"]
            + (["platform:write"] if body.access == "write" else [])
        ),
        created_by_user_id=user.id,
        expires_at=now + timedelta(days=body.expiresInDays),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return {"data": public_key(key), "apiKey": raw}


@router.patch("/{key_id}", response_model=KeyResult)
def rename_key(
    key_id: UUID,
    body: KeyName,
    db: Session = Depends(get_db),
    user: User = Depends(get_browser_user),
):
    key = owned_key(db, user, key_id)
    key.name = body.name
    db.commit()
    db.refresh(key)
    return {"data": public_key(key)}


@router.delete("/{key_id}", response_model=KeyResult)
def revoke_key(
    key_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_browser_user)
):
    key = owned_key(db, user, key_id)
    if key.revoked_at is None:
        key.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(key)
    return {"data": public_key(key)}
