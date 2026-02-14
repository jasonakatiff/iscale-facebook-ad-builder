from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


class AdLibraryItemCreate(BaseModel):
    brand_id: Optional[str] = None
    name: Optional[str] = None
    media_type: str = "image"
    media_url: str
    thumbnail_url: Optional[str] = None
    variants: Optional[Dict[str, str]] = None  # {"1:1": "url", "9:16": "url"}
    file_size: Optional[int] = None
    headline: Optional[str] = None
    body: Optional[str] = None
    cta: Optional[str] = None
    tags: Optional[List[str]] = None
    funnel_stage: Optional[str] = None
    ad_format: Optional[str] = None
    status: str = "draft"


class AdLibraryItemUpdate(BaseModel):
    brand_id: Optional[str] = None
    name: Optional[str] = None
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    variants: Optional[Dict[str, str]] = None
    headline: Optional[str] = None
    body: Optional[str] = None
    cta: Optional[str] = None
    tags: Optional[List[str]] = None
    funnel_stage: Optional[str] = None
    ad_format: Optional[str] = None
    status: Optional[str] = None


class AdLibraryItemResponse(BaseModel):
    id: str
    brand_id: Optional[str] = None
    brand_name: Optional[str] = None
    name: Optional[str] = None
    media_type: str
    media_url: str
    thumbnail_url: Optional[str] = None
    variants: Optional[Dict[str, str]] = None
    file_size: Optional[int] = None
    headline: Optional[str] = None
    body: Optional[str] = None
    cta: Optional[str] = None
    tags: Optional[List[str]] = None
    funnel_stage: Optional[str] = None
    ad_format: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
