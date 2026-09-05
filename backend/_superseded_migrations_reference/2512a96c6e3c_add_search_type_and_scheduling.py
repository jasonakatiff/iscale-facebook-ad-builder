"""add_search_type_and_scheduling

Revision ID: 2512a96c6e3c
Revises: be0bb2953aec
Create Date: 2025-12-06 20:09:59.499544

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2512a96c6e3c'
down_revision: Union[str, Sequence[str], None] = 'be0bb2953aec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add search_type column with default 'one_time'
    op.add_column('saved_searches', sa.Column('search_type', sa.String(), server_default='one_time', nullable=True))

    # Add schedule_config column for storing cron config as JSON
    op.add_column('saved_searches', sa.Column('schedule_config', sa.JSON(), nullable=True))

    # Add is_active column for enabling/disabling scheduled searches
    op.add_column('saved_searches', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=True))

    # Add last_run column to track when scheduled search last ran
    op.add_column('saved_searches', sa.Column('last_run', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('saved_searches', 'last_run')
    op.drop_column('saved_searches', 'is_active')
    op.drop_column('saved_searches', 'schedule_config')
    op.drop_column('saved_searches', 'search_type')
