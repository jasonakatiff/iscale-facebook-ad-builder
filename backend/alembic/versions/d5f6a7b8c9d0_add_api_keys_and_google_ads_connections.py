"""Add bot API keys and Google Ads connections without replacing existing tables.

Revision ID: d5f6a7b8c9d0
Revises: c4e8a21b9f30
"""
from alembic import op
import sqlalchemy as sa

revision = "d5f6a7b8c9d0"
down_revision = "c4e8a21b9f30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "api_keys" not in tables:
        op.create_table(
            "api_keys",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("key_hash", sa.String(), nullable=False),
            sa.Column("scopes", sa.JSON(), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)
    if "google_ads_connections" not in tables:
        op.create_table(
            "google_ads_connections",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("customer_id", sa.String(), nullable=False),
            sa.Column("account_name", sa.String(), nullable=True),
            sa.Column("encrypted_refresh_token", sa.Text(), nullable=False),
            sa.Column("encrypted_access_token", sa.Text(), nullable=True),
            sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "google_ads_connections" in tables:
        op.drop_table("google_ads_connections")
    if "api_keys" in tables:
        op.drop_index("ix_api_keys_key_hash", table_name="api_keys")
        op.drop_table("api_keys")
