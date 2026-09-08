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
from app.delivery.config import DEFAULTS


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
    max_post_retries = Column(Integer, nullable=False, default=3, server_default="3")
    max_read_retries = Column(Integer, nullable=False, default=3, server_default="3")
    status_interval_seconds = Column(
        Integer, nullable=False, default=300, server_default="300"
    )
    performance_interval_seconds = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["performance_interval_seconds"],
        server_default=str(DEFAULTS["performance_interval_seconds"]),
    )
    stable_status_interval_seconds = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["stable_status_interval_seconds"],
        server_default=str(DEFAULTS["stable_status_interval_seconds"]),
    )
    lookback_days = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["lookback_days"],
        server_default=str(DEFAULTS["lookback_days"]),
    )
    reconcile_days = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["reconcile_days"],
        server_default=str(DEFAULTS["reconcile_days"]),
    )
    reconcile_interval_hours = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["reconcile_interval_hours"],
        server_default=str(DEFAULTS["reconcile_interval_hours"]),
    )
    metadata_cache_hours = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["metadata_cache_hours"],
        server_default=str(DEFAULTS["metadata_cache_hours"]),
    )
    api_requests_per_minute = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["api_requests_per_minute"],
        server_default=str(DEFAULTS["api_requests_per_minute"]),
    )
    import_requests_per_minute = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["import_requests_per_minute"],
        server_default=str(DEFAULTS["import_requests_per_minute"]),
    )
    account_requests_per_minute = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["account_requests_per_minute"],
        server_default=str(DEFAULTS["account_requests_per_minute"]),
    )
    api_daily_request_limit = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["api_daily_request_limit"],
        server_default=str(DEFAULTS["api_daily_request_limit"]),
    )
    api_max_concurrency = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["api_max_concurrency"],
        server_default=str(DEFAULTS["api_max_concurrency"]),
    )
    api_usage_pause_percent = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["api_usage_pause_percent"],
        server_default=str(DEFAULTS["api_usage_pause_percent"]),
    )
    async_poll_seconds = Column(
        Integer,
        nullable=False,
        default=DEFAULTS["async_poll_seconds"],
        server_default=str(DEFAULTS["async_poll_seconds"]),
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
            "max_post_retries BETWEEN 0 AND 10", name="ck_delivery_post_retries"
        ),
        CheckConstraint(
            "min_interval_seconds BETWEEN 1 AND 3600 AND max_posts BETWEEN 1 AND 10000 AND window_seconds BETWEEN 1 AND 86400",
            name="ck_delivery_posting_limits",
        ),
        CheckConstraint(
            "max_read_retries BETWEEN 0 AND 10 AND status_interval_seconds BETWEEN 60 AND 86400 AND performance_interval_seconds BETWEEN 60 AND 86400",
            name="ck_delivery_read_limits",
        ),
        CheckConstraint(
            "lookback_days BETWEEN 1 AND 90 AND reconcile_days BETWEEN lookback_days AND 90 AND reconcile_interval_hours BETWEEN 1 AND 168 AND metadata_cache_hours BETWEEN 1 AND 168 AND stable_status_interval_seconds BETWEEN status_interval_seconds AND 86400 AND async_poll_seconds BETWEEN 15 AND 300",
            name="ck_delivery_sync_controls",
        ),
        CheckConstraint(
            "api_requests_per_minute BETWEEN 1 AND 10000 AND import_requests_per_minute BETWEEN 1 AND api_requests_per_minute AND account_requests_per_minute BETWEEN 1 AND 10000 AND api_daily_request_limit BETWEEN 1 AND 1000000 AND api_max_concurrency BETWEEN 1 AND 10 AND api_usage_pause_percent BETWEEN 10 AND 95",
            name="ck_delivery_request_controls",
        ),
    )


class DeliveryJob(Base):
    __tablename__ = "delivery_jobs"
    id = Column(String(36), primary_key=True, default=new_id)
    owner_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    creative_asset_id = Column(String, ForeignKey("creative_assets.id"))
    creative_snapshot = Column(JSON)
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
    error_code = Column(String(80))
    provider_error_code = Column(Integer)
    provider_error_subcode = Column(Integer)
    retry_allowed = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    failure_id = Column(String(36))
    write_failures = Column(Integer, nullable=False, default=0, server_default="0")
    retry_started_at = Column(DateTime(timezone=True))
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
    creative_asset_id = Column(String, ForeignKey("creative_assets.id"))
    creative_snapshot = Column(JSON)
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
    report_state = Column(JSON)
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
    action_values = Column(JSON, nullable=True)
    imported_at = Column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        UniqueConstraint(
            "managed_ad_id", "report_date", "dataset", name="uq_ad_insight_snapshot"
        ),
    )


class ApiRequest(Base):
    __tablename__ = "delivery_api_requests"
    platform = Column(String(12), nullable=False, default="meta", server_default="meta", index=True)
    id = Column(String(36), primary_key=True, default=new_id)
    account_id = Column(String(80), index=True)
    lane = Column(String(20), nullable=False)
    cost = Column(Integer, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    finished_at = Column(DateTime(timezone=True))


class ApiCooldown(Base):
    __tablename__ = "delivery_api_cooldowns"
    scope = Column(String(100), primary_key=True)
    until = Column(DateTime(timezone=True), nullable=False)


class ProviderCache(Base):
    __tablename__ = "delivery_provider_cache"
    key = Column(String(160), primary_key=True)
    payload = Column(JSON, nullable=False)
    fetched_at = Column(DateTime(timezone=True), nullable=False)


class StagedInsight(Base):
    __tablename__ = "delivery_staged_insights"
    sync_id = Column(
        String(36),
        ForeignKey("delivery_syncs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ad_id = Column(String(80), primary_key=True)
    report_date = Column(Date, primary_key=True)
    payload = Column(JSON, nullable=False)


class DeliveryPostAttempt(Base):
    __tablename__ = "delivery_post_attempts"
    id = Column(String(36), primary_key=True, default=new_id)
    job_id = Column(
        String(36),
        ForeignKey("delivery_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_at = Column(DateTime(timezone=True), nullable=False, index=True)
    finished_at = Column(DateTime(timezone=True))


class DeliveryNotification(Base):
    __tablename__ = "delivery_notifications"
    id = Column(String(36), primary_key=True, default=new_id)
    job_id = Column(
        String(36), ForeignKey("delivery_jobs.id", ondelete="CASCADE"), nullable=False
    )
    failure_id = Column(String(36), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    read_at = Column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint(
            "user_id", "failure_id", name="uq_delivery_failure_notification"
        ),
        Index("ix_delivery_notifications_user", "user_id", "read_at", "created_at"),
    )
