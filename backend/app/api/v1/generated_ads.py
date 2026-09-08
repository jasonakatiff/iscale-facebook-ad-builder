from app.telemetry.runtime import redact_values
from app.telemetry.runtime import capture_exception
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import GeneratedAd, User, WinningAd
from app.core.deps import get_current_active_user, require_permission
from fastapi.responses import StreamingResponse
import io
import csv

from pydantic import BaseModel, Field
from typing import Dict, Any

class ImageGenerationRequest(BaseModel):
    template: Optional[Dict[str, Any]] = None
    brand: Optional[Dict[str, Any]] = None
    product: Optional[Dict[str, Any]] = None
    copy: Optional[Dict[str, Any]] = None
    count: int = Field(default=1, ge=1, le=10)
    imageSizes: List[Dict[str, Any]] = Field(min_length=1, max_length=6)
    resolution: str = "1K"
    productShots: List[str] = []
    model: str = "nano-banana-pro"
    customPrompt: Optional[str] = None
    useProductImage: bool = False  # Use uploaded product image as base

def build_comprehensive_prompt(request: ImageGenerationRequest) -> str:
    """
    Build comprehensive prompt using old system's approach:
    - Product name + description
    - Brand name, voice, and primary color
    - Copy context (headline)
    - Template metadata (mood, lighting, composition, design_style)
    """
    
    # Custom prompt override
    if request.customPrompt:
        return request.customPrompt
    
    # Extract all context
    product_name = request.product.get('name', 'Product') if request.product else 'Product'
    product_desc = request.product.get('description', '') if request.product else ''
    brand_name = request.brand.get('name', '') if request.brand else ''
    brand_voice = request.brand.get('voice', 'Professional') if request.brand else 'Professional'
    brand_color = request.brand.get('colors', {}).get('primary', '') if request.brand else ''
    
    # Get template metadata
    template_type = request.template.get('type') if request.template else None
    
    if template_type == 'style':
        # Style archetype - has metadata fields
        mood = request.template.get('mood', 'Engaging')
        lighting = request.template.get('lighting', 'Professional lighting')
        composition = request.template.get('composition', 'Balanced')
        design_style = request.template.get('design_style', 'Modern')
    else:
        # Regular template - get from template data if available
        mood = request.template.get('mood', 'Engaging') if request.template else 'Engaging'
        lighting = request.template.get('lighting', 'Professional lighting') if request.template else 'Professional lighting'
        composition = request.template.get('composition', 'Balanced') if request.template else 'Balanced'
        design_style = request.template.get('design_style', 'Modern') if request.template else 'Modern'
    
    # Build comprehensive prompt (OLD SYSTEM STYLE)
    parts = [
        f"Product Photography of {product_name}",
        f"- {product_desc}" if product_desc else "",
        f"{brand_name} style: {brand_voice}" if brand_name else f"Style: {brand_voice}",
        f"Primary Color: {brand_color}" if brand_color else "",
    ]
    
    # Add copy context (headline)
    if request.copy and request.copy.get('headline'):
        parts.append(f"Context: Visual representation of \"{request.copy.get('headline')}\"")
    
    # Add template art direction
    parts.append(f"Art Direction: {mood}, {lighting}, {composition}, {design_style}")
    
    # Quality standards
    parts.append("High quality, photorealistic, 4k, advertising standard")
    
    # Join non-empty parts
    prompt = ". ".join([p for p in parts if p])
    
    return prompt

class GeneratedAdCreate(BaseModel):
    id: str
    brandId: Optional[str] = None
    productId: Optional[str] = None
    templateId: Optional[str] = None
    imageUrl: Optional[str] = None  # Now optional for video ads
    headline: Optional[str] = None
    body: Optional[str] = None
    cta: Optional[str] = None
    sizeName: Optional[str] = None
    dimensions: Optional[str] = None
    prompt: Optional[str] = None
    adBundleId: Optional[str] = None
    # Video support fields
    mediaType: Optional[str] = 'image'  # 'image' or 'video'
    videoUrl: Optional[str] = None
    videoId: Optional[str] = None  # Facebook video ID
    thumbnailUrl: Optional[str] = None

