from sqlalchemy import (
    Column,
    String,
    Integer,
    JSON,
    Text,
    DateTime,
    ForeignKey,
    CheckConstraint,
    func,
)
from app.database import Base
from app.models import generate_uuid


class CreativeAsset(Base):
    __tablename__ = "creative_assets"
    id = Column(String, primary_key=True, default=generate_uuid)
    generated_ad_id = Column(
        String, ForeignKey("generated_ads.id", ondelete="SET NULL"), unique=True
    )
    source_type = Column(String(32), nullable=False)
    created_by_id = Column(
        String, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    registered_by_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    name = Column(String(255), nullable=False)
    media_url = Column(Text, nullable=False)
    media_type = Column(String(10), nullable=False)
    thumbnail_url = Column(Text)
    generation_context = Column(JSON, nullable=False, default=dict, server_default="{}")
    metadata_values = Column(JSON, nullable=False, default=dict, server_default="{}")
    metadata_revision = Column(Integer, nullable=False, default=0, server_default="0")
    analysis_status = Column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    analysis_error = Column(Text)
    analysis_model = Column(String(100))
    analyzed_by_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    analyzed_at = Column(DateTime(timezone=True))
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    archived_at = Column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('system_generated','external_upload')",
            name="ck_creative_source",
        ),
        CheckConstraint("media_type IN ('image','video')", name="ck_creative_media"),
        CheckConstraint(
            "analysis_status IN ('pending','ready','failed')",
            name="ck_creative_analysis",
        ),
    )


class CreativeEvent(Base):
    __tablename__ = "creative_events"
    id = Column(String, primary_key=True, default=generate_uuid)
    asset_id = Column(
        String, ForeignKey("creative_assets.id"), nullable=False, index=True
    )
    actor_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    action = Column(String(32), nullable=False)
    details = Column(JSON, nullable=False, default=dict)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
