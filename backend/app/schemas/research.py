from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class AdSearchRequest(BaseModel):
    query: str
    platform: str = "facebook"
    limit: int = 10
    country: str = "US"
    language: str = ""  # Language filter: en, es, de, fr, pt, it, etc. Empty = all
    offset: int = 0  # Pagination: controls scroll depth
    exclude_ids: List[str] = []  # IDs to skip (already fetched)
    negative_keywords: List[str] = []  # Keywords to exclude from results
    vertical_id: Optional[str] = None  # Vertical category ID
    search_type: str = "one_time"  # one_time, scheduled_daily, scheduled_weekly
    schedule_config: Optional[Dict[str, Any]] = None  # Cron schedule configuration

class ScrapedAdBase(BaseModel):
    brand_name: Optional[str] = None
    headline: Optional[str] = None
    ad_copy: Optional[str] = None
    cta_text: Optional[str] = None
    platform: str = "facebook"
    external_id: Optional[str] = None
    ad_link: str  # Link to original ad
    platforms: Optional[List[str]] = None  # ['facebook', 'instagram']
    start_date: Optional[str] = None  # When ad started running
    media_type: Optional[str] = None  # 'image', 'video', or 'carousel'

class ScrapedAdCreate(ScrapedAdBase):
    pass

# For search results (not saved to DB yet)
class ScrapedAdSearchResult(ScrapedAdBase):
    pass

class ScrapedAdResponse(ScrapedAdBase):
    id: str
    search_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class SavedSearchBase(BaseModel):
    query: str
    country: Optional[str] = None
    negative_keywords: Optional[List[str]] = None
    vertical_id: Optional[str] = None
    search_type: str = "one_time"
    schedule_config: Optional[Dict[str, Any]] = None
    is_active: bool = True
    last_run: Optional[datetime] = None

class SavedSearchResponse(SavedSearchBase):
    id: str
    created_at: datetime
    ads: List[ScrapedAdResponse] = []
    ads_requested: Optional[int] = None
    ads_returned: Optional[int] = None
    ads_new: Optional[int] = None
    ads_duplicate: Optional[int] = None

    class Config:
        from_attributes = True


# Brand Scrapes schemas
class BrandScrapeCreate(BaseModel):
    brand_name: str  # User-defined name, also R2 folder name
    page_url: str  # Facebook Ads Library URL with view_all_page_id


class BrandScrapeUpdate(BaseModel):
    brand_name: Optional[str] = None


class BrandScrapedAdResponse(BaseModel):
    id: str
    external_id: str
    page_name: Optional[str] = None
    page_link: Optional[str] = None
    headline: Optional[str] = None
    ad_copy: Optional[str] = None
    cta_text: Optional[str] = None
    media_type: Optional[str] = None
    media_urls: Optional[List[str]] = None
    original_media_urls: Optional[List[str]] = None
    platforms: Optional[List[str]] = None
    start_date: Optional[str] = None
    ad_link: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BrandScrapeResponse(BaseModel):
    id: str
    brand_name: str
    page_id: str
    page_name: Optional[str] = None
    page_url: str
    total_ads: int = 0
    media_downloaded: int = 0
    status: str = "pending"
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    ads: List[BrandScrapedAdResponse] = []

    class Config:
        from_attributes = True


class BrandScrapeListResponse(BaseModel):
    """Response without ads for list view."""
    id: str
    brand_name: str
    page_id: str
    page_name: Optional[str] = None
    page_url: str
    total_ads: int = 0
    media_downloaded: int = 0
    status: str = "pending"
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
