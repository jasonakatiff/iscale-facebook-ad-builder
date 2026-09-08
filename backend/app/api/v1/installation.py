from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, SecretStr, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_browser_user, get_current_active_user
from app.core.installation import InstallationError
from app.core.rate_limit import limiter
from app.database import get_db
from app.models import InstallationState, User
from app.services.installation import setup_state
from app.services import provider_settings

router = APIRouter()


def can_manage(user):
    return user.is_superuser or user.has_role("admin")


def installation_admin(user: User = Depends(get_browser_user)):
    if not can_manage(user):
        raise InstallationError("admin_required", "Only an installation administrator can manage service connections.", 403)
    return user


class ProviderKey(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    api_key: SecretStr

    @field_validator("api_key")
    @classmethod
    def valid_key(cls, value):
        key = value.get_secret_value().strip()
        if not 8 <= len(key) <= 512 or any(character.isspace() for character in key):
            raise ValueError("Paste the complete API key without spaces.")
        return SecretStr(key)


class SetupProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step: Literal["welcome", "providers", "brand", "create"]
    status: Literal["in_progress", "deferred", "complete"] = "in_progress"


@router.get("")
def read_installation(response: Response, db: Session = Depends(get_db), user: User = Depends(get_current_active_user)):
    response.headers["Cache-Control"] = "no-store"
    return setup_state(db, can_manage(user))


@router.patch("")
def update_progress(payload: SetupProgress, db: Session = Depends(get_db), user: User = Depends(installation_admin)):
    state = db.get(InstallationState, 1)
    if state is None or not state.initialized:
        raise InstallationError("installation_not_initialized", "Installation startup has not finished. Contact the installation owner.", 503)
    state.setup_status = payload.status
    state.setup_step = payload.step
    db.commit()
    return setup_state(db, True)


@router.get("/providers")
def list_providers(response: Response, db: Session = Depends(get_db), user: User = Depends(installation_admin)):
    response.headers["Cache-Control"] = "no-store"
    return {"data": [provider_settings.provider_view(name, db) for name in provider_settings.PROVIDERS],
            "pagination": {"total": 3, "limit": 3, "offset": 0, "hasMore": False}}


@router.put("/providers/{provider}")
@limiter.limit("20/minute")
def save_key(request: Request, provider: str, payload: ProviderKey, db: Session = Depends(get_db), user: User = Depends(installation_admin)):
    return provider_settings.save_provider_key(db, provider, payload.api_key.get_secret_value(), user.id)


@router.delete("/providers/{provider}")
def disconnect(provider: str, db: Session = Depends(get_db), user: User = Depends(installation_admin)):
    return provider_settings.save_provider_key(db, provider, None, user.id)


@router.post("/providers/{provider}/test")
@limiter.limit("10/minute")
async def test_connection(request: Request, provider: str, db: Session = Depends(get_db), user: User = Depends(installation_admin)):
    return await provider_settings.test_provider_connection(db, provider)
