"""Add explicit workspace access and durable Meta metadata synchronization.

Legacy rows stay unmapped. This migration creates new tables only.
"""

from alembic import op
import sqlalchemy as sa

revision = "bw_workspace_001"
down_revision = "bw_feedback_001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "workspace_audit_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("actor_user_id", sa.String(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_workspace_audit_events_workspace_id"),
        "workspace_audit_events",
        ["workspace_id"],
        unique=False,
    )
    op.create_table(
        "workspace_memberships",
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "role IN ('viewer','creative_editor','buyer','publisher','admin')",
            name="ck_workspace_member_role",
        ),
        sa.CheckConstraint("version > 0", name="ck_workspace_member_version"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("workspace_id", "user_id"),
    )
    op.create_table(
        "workspace_accounts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column(
            "provider", sa.String(length=20), server_default="meta", nullable=False
        ),
        sa.Column("external_account_id", sa.String(length=100), nullable=False),
        sa.Column("meta_connection_id", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("provider = 'meta'", name="ck_workspace_account_provider"),
        sa.ForeignKeyConstraint(
            ["meta_connection_id"], ["meta_ads_connections.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "id", name="uq_workspace_account_scope"),
        sa.UniqueConstraint(
            "workspace_id",
            "provider",
            "external_account_id",
            name="uq_workspace_provider_account",
        ),
    )
    op.create_table(
        "account_sync_jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column(
            "resource", sa.String(length=32), server_default="campaigns", nullable=False
        ),
        sa.Column("requested_by_user_id", sa.String(), nullable=True),
        sa.Column("membership_version", sa.Integer(), nullable=False),
        sa.Column("grant_version", sa.Integer(), nullable=False),
        sa.Column("connection_id", sa.String(), nullable=True),
        sa.Column("credential_owner_version", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default="queued", nullable=False
        ),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("pages_fetched", sa.Integer(), server_default="0", nullable=False),
        sa.Column("worker_id", sa.String(length=120), nullable=True),
        sa.Column("lease_token", sa.String(), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.CheckConstraint(
            "(status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR (status <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL)",
            name="ck_account_job_lease",
        ),
        sa.CheckConstraint("resource = 'campaigns'", name="ck_account_job_resource"),
        sa.CheckConstraint(
            "status IN ('queued','running','succeeded','failed','blocked')",
            name="ck_account_job_status",
        ),
        sa.CheckConstraint(
            "attempts >= 0 AND pages_fetched >= 0", name="ck_account_job_counts"
        ),
        sa.ForeignKeyConstraint(
            ["connection_id"], ["meta_ads_connections.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "account_id"],
            ["workspace_accounts.workspace_id", "workspace_accounts.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id", "account_id", "id", name="uq_account_job_scope"
        ),
    )
    op.create_index(
        "ix_account_sync_claim",
        "account_sync_jobs",
        ["status", "created_at"],
        unique=False,
    )
    op.create_index(
        "uq_active_account_sync",
        "account_sync_jobs",
        ["workspace_id", "account_id", "resource"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued','running')"),
    )
    op.create_table(
        "workspace_account_grants",
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("can_sync", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint("version > 0", name="ck_workspace_grant_version"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "account_id"],
            ["workspace_accounts.workspace_id", "workspace_accounts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "user_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.user_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("workspace_id", "account_id", "user_id"),
    )
    op.create_table(
        "account_snapshots",
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column("resource", sa.String(length=32), nullable=False),
        sa.Column("generation_id", sa.String(), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "resource = 'campaigns'", name="ck_account_snapshot_resource"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "account_id", "generation_id"],
            [
                "account_sync_jobs.workspace_id",
                "account_sync_jobs.account_id",
                "account_sync_jobs.id",
            ],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "account_id"],
            ["workspace_accounts.workspace_id", "workspace_accounts.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("workspace_id", "account_id", "resource"),
    )


def downgrade():
    raise RuntimeError(
        "Workspace history is retained; disable v2 entry points instead of dropping data."
    )
