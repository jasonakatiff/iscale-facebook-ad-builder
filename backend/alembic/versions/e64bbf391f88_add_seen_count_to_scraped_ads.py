"""add_seen_count_to_scraped_ads

Revision ID: e64bbf391f88
Revises: 63b97f8cb023
Create Date: 2025-12-06 21:18:23.868439

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e64bbf391f88'
down_revision: Union[str, Sequence[str], None] = '63b97f8cb023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add seen_count column with default value of 1
    op.add_column('scraped_ads', sa.Column('seen_count', sa.Integer(), server_default='1', nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('scraped_ads', 'seen_count')
