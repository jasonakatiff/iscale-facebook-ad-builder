from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import AdStyle, User
from app.core.deps import get_current_active_user
from pydantic import BaseModel

router = APIRouter()

class AdStyleCreate(BaseModel):
    id: str
    name: str
    category: str
    description: str = None
    best_for: List[str] = None
    visual_layout: str = None
    psychology: str = None
    mood: str = None
    lighting: str = None
    composition: str = None
    design_style: str = None
    prompt: str = None

class AdStyleUpdate(BaseModel):
    name: str = None
    category: str = None
    description: str = None
    best_for: List[str] = None
    visual_layout: str = None
    psychology: str = None
    mood: str = None
    lighting: str = None
    composition: str = None
    design_style: str = None
    prompt: str = None

class AdStyleResponse(BaseModel):
    id: str
    name: str
    category: str
    description: str = None
    best_for: List[str] = None
    bestFor: List[str] = None  # Alias for camelCase
    visual_layout: str = None
    visualLayout: str = None  # Alias for camelCase
    psychology: str = None
    mood: str = None
    lighting: str = None
    composition: str = None
    design_style: str = None
    prompt: str = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj):
        # Map snake_case to camelCase for frontend compatibility
        data = {
            'id': obj.id,
            'name': obj.name,
            'category': obj.category,
            'description': obj.description,
            'best_for': obj.best_for,
            'bestFor': obj.best_for,
            'visual_layout': obj.visual_layout,
            'visualLayout': obj.visual_layout,
            'psychology': obj.psychology,
            'mood': obj.mood,
            'lighting': obj.lighting,
            'composition': obj.composition,
            'design_style': obj.design_style,
            'prompt': obj.prompt
        }
        return cls(**data)

@router.get("/", response_model=List[AdStyleResponse])
def get_ad_styles(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get all ad styles, optionally filtered by category"""
    query = db.query(AdStyle)
    if category:
        query = query.filter(AdStyle.category == category)
    return query.all()

@router.get("/{style_id}", response_model=AdStyleResponse)
def get_ad_style(
    style_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a specific ad style"""
    style = db.query(AdStyle).filter(AdStyle.id == style_id).first()
    if not style:
        raise HTTPException(status_code=404, detail="Ad style not found")
    return style

@router.post("/", response_model=AdStyleResponse)
def create_ad_style(
    style: AdStyleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new ad style"""
    # Check if style with this ID already exists
    existing = db.query(AdStyle).filter(AdStyle.id == style.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ad style with this ID already exists")

    db_style = AdStyle(**style.dict())
    db.add(db_style)
    db.commit()
    db.refresh(db_style)
    return db_style

@router.put("/{style_id}", response_model=AdStyleResponse)
def update_ad_style(
    style_id: str,
    style: AdStyleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update an existing ad style"""
    db_style = db.query(AdStyle).filter(AdStyle.id == style_id).first()
    if not db_style:
        raise HTTPException(status_code=404, detail="Ad style not found")

    # Update only provided fields
    update_data = style.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_style, field, value)

    db.commit()
    db.refresh(db_style)
    return db_style

@router.delete("/{style_id}")
def delete_ad_style(
    style_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete an ad style"""
    db_style = db.query(AdStyle).filter(AdStyle.id == style_id).first()
    if not db_style:
        raise HTTPException(status_code=404, detail="Ad style not found")

    db.delete(db_style)
    db.commit()
    return {"message": "Ad style deleted successfully"}
