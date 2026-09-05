"""Pending contract migration: must be wired in one release later.

Move this file into versions/ only after all running application instances use
hash-only refresh tokens and the expand release is stable. It deliberately is
not part of the deployable migration chain for the current release.

Revision ID: z9_drop_refresh_token_plaintext
Revises: a1d2e3f4b5c6
"""
from alembic import op
import sqlalchemy as sa

revision = "z9_drop_refresh_token_plaintext"
down_revision = "a1d2e3f4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "token" in {column["name"] for column in inspector.get_columns("refresh_tokens")}:
        op.drop_column("refresh_tokens", "token")


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "token" not in {column["name"] for column in inspector.get_columns("refresh_tokens")}:
        op.add_column("refresh_tokens", sa.Column("token", sa.String(), nullable=True))
        op.create_index("ix_refresh_tokens_token", "refresh_tokens", ["token"], unique=True)
