from typing import Callable, List, Optional
import hashlib
from datetime import datetime, timezone
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, ApiKey
from app.core.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated user from the JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get the current user and verify they are active"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


def require_role(role_name: str) -> Callable:
    """Dependency that requires the user to have a specific role"""
    async def role_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        if not current_user.has_role(role_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role_name}' required"
            )
        return current_user
    return role_checker


def require_any_role(role_names: List[str]) -> Callable:
    """Dependency that requires the user to have at least one of the specified roles"""
    async def role_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        if not any(current_user.has_role(role) for role in role_names):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of these roles required: {', '.join(role_names)}"
            )
        return current_user
    return role_checker


def require_permission(permission_name: str) -> Callable:
    """Dependency that requires the user to have a specific permission"""
    async def permission_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        if not current_user.has_permission(permission_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission_name}' required"
            )
        return current_user
    return permission_checker


async def get_current_superuser(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Require the current user to be a superuser"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser access required"
        )
    return current_user


# Optional auth - returns None if not authenticated
async def get_optional_user(
    token: Optional[str] = Depends(OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)),
    db: Session = Depends(get_db)
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
        authorization: Optional[str] = Header(None),
        db: Session = Depends(get_db),
    ) -> ApiKey:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing bearer API key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raw_key = authorization[len("Bearer "):].strip()
        key_hash = _hash_api_key(raw_key)
        api_key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).first()
        if api_key is None or api_key.revoked_at is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key")
        if required_scope not in (api_key.scopes or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key is missing the required scope: {required_scope}",
            )
        api_key.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return api_key
    return checker
