"""
Clickflare Tracking Service
REST API integration with Clickflare (developers.clickflare.io)
"""
import httpx
from typing import Optional
from urllib.parse import urlencode

BASE_URL = "https://public-api.clickflare.io/api"
TIMEOUT = 30.0


class ClickflareService:
    def __init__(self, api_key: str, tracking_domain: str):
        self.api_key = api_key
        self.tracking_domain = tracking_domain
        self.headers = {
            "Api-Key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _handle_response(self, resp: httpx.Response) -> dict:
        """Handle response with clear error messages."""
        if resp.status_code == 403:
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            msg = body.get("message", "")
            if "PublicApi" in str(body):
                raise httpx.HTTPStatusError(
                    "Public API access is not enabled on your Clickflare account. "
                    "Go to Clickflare Settings > Security > API Access and ensure Public API is enabled.",
                    request=resp.request,
                    response=resp,
                )
            raise httpx.HTTPStatusError(msg or "Forbidden", request=resp.request, response=resp)
        resp.raise_for_status()
        return resp.json()

    async def test_connection(self) -> dict:
        """Test API connectivity."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{BASE_URL}/campaigns/list",
                headers=self.headers,
                params={"limit": 1},
            )
            data = self._handle_response(resp)
            return {"status": "connected", "data": data}

    async def get_traffic_sources(self) -> list:
        """List all traffic sources."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{BASE_URL}/traffic-sources", headers=self.headers)
            return self._handle_response(resp)

    async def find_or_create_facebook_traffic_source(self) -> str:
        """Find existing Facebook traffic source or create one. Returns ID."""
        sources = await self.get_traffic_sources()
        data = sources.get("data", sources) if isinstance(sources, dict) else sources
        if isinstance(data, list):
            for source in data:
                name = source.get("name", "").lower()
                if "facebook" in name or "meta" in name:
                    return source["id"]

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/traffic-sources",
                headers=self.headers,
                json={
                    "name": "Facebook Ads",
                    "postbackUrl": "",
                    "trackingFields": {
                        "trackingField1": {"name": "campaign_id", "parameter": "campaign_id"},
                        "trackingField2": {"name": "adset_id", "parameter": "adset_id"},
                        "trackingField3": {"name": "ad_id", "parameter": "ad_id"},
                        "trackingField4": {"name": "placement", "parameter": "placement"},
                        "trackingField5": {"name": "site_source_name", "parameter": "site_source_name"},
                    },
                },
            )
            result = self._handle_response(resp)
            return result.get("id", result.get("data", {}).get("id"))

    async def create_offer(self, name: str, url: str) -> str:
        """Create a Clickflare offer. Returns offer ID."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/offers",
                headers=self.headers,
                json={"name": name, "url": url},
            )
            result = self._handle_response(resp)
            return result.get("id", result.get("data", {}).get("id"))

    async def create_campaign(self, name: str, offer_id: str, traffic_source_id: str) -> str:
        """Create a Clickflare campaign. Returns campaign ID."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/campaigns",
                headers=self.headers,
                json={
                    "name": name,
                    "trafficSourceId": traffic_source_id,
                    "costModel": "auto",
                    "flow": {
                        "type": "url",
                        "url": "",
                        "offers": [{"id": offer_id, "weight": 100}],
                    },
                },
            )
            result = self._handle_response(resp)
            return result.get("id", result.get("data", {}).get("id"))

    def build_tracking_url(self, cf_campaign_id: str) -> str:
        """Build redirect tracking URL with Facebook dynamic macros."""
        fb_params = {
            "trackingField1": "{{campaign.id}}",
            "trackingField2": "{{adset.id}}",
            "trackingField3": "{{ad.id}}",
            "trackingField4": "{{placement}}",
            "trackingField5": "{{site_source_name}}",
        }
        query = urlencode(fb_params, safe="{}")
        return f"https://{self.tracking_domain}/cf/r/{cf_campaign_id}?{query}"

    async def generate_tracking_url(
        self,
        ad_name: str,
        destination_url: str,
        traffic_source_id: str,
    ) -> dict:
        """Full workflow: create offer + campaign + return tracking URL."""
        offer_id = await self.create_offer(
            name=f"Offer - {ad_name}",
            url=destination_url,
        )
        campaign_id = await self.create_campaign(
            name=f"CF - {ad_name}",
            offer_id=offer_id,
            traffic_source_id=traffic_source_id,
        )
        tracking_url = self.build_tracking_url(campaign_id)
        return {
            "offer_id": offer_id,
            "campaign_id": campaign_id,
            "tracking_url": tracking_url,
            "original_url": destination_url,
        }

    async def get_campaign_report(
        self,
        date_from: str,
        date_to: str,
        group_by: str = "campaign",
        cf_campaign_id: Optional[str] = None,
    ) -> dict:
        """Fetch performance report via POST."""
        body = {
            "dateFrom": date_from,
            "dateTo": date_to,
            "groupBy": group_by,
        }
        if cf_campaign_id:
            body["campaignId"] = cf_campaign_id

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/report",
                headers=self.headers,
                json=body,
            )
            return self._handle_response(resp)

    async def get_campaigns_list(self) -> list:
        """Fetch all Clickflare campaigns."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{BASE_URL}/campaigns/list",
                headers=self.headers,
            )
            return self._handle_response(resp)
