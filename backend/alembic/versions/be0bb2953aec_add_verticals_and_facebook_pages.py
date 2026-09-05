"""add_verticals_and_facebook_pages

Revision ID: be0bb2953aec
Revises: c2e11c6fd885
Create Date: 2025-12-06 18:54:17.898776

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be0bb2953aec'
down_revision: Union[str, Sequence[str], None] = 'c2e11c6fd885'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create verticals table
    op.create_table(
        'verticals',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_verticals_name', 'verticals', ['name'], unique=True)

    # Create facebook_pages table
    op.create_table(
        'facebook_pages',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('page_name', sa.String(), nullable=False),
        sa.Column('page_url', sa.String(), nullable=True),
        sa.Column('vertical_id', sa.String(), nullable=True),
        sa.Column('total_ads', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('first_seen', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_seen', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['vertical_id'], ['verticals.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_facebook_pages_page_name', 'facebook_pages', ['page_name'], unique=True)

    # Add vertical_id to saved_searches
    op.add_column('saved_searches', sa.Column('vertical_id', sa.String(), nullable=True))
    op.create_foreign_key('fk_saved_searches_vertical', 'saved_searches', 'verticals', ['vertical_id'], ['id'], ondelete='SET NULL')

    # Add facebook_page_id to scraped_ads
    op.add_column('scraped_ads', sa.Column('facebook_page_id', sa.String(), nullable=True))
    op.create_foreign_key('fk_scraped_ads_facebook_page', 'scraped_ads', 'facebook_pages', ['facebook_page_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    # Remove foreign keys and columns
    op.drop_constraint('fk_scraped_ads_facebook_page', 'scraped_ads', type_='foreignkey')
    op.drop_column('scraped_ads', 'facebook_page_id')

    op.drop_constraint('fk_saved_searches_vertical', 'saved_searches', type_='foreignkey')
    op.drop_column('saved_searches', 'vertical_id')

    # Drop tables
    op.drop_index('ix_facebook_pages_page_name', table_name='facebook_pages')
    op.drop_table('facebook_pages')

    op.drop_index('ix_verticals_name', table_name='verticals')
    op.drop_table('verticals')
