from typing import Callable, List, Optional
import hashlib
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import (
    APIKeyHeader,
    HTTPBearer,
    HTTPAuthorizationCredentials,
    OAuth2PasswordBearer,
)
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, ApiKey
from app.core.security import decode_access_token
from app.telemetry.runtime import trace_context

bearer_scheme = HTTPBearer(
    scheme_name="BreadWinnerBearer",
    auto_error=False,
    description="Bearer session JWT or user API key (bw_live_…). API keys inherit the issuing user's current roles and workspace access. platform:read permits reads; platform:write also permits changes, including publishing where authorized. Manage keys using a browser session.",
)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise credentials_exception
    token = credentials.credentials
    if token.startswith("bw_live_"):
        api_key = (
            db.query(ApiKey).filter(ApiKey.key_hash == _hash_api_key(token)).first()
        )
        now = datetime.now(timezone.utc)
        if (
            api_key is None
            or api_key.revoked_at is not None
            or api_key.expires_at is None
            or api_key.expires_at <= now
            or not api_key.created_by_user_id
        ):
            raise credentials_exception
        scopes = set(api_key.scopes or [])
        telemetry_path = request.url.path.startswith("/api/v1/telemetry/")
        if "platform:read" not in scopes and not (
            telemetry_path and "telemetry:read" in scopes
        ):
            raise HTTPException(
                status_code=403, detail="A platform API key is required"
            )
        user = db.query(User).filter(User.id == api_key.created_by_user_id).first()
        if user is None or not user.is_active:
            raise credentials_exception
        if "telemetry:read" in scopes and not user.has_role("admin"):
            raise HTTPException(
                status_code=403,
                detail="Administrator access required for diagnostics keys",
            )
        if (
            request.url.path.startswith("/api/v1/auth/")
            and request.url.path != "/api/v1/auth/me"
        ) or "/oauth/" in request.url.path:
            raise HTTPException(
                status_code=403,
                detail="Sign in through the browser for account and OAuth actions",
            )
        if (
            request.method not in {"GET", "HEAD", "OPTIONS"}
            and "platform:write" not in scopes
            and not (
                request.url.path == "/api/v1/telemetry/feedback"
                and "feedback:write" in scopes
            )
        ):
            raise HTTPException(status_code=403, detail="This API key is read-only")
        request.state.api_key_id = api_key.id
        request.state.api_key_scopes = scopes
        if (
            api_key.last_used_at is None
            or (now - api_key.last_used_at).total_seconds() >= 60
        ):
            api_key.last_used_at = now
            db.commit()
        return user
    payload = decode_access_token(token)
    if payload is None or not payload.get("sub"):
        raise credentials_exception
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get the current user and verify they are active"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user"
        )
    context = trace_context.get()
    if context is not None:
        context["user_id"] = current_user.id
    return current_user


async def get_browser_user(
    request: Request,
    current_user: User = Depends(get_current_active_user),
) -> User:
    if getattr(request.state, "api_key_id", None):
        raise HTTPException(
            status_code=403, detail="Sign in through the browser to manage API keys"
        )
    return current_user


def require_role(role_name: str) -> Callable:
    """Dependency that requires the user to have a specific role"""

    async def role_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if not current_user.has_role(role_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role_name}' required",
            )
        return current_user

    return role_checker


def require_any_role(role_names: List[str]) -> Callable:
    """Dependency that requires the user to have at least one of the specified roles"""

    async def role_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if not any(current_user.has_role(role) for role in role_names):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of these roles required: {', '.join(role_names)}",
            )
        return current_user

    return role_checker


def require_permission(permission_name: str) -> Callable:
    """Dependency that requires the user to have a specific permission"""

    async def permission_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if not current_user.has_permission(permission_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission_name}' required",
            )
        return current_user

    return permission_checker


async def get_current_superuser(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Require the current user to be a superuser"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Superuser access required"
        )
    return current_user


# Optional auth - returns None if not authenticated
async def get_optional_user(
    token: Optional[str] = Depends(
        OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
    ),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Get the current user if authenticated, otherwise return None"""
    if token is None:
        return None

    payload = decode_access_token(token)
    if payload is None:
        return None

    user_id: str = payload.get("sub")
    if user_id is None:
        return None

    user = db.query(User).filter(User.id == user_id).first()
    return user


def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def require_api_key_scope(required_scope: str) -> Callable:
    """Dependency for machine-to-machine callers (e.g. the Hermes Telegram bot).
    Validates `Authorization: Bearer <key>` against the stored hash, rejects
    revoked keys, and enforces the route's required scope.

    Only "ads:read" and "ads:draft" are ever valid scopes for bot-issued keys.
    "ads:publish" / "ads:spend" do not exist as grantable scopes — this is
    enforced here in code, not left to the bot's persona/prompt text alone.
    """

    async def checker(
        authorization: Optional[str] = Depends(
            APIKeyHeader(
                name="Authorization",
                scheme_name="LegacyBotKey",
                auto_error=False,
                description="Legacy bot key supplied as Bearer ads_studio_...; user platform keys do not grant bot scopes.",
            )
        ),
        db: Session = Depends(get_db),
    ) -> ApiKey:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing bearer API key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raw_key = authorization[len("Bearer ") :].strip()
        key_hash = _hash_api_key(raw_key)
        api_key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).first()
        if api_key is None or api_key.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or revoked API key",
            )
        if required_scope not in (api_key.scopes or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key is missing the required scope: {required_scope}",
            )
        api_key.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return api_key

    return checker
