from sqlalchemy.orm import Session
from app.models import ScrapedAd, SavedSearch, FacebookPage
from app.schemas.research import AdSearchRequest, ScrapedAdCreate
from typing import Optional
import uuid
import httpx
import os
import hashlib
from datetime import datetime
from app.core.config import settings
from sqlalchemy import func


class ResearchService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def compute_content_hash(ad_data) -> str:
        """Compute hash from ad content for deduplication."""
        content = f"{ad_data.brand_name or ''}|{ad_data.headline or ''}|{ad_data.ad_copy or ''}|{ad_data.cta_text or ''}"
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    async def search_and_save(self, request: AdSearchRequest):
        """Execute search and save as SavedSearch with all ads"""
        from app.services.scraper import FacebookAdsLibraryAPI

        # Create scraper with db session for logging
        scraper = FacebookAdsLibraryAPI(db=self.db)

        # Execute search
        ads = await scraper.search_ads(
            request.query,
            request.limit,
            request.country,
            request.language,
            request.offset,
            request.exclude_ids,
            request.negative_keywords
        )

        # Track statistics
        ads_requested = request.limit
        ads_returned = len(ads)
        ads_new = 0
        ads_duplicate = 0

        # Create SavedSearch
        saved_search = SavedSearch(
            query=request.query,
            country=request.country,
            negative_keywords=request.negative_keywords if request.negative_keywords else None,
            vertical_id=request.vertical_id,
            search_type=request.search_type,
            schedule_config=request.schedule_config,
            is_active=True if request.search_type != 'one_time' else None,
            ads_requested=ads_requested,
            ads_returned=ads_returned
        )
        self.db.add(saved_search)
        self.db.flush()  # Get ID

        # Save all ads linked to this search
        saved_ads = []
        seen_hashes = set()  # Track hashes in current batch to avoid duplicates

        # Pre-load all existing ads by content_hash to avoid repeated queries
        all_hashes = [self.compute_content_hash(ad) for ad in ads if self.compute_content_hash(ad)]
        existing_ads_by_hash = {}
        if all_hashes:
            existing_ads = self.db.query(ScrapedAd).filter(
                ScrapedAd.content_hash.in_(all_hashes)
            ).all()
            existing_ads_by_hash = {ad.content_hash: ad for ad in existing_ads}

        for ad_data in ads:
            # Compute content hash
            content_hash = self.compute_content_hash(ad_data)

            # Skip if we've already seen this hash in this batch
            if content_hash and content_hash in seen_hashes:
                ads_duplicate += 1
                continue

            # Mark this hash as seen in this batch (do this early to prevent duplicates)
            if content_hash:
                seen_hashes.add(content_hash)

            # Check if ad exists by content_hash (from pre-loaded dict)
            existing = existing_ads_by_hash.get(content_hash) if content_hash else None

            # Fallback: check by external_id if not found by hash
            if not existing and ad_data.external_id:
                existing = self.db.query(ScrapedAd).filter(
                    ScrapedAd.external_id == ad_data.external_id
                ).first()

            if existing:
                # Update last_seen timestamp and increment seen_count
                existing.last_seen = datetime.utcnow()
                existing.seen_count = (existing.seen_count or 0) + 1
                saved_ads.append(existing)
                ads_duplicate += 1
            else:
                ads_new += 1
                # Get or create FacebookPage
                fb_page = None
                if ad_data.brand_name:
                    fb_page = self.db.query(FacebookPage).filter(
                        FacebookPage.page_name == ad_data.brand_name
                    ).first()

                    if not fb_page:
                        fb_page = FacebookPage(page_name=ad_data.brand_name, total_ads=0)
                        self.db.add(fb_page)
                        self.db.flush()

                # Create ad with FacebookPage link and content_hash
                ad_dict = ad_data.dict()
                ad_dict['content_hash'] = content_hash
                if fb_page:
                    ad_dict['facebook_page_id'] = fb_page.id

                db_ad = ScrapedAd(**ad_dict, search_id=saved_search.id)
                self.db.add(db_ad)
                saved_ads.append(db_ad)

                # Add to existing_ads_by_hash to prevent duplicates within this batch
                if content_hash:
                    existing_ads_by_hash[content_hash] = db_ad

        # Update total_ads count for all affected FacebookPages
        try:
            self.db.flush()
        except Exception as e:
            # Handle duplicate content_hash errors gracefully
            if 'duplicate key value violates unique constraint' in str(e) and 'content_hash' in str(e):
                print(f"Duplicate content_hash error during flush, rolling back and retrying with existing ads")
                self.db.rollback()

                # Retry: for each ad in saved_ads that's new (not yet in DB),
                # check if it now exists and update instead
                saved_ads_clean = []
                for ad in saved_ads:
                    if ad.id and self.db.query(ScrapedAd).filter(ScrapedAd.id == ad.id).first():
                        # Ad already exists in session/DB
                        saved_ads_clean.append(ad)
                    else:
                        # Try to find existing by content_hash
                        existing = self.db.query(ScrapedAd).filter(
                            ScrapedAd.content_hash == ad.content_hash
                        ).first()
                        if existing:
                            existing.last_seen = datetime.utcnow()
                            existing.seen_count = (existing.seen_count or 0) + 1
                            saved_ads_clean.append(existing)

                saved_ads = saved_ads_clean
                self.db.flush()
            else:
                raise

        page_ids = {ad.facebook_page_id for ad in saved_ads if ad.facebook_page_id}
        for page_id in page_ids:
            total = self.db.query(func.count(ScrapedAd.id)).filter(
                ScrapedAd.facebook_page_id == page_id
            ).scalar()
            fb_page = self.db.query(FacebookPage).filter(FacebookPage.id == page_id).first()
            if fb_page:
                fb_page.total_ads = total

        # Update saved_search with final statistics
        saved_search.ads_new = ads_new
        saved_search.ads_duplicate = ads_duplicate

        self.db.commit()
        self.db.refresh(saved_search)

        return saved_search, saved_ads

    async def search_ads_async(self, request: AdSearchRequest):
        """Search without saving"""
        from app.services.scraper import scraper
        return await scraper.search_ads(
            request.query,
            request.limit,
            request.country,
            request.language,
            request.offset,
            request.exclude_ids,
            request.negative_keywords
        )

    def get_saved_searches(self):
        """Get all saved searches"""
        return self.db.query(SavedSearch).order_by(SavedSearch.created_at.desc()).all()

    def get_saved_search_with_ads(self, search_id: str):
        """Get saved search with its ads"""
        return self.db.query(SavedSearch).filter(SavedSearch.id == search_id).first()

    def delete_saved_search(self, search_id: str):
        """Delete saved search (cascades to ads)"""
        search = self.db.query(SavedSearch).filter(SavedSearch.id == search_id).first()
        if search:
            self.db.delete(search)
            self.db.commit()
            return True
        return False

    def search_saved_ads(self, query: str) -> list[ScrapedAd]:
        """Search stored ads by keyword in brand name, headline, or ad copy"""
        query_lower = query.lower()
        ads = self.db.query(ScrapedAd).filter(
            (ScrapedAd.brand_name.ilike(f"%{query}%")) |
            (ScrapedAd.headline.ilike(f"%{query}%")) |
            (ScrapedAd.ad_copy.ilike(f"%{query}%"))
        ).order_by(ScrapedAd.created_at.desc()).all()
        return ads
