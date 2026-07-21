from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import google.generativeai as genai
import os
import json
from app.models import User
from app.core.deps import get_current_active_user

router = APIRouter()

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

class CopyGenerationRequest(BaseModel):
    brand: Dict[str, Any]
    product: Dict[str, Any]
    profile: Dict[str, Any]
    template: Optional[Dict[str, Any]] = None
    variationCount: int = 3
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
async def generate_copy(request: CopyGenerationRequest, current_user: User = Depends(get_current_active_user)):
    """Generate ad copy variations using Gemini AI"""
    
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    
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
        model = genai.GenerativeModel('gemini-flash-latest')
        response = model.generate_content(prompt)
        
        # Parse the response
        response_text = response.text.strip()
        
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
        
    except json.JSONDecodeError as e:
        print(f"JSON Parse Error: {e}")
        print(f"Response text: {response_text}")
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response as JSON: {str(e)}")
    except Exception as e:
        print(f"Copy generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Copy generation failed: {str(e)}")

@router.post("/regenerate-field")
async def regenerate_field(request: FieldRegenerationRequest, current_user: User = Depends(get_current_active_user)):
    """Regenerate a specific field (headline, body, or cta)"""
    
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    
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

        model = genai.GenerativeModel('gemini-flash-latest')
        response = model.generate_content(prompt)
        
        new_value = response.text.strip().strip('"').strip("'")
        
        return {"newValue": new_value}
        
    except Exception as e:
        print(f"Field regeneration error: {e}")
        raise HTTPException(status_code=500, detail=f"Field regeneration failed: {str(e)}")
