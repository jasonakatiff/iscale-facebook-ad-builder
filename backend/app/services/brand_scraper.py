"""
Brand Scraper Service

Scrapes all ads from a specific Facebook page and downloads media to R2.
"""

import httpx
import os
import re
import json
from typing import List, Optional, Tuple
from urllib.parse import urlparse, parse_qs
from sqlalchemy.orm import Session
from app.models import BrandScrape, BrandScrapedAd
from app.core.config import settings
import uuid


def parse_page_id_from_url(url: str) -> Optional[str]:
    """Extract view_all_page_id from Facebook Ads Library URL."""
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        page_id = params.get('view_all_page_id', [None])[0]
        return page_id
    except Exception:
        return None


def parse_search_query_from_url(url: str) -> Optional[str]:
    """Extract search query (q=) from Facebook Ads Library URL."""
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        query = params.get('q', [None])[0]
        return query
    except Exception:
        return None


def parse_url_filters(url: Optional[str]) -> Tuple[str, str]:
    """Extract (country, active_status) from an Ads Library URL.

    Defaults to ("US", "active") to preserve prior behavior when filters are absent.
    """
    country = "US"
    active_status = "active"
    if not url:
        return country, active_status
    try:
        params = parse_qs(urlparse(url).query)
        c = (params.get("country") or [None])[0]
        if c:
            country = c.upper()
        s = (params.get("active_status") or [None])[0]
        if s:
            active_status = s.lower()
    except Exception:
        pass
    return country, active_status


def sanitize_folder_name(name: str) -> str:
    """Sanitize brand name for use as R2 folder name."""
    # Remove special chars, replace spaces with underscores
    sanitized = re.sub(r'[^\w\s-]', '', name)
    sanitized = re.sub(r'\s+', '_', sanitized)
    return sanitized.lower()[:50]  # Limit length


