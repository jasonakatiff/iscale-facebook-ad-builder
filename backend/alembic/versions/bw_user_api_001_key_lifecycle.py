"""Add user API key expiry and safe display prefix without replacing legacy keys."""

from alembic import op
import sqlalchemy as sa

revision = "bw_user_api_001"
down_revision = "bw_workspace_001"
branch_labels = None
depends_on = None


def upgrade():
    columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("api_keys")
    }
    if "key_prefix" not in columns:
        op.add_column("api_keys", sa.Column("key_prefix", sa.String(20), nullable=True))
    if "expires_at" not in columns:
        op.add_column(
            "api_keys",
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        )

    if "user_themes" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "user_themes",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("document", sa.JSON(), nullable=False),
            sa.Column("github_url", sa.String(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("ix_user_themes_user_id", "user_themes", ["user_id"])


def downgrade():
    # Keep additive metadata on rollback so existing keys retain their expiry.
    pass
