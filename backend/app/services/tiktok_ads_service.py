"""TikTok Marketing API adapter.

TikTok has no supported Python client in this project, so this module keeps the
HTTP contract in one place. API version/base URL is configurable because TikTok
periodically versions Open API endpoints. OAuth tokens are encrypted by callers
before persistence; this service only handles provider requests.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.token_encryption import decrypt_token, encrypt_token
from app.models import TikTokAdsConnection

TIKTOK_AUTHORIZE_URL = "https://business-api.tiktok.com/portal/auth"
REFRESH_WINDOW = timedelta(minutes=5)


class TikTokAdsNotConfigured(Exception):
    pass


class TikTokAdsApiError(Exception):
    pass


def _require_configured() -> None:
    if not settings.tiktok_ads_enabled:
        raise TikTokAdsNotConfigured(
            "TikTok Ads is not configured. Set TIKTOK_ADS_APP_ID and TIKTOK_ADS_APP_SECRET after "
            "your TikTok for Business developer app receives Marketing API access."
        )


def _url(path: str) -> str:
    return f"{settings.TIKTOK_ADS_API_BASE_URL.rstrip('/')}/{path.lstrip('/')}"


def build_oauth_url(redirect_uri: str, state: str) -> str:
    _require_configured()
    params = {
        'app_id': settings.TIKTOK_ADS_APP_ID,
        'redirect_uri': redirect_uri,
        'state': state,
    }
    return f"{TIKTOK_AUTHORIZE_URL}?{urlencode(params)}"


async def _post(path: str, payload: dict, access_token: Optional[str] = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if access_token:
        headers["Access-Token"] = access_token
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(_url(path), json=payload, headers=headers)
    try:
        body = response.json()
    except ValueError as exc:
        raise TikTokAdsApiError(f"TikTok Ads returned an invalid response (HTTP {response.status_code}).") from exc
    if response.status_code >= 400 or body.get("code") not in (None, 0):
        message = body.get("message") or body.get("msg") or f"HTTP {response.status_code}"
        raise TikTokAdsApiError(f"TikTok Ads API request failed: {message}")
    return body.get("data", body)


async def exchange_code_for_tokens(code: str) -> dict:
    _require_configured()
    return await _post("oauth2/access_token/", {
        "app_id": settings.TIKTOK_ADS_APP_ID,
        "secret": settings.TIKTOK_ADS_APP_SECRET,
        "auth_code": code,
    })


async def refresh_access_token(refresh_token: str) -> dict:
    _require_configured()
    return await _post("oauth2/refresh_token/", {
        "app_id": settings.TIKTOK_ADS_APP_ID,
        "secret": settings.TIKTOK_ADS_APP_SECRET,
        "refresh_token": refresh_token,
    })


async def get_valid_access_token(db: Session, connection: TikTokAdsConnection) -> str:
    _require_configured()
    now = datetime.now(timezone.utc)
    needs_refresh = (
        not connection.encrypted_access_token
        or connection.access_token_expires_at is None
        or connection.access_token_expires_at - now < REFRESH_WINDOW
    )
    if not needs_refresh:
        return decrypt_token(connection.encrypted_access_token)

    refreshed = await refresh_access_token(decrypt_token(connection.encrypted_refresh_token))
    access_token = refreshed.get("access_token")
    if not access_token:
        raise TikTokAdsApiError("TikTok token refresh did not return an access token.")
    connection.encrypted_access_token = encrypt_token(access_token)
    refresh = refreshed.get("refresh_token")
    if refresh:
        connection.encrypted_refresh_token = encrypt_token(refresh)
    expires_in = refreshed.get("expires_in")
    connection.access_token_expires_at = now + timedelta(seconds=int(expires_in)) if expires_in else None
    db.commit()
    return access_token


async def get_campaign_performance(access_token: str, advertiser_id: str, start_date: str, end_date: str) -> list[dict]:
    data = await _post("report/integrated/get/", {
        "advertiser_id": advertiser_id,
        "report_type": "BASIC",
        "data_level": "AUCTION_CAMPAIGN",
        "dimensions": ["campaign_id"],
        "metrics": ["campaign_name", "spend", "impressions", "clicks", "conversion"],
        "start_date": start_date,
        "end_date": end_date,
        "page_size": 100,
    }, access_token)
    return data.get("list", [])


async def create_campaign(access_token: str, advertiser_id: str, name: str, budget: float) -> dict:
    return await _post("campaign/create/", {
        "advertiser_id": advertiser_id,
        "campaign_name": name,
        "objective_type": "PRODUCT_SALES",
        "budget_mode": "BUDGET_MODE_DAY",
        "budget": budget,
        "operation_status": "DISABLE",
    }, access_token)
