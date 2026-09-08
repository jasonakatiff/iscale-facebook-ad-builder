import importlib.util
import uuid
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text, inspect

from app.database import Base
from app.creatives.models import CreativeAsset, CreativeEvent


def test_creative_upgrade_backfills_without_inventing_users_and_downgrades(engine):
    path = Path(__file__).parents[2] / "alembic/versions/creatives_20260910.py"
    spec = importlib.util.spec_from_file_location("test_creative_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    schema = "test_creative_migration_" + uuid.uuid4().hex
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("CREATE SCHEMA " + schema))
            connection.execute(text("SET LOCAL search_path TO " + schema))
            Base.metadata.create_all(connection, tables=[table for table in Base.metadata.sorted_tables if not table.name.startswith("analytics_")])
            for table in ["delivery_jobs", "managed_ads"]:
                connection.execute(
                    text(
                        f"ALTER TABLE {table} DROP COLUMN creative_asset_id, DROP COLUMN creative_snapshot"
                    )
                )
            connection.execute(text("DROP TABLE creative_events"))
            connection.execute(text("DROP TABLE creative_assets"))
            for table in [
                "generated_ads",
                "facebook_campaigns",
                "facebook_adsets",
                "facebook_ads",
            ]:
                connection.execute(
                    text(f"ALTER TABLE {table} DROP COLUMN created_by_id")
                )
            connection.execute(
                text("ALTER TABLE generated_ads DROP COLUMN generation_context")
            )
            connection.execute(
                text(
                    "INSERT INTO generated_ads (id, image_url, media_type, headline) VALUES ('test-historic', 'https://example.com/test.png', 'image', 'test-historic')"
                )
            )
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            row = connection.execute(
                text(
                    "SELECT source_type, created_by_id, registered_by_id, analysis_status, generation_context FROM creative_assets"
                )
            ).one()
            assert row[:4] == ("system_generated", None, None, "pending")
            assert row[4]["template_id"] is None
            for model in [CreativeAsset, CreativeEvent]:
                assert {
                    column["name"]
                    for column in inspect(connection).get_columns(model.__tablename__)
                } == set(model.__table__.columns.keys())
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert (
                connection.execute(text("SELECT id FROM generated_ads")).scalar_one()
                == "test-historic"
            )
            assert "creative_assets" not in inspect(connection).get_table_names()
        finally:
            transaction.rollback()
