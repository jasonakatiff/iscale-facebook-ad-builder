"""add_search_logs_table

Revision ID: 6fd26773d82e
Revises: 2512a96c6e3c
Create Date: 2025-12-06 20:20:28.396513

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6fd26773d82e'
down_revision: Union[str, Sequence[str], None] = '2512a96c6e3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'search_logs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('search_query', sa.String(), nullable=False),
        sa.Column('country', sa.String(), nullable=True),
        sa.Column('negative_keywords', sa.JSON(), nullable=True),
        sa.Column('vertical_id', sa.String(), nullable=True),
        sa.Column('total_ads_found', sa.Integer(), server_default='0', nullable=True),
        sa.Column('filtered_by_page_blacklist', sa.Integer(), server_default='0', nullable=True),
        sa.Column('filtered_by_keyword_blacklist', sa.Integer(), server_default='0', nullable=True),
        sa.Column('final_ads_saved', sa.Integer(), server_default='0', nullable=True),
        sa.Column('new_pages_blacklisted', sa.JSON(), nullable=True),
        sa.Column('api_calls_made', sa.Integer(), server_default='0', nullable=True),
        sa.Column('search_type', sa.String(), nullable=True),
        sa.Column('execution_time_seconds', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('date', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['vertical_id'], ['verticals.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_search_logs_date'), 'search_logs', ['date'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_search_logs_date'), table_name='search_logs')
    op.drop_table('search_logs')