class BrandScraperService:
    """Service for scraping brand ads and downloading media to R2."""

    def __init__(self, db: Session):
        self.db = db
        self.access_token = os.getenv("FACEBOOK_ADS_LIBRARY_TOKEN") or os.getenv("VITE_FACEBOOK_ACCESS_TOKEN")
        self.base_url = "https://graph.facebook.com/v21.0/ads_archive"

    async def scrape_brand(self, brand_scrape: BrandScrape) -> BrandScrape:
        """
        Scrape all ads from a brand's Facebook page and download media.

        Args:
            brand_scrape: BrandScrape record with page_id and brand_name set

        Returns:
            Updated BrandScrape record
        """
        try:
            brand_scrape.status = "scraping"
            self.db.commit()

            # Fetch ads from Facebook - pass brand_name + page_url for filter propagation
            ads_data = await self._fetch_page_ads(
                brand_scrape.page_id,
                brand_name=brand_scrape.brand_name,
                page_url=brand_scrape.page_url,
            )

            if not ads_data:
                brand_scrape.status = "completed"
                brand_scrape.total_ads = 0
                self.db.commit()
                return brand_scrape

            # Get page name from first ad
            if ads_data and ads_data[0].get("page_name"):
                brand_scrape.page_name = ads_data[0]["page_name"]

            brand_scrape.total_ads = len(ads_data)
            self.db.commit()

            # Process each ad - download media and create records
            media_count = 0
            folder_name = sanitize_folder_name(brand_scrape.brand_name)

            for ad_data in ads_data:
                try:
                    ad_record = await self._process_ad(ad_data, brand_scrape.id, folder_name)
                    if ad_record and ad_record.media_urls:
                        media_count += len(ad_record.media_urls)
                except Exception as e:
                    print(f"Error processing ad {ad_data.get('id')}: {e}")
                    continue

            brand_scrape.media_downloaded = media_count
            brand_scrape.status = "completed"
            self.db.commit()

            return brand_scrape

        except Exception as e:
            brand_scrape.status = "failed"
            brand_scrape.error_message = str(e)[:500]
            self.db.commit()
            raise

    async def _fetch_page_ads(self, page_id: str, limit: int = 500, brand_name: str = None, page_url: Optional[str] = None) -> List[dict]:
        """Fetch all ads from a specific Facebook page or search query."""
        ads = []

        country, active_status = parse_url_filters(page_url)

        # Check if page_id is actually a search query (non-numeric)
        is_search_query = not page_id.isdigit()

        # Use Playwright for search queries (gets more results than API)
        if is_search_query:
            print(f"Using Playwright for search query: {page_id} (country={country})")
            return await self._playwright_scrape_ads(
                page_id, limit, is_search=True, country=country, active_status=active_status,
            )

        # Use API for page-specific scrapes if we have a token
        if not self.access_token:
            print(f"No FB token, using Playwright for page scrape (country={country})")
            return await self._playwright_scrape_ads(
                page_id, limit, is_search=False, country=country, active_status=active_status,
            )

        async with httpx.AsyncClient(timeout=60.0) as client:
            after_cursor = None

            while len(ads) < limit:
                params = {
                    "access_token": self.access_token,
                    "ad_active_status": "ALL",
                    "ad_reached_countries": country,
                    "limit": min(300, limit - len(ads)),
                    "fields": "id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_snapshot_url,page_id,page_name,publisher_platforms,ad_delivery_start_time",
                    "search_page_ids": page_id
                }

                if after_cursor:
                    params["after"] = after_cursor

                try:
                    response = await client.get(self.base_url, params=params)
                    response.raise_for_status()
                    data = response.json()

                    if not data.get("data"):
                        break

                    ads.extend(data["data"])
                    print(f"Fetched {len(data['data'])} ads, total: {len(ads)}")

                    paging = data.get("paging", {})
                    if paging.get("next"):
                        after_cursor = paging.get("cursors", {}).get("after")
                    else:
                        break

                except Exception as e:
                    print(f"API error: {e}, falling back to Playwright")
                    return await self._playwright_scrape_ads(page_id, limit, is_search=False)

        return ads

    async def _playwright_scrape_ads(
        self,
        query: str,
        limit: int = 500,
        is_search: bool = True,
        country: str = "US",
        active_status: str = "active",
    ) -> List[dict]:
        """Scrape ads using Playwright browser automation with response interception for media."""
        from playwright.async_api import async_playwright
        import urllib.parse

        ads = []
        captured_images = {}  # url -> bytes
        fb_email = os.getenv("FB_SCRAPER_EMAIL")
        fb_password = os.getenv("FB_SCRAPER_PASSWORD")

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    locale='en-US',
                    extra_http_headers={'Accept-Language': 'en-US,en;q=0.9'},
                )
                page = await context.new_page()

                # Capture images as they load
                async def capture_image_response(response):
                    url = response.url
                    content_type = response.headers.get('content-type', '')
                    if 'image' in content_type and ('scontent' in url or 'fbcdn' in url):
                        try:
                            body = await response.body()
                            if len(body) > 5000:  # Only substantial images
                                captured_images[url] = body
                        except:
                            pass

                page.on('response', capture_image_response)

                # Login to Facebook if credentials provided
                if fb_email and fb_password:
                    print("Logging into Facebook...")
                    await page.goto("https://www.facebook.com/login", timeout=30000)
                    await page.wait_for_timeout(2000)

                    await page.fill('input[name="email"]', fb_email)
                    await page.fill('input[name="pass"]', fb_password)
                    await page.click('button[name="login"]')

                    # Wait for login to complete
                    await page.wait_for_timeout(5000)

                    # Check if logged in
                    current_url = page.url.lower()
                    if "login" in current_url or "checkpoint" in current_url:
                        error_detail = "Login page still showing" if "login" in current_url else "Security checkpoint triggered"
                        raise Exception(f"Facebook login failed: {error_detail}. URL: {page.url}")
                    else:
                        print("Facebook login successful")

                # Build URL
                if is_search:
                    search_query = urllib.parse.quote(query)
                    url = f"https://www.facebook.com/ads/library/?active_status={active_status}&ad_type=all&country={country}&media_type=all&q={search_query}"
                else:
                    url = f"https://www.facebook.com/ads/library/?active_status={active_status}&ad_type=all&country={country}&view_all_page_id={query}"

                print(f"Playwright navigating to: {url}")
                await page.goto(url, timeout=120000, wait_until="domcontentloaded")
                await page.wait_for_timeout(4000)  # give FB's hydration a beat

                # Wait for ads to load
                try:
                    await page.wait_for_selector('text=Library ID:', timeout=15000)
                except:
                    print("No ads found or page didn't load properly")
                    await browser.close()
                    return []

                # Scroll to load more ads
                scroll_count = min(20, limit // 10)
                for i in range(scroll_count):
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(1500)
                    print(f"Scroll {i+1}/{scroll_count}")

                # Extract ad data from DOM
                ads = await page.evaluate("""
                    () => {
                        const results = [];
                        const seenIds = new Set();

                        document.querySelectorAll('div').forEach(div => {
                            const text = div.innerText || '';
                            const idMatch = text.match(/Library ID:\\s*(\\d+)/);
                            if (!idMatch) return;

                            const libraryId = idMatch[1];
                            if (seenIds.has(libraryId)) return;
                            seenIds.add(libraryId);

                            // Extract page name
                            let pageName = null;
                            const sponsoredIdx = text.indexOf('Sponsored');
                            if (sponsoredIdx > 0) {
                                const before = text.substring(0, sponsoredIdx).split('\\n').filter(l => l.trim());
                                if (before.length) pageName = before[before.length - 1].trim();
                            }

                            // Extract headline and copy
                            let headline = null, adCopy = null, ctaText = null;
                            const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
                            const sponsoredLine = lines.findIndex(l => l === 'Sponsored');
                            if (sponsoredLine >= 0) {
                                for (let i = sponsoredLine + 1; i < lines.length; i++) {
                                    if (lines[i].includes('Library ID')) break;
                                    if (!headline && lines[i].length > 10) headline = lines[i];
                                    else if (headline && lines[i].length > 10 && !adCopy) adCopy = lines[i];
                                }
                            }

                            // Find CTA
                            const ctaPatterns = ['Learn More', 'Shop Now', 'Sign Up', 'Get Offer', 'Book Now', 'Download', 'Apply Now', 'Subscribe'];
                            for (const cta of ctaPatterns) {
                                if (text.includes(cta)) { ctaText = cta; break; }
                            }

                            // Find page link
                            let pageId = null;
                            div.querySelectorAll('a[href*="view_all_page_id"]').forEach(link => {
                                const match = link.href.match(/view_all_page_id=(\\d+)/);
                                if (match) pageId = match[1];
                            });

                            // Get images - try multiple selectors
                            const imageUrls = [];
                            // Try scontent images first
                            div.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]').forEach(img => {
                                if (img.src && !img.src.includes('emoji') && img.width > 50 && !imageUrls.includes(img.src)) {
                                    imageUrls.push(img.src);
                                }
                            });
                            // Also check for data-src (lazy loaded)
                            div.querySelectorAll('img[data-src*="scontent"], img[data-src*="fbcdn"]').forEach(img => {
                                if (img.dataset.src && !imageUrls.includes(img.dataset.src)) {
                                    imageUrls.push(img.dataset.src);
                                }
                            });
                            // Check for background images in style
                            div.querySelectorAll('[style*="background-image"]').forEach(el => {
                                const match = el.style.backgroundImage.match(/url\\(["']?(https:[^"')]+)["']?\\)/);
                                if (match && (match[1].includes('scontent') || match[1].includes('fbcdn')) && !imageUrls.includes(match[1])) {
                                    imageUrls.push(match[1]);
                                }
                            });

                            results.push({
                                id: libraryId,
                                page_name: pageName,
                                page_id: pageId,
                                ad_creative_link_titles: headline ? [headline] : null,
                                ad_creative_bodies: adCopy ? [adCopy] : null,
                                ad_creative_link_captions: ctaText ? [ctaText] : null,
                                _image_urls: imageUrls
                            });
                        });

                        return results;
                    }
                """)

                print(f"Playwright extracted {len(ads)} ads, captured {len(captured_images)} images from network")

                # Log image URL stats
                total_img_urls = sum(len(ad.get('_image_urls', [])) for ad in ads)
                print(f"Total image URLs extracted from DOM: {total_img_urls}")

                # Attach captured image data to ads
                matched_count = 0
                for ad in ads:
                    ad['_media_data'] = []
                    for img_url in ad.get('_image_urls', [])[:5]:
                        if img_url in captured_images:
                            ad['_media_data'].append({
                                'url': img_url,
                                'type': 'image',
                                'content_type': 'image/jpeg',
                                'data': captured_images[img_url]
                            })
                            matched_count += 1

                print(f"Matched {matched_count} images to ads")

                # If few matches, distribute captured images to ads without media
                if matched_count < len(ads) // 2 and captured_images:
                    print("Low match rate, distributing captured images to ads")
                    remaining_images = list(captured_images.items())
                    img_idx = 0
                    for ad in ads:
                        if not ad['_media_data'] and img_idx < len(remaining_images):
                            url, data = remaining_images[img_idx]
                            ad['_media_data'].append({
                                'url': url,
                                'type': 'image',
                                'content_type': 'image/jpeg',
                                'data': data
                            })
                            img_idx += 1

                await browser.close()

        except Exception as e:
            error_msg = f"Playwright scrape failed: {str(e)}"
            print(error_msg)
            import traceback
            traceback.print_exc()
            raise Exception(error_msg)

        return ads[:limit]

    async def _fallback_fetch_page_ads(self, page_id: str, limit: int = 500, brand_name: str = None, is_search: bool = False, country: str = "US", active_status: str = "active") -> List[dict]:
        """Fallback to Playwright for scraping when API unavailable. Captures both images and videos."""
        from playwright.async_api import async_playwright

        ads = []
        captured_media = []  # Store captured video/image data

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    locale='en-US',
                    extra_http_headers={'Accept-Language': 'en-US,en;q=0.9'},
                )
                page = await context.new_page()

                # Capture video responses as they stream
                async def capture_media_response(response):
                    url = response.url
                    content_type = response.headers.get('content-type', '')

                    # Capture videos
                    if 'video' in content_type:
                        try:
                            body = await response.body()
                            if len(body) > 10000:  # Only capture substantial videos
                                captured_media.append({
                                    'url': url,
                                    'type': 'video',
                                    'content_type': content_type,
                                    'data': body
                                })
                                print(f"Captured video: {len(body)} bytes")
                        except:
                            pass

                    # Capture images from scontent
                    elif 'image' in content_type and ('scontent' in url or 'fbcdn' in url):
                        try:
                            body = await response.body()
                            if len(body) > 5000:  # Only substantial images
                                captured_media.append({
                                    'url': url,
                                    'type': 'image',
                                    'content_type': content_type,
                                    'data': body
                                })
                        except:
                            pass

                page.on('response', capture_media_response)

                # Determine URL based on search type
                import urllib.parse

                if is_search:
                    # Use the search query directly
                    search_query = urllib.parse.quote(page_id)  # page_id contains the search term
                    url = f"https://www.facebook.com/ads/library/?active_status={active_status}&ad_type=all&country={country}&media_type=all&q={search_query}"
                    print(f"Searching for '{page_id}'...")
                elif brand_name:
                    # Search by brand name - videos autoplay in search results
                    search_query = urllib.parse.quote(brand_name)
                    url = f"https://www.facebook.com/ads/library/?active_status={active_status}&ad_type=all&country={country}&media_type=video&q={search_query}"
                    print(f"Searching for '{brand_name}' videos...")
                else:
                    url = f"https://www.facebook.com/ads/library/?active_status={active_status}&ad_type=all&country={country}&view_all_page_id={page_id}&media_type=all"
                    print(f"Scraping page ID: {page_id}")

                await page.goto(url, timeout=120000, wait_until="domcontentloaded")
                await page.wait_for_timeout(4000)

                try:
                    await page.wait_for_selector('text=Library ID:', timeout=15000)
                except:
                    print("No ads found")
                    await browser.close()
                    return []

                await page.wait_for_timeout(5000)  # Wait for video autoplay

                # Scroll to load more ads and trigger video loading
                for i in range(min(15, limit // 10)):
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(2000)  # More time for videos to load

                print(f"Captured {len(captured_media)} media items during scroll")

                # Extract ad metadata from DOM
                ads_data = await page.evaluate("""
                    () => {
                        const results = [];
                        const seenIds = new Set();

                        document.querySelectorAll('div').forEach(div => {
                            const text = div.innerText || '';
                            const idMatch = text.match(/Library ID:\\s*(\\d+)/);
                            if (!idMatch) return;

                            const libraryId = idMatch[1];
                            if (seenIds.has(libraryId)) return;
                            seenIds.add(libraryId);

                            // Extract brand name
                            let brandName = 'Unknown';
                            const sponsoredIdx = text.indexOf('Sponsored');
                            if (sponsoredIdx > 0) {
                                const before = text.substring(0, sponsoredIdx).split('\\n').filter(l => l.trim());
                                if (before.length) brandName = before[before.length - 1].trim();
                            }

                            // Extract headline, copy, and CTA
                            let headline = null, adCopy = null, ctaText = null;
                            const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
                            const sponsoredLine = lines.findIndex(l => l === 'Sponsored');
                            if (sponsoredLine >= 0) {
                                for (let i = sponsoredLine + 1; i < lines.length; i++) {
                                    if (lines[i].includes('Library ID') || lines[i].includes('http')) break;
                                    if (!headline && lines[i].length > 10) headline = lines[i];
                                    else if (headline && lines[i].length > 10) adCopy = (adCopy || '') + lines[i] + ' ';
                                }
                            }

                            // Look for common CTA button texts
                            const ctaPatterns = ['Learn More', 'Shop Now', 'Sign Up', 'Get Offer', 'Book Now', 'Contact Us', 'Download', 'Apply Now', 'Get Quote', 'Subscribe'];
                            for (const cta of ctaPatterns) {
                                if (text.includes(cta)) {
                                    ctaText = cta;
                                    break;
                                }
                            }

                            // Try to find page link (view_all_page_id link)
                            let pageId = null;
                            div.querySelectorAll('a[href*="view_all_page_id"]').forEach(link => {
                                const match = link.href.match(/view_all_page_id=(\\d+)/);
                                if (match) pageId = match[1];
                            });

                            // Get image URLs visible in this ad container
                            const imageUrls = [];
                            div.querySelectorAll('img[src*="scontent"]').forEach(img => {
                                if (img.src && !img.src.includes('emoji') && img.width > 50) {
                                    imageUrls.push(img.src);
                                }
                            });

                            // Check if this ad has a video
                            const hasVideo = div.querySelector('video') !== null ||
                                           text.match(/\\d+:\\d+/) !== null;  // Duration like "0:30"

                            results.push({
                                id: libraryId,
                                page_name: brandName,
                                page_id: pageId,
                                ad_creative_link_titles: headline ? [headline] : null,
                                ad_creative_bodies: adCopy ? [adCopy.trim()] : null,
                                ad_creative_link_captions: ctaText ? [ctaText] : null,
                                _image_urls: imageUrls,
                                _has_video: hasVideo
                            });
                        });

                        return results;
                    }
                """)

                # Associate captured media with ads
                video_index = 0
                for ad in ads_data[:limit]:
                    ad['_media_data'] = []

                    # Add images for this ad
                    for img_url in ad.get('_image_urls', [])[:3]:
                        # Find matching captured image
                        for media in captured_media:
                            if media['type'] == 'image' and media['url'] == img_url:
                                ad['_media_data'].append(media)
                                break

                    # If ad has video, assign next captured video
                    if ad.get('_has_video') and video_index < len([m for m in captured_media if m['type'] == 'video']):
                        videos = [m for m in captured_media if m['type'] == 'video']
                        if video_index < len(videos):
                            ad['_media_data'].append(videos[video_index])
                            video_index += 1

                ads = ads_data[:limit]
                await browser.close()

                print(f"Extracted {len(ads)} ads with media data")

        except Exception as e:
            print(f"Playwright scrape error: {e}")
            import traceback
            traceback.print_exc()

        return ads

    async def _process_ad(self, ad_data: dict, brand_scrape_id: str, folder_name: str) -> Optional[BrandScrapedAd]:
        """Process a single ad: extract media URLs and download to R2."""
        ad_id = ad_data.get("id")
        if not ad_id:
            return None

        # Parse ad fields
        headline = None
        if ad_data.get("ad_creative_link_titles"):
            titles = ad_data["ad_creative_link_titles"]
            headline = titles[0] if isinstance(titles, list) else titles

        ad_copy = None
        if ad_data.get("ad_creative_bodies"):
            bodies = ad_data["ad_creative_bodies"]
            ad_copy = bodies[0] if isinstance(bodies, list) else bodies

        cta_text = None
        if ad_data.get("ad_creative_link_captions"):
            captions = ad_data["ad_creative_link_captions"]
            cta_text = captions[0] if isinstance(captions, list) else captions

        platforms = None
        if ad_data.get("publisher_platforms"):
            platforms = [p.lower() for p in ad_data["publisher_platforms"]]

        start_date = ad_data.get("ad_delivery_start_time")

        r2_urls = []
        original_media_urls = []
        media_type = "image"

        # Check if we have pre-captured media data (from Playwright with response interception)
        media_data_list = ad_data.get("_media_data", [])

        if media_data_list:
            # Upload pre-captured media directly to R2
            for i, media_item in enumerate(media_data_list[:10]):
                try:
                    original_media_urls.append(media_item.get('url', ''))

                    # Determine extension from content type
                    content_type = media_item.get('content_type', '')
                    if 'video' in content_type:
                        ext = '.mp4'
                        detected_type = 'video'
                    elif 'png' in content_type:
                        ext = '.png'
                        detected_type = 'image'
                    elif 'webp' in content_type:
                        ext = '.webp'
                        detected_type = 'image'
                    else:
                        ext = '.jpg'
                        detected_type = 'image'

                    # Upload to R2
                    filename = f"{folder_name}/{ad_id}_{i}{ext}"
                    r2_url = await self._upload_to_r2(media_item['data'], filename, detected_type)

                    if r2_url:
                        r2_urls.append(r2_url)
                        if detected_type == "video":
                            media_type = "video"
                        print(f"Uploaded {detected_type} for ad {ad_id}: {len(media_item['data'])} bytes")

                except Exception as e:
                    print(f"Failed to upload media for ad {ad_id}: {e}")

        else:
            # Fallback: try to download from URLs (for API-sourced ads)
            url_list = ad_data.get("_media_urls", []) or ad_data.get("_image_urls", [])

            if not url_list and ad_data.get("ad_snapshot_url"):
                url_list = await self._extract_media_from_snapshot(ad_data["ad_snapshot_url"])

            original_media_urls = url_list[:10]

            for i, media_url in enumerate(original_media_urls):
                try:
                    r2_url, detected_type = await self._download_and_upload_media(
                        media_url, folder_name, ad_id, i
                    )
                    if r2_url:
                        r2_urls.append(r2_url)
                        if detected_type == "video":
                            media_type = "video"
                except Exception as e:
                    print(f"Failed to download media {media_url}: {e}")

        # Detect carousel
        if len(r2_urls) > 1 and media_type == "image":
            media_type = "carousel"

        # Extract page info
        page_name = ad_data.get("page_name")
        page_id_from_ad = ad_data.get("page_id")
        page_link = None
        if page_id_from_ad:
            page_link = f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&view_all_page_id={page_id_from_ad}"

        # Create record
        ad_record = BrandScrapedAd(
            brand_scrape_id=brand_scrape_id,
            external_id=ad_id,
            page_name=page_name[:200] if page_name else None,
            page_link=page_link,
            headline=headline[:500] if headline else None,
            ad_copy=ad_copy[:2000] if ad_copy else None,
            cta_text=cta_text[:200] if cta_text else None,
            media_type=media_type,
            media_urls=r2_urls if r2_urls else None,
            original_media_urls=original_media_urls[:10] if original_media_urls else None,
            platforms=platforms,
            start_date=start_date,
            ad_link=f"https://www.facebook.com/ads/library/?id={ad_id}"
        )

        self.db.add(ad_record)
        self.db.commit()

        return ad_record

    async def _extract_media_from_snapshot(self, snapshot_url: str) -> List[str]:
        """Extract media URLs from ad snapshot page."""
        media_urls = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(snapshot_url, follow_redirects=True)
                html = response.text

                # Look for image URLs
                img_pattern = r'https://[^"\']+\.(?:jpg|jpeg|png|webp)[^"\']*'
                images = re.findall(img_pattern, html, re.IGNORECASE)
                media_urls.extend([url for url in images if 'scontent' in url][:5])

                # Look for video URLs
                video_pattern = r'https://[^"\']+\.(?:mp4|webm)[^"\']*'
                videos = re.findall(video_pattern, html, re.IGNORECASE)
                media_urls.extend(videos[:3])

        except Exception as e:
            print(f"Error extracting media from snapshot: {e}")

        return media_urls

    async def _download_and_upload_media(
        self, media_url: str, folder_name: str, ad_id: str, index: int
    ) -> Tuple[Optional[str], str]:
        """Download media from URL and upload to R2."""
        try:
            # Determine file extension
            url_lower = media_url.lower()
            if any(ext in url_lower for ext in ['.mp4', '.webm', '.mov']):
                ext = '.mp4'
                media_type = "video"
            elif '.png' in url_lower:
                ext = '.png'
                media_type = "image"
            elif '.webp' in url_lower:
                ext = '.webp'
                media_type = "image"
            else:
                ext = '.jpg'
                media_type = "image"

            # Download media
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(media_url, follow_redirects=True)
                response.raise_for_status()
                content = response.content

            if len(content) < 1000:  # Too small, likely error
                return None, media_type

            # Upload to R2
            filename = f"{folder_name}/{ad_id}_{index}{ext}"
            r2_url = await self._upload_to_r2(content, filename, media_type)

            return r2_url, media_type

        except Exception as e:
            print(f"Download/upload error: {e}")
            return None, "image"

    async def _upload_to_r2(self, content: bytes, filename: str, media_type: str) -> Optional[str]:
        """Upload content to R2 and return public URL."""
        if not settings.r2_enabled:
            print("R2 not configured, skipping upload")
            return None

        try:
            import boto3

            s3_client = boto3.client(
                's3',
                endpoint_url=settings.r2_endpoint_url,
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                region_name='auto'
            )

            content_type = 'video/mp4' if media_type == 'video' else 'image/jpeg'

            s3_client.put_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=filename,
                Body=content,
                ContentType=content_type
            )

            return f"{settings.R2_PUBLIC_URL}/{filename}"

        except Exception as e:
            print(f"R2 upload error: {e}")
            return None

    async def delete_brand_scrape(self, brand_scrape: BrandScrape) -> bool:
        """Delete a brand scrape and its media from R2."""
        try:
            # Delete media from R2
            if settings.r2_enabled and brand_scrape.ads:
                import boto3

                s3_client = boto3.client(
                    's3',
                    endpoint_url=settings.r2_endpoint_url,
                    aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                    region_name='auto'
                )

                for ad in brand_scrape.ads:
                    if ad.media_urls:
                        for url in ad.media_urls:
                            try:
                                # Extract key from URL
                                key = url.replace(f"{settings.R2_PUBLIC_URL}/", "")
                                s3_client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
                            except Exception as e:
                                print(f"Error deleting {url}: {e}")

            # Delete from DB (cascade will delete ads)
            self.db.delete(brand_scrape)
            self.db.commit()

            return True

        except Exception as e:
            print(f"Error deleting brand scrape: {e}")
            return False
