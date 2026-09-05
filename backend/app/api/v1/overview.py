"""Cross-platform Overview (Sprint 2): merges Meta + Google Ads campaign
performance into one normalized shape for the combined dashboard landing
page. Each platform is fetched independently -- if one isn't connected or
configured, it's silently omitted (reported in `errors`) rather than failing
the whole response, so a user connected to only one platform still gets a
useful page.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from google.ads.googleads.errors import GoogleAdsException
from sqlalchemy.orm import Session

from app.core.deps import get_current_active_user
from app.core.token_encryption import decrypt_token
from app.database import get_db
from app.models import GoogleAdsConnection, MetaAdsConnection, TikTokAdsConnection, User
from app.services.facebook_service import FacebookService
from app.services.google_ads_service import (
    get_campaign_performance,
    get_valid_access_token,
    GoogleAdsConnectionError,
    GoogleAdsNotConfigured,
)
from app.services.tiktok_ads_service import (
    TikTokAdsApiError,
    TikTokAdsNotConfigured,
    get_campaign_performance as get_tiktok_campaign_performance,
    get_valid_access_token as get_valid_tiktok_access_token,
)

router = APIRouter()


def _normalize(platform: str, campaign_name: str, spend: float, impressions: int, clicks: int, conversions: float) -> Dict[str, Any]:
    conversions = conversions or 0.0
    cpa = (spend / conversions) if conversions else None
    return {
        "platform": platform,
        "campaign_name": campaign_name,
        "spend": round(spend or 0.0, 2),
        "impressions": int(impressions or 0),
        "clicks": int(clicks or 0),
        "conversions": round(conversions, 2),
        "cpa": round(cpa, 2) if cpa is not None else None,
    }


def _fetch_meta_rows(db: Session, user_id: str, ad_account_id: Optional[str], date_preset: str) -> List[Dict[str, Any]]:
    # Per-user Meta OAuth connection (Sprint 6): when the user has an active
    # MetaAdsConnection, its decrypted token and selected ad account drive the
    # fetch. The legacy env-token path only remains as a fallback for
    # deployments that never adopted per-user OAuth.
    connection = (
        db.query(MetaAdsConnection)
        .filter(MetaAdsConnection.user_id == user_id, MetaAdsConnection.is_active.is_(True))
        .first()
    )
    if connection is not None:
        service = FacebookService(
            access_token=decrypt_token(connection.encrypted_access_token),
            ad_account_id=connection.ad_account_id,
        )
    else:
        service = FacebookService()
    if not service.api:
        service.initialize()
    if service.ad_account_id is None and ad_account_id:
        service.ad_account_id = ad_account_id
    campaigns = service.get_campaigns(service.ad_account_id)
    rows = []
    for campaign in campaigns:
        insights = service.get_campaign_insights(campaign["id"], date_preset=date_preset)
        rows.append(
            _normalize(
                "meta",
                campaign.get("name") or campaign["id"],
                insights["spend"],
                insights["impressions"],
                insights["clicks"],
                insights["conversions"],
            )
        )
    return rows


async def _fetch_google_rows(db: Session, user_id: str, date_preset: str) -> List[Dict[str, Any]]:
    connection = (
        db.query(GoogleAdsConnection)
        .filter(GoogleAdsConnection.user_id == user_id, GoogleAdsConnection.is_active.is_(True))
        .first()
    )
    if connection is None:
        raise GoogleAdsConnectionError("No connected Google Ads account.")

    refresh_token = decrypt_token(connection.encrypted_refresh_token)
    await get_valid_access_token(db, connection)
    campaigns = await get_campaign_performance(refresh_token, connection.customer_id, date_preset=date_preset)
    return [
        _normalize(
            "google",
            campaign.get("name") or campaign["id"],
            campaign.get("cost", 0.0),
            campaign.get("impressions", 0),
            campaign.get("clicks", 0),
            campaign.get("conversions", 0.0),
        )
        for campaign in campaigns
    ]


async def _fetch_tiktok_rows(db: Session, user_id: str, date_preset: str) -> List[Dict[str, Any]]:
    connection = (
        db.query(TikTokAdsConnection)
        .filter(TikTokAdsConnection.user_id == user_id, TikTokAdsConnection.is_active.is_(True))
        .first()
    )
    if connection is None:
        raise TikTokAdsApiError("No connected TikTok Ads advertiser.")

    # TikTok Reporting API requires literal YYYY-MM-DD dates rather than a
    # Google-style preset constant; reuse the same 30-day default here until
    # the UI passes an explicit TikTok-specific date range.
    from datetime import date, timedelta
    end = date.today()
    start = end - timedelta(days=29 if date_preset == "last_30d" else 6)
    token = await get_valid_tiktok_access_token(db, connection)
    campaigns = await get_tiktok_campaign_performance(token, connection.advertiser_id, start.isoformat(), end.isoformat())
    return [
        _normalize(
            "tiktok",
            campaign.get("campaign_name") or str(campaign.get("campaign_id", "Unknown campaign")),
            float(campaign.get("spend", 0) or 0),
            int(campaign.get("impressions", 0) or 0),
            int(campaign.get("clicks", 0) or 0),
            float(campaign.get("conversion", 0) or 0),
        )
        for campaign in campaigns
    ]


async def build_overview(
    db: Session,
    user_id: str,
    date_preset: str = "last_30d",
    ad_account_id: Optional[str] = None,
):
    """Build normalized cross-platform performance data for one owner.

    Used by the authenticated dashboard and the separately scoped bot API.
    Callers decide authentication; this function never receives provider OAuth
    tokens or exposes them in its result.
    """
    rows: List[Dict[str, Any]] = []
    errors: Dict[str, str] = {}

    try:
        rows.extend(_fetch_meta_rows(db, user_id, ad_account_id, date_preset))
    except Exception as exc:  # Meta config/API errors shouldn't block Google's rows
        # A bare "NoneType ... encode" means no token at all (env fallback empty
        # and no per-user connection) — translate to a user-actionable message
        # instead of surfacing the raw SDK/NoneType traceback text.
        message = str(exc)
        if "NoneType" in message or ("encode" in message and "None" in message):
            message = "No connected Meta Ads account. Connect Meta Ads in Facebook Campaigns first."
        errors["meta"] = message

    try:
        rows.extend(await _fetch_google_rows(db, user_id, date_preset))
    except GoogleAdsConnectionError as exc:
        errors["google"] = str(exc)
    except GoogleAdsNotConfigured as exc:
        errors["google"] = str(exc)
    except GoogleAdsException as exc:
        try:
            errors["google"] = "; ".join(e.message for e in exc.failure.errors)
        except Exception:
            errors["google"] = "Google Ads API error."
    except Exception as exc:
        errors["google"] = str(exc)

    try:
        rows.extend(await _fetch_tiktok_rows(db, user_id, date_preset))
    except (TikTokAdsApiError, TikTokAdsNotConfigured) as exc:
        errors["tiktok"] = str(exc)
    except Exception as exc:
        errors["tiktok"] = str(exc)

    rows.sort(key=lambda row: row["spend"], reverse=True)
    return {"campaigns": rows, "errors": errors}


@router.get("")
async def get_overview(
    ad_account_id: Optional[str] = None,
    date_preset: str = "last_30d",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Combined Meta + Google Ads campaign performance for the logged-in user."""
    return await build_overview(db, current_user.id, date_preset, ad_account_id)
