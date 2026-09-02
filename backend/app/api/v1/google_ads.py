"""Google Ads OAuth connect flow + read-only campaign/ad performance routes."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from google.ads.googleads.errors import GoogleAdsException
from pydantic import BaseModel
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
    create_campaign as create_google_campaign,
    pause_campaign as pause_google_campaign,
    enable_campaign as enable_google_campaign,
    add_negative_keywords as add_google_negative_keywords,
    GoogleAdsNotConfigured,
    GoogleAdsConnectionError,
)

router = APIRouter()

PROVIDER = "google-ads"


class CreateCampaignRequest(BaseModel):
    name: str
    daily_budget_micros: int
    keywords: Optional[List[str]] = None
    confirm: bool = False


class NegativeKeywordsRequest(BaseModel):
    keywords: List[str]
    confirm: bool = False


class ConfirmOnlyRequest(BaseModel):
    confirm: bool = False


class SelectAccountRequest(BaseModel):
    customer_id: str


def _require_confirmed(confirm: bool) -> None:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This action requires explicit confirmation. Set confirm=true after showing the user a preview.",
        )


def _require_configured():
    if not settings.google_ads_enabled:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google Ads is not configured on this server (missing client ID/secret/developer token).",
        )


@router.get("/oauth/start")
async def start_oauth(
    request: Request,
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
    set_oauth_state_cookie(response, state, secure=request.url.scheme == "https")
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
    state: str = None,
    error: str = None,
    db: Session = Depends(get_db),
):
    """Public callback — Google redirects the browser here directly, so there's
    no Authorization header. Identity is recovered from the signed `state`
    query parameter Google echoes back (app.core.oauth_state), which is
    itself a JWT signed with our SECRET_KEY — self-verifying (signature +
    expiry + provider binding), so it doesn't depend on the browser actually
    round-tripping the oauth_state cookie set in /oauth/start. The cookie is
    validated as a defense-in-depth match ONLY when present; some browser/dev
    setups (e.g. cross-port localhost during local development) don't reliably
    persist it, so its absence alone must never fail an otherwise-valid,
    signed state."""
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Google OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing authorization code")
    if not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing OAuth state parameter")

    state_cookie = request.cookies.get(get_oauth_state_cookie_name())
    if state_cookie and state_cookie != state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state mismatch between cookie and callback parameter")

    try:
        user_id = verify_oauth_state(state, PROVIDER)
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

    normalized_customer_ids = list(dict.fromkeys(normalize_customer_id(value) for value in customer_ids))
    encrypted_refresh_token = encrypt_token(refresh_token)
    encrypted_access_token = encrypt_token(tokens["access_token"])
    select_required = len(normalized_customer_ids) > 1

    db.query(GoogleAdsConnection).filter(GoogleAdsConnection.user_id == user_id).update(
        {GoogleAdsConnection.is_active: False}, synchronize_session=False
    )
    for customer_id in normalized_customer_ids:
        connection = (
            db.query(GoogleAdsConnection)
            .filter(GoogleAdsConnection.user_id == user_id, GoogleAdsConnection.customer_id == customer_id)
            .first()
        )
        if connection:
            connection.encrypted_refresh_token = encrypted_refresh_token
            connection.encrypted_access_token = encrypted_access_token
            connection.is_active = not select_required
        else:
            db.add(GoogleAdsConnection(
                user_id=user_id,
                customer_id=customer_id,
                encrypted_refresh_token=encrypted_refresh_token,
                encrypted_access_token=encrypted_access_token,
                is_active=not select_required,
            ))
    db.commit()

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    redirect = RedirectResponse(
        url=f"{frontend_url}/google-ads?{'select=1' if select_required else 'connected=1'}"
    )
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


@router.get("/connections")
def list_connections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    connections = (
        db.query(GoogleAdsConnection)
        .filter(GoogleAdsConnection.user_id == current_user.id)
        .order_by(GoogleAdsConnection.customer_id)
        .all()
    )
    return {
        "connections": [
            {
                "customer_id": connection.customer_id,
                "account_name": connection.account_name,
                "selected": connection.is_active,
            }
            for connection in connections
        ]
    }


@router.post("/connection/select")
def select_connection(
    body: SelectAccountRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    customer_id = normalize_customer_id(body.customer_id)
    connection = (
        db.query(GoogleAdsConnection)
        .filter(
            GoogleAdsConnection.user_id == current_user.id,
            GoogleAdsConnection.customer_id == customer_id,
        )
        .first()
    )
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Google Ads account is not available for this user.")

    db.query(GoogleAdsConnection).filter(GoogleAdsConnection.user_id == current_user.id).update(
        {GoogleAdsConnection.is_active: False}, synchronize_session=False
    )
    connection.is_active = True
    db.commit()
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


def _clean_google_ads_error(exc: Exception) -> str:
    """Extract a human-readable message from a GoogleAdsException instead of
    leaking its raw repr (RPC status, debug_error_string, request_id, etc.)
    to the client."""
    try:
        failure = exc.failure  # type: ignore[attr-defined]
        messages = [e.message for e in failure.errors if e.message]
        if messages:
            return "; ".join(messages)
    except AttributeError:
        pass
    return "Google Ads API request failed."


def _google_ads_error_status(exc: Exception) -> int:
    message = _clean_google_ads_error(exc).lower()
    access_errors = (
        "developer token is only approved for use with test accounts",
        "customer account can't be accessed",
        "caller does not have permission",
    )
    if any(fragment in message for fragment in access_errors):
        return status.HTTP_403_FORBIDDEN
    return status.HTTP_502_BAD_GATEWAY


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
    except GoogleAdsException as exc:
        raise HTTPException(status_code=_google_ads_error_status(exc), detail=_clean_google_ads_error(exc))
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
    except GoogleAdsException as exc:
        raise HTTPException(status_code=_google_ads_error_status(exc), detail=_clean_google_ads_error(exc))
    return {"campaign_id": campaign_id, "ads": ads}


# --------------------------------------------------------------------------
# Write actions (Sprint 2). Every route requires an explicit confirm=true in
# the request body -- there is no silent-write path. The frontend is expected
# to show a preview of exactly what will happen before sending confirm=true
# (see GoogleAdsCampaigns.jsx's confirmation modal).
# --------------------------------------------------------------------------

@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CreateCampaignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new Search campaign. Always created PAUSED -- activating it
    is a separate, explicit action (see /campaigns/{id}/enable)."""
    _require_configured()
    _require_confirmed(body.confirm)
    connection = _get_active_connection(db, current_user.id)
    try:
        refresh_token = decrypt_token(connection.encrypted_refresh_token)
        await get_valid_access_token(db, connection)
        result = await create_google_campaign(
            refresh_token,
            connection.customer_id,
            name=body.name,
            daily_budget_micros=body.daily_budget_micros,
            keywords=body.keywords,
        )
    except GoogleAdsConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except GoogleAdsNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except GoogleAdsException as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=_clean_google_ads_error(exc))
    return result


