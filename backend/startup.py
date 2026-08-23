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
from sqlalchemy import inspect

from app.database import engine
from init_db import create_superuser, init_db, seed_roles_and_permissions


ALEMBIC_CONFIG_PATH = Path(__file__).with_name("alembic.ini")
ALEMBIC_VERSION_TABLE = "alembic_version"


def _alembic_config() -> Config:
    return Config(str(ALEMBIC_CONFIG_PATH))


def _create_configured_admin() -> None:
    """Create the configured first admin account, if credentials are present."""
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if admin_email and admin_password:
        create_superuser(admin_email, admin_password)
    else:
        print("ADMIN_EMAIL and ADMIN_PASSWORD are not set; skipping admin creation")


def bootstrap_database() -> None:
    """Initialize a fresh database or migrate an existing one safely."""
    tables = set(inspect(engine).get_table_names())
    application_tables = tables - {ALEMBIC_VERSION_TABLE}

    if not application_tables:
        print("Empty database detected; creating the current application schema")
        init_db()
        seed_roles_and_permissions()
        _create_configured_admin()

        # The schema was created from the current models, so mark all existing
        # migrations as applied. Future deployments can use normal upgrades.
        command.stamp(_alembic_config(), "head")
        print("Fresh database initialized and stamped at Alembic head")
        return

    if ALEMBIC_VERSION_TABLE not in tables:
        raise RuntimeError(
            "The database contains application tables but no alembic_version "
            "table. Refusing to guess its migration history; restore a valid "
            "backup or establish a migration baseline before deploying."
        )

    print("Existing database detected; applying Alembic migrations")
    command.upgrade(_alembic_config(), "head")
    seed_roles_and_permissions()
    _create_configured_admin()


if __name__ == "__main__":
    bootstrap_database()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
    )
