from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Prompt, User
from app.core.deps import get_current_active_user
from pydantic import BaseModel

router = APIRouter()

class PromptCreate(BaseModel):
    id: str
    name: str
    category: str
    description: str = None
    variables: List[str] = None
    template: str
    notes: str = None

class PromptUpdate(BaseModel):
    name: str = None
    category: str = None
    description: str = None
    variables: List[str] = None
    template: str = None
    notes: str = None

class PromptResponse(BaseModel):
    id: str
    name: str
    category: str
    description: str = None
    variables: List[str] = None
    template: str
    notes: str = None

    class Config:
        from_attributes = True

@router.get("/", response_model=List[PromptResponse])
def get_prompts(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Get all prompts"""
    return db.query(Prompt).all()

@router.get("/{prompt_id}", response_model=PromptResponse)
def get_prompt(prompt_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Get a specific prompt"""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt

@router.post("/", response_model=PromptResponse)
def create_prompt(prompt: PromptCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Create a new prompt"""
    # Check if prompt with this ID already exists
    existing = db.query(Prompt).filter(Prompt.id == prompt.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Prompt with this ID already exists")

    db_prompt = Prompt(**prompt.dict())
    db.add(db_prompt)
    db.commit()
    db.refresh(db_prompt)
    return db_prompt

@router.put("/{prompt_id}", response_model=PromptResponse)
def update_prompt(prompt_id: str, prompt: PromptUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Update an existing prompt"""
    db_prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not db_prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    # Update only provided fields
    update_data = prompt.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_prompt, field, value)

    db.commit()
    db.refresh(db_prompt)
    return db_prompt

@router.delete("/{prompt_id}")
def delete_prompt(prompt_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Delete a prompt"""
    db_prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not db_prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    db.delete(db_prompt)
    db.commit()
    return {"message": "Prompt deleted successfully"}
