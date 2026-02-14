import json
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Headline as HeadlineModel, Brand as BrandModel, Product as ProductModel, User
from app.schemas.headline import Headline, HeadlineCreate, HeadlineBatchDelete
from app.core.deps import get_current_active_user
from app.core.config import settings

router = APIRouter()

HEADLINE_PROMPT = """You are a direct-response headline specialist who writes scroll-stopping Facebook ad headlines. You've studied the greats — Gary Halbert, Eugene Schwartz, David Ogilvy — and you know that the headline is the ad for the ad.

Given the brand info, product details, and research document below, generate 15 high-converting headlines for Facebook ads.

Brand: {brand_name}
Brand Voice: {brand_voice}
Product: {product_name}
Product Description: {product_description}

Research Document:
{doc_content}

RULES:
- Each headline MUST be under 40 characters
- Mix these styles across your 15 headlines:
  * "curiosity" — open loops, "the secret...", "what nobody tells you about..."
  * "urgency" — time pressure, scarcity, "before it's gone", "limited time"
  * "benefit" — lead with the #1 benefit, answer "what's in it for me?"
  * "social_proof" — numbers, testimonials, "join 10,000+", "as seen on..."
  * "fomo" — fear of missing out, exclusivity, "don't miss this"
- Use power words: secret, shocking, finally, free, instant, proven, limited, new
- Each headline should be punchy and create an open loop the reader MUST click to close
- Write like a top affiliate marketer — conversational, benefit-obsessed

Return ONLY valid JSON with this exact structure:
{{
  "headlines": [
    {{ "text": "Headline text here", "category": "curiosity" }},
    {{ "text": "Another headline", "category": "urgency" }}
  ]
}}

Return ONLY the JSON, no markdown formatting or code blocks."""


def _parse_ai_response(raw_text: str) -> dict:
    json_text = raw_text.strip()
    if json_text.startswith("```"):
        lines = json_text.split("\n")
        lines = lines[1:]  # Remove opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        json_text = "\n".join(lines).strip()
    return json.loads(json_text)


def _extract_text_from_file(content: bytes, filename: str) -> str:
    """Extract text from uploaded file based on extension."""
    lower = filename.lower()
    if lower.endswith('.txt') or lower.endswith('.md'):
        return content.decode('utf-8', errors='replace')
    elif lower.endswith('.pdf'):
        try:
            import io
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(content))
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text
        except ImportError:
            # Fallback: try to decode as text
            return content.decode('utf-8', errors='replace')
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")
    elif lower.endswith('.csv'):
        return content.decode('utf-8', errors='replace')
    else:
        # Try to decode as text
        return content.decode('utf-8', errors='replace')


@router.get("", response_model=List[Headline])
def list_headlines(
    brand_id: Optional[str] = None,
    product_id: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = db.query(HeadlineModel)
    if brand_id:
        query = query.filter(HeadlineModel.brand_id == brand_id)
    if product_id:
        query = query.filter(HeadlineModel.product_id == product_id)
    if category:
        query = query.filter(HeadlineModel.category == category)
    return query.order_by(HeadlineModel.created_at.desc()).all()


@router.post("", response_model=Headline)
def create_headline(
    headline: HeadlineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    db_headline = HeadlineModel(
        brand_id=headline.brand_id,
        product_id=headline.product_id,
        text=headline.text,
        category=headline.category,
        source=headline.source,
    )
    db.add(db_headline)
    db.commit()
    db.refresh(db_headline)
    return db_headline


@router.post("/generate", response_model=List[Headline])
async def generate_headlines(
    brand_id: str = Form(...),
    product_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Upload a research document and generate headlines with Claude Haiku."""
    # Fetch brand
    brand = db.query(BrandModel).filter(BrandModel.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Fetch product (optional)
    product = None
    if product_id:
        product = db.query(ProductModel).filter(ProductModel.id == product_id).first()

    # Read file
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    doc_text = _extract_text_from_file(content, file.filename or "document.txt")
    if not doc_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file")

    # Truncate if too long (keep under ~8k chars for prompt)
    if len(doc_text) > 8000:
        doc_text = doc_text[:8000] + "\n\n[Document truncated at 8000 characters]"

    # Build prompt
    prompt = HEADLINE_PROMPT.format(
        brand_name=brand.name,
        brand_voice=brand.voice or "Not specified",
        product_name=product.name if product else "General",
        product_description=product.description if product else "Not specified",
        doc_content=doc_text,
    )

    # Call Claude Haiku
    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=500, detail="anthropic package not installed")

    api_key = getattr(settings, "ANTHROPIC_API_KEY", None) or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse_ai_response(response.content[0].text)
    except json.JSONDecodeError as e:
        print(f"[headlines] JSON parse error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response as JSON")
    except Exception as e:
        print(f"[headlines] AI error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Save headlines to DB
    generated = result.get("headlines", [])
    saved = []
    for h in generated:
        text = h.get("text", "").strip()
        if not text:
            continue
        db_headline = HeadlineModel(
            brand_id=brand_id,
            product_id=product_id,
            text=text,
            category=h.get("category"),
            source="ai",
        )
        db.add(db_headline)
        db.flush()
        saved.append(db_headline)

    db.commit()
    for h in saved:
        db.refresh(h)

    return saved


@router.delete("/batch")
def delete_headlines_batch(
    body: HeadlineBatchDelete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    deleted = db.query(HeadlineModel).filter(HeadlineModel.id.in_(body.ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@router.delete("/{headline_id}")
def delete_headline(
    headline_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    headline = db.query(HeadlineModel).filter(HeadlineModel.id == headline_id).first()
    if not headline:
        raise HTTPException(status_code=404, detail="Headline not found")
    db.delete(headline)
    db.commit()
    return {"success": True}
