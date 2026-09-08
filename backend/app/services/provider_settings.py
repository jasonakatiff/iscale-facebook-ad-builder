"""Encrypted installation credentials, resolved for each operation."""
from app.telemetry.runtime import redact_values
from contextlib import nullcontext
from datetime import datetime, timezone

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.core.installation import InstallationError, PROVIDER_LOCK_ID
from app.core.token_encryption import decrypt_token, encrypt_token
from app.database import SessionLocal
from app.models import ProviderConnection

PROVIDERS = {
    "gemini": {"name": "Google Gemini", "purpose": "Write ad copy and analyze creative templates",
               "key_url": "https://aistudio.google.com/app/apikey", "env": "GEMINI_API_KEY",
               "guide": ["Sign in to Google AI Studio.", "Choose Create API key and select a project.",
                         "Enable billing for that project if required, then paste the key here."]},
    "fal": {"name": "fal.ai", "purpose": "Generate image ads",
            "key_url": "https://fal.ai/dashboard/keys", "env": "FAL_AI_API_KEY",
            "guide": ["Sign in to fal.ai and add generation credits.", "Open Keys and create a key for API use.",
                      "Copy the entire key and paste it here."]},
    "kie": {"name": "Kie AI", "purpose": "Optional video provider; video setup is separate",
            "key_url": "https://kie.ai/api-key", "env": "KIE_AI_API_KEY",
            "guide": ["Sign in to Kie AI and open API Keys.", "Create a key and add credits when you need video generation.",
                      "Paste the key here to keep it ready for supported video workflows."]},
}


def provider_spec(provider):
    if provider not in PROVIDERS:
        raise InstallationError("unknown_provider", "This service is not supported.", 404)
    return PROVIDERS[provider]


def get_provider_key(provider, db=None):
    spec = provider_spec(provider)
    with nullcontext(db) if db is not None else SessionLocal() as session:
        row = session.query(ProviderConnection).populate_existing().filter_by(provider=provider).one_or_none()
        if row is not None:
            if row.disabled or not row.encrypted_key:
                return None
            try:
                return decrypt_token(row.encrypted_key)
            except ValueError:
                raise InstallationError("credential_unavailable", "This connection needs to be replaced in Settings → Integrations.", 503) from None
        return getattr(settings, spec["env"], "") or None


def require_provider_key(provider, db=None):
    key = get_provider_key(provider, db)
    if not key:
        raise InstallationError("provider_not_configured",
                                f"Connect {provider_spec(provider)['name']} in Settings → Integrations to use this feature.",
                                details={"provider": provider, "settings_path": "/settings?tab=integrations"})
    return key


def provider_view(provider, db):
    spec = provider_spec(provider)
    row = db.query(ProviderConnection).populate_existing().filter_by(provider=provider).one_or_none()
    fallback = getattr(settings, spec["env"], "") if row is None else None
    configured = bool(fallback or (row and row.encrypted_key and not row.disabled))
    return {"provider": provider, "name": spec["name"], "purpose": spec["purpose"],
            "key_url": spec["key_url"], "guide": spec["guide"], "configured": configured,
            "source": "application" if row and configured else "environment" if fallback else None,
            "key_hint": f"••••{row.key_hint}" if row and row.key_hint and configured else None,
            "status": row.status if row else "saved_unverified" if fallback else "not_configured",
            "message": row.status_message if row else None,
            "last_checked_at": row.last_checked_at.isoformat() if row and row.last_checked_at else None}


def capabilities(db):
    def available(provider):
        item = provider_view(provider, db)
        return item["configured"] and item["status"] not in {"invalid", "insufficient_credit"}
    return {"copy_generation": available("gemini"), "image_generation": available("fal"),
            "image_ad_workflow": available("gemini") and available("fal"), "video_generation": False}


def save_provider_key(db, provider, key, actor_id):
    provider_spec(provider)
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": PROVIDER_LOCK_ID})
    row = db.get(ProviderConnection, provider)
    if row is None:
        row = ProviderConnection(provider=provider, version=0)
        db.add(row)
    row.encrypted_key = encrypt_token(key) if key else None
    row.key_hint = key[-4:] if key else None
    row.disabled = key is None
    row.status = "saved_unverified" if key else "not_configured"
    row.status_message = "Key saved. Test the connection before generating." if key else "Disconnected. Generation using this service is disabled."
    row.last_checked_at = None
    row.updated_by_user_id = actor_id
    row.version += 1
    db.commit()
    return provider_view(provider, db)


async def check_provider_key(provider, key):
    if provider == "fal":
        return "saved_unverified", "Key saved. fal.ai verifies generation keys on your first image request; no credits were used by this check."
    url = "https://generativelanguage.googleapis.com/v1beta/models" if provider == "gemini" else "https://api.kie.ai/api/v1/chat/credit"
    headers = {"x-goog-api-key": key} if provider == "gemini" else {"Authorization": f"Bearer {key}"}
    try:
        with redact_values(key):
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                response = await client.get(url, headers=headers)
        if response.status_code in {401, 403}:
            return "invalid", "The provider rejected this key. Check its permissions or replace it."
        if provider == "gemini" and response.status_code == 400:
            data = response.json()
            error = data.get("error") if isinstance(data, dict) else None
            details = error.get("details", []) if isinstance(error, dict) else []
            if isinstance(details, list) and any(
                isinstance(detail, dict) and detail.get("reason") == "API_KEY_INVALID"
                for detail in details
            ):
                return "invalid", "Google rejected this API key. Copy the complete key from Google AI Studio or replace it."
        if response.status_code == 402:
            return "insufficient_credit", "Add credits in your provider account, then test again."
        if response.status_code == 429 or response.status_code >= 500:
            return "temporarily_unavailable", "The provider is busy. Try again later."
        if not response.is_success:
            return "saved_unverified", "The provider could not verify this key without generation. No credits were used."
        data = response.json()
        if provider == "kie":
            if data.get("code") in {401, 403}:
                return "invalid", "The provider rejected this key. Replace it and try again."
            if data.get("code") != 200:
                return "saved_unverified", "Key saved; account verification is unavailable."
            if isinstance(data.get("data"), (float, int)) and data["data"] <= 0:
                return "insufficient_credit", "Add credits in your provider account, then test again."
        elif "models" not in data:
            return "saved_unverified", "Key saved; the provider returned an unexpected verification response."
        return "connected", "Connection verified without generating content. Generation is billed by this provider."
    except (httpx.HTTPError, ValueError, TypeError):
        return "temporarily_unavailable", "Unable to reach the provider. Your key is saved; try again later."


async def test_provider_connection(db, provider):
    key = require_provider_key(provider, db)
    row = db.get(ProviderConnection, provider)
    expected_version = row.version if row else None
    db.commit()
    status, message = await check_provider_key(provider, key)
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": PROVIDER_LOCK_ID})
    current = db.query(ProviderConnection).populate_existing().filter_by(provider=provider).one_or_none()
    if (current.version if current else None) != expected_version:
        db.rollback()
        raise InstallationError("connection_changed", "This key changed during the check. Test the current connection again.")
    if current is not None:
        current.status = status
        current.status_message = message
        current.last_checked_at = datetime.now(timezone.utc)
        db.commit()
    else:
        db.rollback()
    result = provider_view(provider, db)
    result.update(status=status, message=message)
    return result
