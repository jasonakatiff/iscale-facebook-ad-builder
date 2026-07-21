"""Google Ads OAuth connect flow + read-only campaign/ad performance routes."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_active_user
from app.core.oauth_state import (
    create_oauth_state,
    verify_oauth_state,
    set_oauth_state_cookie,
    clear_oauth_state_cookie,
    get_oauth_state_cookie_name,
)
from app.core.token_encryption import encrypt_token, decrypt_token
from app.database import get_db
from app.models import GoogleAdsConnection, User
from app.services.google_ads_oauth import (
    build_oauth_url,
    exchange_code_for_tokens,
    normalize_customer_id,
    GoogleOAuthError,
)
from app.services.google_ads_service import (
    list_accessible_customers,
    get_campaign_performance,
    get_ad_performance,
    get_valid_access_token,
    GoogleAdsNotConfigured,
    GoogleAdsConnectionError,
)

router = APIRouter()

PROVIDER = "google-ads"


def _require_configured():
    if not settings.google_ads_enabled:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google Ads is not configured on this server (missing client ID/secret/developer token).",
        )


@router.get("/oauth/start")
async def start_oauth(
    response: Response,
    current_user: User = Depends(get_current_active_user),
):
    """Return the Google consent-screen URL for the frontend to navigate to.

    This is a normal authenticated JSON fetch, not a redirect the browser
    follows directly — a full-page navigation can't carry an Authorization
    header, and putting the JWT in a query string would leak it into server
    logs/browser history. The frontend calls this, gets the URL back, then
    does the actual `window.location.href = url` navigation itself.
    """
    _require_configured()
    state = create_oauth_state(current_user.id, PROVIDER)
    set_oauth_state_cookie(response, state)
    return {
        "oauth_url": build_oauth_url(
            client_id=settings.GOOGLE_ADS_CLIENT_ID,
            redirect_uri=settings.GOOGLE_ADS_OAUTH_REDIRECT_URI,
            state=state,
        )
    }


@router.get("/oauth/callback")
async def oauth_callback(
    request: Request,
    code: str = None,
    error: str = None,
    db: Session = Depends(get_db),
):
    """Public callback — Google redirects the browser here directly, so there's
    no Authorization header. Identity is recovered from the signed state
    cookie set in /oauth/start (app.core.oauth_state), not a JWT."""
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Google OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing authorization code")

    state_cookie = request.cookies.get(get_oauth_state_cookie_name())
    if not state_cookie:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing OAuth state cookie")

    try:
        user_id = verify_oauth_state(state_cookie, PROVIDER)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    try:
        tokens = await exchange_code_for_tokens(
            code=code,
            client_id=settings.GOOGLE_ADS_CLIENT_ID,
            client_secret=settings.GOOGLE_ADS_CLIENT_SECRET,
            redirect_uri=settings.GOOGLE_ADS_OAUTH_REDIRECT_URI,
        )
    except GoogleOAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        # Google only returns a refresh_token on the FIRST consent; if the user
        # already granted access before, they must revoke it at
        # myaccount.google.com/permissions and reconnect to get a new one.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google did not return a refresh token. Revoke prior access at "
            "https://myaccount.google.com/permissions and try connecting again.",
        )

    try:
        customer_ids = await list_accessible_customers(refresh_token)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to list Google Ads accounts: {exc}")

    if not customer_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No accessible Google Ads accounts found for this login.")

    customer_id = normalize_customer_id(customer_ids[0])

    existing = (
        db.query(GoogleAdsConnection)
        .filter(GoogleAdsConnection.user_id == user_id, GoogleAdsConnection.customer_id == customer_id)
        .first()
    )
    if existing:
        existing.encrypted_refresh_token = encrypt_token(refresh_token)
        existing.encrypted_access_token = encrypt_token(tokens["access_token"])
        existing.is_active = True
    else:
        existing = GoogleAdsConnection(
            user_id=user_id,
            customer_id=customer_id,
            encrypted_refresh_token=encrypt_token(refresh_token),
            encrypted_access_token=encrypt_token(tokens["access_token"]),
        )
        db.add(existing)
    db.commit()

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    redirect = RedirectResponse(url=f"{frontend_url}/google-ads?connected=1")
    clear_oauth_state_cookie(redirect)
    return redirect


@router.get("/connection")
def get_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Current user's Google Ads connection status, for the ConnectAccountCard."""
    connection = (
        db.query(GoogleAdsConnection)
        .filter(GoogleAdsConnection.user_id == current_user.id, GoogleAdsConnection.is_active.is_(True))
        .first()
    )
    if not connection:
        return {"connected": False}
    return {
        "connected": True,
        "customer_id": connection.customer_id,
        "account_name": connection.account_name,
        "connected_at": connection.created_at.isoformat() if connection.created_at else None,
    }


@router.delete("/connection")
def disconnect(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    connection = (
        db.query(GoogleAdsConnection)
        .filter(GoogleAdsConnection.user_id == current_user.id, GoogleAdsConnection.is_active.is_(True))
        .first()
    )
    if connection:
        connection.is_active = False
        db.commit()
    return {"message": "Disconnected"}


def _get_active_connection(db: Session, user_id: str) -> GoogleAdsConnection:
    connection = (
        db.query(GoogleAdsConnection)
        .filter(GoogleAdsConnection.user_id == user_id, GoogleAdsConnection.is_active.is_(True))
        .first()
    )
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No connected Google Ads account. Connect one first.")
    return connection


@router.get("/campaigns")
async def get_campaigns(
    date_preset: str = "last_30d",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Campaign performance for the current user's connected account."""
    _require_configured()
    connection = _get_active_connection(db, current_user.id)
    try:
        refresh_token = decrypt_token(connection.encrypted_refresh_token)
        await get_valid_access_token(db, connection)  # refreshes+persists if needed
        campaigns = await get_campaign_performance(refresh_token, connection.customer_id, date_preset=date_preset)
    except GoogleAdsConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except GoogleAdsNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    return {"customer_id": connection.customer_id, "campaigns": campaigns}


@router.get("/campaigns/{campaign_id}/ads")
async def get_campaign_ads(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Ad-level performance for a single campaign."""
    _require_configured()
    connection = _get_active_connection(db, current_user.id)
    try:
        refresh_token = decrypt_token(connection.encrypted_refresh_token)
        await get_valid_access_token(db, connection)
        ads = await get_ad_performance(refresh_token, connection.customer_id, campaign_id)
    except GoogleAdsConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except GoogleAdsNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    return {"campaign_id": campaign_id, "ads": ads}