class BatchSaveRequest(BaseModel):
    ads: List[GeneratedAdCreate]

router = APIRouter()

import uuid
import httpx
from app.core.config import settings

try:
    import fal_client
except ImportError:
    fal_client = None

from app.services.provider_settings import require_provider_key
from app.services.generation_provider import generation_failure, record_result
from app.core.installation import InstallationError

def get_fal_aspect_ratio(width: int, height: int) -> str:
    """Map width/height to closest fal.ai aspect ratio string."""
    ratio = width / height
    ratios = [
        (1.0, "1:1"),
        (0.8, "4:5"),
        (0.5625, "9:16"),
        (0.75, "3:4"),
        (1.333, "4:3"),
        (1.778, "16:9"),
        (2.333, "21:9"),
    ]
    closest = min(ratios, key=lambda r: abs(r[0] - ratio))
    return closest[1]

async def download_and_save_image(image_url: str, prefix: str = "generated") -> str:
    from app.api.v1.uploads import upload_to_local, upload_to_r2
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            response = await client.get(image_url)
            response.raise_for_status()
        filename = f"{prefix}_{uuid.uuid4()}.png"
        if settings.r2_enabled:
            return await upload_to_r2(response.content, filename, "image/png")
        return await upload_to_local(response.content, filename)
    except Exception:
        raise InstallationError(
            "media_save_failed",
            "Your image was generated, but could not be saved. Download the generated image below before retrying storage; do not generate it again.",
            503, {"recovery_url": image_url},
        ) from None


@router.post("/generate-image")
async def generate_image(
    request: ImageGenerationRequest,
    current_user: User = Depends(require_permission("ads:write")),
    db: Session = Depends(get_db),
):
    key = require_provider_key("fal", db)
    if fal_client is None:
        raise InstallationError("provider_unavailable", "The image generation service is not installed. Contact your installation owner.", 503)
    provider_client = fal_client.AsyncClient(key=key)
    for size in request.imageSizes:
        width, height = size.get("width", 1080), size.get("height", 1080)
        if type(width) is not int or type(height) is not int or width <= 0 or height <= 0:
            raise InstallationError("invalid_image_size", "Select a valid image size.", 422)
    images = []
    for _ in range(request.count):
        for size in request.imageSizes:
            width, height = size.get("width", 1080), size.get("height", 1080)
            size_name = size.get("name", "Square")
            prompt = build_comprehensive_prompt(request)
            arguments = {"prompt": prompt, "aspect_ratio": get_fal_aspect_ratio(width, height)}
            model_id = "fal-ai/imagen4/preview" if request.model == "imagen4" else "fal-ai/nano-banana-pro"
            if request.useProductImage and request.productShots:
                model_id = "fal-ai/nano-banana-pro/edit"
                arguments.update(image_urls=request.productShots, output_format="png")
            try:
                with redact_values(key):
                    handler = await provider_client.submit(model_id, arguments=arguments)
                    result = await handler.get()
                    external_url = result["images"][0]["url"]
            except Exception as exc:
                code = getattr(getattr(exc, "response", None), "status_code", None)
                failure = generation_failure("fal", key, code)
                if images:
                    failure.details["completed_images"] = images
                raise failure from None
            record_result("fal", key, "connected")
            try:
                image_url = await download_and_save_image(external_url)
            except InstallationError as exc:
                exc.details["completed_images"] = images
                raise
            images.append({"url": image_url, "size": size_name,
                           "dimensions": f"{width}x{height}", "prompt": prompt})
    return {"images": images}

