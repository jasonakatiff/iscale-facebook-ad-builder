from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import ClickflareConfig, ClickflareMapping, User
from app.services.clickflare_service import ClickflareService
from app.core.deps import get_current_active_user

router = APIRouter()


def get_clickflare_config(db: Session) -> Optional[ClickflareConfig]:
    return db.query(ClickflareConfig).filter(ClickflareConfig.is_active == True).first()


def get_service_from_db(db: Session) -> ClickflareService:
    config = get_clickflare_config(db)
    if not config:
        raise HTTPException(status_code=400, detail="Clickflare is not configured")
    return ClickflareService(api_key=config.api_key, tracking_domain=config.tracking_domain)


# --- Status ---

@router.get("/status")
def get_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    config = get_clickflare_config(db)
    return {
        "enabled": bool(config and config.is_active and config.api_key),
        "tracking_domain": config.tracking_domain if config else None,
    }


# --- Config ---

@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    config = get_clickflare_config(db)
    if not config:
        return {"configured": False}
    return {
        "configured": True,
        "api_key_masked": config.api_key[:8] + "..." if config.api_key else "",
        "tracking_domain": config.tracking_domain,
        "facebook_traffic_source_id": config.facebook_traffic_source_id,
        "facebook_pixel_id": config.facebook_pixel_id,
        "is_active": config.is_active,
    }


@router.post("/config")
async def save_config(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    config = get_clickflare_config(db)
    if config:
        if data.get("api_key"):
            config.api_key = data["api_key"]
        if data.get("tracking_domain"):
            config.tracking_domain = data["tracking_domain"]
        if "facebook_pixel_id" in data:
            config.facebook_pixel_id = data.get("facebook_pixel_id")
        if "is_active" in data:
            config.is_active = data["is_active"]
    else:
        if not data.get("api_key") or not data.get("tracking_domain"):
            raise HTTPException(status_code=400, detail="api_key and tracking_domain are required")
        config = ClickflareConfig(
            api_key=data["api_key"],
            tracking_domain=data["tracking_domain"],
            facebook_pixel_id=data.get("facebook_pixel_id"),
        )
        db.add(config)

    db.commit()
    db.refresh(config)
    return {"message": "Clickflare configuration saved", "id": config.id}


# --- Connection Test ---

@router.post("/test-connection")
async def test_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = get_service_from_db(db)
    try:
        result = await service.test_connection()
        return {"status": "success", "message": "Connected to Clickflare"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")


# --- Traffic Source Setup ---

@router.post("/setup-traffic-source")
async def setup_traffic_source(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = get_service_from_db(db)
    try:
        ts_id = await service.find_or_create_facebook_traffic_source()
        config = get_clickflare_config(db)
        if config:
            config.facebook_traffic_source_id = ts_id
            db.commit()
        return {"traffic_source_id": ts_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Traffic source setup failed: {str(e)}")


# --- Tracking URL ---

@router.post("/generate-tracking-url")
async def generate_tracking_url(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ad_name = data.get("ad_name", "Ad")
    destination_url = data.get("destination_url")
    facebook_ad_id = data.get("facebook_ad_id")

    if not destination_url:
        raise HTTPException(status_code=400, detail="destination_url is required")

    config = get_clickflare_config(db)
    if not config:
        raise HTTPException(status_code=400, detail="Clickflare is not configured")

    service = ClickflareService(api_key=config.api_key, tracking_domain=config.tracking_domain)
    traffic_source_id = config.facebook_traffic_source_id

    if not traffic_source_id:
        traffic_source_id = await service.find_or_create_facebook_traffic_source()
        config.facebook_traffic_source_id = traffic_source_id
        db.commit()

    try:
        result = await service.generate_tracking_url(
            ad_name=ad_name,
            destination_url=destination_url,
            traffic_source_id=traffic_source_id,
        )

        if facebook_ad_id:
            mapping = ClickflareMapping(
                facebook_ad_id=facebook_ad_id,
                original_url=destination_url,
                tracking_url=result["tracking_url"],
                cf_offer_id=result["offer_id"],
                cf_campaign_id=result["campaign_id"],
            )
            db.add(mapping)
            db.commit()

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate tracking URL: {str(e)}")


# --- Reporting ---

@router.get("/reports")
async def get_reports(
    date_from: str,
    date_to: str,
    group_by: str = "campaign",
    campaign_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = get_service_from_db(db)
    try:
        return await service.get_campaign_report(
            date_from=date_from,
            date_to=date_to,
            group_by=group_by,
            cf_campaign_id=campaign_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch reports: {str(e)}")


@router.get("/campaigns")
async def list_campaigns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = get_service_from_db(db)
    try:
        return await service.get_campaigns_list()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch campaigns: {str(e)}")
