from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import GeneratedAd, User
from app.core.deps import get_current_active_user, require_permission
from fastapi.responses import StreamingResponse
import io
import csv

from pydantic import BaseModel
from typing import Dict, Any

class ImageGenerationRequest(BaseModel):
    template: Optional[Dict[str, Any]] = None
    brand: Optional[Dict[str, Any]] = None
    product: Optional[Dict[str, Any]] = None
    copy: Optional[Dict[str, Any]] = None
    count: int = 1
    imageSizes: List[Dict[str, Any]] = []
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

import os
import asyncio
import uuid
import httpx
from pathlib import Path
from app.core.config import settings

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None

# Setup uploads directory
UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "uploads"
UPLOAD_DIR = UPLOAD_DIR.resolve()
os.makedirs(UPLOAD_DIR, mode=0o755, exist_ok=True)

# Map frontend aspect ratios from width/height to string format
def get_aspect_ratio(width: int, height: int) -> str:
    """Convert width/height to aspect ratio string for Imagen API."""
    ratio_map = {
        (1080, 1080): "1:1",
        (1080, 1350): "3:4",
        (1080, 1920): "9:16",
        (1920, 1080): "16:9",
    }
    return ratio_map.get((width, height), "1:1")

def save_image_bytes(image_bytes: bytes, prefix: str = "generated") -> str:
    """Save image bytes to local uploads directory. Returns the local URL path."""
    unique_id = str(uuid.uuid4())
    filename = f"{prefix}_{unique_id}.png"
    file_path = UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(image_bytes)
    return f"/uploads/{filename}"

@router.post("/generate-image")
async def generate_image(
    request: ImageGenerationRequest,
    current_user: User = Depends(require_permission("ads:write"))
):
    """Generate ad images using Google Imagen 4 (with mock fallback)"""

    images = []
    use_imagen = settings.imagen_enabled and genai

    imagen_client = None
    if use_imagen:
        imagen_client = genai.Client(api_key=settings.GEMINI_API_KEY)
        print(f"Generating images with Imagen 4 using key: {settings.GEMINI_API_KEY[:8]}...")

    for i in range(request.count):
        for size in request.imageSizes:
            width = size.get('width', 1080)
            height = size.get('height', 1080)
            size_name = size.get('name', 'Square')
            aspect_ratio = size.get('aspectRatio') or get_aspect_ratio(width, height)

            # Build comprehensive prompt using old system logic
            prompt = build_comprehensive_prompt(request)

            print(f"\n{'='*80}")
            print(f"IMAGE GENERATION REQUEST")
            print(f"{'='*80}")
            print(f"Brand: {request.brand.get('name') if request.brand else 'None'}")
            print(f"Product: {request.product.get('name') if request.product else 'None'}")
            print(f"Template Type: {request.template.get('type') if request.template else 'None'}")
            print(f"Copy Headline: {request.copy.get('headline') if request.copy else 'None'}")
            print(f"Size: {size_name} ({width}x{height}, aspect_ratio={aspect_ratio})")
            print(f"\nFULL GENERATED PROMPT:")
            print(f"{prompt}")
            print(f"{'='*80}\n")

            if use_imagen and imagen_client:
                try:
                    model = settings.IMAGEN_MODEL
                    print(f"Calling Imagen 4: model={model}, aspect_ratio={aspect_ratio}")

                    result = imagen_client.models.generate_images(
                        model=model,
                        prompt=prompt,
                        config=genai_types.GenerateImagesConfig(
                            number_of_images=1,
                            aspect_ratio=aspect_ratio,
                            person_generation="allow_adult",
                        ),
                    )

                    if result.generated_images:
                        image_bytes = result.generated_images[0].image.image_bytes
                        image_url = save_image_bytes(image_bytes, prefix="generated")
                        print(f"Saved locally as: {image_url}")
                    else:
                        print("Imagen returned no images")
                        image_url = f"https://placehold.co/{width}x{height}/png?text=No+Image+Returned"

                except Exception as e:
                    print(f"Imagen generation failed: {e}")
                    import traceback
                    traceback.print_exc()
                    image_url = f"https://placehold.co/{width}x{height}/png?text=Generation+Error"
            else:
                # Mock generation (no GEMINI_API_KEY configured)
                image_url = f"https://placehold.co/{width}x{height}/png?text=No+AI+Key+Configured"

            images.append({
                "url": image_url,
                "size": size_name,
                "dimensions": f"{width}x{height}",
                "prompt": prompt
            })

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

        # Validate template_id exists in DB (style archetypes are frontend-only)
        template_id = ad_data.templateId
        if template_id:
            from app.models import WinningAd
            template_exists = db.query(WinningAd).filter(WinningAd.id == template_id).first()
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
        db.rollback()
        import traceback
        traceback.print_exc()
        print(f"Batch save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
