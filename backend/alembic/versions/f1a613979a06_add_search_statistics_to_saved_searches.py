"""add_search_statistics_to_saved_searches

Revision ID: f1a613979a06
Revises: f4be6367be6c
Create Date: 2025-12-06 22:43:06.311864

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a613979a06'
down_revision: Union[str, Sequence[str], None] = 'f4be6367be6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('saved_searches', sa.Column('ads_requested', sa.Integer(), nullable=True))
    op.add_column('saved_searches', sa.Column('ads_returned', sa.Integer(), nullable=True))
    op.add_column('saved_searches', sa.Column('ads_new', sa.Integer(), nullable=True))
    op.add_column('saved_searches', sa.Column('ads_duplicate', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('saved_searches', 'ads_duplicate')
    op.drop_column('saved_searches', 'ads_new')
    op.drop_column('saved_searches', 'ads_returned')
    op.drop_column('saved_searches', 'ads_requested')
