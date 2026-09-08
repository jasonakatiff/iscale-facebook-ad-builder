from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class SourceConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = True
    performance_interval_seconds: int = Field(14400, ge=900, le=86400)
    lookback_days: int = Field(2, ge=1, le=90)
    reconcile_days: int = Field(30, ge=1, le=90)
    reconcile_interval_hours: int = Field(24, ge=1, le=168)
    metadata_cache_hours: int = Field(24, ge=1, le=168)
    api_requests_per_minute: int = Field(60, ge=1, le=10000)
    api_daily_request_limit: int = Field(5000, ge=1, le=1000000)
    api_max_concurrency: int = Field(2, ge=1, le=10)
    max_read_retries: int = Field(3, ge=0, le=10)

    @model_validator(mode="after")
    def windows(self):
        if self.reconcile_days < self.lookback_days:
            raise ValueError("Correction window must cover the recent window")
        return self


class PatternConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: Literal["cpa", "roas", "ctr"] = "cpa"
    days: int = Field(28, ge=7, le=90)
    maturity_days: int = Field(2, ge=0, le=30)
    min_impressions: int = Field(1000, ge=100, le=10000000)
    min_cohort_creatives: int = Field(4, ge=4, le=100)
    min_cohort_conversions: int = Field(10, ge=1, le=10000)
    min_trait_creatives: int = Field(3, ge=3, le=100)
    winner_percent: int = Field(25, ge=10, le=50)
    max_fdr: float = Field(0.1, ge=0.01, le=0.2)
    meta_conversion_event: Literal[
        "offsite_conversion.fb_pixel_lead",
        "offsite_conversion.fb_pixel_purchase",
        "lead",
        "purchase",
    ] = "offsite_conversion.fb_pixel_lead"


class SourceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    platform: Literal["google", "tiktok"]
    connection_id: str = Field(min_length=1, max_length=80)


class SourceEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class CreativeLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    creative_asset_id: Optional[str] = Field(default=None, min_length=1, max_length=80)
    expected_revision: int = Field(ge=0)
