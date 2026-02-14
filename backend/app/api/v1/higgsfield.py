"""
Higgsfield AI API endpoints - Image-to-Video generation
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.api.v1.auth import get_current_active_user
from app.services import higgsfield_service

router = APIRouter()


class GenerateVideoRequest(BaseModel):
    image_url: str
    motion_id: str
    prompt: Optional[str] = ""
    model: Optional[str] = "dop-lite"
    strength: Optional[float] = 0.5


@router.get("/status")
async def get_status(user=Depends(get_current_active_user)):
    """Check if Higgsfield is configured."""
    return {"configured": higgsfield_service.is_configured()}


@router.get("/motions")
async def get_motions(user=Depends(get_current_active_user)):
    """List available motion presets."""
    if not higgsfield_service.is_configured():
        raise HTTPException(status_code=503, detail="Higgsfield API not configured")
    try:
        motions = await higgsfield_service.list_motions()
        return motions
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Higgsfield API error: {str(e)}")


@router.post("/generate-video")
async def generate_video(
    req: GenerateVideoRequest,
    user=Depends(get_current_active_user),
):
    """Submit an image-to-video generation job."""
    if not higgsfield_service.is_configured():
        raise HTTPException(status_code=503, detail="Higgsfield API not configured")
    try:
        result = await higgsfield_service.generate_video(
            image_url=req.image_url,
            motion_id=req.motion_id,
            prompt=req.prompt,
            model=req.model,
            strength=req.strength,
        )
        return result
    except Exception as e:
        detail = str(e)
        if "Not enough credits" in detail or "403" in detail:
            raise HTTPException(status_code=402, detail="Not enough Higgsfield credits. Add credits at cloud.higgsfield.ai")
        raise HTTPException(status_code=502, detail=f"Higgsfield API error: {detail}")


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, user=Depends(get_current_active_user)):
    """Check status of a video generation job."""
    if not higgsfield_service.is_configured():
        raise HTTPException(status_code=503, detail="Higgsfield API not configured")
    try:
        result = await higgsfield_service.get_job_status(job_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Higgsfield API error: {str(e)}")
