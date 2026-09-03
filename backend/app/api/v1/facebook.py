from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
from app.services.facebook_service import FacebookService
from app.models import FacebookAd, FacebookAdSet, FacebookCampaign, User
from app.database import get_db
from app.core.deps import get_current_active_user, require_permission
from sqlalchemy.orm import Session

router = APIRouter()

def get_facebook_service():
    service = FacebookService()
    try:
        if not service.api:
            service.initialize()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return service

@router.get("/accounts")
def get_ad_accounts(
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    try:
        return service.get_ad_accounts()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/campaigns")
def read_campaigns(
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    try:
        campaigns = service.get_campaigns(ad_account_id)
        # Convert FB objects to dicts
        return [dict(c) for c in campaigns]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/campaigns")
def create_campaign(
    campaign: Dict[str, Any],
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    try:
        # Check if ad_account_id is in query or body (body takes precedence if we structured it that way, but here we use query or separate param)
        # For POST, usually better to have it in the body or query. Let's support query for consistency with GET
        result = service.create_campaign(campaign, ad_account_id)
        return dict(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pixels")
def read_pixels(
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    try:
        pixels = service.get_pixels(ad_account_id)
        # Convert FB objects to dicts
        return [dict(p) for p in pixels]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pages")
def read_pages(
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    try:
        pages = service.get_pages()
        return pages
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/adsets")
def read_adsets(
    ad_account_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    try:
        adsets = service.get_adsets(ad_account_id, campaign_id)
        return [dict(a) for a in adsets]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/adsets")
def create_adset(
    adset: Dict[str, Any],
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    try:
        result = service.create_adset(adset, ad_account_id)
        return dict(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/creatives")
def create_creative(
    creative: Dict[str, Any],
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    try:
        result = service.create_creative(creative, ad_account_id)
        return dict(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ads")
def create_ad(
    ad: Dict[str, Any],
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    try:
        result = service.create_ad(ad, ad_account_id)
        return dict(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ads")
def read_ads(
    adset_id: str,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    try:
        ads = service.get_ads(adset_id)
        return [dict(a) for a in ads]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights")
def read_insights(
    ad_account_id: Optional[str] = None,
    level: str = "campaign",
    date_preset: str = "last_30d",
    since: Optional[str] = None,
    until: Optional[str] = None,
    breakdown: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user),
):
    """Return Facebook Marketing API insights (spend, impressions, CTR, ROAS, etc.).

    Pass either date_preset (today/yesterday/last_7d/last_30d/last_90d/maximum)
    or since+until (YYYY-MM-DD) for a custom range. Level is account/campaign/adset/ad.
    """
    try:
        time_range = None
        if since and until:
            time_range = {"since": since, "until": until}
        rows = service.get_insights(
            ad_account_id=ad_account_id,
            level=level,
            date_preset=date_preset,
            time_range=time_range,
            breakdown=breakdown,
        )
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/campaigns/save")
def save_campaign_locally(
    campaign_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    try:
        # Check if exists
        existing = db.query(FacebookCampaign).filter(FacebookCampaign.id == campaign_data.get('id')).first()
        if existing:
            return {"message": "Campaign already exists", "id": existing.id}

        # Handle daily_budget casting
        daily_budget = campaign_data.get('dailyBudget')
        if daily_budget is not None:
            daily_budget = int(float(daily_budget))

        new_campaign = FacebookCampaign(
            id=campaign_data.get('id'),
            name=campaign_data.get('name'),
            objective=campaign_data.get('objective'),
            budget_type=campaign_data.get('budgetType', 'ABO'),
            daily_budget=daily_budget,
            bid_strategy=campaign_data.get('bidStrategy'),
            status=campaign_data.get('status'),
            fb_campaign_id=campaign_data.get('fbCampaignId')
        )
        db.add(new_campaign)
        db.commit()
        db.refresh(new_campaign)
        return {"message": "Campaign saved locally", "id": new_campaign.id}
    except Exception as e:
        db.rollback()
        print(f"Error saving campaign locally: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/adsets/save")
def save_adset_locally(
    adset_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    try:
        # Check if exists
        existing = db.query(FacebookAdSet).filter(FacebookAdSet.id == adset_data.get('id')).first()
        if existing:
            return {"message": "AdSet already exists", "id": existing.id}
            
        # Ensure campaign exists (FK check)
        campaign_id = adset_data.get('campaignId')
        if not campaign_id:
             raise HTTPException(status_code=400, detail="campaignId is required")
             
        # We assume campaign is already saved by the frontend calling /campaigns/save first

        # Handle numeric fields casting
        daily_budget = adset_data.get('dailyBudget')
        if daily_budget is not None:
            daily_budget = int(float(daily_budget))
            
        bid_amount = adset_data.get('bidAmount')
        if bid_amount is not None:
            bid_amount = int(float(bid_amount))

        new_adset = FacebookAdSet(
            id=adset_data.get('id'),
            campaign_id=campaign_id,
            name=adset_data.get('name'),
            optimization_goal=adset_data.get('optimizationGoal'),
            daily_budget=daily_budget,
            bid_strategy=adset_data.get('bidStrategy'),
            bid_amount=bid_amount,
            targeting=adset_data.get('targeting'),
            pixel_id=adset_data.get('pixelId'),
            conversion_event=adset_data.get('conversionEvent'),
            status=adset_data.get('status'),
            fb_adset_id=adset_data.get('fbAdsetId')
        )
        db.add(new_adset)
        db.commit()
        db.refresh(new_adset)
        return {"message": "AdSet saved locally", "id": new_adset.id}
    except Exception as e:
        db.rollback()
        print(f"Error saving adset locally: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ads/save")
def save_ad_locally(
    ad_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    try:
        # Check if adset exists locally, if not we might need to create it or handle error
        # For now, assuming adset exists or we just save the ID

        new_ad = FacebookAd(
            id=ad_data.get('id'),
            adset_id=ad_data.get('adsetId'),
            name=ad_data.get('name'),
            creative_name=ad_data.get('creativeName'),
            image_url=ad_data.get('imageUrl'),
            # Video support fields
            media_type=ad_data.get('mediaType', 'image'),
            video_url=ad_data.get('videoUrl'),
            video_id=ad_data.get('videoId'),
            thumbnail_url=ad_data.get('thumbnailUrl'),
            bodies=ad_data.get('bodies'),
            headlines=ad_data.get('headlines'),
            description=ad_data.get('description'),
            cta=ad_data.get('cta'),
            website_url=ad_data.get('websiteUrl'),
            status=ad_data.get('status'),
            fb_ad_id=ad_data.get('fbAdId'),
            fb_creative_id=ad_data.get('fbCreativeId')
        )
        db.add(new_ad)
        db.commit()
        db.refresh(new_ad)
        return {"message": "Ad saved locally", "id": new_ad.id}
    except Exception as e:
        db.rollback()
        print(f"Error saving ad locally: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-image")
def upload_image(
    data: Dict[str, str],
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    try:
        image_url = data.get("image_url")
        if not image_url:
            raise HTTPException(status_code=400, detail="image_url is required")
        image_hash = service.upload_image(image_url, ad_account_id)
        return {"image_hash": image_hash}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-video")
def upload_video(
    data: Dict[str, Any],
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(require_permission("campaigns:write"))
):
    """Upload a video to Facebook Ad Library.

    Request body:
        video_url: URL of the video to upload
        wait_for_ready: Whether to wait for processing (default True)
        timeout: Max seconds to wait (default 600)

    Returns:
        video_id: Facebook video ID
        status: 'processing', 'ready', or 'error'
        thumbnails: List of auto-generated thumbnail URLs (if ready)
    """
    video_url = data.get("video_url")
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")

    try:
        wait_for_ready = data.get("wait_for_ready", True)
        timeout = data.get("timeout", 600)

        result = service.upload_video(
            video_url,
            ad_account_id,
            wait_for_ready=wait_for_ready,
            timeout=timeout
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/video-status/{video_id}")
def get_video_status(
    video_id: str,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    """Check the processing status of a video.

    Returns:
        status: 'processing', 'ready', or 'error'
        video_id: The video ID
        length: Video duration in seconds (if ready)
    """
    try:
        return service.get_video_status(video_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/video-thumbnails/{video_id}")
def get_video_thumbnails(
    video_id: str,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    """Get auto-generated thumbnails for a video.

    Returns:
        thumbnails: List of thumbnail URLs
    """
    try:
        thumbnails = service.get_video_thumbnails(video_id)
        return {"thumbnails": thumbnails}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/locations/search")
def search_locations(
    q: str,
    type: str = "city",
    limit: int = 10,
    ad_account_id: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user)
):
    try:
        locations = service.search_locations(q, type, limit, ad_account_id)
        return [dict(loc) for loc in locations]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

