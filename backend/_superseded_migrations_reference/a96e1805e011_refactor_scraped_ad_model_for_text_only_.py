"""refactor scraped_ad model for text only storage

Revision ID: a96e1805e011
Revises: 4d4e06ff4640
Create Date: 2025-12-06 15:36:11.238994

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a96e1805e011'
down_revision: Union[str, Sequence[str], None] = '4d4e06ff4640'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add new columns
    op.add_column('scraped_ads', sa.Column('headline', sa.String(), nullable=True))
    op.add_column('scraped_ads', sa.Column('ad_link', sa.String(), nullable=True))  # Temporarily nullable
    op.add_column('scraped_ads', sa.Column('platforms', sa.JSON(), nullable=True))
    op.add_column('scraped_ads', sa.Column('start_date', sa.String(), nullable=True))

    # Build ad_link from external_id for existing records
    op.execute("""
        UPDATE scraped_ads
        SET ad_link = 'https://www.facebook.com/ads/library/?id=' || external_id
        WHERE external_id IS NOT NULL
    """)

    # Make ad_link NOT NULL now that we've populated it
    op.alter_column('scraped_ads', 'ad_link', nullable=False)

    # Add unique constraint and index to external_id
    op.create_index(op.f('ix_scraped_ads_external_id'), 'scraped_ads', ['external_id'], unique=False)
    op.create_unique_constraint('uq_scraped_ads_external_id', 'scraped_ads', ['external_id'])

    # Drop old columns
    op.drop_column('scraped_ads', 'video_url')
    op.drop_column('scraped_ads', 'image_url')
    op.drop_column('scraped_ads', 'analysis')


def downgrade() -> None:
    """Downgrade schema."""
    # Add back old columns
    op.add_column('scraped_ads', sa.Column('analysis', sa.JSON(), nullable=True))
    op.add_column('scraped_ads', sa.Column('image_url', sa.String(), nullable=True))
    op.add_column('scraped_ads', sa.Column('video_url', sa.String(), nullable=True))

    # Drop new columns
    op.drop_constraint('uq_scraped_ads_external_id', 'scraped_ads', type_='unique')
    op.drop_index(op.f('ix_scraped_ads_external_id'), table_name='scraped_ads')
    op.drop_column('scraped_ads', 'start_date')
    op.drop_column('scraped_ads', 'platforms')
    op.drop_column('scraped_ads', 'ad_link')
    op.drop_column('scraped_ads', 'headline')
