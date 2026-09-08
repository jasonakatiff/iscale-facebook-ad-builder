from app.telemetry.runtime import capture_exception
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.services.generation_provider import generate_gemini_text
from app.services.provider_settings import require_provider_key
from app.core.installation import InstallationError
from app.database import get_db
from sqlalchemy.orm import Session
import json
from app.models import User
from app.core.deps import require_permission

router = APIRouter()

class CopyGenerationRequest(BaseModel):
    brand: Dict[str, Any]
    product: Dict[str, Any]
    profile: Dict[str, Any]
    template: Optional[Dict[str, Any]] = None
    variationCount: int = Field(default=3, ge=1, le=10)
    campaignDetails: Dict[str, str]
    customPrompt: Optional[str] = None

class FieldRegenerationRequest(BaseModel):
    field: str
    currentValue: str
    brand: Dict[str, Any]
    product: Dict[str, Any]
    profile: Dict[str, Any]
    template: Optional[Dict[str, Any]] = None
    campaignDetails: Dict[str, str]

@router.post("/generate")
async def generate_copy(request: CopyGenerationRequest, current_user: User = Depends(require_permission("ads:write")), db: Session = Depends(get_db)):
    """Generate ad copy variations using Gemini AI"""
    
    require_provider_key("gemini", db)
    
    try:
        # Build the prompt
        count = request.variationCount
        prompt = f"""You are an expert ad copywriter. Generate {count} variations of ad copy for a Facebook/Instagram ad campaign.

BRAND VOICE: {request.brand.get('voice', 'Professional and friendly')}

PRODUCT: {request.product.get('name')}
{f"Description: {request.product.get('description')}" if request.product.get('description') else ''}

TARGET AUDIENCE:
- Demographics: {request.profile.get('demographics', 'General audience')}
- Pain Points: {request.profile.get('pain_points', 'Not specified')}
- Goals: {request.profile.get('goals', 'Not specified')}

CAMPAIGN DETAILS:
- Offer: {request.campaignDetails.get('offer')}
- Key Messaging: {request.campaignDetails.get('messaging')}

TEMPLATE STYLE: {request.template.get('design_style', 'Modern and clean') if request.template else 'Modern and clean'}

BODY COPY STYLES (vary across variations):
1. BULLET POINTS WITH EMOJIS: Use 2-4 bullet points with emojis at the start
   - Sometimes use the same emoji (e.g., ✓ ✓ ✓ or ⭐ ⭐ ⭐)
   - Sometimes use mixed emojis (e.g., 🎯 💪 ✨ 🚀)
   - Keep each bullet concise and benefit-focused
   Example: "✓ Save 50% today
✓ Free shipping
✓ 30-day guarantee"

2. EMOTIONAL STORYTELLING: Longer narrative that connects emotionally
   - Tell a relatable story or paint a vivid picture
   - Use emotional triggers and sensory details
   - Build desire and urgency through narrative
   - Can be 150-200 characters for story-driven ads
   Example: "Remember that feeling when everything just clicks? When you finally found the solution you've been searching for? That's what our customers experience every day..."

INSTRUCTIONS:
Generate {count} distinct variations. Mix both body copy styles across variations. Each variation should:
1. Match the brand voice consistently
2. Address the audience's pain points and goals
3. Incorporate the campaign offer and key messaging
4. Be compelling, conversion-focused, and ad-appropriate
5. Keep headlines under 40 characters
6. For bullet-point style: Keep body under 125 characters
7. For storytelling style: Can extend to 200 characters
8. Keep CTAs under 20 characters

Return ONLY valid JSON in this exact format:
{{
  "variations": [
    {{
      "headline": "Short, punchy headline",
      "body": "Compelling body copy (bullets with emojis OR emotional story)",
      "cta": "Action CTA"
    }}
  ]
}}"""

        # Use custom prompt if provided
        if request.customPrompt:
            prompt = request.customPrompt
        
        # Generate with Gemini
        response_text = await generate_gemini_text(prompt, db)
        
        # Parse the response
        response_text = response_text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith('```json'):
            response_text = response_text[7:]
        if response_text.startswith('```'):
            response_text = response_text[3:]
        if response_text.endswith('```'):
            response_text = response_text[:-3]
        
        response_text = response_text.strip()
        
        # Parse JSON
        result = json.loads(response_text)
        
        return result
        
    except json.JSONDecodeError as exc:
        capture_exception(exc, "copy_generation.generate_copy", message="The provider returned unusable copy.")
        raise HTTPException(status_code=502, detail="The provider returned unusable copy. Try adjusting the prompt.") from None
    except InstallationError:
        raise
    except Exception as exc:
        capture_exception(exc, "copy_generation.generate_copy", message="Copy generation failed.")
        raise HTTPException(status_code=502, detail="The provider returned unusable copy. Try adjusting the prompt.") from None

@router.post("/regenerate-field")
async def regenerate_field(request: FieldRegenerationRequest, current_user: User = Depends(require_permission("ads:write")), db: Session = Depends(get_db)):
    """Regenerate a specific field (headline, body, or cta)"""
    
    require_provider_key("gemini", db)
    
    try:
        field_prompts = {
            "headline": "Generate a new headline (under 40 characters)",
            "body": "Generate new body copy (under 125 characters for bullets, or up to 200 for storytelling)",
            "cta": "Generate a new call-to-action (under 20 characters)"
        }
        
        prompt = f"""You are an expert ad copywriter. {field_prompts.get(request.field, 'Generate new copy')}.

BRAND VOICE: {request.brand.get('voice', 'Professional and friendly')}
PRODUCT: {request.product.get('name')}
TARGET AUDIENCE: {request.profile.get('demographics', 'General audience')}
CAMPAIGN: {request.campaignDetails.get('offer')}

Current {request.field}: {request.currentValue}

Generate a DIFFERENT, fresh variation that:
1. Matches the brand voice
2. Is compelling and conversion-focused
3. Follows the character limits

Return ONLY the new {request.field} text, nothing else."""

        response_text = await generate_gemini_text(prompt, db)
        
        new_value = response_text.strip().strip('"').strip("'")
        
        return {"newValue": new_value}
        
    except InstallationError:
        raise
    except Exception as exc:
        capture_exception(exc, "copy_generation.regenerate_field", message="Field regeneration failed.")
        raise HTTPException(status_code=502, detail="The provider returned unusable copy. Try adjusting the prompt.") from None
