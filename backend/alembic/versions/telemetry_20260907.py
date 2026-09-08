"""Add durable telemetry events.

Revision ID: telemetry_20260907
Revises: bw_leadrouter_001
"""

from alembic import op
import sqlalchemy as sa

revision = "telemetry_20260907"
down_revision = "bw_leadrouter_001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "telemetry_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("trace_id", sa.String(32), nullable=False),
        sa.Column("span_id", sa.String(16), nullable=False),
        sa.Column("parent_span_id", sa.String(16)),
        sa.Column("request_id", sa.String(36)),
        sa.Column("session_id", sa.String(36)),
        sa.Column("user_id", sa.String()),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("level", sa.String(10), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("message", sa.Text()),
        sa.Column("duration_ms", sa.Float()),
        sa.Column("status_code", sa.Integer()),
        sa.Column("fingerprint", sa.String(64)),
        sa.Column("attributes", sa.JSON(), nullable=False),
        sa.Column("environment", sa.String(80), nullable=False),
        sa.Column("release", sa.String(80)),
    )
    for name, columns in {
        "created": ["created_at", "id"],
        "trace": ["trace_id", "created_at"],
        "session": ["session_id", "created_at"],
        "user": ["user_id", "created_at"],
        "kind": ["kind", "created_at"],
        "errors": ["level", "fingerprint", "created_at"],
        "request": ["request_id"],
    }.items():
        op.create_index("ix_telemetry_" + name, "telemetry_events", columns)


def downgrade():
    op.drop_table("telemetry_events")
