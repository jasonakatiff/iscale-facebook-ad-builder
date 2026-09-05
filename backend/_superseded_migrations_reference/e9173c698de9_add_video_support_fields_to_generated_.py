"""add video support fields to generated_ads

Revision ID: e9173c698de9
Revises:
Create Date: 2025-12-03 13:55:25.383330

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9173c698de9'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Make image_url nullable for video ads
    op.alter_column('generated_ads', 'image_url',
               existing_type=sa.VARCHAR(),
               nullable=True)

    # Add video support columns
    op.add_column('generated_ads', sa.Column('media_type', sa.String(), server_default='image'))
    op.add_column('generated_ads', sa.Column('video_url', sa.String(), nullable=True))
    op.add_column('generated_ads', sa.Column('video_id', sa.String(), nullable=True))
    op.add_column('generated_ads', sa.Column('thumbnail_url', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('generated_ads', 'thumbnail_url')
    op.drop_column('generated_ads', 'video_id')
    op.drop_column('generated_ads', 'video_url')
    op.drop_column('generated_ads', 'media_type')
    op.alter_column('generated_ads', 'image_url',
               existing_type=sa.VARCHAR(),
               nullable=False)
