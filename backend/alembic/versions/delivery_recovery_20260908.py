"""Add posting recovery, attempt accounting and recipient notifications."""

from alembic import op
import sqlalchemy as sa

revision = "delivery_recovery_20260908"
down_revision = "delivery_20260908"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "delivery_settings",
        sa.Column("max_post_retries", sa.Integer(), nullable=False, server_default="3"),
    )
    op.create_check_constraint(
        "ck_delivery_post_retries",
        "delivery_settings",
        "max_post_retries BETWEEN 0 AND 10",
    )
    for column in [
        sa.Column("error_code", sa.String(80)),
        sa.Column("provider_error_code", sa.Integer()),
        sa.Column("provider_error_subcode", sa.Integer()),
        sa.Column(
            "retry_allowed", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("failure_id", sa.String(36)),
        sa.Column("write_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retry_started_at", sa.DateTime(timezone=True)),
    ]:
        op.add_column("delivery_jobs", column)
    op.create_table(
        "delivery_post_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "job_id",
            sa.String(36),
            sa.ForeignKey("delivery_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_delivery_post_attempts_job_id", "delivery_post_attempts", ["job_id"]
    )
    op.create_index(
        "ix_delivery_post_attempts_started_at", "delivery_post_attempts", ["started_at"]
    )
    op.execute(
        "INSERT INTO delivery_post_attempts (id, job_id, started_at, finished_at) SELECT id, id, post_started_at, finished_at FROM delivery_jobs WHERE post_started_at IS NOT NULL"
    )
    op.create_table(
        "delivery_notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "job_id",
            sa.String(36),
            sa.ForeignKey("delivery_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("failure_id", sa.String(36), nullable=False),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "user_id", "failure_id", name="uq_delivery_failure_notification"
        ),
    )
    op.create_index(
        "ix_delivery_notifications_user",
        "delivery_notifications",
        ["user_id", "read_at", "created_at"],
    )


def downgrade():
    op.drop_table("delivery_notifications")
    op.drop_table("delivery_post_attempts")
    for name in [
        "retry_started_at",
        "write_failures",
        "failure_id",
        "retry_allowed",
        "provider_error_subcode",
        "provider_error_code",
        "error_code",
    ]:
        op.drop_column("delivery_jobs", name)
    op.drop_constraint("ck_delivery_post_retries", "delivery_settings", type_="check")
    op.drop_column("delivery_settings", "max_post_retries")
