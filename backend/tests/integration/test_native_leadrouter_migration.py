import importlib.util
import os
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_native_migration_preserves_users_and_private_cascade():
    url = os.environ["TEST_WORKSPACE_MIGRATION_URL"]
    parsed = urlsplit(url)
    assert parsed.hostname in {"localhost", "127.0.0.1"} and parsed.path.startswith(
        "/test_"
    )
    path = (
        Path(__file__).resolve().parents[2]
        / "alembic/versions/bw_leadrouter_001_native_connection.py"
    )
    spec = importlib.util.spec_from_file_location("test_native_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = create_engine(url)
    with engine.connect() as db:
        transaction = db.begin()
        try:
            schema = "test_native_" + uuid4().hex
            db.execute(text(f"CREATE SCHEMA {schema}"))
            db.execute(text(f"SET LOCAL search_path TO {schema}"))
            db.execute(text("CREATE TABLE users (id varchar PRIMARY KEY)"))
            db.execute(text("INSERT INTO users VALUES ('test-existing')"))
            with Operations.context(MigrationContext.configure(db)):
                module.upgrade()
                module.upgrade()
            assert (
                db.execute(text("SELECT id FROM users")).scalar_one() == "test-existing"
            )
            from app.models import Base

            for table in ["leadrouter_connections", "leadrouter_defaults"]:
                assert {
                    column["name"] for column in inspect(db).get_columns(table)
                } == set(Base.metadata.tables[table].columns.keys())
            db.execute(
                text(
                    "INSERT INTO leadrouter_connections (id,user_id,account_type,account_name,encrypted_api_key) VALUES ('test-connection','test-existing','partner','test-account','test-ciphertext')"
                )
            )
            db.execute(
                text(
                    "INSERT INTO leadrouter_defaults (id,connection_id,resource_type,resource_id,campaign_id,campaign) VALUES ('test-default','test-connection','brand','test-brand','test-campaign','{}')"
                )
            )
            db.execute(text("DELETE FROM users WHERE id='test-existing'"))
            assert (
                db.execute(
                    text("SELECT count(*) FROM leadrouter_connections")
                ).scalar_one()
                == 0
            )
            assert (
                db.execute(
                    text("SELECT count(*) FROM leadrouter_defaults")
                ).scalar_one()
                == 0
            )
        finally:
            transaction.rollback()
    engine.dispose()
