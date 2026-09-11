"""Provider clients with request-scoped keys and redacted failures."""
from app.telemetry.runtime import redact_values
from datetime import datetime, timezone
import asyncio
import hmac
import logging
from sqlalchemy.exc import SQLAlchemyError

import httpx

from app.core.installation import InstallationError
from app.core.token_encryption import decrypt_token
from app.database import SessionLocal
from app.models import ProviderConnection
from app.services.provider_settings import require_provider_key


def record_result(provider, key, status):
    try:
        with SessionLocal() as db:
            row = db.query(ProviderConnection).filter_by(provider=provider).with_for_update().one_or_none()
            if row is None or row.disabled or not row.encrypted_key:
                return
            if not hmac.compare_digest(decrypt_token(row.encrypted_key), key):
                return
            row.status = status
            row.last_checked_at = datetime.now(timezone.utc)
            row.status_message = "Connection verified by a generation request." if status == "connected" else "Check this connection in Settings → Integrations before retrying."
            db.commit()
    except (SQLAlchemyError, ValueError):
        logging.getLogger(__name__).warning("Provider status could not be recorded; preserving the generation result.")


def generation_failure(provider, key, status_code=None, provider_message=None):
    state = {401: "invalid", 403: "invalid", 402: "insufficient_credit",
             400: "request_rejected", 429: "rate_limited"}.get(status_code, "temporarily_unavailable")
    if state in ("invalid", "insufficient_credit"):
        # Only key-level failures may change the connection status; a per-request
        # failure must not flip the Settings banner to "check this connection".
        record_result(provider, key, state)
    messages = {
        "invalid": "The provider rejected this key. Replace it in Settings → Integrations.",
        "insufficient_credit": "Your provider account needs generation credits. Add credits before retrying.",
        "request_rejected": "The provider rejected this request — usually the image or prompt, not your settings. Try a different creative.",
        "rate_limited": "The provider is rate-limiting requests right now. Wait a minute and retry — no settings change is needed.",
        "temporarily_unavailable": "The provider did not complete this request. Check its request history before generating again; a timed-out request can still incur a charge.",
    }
    message = messages[state]
    if state == "request_rejected" and provider_message:
        message = f"The provider rejected this request: {provider_message[:200]} — usually the image or prompt, not your settings."
    return InstallationError("provider_failed", message, 502, {"provider": provider, "status": state})


BLOCKED_FINISH_REASONS = ("SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "RECITATION", "BLOCKLIST")


def provider_error_message(response):
    try:
        return str(response.json()["error"]["message"])
    except (ValueError, KeyError, TypeError):
        return None


async def generate_gemini_text(prompt, db=None, image_part=None):
    key = require_provider_key("gemini", db)
    parts = [{"text": prompt}]
    if image_part:
        parts.append(image_part)
    try:
        with redact_values(key):
            async with httpx.AsyncClient(timeout=90, follow_redirects=False) as client:
                for attempt in (1, 2):
                    response = await client.post(
                        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
                        headers={"x-goog-api-key": key},
                        json={"contents": [{"parts": parts}]},
                    )
                    if response.status_code in (429, 500, 502, 503) and attempt == 1:
                        await asyncio.sleep(2)
                        continue
                    break
        if not response.is_success:
            raise generation_failure("gemini", key, response.status_code, provider_error_message(response))
        body = response.json()
        candidates = body.get("candidates") or []
        block_reason = (body.get("promptFeedback") or {}).get("blockReason")
        finish_reason = candidates[0].get("finishReason") if candidates else None
        if block_reason or finish_reason in BLOCKED_FINISH_REASONS or not candidates:
            # The key works; the provider declined this specific content.
            record_result("gemini", key, "connected")
            raise InstallationError(
                "generation_blocked",
                "The provider declined to process this content"
                f" ({block_reason or finish_reason or 'no result returned'})."
                " Try a different creative — no settings change is needed.",
                422, {"provider": "gemini", "status": "blocked"})
        value = "".join(part.get("text", "") for part in candidates[0]["content"]["parts"])
        if not value:
            raise ValueError("Empty provider response")
        record_result("gemini", key, "connected")
        return value
    except InstallationError:
        raise
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        raise generation_failure("gemini", key) from None
