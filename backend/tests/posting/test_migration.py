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
    DeliveryPostAttempt,
    DeliveryNotification,
    ApiRequest,
    ApiCooldown,
    ProviderCache,
    StagedInsight,
)


def test_additive_migration_and_rollback_preserve_existing_tables(engine):
    migration_path = Path(__file__).parents[2] / "alembic/versions/delivery_20260908.py"
    spec = importlib.util.spec_from_file_location(
        "delivery_migration_test", migration_path
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    recovery_spec = importlib.util.spec_from_file_location(
        "delivery_recovery_migration_test",
        migration_path.with_name("delivery_recovery_20260908.py"),
    )
    recovery = importlib.util.module_from_spec(recovery_spec)
    recovery_spec.loader.exec_module(recovery)
    delivery = [
        DeliverySettings,
        DeliveryJob,
        ManagedAd,
        DeliverySync,
        AdInsight,
        DeliveryPostAttempt,
        DeliveryNotification,
        ApiRequest,
        ApiCooldown,
        ProviderCache,
        StagedInsight,
    ]
    extra = [ApiRequest, ApiCooldown, ProviderCache, StagedInsight]
    controls_spec = importlib.util.spec_from_file_location(
        "delivery_controls_migration_test",
        migration_path.with_name("delivery_controls_20260909.py"),
    )
    controls = importlib.util.module_from_spec(controls_spec)
    controls_spec.loader.exec_module(controls)
    names = {model.__tablename__ for model in delivery + extra}
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
                    if table.name not in names and not table.name.startswith("analytics_")
                ],
            )
            connection.execute(
                text("ALTER TABLE account_sync_jobs DROP COLUMN available_at")
            )
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                migration.upgrade()
                connection.execute(
                    text(
                        "INSERT INTO delivery_jobs (id,request_key,request_hash,account_id,name,kind,payload,post_started_at) VALUES ('test-legacy-attempt','test-key','test-hash','act_123','test-legacy','ad','{}',now())"
                    )
                )
                recovery.upgrade()
                controls.upgrade()
            assert (
                connection.execute(
                    text("SELECT job_id FROM delivery_post_attempts")
                ).scalar_one()
                == "test-legacy-attempt"
            )
            assert (
                connection.execute(
                    text("SELECT max_post_retries FROM delivery_settings")
                ).scalar_one()
                == 3
            )
            assert (
                connection.execute(
                    text("SELECT retry_allowed FROM delivery_jobs")
                ).scalar_one()
                is False
            )
            inspector = inspect(connection)
            for model in delivery + extra:
                assert {
                    column["name"]
                    for column in inspector.get_columns(model.__tablename__)
                } == set(model.__table__.columns.keys()) - {
                    "creative_asset_id",
                    "creative_snapshot",
                    "platform",
                    "action_values",
                }
            assert connection.execute(
                text(
                    "SELECT min_interval_seconds, max_read_retries FROM delivery_settings"
                )
            ).one() == (2, 3)
            with Operations.context(context):
                controls.downgrade()
                recovery.downgrade()
                migration.downgrade()
            tables = inspect(connection).get_table_names()
            assert "facebook_ads" in tables and "users" in tables
            assert not names.intersection(tables)
        finally:
            transaction.rollback()
