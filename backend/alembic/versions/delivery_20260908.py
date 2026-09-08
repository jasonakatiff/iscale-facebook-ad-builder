"""Add durable posting jobs, shared settings and managed-ad snapshots.

Revision ID: delivery_20260908
Revises: bw_plugins_001
"""

from alembic import op

revision = "delivery_20260908"
down_revision = "bw_plugins_001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
CREATE TABLE delivery_settings (
    id SERIAL NOT NULL,
    min_interval_seconds INTEGER DEFAULT '2' NOT NULL,
    max_posts INTEGER DEFAULT '30' NOT NULL,
    window_seconds INTEGER DEFAULT '60' NOT NULL,
    max_read_retries INTEGER DEFAULT '3' NOT NULL,
    status_interval_seconds INTEGER DEFAULT '300' NOT NULL,
    performance_interval_seconds INTEGER DEFAULT '900' NOT NULL,
    paused BOOLEAN DEFAULT 'false' NOT NULL,
    imports_enabled BOOLEAN DEFAULT 'true' NOT NULL,
    posting_heartbeat TIMESTAMP WITH TIME ZONE,
    sync_heartbeat TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    CONSTRAINT ck_delivery_singleton CHECK (id = 1),
    CONSTRAINT ck_delivery_posting_limits CHECK (min_interval_seconds BETWEEN 1 AND 3600 AND max_posts BETWEEN 1 AND 10000 AND window_seconds BETWEEN 1 AND 86400),
    CONSTRAINT ck_delivery_read_limits CHECK (max_read_retries BETWEEN 0 AND 10 AND status_interval_seconds BETWEEN 60 AND 86400 AND performance_interval_seconds BETWEEN 60 AND 86400)
)
"""
    )
    op.execute(
        """
CREATE TABLE delivery_jobs (
    id VARCHAR(36) NOT NULL,
    owner_id VARCHAR,
    request_key VARCHAR(160) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    account_id VARCHAR(80) NOT NULL,
    name VARCHAR(200) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    status VARCHAR(32) DEFAULT 'queued' NOT NULL,
    stage VARCHAR(32) DEFAULT 'ad' NOT NULL,
    payload JSON NOT NULL,
    results JSON DEFAULT '{}' NOT NULL,
    generated_ad_id VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    available_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    stage_started_at TIMESTAMP WITH TIME ZONE,
    post_started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    read_failures INTEGER DEFAULT '0' NOT NULL,
    error_message TEXT,
    PRIMARY KEY (id),
    CONSTRAINT uq_delivery_submission UNIQUE (owner_id, request_key),
    CONSTRAINT ck_delivery_job_status CHECK (status IN ('queued','working','succeeded','failed','needs_reconciliation','cancelled')),
    FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY(generated_ad_id) REFERENCES generated_ads (id) ON DELETE SET NULL
)
"""
    )
    op.execute(
        """
CREATE INDEX ix_delivery_jobs_post_started_at ON delivery_jobs (post_started_at)
"""
    )
    op.execute(
        """
CREATE INDEX ix_delivery_ready ON delivery_jobs (status, available_at, created_at)
"""
    )
    op.execute(
        """
CREATE TABLE managed_ads (
    id VARCHAR(36) NOT NULL,
    job_id VARCHAR(36) NOT NULL,
    owner_id VARCHAR,
    account_id VARCHAR(80) NOT NULL,
    fb_ad_id VARCHAR(80) NOT NULL,
    fb_adset_id VARCHAR(80) NOT NULL,
    fb_creative_id VARCHAR(80) NOT NULL,
    local_ad_id VARCHAR,
    generated_ad_id VARCHAR,
    name VARCHAR(200) NOT NULL,
    effective_status VARCHAR(80),
    status_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_managed_facebook_ad UNIQUE (account_id, fb_ad_id),
    UNIQUE (job_id),
    FOREIGN KEY(job_id) REFERENCES delivery_jobs (id),
    FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY(local_ad_id) REFERENCES facebook_ads (id) ON DELETE SET NULL,
    FOREIGN KEY(generated_ad_id) REFERENCES generated_ads (id) ON DELETE SET NULL
)
"""
    )
    op.execute(
        """
CREATE TABLE delivery_syncs (
            owner_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id VARCHAR(36) NOT NULL,
    account_id VARCHAR(80) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'idle' NOT NULL,
    failures INTEGER DEFAULT '0' NOT NULL,
    next_run_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    run_started_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_reconciled_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    PRIMARY KEY (id),
    CONSTRAINT uq_delivery_sync UNIQUE (owner_id, account_id, kind)
)
"""
    )
    op.execute(
        """
CREATE TABLE ad_insights (
    id VARCHAR(36) NOT NULL,
    managed_ad_id VARCHAR(36) NOT NULL,
    report_date DATE NOT NULL,
    dataset VARCHAR(160) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    account_timezone VARCHAR(80) NOT NULL,
    impressions NUMERIC(24, 0) NOT NULL,
    clicks NUMERIC(24, 0) NOT NULL,
    spend NUMERIC(24, 6) NOT NULL,
    actions JSON NOT NULL,
    imported_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_ad_insight_snapshot UNIQUE (managed_ad_id, report_date, dataset),
    FOREIGN KEY(managed_ad_id) REFERENCES managed_ads (id) ON DELETE CASCADE
)
"""
    )
    op.execute(
        """
INSERT INTO delivery_settings (id) VALUES (1)
"""
    )


def downgrade():
    op.drop_table("ad_insights")
    op.drop_table("delivery_syncs")
    op.drop_table("managed_ads")
    op.drop_table("delivery_jobs")
    op.drop_table("delivery_settings")
