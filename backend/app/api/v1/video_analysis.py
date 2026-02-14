import os
import json
import time
import glob
import base64
import tempfile
import subprocess
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from app.models import User
from app.core.deps import get_current_active_user
from app.core.config import settings

router = APIRouter()

try:
    from google import genai
except ImportError:
    genai = None

try:
    import anthropic
except ImportError:
    anthropic = None

ANALYSIS_PROMPT = """You are an elite direct-response copywriter who specializes in Facebook ads that CONVERT. You've studied the greats — Gary Halbert, Eugene Schwartz, David Ogilvy — and you write scroll-stopping copy that drives clicks and sales.

Watch/analyze this video carefully — pay attention to both the visuals AND the audio/voiceover.

Based on the video content, generate high-converting Facebook ad copy using direct response and affiliate marketing principles. Return ONLY valid JSON with this exact structure:

{
  "bodies": [
    "Primary text variation 1 — Problem-Agitate-Solve angle with a strong CTA",
    "Primary text variation 2 — Curiosity hook with benefit-stacking",
    "Primary text variation 3 — Social proof / story-driven with urgency"
  ],
  "headlines": [
    "Headline 1 (under 40 chars, power words)",
    "Headline 2 (benefit-driven, curiosity)",
    "Headline 3 (urgency or fear of missing out)"
  ],
  "video_summary": "Brief 1-2 sentence summary of what the video shows and says"
}

DIRECT RESPONSE COPYWRITING RULES — follow these strictly:
- Open with a pattern interrupt or curiosity hook that stops the scroll (e.g., "Wait — did you know...?" or a bold claim)
- Use the Problem-Agitate-Solve framework: name the pain, twist the knife, present the product as the solution
- Write in a conversational, first-person tone — like texting a friend, not writing an essay
- Stack benefits, not features. Every feature must answer "so what?" for the reader
- Use power words: "secret", "shocking", "finally", "free", "instant", "proven", "limited"
- Create urgency: limited time, limited stock, exclusive access, "before it's gone"
- End EVERY body copy with a clear, compelling CTA (e.g., "Tap the link before they sell out")
- Headlines should be punchy, benefit-first, and create an open loop the reader MUST click to close
- Each variation should take a genuinely different angle — don't just rephrase the same idea
- If there's spoken audio, incorporate key phrases, claims, or testimonials from it
- Write like a top affiliate marketer: conversational, urgent, benefit-obsessed, action-oriented
- Return ONLY the JSON, no markdown formatting or code blocks"""

TRANSCRIPTION_PROMPT = """Watch this video carefully and transcribe ALL spoken audio — every word of the voiceover, narration, dialogue, or on-screen text that is read aloud.

Return ONLY valid JSON with this exact structure:

{
  "transcript": "The full word-for-word transcript of everything spoken in the video",
  "key_claims": ["List of specific claims, benefits, or testimonials mentioned"],
  "product_name": "The product or brand name if mentioned, otherwise null",
  "tone": "Brief description of the speaker's tone and style (e.g. excited, authoritative, casual)"
}

Rules:
- Transcribe verbatim — capture the exact words spoken, including filler words if they add authenticity
- If there are multiple speakers, note speaker changes with [Speaker 1], [Speaker 2] etc.
- If no audio/speech is detected, set transcript to "" and still fill in key_claims from any on-screen text
- Return ONLY the JSON, no markdown formatting or code blocks"""

