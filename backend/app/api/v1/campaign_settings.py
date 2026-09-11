from app.telemetry.runtime import capture_exception
from typing import Any, Dict, List
from urllib.parse import urlparse
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from app.core.deps import get_current_active_user, require_permission
from app.database import get_db
from app.models import CampaignPreset, CampaignPreference, User
from app.services.campaign_validation import (
    CampaignValidationError,
    campaign_params,
    adset_params,
    validate_objective,
)


class SettingsRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def route(request):
            try:
                return await handler(request)
            except RequestValidationError as error:
                capture_exception(error, "campaign_settings.route")
                details = [
                    {"field": ".".join(map(str, item["loc"])), "message": item["msg"]}
                    for item in error.errors()
                ]
                return failure(
                    422, "VALIDATION_ERROR", "Check the supplied settings.", details
                )
            except HTTPException as error:
                capture_exception(error, "campaign_settings.route")
                return failure(
                    error.status_code,
                    (
                        "UNAUTHORIZED"
                        if error.status_code == 401
                        else (
                            "FORBIDDEN"
                            if error.status_code == 403
                            else "REQUEST_FAILED"
                        )
                    ),
                    str(error.detail),
                )

        return route


router = APIRouter(route_class=SettingsRoute)


def failure(status, code, message, details=None):
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details}},
    )


class PresetRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    vertical: str = Field(default="", max_length=120)
    ad_account_id: str = Field(min_length=1, max_length=80)
    settings: Dict[str, Any]

    @validator("name")
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Preset name is required.")
        return value.strip()

    @validator("settings")
    def settings_only(cls, value):
        allowed = {
            "campaignData": {
                "objective",
                "budgetType",
                "dailyBudget",
                "bidStrategy",
                "bidAmount",
                "status",
                "specialAdCategories",
                "specialAdCategoryCountries",
            },
            "adsetData": {
                "optimizationGoal",
                "dailyBudget",
                "bidStrategy",
                "bidAmount",
                "targeting",
                "advantageAudience",
                "pixelId",
                "conversionEvent",
                "attributionSetting",
                "status",
            },
            "creativeData": {
                "bodies",
                "headlines",
                "description",
                "cta",
                "websiteUrl",
                "pageId",
                "instagramId",
                "urlParameters",
            },
        }
        for section, data in value.items():
            if (
                section not in allowed
                or not isinstance(data, dict)
                or set(data) - allowed[section]
            ):
                raise ValueError(
                    "Preset contains unsupported fields. Save settings without IDs, files, or credentials."
                )
        return value

    class Config:
        extra = "forbid"


def preset_json(row):
    return {
        "id": row.id,
        "name": row.name,
        "vertical": row.vertical,
        "ad_account_id": row.ad_account_id,
        "settings": row.settings,
        "updated_at": row.updated_at.astimezone(timezone.utc).isoformat(),
    }


