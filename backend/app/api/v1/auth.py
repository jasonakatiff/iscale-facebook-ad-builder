from fastapi import APIRouter, Depends, HTTPException, status, Form, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.database import get_db
from app.core.rate_limit import limiter
from app.models import User, RefreshToken, Role
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
)
from app.core.deps import get_current_active_user
from app.schemas.auth import (
    Token,
    TokenRefresh,
    AccessToken,
    UserCreate,
    UserResponse,
    UserLogin,
)

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(
    request: Request,
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Register a new user (admin only)"""
    # Check if current user has admin role or is superuser
    if not current_user.is_superuser and not current_user.has_role("admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create new users"
        )
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        name=user_data.name,
    )

    # Assign default 'viewer' role if it exists
    viewer_role = db.query(Role).filter(Role.name == "viewer").first()
    if viewer_role:
        new_user.roles.append(viewer_role)

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """Login and get access and refresh tokens (OAuth2 form)"""
    user = db.query(User).filter(User.email == username).first()

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Create tokens
    access_token = create_access_token(data={"sub": user.id})
    refresh_token_str, expires_at = create_refresh_token()

    # Store refresh token hash in database (never the raw token)
    refresh_token_obj = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token_str),
        expires_at=expires_at
    )
    db.add(refresh_token_obj)
    db.commit()

    return Token(
        access_token=access_token,
        refresh_token=refresh_token_str
    )


@router.post("/login/json", response_model=Token)
@limiter.limit("5/minute")
async def login_json(request: Request, user_data: UserLogin, db: Session = Depends(get_db)):
    """Login with JSON body and get access and refresh tokens"""
    user = db.query(User).filter(User.email == user_data.email).first()

    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Create tokens
    access_token = create_access_token(data={"sub": user.id})
    refresh_token_str, expires_at = create_refresh_token()

    # Store refresh token hash in database (never the raw token)
    refresh_token_obj = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token_str),
        expires_at=expires_at
    )
    db.add(refresh_token_obj)
    db.commit()

    return Token(
        access_token=access_token,
        refresh_token=refresh_token_str
    )


@router.post("/refresh", response_model=Token)
@limiter.limit("10/minute")
async def refresh_token(request: Request, token_data: TokenRefresh, db: Session = Depends(get_db)):
    """Get new access and refresh tokens using a refresh token (rolling refresh)"""
    # Find the refresh token by its hash
    refresh_token_obj = db.query(RefreshToken).filter(
        RefreshToken.token_hash == hash_refresh_token(token_data.refresh_token)
    ).first()

    if not refresh_token_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    # Check if token is expired
    if refresh_token_obj.expires_at < datetime.now(timezone.utc):
        # Delete expired token
        db.delete(refresh_token_obj)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired"
        )

    # Check if user is still active
    user = db.query(User).filter(User.id == refresh_token_obj.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Delete old refresh token
    db.delete(refresh_token_obj)

    # Create new tokens
    access_token = create_access_token(data={"sub": user.id})
    new_refresh_token_str, expires_at = create_refresh_token()

    # Store new refresh token hash
    new_refresh_token_obj = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(new_refresh_token_str),
        expires_at=expires_at
    )
    db.add(new_refresh_token_obj)
    db.commit()

    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token_str
    )


@router.post("/logout")
async def logout(
    token_data: TokenRefresh,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Logout by invalidating the refresh token"""
    # Find and delete the refresh token by its hash
    refresh_token_obj = db.query(RefreshToken).filter(
        RefreshToken.token_hash == hash_refresh_token(token_data.refresh_token),
        RefreshToken.user_id == current_user.id
    ).first()

    if refresh_token_obj:
        db.delete(refresh_token_obj)
        db.commit()

    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user information"""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update current user's profile"""
    # Check if email is being changed and if it's already taken
    if user_update.email and user_update.email != current_user.email:
        existing = db.query(User).filter(User.email == user_update.email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        current_user.email = user_update.email

    if user_update.name is not None:
        current_user.name = user_update.name

    if user_update.password:
        current_user.hashed_password = get_password_hash(user_update.password)

    db.commit()
    db.refresh(current_user)

    return current_user
