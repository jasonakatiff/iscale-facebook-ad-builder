"""Add installation progress and encrypted service credentials."""
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "bw_install_001"
down_revision = "delivery_20260908"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "installation_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("installation_id", sa.String(), nullable=False, unique=True),
        sa.Column("initialized", sa.Boolean(), nullable=False),
        sa.Column("setup_status", sa.String(20), nullable=False),
        sa.Column("setup_step", sa.String(20), nullable=False),
        sa.Column("worker_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_installation_singleton"),
        sa.CheckConstraint("setup_status IN ('pending','in_progress','deferred','complete')", name="ck_installation_status"),
        sa.CheckConstraint("setup_step IN ('welcome','providers','brand','create')", name="ck_installation_step"),
    )
    op.create_table(
        "provider_connections",
        sa.Column("provider", sa.String(20), primary_key=True),
        sa.Column("encrypted_key", sa.Text(), nullable=True),
        sa.Column("key_hint", sa.String(4), nullable=True),
        sa.Column("disabled", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("status_message", sa.String(300), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("provider IN ('gemini','fal','kie')", name="ck_provider_name"),
        sa.CheckConstraint("status IN ('not_configured','saved_unverified','connected','invalid','insufficient_credit','temporarily_unavailable')", name="ck_provider_status"),
    )
    existing_users = op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM users)")).scalar()
    op.get_bind().execute(sa.text(
        "INSERT INTO installation_state (id, installation_id, initialized, setup_status, setup_step) "
        "VALUES (1, :installation_id, :initialized, :status, 'welcome')"
    ), {"installation_id": str(uuid4()), "initialized": existing_users,
        "status": "complete" if existing_users else "pending"})


def downgrade():
    # Retain credentials and the consumed bootstrap marker across code rollback.
    pass
