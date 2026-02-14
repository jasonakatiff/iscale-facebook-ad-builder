"""
Facebook Ads Library API Client

Uses the official Meta Ads Library API for more reliable ad research.
API Docs: https://www.facebook.com/ads/library/api/

Note: The API has limitations:
- Full access requires ID verification for political/social issue ads
- Non-political ads may have limited data
- Access token required (from Facebook App)
"""

import httpx
import os
from typing import List, Optional
from app.schemas.research import ScrapedAdCreate
from datetime import datetime
from sqlalchemy.orm import Session


class FacebookAdsLibraryAPI:
    """Official Facebook Ads Library API client."""

    def __init__(self, db: Session = None):
        self.base_url = "https://graph.facebook.com/v21.0/ads_archive"
        self.access_token = os.getenv("FACEBOOK_ADS_LIBRARY_TOKEN") or os.getenv("VITE_FACEBOOK_ACCESS_TOKEN")
        self.db = db

    async def search_ads(self, query: str, limit: int = 10, country: str = "US", language: str = "", offset: int = 0, exclude_ids: List[str] = None, negative_keywords: List[str] = None):
        """
        Search Facebook Ads Library using API or fallback to scraper.

        Args:
            query: Search term (brand name, keyword, etc.)
            limit: Maximum number of ads to return
            country: Country code for ad_reached_countries
            language: Language filter (e.g. 'en', 'es', 'de', 'fr'). Empty = all.
            offset: Number of "pages" to skip (controls scroll depth)
            exclude_ids: List of ad IDs to exclude (already fetched)
            negative_keywords: List of keywords to filter out from results

        Returns:
            Tuple of (ads, metrics) where metrics is a dict with:
            - total_ads_found: Total ads returned from API
            - filtered_by_page_blacklist: Count filtered by page blacklist
            - filtered_by_keyword_blacklist: Count filtered by keywords
            - api_calls_made: Number of API calls
        """
        lang_label = f", language={language}" if language else ""
        print(f"Searching Facebook Ads Library for '{query}' in {country}{lang_label} (offset={offset}, negative_keywords={negative_keywords})")

        # Try API first if token available
        if self.access_token:
            try:
                ads = await self._api_search(query, limit, country, language, offset, exclude_ids or [], negative_keywords or [])

                # Fall back to Chromium if:
                # 1. API returns 0 ads (completely blocked keyword)
                # 2. API returns significantly fewer than requested (< 50% when limit >= 100)
                #    This catches keywords like "semaglutide" that are severely limited
                should_fallback = False
                if len(ads) == 0:
                    print(f"API returned 0 ads for '{query}', falling back to Chromium scraper")
                    should_fallback = True
                elif limit >= 100 and len(ads) < limit * 0.5:
                    print(f"API returned only {len(ads)} ads (requested {limit}), falling back to Chromium for full results")
                    should_fallback = True

                if should_fallback:
                    return await self._fallback_search(query, limit, country, language, offset, exclude_ids or [], negative_keywords or [])

                return ads
            except Exception as e:
                print(f"API search failed: {e}, falling back to scraper")

        # Fallback to scraper
        return await self._fallback_search(query, limit, country, language, offset, exclude_ids or [], negative_keywords or [])

    def _log_api_usage(self, query: str, api_calls: int, ads_returned: int, ads_saved: int):
        """Log API usage to database"""
        if not self.db:
            return

        from app.models import ApiUsageLog
        from datetime import date

        log = ApiUsageLog(
            endpoint="facebook_ads_library",
            api_calls=api_calls,
            ads_returned=ads_returned,
            ads_saved=ads_saved,
            query=query,
            date=str(date.today())
        )
        self.db.add(log)
        self.db.commit()

    async def _api_search(self, query: str, limit: int, country: str, language: str, offset: int, exclude_ids: List[str], negative_keywords: List[str]) -> List[ScrapedAdCreate]:
        """Search using official Facebook Ads Library API."""
        ads = []
        negative_keywords_lower = [kw.lower() for kw in negative_keywords]
        total_api_calls = 0
        total_ads_returned = 0
        filtered_count = 0
        parse_failed_count = 0
        blacklist_filtered = 0

        # Get blacklisted pages and keywords
        blacklisted_pages = set()
        blacklisted_keywords = []
        if self.db:
            from app.models import PageBlacklist, KeywordBlacklist
            page_blacklist = self.db.query(PageBlacklist).all()
            blacklisted_pages = {p.page_name.lower() for p in page_blacklist}

            keyword_blacklist = self.db.query(KeywordBlacklist).all()
            blacklisted_keywords = [k.keyword.lower() for k in keyword_blacklist]

            if blacklisted_pages:
                print(f"Filtering {len(blacklisted_pages)} blacklisted pages")
            if blacklisted_keywords:
                print(f"Filtering {len(blacklisted_keywords)} blacklisted keywords")

        # Combine negative keywords from request with persistent blacklisted keywords
        all_negative_keywords = negative_keywords_lower + blacklisted_keywords

        async with httpx.AsyncClient() as client:
            # Make multiple API calls if limit > 300
            remaining = limit
            after_cursor = str(offset) if offset > 0 else None

            while remaining > 0:
                batch_size = min(remaining, 300)  # API max is 300 per request
                params = {
                    "access_token": self.access_token,
                    "ad_reached_countries": country,
                    "search_terms": query,
                    "ad_active_status": "ACTIVE",
                    "limit": batch_size,
                    "fields": "id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_snapshot_url,page_name,impressions,spend,currency,publisher_platforms,ad_delivery_start_time,ad_delivery_stop_time"
                }

                if language:
                    params["languages"] = language

                if after_cursor:
                    params["after"] = after_cursor

                print(f"Calling API: {self.base_url} (batch {total_api_calls + 1}, requesting {batch_size} ads)")
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()

                data = response.json()
                total_api_calls += 1

                if not data.get("data"):
                    print("No more ads returned from API")
                    break

                batch_ads = data["data"]
                total_ads_returned += len(batch_ads)
                print(f"API returned {len(batch_ads)} ads in this batch")

                for ad_data in batch_ads:
                    ad_id = ad_data.get("id")

                    # Skip excluded IDs
                    if ad_id in exclude_ids:
                        continue

                    parsed_ad = self._parse_api_ad(ad_data)
                    if not parsed_ad:
                        parse_failed_count += 1
                        continue

                    # Filter blacklisted pages
                    if blacklisted_pages and parsed_ad.brand_name:
                        if parsed_ad.brand_name.lower() in blacklisted_pages:
                            blacklist_filtered += 1
                            continue

                    # Filter negative keywords (whole word matching)
                    if all_negative_keywords:
                        text_to_check = ' '.join([
                            parsed_ad.brand_name or '',
                            parsed_ad.headline or '',
                            parsed_ad.ad_copy or '',
                            parsed_ad.cta_text or ''
                        ]).lower()

                        # Use whole word matching with word boundaries
                        import re
                        should_filter = False
                        for kw in all_negative_keywords:
                            # Match whole word only (surrounded by word boundaries)
                            pattern = r'\b' + re.escape(kw) + r'\b'
                            if re.search(pattern, text_to_check):
                                should_filter = True
                                break

                        if should_filter:
                            filtered_count += 1
                            continue

                    ads.append(parsed_ad)

                    if len(ads) >= limit:
                        break

                # Check if we have pagination cursor for next batch
                if data.get("paging", {}).get("next"):
                    after_cursor = data["paging"].get("cursors", {}).get("after")
                else:
                    print("No more pages available")
                    break

                remaining -= batch_size

                # Stop if we've collected enough ads
                if len(ads) >= limit:
                    break

            print(f"Total: {total_api_calls} API calls, {total_ads_returned} ads returned, {blacklist_filtered} blacklisted, {filtered_count} filtered, {parse_failed_count} failed, kept {len(ads)} ads")

        # Log API usage
        self._log_api_usage(query, total_api_calls, total_ads_returned, len(ads))

        return ads

    def _parse_api_ad(self, ad_data: dict) -> Optional[ScrapedAdCreate]:
        """Parse an ad from the API response into our schema."""

        # Get ad copy from various fields
        ad_copy = None
        if ad_data.get("ad_creative_bodies"):
            bodies = ad_data["ad_creative_bodies"]
            ad_copy = bodies[0] if isinstance(bodies, list) and bodies else bodies

        # Get headline/title
        headline = None
        if ad_data.get("ad_creative_link_titles"):
            titles = ad_data["ad_creative_link_titles"]
            headline = titles[0] if isinstance(titles, list) and titles else titles

        # Get CTA from link caption
        cta_text = None
        if ad_data.get("ad_creative_link_captions"):
            captions = ad_data["ad_creative_link_captions"]
            cta_text = captions[0] if isinstance(captions, list) and captions else captions

        # Build the public Facebook Ads Library URL for this ad
        ad_id = ad_data.get("id")
        fb_library_url = f"https://www.facebook.com/ads/library/?id={ad_id}" if ad_id else None

        # Get platforms
        platforms = None
        if ad_data.get("publisher_platforms"):
            platforms = [p.lower() for p in ad_data["publisher_platforms"]]

        # Get start date
        start_date = None
        if ad_data.get("ad_delivery_start_time"):
            start_date = ad_data["ad_delivery_start_time"]

        # Detect media type (default to 'image' for now - can be enhanced later with snapshot analysis)
        # TODO: Parse ad_snapshot_url or use creative fields to detect video vs image vs carousel
        media_type = "image"

        return ScrapedAdCreate(
            brand_name=ad_data.get("page_name", "Unknown Brand"),
            headline=headline,
            ad_copy=ad_copy[:500] if ad_copy else None,
            cta_text=cta_text,
            platform="facebook",
            external_id=ad_id,
            ad_link=fb_library_url,
            platforms=platforms,
            start_date=start_date,
            media_type=media_type
        )

    async def _fallback_search(self, query: str, limit: int, country: str = "US", language: str = "", offset: int = 0, exclude_ids: List[str] = None, negative_keywords: List[str] = None) -> List[ScrapedAdCreate]:
        """
        Scrape Facebook Ads Library using Playwright.
        Extracts ad text data from DOM without media.

        Args:
            offset: Number of scroll batches to skip before collecting (for pagination)
            exclude_ids: Ad IDs to skip (already fetched in previous requests)
            negative_keywords: Keywords to filter out from results
        """
        exclude_ids = set(exclude_ids or [])
        negative_keywords = [kw.lower() for kw in (negative_keywords or [])]
        from playwright.async_api import async_playwright
        import urllib.parse
        import json

        ads = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                )
                page = await context.new_page()

                # Construct URL for Facebook Ads Library
                params = {
                    "active_status": "active",
                    "ad_type": "all",
                    "country": country,
                    "q": query,
                    "sort_data[direction]": "desc",
                    "sort_data[mode]": "relevancy_monthly_grouped",
                    "media_type": "all"
                }
                if language:
                    params["content_languages[0]"] = language
                url = f"https://www.facebook.com/ads/library/?{urllib.parse.urlencode(params)}"

                print(f"Scraping: {url}")

                await page.goto(url, timeout=60000, wait_until="domcontentloaded")
                # Wait for ads to load - look for Library ID text
                try:
                    await page.wait_for_selector('text=Library ID:', timeout=15000)
                except:
                    print("No ads found or page didn't load properly")
                await page.wait_for_timeout(3000)

                # Scroll to load more ads and trigger lazy loading
                # offset controls how deep we scroll (for pagination)
                base_scrolls = min(5, (limit // 3) + 1)
                total_scrolls = base_scrolls + (offset * 3)  # Each "page" = 3 more scrolls

                print(f"Scrolling {total_scrolls} times (base={base_scrolls}, offset={offset})")

                for i in range(total_scrolls):
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(1500 if i < base_scrolls else 1000)  # Faster scrolls for pagination

                # Give extra time for content to load
                await page.wait_for_timeout(2000)

                # Extract ads - text only, no media
                ads_data = await page.evaluate("""
                    () => {
                        const results = [];
                        const seenIds = new Set();

                        // Find all divs that contain "Library ID:" text directly
                        const libraryIdDivs = Array.from(document.querySelectorAll('div')).filter(div => {
                            const text = div.innerText || '';
                            return text.includes('Library ID:');
                        });

                        // For each Library ID div, find the closest parent that contains the full ad
                        libraryIdDivs.forEach(idDiv => {
                            // Walk up the DOM tree to find ad container
                            let current = idDiv;
                            let adContainer = null;

                            // Go up max 10 levels to find container with Sponsored + content
                            for (let i = 0; i < 10 && current; i++) {
                                const text = current.innerText || '';

                                // Look for container that has: Library ID + Sponsored (or substantial content)
                                if (text.includes('Library ID:') &&
                                    (text.includes('Sponsored') || text.length > 200)) {
                                    // Make sure it's not too large (probably page container)
                                    if (text.length < 15000) {
                                        adContainer = current;
                                    }
                                }
                                current = current.parentElement;
                            }

                            if (!adContainer) return;

                            const text = adContainer.innerText || '';

                            // Extract Library ID
                            const idMatch = text.match(/Library ID:\\s*(\\d+)/);
                            if (!idMatch) return;

                            const libraryId = idMatch[1];
                            if (seenIds.has(libraryId)) return;
                            seenIds.add(libraryId);

                            // Split text into lines (handle newlines properly)
                            const lines = text.split(String.fromCharCode(10)).map(l => l.trim()).filter(l => l.length > 0 && l !== String.fromCharCode(8203));

                            // Find brand name - line immediately before "Sponsored"
                            let brandName = 'Unknown Brand';
                            let sponsoredIndex = -1;

                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i] === 'Sponsored') {
                                    sponsoredIndex = i;
                                    // Brand is usually the line right before "Sponsored"
                                    if (i > 0) {
                                        const candidate = lines[i - 1];
                                        // Make sure it's not metadata
                                        if (candidate && candidate.length > 3 && candidate.length < 150 &&
                                            !candidate.includes('Library ID') &&
                                            !candidate.includes('See ad details') &&
                                            !candidate.includes('Menu') &&
                                            candidate !== 'Active' &&
                                            candidate !== 'Inactive') {
                                            brandName = candidate;
                                        }
                                    }
                                    break;
                                }
                            }

                            // Extract ad content - everything after "Sponsored" until we hit metadata or URLs
                            let adCopy = '';
                            let headline = '';
                            let captureContent = false;

                            for (let i = sponsoredIndex + 1; i < lines.length; i++) {
                                const line = lines[i];

                                // Stop at certain patterns
                                if (line.includes('Library ID') ||
                                    line.includes('Started running') ||
                                    line.includes('Platforms') ||
                                    line.includes('http://') ||
                                    line.includes('https://') ||
                                    line.includes('HTTPS://') ||
                                    line.includes('HTTP://')) {
                                    break;
                                }

                                // Skip empty or very short lines
                                if (line.length < 3) continue;

                                // First substantive line is headline
                                if (!headline && line.length >= 10) {
                                    headline = line;
                                    captureContent = true;
                                    continue;
                                }

                                // Capture remaining lines as ad copy
                                if (captureContent && line.length >= 10) {
                                    adCopy += (adCopy ? '\\n' : '') + line;
                                }
                            }

                            // Extract CTA button text
                            let ctaText = null;
                            adContainer.querySelectorAll('a, button').forEach(el => {
                                const elText = (el.innerText || '').trim();
                                const commonCTAs = ['learn more', 'shop now', 'sign up', 'get started',
                                                   'download', 'subscribe', 'buy now', 'see more'];
                                if (commonCTAs.some(cta => elText.toLowerCase().includes(cta))) {
                                    ctaText = elText;
                                }
                            });

                            // Extract platforms
                            let platforms = [];
                            if (text.includes('Facebook')) platforms.push('facebook');
                            if (text.includes('Instagram')) platforms.push('instagram');
                            if (text.includes('Messenger')) platforms.push('messenger');
                            if (text.includes('Audience Network')) platforms.push('audience_network');

                            // Extract start date
                            let startDate = null;
                            const dateMatch = text.match(/Started running on\\s+([A-Za-z]+\\s+\\d+,?\\s*\\d*)/);
                            if (dateMatch) startDate = dateMatch[1];

                            results.push({
                                external_id: libraryId,
                                brand_name: brandName,
                                headline: headline || null,
                                ad_copy: adCopy.substring(0, 500),
                                cta_text: ctaText,
                                platforms: platforms.length > 0 ? platforms : null,
                                start_date: startDate
                            });
                        });

                        return results;
                    }
                """)

                print(f"Found {len(ads_data)} ads from DOM")

                # Filter out excluded IDs
                if exclude_ids:
                    ads_data = [ad for ad in ads_data if ad.get('external_id') not in exclude_ids]
                    print(f"After filtering excludes: {len(ads_data)} ads")

                # Filter out negative keywords
                if negative_keywords:
                    filtered = []
                    for ad_data in ads_data:
                        # Check all text fields for negative keywords
                        text_to_check = ' '.join([
                            ad_data.get('brand_name', ''),
                            ad_data.get('headline', ''),
                            ad_data.get('ad_copy', ''),
                            ad_data.get('cta_text', '')
                        ]).lower()

                        # Skip if any negative keyword found
                        has_negative = any(kw in text_to_check for kw in negative_keywords)
                        if not has_negative:
                            filtered.append(ad_data)

                    ads_data = filtered
                    print(f"After filtering negative keywords: {len(ads_data)} ads")

                # Build ScrapedAdCreate objects
                for i, ad_data in enumerate(ads_data[:limit]):
                    try:
                        # Build FB library URL
                        fb_library_url = f"https://www.facebook.com/ads/library/?id={ad_data['external_id']}"

                        ad = ScrapedAdCreate(
                            brand_name=ad_data.get('brand_name', 'Unknown Brand'),
                            headline=ad_data.get('headline'),
                            ad_copy=ad_data.get('ad_copy', 'No copy available')[:500],
                            cta_text=ad_data.get('cta_text'),
                            platform="facebook",
                            external_id=ad_data['external_id'],
                            ad_link=fb_library_url,
                            platforms=ad_data.get('platforms'),
                            start_date=ad_data.get('start_date')
                        )
                        ads.append(ad)

                    except Exception as e:
                        print(f"Error parsing ad: {e}")
                        continue

                await browser.close()

        except Exception as e:
            print(f"Scraper error: {e}")
            import traceback
            traceback.print_exc()

        return ads


# Singleton instance
scraper = FacebookAdsLibraryAPI()
