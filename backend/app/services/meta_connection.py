"""Effective Meta credentials shared by status and provider service resolution."""
import os
from datetime import datetime, timezone

from app.core.token_encryption import decrypt_token
from app.models import MetaAdsConnection


def _utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _payload(state="disconnected", source=None, **values):
    return {
        "connected": state == "connected",
        "state": state,
        "source": source,
        "ad_account_id": None,
        "account_name": None,
        "connected_at": None,
        "token_expires_at": None,
        "can_disconnect": source == "oauth",
        "error": None,
        **values,
    }


def personal_meta_connection(connection):
    expires_at = _utc(connection.access_token_expires_at)
    created_at = _utc(connection.created_at)
    public = _payload(
        "connected", "oauth",
        ad_account_id=connection.ad_account_id,
        account_name=connection.account_name,
        connected_at=created_at.isoformat() if created_at else None,
        token_expires_at=expires_at.isoformat() if expires_at else None,
    )
    if expires_at and expires_at <= datetime.now(timezone.utc):
        public.update(connected=False, state="expired", error={
            "code": "META_TOKEN_EXPIRED",
            "message": "Meta access has expired. Reconnect your personal Meta account.",
            "details": None,
        })
        return public, None
    try:
        token = decrypt_token(connection.encrypted_access_token)
        if not token.strip():
            raise ValueError("Empty stored token")
    except (ValueError, TypeError, AttributeError):
        public.update(connected=False, state="unavailable", error={
            "code": "META_CONNECTION_UNAVAILABLE",
            "message": "Stored Meta access is unavailable. Reconnect your personal Meta account.",
            "details": None,
        })
        return public, None
    return public, token


def resolve_meta_connection(db, user_id):
    """Return public status and a private token separately; never call Meta here."""
    owned = db.query(MetaAdsConnection).filter(MetaAdsConnection.user_id == user_id)
    selected = owned.filter(MetaAdsConnection.is_active.is_(True)).first()
    if selected:
        return personal_meta_connection(selected)

    token = os.getenv("FACEBOOK_ACCESS_TOKEN") or os.getenv("VITE_FACEBOOK_ACCESS_TOKEN")
    if token and token.strip():
        account_id = os.getenv("FACEBOOK_AD_ACCOUNT_ID") or os.getenv("VITE_FACEBOOK_AD_ACCOUNT_ID")
        if account_id and not account_id.startswith("act_"):
            account_id = f"act_{account_id}"
        return _payload("connected", "managed", ad_account_id=account_id or None), token

    if owned.first():
        return _payload("selection_required", "oauth", can_disconnect=False), None
    return _payload(), None
