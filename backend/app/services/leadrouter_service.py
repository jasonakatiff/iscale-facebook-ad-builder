"""Native read adapter. No posting credentials or unfiltered provider payloads escape."""

import time
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.schemas.platform import Pagination

LEADROUTER_ORIGIN = "https://theleadrouter.com"
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_CATALOG_PAGES = 100
LOOKUP_TIMEOUT_SECONDS = 20


class Campaign(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: UUID
    displayId: int | None = None
    name: str = Field(max_length=500)
    offerId: UUID | None = None
    offerName: str | None = Field(default=None, max_length=500)
    verticalName: str | None = Field(default=None, max_length=500)
    status: str = Field(max_length=50)
    leadCount: int | None = Field(default=None, ge=0, strict=True)


class CampaignList(BaseModel):
    data: list[Campaign]
    pagination: Pagination
    fetchedAt: datetime


def make_client():
    return httpx.Client(timeout=8, follow_redirects=False, trust_env=False)


def request_json(key, path, params=None):
    # Callers supply only constant paths and validated pagination, never user URLs.
    if path not in {"/api/partner/me", "/api/partner/campaigns", "/api/v1/campaigns"}:
        raise ValueError("Unsupported LeadRouter operation")
    try:
        with make_client() as client:
            with client.stream(
                "GET",
                LEADROUTER_ORIGIN + path,
                params=params,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Accept": "application/json",
                },
            ) as response:
                if response.status_code in {401, 403}:
                    raise HTTPException(
                        422,
                        "LeadRouter rejected this key or its permissions. Use a portal or organization API key with campaign read access.",
                    )
                if response.status_code == 429:
                    raise HTTPException(
                        503, "LeadRouter is rate limiting requests. Try again shortly."
                    )
                if response.status_code != 200:
                    raise HTTPException(
                        502, "LeadRouter could not complete this request. Try again."
                    )
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_RESPONSE_BYTES:
                        raise HTTPException(
                            502,
                            "LeadRouter returned too much data. Try again with a smaller page.",
                        )
                import json

                value = json.loads(body)
                if not isinstance(value, dict):
                    raise ValueError()
                return value
    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            502, "LeadRouter is unavailable or returned an invalid response. Try again."
        ) from None


def campaigns(key, account_type, limit=100, offset=0):
    path = (
        "/api/partner/campaigns" if account_type == "partner" else "/api/v1/campaigns"
    )
    body = request_json(key, path, {"limit": limit, "offset": offset})
    try:
        result = CampaignList.model_validate(
            {**body, "fetchedAt": datetime.now(timezone.utc)}
        )
        page = result.pagination
        if (
            len(result.data) > limit
            or page.limit != limit
            or page.offset != offset
            or page.total < offset + len(result.data)
            and result.data
            or page.hasMore
            and not result.data
        ):
            raise ValueError()
        return result
    except (ValidationError, ValueError):
        raise HTTPException(
            502, "LeadRouter returned an invalid campaign list. Try again."
        ) from None


def validate_connection(key, account_type):
    partner_id = None
    name = "LeadRouter organization"
    if account_type == "partner":
        body = request_json(key, "/api/partner/me")
        try:
            data = body["data"]
            partner_id = str(UUID(data["partnerId"]))
            name = data.get("partnerName") or "LeadRouter partner"
            if (
                data["role"] != "partner"
                or not isinstance(name, str)
                or len(name) > 500
            ):
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise HTTPException(
                502, "LeadRouter returned an invalid account identity."
            ) from None
    campaigns(key, account_type, limit=1)
    return name, partner_id


def find_campaign(key, account_type, campaign_id):
    deadline = time.monotonic() + LOOKUP_TIMEOUT_SECONDS
    for index in range(MAX_CATALOG_PAGES):
        if time.monotonic() >= deadline:
            break
        result = campaigns(key, account_type, offset=index * 100)
        for row in result.data:
            if str(row.id) == str(campaign_id):
                return row
        if not result.pagination.hasMore:
            raise HTTPException(
                422,
                "This LeadRouter campaign is no longer available to your account. Choose another campaign.",
            )
    raise HTTPException(
        503, "The LeadRouter campaign list could not be checked in time. Try again."
    )
