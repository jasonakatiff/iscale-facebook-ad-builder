"""Add private packages, scoped worker credentials and durable plugin runs."""

from alembic import op
import sqlalchemy as sa

revision = "bw_plugins_001"
down_revision = "telemetry_20260907"
branch_labels = None
depends_on = None


def upgrade():
    existing = sa.inspect(op.get_bind()).get_table_names()
    if "plugin_installations" not in existing:
        op.create_table(
            "plugin_installations",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("version", sa.String(), nullable=False),
            sa.Column("document", sa.JSON(), nullable=False),
            sa.Column("package_digest", sa.String(), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("configuration", sa.JSON(), nullable=False),
            sa.Column("worker_key_hash", sa.String(), nullable=True, unique=True),
            sa.Column("worker_key_prefix", sa.String(), nullable=True),
            sa.Column(
                "worker_key_expires_at", sa.DateTime(timezone=True), nullable=True
            ),
            sa.Column("worker_last_seen_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "worker_generation", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("user_id", "slug", "version", name="uq_plugin_release"),
        )
        op.create_index(
            "ix_plugin_installations_user_id", "plugin_installations", ["user_id"]
        )
    if "plugin_runs" not in existing:
        op.create_table(
            "plugin_runs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "installation_id",
                sa.String(),
                sa.ForeignKey("plugin_installations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("request_id", sa.String(), nullable=False),
            sa.Column("input_digest", sa.String(), nullable=False),
            sa.Column("package_digest", sa.String(), nullable=False),
            sa.Column("inputs", sa.JSON(), nullable=False),
            sa.Column("configuration", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("output", sa.JSON(), nullable=True),
            sa.Column("error", sa.String(), nullable=True),
            sa.Column("lease_hash", sa.String(), nullable=True),
            sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("worker_generation", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "installation_id", "request_id", name="uq_plugin_run_request"
            ),
            sa.CheckConstraint(
                "status IN ('queued','running','succeeded','failed','cancelled','expired')",
                name="ck_plugin_run_status",
            ),
        )
        op.create_index(
            "ix_plugin_runs_installation_id", "plugin_runs", ["installation_id"]
        )


def downgrade():
    # Retain user packages, credentials and history during an application rollback.
    pass
