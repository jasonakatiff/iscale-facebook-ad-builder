from pathlib import Path
import os
import tempfile

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.installation import REQUIRED_SCHEMA_REVISION
from app.database import SessionLocal
from app.models import InstallationState


def schema_ready(db):
    revision = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    state = db.get(InstallationState, 1)
    return revision == REQUIRED_SCHEMA_REVISION and state is not None and state.initialized


def installation_ready():
    from app.api.v1.uploads import UPLOAD_DIR
    try:
        with SessionLocal() as db:
            if not schema_ready(db):
                return False
        if os.getenv("REQUIRE_PERSISTENT_MEDIA") == "true":
            mount = os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
            if not mount or not UPLOAD_DIR.resolve().is_relative_to(Path(mount).resolve()):
                return False
        with tempfile.TemporaryFile(dir=UPLOAD_DIR) as media:
            media.write(b"ready")
            media.flush()
        return True
    except (SQLAlchemyError, OSError):
        return False