HAIKU_SYSTEM_PROMPT = """You are an elite direct-response copywriter for Facebook ads, specializing in affiliate marketing that needs to be profitable on the frontend FAST. You write for cold traffic — people who have never heard of this product — and your only job is to stop their scroll, hook them, and get the click.

Your copy philosophy:
- You write like the best affiliate marketers: Frank Kern, Ryan Deiss, Ezra Firestone
- Every ad must pass the "would I stop scrolling for this?" test
- You optimize for CTR first, then conversion — because without the click, nothing else matters
- You treat Facebook ad copy like a mini sales letter: hook → story/proof → CTA

Your direct-response rules:
1. HOOK (first line): Pattern interrupt. Bold claim, question, or controversy. This line alone decides if they read or scroll.
2. BODY: Use one framework per variation — PAS (Problem-Agitate-Solve), AIDA (Attention-Interest-Desire-Action), or Before-After-Bridge
3. PROOF: Weave in specific claims, numbers, or testimonials from the video. Specificity = believability.
4. CTA: Every body MUST end with an urgent, specific call to action. "Learn more" is banned. Use "Tap the link to...", "Get yours before...", "See why X people..."
5. TONE: Conversational. First-person. Like texting your best friend about something that actually changed your life.
6. HEADLINES: Under 40 chars. Benefit-first. Create an open loop. Use power words.
7. Each variation must take a COMPLETELY different angle — different hook, different framework, different emotional trigger.

You are writing ads that need to generate a positive ROI from day one. Every word must earn its place."""


def _parse_ai_response(raw_text: str) -> dict:
    """Parse JSON from AI response, handling markdown code fences."""
    json_text = raw_text.strip()
    if json_text.startswith("```"):
        lines = json_text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        json_text = "\n".join(lines)

    result = json.loads(json_text)
    if "bodies" not in result or "headlines" not in result:
        raise ValueError("Response missing required fields")
    return result


def _extract_frames(video_path: str, num_frames: int = 10) -> list[str]:
    """Extract frames from a video using ffmpeg, return list of temp file paths."""
    tmp_dir = tempfile.mkdtemp(prefix="claude_frames_")

    # Get video duration
    probe_cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    try:
        duration = float(subprocess.check_output(probe_cmd, stderr=subprocess.DEVNULL).decode().strip())
    except (subprocess.CalledProcessError, ValueError):
        duration = 30.0  # fallback

    # Calculate interval between frames
    interval = max(duration / (num_frames + 1), 0.5)

    # Extract frames at regular intervals
    output_pattern = os.path.join(tmp_dir, "frame_%03d.jpg")
    ffmpeg_cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps=1/{interval:.2f}",
        "-frames:v", str(num_frames),
        "-q:v", "2",
        output_pattern,
        "-y", "-loglevel", "error",
    ]
    subprocess.run(ffmpeg_cmd, check=True, timeout=60)

    frame_paths = sorted(glob.glob(os.path.join(tmp_dir, "frame_*.jpg")))
    print(f"[video_analysis] Extracted {len(frame_paths)} frames from video ({duration:.1f}s)")
    return frame_paths


async def _transcribe_with_gemini(tmp_path: str, filename: str, content_length: int) -> dict:
    """Use Gemini to transcribe the video audio and extract key claims."""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")
    if genai is None:
        raise HTTPException(status_code=500, detail="google-genai package is not installed")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    gemini_file = None

    try:
        print(f"[video_analysis:transcribe] Uploading {filename} ({content_length} bytes) for transcription...")
        gemini_file = client.files.upload(file=tmp_path)

        max_wait, poll_interval, elapsed = 120, 3, 0
        while gemini_file.state.name == "PROCESSING" and elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            gemini_file = client.files.get(name=gemini_file.name)

        if gemini_file.state.name == "FAILED":
            raise HTTPException(status_code=500, detail="Gemini failed to process the video for transcription")
        if gemini_file.state.name != "ACTIVE":
            raise HTTPException(status_code=500, detail=f"Video processing timed out after {max_wait}s")

        print(f"[video_analysis:transcribe] File ready, transcribing with gemini-2.0-flash...")
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[gemini_file, TRANSCRIPTION_PROMPT],
        )

        if hasattr(response, "usage_metadata") and response.usage_metadata:
            um = response.usage_metadata
            print(f"[video_analysis:transcribe] Tokens — prompt: {um.prompt_token_count}, response: {um.candidates_token_count}")

        raw_text = response.text.strip()
        print(f"[video_analysis:transcribe] Transcript response: {raw_text[:300]}")
        result = _parse_ai_response_flexible(raw_text)
        return result

    finally:
        if gemini_file:
            try:
                client.files.delete(name=gemini_file.name)
            except Exception as e:
                print(f"[video_analysis:transcribe] Failed to clean up Gemini file: {e}")


