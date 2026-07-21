"""add TikTok Ads connections

Revision ID: b7c2d91e4a10
Revises: fba8f217905e
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c2d91e4a10"
down_revision: Union[str, Sequence[str], None] = "fba8f217905e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "tiktok_ads_connections" in inspector.get_table_names():
        return

    op.create_table(
        "tiktok_ads_connections",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("advertiser_id", sa.String(), nullable=False),
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
    op.create_index("ix_tiktok_ads_connections_user_id", "tiktok_ads_connections", ["user_id"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "tiktok_ads_connections" not in inspector.get_table_names():
        return

    op.drop_index("ix_tiktok_ads_connections_user_id", table_name="tiktok_ads_connections")
    op.drop_table("tiktok_ads_connections")
