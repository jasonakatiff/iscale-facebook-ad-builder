from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import CustomerProfile as ProfileModel, User
from app.core.deps import get_current_active_user, require_permission
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

# Pydantic schemas
class CustomerProfileBase(BaseModel):
    name: str
    demographics: str = ""
    painPoints: str = ""
    goals: str = ""

class CustomerProfileCreate(CustomerProfileBase):
    id: str = None

class CustomerProfile(CustomerProfileBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("", response_model=List[CustomerProfile])
def read_profiles(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    profiles = db.query(ProfileModel).offset(skip).limit(limit).all()
    # Convert snake_case to camelCase for frontend
    return [{
        "id": p.id,
        "name": p.name,
        "demographics": p.demographics or "",
        "painPoints": p.pain_points or "",
        "goals": p.goals or "",
        "created_at": p.created_at
    } for p in profiles]

@router.post("", response_model=CustomerProfile)
def create_profile(
    profile: CustomerProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("brands:write"))
):
    db_profile = ProfileModel(
        id=profile.id,
        name=profile.name,
        demographics=profile.demographics,
        pain_points=profile.painPoints,
        goals=profile.goals
    )
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return {
        "id": db_profile.id,
        "name": db_profile.name,
        "demographics": db_profile.demographics or "",
        "painPoints": db_profile.pain_points or "",
        "goals": db_profile.goals or "",
        "created_at": db_profile.created_at
    }

@router.put("/{profile_id}")
def update_profile(
    profile_id: str,
    profile: CustomerProfileBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("brands:write"))
):
    db_profile = db.query(ProfileModel).filter(ProfileModel.id == profile_id).first()
    if not db_profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    db_profile.name = profile.name
    db_profile.demographics = profile.demographics
    db_profile.pain_points = profile.painPoints
    db_profile.goals = profile.goals

    db.commit()
    db.refresh(db_profile)
    return {"success": True}

@router.delete("/{profile_id}")
def delete_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("brands:delete"))
):
    db_profile = db.query(ProfileModel).filter(ProfileModel.id == profile_id).first()
    if not db_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(db_profile)
    db.commit()
    return {"success": True}