def _parse_ai_response_flexible(raw_text: str) -> dict:
    """Parse JSON from AI response, handling markdown code fences. No required fields."""
    json_text = raw_text.strip()
    if json_text.startswith("```"):
        lines = json_text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        json_text = "\n".join(lines)
    return json.loads(json_text)


async def _analyze_with_gemini(tmp_path: str, filename: str, content_length: int) -> dict:
    """Analyze video with Gemini 2.0 Flash (supports video+audio natively)."""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")
    if genai is None:
        raise HTTPException(status_code=500, detail="google-genai package is not installed")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    gemini_file = None

    try:
        print(f"[video_analysis:gemini] Uploading {filename} ({content_length} bytes) to Gemini File API...")
        gemini_file = client.files.upload(file=tmp_path)
        print(f"[video_analysis:gemini] File uploaded: {gemini_file.name}, state={gemini_file.state}")

        # Poll until processing is complete
        max_wait, poll_interval, elapsed = 120, 3, 0
        while gemini_file.state.name == "PROCESSING" and elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            gemini_file = client.files.get(name=gemini_file.name)
            print(f"[video_analysis:gemini] Polling... state={gemini_file.state} ({elapsed}s)")

        if gemini_file.state.name == "FAILED":
            raise HTTPException(status_code=500, detail="Gemini failed to process the video")
        if gemini_file.state.name != "ACTIVE":
            raise HTTPException(
                status_code=500,
                detail=f"Video processing timed out after {max_wait}s (state: {gemini_file.state.name})",
            )

        print(f"[video_analysis:gemini] File ready, sending to gemini-2.0-flash...")
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[gemini_file, ANALYSIS_PROMPT],
        )

        if hasattr(response, "usage_metadata") and response.usage_metadata:
            um = response.usage_metadata
            print(f"[video_analysis:gemini] Tokens — prompt: {um.prompt_token_count}, response: {um.candidates_token_count}, total: {um.total_token_count}")

        raw_text = response.text.strip()
        print(f"[video_analysis:gemini] Raw response: {raw_text[:500]}")
        return _parse_ai_response(raw_text)

    finally:
        if gemini_file:
            try:
                client.files.delete(name=gemini_file.name)
                print(f"[video_analysis:gemini] Cleaned up Gemini file: {gemini_file.name}")
            except Exception as e:
                print(f"[video_analysis:gemini] Failed to clean up Gemini file: {e}")


