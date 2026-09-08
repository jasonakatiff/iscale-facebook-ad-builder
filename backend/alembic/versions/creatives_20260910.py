"""Creative provenance and immutable launch snapshots; additive upgrade."""

from alembic import op
import sqlalchemy as sa

revision = "creatives_20260910"
down_revision = "delivery_controls_20260909"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "generated_ads", sa.Column("created_by_id", sa.String(), nullable=True)
    )
    op.create_foreign_key(
        "fk_generated_ads_creator",
        "generated_ads",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "facebook_campaigns", sa.Column("created_by_id", sa.String(), nullable=True)
    )
    op.create_foreign_key(
        "fk_facebook_campaigns_creator",
        "facebook_campaigns",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "facebook_adsets", sa.Column("created_by_id", sa.String(), nullable=True)
    )
    op.create_foreign_key(
        "fk_facebook_adsets_creator",
        "facebook_adsets",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "facebook_ads", sa.Column("created_by_id", sa.String(), nullable=True)
    )
    op.create_foreign_key(
        "fk_facebook_ads_creator",
        "facebook_ads",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "generated_ads", sa.Column("generation_context", sa.JSON(), nullable=True)
    )
    op.execute("""
CREATE TABLE creative_assets (
    id VARCHAR NOT NULL,
    generated_ad_id VARCHAR,
    source_type VARCHAR(32) NOT NULL,
    created_by_id VARCHAR,
    registered_by_id VARCHAR,
    name VARCHAR(255) NOT NULL,
    media_url TEXT NOT NULL,
    media_type VARCHAR(10) NOT NULL,
    thumbnail_url TEXT,
    generation_context JSON DEFAULT '{}' NOT NULL,
    metadata_values JSON DEFAULT '{}' NOT NULL,
    metadata_revision INTEGER DEFAULT '0' NOT NULL,
    analysis_status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    analysis_error TEXT,
    analysis_model VARCHAR(100),
    analyzed_by_id VARCHAR,
    analyzed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    CONSTRAINT ck_creative_source CHECK (source_type IN ('system_generated','external_upload')),
    CONSTRAINT ck_creative_media CHECK (media_type IN ('image','video')),
    CONSTRAINT ck_creative_analysis CHECK (analysis_status IN ('pending','ready','failed')),
    UNIQUE (generated_ad_id),
    FOREIGN KEY(generated_ad_id) REFERENCES generated_ads (id) ON DELETE SET NULL,
    FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY(registered_by_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY(analyzed_by_id) REFERENCES users (id) ON DELETE SET NULL
)
""")
    op.execute(
        "CREATE INDEX ix_creative_assets_created_by_id ON creative_assets (created_by_id)"
    )
    op.execute("""
CREATE TABLE creative_events (
    id VARCHAR NOT NULL,
    asset_id VARCHAR NOT NULL,
    actor_id VARCHAR,
    action VARCHAR(32) NOT NULL,
    details JSON NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(asset_id) REFERENCES creative_assets (id),
    FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL
)
""")
    op.execute("CREATE INDEX ix_creative_events_asset_id ON creative_events (asset_id)")
    op.add_column(
        "delivery_jobs", sa.Column("creative_asset_id", sa.String(), nullable=True)
    )
    op.add_column(
        "delivery_jobs", sa.Column("creative_snapshot", sa.JSON(), nullable=True)
    )
    op.create_foreign_key(
        "fk_delivery_jobs_asset",
        "delivery_jobs",
        "creative_assets",
        ["creative_asset_id"],
        ["id"],
    )
    op.add_column(
        "managed_ads", sa.Column("creative_asset_id", sa.String(), nullable=True)
    )
    op.add_column(
        "managed_ads", sa.Column("creative_snapshot", sa.JSON(), nullable=True)
    )
    op.create_foreign_key(
        "fk_managed_ads_asset",
        "managed_ads",
        "creative_assets",
        ["creative_asset_id"],
        ["id"],
    )
    op.execute(
        """INSERT INTO creative_assets (id, generated_ad_id, source_type, created_by_id, name, media_url, media_type, thumbnail_url, generation_context, metadata_values, created_at) SELECT md5('creative:' || id)::uuid::text, id, 'system_generated', created_by_id, LEFT(COALESCE(NULLIF(headline, ''), size_name, 'Generated creative'), 255), CASE WHEN media_type = 'video' THEN video_url ELSE image_url END, COALESCE(media_type, 'image'), thumbnail_url, json_build_object('template_id', template_id, 'brand_id', brand_id, 'product_id', product_id, 'prompt', prompt, 'dimensions', dimensions, 'headline', headline, 'body', body, 'cta', cta), '{}'::json, COALESCE(created_at, now()) FROM generated_ads WHERE (CASE WHEN media_type = 'video' THEN video_url ELSE image_url END) IS NOT NULL"""
    )


def downgrade():
    op.drop_column("delivery_jobs", "creative_snapshot")
    op.drop_column("delivery_jobs", "creative_asset_id")
    op.drop_column("managed_ads", "creative_snapshot")
    op.drop_column("managed_ads", "creative_asset_id")
    op.drop_table("creative_events")
    op.drop_table("creative_assets")
    op.drop_column("generated_ads", "generation_context")
    op.drop_column("generated_ads", "created_by_id")
    op.drop_column("facebook_campaigns", "created_by_id")
    op.drop_column("facebook_adsets", "created_by_id")
    op.drop_column("facebook_ads", "created_by_id")
