from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class DeliveryConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    min_interval_seconds: int = Field(default=2, ge=1, le=3600)
    max_posts: int = Field(default=30, ge=1, le=10000)
    window_seconds: int = Field(default=60, ge=1, le=86400)
    max_read_retries: int = Field(default=3, ge=0, le=10)
    status_interval_seconds: int = Field(default=300, ge=60, le=86400)
    performance_interval_seconds: int = Field(default=900, ge=60, le=86400)
    paused: bool = False
    imports_enabled: bool = True


class LaunchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_key: str = Field(min_length=1, max_length=160)
    account_id: str = Field(pattern=r"^(act_)?[0-9]+$")
    name: str = Field(min_length=1, max_length=160)
    local_adset_id: str = Field(min_length=1, max_length=160)
    page_id: str = Field(pattern=r"^[0-9]+$")
    media_url: HttpUrl
    media_type: Literal["image", "video"]
    thumbnail_url: Optional[HttpUrl] = None
    primary_text: str = Field(max_length=10000)
    headline: str = Field(max_length=1000)
    description: str = Field(default="", max_length=1000)
    website_url: HttpUrl
    cta: str = Field(default="LEARN_MORE", pattern=r"^[A-Z_]{1,50}$")
    status: Literal["ACTIVE", "PAUSED"] = "PAUSED"
    resume_creative_id: Optional[str] = Field(default=None, pattern=r"^[0-9]+$")
    generated_ad_id: Optional[str] = None
    instagram_user_id: Optional[str] = Field(default=None, pattern=r"^[0-9]+$")
    url_tags: str = Field(default="", max_length=2000)

    @field_validator("media_url", "thumbnail_url", "website_url")
    @classmethod
    def no_url_credentials(cls, value):
        if value and (value.username or value.password):
            raise ValueError("URLs cannot contain credentials")
        return value

    @field_validator("account_id")
    @classmethod
    def normalize_account(cls, value):
        return value if value.startswith("act_") else "act_" + value


class AdRequest(BaseModel):
    # Legacy callers include wizard-only fields; only these values reach Meta.
    name: str = Field(min_length=1, max_length=160)
    adset_id: str = Field(pattern=r"^[0-9]+$")
    creative_id: str = Field(pattern=r"^[0-9]+$")
    status: Literal["ACTIVE", "PAUSED"] = "PAUSED"


class ReconcileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fb_ad_id: str = Field(pattern=r"^[0-9]+$")
