"""Shared OAuth "state" mechanism used by every platform OAuth flow (Google Ads
in Sprint 1, TikTok Ads in Sprint 3). The state token is what lets the OAuth
callback route skip the normal JWT bearer-token dependency (the browser is
being redirected by Google/TikTok, it can't attach an Authorization header)
while still proving the callback belongs to the same logged-in user who started
the flow and wasn't forged by a third party (CSRF on the OAuth flow itself).

Flow:
1. `/oauth/start` (behind the normal JWT-protected dependency) calls
   `create_oauth_state(user_id)` and sets the result as an httpOnly cookie via
   `set_oauth_state_cookie`, then redirects to the provider's consent screen.
2. `/oauth/callback` (public — no JWT available) reads the cookie, calls
   `verify_oauth_state(cookie_value)` to recover the original user_id, and
   clears the cookie via `clear_oauth_state_cookie` once consumed.
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Response
from jose import JWTError, jwt

from app.core.config import settings

_ALGORITHM = "HS256"
_STATE_TTL_MINUTES = 10
_COOKIE_NAME = "oauth_state"


def create_oauth_state(user_id: str, provider: str) -> str:
    """Create a short-lived, signed state token bound to a user and provider."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "provider": provider,
        "nonce": secrets.token_urlsafe(16),
        "purpose": "oauth_state",
        "iat": now,
        "exp": now + timedelta(minutes=_STATE_TTL_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=_ALGORITHM)


def verify_oauth_state(token: str, provider: str) -> str:
    """Verify a state token and return the bound user_id. Raises ValueError on
    any failure (expired, wrong provider, tampered, wrong purpose)."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[_ALGORITHM])
    except JWTError as exc:
        raise ValueError(f"Invalid or expired OAuth state: {exc}")

    if payload.get("purpose") != "oauth_state":
        raise ValueError("OAuth state token has the wrong purpose claim")
    if payload.get("provider") != provider:
        raise ValueError("OAuth state token was issued for a different provider")

    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("OAuth state token is missing a user id")
    return user_id


def set_oauth_state_cookie(response: Response, token: str, secure: bool = True) -> None:
    """`secure=False` must be passed for local HTTP dev — browsers silently
    refuse to store a cookie with the Secure attribute on a non-HTTPS origin,
    which otherwise makes the callback fail with "Missing OAuth state cookie"
    even though /oauth/start appeared to succeed."""
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        max_age=_STATE_TTL_MINUTES * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_oauth_state_cookie(response: Response) -> None:
    response.delete_cookie(key=_COOKIE_NAME, path="/")


def get_oauth_state_cookie_name() -> str:
    return _COOKIE_NAME
