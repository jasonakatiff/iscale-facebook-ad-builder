import os
import json
import time
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.models import User
from app.core.deps import get_current_active_user
from app.core.config import settings

router = APIRouter()

try:
    from google import genai
except ImportError:
    genai = None

ANALYSIS_PROMPT = """You are an expert Facebook ad copywriter. Watch this video carefully — pay attention to both the visuals AND the audio/voiceover.

Based on the video content, generate Facebook ad copy. Return ONLY valid JSON with this exact structure:

{
  "bodies": [
    "Primary text variation 1 (2-3 sentences, compelling, includes call-to-action)",
    "Primary text variation 2 (different angle/hook)",
    "Primary text variation 3 (different emotional appeal)"
  ],
  "headlines": [
    "Headline 1 (under 40 chars, punchy)",
    "Headline 2 (different angle)",
    "Headline 3 (urgency or curiosity)"
  ],
  "video_summary": "Brief 1-2 sentence summary of what the video shows and says"
}

Requirements:
- Primary text should be 2-3 sentences each, suitable for Facebook ads
- Headlines should be under 40 characters, attention-grabbing
- Each variation should take a different angle (e.g., benefit-focused, problem-solution, social proof)
- Match the tone and messaging of the video
- If there's spoken audio, incorporate key phrases or claims from it
- Return ONLY the JSON, no markdown formatting or code blocks"""


@router.post("/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """Analyze a video with Gemini 2.0 Flash to generate ad copy suggestions."""

    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    if genai is None:
        raise HTTPException(status_code=500, detail="google-genai package is not installed")

    # Validate file type
    content_type = file.content_type or ""
    if not content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    tmp_path = None
    gemini_file = None
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    try:
        # Save uploaded file to temp location
        suffix = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await file.read()
            tmp.write(content)

        print(f"[video_analysis] Uploading {file.filename} ({len(content)} bytes) to Gemini File API...")

        # Upload to Gemini File API
        gemini_file = client.files.upload(file=tmp_path)
        print(f"[video_analysis] File uploaded: {gemini_file.name}, state={gemini_file.state}")

        # Poll until processing is complete
        max_wait = 120  # seconds
        poll_interval = 3
        elapsed = 0
        while gemini_file.state.name == "PROCESSING" and elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            gemini_file = client.files.get(name=gemini_file.name)
            print(f"[video_analysis] Polling... state={gemini_file.state} ({elapsed}s)")

        if gemini_file.state.name == "FAILED":
            raise HTTPException(status_code=500, detail="Gemini failed to process the video")

        if gemini_file.state.name != "ACTIVE":
            raise HTTPException(
                status_code=500,
                detail=f"Video processing timed out after {max_wait}s (state: {gemini_file.state.name})",
            )

        print(f"[video_analysis] File ready, sending to gemini-2.0-flash...")

        # Send to Gemini for analysis
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[gemini_file, ANALYSIS_PROMPT],
        )

        raw_text = response.text.strip()
        print(f"[video_analysis] Raw response: {raw_text[:500]}")

        # Parse JSON from response (handle markdown code blocks)
        json_text = raw_text
        if json_text.startswith("```"):
            # Strip markdown code fences
            lines = json_text.split("\n")
            # Remove first line (```json or ```) and last line (```)
            lines = [l for l in lines if not l.strip().startswith("```")]
            json_text = "\n".join(lines)

        result = json.loads(json_text)

        # Validate structure
        if "bodies" not in result or "headlines" not in result:
            raise ValueError("Response missing required fields")

        return {
            "bodies": result["bodies"][:3],
            "headlines": result["headlines"][:3],
            "video_summary": result.get("video_summary", ""),
        }

    except json.JSONDecodeError as e:
        print(f"[video_analysis] JSON parse error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response as JSON")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[video_analysis] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        # Clean up Gemini file
        if gemini_file:
            try:
                client.files.delete(name=gemini_file.name)
                print(f"[video_analysis] Cleaned up Gemini file: {gemini_file.name}")
            except Exception as e:
                print(f"[video_analysis] Failed to clean up Gemini file: {e}")
