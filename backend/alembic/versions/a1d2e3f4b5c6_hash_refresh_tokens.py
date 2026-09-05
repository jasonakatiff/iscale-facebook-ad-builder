"""Expand refresh-token storage with a nullable SHA-256 hash.

Revision ID: a1d2e3f4b5c6
Revises: d5f6a7b8c9d0

Keep the legacy token column and every existing row during rollout. New code
maps only token_hash, so plaintext-only sessions require a new login. The
plaintext column is removed in a later release (alembic/pending).
"""
from alembic import op
import sqlalchemy as sa

revision = "a1d2e3f4b5c6"
down_revision = "d5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"]: column for column in inspector.get_columns("refresh_tokens")}
    if "token_hash" not in columns:
        op.add_column("refresh_tokens", sa.Column("token_hash", sa.String(), nullable=True))
    if "token" in columns and not columns["token"]["nullable"]:
        op.alter_column("refresh_tokens", "token", existing_type=sa.String(), nullable=True)
    indexes = {index["name"] for index in inspector.get_indexes("refresh_tokens")}
    if "ix_refresh_tokens_token_hash" not in indexes:
        op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    # New sessions have no plaintext token, so restoring NOT NULL would fail.
    # Preserve the nullable legacy column rather than deleting those sessions.
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "token_hash")
