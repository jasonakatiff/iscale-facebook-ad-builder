import importlib.util
from pathlib import Path
import uuid

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect, text
from app.database import Base
from app.delivery.models import (
    DeliveryJob,
    DeliverySettings,
    DeliverySync,
    ManagedAd,
    AdInsight,
)


def test_additive_migration_and_rollback_preserve_existing_tables(engine):
    migration_path = Path(__file__).parents[2] / "alembic/versions/delivery_20260908.py"
    spec = importlib.util.spec_from_file_location(
        "delivery_migration_test", migration_path
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    delivery = [DeliverySettings, DeliveryJob, ManagedAd, DeliverySync, AdInsight]
    names = {model.__tablename__ for model in delivery}
    schema = "test_delivery_migration_" + uuid.uuid4().hex
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("CREATE SCHEMA " + schema))
            connection.execute(text("SET LOCAL search_path TO " + schema))
            Base.metadata.create_all(
                connection,
                tables=[
                    table
                    for table in Base.metadata.sorted_tables
                    if table.name not in names
                ],
            )
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                migration.upgrade()
            inspector = inspect(connection)
            for model in delivery:
                assert {
                    column["name"]
                    for column in inspector.get_columns(model.__tablename__)
                } == set(model.__table__.columns.keys())
            assert connection.execute(
                text(
                    "SELECT min_interval_seconds, max_read_retries FROM delivery_settings"
                )
            ).one() == (2, 3)
            with Operations.context(context):
                migration.downgrade()
            tables = inspect(connection).get_table_names()
            assert "facebook_ads" in tables and "users" in tables
            assert not names.intersection(tables)
        finally:
            transaction.rollback()
