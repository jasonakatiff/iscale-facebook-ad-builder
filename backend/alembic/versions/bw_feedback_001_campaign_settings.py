"""Add reusable campaign settings and tracking preferences."""

from alembic import op
import sqlalchemy as sa

revision = "bw_feedback_001"
down_revision = "a1d2e3f4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "facebook_campaigns",
        sa.Column("daily_budget_minor", sa.Integer(), nullable=True),
    )
    op.add_column(
        "facebook_adsets", sa.Column("daily_budget_minor", sa.Integer(), nullable=True)
    )
    op.add_column(
        "facebook_adsets", sa.Column("bid_amount_minor", sa.Integer(), nullable=True)
    )
    op.create_table(
        "campaign_presets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ad_account_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("vertical", sa.String(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index("ix_campaign_presets_user_id", "campaign_presets", ["user_id"])
    op.create_index(
        "ix_campaign_presets_ad_account_id", "campaign_presets", ["ad_account_id"]
    )
    op.create_table(
        "campaign_preferences",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )


def downgrade():
    op.drop_table("campaign_preferences")
    op.drop_table("campaign_presets")
    op.drop_column("facebook_adsets", "bid_amount_minor")
    op.drop_column("facebook_adsets", "daily_budget_minor")
    op.drop_column("facebook_campaigns", "daily_budget_minor")
