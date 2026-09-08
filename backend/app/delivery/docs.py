"""Response contracts for OpenAPI; registration does not alter runtime responses."""

from datetime import date, datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field

from app.delivery.schemas import DeliveryConfig


class DeliveryValidationIssue(BaseModel):
    field: str
    message: str


class DeliveryErrorDetail(BaseModel):
    code: str
    message: str
    details: list[DeliveryValidationIssue] | None


class DeliveryError(BaseModel):
    error: DeliveryErrorDetail


class LegacyDeliveryConflict(BaseModel):
    detail: DeliveryError


class DeliveryPagination(BaseModel):
    total: int
    limit: int
    offset: int
    hasMore: bool


Item = TypeVar("Item")


class DeliveryList(BaseModel, Generic[Item]):
    data: list[Item]
    pagination: DeliveryPagination


class DeliveryJobResult(BaseModel):
    id: str
    owner_id: str | None
    name: str
    account_id: str
    kind: Literal["launch", "ad"]
    status: Literal[
        "queued", "working", "succeeded", "failed", "needs_reconciliation", "cancelled"
    ]
    stage: Literal["image", "video_upload", "video_ready", "creative", "ad", "complete"]
    results: dict[str, Any] = Field(
        description="Confirmed checkpoints only: image_hash, video_id, thumbnail_url, "
        "creative_id and ad_id when present. Do not resubmit an uncertain write."
    )
    created_at: datetime
    updated_at: datetime
    post_started_at: datetime | None
    finished_at: datetime | None
    error_message: str | None
    error_code: str | None
    provider_error_code: int | None
    provider_error_subcode: int | None
    retry_allowed: bool = Field(
        description="Manual retry is permitted only while status is failed and this is true."
    )
    failure_id: str | None = Field(
        description="Current terminal failure UUID. Send this exact value to retry."
    )
    write_failures: int = Field(
        description="Failed confirmed writes/pre-write attempts in the current retry cycle; "
        "resets on manual retry. Not a lifetime attempt count."
    )
    available_at: datetime
    generated_ad_id: str | None
    creative_asset_id: str | None
    creative_snapshot: dict[str, Any] | None


class DeliveryConfigResult(BaseModel):
    config: DeliveryConfig


class DeliverySettingsResult(DeliveryConfigResult):
    defaults: DeliveryConfig
    posting_heartbeat: datetime | None
    sync_heartbeat: datetime | None
    worker_enabled_on_this_server: bool


class DeliveryNotificationResult(BaseModel):
    id: str
    job_id: str
    name: str
    status: Literal["failed", "needs_reconciliation"]
    message: str
    created_at: datetime
    read_at: datetime | None


class DeliveryNotificationReadResult(BaseModel):
    id: str
    read_at: datetime


class DeliveryCandidate(BaseModel):
    id: str
    name: str


class DeliverySyncResult(BaseModel):
    id: str
    account_id: str
    kind: Literal["status", "performance"]
    status: Literal["idle", "running", "retry_wait", "waiting", "deferred", "failed"]
    failures: int
    next_run_at: datetime
    last_success_at: datetime | None
    last_reconciled_at: datetime | None
    error_message: str | None


class DeliverySyncRestartResult(BaseModel):
    id: str
    status: Literal["idle", "running", "retry_wait", "waiting", "deferred", "failed"]
    coalesced: bool


class DeliveryReportRow(BaseModel):
    id: str
    name: str
    account_id: str
    fb_ad_id: str
    launched_by_id: str | None
    launched_by_name: str | None
    creative_created_by_name: str | None
    creative_asset_id: str | None
    creative_snapshot: dict[str, Any] | None
    effective_status: str | None
    report_date: date
    currency: str
    account_timezone: str
    impressions: str
    clicks: str
    spend: str = Field(description="Exact decimal string in account currency.")
    actions: list[Any]
    imported_at: datetime


class DeliveryReportResult(DeliveryList[DeliveryReportRow]):
    dataset: str


ERROR_RESPONSES = {
    429: {
        "model": DeliveryError,
        "description": "REQUEST_BUDGET_BUSY: shared Meta capacity is unavailable. Honor Retry-After.",
        "headers": {
            "Retry-After": {
                "description": "Seconds until another attempt.",
                "schema": {"type": "string"},
            }
        },
    },
    401: {
        "model": DeliveryError,
        "description": "Missing, invalid or expired Bearer credentials.",
    },
    403: {
        "model": DeliveryError,
        "description": "Inactive user, insufficient key scope, role or permission.",
    },
    422: {
        "model": DeliveryError,
        "description": "Invalid fields, inconsistent limits, missing ad set, or missing/not-ready/mismatched creative; correct input before resubmitting.",
    },
}
NOT_FOUND = {
    404: {
        "model": DeliveryError,
        "description": "NOT_FOUND: absent or inaccessible resource.",
    }
}
CONFLICT = {
    409: {
        "model": DeliveryError,
        "description": "State or identity conflict; inspect error.code and refresh the resource.",
    }
}
PROVIDER_READ_ERROR = {
    502: {
        "model": DeliveryError,
        "description": "FACEBOOK_READ_FAILED: provider lookup did not complete.",
    }
}