async def _analyze_with_claude(tmp_path: str, filename: str, transcript_data: dict = None) -> dict:
    """Analyze video with Claude Haiku by extracting key frames and sending as images.

    If transcript_data is provided (from Gemini transcription), it's included as context
    so Haiku can write copy informed by both visuals AND spoken audio.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not configured")
    if anthropic is None:
        raise HTTPException(status_code=500, detail="anthropic package is not installed")

    frame_paths = []
    try:
        frame_paths = _extract_frames(tmp_path, num_frames=10)
        if not frame_paths:
            raise HTTPException(status_code=500, detail="Failed to extract frames from video")

        # Build image content blocks
        image_content = []
        for i, fp in enumerate(frame_paths):
            with open(fp, "rb") as f:
                img_data = base64.standard_b64encode(f.read()).decode("utf-8")
            image_content.append({
                "type": "text",
                "text": f"Frame {i + 1} of {len(frame_paths)}:",
            })
            image_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": img_data,
                },
            })

        # Build the user prompt — include transcript if available
        if transcript_data:
            transcript = transcript_data.get("transcript", "")
            key_claims = transcript_data.get("key_claims", [])
            product_name = transcript_data.get("product_name", "")
            tone = transcript_data.get("tone", "")

            transcript_context = "\n\n--- VIDEO AUDIO TRANSCRIPT ---\n"
            if transcript:
                transcript_context += f"SPOKEN WORDS: {transcript}\n"
            if key_claims:
                transcript_context += f"KEY CLAIMS & BENEFITS: {', '.join(key_claims)}\n"
            if product_name:
                transcript_context += f"PRODUCT/BRAND: {product_name}\n"
            if tone:
                transcript_context += f"SPEAKER TONE: {tone}\n"
            transcript_context += "--- END TRANSCRIPT ---\n\n"
            transcript_context += "Use the transcript above as your PRIMARY source for claims, benefits, and proof points. The frames show you the visual style and product. Write copy that leverages BOTH."

            user_prompt = ANALYSIS_PROMPT.replace(
                "Watch/analyze this video carefully",
                "Analyze these key frames extracted from a video along with the audio transcript below"
            ) + transcript_context
        else:
            user_prompt = ANALYSIS_PROMPT.replace(
                "Watch/analyze this video carefully",
                "Analyze these key frames extracted from a video"
            )

        image_content.append({
            "type": "text",
            "text": user_prompt,
        })

        mode_label = "transcribe+haiku" if transcript_data else "claude"
        print(f"[video_analysis:{mode_label}] Sending {len(frame_paths)} frames{' + transcript' if transcript_data else ''} to claude-haiku-4-5-20251001...")

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        create_kwargs = {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1500,
            "messages": [{"role": "user", "content": image_content}],
        }
        if transcript_data:
            create_kwargs["system"] = HAIKU_SYSTEM_PROMPT
        response = client.messages.create(**create_kwargs)

        # Log token usage
        if hasattr(response, "usage") and response.usage:
            u = response.usage
            print(f"[video_analysis:{mode_label}] Tokens — input: {u.input_tokens}, output: {u.output_tokens}")

        raw_text = response.content[0].text.strip()
        print(f"[video_analysis:{mode_label}] Raw response: {raw_text[:500]}")
        return _parse_ai_response(raw_text)

    finally:
        # Clean up extracted frames
        for fp in frame_paths:
            try:
                os.unlink(fp)
            except OSError:
                pass
        # Clean up temp directory
        if frame_paths:
            try:
                os.rmdir(os.path.dirname(frame_paths[0]))
            except OSError:
                pass


@router.post("/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    provider: str = Query("gemini", pattern="^(gemini|claude|transcribe_haiku)$"),
    current_user: User = Depends(get_current_active_user),
):
    """Analyze a video with AI to generate ad copy suggestions.

    provider: "gemini" (default) — uses Gemini 2.0 Flash with native video+audio
              "claude" — extracts key frames and sends to Claude Haiku
              "transcribe_haiku" — Gemini transcribes audio, then Haiku writes copy from frames + transcript
    """
    content_type = file.content_type or ""
    if not content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    tmp_path = None
    try:
        suffix = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await file.read()
            tmp.write(content)

        if provider == "transcribe_haiku":
            # Step 1: Gemini transcribes the audio
            print("[video_analysis:transcribe_haiku] Step 1 — Gemini transcribing audio...")
            transcript_data = await _transcribe_with_gemini(tmp_path, file.filename or "video.mp4", len(content))
            print(f"[video_analysis:transcribe_haiku] Transcript: {transcript_data.get('transcript', '')[:200]}...")
            # Step 2: Haiku generates copy from frames + transcript
            print("[video_analysis:transcribe_haiku] Step 2 — Haiku generating copy with frames + transcript...")
            result = await _analyze_with_claude(tmp_path, file.filename or "video.mp4", transcript_data=transcript_data)
        elif provider == "claude":
            result = await _analyze_with_claude(tmp_path, file.filename or "video.mp4")
        else:
            result = await _analyze_with_gemini(tmp_path, file.filename or "video.mp4", len(content))

        return {
            "bodies": result["bodies"][:3],
            "headlines": result["headlines"][:3],
            "video_summary": result.get("video_summary", ""),
            "provider": provider,
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
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
