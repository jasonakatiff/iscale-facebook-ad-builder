from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
import os
import uuid
from typing import Dict
from pathlib import Path
from app.core.config import settings
from app.models import User
from app.core.deps import get_current_active_user

router = APIRouter()

# Security: Define allowed file types and size limits
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
ALLOWED_VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.webm'}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB for images
MAX_VIDEO_SIZE = 500 * 1024 * 1024  # 500MB for videos

# Local upload dir for fallback
UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "uploads"
UPLOAD_DIR = UPLOAD_DIR.resolve()
os.makedirs(UPLOAD_DIR, mode=0o755, exist_ok=True)

# Initialize R2 client if configured
_s3_client = None

def get_s3_client():
    global _s3_client
    if _s3_client is None and settings.r2_enabled:
        import boto3
        _s3_client = boto3.client(
            's3',
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name='auto'
        )
    return _s3_client


async def upload_to_r2(file_content: bytes, filename: str, content_type: str) -> str:
    """Upload file to Cloudflare R2 and return public URL"""
    client = get_s3_client()
    if not client:
        raise HTTPException(status_code=500, detail="R2 storage not configured")

    try:
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=filename,
            Body=file_content,
            ContentType=content_type
        )
        return f"{settings.R2_PUBLIC_URL}/{filename}"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload to R2: {str(e)}")


async def upload_to_local(file_content: bytes, filename: str) -> str:
    """Upload file to local filesystem and return relative URL"""
    file_path = UPLOAD_DIR / filename
    with open(file_path, "wb") as buffer:
        buffer.write(file_content)
    return f"/uploads/{filename}"


@router.post("/", response_model=Dict[str, str])
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_active_user)):
    try:
        # Security: Sanitize filename to prevent path traversal
        safe_filename = os.path.basename(file.filename)
        file_extension = os.path.splitext(safe_filename)[1].lower()

        # Security: Validate file extension
        if file_extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )

        # Determine if video or image
        is_video = file_extension in ALLOWED_VIDEO_EXTENSIONS
        max_size = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE

        # Read file content
        file_content = await file.read()

        # Security: Validate file size
        if len(file_content) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {max_size / (1024 * 1024)}MB"
            )

        # Generate a unique filename
        filename = f"{uuid.uuid4()}{file_extension}"

        # Upload to R2 if configured, otherwise local
        if settings.r2_enabled:
            url = await upload_to_r2(file_content, filename, file.content_type or 'application/octet-stream')
        else:
            url = await upload_to_local(file_content, filename)

        # Return media type along with URL
        media_type = 'video' if is_video else 'image'
        return {"url": url, "media_type": media_type}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not upload file: {str(e)}")
