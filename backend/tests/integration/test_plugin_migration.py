"""Additive plugin schema rehearsal on a disposable local database."""

import importlib.util
import os
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_plugin_migration_preserves_users_and_matches_models():
    url = os.environ["TEST_WORKSPACE_MIGRATION_URL"]
    parsed = urlsplit(url)
    assert parsed.hostname in {"localhost", "127.0.0.1"} and parsed.path.startswith(
        "/test_"
    )
    path = (
        Path(__file__).resolve().parents[2]
        / "alembic/versions/bw_plugins_001_private_library.py"
    )
    spec = importlib.util.spec_from_file_location("test_plugin_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = create_engine(url)
    with engine.connect() as db:
        transaction = db.begin()
        try:
            schema = "test_plugins_" + uuid4().hex
            db.execute(text(f"CREATE SCHEMA {schema}"))
            db.execute(text(f"SET LOCAL search_path TO {schema}"))
            db.execute(text("CREATE TABLE users (id varchar PRIMARY KEY)"))
            db.execute(text("INSERT INTO users VALUES ('test-existing')"))
            with Operations.context(MigrationContext.configure(db)):
                module.upgrade()
                module.upgrade()
            from app.models import Base

            for table in ["plugin_installations", "plugin_runs"]:
                assert {
                    column["name"] for column in inspect(db).get_columns(table)
                } == set(Base.metadata.tables[table].columns.keys())
            assert (
                db.execute(text("SELECT id FROM users")).scalar_one() == "test-existing"
            )
            db.execute(
                text(
                    "INSERT INTO plugin_installations (id,user_id,slug,version,document,package_digest,configuration) VALUES ('test-plugin','test-existing','test-pack','1.0.0','{}','test-digest','{}')"
                )
            )
            db.execute(
                text(
                    "INSERT INTO plugin_runs (id,installation_id,request_id,input_digest,package_digest,inputs,configuration,status,expires_at) VALUES ('test-run','test-plugin','test-request','test-input','test-package','{}','{}','queued',now())"
                )
            )
            db.execute(text("DELETE FROM users WHERE id='test-existing'"))
            assert (
                db.execute(
                    text("SELECT count(*) FROM plugin_installations")
                ).scalar_one()
                == 0
            )
            assert (
                db.execute(text("SELECT count(*) FROM plugin_runs")).scalar_one() == 0
            )
        finally:
            transaction.rollback()
    engine.dispose()
