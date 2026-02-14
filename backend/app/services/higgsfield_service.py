"""
Higgsfield AI Service - Image-to-Video generation
Uses the Higgsfield platform API (DoP model) to animate static images.
"""
import os
import httpx
from typing import Optional


BASE_URL = "https://platform.higgsfield.ai"
TIMEOUT = 30.0


def _get_headers():
    api_key = os.getenv("HIGGSFIELD_API_KEY")
    secret = os.getenv("HIGGSFIELD_API_SECRET")
    if not api_key or not secret:
        raise ValueError("HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET must be set")
    return {
        "hf-api-key": api_key,
        "hf-secret": secret,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def list_motions():
    """Get available video motion presets (zoom, dolly, pan, etc.)"""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(f"{BASE_URL}/v1/motions", headers=_get_headers())
        resp.raise_for_status()
        return resp.json()


async def generate_video(
    image_url: str,
    motion_id: str,
    prompt: str = "",
    model: str = "dop-lite",
    strength: float = 0.5,
) -> dict:
    """
    Submit image-to-video generation job.

    Args:
        image_url: Public URL of the source image
        motion_id: Motion preset ID (from list_motions)
        prompt: Description of the scene (auto-generated if empty)
        model: dop-lite (cheapest), dop-turbo, or dop-preview
        strength: Motion intensity 0.0-1.0

    Returns:
        Job response with id for polling
    """
    if not prompt:
        prompt = "Cinematic video with smooth natural motion"

    request_body = {
        "params": {
            "model": model,
            "prompt": prompt,
            "input_images": [{"type": "image_url", "image_url": image_url}],
            "motions": [{"id": motion_id, "strength": strength}],
        }
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            f"{BASE_URL}/v1/image2video/dop",
            headers=_get_headers(),
            json=request_body,
        )
        resp.raise_for_status()
        return resp.json()


async def get_job_status(job_id: str) -> dict:
    """Check status of a generation job. Returns status + results when done."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{BASE_URL}/v1/job-sets/{job_id}",
            headers=_get_headers(),
        )
        resp.raise_for_status()
        return resp.json()


def is_configured() -> bool:
    """Check if Higgsfield credentials are set."""
    return bool(os.getenv("HIGGSFIELD_API_KEY") and os.getenv("HIGGSFIELD_API_SECRET"))
