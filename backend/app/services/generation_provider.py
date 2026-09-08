"""Provider clients with request-scoped keys and redacted failures."""
from app.telemetry.runtime import redact_values
from datetime import datetime, timezone
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


def generation_failure(provider, key, status_code=None):
    state = {401: "invalid", 403: "invalid", 402: "insufficient_credit"}.get(status_code, "temporarily_unavailable")
    record_result(provider, key, state)
    messages = {
        "invalid": "The provider rejected this key. Replace it in Settings → Integrations.",
        "insufficient_credit": "Your provider account needs generation credits. Add credits before retrying.",
        "temporarily_unavailable": "The provider did not complete this request. Check its request history before generating again; a timed-out request can still incur a charge.",
    }
    return InstallationError("provider_failed", messages[state], 502, {"provider": provider, "status": state})


async def generate_gemini_text(prompt, db=None, image_part=None):
    key = require_provider_key("gemini", db)
    parts = [{"text": prompt}]
    if image_part:
        parts.append(image_part)
    try:
        with redact_values(key):
            async with httpx.AsyncClient(timeout=90, follow_redirects=False) as client:
                response = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
                    headers={"x-goog-api-key": key},
                    json={"contents": [{"parts": parts}]},
                )
        if not response.is_success:
            raise generation_failure("gemini", key, response.status_code)
        body = response.json()
        value = "".join(part.get("text", "") for part in body["candidates"][0]["content"]["parts"])
        if not value:
            raise ValueError("Empty provider response")
        record_result("gemini", key, "connected")
        return value
    except InstallationError:
        raise
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        raise generation_failure("gemini", key) from None
