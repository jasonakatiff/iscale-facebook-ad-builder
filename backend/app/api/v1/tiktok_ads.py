"""TikTok Marketing API OAuth, reporting, and guarded campaign creation."""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_active_user
from app.core.oauth_state import create_oauth_state, verify_oauth_state, set_oauth_state_cookie, get_oauth_state_cookie_name
from app.core.token_encryption import encrypt_token
from app.database import get_db
from app.models import TikTokAdsConnection, User
from app.services.tiktok_ads_service import (
    TikTokAdsApiError,
    TikTokAdsNotConfigured,
    build_oauth_url,
    create_campaign as create_tiktok_campaign,
    exchange_code_for_tokens,
    get_campaign_performance,
    get_valid_access_token,
)

router = APIRouter()
PROVIDER = "tiktok-ads"


class CreateCampaignRequest(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    daily_budget: float = Field(gt=0)
    confirm: bool = False


def _require_configured() -> None:
    if not settings.tiktok_ads_enabled:
        raise HTTPException(status_code=503, detail="TikTok Ads is not configured. Complete TikTok developer app onboarding first.")


def _require_confirmed(confirm: bool) -> None:
    if not confirm:
        raise HTTPException(status_code=400, detail="This action requires explicit confirmation. Set confirm=true after showing a preview.")


def _active_connection(db: Session, user_id: str) -> TikTokAdsConnection:
    connection = db.query(TikTokAdsConnection).filter(
        TikTokAdsConnection.user_id == user_id,
        TikTokAdsConnection.is_active.is_(True),
    ).first()
    if not connection:
        raise HTTPException(status_code=404, detail="No connected TikTok Ads advertiser. Connect one first.")
    return connection


def _date_range(preset: str) -> tuple[str, str]:
    end = date.today()
    if preset == "last_7d":
        start = end - timedelta(days=6)
    elif preset == "last_14d":
        start = end - timedelta(days=13)
    elif preset == "this_month":
        start = end.replace(day=1)
    elif preset == "last_month":
        start = end.replace(day=1) - timedelta(days=1)
        start = start.replace(day=1)
        end = end.replace(day=1) - timedelta(days=1)
    else:
        start = end - timedelta(days=29)
    return start.isoformat(), end.isoformat()


@router.get("/oauth/start")
async def oauth_start(request: Request, response: Response, current_user: User = Depends(get_current_active_user)):
    _require_configured()
    state = create_oauth_state(current_user.id, PROVIDER)
    set_oauth_state_cookie(response, state, secure=request.url.scheme == "https")
    return {"oauth_url": build_oauth_url(settings.TIKTOK_ADS_OAUTH_REDIRECT_URI, state)}


@router.get("/oauth/callback")
async def oauth_callback(request: Request, auth_code: Optional[str] = None, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None, db: Session = Depends(get_db)):
    if error:
        raise HTTPException(status_code=400, detail=f"TikTok OAuth error: {error}")
    authorization_code = auth_code or code
    if not authorization_code or not state:
        raise HTTPException(status_code=400, detail="Missing TikTok OAuth authorization code or state")
    cookie = request.cookies.get(get_oauth_state_cookie_name())
    if cookie and cookie != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch between cookie and callback parameter")
    try:
        user_id = verify_oauth_state(state, PROVIDER)
        tokens = await exchange_code_for_tokens(authorization_code)
    except (ValueError, TikTokAdsApiError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    advertiser_ids = tokens.get("advertiser_ids") or tokens.get("advertiser_id") or []
    if isinstance(advertiser_ids, str):
        advertiser_ids = [advertiser_ids]
    if not advertiser_ids or not tokens.get("refresh_token") or not tokens.get("access_token"):
        raise HTTPException(status_code=400, detail="TikTok OAuth did not return an advertiser and renewable tokens.")
    advertiser_id = str(advertiser_ids[0])
    connection = db.query(TikTokAdsConnection).filter(
        TikTokAdsConnection.user_id == user_id,
        TikTokAdsConnection.advertiser_id == advertiser_id,
    ).first()
    values = {
        "encrypted_refresh_token": encrypt_token(tokens["refresh_token"]),
        "encrypted_access_token": encrypt_token(tokens["access_token"]),
        "is_active": True,
    }
    if connection:
        for key, value in values.items():
            setattr(connection, key, value)
    else:
        connection = TikTokAdsConnection(user_id=user_id, advertiser_id=advertiser_id, **values)
        db.add(connection)
    db.commit()
    return RedirectResponse(url=f"{settings.FRONTEND_URL.rstrip('/')}/tiktok-ads?connected=1")


@router.get("/connection")
def connection_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    connection = db.query(TikTokAdsConnection).filter(
        TikTokAdsConnection.user_id == current_user.id,
        TikTokAdsConnection.is_active.is_(True),
    ).first()
    if not connection:
        return {"connected": False}
    return {"connected": True, "advertiser_id": connection.advertiser_id, "account_name": connection.account_name,
            "connected_at": connection.created_at.isoformat() if connection.created_at else None}


@router.delete("/connection")
def disconnect_connection(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    connection = db.query(TikTokAdsConnection).filter(
        TikTokAdsConnection.user_id == current_user.id,
        TikTokAdsConnection.is_active.is_(True),
    ).first()
    if connection:
        connection.is_active = False
        db.commit()
    return {"message": "Disconnected"}


@router.get("/campaigns")
async def campaigns(date_preset: str = "last_30d", db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_configured()
    connection = _active_connection(db, current_user.id)
    try:
        token = await get_valid_access_token(db, connection)
        start, end = _date_range(date_preset)
        rows = await get_campaign_performance(token, connection.advertiser_id, start, end)
    except (TikTokAdsApiError, TikTokAdsNotConfigured) as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"advertiser_id": connection.advertiser_id, "campaigns": rows}


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
async def create_campaign(body: CreateCampaignRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_configured()
    _require_confirmed(body.confirm)
    connection = _active_connection(db, current_user.id)
    try:
        token = await get_valid_access_token(db, connection)
        return await create_tiktok_campaign(token, connection.advertiser_id, body.name, body.daily_budget)
    except (TikTokAdsApiError, TikTokAdsNotConfigured) as exc:
        raise HTTPException(status_code=502, detail=str(exc))
