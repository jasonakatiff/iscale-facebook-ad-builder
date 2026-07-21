"""Google Ads client wrapper: connection loading (with automatic access-token
refresh, mirroring apps/optima/lib/google-ads-client.ts) and GAQL queries for
campaign/ad performance.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.token_encryption import encrypt_token, decrypt_token
from app.models import GoogleAdsConnection
from app.services.google_ads_oauth import refresh_access_token, GoogleOAuthError

REFRESH_WINDOW = timedelta(minutes=5)


class GoogleAdsNotConfigured(Exception):
    """Raised when GOOGLE_ADS_CLIENT_ID/SECRET/DEVELOPER_TOKEN aren't set."""


class GoogleAdsConnectionError(Exception):
    """Raised when a connection can't be loaded or its token can't be refreshed."""


def _require_configured() -> None:
    if not settings.google_ads_enabled:
        raise GoogleAdsNotConfigured(
            "Google Ads is not configured on this server. Set GOOGLE_ADS_CLIENT_ID, "
            "GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_DEVELOPER_TOKEN."
        )


async def get_valid_access_token(db: Session, connection: GoogleAdsConnection) -> str:
    """Return a valid (non-expired) access token for this connection, refreshing
    and persisting a new one if the current one is expired or about to expire."""
    _require_configured()

    now = datetime.now(timezone.utc)
    needs_refresh = (
        connection.access_token_expires_at is None
        or connection.access_token_expires_at - now < REFRESH_WINDOW
        or not connection.encrypted_access_token
    )

    if not needs_refresh:
        return decrypt_token(connection.encrypted_access_token)

    refresh_token = decrypt_token(connection.encrypted_refresh_token)
    try:
        refreshed = await refresh_access_token(
            refresh_token, settings.GOOGLE_ADS_CLIENT_ID, settings.GOOGLE_ADS_CLIENT_SECRET
        )
    except GoogleOAuthError as exc:
        connection.is_active = False
        db.commit()
        raise GoogleAdsConnectionError(str(exc)) from exc

    access_token = refreshed["access_token"]
    expires_in = refreshed.get("expires_in")
    connection.encrypted_access_token = encrypt_token(access_token)
    connection.access_token_expires_at = (
        now + timedelta(seconds=expires_in) if isinstance(expires_in, (int, float)) else None
    )
    db.commit()
    return access_token


def _build_client(refresh_token: str):
    """Build a google.ads.googleads.client.GoogleAdsClient for one connection."""
    _require_configured()
    from google.ads.googleads.client import GoogleAdsClient

    config = {
        "developer_token": settings.GOOGLE_ADS_DEVELOPER_TOKEN,
        "client_id": settings.GOOGLE_ADS_CLIENT_ID,
        "client_secret": settings.GOOGLE_ADS_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "use_proto_plus": True,
    }
    if settings.GOOGLE_ADS_LOGIN_CUSTOMER_ID:
        config["login_customer_id"] = normalize_login_customer_id(settings.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    return GoogleAdsClient.load_from_dict(config)


def normalize_login_customer_id(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


async def list_accessible_customers(refresh_token: str) -> list[str]:
    """List Google Ads customer IDs accessible to this refresh token."""
    client = _build_client(refresh_token)
    customer_service = client.get_service("CustomerService")
    response = customer_service.list_accessible_customers()
    return [name.split("/")[-1] for name in response.resource_names]


DATE_PRESET_TO_GAQL = {
    "last_7d": "LAST_7_DAYS",
    "last_14d": "LAST_14_DAYS",
    "last_30d": "LAST_30_DAYS",
    "this_month": "THIS_MONTH",
    "last_month": "LAST_MONTH",
}


def _date_clause(date_preset: str, since: Optional[str], until: Optional[str]) -> str:
    if since and until:
        return f"segments.date BETWEEN '{since}' AND '{until}'"
    gaql_preset = DATE_PRESET_TO_GAQL.get(date_preset, "LAST_30_DAYS")
    return f"segments.date DURING {gaql_preset}"


async def get_campaign_performance(
    refresh_token: str,
    customer_id: str,
    date_preset: str = "last_30d",
    since: Optional[str] = None,
    until: Optional[str] = None,
) -> list[dict]:
    """Campaign-level impressions/clicks/cost/conversions via GAQL."""
    client = _build_client(refresh_token)
    ga_service = client.get_service("GoogleAdsService")

    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            campaign.advertising_channel_type,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
        FROM campaign
        WHERE {_date_clause(date_preset, since, until)}
        ORDER BY metrics.cost_micros DESC
        LIMIT 200
    """

    stream = ga_service.search_stream(customer_id=customer_id, query=query)
    campaigns: dict[str, dict] = {}
    for batch in stream:
        for row in batch.results:
            campaign_id = str(row.campaign.id)
            existing = campaigns.setdefault(
                campaign_id,
                {
                    "id": campaign_id,
                    "name": row.campaign.name,
                    "status": row.campaign.status.name,
                    "channel_type": row.campaign.advertising_channel_type.name,
                    "impressions": 0,
                    "clicks": 0,
                    "cost": 0.0,
                    "conversions": 0.0,
                    "conversions_value": 0.0,
                },
            )
            existing["impressions"] += row.metrics.impressions
            existing["clicks"] += row.metrics.clicks
            existing["cost"] += row.metrics.cost_micros / 1_000_000
            existing["conversions"] += row.metrics.conversions
            existing["conversions_value"] += row.metrics.conversions_value

    return list(campaigns.values())


async def get_ad_performance(refresh_token: str, customer_id: str, campaign_id: str) -> list[dict]:
    """Ad-level impressions/clicks/cost for one campaign via GAQL."""
    client = _build_client(refresh_token)
    ga_service = client.get_service("GoogleAdsService")

    query = f"""
        SELECT
            ad_group_ad.ad.id,
            ad_group_ad.ad.name,
            ad_group_ad.status,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions
        FROM ad_group_ad
        WHERE campaign.id = {int(campaign_id)}
        AND segments.date DURING LAST_30_DAYS
        LIMIT 200
    """

    stream = ga_service.search_stream(customer_id=customer_id, query=query)
    ads: dict[str, dict] = {}
    for batch in stream:
        for row in batch.results:
            ad_id = str(row.ad_group_ad.ad.id)
            existing = ads.setdefault(
                ad_id,
                {
                    "id": ad_id,
                    "name": row.ad_group_ad.ad.name or f"Ad {ad_id}",
                    "status": row.ad_group_ad.status.name,
                    "impressions": 0,
                    "clicks": 0,
                    "cost": 0.0,
                    "conversions": 0.0,
                },
            )
            existing["impressions"] += row.metrics.impressions
            existing["clicks"] += row.metrics.clicks
            existing["cost"] += row.metrics.cost_micros / 1_000_000
            existing["conversions"] += row.metrics.conversions

    return list(ads.values())
