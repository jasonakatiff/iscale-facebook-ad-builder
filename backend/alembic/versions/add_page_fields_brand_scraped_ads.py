"""add page_name and page_link to brand_scraped_ads

Revision ID: add_page_fields_001
Revises: a1b2c3d4e5f6
Create Date: 2025-12-13

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_page_fields_001'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add page_name and page_link columns to brand_scraped_ads
    op.add_column('brand_scraped_ads', sa.Column('page_name', sa.String(), nullable=True))
    op.add_column('brand_scraped_ads', sa.Column('page_link', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('brand_scraped_ads', 'page_link')
    op.drop_column('brand_scraped_ads', 'page_name')
