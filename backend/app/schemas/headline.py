from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class HeadlineCreate(BaseModel):
    text: str
    brand_id: str
    product_id: Optional[str] = None
    category: Optional[str] = None
    source: str = "manual"


class HeadlineBatchDelete(BaseModel):
    ids: List[str]


class Headline(BaseModel):
    id: str
    brand_id: str
    product_id: Optional[str] = None
    text: str
    category: Optional[str] = None
    source: str = "ai"
    research_doc_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
