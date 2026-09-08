from app.telemetry.runtime import capture_exception
import os
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.adimage import AdImage
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.advideo import AdVideo
from dotenv import load_dotenv
from pathlib import Path
from facebook_business.adobjects.user import User
import time
import threading
import hashlib
from copy import deepcopy
from app.services.campaign_validation import campaign_params, adset_params

# Load .env from project root (parent of backend)
env_path = Path(__file__).resolve().parent.parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

class FacebookService:
    _accounts_cache = {}
    _accounts_lock = threading.Lock()
    ACCOUNT_CACHE_SECONDS = 3600
    def __init__(self, access_token=None, ad_account_id=None, app_id=None, app_secret=None):
        # Try standard names first, then VITE_ prefixed names (common in this project)
        self.access_token = access_token or os.getenv("FACEBOOK_ACCESS_TOKEN") or os.getenv("VITE_FACEBOOK_ACCESS_TOKEN")
        self.ad_account_id = ad_account_id or os.getenv("FACEBOOK_AD_ACCOUNT_ID") or os.getenv("VITE_FACEBOOK_AD_ACCOUNT_ID")
        self.app_id = app_id or os.getenv("FACEBOOK_APP_ID") or os.getenv("VITE_FACEBOOK_APP_ID")
        self.app_secret = app_secret or os.getenv("FACEBOOK_APP_SECRET") or os.getenv("VITE_FACEBOOK_APP_SECRET")
        self.api = None
        self.account = None
        
        if self.access_token and self.ad_account_id:
            self.initialize()

    def initialize(self):
        """Initialize the Facebook API connection."""
        try:
            self.api = FacebookAdsApi.init(
                app_id=self.app_id,
                app_secret=self.app_secret,
                access_token=self.access_token
            )
            
            # Only set up the AdAccount object if we have an ID
            if self.ad_account_id:
                # Ensure ad account ID has 'act_' prefix
                account_id = self.ad_account_id
                if not account_id.startswith('act_'):
                    account_id = f'act_{account_id}'
                self.account = AdAccount(account_id, api=self.api)
            
            return True
        except Exception as e:
            # Re-raise the exception so the caller knows what went wrong
            capture_exception(e, "facebook_service.initialize")
            raise Exception(f"Facebook API Init Error: {str(e)}")


    def get_ad_accounts(self, force_refresh=False):
        if not self.api:
            self.initialize()
        selected_id = self.ad_account_id
        if selected_id and not selected_id.startswith('act_'):
            selected_id = f'act_{selected_id}'
        key = (hashlib.sha256((self.access_token or '').encode()).hexdigest(), selected_id)
        with self._accounts_lock:
            cached = self._accounts_cache.get(key)
            if cached and not force_refresh and time.monotonic() - cached[0] < self.ACCOUNT_CACHE_SECONDS:
                return deepcopy(cached[1])
            me = User(fbid='me', api=self.api)
            fields = ['id', 'name', 'account_id', 'account_status', 'currency', 'timezone_name', 'min_daily_budget', 'business_name', 'balance', 'amount_spent']
            accounts = sorted([dict(acc) for acc in me.get_ad_accounts(fields=fields, params={'limit': 200})], key=lambda acc: acc.get('name', '').casefold())
            if selected_id:
                accounts = [account for account in accounts if account.get('id') == selected_id]
            self._accounts_cache[key] = (time.monotonic(), accounts)
            return deepcopy(accounts)

    def get_account_details(self, ad_account_id):
        return dict(self._get_account(ad_account_id).api_get(fields=['id', 'name', 'currency', 'timezone_name', 'min_daily_budget']))

    def get_custom_audiences(self, ad_account_id):
        return [dict(item) for item in self._get_account(ad_account_id).get_custom_audiences(fields=['id', 'name', 'subtype'], params={'limit': 200})]

    def get_instagram_accounts(self, ad_account_id):
        return [dict(item) for item in self._get_account(ad_account_id).get_instagram_accounts(fields=['id', 'username'], params={'limit': 200})]

    def _get_account(self, ad_account_id=None):
        """Helper to get AdAccount object."""
        if ad_account_id:
            if not ad_account_id.startswith('act_'):
                ad_account_id = f'act_{ad_account_id}'
            return AdAccount(ad_account_id, api=self.api)
        
        if self.account:
            return self.account
            
        raise Exception("No Ad Account ID provided and no default account set.")

    def get_insights(self, ad_account_id=None, level='campaign', date_preset='last_30d',
                     time_range=None, breakdown=None):
        """Fetch performance insights for an ad account.

        Args:
            ad_account_id: act_xxx account id (optional; defaults to env)
            level: 'account' | 'campaign' | 'adset' | 'ad'
            date_preset: today, yesterday, last_7d, last_14d, last_30d, last_90d, maximum
            time_range: {'since':'YYYY-MM-DD','until':'YYYY-MM-DD'} — overrides date_preset
            breakdown: optional FB breakdown (e.g. 'age', 'gender', 'country')
        """
        account = self._get_account(ad_account_id)

        fields = [
            'account_id', 'account_name',
            'campaign_id', 'campaign_name',
            'adset_id', 'adset_name',
            'ad_id', 'ad_name',
            'spend', 'impressions', 'reach', 'frequency',
            'clicks', 'unique_clicks', 'ctr', 'unique_ctr',
            'cpc', 'cpm', 'cpp',
            'actions', 'action_values',
            'purchase_roas', 'website_purchase_roas',
            'cost_per_action_type', 'cost_per_unique_click',
            'video_p25_watched_actions', 'video_p50_watched_actions',
            'video_p75_watched_actions', 'video_p100_watched_actions',
            'date_start', 'date_stop',
        ]

        params = {'level': level}
        if time_range:
            params['time_range'] = time_range
        else:
            params['date_preset'] = date_preset
        if breakdown:
            params['breakdowns'] = breakdown

        try:
            insights = account.get_insights(fields=fields, params=params)
            results = []
            for row in insights:
                d = dict(row)
                # Convert nested list-of-dict Facebook structures to plain JSON-safe
                for key in ('actions', 'action_values', 'cost_per_action_type',
                            'purchase_roas', 'website_purchase_roas',
                            'video_p25_watched_actions', 'video_p50_watched_actions',
                            'video_p75_watched_actions', 'video_p100_watched_actions'):
                    if key in d and d[key] is not None:
                        d[key] = [dict(x) for x in d[key]]
                results.append(d)
            return results
        except Exception as e:
            capture_exception(e, "facebook_service.get_insights")
            print(f"Error fetching insights: {e}")
            raise

    def get_campaigns(self, ad_account_id=None):
        """Fetch all campaigns from the ad account."""
        account = self._get_account(ad_account_id)
            
        fields = [
            Campaign.Field.id,
            Campaign.Field.name,
            Campaign.Field.objective,
            Campaign.Field.status,
            Campaign.Field.daily_budget,
            Campaign.Field.lifetime_budget,
            Campaign.Field.budget_remaining,
            Campaign.Field.bid_strategy,
            'special_ad_categories',
            'special_ad_category_country',
            'is_adset_budget_sharing_enabled',
        ]

        
        return account.get_campaigns(fields=fields)

    def create_campaign(self, campaign_data, ad_account_id=None):
        return self._get_account(ad_account_id).create_campaign(params=campaign_params(campaign_data))

    def get_pixels(self, ad_account_id=None):
        """Fetch all pixels for the ad account."""
        from facebook_business.adobjects.adspixel import AdsPixel
        
        account = self._get_account(ad_account_id)
        
        fields = [
            AdsPixel.Field.id,
            AdsPixel.Field.name,
        ]
        
        pixels = account.get_ads_pixels(fields=fields)
        return [dict(pixel) for pixel in pixels]

    def get_pages(self, ad_account_id=None):
        fields = ['id', 'name', 'category']
        if ad_account_id:
            pages = self._get_account(ad_account_id).get_promote_pages(fields=fields, params={'limit': 200})
        else:
            pages = User(fbid='me', api=self.api).get_accounts(fields=fields, params={'limit': 200})
        return sorted([dict(page) for page in pages], key=lambda page: page.get('name', '').casefold())

    def get_adsets(self, ad_account_id=None, campaign_id=None):
        """Fetch all ad sets."""
        fields = [
            AdSet.Field.id,
            AdSet.Field.name,
            AdSet.Field.status,
            AdSet.Field.daily_budget,
            AdSet.Field.targeting,
            AdSet.Field.optimization_goal,
            AdSet.Field.billing_event,
            AdSet.Field.bid_amount,
            AdSet.Field.promoted_object,
            AdSet.Field.campaign_id,
        ]

        if campaign_id:
            # Fetch from campaign
            campaign = Campaign(campaign_id, api=self.api)
            return campaign.get_ad_sets(fields=fields)
        
        account = self._get_account(ad_account_id)
        return account.get_ad_sets(fields=fields)

    def get_ads(self, adset_id):
        """Fetch all ads for a specific ad set."""
        adset = AdSet(adset_id, api=self.api)
        fields = [
            Ad.Field.id,
            Ad.Field.name,
            Ad.Field.status,
            Ad.Field.creative,
        ]
        return adset.get_ads(fields=fields)

    def create_adset(self, adset_data, ad_account_id=None):
        account = self._get_account(ad_account_id)
        data = dict(adset_data)
        campaign_id = data.get('campaign_id')
        if campaign_id:
            campaign = Campaign(campaign_id, api=self.api).api_get(fields=['objective', 'daily_budget', 'lifetime_budget', 'bid_strategy'])
            data['objective'] = campaign['objective']
            data['budgetType'] = 'CBO' if campaign.get('daily_budget') or campaign.get('lifetime_budget') else 'ABO'
            if data['budgetType'] == 'CBO':
                data['bidStrategy'] = campaign.get('bid_strategy') or 'LOWEST_COST_WITHOUT_CAP'
        details = self.get_account_details(ad_account_id)
        params = adset_params(data, details.get('timezone_name'))
        if 'daily_budget' in params and details.get('min_daily_budget') is None:
            raise ValueError('Ad account minimum daily budget is unavailable. Sync the ad account.')
        minimum = int(details.get('min_daily_budget') or 1)
        if 'daily_budget' in params and params['daily_budget'] < minimum:
            raise ValueError('Daily budget is below the ad account minimum.')
        return account.create_ad_set(params=params)

    def upload_image(self, image_path_or_url, ad_account_id=None):
        """Upload an image to the ad library."""
        import tempfile
        import requests

        account = self._get_account(ad_account_id)

        # Check if it's a URL or local file path
        if image_path_or_url.startswith('http://') or image_path_or_url.startswith('https://'):
            # Download the image to a temp file
            response = requests.get(image_path_or_url, timeout=30)
            response.raise_for_status()

            # Get file extension from URL or default to .jpg
            ext = '.jpg'
            if '.' in image_path_or_url.split('/')[-1]:
                ext = '.' + image_path_or_url.split('.')[-1].split('?')[0]

            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(response.content)
                local_path = tmp.name

            image = AdImage(parent_id=account.get_id_assured(), api=self.api)
            image[AdImage.Field.filename] = local_path
            image.remote_create()

            # Clean up temp file
            try:
                os.remove(local_path)
            except:
                pass

            return image[AdImage.Field.hash]
        else:
            # Local file path
            image = AdImage(parent_id=account.get_id_assured(), api=self.api)
            image[AdImage.Field.filename] = image_path_or_url
            image.remote_create()
            return image[AdImage.Field.hash]

    def upload_video(self, video_path_or_url, ad_account_id=None, wait_for_ready=True, timeout=600):
        """Upload a video to the ad library.

        Args:
            video_path_or_url: Local file path or URL to video
            ad_account_id: Optional ad account ID
            wait_for_ready: Whether to wait for video processing to complete
            timeout: Max seconds to wait for processing (default 10 min)

        Returns:
            dict with video_id, status, and thumbnails (if ready)
        """
        import tempfile
        import requests

        account = self._get_account(ad_account_id)

        # Check if it's a URL or local file path
        if video_path_or_url.startswith('http://') or video_path_or_url.startswith('https://'):
            # Download the video to a temp file
            print(f"Downloading video from URL: {video_path_or_url[:100]}...")
            response = requests.get(video_path_or_url, timeout=120, stream=True)
            response.raise_for_status()

            # Get file extension from URL or default to .mp4
            ext = '.mp4'
            if '.' in video_path_or_url.split('/')[-1]:
                url_ext = video_path_or_url.split('.')[-1].split('?')[0].lower()
                if url_ext in ['mp4', 'mov', 'avi', 'webm']:
                    ext = '.' + url_ext

            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                for chunk in response.iter_content(chunk_size=8192):
                    tmp.write(chunk)
                local_path = tmp.name

            print(f"Video downloaded to temp file: {local_path}")
        else:
            local_path = video_path_or_url

        try:
            # Create and upload video
            video = AdVideo(parent_id=account.get_id_assured(), api=self.api)
            video[AdVideo.Field.filepath] = local_path
            video.remote_create()

            video_id = video['id']
            print(f"Video uploaded with ID: {video_id}")

            if wait_for_ready:
                # Wait for video processing to complete
                status = self.wait_for_video_ready(video_id, timeout=timeout)
            else:
                status = self.get_video_status(video_id)

            # Get thumbnails if video is ready
            thumbnails = []
            if status.get('status') == 'ready':
                try:
                    thumbnails = self.get_video_thumbnails(video_id)
                except Exception as e:
                    capture_exception(e, "facebook_service.upload_video")
                    print(f"Warning: Could not fetch thumbnails: {e}")

            return {
                'video_id': video_id,
                'status': status.get('status', 'processing'),
                'thumbnails': thumbnails
            }

        finally:
            # Clean up temp file if we downloaded it
            if video_path_or_url.startswith('http'):
                try:
                    os.remove(local_path)
                except:
                    pass

    def get_video_status(self, video_id):
        """Check the processing status of a video.

        Returns:
            dict with status ('processing', 'ready', 'error')
        """
        import requests

        url = f"https://graph.facebook.com/v21.0/{video_id}"
        params = {
            'fields': 'id,status,length,source',
            'access_token': self.access_token
        }

        response = requests.get(url, params=params, timeout=30)
        data = response.json()

        if 'error' in data:
            return {'status': 'error', 'error': data['error'].get('message', 'Unknown error')}

        # Facebook video status can be: processing, ready, error
        fb_status = data.get('status', {})
        if isinstance(fb_status, dict):
            video_status = fb_status.get('video_status', 'processing').lower()
        else:
            video_status = str(fb_status).lower()

        return {
            'status': video_status,
            'video_id': video_id,
            'length': data.get('length'),
            'source': data.get('source')
        }

    def wait_for_video_ready(self, video_id, timeout=600, interval=10):
        """Wait for video processing to complete.

        Args:
            video_id: Facebook video ID
            timeout: Max seconds to wait
            interval: Seconds between status checks

        Returns:
            dict with final status
        """
        start_time = time.time()

        while (time.time() - start_time) < timeout:
            status = self.get_video_status(video_id)
            print(f"Video {video_id} status: {status.get('status')}")

            if status.get('status') == 'ready':
                return status
            elif status.get('status') == 'error':
                raise Exception(f"Video processing failed: {status.get('error', 'Unknown error')}")

            time.sleep(interval)

        raise Exception(f"Video processing timeout after {timeout} seconds")

    def get_video_thumbnails(self, video_id):
        """Get auto-generated thumbnails for a video.

        Returns:
            list of thumbnail URLs
        """
        import requests

        url = f"https://graph.facebook.com/v21.0/{video_id}/thumbnails"
        params = {
            'access_token': self.access_token
        }

        response = requests.get(url, params=params, timeout=30)
        data = response.json()

        if 'error' in data:
            print(f"Thumbnail fetch error: {data['error']}")
            return []

        thumbnails = []
        for thumb in data.get('data', []):
            if 'uri' in thumb:
                thumbnails.append(thumb['uri'])

        return thumbnails

    def create_creative(self, creative_data, ad_account_id=None):
        """Create an ad creative (supports both image and video)."""
        account = self._get_account(ad_account_id)

        page_id = creative_data.get('page_id')
        image_hash = creative_data.get('image_hash')
        video_id = creative_data.get('video_id')

        # Determine if this is a video or image creative
        if video_id:
            # Video creative
            object_story_spec = {
                'page_id': page_id,
                'video_data': {
                    'video_id': video_id,
                    'message': creative_data.get('primary_text', ''),
                    'title': creative_data.get('headline', ''),
                    'call_to_action': {
                        'type': creative_data.get('cta', 'LEARN_MORE'),
                        'value': {
                            'link': creative_data.get('website_url')
                        }
                    }
                }
            }

            # Add custom thumbnail if provided
            if creative_data.get('thumbnail_url'):
                object_story_spec['video_data']['image_url'] = creative_data['thumbnail_url']
        else:
            # Image creative (existing logic)
            object_story_spec = {
                'page_id': page_id,
                'link_data': {
                    'image_hash': image_hash,
                    'link': creative_data.get('website_url'),
                    'message': creative_data.get('primary_text'),
                    'name': creative_data.get('headline'),
                    'description': creative_data.get('description'),
                    'call_to_action': {
                        'type': creative_data.get('cta', 'LEARN_MORE'),
                        'value': {
                            'link': creative_data.get('website_url')
                        }
                    }
                }
            }

        instagram_id = creative_data.get('instagramId') or creative_data.get('instagram_user_id') or creative_data.get('instagram_actor_id')
        if instagram_id:
            object_story_spec['instagram_user_id'] = instagram_id

        params = {
            AdCreative.Field.name: creative_data.get('creativeName') or creative_data.get('name'),
            'url_tags': creative_data.get('urlParameters') or creative_data.get('url_tags') or '',
            AdCreative.Field.object_story_spec: object_story_spec,
        }

        return account.create_ad_creative(params=params)

    def create_ad(self, ad_data, ad_account_id=None):
        """Create an ad."""
        account = self._get_account(ad_account_id)

        params = {
            Ad.Field.name: ad_data.get('name'),
            Ad.Field.adset_id: ad_data.get('adset_id'),
            Ad.Field.creative: {'creative_id': ad_data.get('creative_id')},
            Ad.Field.status: ad_data.get('status') or 'PAUSED',
        }

        return account.create_ad(params=params)

    def get_campaign_insights(self, campaign_id, date_preset='last_30d', since=None, until=None):
        """Fetch spend/impressions/clicks/conversions for a single campaign via
        the Graph API `insights` edge. The plain campaign list only returns
        metadata (name, status, budget) — this is what the cross-platform
        Overview page needs for the Meta side."""
        campaign = Campaign(campaign_id, api=self.api)

        fields = [
            'spend',
            'impressions',
            'clicks',
            'ctr',
            'cpc',
            'actions',
        ]
        params = {}
        if since and until:
            params['time_range'] = {'since': since, 'until': until}
        else:
            params['date_preset'] = date_preset

        insights = campaign.get_insights(fields=fields, params=params)
        if not insights:
            return {
                'campaign_id': campaign_id,
                'spend': 0.0,
                'impressions': 0,
                'clicks': 0,
                'ctr': 0.0,
                'cpc': 0.0,
                'conversions': 0,
            }

        row = insights[0]
        conversions = 0
        for action in row.get('actions', []) or []:
            if action.get('action_type') in ('offsite_conversion.fb_pixel_purchase', 'purchase', 'lead'):
                conversions += int(action.get('value', 0))

        return {
            'campaign_id': campaign_id,
            'spend': float(row.get('spend', 0) or 0),
            'impressions': int(row.get('impressions', 0) or 0),
            'clicks': int(row.get('clicks', 0) or 0),
            'ctr': float(row.get('ctr', 0) or 0),
            'cpc': float(row.get('cpc', 0) or 0),
            'conversions': conversions,
        }

    def search_locations(self, query, location_type='city', limit=10, ad_account_id=None):
        """Search for targeting locations."""
        account = self._get_account(ad_account_id)
        
        params = {
            'q': query,
            'type': 'adgeolocation',
            'location_types': location_type.split(','),
            'limit': limit,
        }
        
        return account.get_targeting_search(params=params)



class FacebookConnectionError(Exception):
    """The effective Meta connection is unavailable for provider operations."""

    def __init__(self, message, status_code=404):
        super().__init__(message)
        self.status_code = status_code


def resolve_facebook_service(db, user_id: str) -> FacebookService:
    """Use the same credential and expiry decision exposed by connection status."""
    from app.core.config import settings
    from app.services.meta_connection import resolve_meta_connection

    connection, access_token = resolve_meta_connection(db, user_id)
    if not connection["connected"]:
        if connection["error"]:
            raise FacebookConnectionError(
                connection["error"]["message"],
                status_code=409 if connection["state"] == "expired" else 503,
            )
        raise FacebookConnectionError(
            "No connected Meta Ads account. Connect and select one or configure a Facebook system token."
        )
    service = FacebookService(
        access_token=access_token,
        ad_account_id=connection["ad_account_id"],
        app_id=settings.FACEBOOK_APP_ID,
        app_secret=settings.FACEBOOK_APP_SECRET,
    )
    if not service.api:
        service.initialize()
    return service
