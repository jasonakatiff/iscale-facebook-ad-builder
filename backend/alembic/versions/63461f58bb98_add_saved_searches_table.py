"""add saved searches table

Revision ID: 63461f58bb98
Revises: a96e1805e011
Create Date: 2025-12-06 15:42:38.928771

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63461f58bb98'
down_revision: Union[str, Sequence[str], None] = 'a96e1805e011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create saved_searches table
    op.create_table(
        'saved_searches',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('query', sa.String(), nullable=False),
        sa.Column('country', sa.String(), nullable=True),
        sa.Column('negative_keywords', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Add search_id to scraped_ads
    op.add_column('scraped_ads', sa.Column('search_id', sa.String(), nullable=True))
    op.create_foreign_key('fk_scraped_ads_search_id', 'scraped_ads', 'saved_searches', ['search_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_scraped_ads_search_id', 'scraped_ads', type_='foreignkey')
    op.drop_column('scraped_ads', 'search_id')
    op.drop_table('saved_searches')