@router.get("/presets")
def list_presets(
    ad_account_id: str = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    query = db.query(CampaignPreset).filter(CampaignPreset.user_id == user.id)
    if ad_account_id:
        query = query.filter(CampaignPreset.ad_account_id == ad_account_id)
    total = query.count()
    rows = (
        query.order_by(CampaignPreset.name, CampaignPreset.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "data": [preset_json(row) for row in rows],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + len(rows) < total,
        },
    }


@router.post("/presets", status_code=201)
def create_preset(
    payload: PresetRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    row = CampaignPreset(
        user_id=user.id,
        name=payload.name,
        vertical=payload.vertical,
        ad_account_id=payload.ad_account_id,
        settings=payload.settings,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return preset_json(row)


@router.put("/presets/{preset_id}")
def update_preset(
    preset_id: str,
    payload: PresetRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    row = db.query(CampaignPreset).filter_by(id=preset_id, user_id=user.id).first()
    if not row:
        return failure(404, "NOT_FOUND", "Preset not found.")
    row.name, row.vertical, row.ad_account_id, row.settings = (
        payload.name,
        payload.vertical,
        payload.ad_account_id,
        payload.settings,
    )
    db.commit()
    db.refresh(row)
    return preset_json(row)


@router.delete("/presets/{preset_id}", status_code=204)
def delete_preset(
    preset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    row = db.query(CampaignPreset).filter_by(id=preset_id, user_id=user.id).first()
    if not row:
        return failure(404, "NOT_FOUND", "Preset not found.")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


class PreferenceRequest(BaseModel):
    urlParameters: str = Field(max_length=2048)

    @validator("urlParameters")
    def valid_parameters(cls, value):
        if value.startswith("?") or any(c.isspace() for c in value) or "#" in value:
            raise ValueError(
                "Use URL parameters without a leading ?, whitespace, or #."
            )
        return value

    class Config:
        extra = "forbid"


@router.get("/tracking-defaults")
def get_tracking_defaults(
    ad_account_id: str = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    account = (
        db.get(CampaignPreference, f"user:{user.id}:account:{ad_account_id}")
        if ad_account_id
        else None
    )
    system = db.get(CampaignPreference, "system")
    return {
        "urlParameters": (
            (account or system).settings["urlParameters"] if account or system else None
        ),
        "scope": "account" if account else "system",
    }


@router.put("/tracking-defaults")
def save_tracking_defaults(
    payload: PreferenceRequest,
    scope: str = Query("account", regex="^(account|system)$"),
    ad_account_id: str = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    if scope == "system" and not (
        user.is_superuser or any(role.name == "admin" for role in user.roles)
    ):
        return failure(
            403, "FORBIDDEN", "Only administrators can change system tracking defaults."
        )
    if scope == "account" and not ad_account_id:
        return failure(400, "ACCOUNT_REQUIRED", "Select an ad account.")
    key = "system" if scope == "system" else f"user:{user.id}:account:{ad_account_id}"
    settings = {"urlParameters": payload.urlParameters}
    db.execute(
        insert(CampaignPreference)
        .values(id=key, settings=settings)
        .on_conflict_do_update(
            index_elements=["id"],
            set_={"settings": settings, "updated_at": datetime.now(timezone.utc)},
        )
    )
    db.commit()
    return settings


class PreflightRequest(BaseModel):
    ad_account_id: str = Field(min_length=1)
    campaignData: Dict[str, Any]
    adsetData: Dict[str, Any]
    creativeData: Dict[str, Any]
    adsData: List[Dict[str, Any]] = Field(min_length=1, max_length=500)

    class Config:
        extra = "forbid"


@router.post("/preflight")
def preflight(
    payload: PreflightRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("campaigns:write")),
):
    from app.api.v1.facebook import get_facebook_service
    from facebook_business.adobjects.campaign import Campaign
    from facebook_business.adobjects.adset import AdSet

    service = get_facebook_service(db, user)
    try:
        account = service.get_account_details(payload.ad_account_id)
        campaign, adset, creative = (
            dict(payload.campaignData),
            dict(payload.adsetData),
            payload.creativeData,
        )
        if (
            not adset.get("isExisting")
            or (not campaign.get("isExisting") and campaign.get("budgetType") == "CBO")
        ) and account.get("min_daily_budget") is None:
            raise CampaignValidationError(
                "Ad account minimum daily budget is unavailable. Sync the ad account."
            )
        if campaign.get("isExisting"):
            live = dict(
                Campaign(campaign.get("fbCampaignId"), api=service.api).api_get(
                    fields=[
                        "id",
                        "name",
                        "objective",
                        "account_id",
                        "daily_budget",
                        "lifetime_budget",
                        "status",
                    ]
                )
            )
            if str(live["account_id"]) != payload.ad_account_id.removeprefix("act_"):
                raise CampaignValidationError(
                    "Existing campaign belongs to another ad account."
                )
            campaign["objective"] = live["objective"]
            campaign["budgetType"] = (
                "CBO"
                if live.get("daily_budget") or live.get("lifetime_budget")
                else "ABO"
            )
            campaign_review = live
        else:
            if not campaign.get("name", "").strip():
                raise CampaignValidationError("Campaign Name is required.")
            campaign_review = campaign_params({**campaign, "status": "PAUSED"})
            if campaign_review.get(
                "daily_budget", int(account.get("min_daily_budget") or 1)
            ) < int(account.get("min_daily_budget") or 1):
                raise CampaignValidationError(
                    "Campaign budget is below the ad account minimum."
                )
            if campaign_review["special_ad_categories"] and not campaign.get(
                "specialAdCategoryCountries"
            ):
                raise CampaignValidationError(
                    "Select countries for the Special Ad Category."
                )
        if adset.get("isExisting"):
            adset_review = dict(
                AdSet(adset.get("fbAdsetId"), api=service.api).api_get(
                    fields=[
                        "id",
                        "name",
                        "campaign_id",
                        "targeting",
                        "status",
                        "optimization_goal",
                        "promoted_object",
                        "daily_budget",
                        "start_time",
                    ]
                )
            )
            if adset_review["campaign_id"] != campaign.get("fbCampaignId"):
                raise CampaignValidationError(
                    "Existing ad set belongs to another campaign."
                )
        else:
            if not adset.get("name", "").strip():
                raise CampaignValidationError("Ad Set Name is required.")
            validate_objective(
                campaign["objective"],
                adset.get("optimizationGoal"),
                adset.get("conversionEvent"),
            )
            adset.update(
                objective=campaign["objective"],
                campaign_id=campaign.get("fbCampaignId") or "<new campaign>",
                budgetType=campaign["budgetType"],
            )
            if campaign["budgetType"] == "CBO":
                adset.update(
                    bidStrategy=campaign.get("bidStrategy"),
                    bidAmount=campaign.get("bidAmount"),
                )
            adset_review = adset_params(
                {**adset, "status": "PAUSED"}, account.get("timezone_name")
            )
            minimum = int(account.get("min_daily_budget") or 1)
            if adset_review.get("daily_budget", minimum) < minimum:
                raise CampaignValidationError(
                    "Daily budget is below the ad account minimum."
                )
            if not adset_review["targeting"].get("geo_locations"):
                raise CampaignValidationError("Include at least one location.")
            if not adset_review.get("start_time") or datetime.fromisoformat(
                adset_review["start_time"].replace("Z", "+00:00")
            ) <= datetime.now(timezone.utc):
                raise CampaignValidationError("Start time must be in the future.")
        page_id = creative.get("pageId")
        if not page_id or page_id not in {
            page["id"] for page in service.get_pages(payload.ad_account_id)
        }:
            raise CampaignValidationError(
                "Select an accessible Facebook Page for this ad account."
            )
        instagram_id = creative.get("instagramId")
        if instagram_id and instagram_id not in {
            row["id"]
            for row in service.get_instagram_accounts(payload.ad_account_id)
        }:
            raise CampaignValidationError(
                "Select an accessible Instagram account, or leave it on the Facebook Page identity."
            )
        url = urlparse(creative.get("websiteUrl", ""))
        if url.scheme not in ("http", "https") or not url.netloc:
            raise CampaignValidationError("A valid Website URL is required.")
        PreferenceRequest(urlParameters=creative.get("urlParameters", ""))
        ads = []
        for ad in payload.adsData:
            if not ad.get("name", "").strip():
                raise CampaignValidationError("Every ad needs a name.")
            try:
                headline, body = (
                    creative["headlines"][ad["headlineIndex"]],
                    creative["bodies"][ad["bodyIndex"]],
                )
                media = next(
                    item
                    for item in creative["creatives"]
                    if item["id"] == ad["creativeId"]
                )
            except (KeyError, IndexError, StopIteration):
                raise CampaignValidationError(
                    "Ad variant references missing media or copy."
                )
            if not headline.strip() or not body.strip():
                raise CampaignValidationError(
                    "Each ad requires a nonempty headline and primary text."
                )
            ads.append(
                {
                    "name": ad["name"],
                    "status": "PAUSED",
                    "page_id": page_id,
                    "instagram_user_id": instagram_id,
                    "media": media.get("name"),
                    "media_type": media.get("mediaType", "image"),
                    "headline": headline,
                    "primary_text": body,
                    "description": creative.get("description", ""),
                    "cta": creative.get("cta", "LEARN_MORE"),
                    "website_url": creative["websiteUrl"],
                    "url_tags": creative.get("urlParameters", ""),
                }
            )
        return {
            "account": account,
            "campaign": campaign_review,
            "adset": adset_review,
            "ads": ads,
        }
    except CampaignValidationError as error:
        capture_exception(error, "campaign_settings.preflight")
        return failure(400, "INVALID_CAMPAIGN", error.user_message)
    except ValueError as error:
        capture_exception(error, "campaign_settings.preflight")
        return failure(400, "INVALID_CAMPAIGN", "Check the supplied campaign settings.")
    except Exception as error:
        capture_exception(error, "campaign_settings.preflight")
        return failure(
            502, "FACEBOOK_ERROR", "Facebook preflight failed. Try again later."
        )
