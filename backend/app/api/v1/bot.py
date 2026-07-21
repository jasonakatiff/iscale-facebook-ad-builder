"""Machine-to-machine surface for the dedicated Ads Studio Hermes bot.

This is intentionally REST rather than a second custom agent protocol. The bot
API key can only carry `ads:read` (or a future `ads:draft`) scopes; no endpoint
here can create, enable, pause, publish, or spend against an ad platform.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import require_api_key_scope
from app.database import get_db
from app.models import ApiKey, GoogleAdsConnection, TikTokAdsConnection
from app.api.v1.overview import build_overview

router = APIRouter()


@router.get("/connections")
def list_connections(
    _api_key: ApiKey = Depends(require_api_key_scope("ads:read")),
    db: Session = Depends(get_db),
):
    """Return connection metadata only. OAuth token material never leaves the backend."""
    google = db.query(GoogleAdsConnection).filter(GoogleAdsConnection.is_active.is_(True)).all()
    tiktok = db.query(TikTokAdsConnection).filter(TikTokAdsConnection.is_active.is_(True)).all()
    return {
        "google_ads": [
            {"customer_id": connection.customer_id, "account_name": connection.account_name, "connected_at": connection.created_at}
            for connection in google
        ],
        "tiktok_ads": [
            {"advertiser_id": connection.advertiser_id, "account_name": connection.account_name, "connected_at": connection.created_at}
            for connection in tiktok
        ],
        "capabilities": ["ads:read"],
        "writes_enabled": False,
    }


@router.get("/safety")
def safety_policy(_api_key: ApiKey = Depends(require_api_key_scope("ads:read"))):
    """A machine-readable declaration that the bot cannot spend or publish."""
    return {
        "can_read_performance": True,
        "can_draft_recommendations": False,
        "can_create_campaigns": False,
        "can_pause_campaigns": False,
        "can_enable_campaigns": False,
        "can_spend": False,
        "operator_action_required": "Use the Ads Studio dashboard for any write action after human review.",
    }


@router.get("/overview")
async def read_overview(
    date_preset: str = "last_30d",
    api_key: ApiKey = Depends(require_api_key_scope("ads:read")),
    db: Session = Depends(get_db),
):
    """Read performance associated with the user who issued the bot key."""
    if not api_key.created_by_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This API key is not bound to an owner and cannot read Ads Studio performance.",
        )
    return await build_overview(db, api_key.created_by_user_id, date_preset)
