"""add_media_type_to_scraped_ads

Revision ID: f4be6367be6c
Revises: e64bbf391f88
Create Date: 2025-12-06 21:56:15.348457

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4be6367be6c'
down_revision: Union[str, Sequence[str], None] = 'e64bbf391f88'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('scraped_ads', sa.Column('media_type', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('scraped_ads', 'media_type')
