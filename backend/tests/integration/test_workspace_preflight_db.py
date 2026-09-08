"""Read-only preflight against real isolated PostgreSQL."""

import os
from uuid import uuid4

from sqlalchemy import text

from scripts.workspace_preflight import EXPECTED_REVISION, check_database


def test_database_preflight_forces_read_only_and_reports_revision(db_session):
    url = os.environ["DATABASE_URL"]
    assert "127.0.0.1" in url or "localhost" in url
    assert "/test_" in url
    with db_session.bind.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE IF NOT EXISTS alembic_version (version_num varchar(64) PRIMARY KEY)"
            )
        )
        connection.execute(text("DELETE FROM alembic_version"))
        connection.execute(
            text("INSERT INTO alembic_version VALUES (:revision)"),
            {"revision": EXPECTED_REVISION},
        )
    checks = check_database(url)
    assert checks["passed"] is True
    assert checks["read_only"] is True
    assert checks["revision"] == [EXPECTED_REVISION]


def test_pre_migration_database_fails_without_creating_tables(db_session):
    schema = "test_preflight_" + uuid4().hex
    with db_session.bind.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        url = db_session.bind.url.set(
            query={"options": f"-csearch_path={schema}"}
        ).render_as_string(hide_password=False)
        result = check_database(url)
        assert not result["passed"]
        assert "workspaces" in result["missing_tables"]
        with db_session.bind.connect() as connection:
            count = connection.execute(
                text(
                    "SELECT count(*) FROM information_schema.tables WHERE table_schema=:schema"
                ),
                {"schema": schema},
            ).scalar_one()
            assert count == 0
    finally:
        with db_session.bind.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}"'))
