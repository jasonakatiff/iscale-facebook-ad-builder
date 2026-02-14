from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import os
from app.database import get_db
from app.models import AdLibraryItem, Brand, User
from app.schemas.ads_library import AdLibraryItemCreate, AdLibraryItemUpdate, AdLibraryItemResponse
from app.core.deps import get_current_active_user
from app.core.config import settings

router = APIRouter()


def _to_response(item: AdLibraryItem) -> dict:
    """Convert model to response dict with brand_name."""
    data = {
        "id": item.id,
        "brand_id": item.brand_id,
        "brand_name": item.brand.name if item.brand else None,
        "name": item.name,
        "media_type": item.media_type,
        "media_url": item.media_url,
        "thumbnail_url": item.thumbnail_url,
        "variants": item.variants,
        "file_size": item.file_size,
        "headline": item.headline,
        "body": item.body,
        "cta": item.cta,
        "tags": item.tags,
        "funnel_stage": item.funnel_stage,
        "ad_format": item.ad_format,
        "status": item.status,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }
    return data


@router.get("", response_model=List[AdLibraryItemResponse])
def list_items(
    brand_id: Optional[str] = None,
    media_type: Optional[str] = None,
    funnel_stage: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = db.query(AdLibraryItem)
    if brand_id:
        query = query.filter(AdLibraryItem.brand_id == brand_id)
    if media_type:
        query = query.filter(AdLibraryItem.media_type == media_type)
    if funnel_stage:
        query = query.filter(AdLibraryItem.funnel_stage == funnel_stage)
    if status:
        query = query.filter(AdLibraryItem.status == status)
    items = query.order_by(AdLibraryItem.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_response(item) for item in items]


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    total = db.query(func.count(AdLibraryItem.id)).scalar()
    images = db.query(func.count(AdLibraryItem.id)).filter(AdLibraryItem.media_type == "image").scalar()
    videos = db.query(func.count(AdLibraryItem.id)).filter(AdLibraryItem.media_type == "video").scalar()
    return {"total": total, "images": images, "videos": videos}


# --- Static POST routes MUST come before /{item_id} routes ---

class AiNameRequest(BaseModel):
    image_url: str


@router.post("/ai-name")
async def generate_ai_name(
    request: AiNameRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Use Gemini Flash to generate a short descriptive name for an ad image."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini API not configured")

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')

        # Fetch image bytes
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(request.image_url, timeout=15)
            resp.raise_for_status()
            image_bytes = resp.content
            content_type = resp.headers.get("content-type", "image/jpeg")

        response = model.generate_content([
            {
                "mime_type": content_type,
                "data": image_bytes,
            },
            "Look at this ad creative image. Generate a short descriptive name (3-6 words max) that describes what's shown. "
            "Examples: 'Woman Holding Product Bottle', 'Before After Skin Results', 'Social Media Comments Collage', "
            "'Family Beach Scene', 'Product Flat Lay White BG'. "
            "Return ONLY the name, nothing else. No quotes, no punctuation at the end."
        ])

        name = response.text.strip().strip('"\'.')
        return {"name": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI naming failed: {str(e)}")


class VideoThumbnailRequest(BaseModel):
    video_url: str


@router.post("/video-thumbnail")
async def extract_video_thumbnail(
    request: VideoThumbnailRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Extract a thumbnail frame from a video URL using ffmpeg with direct URL streaming."""
    import tempfile
    import subprocess
    import uuid

    tmp_thumb_path = None
    try:
        # Use ffmpeg directly with the video URL (handles HTTP streaming/seeking)
        tmp_thumb_path = tempfile.mktemp(suffix=".jpg")
        result = subprocess.run([
            "ffmpeg", "-y",
            "-ss", "1",           # seek to 1 second (before -i for fast seek)
            "-i", request.video_url,
            "-vframes", "1",      # extract 1 frame
            "-q:v", "3",          # quality (2-5, lower=better)
            tmp_thumb_path
        ], capture_output=True, timeout=30)

        if result.returncode != 0 or not os.path.exists(tmp_thumb_path):
            # Fallback: try at 0 seconds
            result = subprocess.run([
                "ffmpeg", "-y",
                "-i", request.video_url,
                "-vframes", "1",
                "-q:v", "3",
                tmp_thumb_path
            ], capture_output=True, timeout=30)

        if not os.path.exists(tmp_thumb_path) or os.path.getsize(tmp_thumb_path) < 1000:
            stderr = result.stderr.decode() if result.stderr else "unknown error"
            raise Exception(f"ffmpeg failed to extract frame: {stderr[-200:]}")

        # Upload thumbnail to R2
        with open(tmp_thumb_path, "rb") as f:
            thumb_bytes = f.read()

        filename = f"thumb_{uuid.uuid4()}.jpg"
        if settings.r2_enabled:
            from app.api.v1.uploads import upload_to_r2
            thumb_url = await upload_to_r2(thumb_bytes, filename, "image/jpeg")
        else:
            from app.api.v1.uploads import upload_to_local
            thumb_url = await upload_to_local(thumb_bytes, filename)

        # Cleanup
        os.unlink(tmp_thumb_path)

        return {"thumbnail_url": thumb_url}

    except Exception as e:
        if tmp_thumb_path and os.path.exists(tmp_thumb_path):
            os.unlink(tmp_thumb_path)
        raise HTTPException(status_code=500, detail=f"Thumbnail extraction failed: {str(e)}")


@router.post("", response_model=AdLibraryItemResponse)
def create_item(
    item: AdLibraryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    data = item.model_dump()
    db_item = AdLibraryItem(**data)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return _to_response(db_item)


# --- Parameterized routes ---

@router.get("/{item_id}", response_model=AdLibraryItemResponse)
def get_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    item = db.query(AdLibraryItem).filter(AdLibraryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _to_response(item)


@router.put("/{item_id}", response_model=AdLibraryItemResponse)
def update_item(
    item_id: str,
    item: AdLibraryItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    db_item = db.query(AdLibraryItem).filter(AdLibraryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    for key, value in item.model_dump(exclude_unset=True).items():
        setattr(db_item, key, value)
    db.commit()
    db.refresh(db_item)
    return _to_response(db_item)


@router.delete("/{item_id}")
def delete_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    db_item = db.query(AdLibraryItem).filter(AdLibraryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Delete from R2 if configured
    if settings.r2_enabled and db_item.media_url and settings.R2_PUBLIC_URL in db_item.media_url:
        try:
            import boto3
            s3_client = boto3.client(
                's3',
                endpoint_url=settings.r2_endpoint_url,
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                region_name='auto'
            )
            key = db_item.media_url.replace(f"{settings.R2_PUBLIC_URL}/", "")
            s3_client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
        except Exception as e:
            print(f"Error deleting from R2: {e}")

    db.delete(db_item)
    db.commit()
    return {"message": "Item deleted"}
