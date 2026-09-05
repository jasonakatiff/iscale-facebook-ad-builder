"""Pure helpers for the Google Ads OAuth flow. Ported from the working
TypeScript implementation at apps/optima/lib/google-ads-oauth.ts in the
nalarin monorepo (same shape, adapted to Python/httpx). State/CSRF handling
uses the shared app.core.oauth_state (not a bespoke encrypted-state cookie
like the TS version) since that's the mechanism Sprint 0 built for every
platform's OAuth flow to share.
"""
from urllib.parse import urlencode
from typing import Optional

import httpx

GOOGLE_ADS_OAUTH_SCOPE = "https://www.googleapis.com/auth/adwords"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def normalize_customer_id(value: str) -> str:
    """Strip non-digits from a Google Ads customer ID (e.g. "123-456-7890" -> "1234567890")."""
    return "".join(ch for ch in value if ch.isdigit())[:10]


def build_oauth_url(client_id: str, redirect_uri: str, state: str) -> str:
    """Build the Google OAuth authorization URL the user is redirected to."""
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_ADS_OAUTH_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


class GoogleOAuthError(Exception):
    pass


async def exchange_code_for_tokens(
    code: str, client_id: str, client_secret: str, redirect_uri: str
) -> dict:
    """Exchange an authorization code for access + refresh tokens."""
    body = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=30) as http:
        response = await http.post(GOOGLE_TOKEN_URL, data=body)
    data = response.json()
    if response.status_code != 200 or data.get("error"):
        message = data.get("error_description") or data.get("error") or f"HTTP {response.status_code}"
        raise GoogleOAuthError(f"Google token exchange failed: {message}")
    if not data.get("access_token"):
        raise GoogleOAuthError("Google token exchange did not return an access token.")
    return data


async def refresh_access_token(refresh_token: str, client_id: str, client_secret: str) -> dict:
    """Exchange a refresh token for a new access token."""
    body = {
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=30) as http:
        response = await http.post(GOOGLE_TOKEN_URL, data=body)
    data = response.json()
    if response.status_code != 200 or data.get("error"):
        message = data.get("error_description") or data.get("error") or f"HTTP {response.status_code}"
        raise GoogleOAuthError(f"Google token refresh failed: {message}")
    if not data.get("access_token"):
        raise GoogleOAuthError("Google token refresh did not return an access token.")
    return data


def get_oauth_redirect_uri(configured_uri: str, request_base_url: Optional[str] = None) -> str:
    """Prefer the explicitly configured redirect URI (must match what's
    registered in Google Cloud Console exactly); fall back to deriving one
    from the current request only for local dev convenience."""
    if configured_uri:
        return configured_uri
    base = (request_base_url or "http://localhost:8000").rstrip("/")
    return f"{base}/api/v1/google-ads/oauth/callback"
