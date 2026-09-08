"""One-time owner creation and resumable installation progress."""
from datetime import datetime, timezone

from pydantic import ValidationError
from sqlalchemy import text

from app.core.installation import BOOTSTRAP_LOCK_ID, MIN_OWNER_PASSWORD_LENGTH, MAX_OWNER_PASSWORD_BYTES, WORKER_HEARTBEAT_MAX_AGE_SECONDS
from app.core.security import get_password_hash
from app.models import InstallationState, Role, User
from app.schemas.auth import UserCreate


def initialize_owner(db, email, password):
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": BOOTSTRAP_LOCK_ID + 1})
    state = db.get(InstallationState, 1)
    if state and state.initialized:
        return state
    if state is None:
        state = InstallationState(id=1)
        db.add(state)
    if db.query(User.id).first():
        state.initialized = True
        state.setup_status = "complete"
        db.flush()
        return state
    if not email or not password:
        raise RuntimeError("A new installation requires ADMIN_EMAIL and ADMIN_PASSWORD in its Railway install form.")
    if len(password) < MIN_OWNER_PASSWORD_LENGTH or len(password.encode()) > MAX_OWNER_PASSWORD_BYTES:
        raise RuntimeError("ADMIN_PASSWORD must contain at least 12 characters and no more than 72 UTF-8 bytes.")
    try:
        owner_data = UserCreate(email=email.strip(), password=password)
    except ValidationError:
        raise RuntimeError("ADMIN_EMAIL must be a valid email address.") from None
    admin_role = db.query(Role).filter(Role.name == "admin").one()
    owner = User(email=str(owner_data.email), name="Owner", hashed_password=get_password_hash(password),
                 is_superuser=True, is_active=True)
    owner.roles.append(admin_role)
    db.add(owner)
    state.initialized = True
    state.setup_status = "pending"
    state.setup_step = "welcome"
    db.flush()
    return state


def setup_state(db, can_manage):
    from app.services.provider_settings import capabilities
    state = db.get(InstallationState, 1)
    return {
        "installation_id": state.installation_id if state else None,
        "can_manage": can_manage,
        "setup_required": bool(can_manage and state and state.initialized and state.setup_status in {"pending", "in_progress"}),
        "status": state.setup_status if state else "complete",
        "step": state.setup_step if state else "welcome",
        "capabilities": capabilities(db),
        "worker": {
            "last_seen_at": state.worker_heartbeat_at.isoformat() if state and state.worker_heartbeat_at else None,
            "online": bool(state and state.worker_heartbeat_at and
                           (datetime.now(timezone.utc) - state.worker_heartbeat_at).total_seconds() < WORKER_HEARTBEAT_MAX_AGE_SECONDS),
        },
    }


def record_worker_heartbeat(db):
    state = db.get(InstallationState, 1)
    if not state or not state.initialized:
        return False
    state.worker_heartbeat_at = datetime.now(timezone.utc)
    db.commit()
    return True
