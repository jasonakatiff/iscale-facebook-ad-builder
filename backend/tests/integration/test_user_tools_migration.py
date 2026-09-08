import importlib.util
import os
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_user_tools_migration_adds_fields_and_preserves_legacy_key():
    url = os.environ["TEST_WORKSPACE_MIGRATION_URL"]
    parsed = urlsplit(url)
    assert parsed.hostname in {"localhost", "127.0.0.1"} and parsed.path.startswith(
        "/test_"
    )
    engine = create_engine(url)
    module_path = (
        Path(__file__).resolve().parents[2]
        / "alembic/versions/bw_user_api_001_key_lifecycle.py"
    )
    spec = importlib.util.spec_from_file_location(
        "test_user_tools_migration", module_path
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    schema = "test_tools_" + uuid4().hex
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text(f"CREATE SCHEMA {schema}"))
            connection.execute(text(f"SET LOCAL search_path TO {schema}"))
            connection.execute(text("CREATE TABLE users (id varchar PRIMARY KEY)"))
            connection.execute(
                text(
                    "CREATE TABLE api_keys (id varchar PRIMARY KEY, key_hash varchar NOT NULL)"
                )
            )
            connection.execute(
                text("INSERT INTO api_keys VALUES ('test-legacy','test-hash')")
            )
            with Operations.context(MigrationContext.configure(connection)):
                module.upgrade()
                module.upgrade()
            columns = {
                column["name"]: column
                for column in inspect(connection).get_columns("api_keys")
            }
            assert (
                columns["key_prefix"]["nullable"] and columns["expires_at"]["nullable"]
            )
            assert (
                connection.execute(
                    text("SELECT key_hash FROM api_keys WHERE id='test-legacy'")
                ).scalar_one()
                == "test-hash"
            )
            assert "user_themes" in inspect(connection).get_table_names()
            assert (
                inspect(connection).get_foreign_keys("user_themes")[0]["options"][
                    "ondelete"
                ]
                == "CASCADE"
            )
        finally:
            transaction.rollback()
    engine.dispose()
