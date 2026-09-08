from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from app.database import Base
from app.delivery.models import new_id


class AnalyticsSettings(Base):
    __tablename__ = "analytics_settings"
    key = Column(String(20), primary_key=True)
    values = Column(JSON, nullable=False)
    updated_by_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AnalyticsSource(Base):
    __tablename__ = "analytics_sources"
    id = Column(String(36), primary_key=True, default=new_id)
    platform = Column(String(12), nullable=False)
    owner_id = Column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    google_connection_id = Column(
        String, ForeignKey("google_ads_connections.id", ondelete="CASCADE"), unique=True
    )
    tiktok_connection_id = Column(
        String, ForeignKey("tiktok_ads_connections.id", ondelete="CASCADE"), unique=True
    )
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    next_discovery_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    discovery_state = Column(JSON)
    discovered_at = Column(DateTime(timezone=True))
    failures = Column(Integer, nullable=False, default=0, server_default="0")
    error_message = Column(Text)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        CheckConstraint(
            "(platform='google' AND google_connection_id IS NOT NULL AND tiktok_connection_id IS NULL) OR (platform='tiktok' AND tiktok_connection_id IS NOT NULL AND google_connection_id IS NULL)",
            name="ck_analytics_source_connection",
        ),
    )


class AnalyticsAccount(Base):
    __tablename__ = "analytics_accounts"
    id = Column(String(36), primary_key=True, default=new_id)
    source_id = Column(
        String(36),
        ForeignKey("analytics_sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    external_id = Column(String(80), nullable=False)
    name = Column(String(300), nullable=False)
    currency = Column(String(3), nullable=False)
    timezone = Column(String(80), nullable=False)
    manager_id = Column(String(80))
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    status = Column(String(20), nullable=False, default="idle", server_default="idle")
    failures = Column(Integer, nullable=False, default=0, server_default="0")
    next_run_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_success_at = Column(DateTime(timezone=True))
    last_reconciled_at = Column(DateTime(timezone=True))
    report_state = Column(JSON)
    error_message = Column(Text)
    requested_by_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    __table_args__ = (
        UniqueConstraint(
            "source_id", "external_id", name="uq_analytics_source_account"
        ),
        Index("ix_analytics_account_due", "status", "next_run_at"),
    )


class AnalyticsAd(Base):
    __tablename__ = "analytics_ads"
    id = Column(String(36), primary_key=True, default=new_id)
    account_id = Column(
        String(36),
        ForeignKey("analytics_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    external_key = Column(String(240), nullable=False)
    external_id = Column(String(80), nullable=False)
    name = Column(String(500), nullable=False)
    dimensions = Column(JSON, nullable=False)
    creative_asset_id = Column(String, ForeignKey("creative_assets.id"))
    creative_snapshot = Column(JSON)
    binding_revision = Column(Integer, nullable=False, default=0, server_default="0")
    linked_by_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    linked_at = Column(DateTime(timezone=True))
    imported_at = Column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        UniqueConstraint("account_id", "external_key", name="uq_analytics_remote_ad"),
    )


class AnalyticsInsight(Base):
    __tablename__ = "analytics_insights"
    id = Column(String(36), primary_key=True, default=new_id)
    ad_id = Column(
        String(36), ForeignKey("analytics_ads.id", ondelete="CASCADE"), nullable=False
    )
    report_date = Column(Date, nullable=False)
    dataset = Column(String(160), nullable=False)
    currency = Column(String(3), nullable=False)
    timezone = Column(String(80), nullable=False)
    dimensions = Column(JSON, nullable=False)
    impressions = Column(Numeric(24, 0), nullable=False)
    clicks = Column(Numeric(24, 0), nullable=False)
    spend = Column(Numeric(24, 6), nullable=False)
    conversions = Column(Numeric(36, 18), nullable=False)
    conversion_value = Column(Numeric(36, 18))
    imported_at = Column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        UniqueConstraint(
            "ad_id", "report_date", "dataset", name="uq_analytics_daily_insight"
        ),
        Index("ix_analytics_insight_date", "report_date"),
    )


class AnalyticsStagedRow(Base):
    __tablename__ = "analytics_staged_rows"
    account_id = Column(
        String(36),
        ForeignKey("analytics_accounts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    external_key = Column(String(240), primary_key=True)
    report_date = Column(Date, primary_key=True)
    payload = Column(JSON, nullable=False)


class AnalyticsAudit(Base):
    __tablename__ = "analytics_audit"
    id = Column(String(36), primary_key=True, default=new_id)
    actor_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    subject_id = Column(String(80), nullable=False, index=True)
    action = Column(String(40), nullable=False)
    details = Column(JSON, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
