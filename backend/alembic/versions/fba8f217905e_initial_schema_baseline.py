"""initial schema baseline

This is now the sole root migration. The 16 migrations that previously formed
the history (2512a96c6e3c ... f4be6367be6c) assumed the base schema already
existed in the database (it was always created via Base.metadata.create_all()
in init_db.py, never via Alembic) — `alembic upgrade head` against a genuinely
fresh database always failed on the very first migration
(e9173c698de9, "ALTER TABLE generated_ads" — relation does not exist).
Railway's actual deploy path never ran `alembic upgrade head` either (its
startCommand overrides the Dockerfile's CMD and skips migrations entirely),
which is why this was never caught. Those 16 files are kept for reference only
in `backend/_superseded_migrations_reference/` (excluded from Alembic's scan
path) — see docs/sprint-0/done.md for the full explanation.

This migration creates the complete current schema (every table in
app.models, matching Base.metadata exactly) in one step, so `alembic upgrade
head` now works against an empty database. Any future schema change should be
a new migration on top of this one, as normal.

Revision ID: fba8f217905e
Revises:
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'fba8f217905e'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create every table currently defined in app.models."""
    from app.database import Base
    import app.models  # noqa: F401 - import populates Base.metadata

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    """Drop every table currently defined in app.models."""
    from app.database import Base
    import app.models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, checkfirst=True)

