"""Add private native LeadRouter connections and campaign defaults."""

from alembic import op
import sqlalchemy as sa

revision = "bw_leadrouter_001"
down_revision = "bw_user_api_001"
branch_labels = None
depends_on = None


def upgrade():
    existing = sa.inspect(op.get_bind()).get_table_names()
    if "leadrouter_connections" not in existing:
        op.create_table(
            "leadrouter_connections",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("account_type", sa.String(), nullable=False),
            sa.Column("account_name", sa.String(), nullable=False),
            sa.Column("partner_id", sa.String(), nullable=True),
            sa.Column("encrypted_api_key", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.CheckConstraint(
                "account_type IN ('partner', 'organization')",
                name="ck_leadrouter_account_type",
            ),
        )
    if "leadrouter_defaults" not in existing:
        op.create_table(
            "leadrouter_defaults",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "connection_id",
                sa.String(),
                sa.ForeignKey("leadrouter_connections.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("resource_type", sa.String(), nullable=False),
            sa.Column("resource_id", sa.String(), nullable=False),
            sa.Column("campaign_id", sa.String(), nullable=False),
            sa.Column("campaign", sa.JSON(), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.UniqueConstraint(
                "connection_id",
                "resource_type",
                "resource_id",
                name="uq_leadrouter_default",
            ),
            sa.CheckConstraint(
                "resource_type IN ('brand', 'product', 'campaign')",
                name="ck_leadrouter_resource_type",
            ),
        )


def downgrade():
    # Preserve private configuration during an application rollback.
    pass
