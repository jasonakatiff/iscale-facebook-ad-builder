"""Prepare the database and start the FastAPI application.

The repository's earliest Alembic revision assumes that the application tables
already exist. That works for an existing database but fails on a brand-new
Railway PostgreSQL service. On an empty database, create the current schema
from the SQLAlchemy models and mark it as the Alembic head. Existing databases
continue through the normal migration path.
"""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.database import Base, engine, SessionLocal
from app.core.installation import BOOTSTRAP_LOCK_ID
from app.services.installation import initialize_owner
from init_db import seed_roles_and_permissions


ALEMBIC_CONFIG_PATH = Path(__file__).with_name("alembic.ini")
ALEMBIC_VERSION_TABLE = "alembic_version"


def _alembic_config() -> Config:
    return Config(str(ALEMBIC_CONFIG_PATH))


def bootstrap_database() -> None:
    """Serialize all starts; create/stamp fresh schemas atomically."""
    with engine.connect() as connection:
        connection.execute(text("SELECT pg_advisory_lock(:key)"), {"key": BOOTSTRAP_LOCK_ID})
        connection.commit()
        try:
            with connection.begin():
                tables = set(inspect(connection).get_table_names())
                config = _alembic_config()
                config.attributes["connection"] = connection
                if not tables - {ALEMBIC_VERSION_TABLE}:
                    Base.metadata.create_all(bind=connection)
                    command.stamp(config, "head")
                elif ALEMBIC_VERSION_TABLE not in tables:
                    raise RuntimeError(
                        "The database contains application tables but no alembic_version. "
                        "Refusing to guess its migration history; restore a valid backup or establish a baseline."
                    )
                else:
                    command.upgrade(config, "head")
            seed_roles_and_permissions()
            with SessionLocal.begin() as db:
                initialize_owner(db, os.getenv("ADMIN_EMAIL"), os.getenv("ADMIN_PASSWORD"))
            print("Database and installation are ready", flush=True)
        finally:
            connection.rollback()
            connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": BOOTSTRAP_LOCK_ID})
            connection.commit()


if __name__ == "__main__":
    bootstrap_database()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
    )
