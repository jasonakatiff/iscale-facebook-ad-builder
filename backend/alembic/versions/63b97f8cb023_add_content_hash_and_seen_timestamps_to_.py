"""add_content_hash_and_seen_timestamps_to_scraped_ads

Revision ID: 63b97f8cb023
Revises: 6fd26773d82e
Create Date: 2025-12-06 20:55:46.985106

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63b97f8cb023'
down_revision: Union[str, Sequence[str], None] = '6fd26773d82e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add content_hash column
    op.add_column('scraped_ads', sa.Column('content_hash', sa.String(), nullable=True))
    op.create_index(op.f('ix_scraped_ads_content_hash'), 'scraped_ads', ['content_hash'], unique=True)

    # Add first_seen and last_seen columns
    op.add_column('scraped_ads', sa.Column('first_seen', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.add_column('scraped_ads', sa.Column('last_seen', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove columns in reverse order
    op.drop_column('scraped_ads', 'last_seen')
    op.drop_column('scraped_ads', 'first_seen')
    op.drop_index(op.f('ix_scraped_ads_content_hash'), table_name='scraped_ads')
    op.drop_column('scraped_ads', 'content_hash')