@router.post("/campaigns/{campaign_id}/pause")
async def pause_campaign(
    campaign_id: str,
    body: ConfirmOnlyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_configured()
    _require_confirmed(body.confirm)
    connection = _get_active_connection(db, current_user.id)
    try:
        refresh_token = decrypt_token(connection.encrypted_refresh_token)
        await get_valid_access_token(db, connection)
        result = await pause_google_campaign(refresh_token, connection.customer_id, campaign_id)
    except GoogleAdsConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except GoogleAdsNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except GoogleAdsException as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=_clean_google_ads_error(exc))
    return result


@router.post("/campaigns/{campaign_id}/enable")
async def enable_campaign(
    campaign_id: str,
    body: ConfirmOnlyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Activate a campaign -- the one write action that starts real spend.
    Requires confirm=true like every other write action here."""
    _require_configured()
    _require_confirmed(body.confirm)
    connection = _get_active_connection(db, current_user.id)
    try:
        refresh_token = decrypt_token(connection.encrypted_refresh_token)
        await get_valid_access_token(db, connection)
        result = await enable_google_campaign(refresh_token, connection.customer_id, campaign_id)
    except GoogleAdsConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except GoogleAdsNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except GoogleAdsException as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=_clean_google_ads_error(exc))
    return result


@router.post("/campaigns/{campaign_id}/negative-keywords")
async def add_negative_keywords(
    campaign_id: str,
    body: NegativeKeywordsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_configured()
    _require_confirmed(body.confirm)
    connection = _get_active_connection(db, current_user.id)
    try:
        refresh_token = decrypt_token(connection.encrypted_refresh_token)
        await get_valid_access_token(db, connection)
        result = await add_google_negative_keywords(refresh_token, connection.customer_id, campaign_id, body.keywords)
    except GoogleAdsConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except GoogleAdsNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except GoogleAdsException as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=_clean_google_ads_error(exc))
    return result
