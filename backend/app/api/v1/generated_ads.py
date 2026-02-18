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
from app.core.config import settings

try:
    import fal_client
except ImportError:
    fal_client = None

# Images are uploaded to R2 storage (no local filesystem)

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
    """
    Download image from external URL and upload to R2 storage.
    Falls back to returning original URL if R2 is not configured.
    """
    for attempt in range(2):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url, timeout=30.0)
                response.raise_for_status()

                unique_id = str(uuid.uuid4())
                filename = f"{prefix}_{unique_id}.png"

                if settings.r2_enabled:
                    from app.api.v1.uploads import get_s3_client
                    s3 = get_s3_client()
                    if s3:
                        s3.put_object(
                            Bucket=settings.R2_BUCKET_NAME,
                            Key=filename,
                            Body=response.content,
                            ContentType="image/png"
                        )
                        return f"{settings.R2_PUBLIC_URL}/{filename}"

                # R2 not available — return original fal.ai URL (not local path)
                return image_url
        except Exception as e:
            print(f"Error downloading image (attempt {attempt + 1}): {e}")
            if attempt == 1:
                return image_url
    return image_url

@router.post("/generate-image")
async def generate_image(
    request: ImageGenerationRequest,
    current_user: User = Depends(require_permission("ads:write"))
):
    """Generate ad images using Fal.ai (with mock fallback)"""
    
    images = []
    use_fal = settings.FAL_AI_API_KEY and fal_client
    
    if use_fal:
        os.environ["FAL_KEY"] = settings.FAL_AI_API_KEY
        print(f"Generating images with Fal.ai using key: {settings.FAL_AI_API_KEY[:5]}...")
    
    for i in range(request.count):
        for size in request.imageSizes:
            width = size.get('width', 1080)
            height = size.get('height', 1080)
            size_name = size.get('name', 'Square')
            
            # Build comprehensive prompt using old system logic
            prompt = build_comprehensive_prompt(request)
            
            print(f"\n{'='*80}")
            print(f"🎨 IMAGE GENERATION REQUEST")
            print(f"{'='*80}")
            print(f"📦 Brand: {request.brand.get('name') if request.brand else 'None'}")
            print(f"📦 Product: {request.product.get('name') if request.product else 'None'}")
            print(f"📦 Product Desc: {request.product.get('description') if request.product else 'None'}")
            print(f"📦 Template Type: {request.template.get('type') if request.template else 'None'}")
            print(f"📦 Copy Headline: {request.copy.get('headline') if request.copy else 'None'}")
            print(f"\n📝 FULL GENERATED PROMPT:")
            print(f"{prompt}")
            print(f"{'='*80}\n")
            
            if use_fal:
                try:
                    # Determine model and endpoint
                    if request.useProductImage and request.productShots:
                        # Use edit endpoint for image-to-image with product photo
                        model_id = "fal-ai/nano-banana-pro/edit"
                        print(f"Using product image: {request.productShots[0][:50]}...")
                        
                        arguments = {
                            "prompt": prompt,
                            "image_urls": request.productShots,
                            "aspect_ratio": f"{width}:{height}",
                            "output_format": "png"
                        }
                    else:
                        # Standard text-to-image
                        if request.model == "imagen4":
                            model_id = "fal-ai/imagen4/preview"
                            print(f"Using Imagen 4 model: {model_id}")
                        else:
                            model_id = "fal-ai/nano-banana-pro"
                            print(f"Using Nano Banana Pro model: {model_id}")
                        
                        arguments = {
                            "prompt": prompt,
                            "aspect_ratio": get_fal_aspect_ratio(width, height),
                        }
                    
                    # Submit to Fal.ai
                    handler = await fal_client.submit_async(model_id, arguments=arguments)
                    result = await handler.get()
                    external_url = result['images'][0]['url']

                    # Download and save image locally
                    print(f"Downloading image from Fal.ai: {external_url[:50]}...")
                    image_url = await download_and_save_image(external_url, prefix="generated")
                    print(f"Saved image: {image_url}")

                except Exception as e:
                    print(f"Fal.ai generation failed: {e}")
                    # Fallback to mock on error
                    product_name = request.product.get('name', 'Product') if request.product else 'Product'
                    image_url = f"https://placehold.co/{width}x{height}/png?text={product_name}+Error"
            else:
                # Mock generation
                product_name = request.product.get('name', 'Product') if request.product else 'Product'
                image_url = f"https://placehold.co/{width}x{height}/png?text={product_name}+{i+1}"
            
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
            
        new_ad = GeneratedAd(
            id=ad_data.id,
            brand_id=ad_data.brandId,
            product_id=ad_data.productId,
            template_id=ad_data.templateId,
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
        print(f"Batch save error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
