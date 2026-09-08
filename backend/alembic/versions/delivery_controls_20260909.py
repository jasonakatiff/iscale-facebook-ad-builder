"""Add shared request budgets, caching and resumable reports."""

from alembic import op

revision = "delivery_controls_20260909"
down_revision = "delivery_recovery_20260908"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE account_sync_jobs ADD COLUMN available_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN stable_status_interval_seconds INTEGER NOT NULL DEFAULT 3600"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN lookback_days INTEGER NOT NULL DEFAULT 2"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN reconcile_days INTEGER NOT NULL DEFAULT 35"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN reconcile_interval_hours INTEGER NOT NULL DEFAULT 24"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN metadata_cache_hours INTEGER NOT NULL DEFAULT 24"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN api_requests_per_minute INTEGER NOT NULL DEFAULT 120"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN import_requests_per_minute INTEGER NOT NULL DEFAULT 60"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN account_requests_per_minute INTEGER NOT NULL DEFAULT 60"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN api_daily_request_limit INTEGER NOT NULL DEFAULT 10000"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN api_max_concurrency INTEGER NOT NULL DEFAULT 2"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN api_usage_pause_percent INTEGER NOT NULL DEFAULT 80"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD COLUMN async_poll_seconds INTEGER NOT NULL DEFAULT 30"
    )
    op.execute(
        "ALTER TABLE delivery_settings ALTER COLUMN performance_interval_seconds SET DEFAULT 14400"
    )
    op.execute(
        "UPDATE delivery_settings SET performance_interval_seconds = 14400 WHERE performance_interval_seconds = 900"
    )
    op.execute(
        "UPDATE delivery_settings SET stable_status_interval_seconds = GREATEST(stable_status_interval_seconds, status_interval_seconds)"
    )
    op.execute("ALTER TABLE delivery_syncs ADD COLUMN report_state JSON")
    op.execute(
        "ALTER TABLE delivery_settings ADD CONSTRAINT ck_delivery_sync_controls CHECK (lookback_days BETWEEN 1 AND 90 AND reconcile_days BETWEEN lookback_days AND 90 AND reconcile_interval_hours BETWEEN 1 AND 168 AND metadata_cache_hours BETWEEN 1 AND 168 AND stable_status_interval_seconds BETWEEN status_interval_seconds AND 86400 AND async_poll_seconds BETWEEN 15 AND 300)"
    )
    op.execute(
        "ALTER TABLE delivery_settings ADD CONSTRAINT ck_delivery_request_controls CHECK (api_requests_per_minute BETWEEN 1 AND 10000 AND import_requests_per_minute BETWEEN 1 AND api_requests_per_minute AND account_requests_per_minute BETWEEN 1 AND 10000 AND api_daily_request_limit BETWEEN 1 AND 1000000 AND api_max_concurrency BETWEEN 1 AND 10 AND api_usage_pause_percent BETWEEN 10 AND 95)"
    )
    op.execute(
        "\nCREATE TABLE delivery_api_requests (\n\tid VARCHAR(36) NOT NULL, \n\taccount_id VARCHAR(80), \n\tlane VARCHAR(20) NOT NULL, \n\tcost INTEGER NOT NULL, \n\tstarted_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tfinished_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id)\n)\n\n"
    )
    op.execute(
        "CREATE INDEX ix_delivery_api_requests_started_at ON delivery_api_requests (started_at)"
    )
    op.execute(
        "CREATE INDEX ix_delivery_api_requests_account_id ON delivery_api_requests (account_id)"
    )
    op.execute(
        "\nCREATE TABLE delivery_api_cooldowns (\n\tscope VARCHAR(100) NOT NULL, \n\tuntil TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (scope)\n)\n\n"
    )
    op.execute(
        "\nCREATE TABLE delivery_provider_cache (\n\tkey VARCHAR(160) NOT NULL, \n\tpayload JSON NOT NULL, \n\tfetched_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (key)\n)\n\n"
    )
    op.execute(
        "\nCREATE TABLE delivery_staged_insights (\n\tsync_id VARCHAR(36) NOT NULL, \n\tad_id VARCHAR(80) NOT NULL, \n\treport_date DATE NOT NULL, \n\tpayload JSON NOT NULL, \n\tPRIMARY KEY (sync_id, ad_id, report_date), \n\tFOREIGN KEY(sync_id) REFERENCES delivery_syncs (id) ON DELETE CASCADE\n)\n\n"
    )


def downgrade():
    op.drop_column("account_sync_jobs", "available_at")
    op.drop_table("delivery_staged_insights")
    op.drop_table("delivery_provider_cache")
    op.drop_table("delivery_api_cooldowns")
    op.drop_table("delivery_api_requests")
    op.drop_column("delivery_syncs", "report_state")
    op.drop_constraint("ck_delivery_sync_controls", "delivery_settings", type_="check")
    op.drop_constraint(
        "ck_delivery_request_controls", "delivery_settings", type_="check"
    )
    op.drop_column("delivery_settings", "stable_status_interval_seconds")
    op.drop_column("delivery_settings", "lookback_days")
    op.drop_column("delivery_settings", "reconcile_days")
    op.drop_column("delivery_settings", "reconcile_interval_hours")
    op.drop_column("delivery_settings", "metadata_cache_hours")
    op.drop_column("delivery_settings", "api_requests_per_minute")
    op.drop_column("delivery_settings", "import_requests_per_minute")
    op.drop_column("delivery_settings", "account_requests_per_minute")
    op.drop_column("delivery_settings", "api_daily_request_limit")
    op.drop_column("delivery_settings", "api_max_concurrency")
    op.drop_column("delivery_settings", "api_usage_pause_percent")
    op.drop_column("delivery_settings", "async_poll_seconds")
    op.execute(
        "ALTER TABLE delivery_settings ALTER COLUMN performance_interval_seconds SET DEFAULT 900"
    )
