"""add_brand_scrapes_tables

Revision ID: a1b2c3d4e5f6
Revises: f1a613979a06
Create Date: 2025-12-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f1a613979a06'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create brand_scrapes and brand_scraped_ads tables."""
    op.create_table(
        'brand_scrapes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('brand_name', sa.String(), nullable=False),
        sa.Column('page_id', sa.String(), nullable=False),
        sa.Column('page_name', sa.String(), nullable=True),
        sa.Column('page_url', sa.String(), nullable=False),
        sa.Column('total_ads', sa.Integer(), default=0),
        sa.Column('media_downloaded', sa.Integer(), default=0),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_brand_scrapes_brand_name', 'brand_scrapes', ['brand_name'])

    op.create_table(
        'brand_scraped_ads',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('brand_scrape_id', sa.String(), nullable=False),
        sa.Column('external_id', sa.String(), nullable=False),
        sa.Column('headline', sa.String(), nullable=True),
        sa.Column('ad_copy', sa.Text(), nullable=True),
        sa.Column('cta_text', sa.String(), nullable=True),
        sa.Column('media_type', sa.String(), nullable=True),
        sa.Column('media_urls', sa.JSON(), nullable=True),
        sa.Column('original_media_urls', sa.JSON(), nullable=True),
        sa.Column('platforms', sa.JSON(), nullable=True),
        sa.Column('start_date', sa.String(), nullable=True),
        sa.Column('ad_link', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['brand_scrape_id'], ['brand_scrapes.id'], ondelete='CASCADE')
    )
    op.create_index('ix_brand_scraped_ads_external_id', 'brand_scraped_ads', ['external_id'])


def downgrade() -> None:
    """Drop brand_scrapes and brand_scraped_ads tables."""
    op.drop_index('ix_brand_scraped_ads_external_id', table_name='brand_scraped_ads')
    op.drop_table('brand_scraped_ads')
    op.drop_index('ix_brand_scrapes_brand_name', table_name='brand_scrapes')
    op.drop_table('brand_scrapes')
