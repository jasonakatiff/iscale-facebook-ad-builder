"""Daily provider imports and creative pattern analysis; additive upgrade."""

from alembic import op
import sqlalchemy as sa

revision = "analytics_20260911"
down_revision = "creatives_20260910"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "delivery_api_requests",
        sa.Column("platform", sa.String(12), nullable=False, server_default="meta"),
    )
    op.create_index(
        "ix_delivery_api_requests_platform", "delivery_api_requests", ["platform"]
    )
    op.add_column("ad_insights", sa.Column("action_values", sa.JSON(), nullable=True))
    op.execute("""
CREATE TABLE analytics_audit (
    id VARCHAR(36) NOT NULL,
    actor_id VARCHAR,
    subject_id VARCHAR(80) NOT NULL,
    action VARCHAR(40) NOT NULL,
    details JSON NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL
)

""")
    op.execute(
        "CREATE INDEX ix_analytics_audit_subject_id ON analytics_audit (subject_id)"
    )
    op.execute("""
CREATE TABLE analytics_settings (
    key VARCHAR(20) NOT NULL,
    values JSON NOT NULL,
    updated_by_id VARCHAR,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (key),
    FOREIGN KEY(updated_by_id) REFERENCES users (id) ON DELETE SET NULL
)

""")
    op.execute("""
CREATE TABLE analytics_sources (
    id VARCHAR(36) NOT NULL,
    platform VARCHAR(12) NOT NULL,
    owner_id VARCHAR NOT NULL,
    google_connection_id VARCHAR,
    tiktok_connection_id VARCHAR,
    enabled BOOLEAN DEFAULT 'true' NOT NULL,
    next_discovery_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    discovery_state JSON,
    discovered_at TIMESTAMP WITH TIME ZONE,
    failures INTEGER DEFAULT '0' NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_analytics_source_connection CHECK ((platform='google' AND google_connection_id IS NOT NULL AND tiktok_connection_id IS NULL) OR (platform='tiktok' AND tiktok_connection_id IS NOT NULL AND google_connection_id IS NULL)),
    FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE (google_connection_id),
    FOREIGN KEY(google_connection_id) REFERENCES google_ads_connections (id) ON DELETE CASCADE,
    UNIQUE (tiktok_connection_id),
    FOREIGN KEY(tiktok_connection_id) REFERENCES tiktok_ads_connections (id) ON DELETE CASCADE
)

""")
    op.execute("""
CREATE TABLE analytics_accounts (
    id VARCHAR(36) NOT NULL,
    source_id VARCHAR(36) NOT NULL,
    external_id VARCHAR(80) NOT NULL,
    name VARCHAR(300) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    timezone VARCHAR(80) NOT NULL,
    manager_id VARCHAR(80),
    enabled BOOLEAN DEFAULT 'true' NOT NULL,
    status VARCHAR(20) DEFAULT 'idle' NOT NULL,
    failures INTEGER DEFAULT '0' NOT NULL,
    next_run_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_reconciled_at TIMESTAMP WITH TIME ZONE,
    report_state JSON,
    error_message TEXT,
    requested_by_id VARCHAR,
    PRIMARY KEY (id),
    CONSTRAINT uq_analytics_source_account UNIQUE (source_id, external_id),
    FOREIGN KEY(source_id) REFERENCES analytics_sources (id) ON DELETE CASCADE,
    FOREIGN KEY(requested_by_id) REFERENCES users (id) ON DELETE SET NULL
)

""")
    op.execute(
        "CREATE INDEX ix_analytics_account_due ON analytics_accounts (status, next_run_at)"
    )
    op.execute("""
CREATE TABLE analytics_ads (
    id VARCHAR(36) NOT NULL,
    account_id VARCHAR(36) NOT NULL,
    external_key VARCHAR(240) NOT NULL,
    external_id VARCHAR(80) NOT NULL,
    name VARCHAR(500) NOT NULL,
    dimensions JSON NOT NULL,
    creative_asset_id VARCHAR,
    creative_snapshot JSON,
    binding_revision INTEGER DEFAULT '0' NOT NULL,
    linked_by_id VARCHAR,
    linked_at TIMESTAMP WITH TIME ZONE,
    imported_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_analytics_remote_ad UNIQUE (account_id, external_key),
    FOREIGN KEY(account_id) REFERENCES analytics_accounts (id) ON DELETE CASCADE,
    FOREIGN KEY(creative_asset_id) REFERENCES creative_assets (id),
    FOREIGN KEY(linked_by_id) REFERENCES users (id) ON DELETE SET NULL
)

""")
    op.execute("""
CREATE TABLE analytics_staged_rows (
    account_id VARCHAR(36) NOT NULL,
    external_key VARCHAR(240) NOT NULL,
    report_date DATE NOT NULL,
    payload JSON NOT NULL,
    PRIMARY KEY (account_id, external_key, report_date),
    FOREIGN KEY(account_id) REFERENCES analytics_accounts (id) ON DELETE CASCADE
)

""")
    op.execute("""
CREATE TABLE analytics_insights (
    id VARCHAR(36) NOT NULL,
    ad_id VARCHAR(36) NOT NULL,
    report_date DATE NOT NULL,
    dataset VARCHAR(160) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    timezone VARCHAR(80) NOT NULL,
    dimensions JSON NOT NULL,
    impressions NUMERIC(24, 0) NOT NULL,
    clicks NUMERIC(24, 0) NOT NULL,
    spend NUMERIC(24, 6) NOT NULL,
    conversions NUMERIC(36, 18) NOT NULL,
    conversion_value NUMERIC(36, 18),
    imported_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_analytics_daily_insight UNIQUE (ad_id, report_date, dataset),
    FOREIGN KEY(ad_id) REFERENCES analytics_ads (id) ON DELETE CASCADE
)

""")
    op.execute(
        "CREATE INDEX ix_analytics_insight_date ON analytics_insights (report_date)"
    )


def downgrade():
    op.drop_table("analytics_insights")
    op.drop_table("analytics_staged_rows")
    op.drop_table("analytics_ads")
    op.drop_table("analytics_accounts")
    op.drop_table("analytics_sources")
    op.drop_table("analytics_settings")
    op.drop_table("analytics_audit")
    op.drop_column("ad_insights", "action_values")
    op.drop_column("delivery_api_requests", "platform")
