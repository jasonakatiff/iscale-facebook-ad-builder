import json
import os
import re
from decimal import Decimal, InvalidOperation

import requests

from app.delivery import config
from app.services.facebook_service import FacebookService


class ProviderError(Exception):
    def __init__(
        self, message="Facebook request failed", retryable=False, retry_after=0
    ):
        super().__init__(message)
        self.retryable = retryable
        self.retry_after = retry_after


def decimal_value(value, scale=6):
    try:
        result = Decimal(str(value))
        if (
            not result.is_finite()
            or result < 0
            or result >= Decimal("1e18")
            or result != result.quantize(Decimal(10) ** -scale)
        ):
            raise ValueError("Invalid reporting number")
        return result
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid reporting number") from None


class DeliveryProvider(FacebookService):
    @classmethod
    def for_user(cls, db, owner_id):
        from app.models import User
        from app.services.meta_connection import resolve_meta_connection

        owner = db.get(User, owner_id) if owner_id else None
        if (
            not owner
            or not owner.is_active
            or not owner.has_permission("campaigns:write")
        ):
            raise ProviderError("Buyer access is no longer available")
        connection, token = resolve_meta_connection(db, owner_id)
        if not token or not connection["connected"]:
            raise ProviderError("Reconnect the buyer’s Meta account before retrying")
        return cls(token, connection.get("ad_account_id"))

    def __init__(self, access_token=None, ad_account_id=None):
        from facebook_business.api import FacebookAdsApi
        from facebook_business.session import FacebookSession

        self.access_token = access_token
        self.ad_account_id = ad_account_id
        self.account = None
        self.api = FacebookAdsApi(
            FacebookSession(
                app_id=os.getenv("FACEBOOK_APP_ID")
                or os.getenv("VITE_FACEBOOK_APP_ID"),
                app_secret=os.getenv("FACEBOOK_APP_SECRET")
                or os.getenv("VITE_FACEBOOK_APP_SECRET"),
                access_token=self.access_token,
                timeout=120,
            ),
            api_version=config.GRAPH_VERSION,
        )

    def upload_image(self, url, ad_account_id=None):
        from facebook_business.adobjects.adimage import AdImage
        from app.delivery.media import download_media

        with download_media(url) as path:
            image = AdImage(parent_id=ad_account_id, api=self.api)
            image[AdImage.Field.filename] = path
            image.remote_create()
            return image[AdImage.Field.hash]

    def upload_video(self, url, ad_account_id=None, wait_for_ready=False):
        from facebook_business.adobjects.advideo import AdVideo
        from app.delivery.media import download_media

        with download_media(url, video=True) as path:
            video = AdVideo(parent_id=ad_account_id, api=self.api)
            video[AdVideo.Field.filepath] = path
            video.remote_create()
            return {"video_id": str(video["id"]), "status": "processing"}

    def video_thumbnails(self, video_id):
        data = self.read(video_id + "/thumbnails", {"fields": "uri", "limit": 1})
        return [item["uri"] for item in data.get("data", []) if item.get("uri")]

    def reconciliation_candidates(self, job):
        import time

        deadline = time.monotonic() + 120
        params = {"fields": "id,name,account_id,adset_id,creative{id}", "limit": 100}
        seen, matches = set(), []
        for _ in range(20):
            if time.monotonic() >= deadline:
                raise ProviderError("Ad lookup exceeded its time limit")
            data = self.read(job.payload["adset_id"] + "/ads", params)
            for ad in data.get("data", []):
                if matches_job(job, ad):
                    matches.append({"id": str(ad["id"]), "name": ad["name"]})
            if not data.get("paging", {}).get("next"):
                return matches
            cursor = data.get("paging", {}).get("cursors", {}).get("after")
            if not cursor or cursor in seen:
                raise ProviderError("Ad lookup pagination did not advance")
            seen.add(cursor)
            params["after"] = cursor
        raise ProviderError("Ad lookup exceeded its page limit")

    def read(self, path, params=None):
        if not isinstance(path, str) or (
            path and not re.fullmatch(r"(?:act_)?[0-9]+(?:/(?:ads|insights|thumbnails))?", path)
        ):
            raise ProviderError("Invalid Facebook resource path")
        if not self.access_token:
            raise ProviderError(
                "Facebook access token is missing; an administrator must configure it"
            )
        try:
            response = requests.get(
                f"https://graph.facebook.com/{config.GRAPH_VERSION}/{path}",
                headers={"Authorization": "Bearer " + self.access_token},
                params=params,
                timeout=(5, 30),
                allow_redirects=False,
            )
        except (requests.Timeout, requests.ConnectionError):
            raise ProviderError("Facebook connection failed", retryable=True) from None
        if 300 <= response.status_code < 400:
            raise ProviderError("Facebook returned an unexpected redirect")
        try:
            data = response.json()
        except ValueError:
            raise ProviderError(
                "Facebook returned an invalid response",
                retryable=response.status_code >= 500,
            ) from None
        if not response.ok or "error" in data:
            error = data.get("error", {})
            code = error.get("code")
            permanent = code in {10, 100, 190, 200, 294} or response.status_code in {
                401,
                403,
            }
            retryable = not permanent and (
                response.status_code == 429
                or response.status_code >= 500
                or error.get("is_transient") is True
                or code in {1, 2, 4, 17, 32, 613, 80004}
            )
            try:
                retry_after = max(
                    0, min(int(response.headers.get("Retry-After", "0")), 86400)
                )
            except ValueError:
                retry_after = 0
            raise ProviderError(
                (
                    "Facebook denied the request"
                    if permanent
                    else "Facebook request failed"
                ),
                retryable,
                retry_after,
            )
        return data

    def account_info(self, account_id):
        return self.read(account_id, {"fields": "id,currency,timezone_name"})

    def ad_status(self, ad_id):
        return self.read(
            ad_id,
            {
                "fields": "id,name,account_id,adset_id,campaign_id,effective_status,creative{id}"
            },
        )

    def ad_statuses(self, ad_ids):
        return self.read(
            "", {"ids": ",".join(ad_ids), "fields": "id,account_id,effective_status"}
        )

    def video_status(self, video_id):
        return self.read(video_id, {"fields": "id,status"})

    def insight_pages(self, account_id, ad_ids, since, until):
        params = {
            "fields": "ad_id,date_start,date_stop,impressions,clicks,spend,actions",
            "level": "ad",
            "time_increment": 1,
            "limit": 500,
            "time_range": json.dumps(
                {"since": since.isoformat(), "until": until.isoformat()}
            ),
            "filtering": json.dumps(
                [{"field": "ad.id", "operator": "IN", "value": ad_ids}]
            ),
            "action_attribution_windows": json.dumps(["7d_click", "1d_view"]),
            "action_report_time": "conversion",
        }
        seen = set()
        for _ in range(config.MAX_REPORT_PAGES):
            data = self.read(account_id + "/insights", params)
            if not isinstance(data.get("data"), list):
                raise ProviderError("Facebook report page is malformed")
            yield data["data"]
            if not data.get("paging", {}).get("next"):
                return
            cursor = data.get("paging", {}).get("cursors", {}).get("after")
            if not cursor or cursor in seen:
                raise ProviderError("Facebook report pagination did not advance")
            seen.add(cursor)
            params["after"] = cursor
        raise ProviderError(
            "Facebook report exceeded the page limit; narrow the import scope"
        )


def matches_job(job, remote):
    creative = job.results.get("creative_id") or job.payload.get("creative_id")
    return (
        str(remote.get("account_id")).removeprefix("act_")
        == job.account_id.removeprefix("act_")
        and str(remote.get("adset_id")) == job.payload["adset_id"]
        and str(remote.get("creative", {}).get("id")) == creative
        and remote.get("name") == job.name + " [bw:" + job.id + "]"
    )
