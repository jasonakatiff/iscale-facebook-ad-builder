import uuid
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


def new_id():
    return str(uuid.uuid4())


class DeliverySettings(Base):
    __tablename__ = "delivery_settings"
    id = Column(Integer, primary_key=True)
    min_interval_seconds = Column(
        Integer, nullable=False, default=2, server_default="2"
    )
    max_posts = Column(Integer, nullable=False, default=30, server_default="30")
    window_seconds = Column(Integer, nullable=False, default=60, server_default="60")
    max_read_retries = Column(Integer, nullable=False, default=3, server_default="3")
    status_interval_seconds = Column(
        Integer, nullable=False, default=300, server_default="300"
    )
    performance_interval_seconds = Column(
        Integer, nullable=False, default=900, server_default="900"
    )
    paused = Column(Boolean, nullable=False, default=False, server_default="false")
    imports_enabled = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    posting_heartbeat = Column(DateTime(timezone=True))
    sync_heartbeat = Column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_delivery_singleton"),
        CheckConstraint(
            "min_interval_seconds BETWEEN 1 AND 3600 AND max_posts BETWEEN 1 AND 10000 AND window_seconds BETWEEN 1 AND 86400",
            name="ck_delivery_posting_limits",
        ),
        CheckConstraint(
            "max_read_retries BETWEEN 0 AND 10 AND status_interval_seconds BETWEEN 60 AND 86400 AND performance_interval_seconds BETWEEN 60 AND 86400",
            name="ck_delivery_read_limits",
        ),
    )


class DeliveryJob(Base):
    __tablename__ = "delivery_jobs"
    id = Column(String(36), primary_key=True, default=new_id)
    owner_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    request_key = Column(String(160), nullable=False)
    request_hash = Column(String(64), nullable=False)
    account_id = Column(String(80), nullable=False)
    name = Column(String(200), nullable=False)
    kind = Column(String(20), nullable=False)
    status = Column(
        String(32), nullable=False, default="queued", server_default="queued"
    )
    stage = Column(String(32), nullable=False, default="ad", server_default="ad")
    payload = Column(JSON, nullable=False)
    results = Column(JSON, nullable=False, default=dict, server_default="{}")
    generated_ad_id = Column(
        String, ForeignKey("generated_ads.id", ondelete="SET NULL")
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    available_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    stage_started_at = Column(DateTime(timezone=True))
    post_started_at = Column(DateTime(timezone=True), index=True)
    finished_at = Column(DateTime(timezone=True))
    read_failures = Column(Integer, nullable=False, default=0, server_default="0")
    error_message = Column(Text)
    __table_args__ = (
        UniqueConstraint("owner_id", "request_key", name="uq_delivery_submission"),
        CheckConstraint(
            "status IN ('queued','working','succeeded','failed','needs_reconciliation','cancelled')",
            name="ck_delivery_job_status",
        ),
        Index("ix_delivery_ready", "status", "available_at", "created_at"),
    )


class ManagedAd(Base):
    __tablename__ = "managed_ads"
    id = Column(String(36), primary_key=True, default=new_id)
    job_id = Column(
        String(36), ForeignKey("delivery_jobs.id"), nullable=False, unique=True
    )
    owner_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    account_id = Column(String(80), nullable=False)
    fb_ad_id = Column(String(80), nullable=False)
    fb_adset_id = Column(String(80), nullable=False)
    fb_creative_id = Column(String(80), nullable=False)
    local_ad_id = Column(String, ForeignKey("facebook_ads.id", ondelete="SET NULL"))
    generated_ad_id = Column(
        String, ForeignKey("generated_ads.id", ondelete="SET NULL")
    )
    name = Column(String(200), nullable=False)
    effective_status = Column(String(80))
    status_synced_at = Column(DateTime(timezone=True))
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        UniqueConstraint("account_id", "fb_ad_id", name="uq_managed_facebook_ad"),
    )


class DeliverySync(Base):
    __tablename__ = "delivery_syncs"
    owner_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    id = Column(String(36), primary_key=True, default=new_id)
    account_id = Column(String(80), nullable=False)
    kind = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="idle", server_default="idle")
    failures = Column(Integer, nullable=False, default=0, server_default="0")
    next_run_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    run_started_at = Column(DateTime(timezone=True))
    last_success_at = Column(DateTime(timezone=True))
    last_reconciled_at = Column(DateTime(timezone=True))
    error_message = Column(Text)
    __table_args__ = (
        UniqueConstraint("owner_id", "account_id", "kind", name="uq_delivery_sync"),
    )


class AdInsight(Base):
    __tablename__ = "ad_insights"
    id = Column(String(36), primary_key=True, default=new_id)
    managed_ad_id = Column(
        String(36), ForeignKey("managed_ads.id", ondelete="CASCADE"), nullable=False
    )
    report_date = Column(Date, nullable=False)
    dataset = Column(String(160), nullable=False)
    currency = Column(String(3), nullable=False)
    account_timezone = Column(String(80), nullable=False)
    impressions = Column(Numeric(24, 0), nullable=False)
    clicks = Column(Numeric(24, 0), nullable=False)
    spend = Column(Numeric(24, 6), nullable=False)
    actions = Column(JSON, nullable=False, default=list)
    imported_at = Column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        UniqueConstraint(
            "managed_ad_id", "report_date", "dataset", name="uq_ad_insight_snapshot"
        ),
    )