@router.get("/")
def get_generated_ads(
    brand_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all generated ads, optionally filtered by brand"""
    query = db.query(GeneratedAd)
    
    if brand_id:
        query = query.filter(GeneratedAd.brand_id == brand_id)
    
    ads = query.order_by(GeneratedAd.created_at.desc()).all()
    
    return [{
        "id": ad.id,
        "brand_id": ad.brand_id,
        "product_id": ad.product_id,
        "template_id": ad.template_id,
        "image_url": ad.image_url,
        "headline": ad.headline,
        "body": ad.body,
        "cta": ad.cta,
        "size_name": ad.size_name,
        "dimensions": ad.dimensions,
        "prompt": ad.prompt,
        "ad_bundle_id": ad.ad_bundle_id,
        "created_at": ad.created_at.isoformat() if ad.created_at else None,
        # Video support fields
        "media_type": ad.media_type or 'image',
        "video_url": ad.video_url,
        "video_id": ad.video_id,
        "thumbnail_url": ad.thumbnail_url
    } for ad in ads]

@router.delete("/{ad_id}")
def delete_generated_ad(
    ad_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ads:delete"))
):
    """Delete a generated ad by ID"""
    ad = db.query(GeneratedAd).filter(GeneratedAd.id == ad_id).first()
    
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    
    db.delete(ad)
    db.commit()
    
    return {"message": "Ad deleted successfully"}

@router.post("/export-csv")
def export_ads_csv(
    request: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Export selected ads to CSV"""
    ad_ids = request.get("ids", [])
    
    if not ad_ids:
        raise HTTPException(status_code=400, detail="No ad IDs provided")
    
    ads = db.query(GeneratedAd).filter(GeneratedAd.id.in_(ad_ids)).all()
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "ID", "Brand ID", "Headline", "Body", "CTA",
        "Size", "Dimensions", "Media Type", "Image URL", "Video URL", "Video ID", "Thumbnail URL", "Created At"
    ])

    # Write data
    for ad in ads:
        writer.writerow([
            ad.id,
            ad.brand_id or "",
            ad.headline or "",
            ad.body or "",
            ad.cta or "",
            ad.size_name or "",
            ad.dimensions or "",
            ad.media_type or "image",
            ad.image_url or "",
            ad.video_url or "",
            ad.video_id or "",
            ad.thumbnail_url or "",
            ad.created_at.isoformat() if ad.created_at else ""
        ])
    
    # Prepare response
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=generated-ads.csv"}
    )

@router.post("/batch")
def batch_save_ads(
    request: BatchSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ads:write"))
):
    """Batch save generated ads"""
    
    saved_ads = []
    for ad_data in request.ads:
        # Check if ad already exists
        existing = db.query(GeneratedAd).filter(GeneratedAd.id == ad_data.id).first()
        if existing:
            continue
            
        # The image-ad wizard also supports built-in style archetypes. Their
        # IDs are frontend-only and are not rows in winning_ads, so do not
        # place them in the template foreign key column.
        template_id = ad_data.templateId
        if template_id:
            template_exists = db.query(WinningAd.id).filter(WinningAd.id == template_id).first()
            if not template_exists:
                template_id = None

        new_ad = GeneratedAd(
            id=ad_data.id,
            brand_id=ad_data.brandId,
            product_id=ad_data.productId,
            template_id=template_id,
            image_url=ad_data.imageUrl,
            headline=ad_data.headline,
            body=ad_data.body,
            cta=ad_data.cta,
            size_name=ad_data.sizeName,
            dimensions=ad_data.dimensions,
            prompt=ad_data.prompt,
            ad_bundle_id=ad_data.adBundleId,
            # Video support fields
            media_type=ad_data.mediaType or 'image',
            video_url=ad_data.videoUrl,
            video_id=ad_data.videoId,
            thumbnail_url=ad_data.thumbnailUrl
        )
        db.add(new_ad)
        saved_ads.append(new_ad)
    
    try:
        db.commit()
        return {"message": f"Saved {len(saved_ads)} ads", "count": len(saved_ads)}
    except Exception as e:
        capture_exception(e, "generated_ads.batch_save_ads")
        db.rollback()
        import traceback
        print(f"Batch save error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
