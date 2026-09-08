"""Template analysis using the installation's current Gemini connection."""
import base64
import json
import mimetypes
from urllib.parse import unquote, urlparse

import httpx

from app.core.config import settings
from app.core.installation import InstallationError
from app.schemas.ad_blueprint import AdBlueprint, AdConcept, BrandData
from app.prompts.ad_remix_prompts import build_deconstruction_prompt, build_reconstruction_prompt
from app.services.generation_provider import generate_gemini_text
from app.services.provider_settings import require_provider_key

MAX_TEMPLATE_BYTES = 10 * 1024 * 1024


async def template_image_part(image_url):
    from app.api.v1.uploads import UPLOAD_DIR
    parsed = urlparse(image_url)
    own = urlparse(settings.PUBLIC_API_URL)
    local = not parsed.netloc or (own.netloc and parsed.netloc == own.netloc and parsed.scheme == own.scheme)
    content = None
    mime = mimetypes.guess_type(parsed.path)[0]
    if mime not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
        raise InstallationError("invalid_template_image", "Upload a PNG, JPG, WebP, or GIF template.", 422)
    if local and parsed.path.startswith("/uploads/"):
        path = (UPLOAD_DIR / unquote(parsed.path.removeprefix("/uploads/"))).resolve()
        if path.is_relative_to(UPLOAD_DIR.resolve()) and path.is_file() and path.stat().st_size <= MAX_TEMPLATE_BYTES:
            content = path.read_bytes()
    elif settings.r2_enabled and image_url.startswith(settings.R2_PUBLIC_URL.rstrip("/") + "/"):
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            async with client.stream("GET", image_url) as response:
                response.raise_for_status()
                chunks, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_TEMPLATE_BYTES:
                        raise InstallationError("invalid_template_image", "Upload a template smaller than 10 MB.", 422)
                    chunks.append(chunk)
                content = b"".join(chunks)
    if not content:
        raise InstallationError("template_upload_required", "Upload this template to your workspace before analyzing it.", 422)
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(content).decode()}}


async def deconstruct_template(template_image_url: str, db=None) -> AdBlueprint:
    require_provider_key("gemini", db)
    image = await template_image_part(template_image_url)
    result = await generate_gemini_text(build_deconstruction_prompt(template_image_url), db, image_part=image)
    return AdBlueprint(**extract_json_from_response(result))


async def reconstruct_ad(blueprint: AdBlueprint, brand_data: BrandData, db=None) -> AdConcept:
    prompt = build_reconstruction_prompt(
        blueprint=blueprint.model_dump(), brand_name=brand_data.brand_name,
        brand_voice=brand_data.brand_voice or "", product_name=brand_data.product_name,
        product_description=brand_data.product_description,
        audience_demographics=brand_data.audience_demographics,
        audience_pain_points=brand_data.audience_pain_points or "",
        audience_goals=brand_data.audience_goals or "", campaign_offer=brand_data.campaign_offer,
        campaign_urgency=brand_data.campaign_urgency or "", campaign_messaging=brand_data.campaign_messaging,
    )
    return AdConcept(**extract_json_from_response(await generate_gemini_text(prompt, db)))


def extract_json_from_response(text):
    if "```" in text:
        text = text.split("```", 2)[1].removeprefix("json").strip()
    return json.loads(text)
