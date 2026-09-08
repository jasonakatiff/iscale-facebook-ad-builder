"""Paged account reports. Authentication grants never cross source owners."""

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal, localcontext
import json
import re
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
import httpx

from app.analytics import config
from app.core.config import settings
from app.core.token_encryption import decrypt_token
from app.delivery.budget import RequestBudget, RequestDeferred
from app.delivery.provider import decimal_value
from app.models import GoogleAdsConnection, TikTokAdsConnection


class ImportFailure(Exception):
    def __init__(self, message, retryable=False):
        super().__init__(message)
        self.retryable = retryable


def identity(value):
    value = str(value)
    if not re.fullmatch(r"[0-9]{1,40}", value):
        raise ImportFailure("Provider returned an invalid account or ad ID")
    return value


def account_row(value, *, manager_id=None):
    currency = str(value.get("currency") or "").upper()
    if not re.fullmatch("[A-Z]{3}", currency):
        raise ImportFailure("Account currency is unavailable")
    zone = str(value.get("timezone") or "")
    try:
        ZoneInfo(zone)
    except Exception:
        raise ImportFailure("Account timezone is unavailable") from None
    return dict(
        external_id=identity(value["id"]),
        name=str(value.get("name") or value["id"])[:300],
        currency=currency,
        timezone=zone,
        manager_id=manager_id,
    )


def normalize_row(row, account, since, until):
    from datetime import date

    if str(row["account_id"]) != account.external_id:
        raise ImportFailure("Report included an unexpected account")
    day = date.fromisoformat(row["report_date"])
    if not since <= day <= until:
        raise ImportFailure("Report included an unexpected date")
    if row["currency"] != account.currency or row["timezone"] != account.timezone:
        raise ImportFailure(
            "Report account settings changed; refresh account discovery"
        )
    result = {**row, "report_date": day.isoformat()}
    for field in ["impressions", "clicks", "spend", "conversions", "conversion_value"]:
        value = result.get(field)
        if value is None and field == "conversion_value":
            continue
        scale = (
            0 if field in {"impressions", "clicks"} else 6 if field == "spend" else 18
        )
        with localcontext() as context:
            context.prec = 50
            result[field] = str(decimal_value(value, scale))
    if (
        not result.get("external_key")
        or len(result["external_key"]) > 240
        or not result.get("dimensions", {}).get("group_id")
    ):
        raise ImportFailure("Report is missing its ad or ad-group identity")
    return result


class ReportProvider:
    def __init__(self, db, source, engine):
        self.db, self.source, self.engine = db, source, engine
        self.platform = source.platform
        model = (
            GoogleAdsConnection if self.platform == "google" else TikTokAdsConnection
        )
        key = (
            source.google_connection_id
            if self.platform == "google"
            else source.tiktok_connection_id
        )
        self.connection = db.get(model, key)
        if (
            not self.connection
            or not self.connection.is_active
            or self.connection.user_id != source.owner_id
        ):
            raise ImportFailure("Reconnect this source before importing")
        self.budget = RequestBudget(engine, platform=self.platform)

    def token(self):
        c = self.connection
        now = datetime.now(timezone.utc)
        needs = not c.encrypted_access_token or (
            c.access_token_expires_at is not None
            and c.access_token_expires_at < now + timedelta(minutes=5)
        )
        if self.platform == "google" and c.access_token_expires_at is None:
            needs = True
        if needs:
            from app.services.google_ads_service import (
                get_valid_access_token as google_token,
            )
            from app.services.tiktok_ads_service import (
                get_valid_access_token as tiktok_token,
            )

            ticket = self.budget.reserve(None, "import")
            try:
                return asyncio.run(
                    (google_token if self.platform == "google" else tiktok_token)(
                        self.db, c
                    )
                )
            finally:
                self.budget.finish(ticket)
        return decrypt_token(c.encrypted_access_token)

    def request(
        self, method, url, *, account_id=None, params=None, body=None, headers=None
    ):
        ticket = self.budget.reserve(account_id, "import")
        status = 0
        response_headers = {}
        try:
            with httpx.Client(timeout=60, follow_redirects=False) as client:
                with client.stream(
                    method, url, params=params, json=body, headers=headers
                ) as r:
                    status = r.status_code
                    response_headers = dict(r.headers)
                    raw = bytearray()
                    for chunk in r.iter_bytes():
                        raw.extend(chunk)
                        if len(raw) > config.MAX_RESPONSE_BYTES:
                            raise ImportFailure(
                                "Report page exceeds its response limit"
                            )
            if status == 429:
                raise RequestDeferred(
                    datetime.now(timezone.utc) + timedelta(seconds=300),
                    platform=self.platform,
                )
            if status >= 500:
                raise ImportFailure("Provider temporarily unavailable", True)
            if status in {401, 403}:
                raise ImportFailure(
                    "Provider access denied; verify account permission and credentials"
                )
            if status != 200:
                raise ImportFailure(
                    "Provider rejected the reporting request; check the connection and API version"
                )
            data = json.loads(raw, parse_float=Decimal)
            if self.platform == "tiktok":
                code = data.get("code")
                if code == 40100:
                    status = 429
                    raise RequestDeferred(
                        datetime.now(timezone.utc) + timedelta(seconds=300),
                        platform="tiktok",
                    )
                if code != 0:
                    raise ImportFailure(
                        "TikTok rejected the reporting request (code "
                        + str(code)
                        + ")",
                        code in {50000, 50001},
                    )
                return data["data"]
            return data
        except (httpx.TransportError, json.JSONDecodeError) as error:
            raise ImportFailure(
                "Provider response was interrupted or invalid", True
            ) from error
        finally:
            self.budget.finish(ticket, response_headers, status)

    def google(self, customer, query, cursor=None, manager=None):
        headers = {
            "Authorization": "Bearer " + self.token(),
            "developer-token": settings.GOOGLE_ADS_DEVELOPER_TOKEN,
        }
        if manager:
            headers["login-customer-id"] = identity(manager)
        body = {"query": query}
        if cursor:
            body["pageToken"] = cursor
        return self.request(
            "POST",
            f"https://googleads.googleapis.com/{config.GOOGLE_VERSION}/customers/{identity(customer)}/googleAds:search",
            account_id=customer,
            body=body,
            headers=headers,
        )

    def tiktok(self, path, params, account_id=None):
        base = settings.TIKTOK_ADS_API_BASE_URL.rstrip("/")
        if (
            urlsplit(base).scheme != "https"
            or urlsplit(base).hostname != "business-api.tiktok.com"
        ):
            raise ImportFailure("TikTok API origin is invalid")
        return self.request(
            "GET",
            base + "/" + path,
            account_id=account_id,
            params={
                k: json.dumps(v) if isinstance(v, (list, dict)) else v
                for k, v in params.items()
            },
            headers={"Access-Token": self.token()},
        )

    def discover(self, cursor=None):
        c = self.connection
        if self.platform == "google":
            root = identity(c.customer_id)
            if cursor is None:
                data = self.google(
                    root,
                    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer",
                )
                rows = data.get("results", [])
                if len(rows) != 1:
                    raise ImportFailure("Google account details are unavailable")
                value = rows[0]["customer"]
                if identity(value["id"]) != root:
                    raise ImportFailure("Google account identity mismatch")
                if value.get("manager"):
                    return [], {"phase": "children", "token": None}
                return [
                    account_row(
                        {
                            "id": root,
                            "name": value.get("descriptiveName"),
                            "currency": value["currencyCode"],
                            "timezone": value["timeZone"],
                        }
                    )
                ], None
            data = self.google(
                root,
                "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.status = ENABLED",
                cursor.get("token"),
                root,
            )
            rows = [
                account_row(
                    {
                        "id": r["customerClient"]["id"],
                        "name": r["customerClient"].get("descriptiveName"),
                        "currency": r["customerClient"]["currencyCode"],
                        "timezone": r["customerClient"]["timeZone"],
                    },
                    manager_id=root,
                )
                for r in data.get("results", [])
            ]
            token = data.get("nextPageToken")
            return rows, ({"phase": "children", "token": token} if token else None)
        if cursor is None:
            data = self.tiktok(
                "oauth2/advertiser/get/",
                {
                    "app_id": settings.TIKTOK_ADS_APP_ID,
                    "secret": settings.TIKTOK_ADS_APP_SECRET,
                },
            )
            ids = sorted(
                {identity(row["advertiser_id"]) for row in data.get("list", [])}
            )
            if not ids:
                raise ImportFailure("No authorized TikTok advertisers were returned")
            if len(ids) > config.MAX_ACCOUNTS:
                raise ImportFailure("TikTok grant exceeds the supported account limit")
            return [], {"ids": ids, "offset": 0}
        ids = cursor["ids"]
        offset = cursor["offset"]
        batch = ids[offset : offset + 100]
        data = self.tiktok(
            "advertiser/info/",
            {
                "advertiser_ids": batch,
                "fields": ["advertiser_id", "name", "currency", "timezone"],
            },
        )
        rows = [
            account_row(
                {
                    "id": r["advertiser_id"],
                    "name": r.get("name"),
                    "currency": r["currency"],
                    "timezone": r["timezone"],
                }
            )
            for r in data.get("list", [])
        ]
        if {r["external_id"] for r in rows} != set(batch):
            raise ImportFailure("TikTok advertiser discovery was incomplete")
        return rows, (
            {"ids": ids, "offset": offset + 100} if offset + 100 < len(ids) else None
        )

    def page(self, account, since, until, cursor):
        if self.platform == "google":
            query = f"""SELECT customer.id, customer.currency_code, customer.time_zone,
                campaign.id, campaign.name, campaign.advertising_channel_type,
                ad_group.id, ad_group_ad.resource_name, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
                segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
                metrics.conversions, metrics.conversions_value
                FROM ad_group_ad WHERE segments.date BETWEEN '{since.isoformat()}' AND '{until.isoformat()}'"""
            data = self.google(account.external_id, query, cursor, account.manager_id)
            rows = []
            for value in data.get("results", []):
                metrics = value["metrics"]
                ad = value["adGroupAd"]
                customer = value["customer"]
                rows.append(
                    dict(
                        account_id=identity(customer["id"]),
                        external_key=ad["resourceName"],
                        external_id=identity(ad["ad"]["id"]),
                        name=str(ad["ad"].get("name") or "Ad " + str(ad["ad"]["id"]))[
                            :500
                        ],
                        report_date=value["segments"]["date"],
                        currency=customer["currencyCode"],
                        timezone=customer["timeZone"],
                        dataset="google:primary_conversions:interaction_date:v1",
                        dimensions={
                            "campaign_id": str(value["campaign"]["id"]),
                            "campaign_name": value["campaign"].get("name"),
                            "group_id": str(value["adGroup"]["id"]),
                            "objective": value["campaign"]["advertisingChannelType"],
                            "format": ad["ad"]["type"],
                        },
                        impressions=str(metrics.get("impressions", 0)),
                        clicks=str(metrics.get("clicks", 0)),
                        spend=str(
                            Decimal(str(metrics.get("costMicros", 0)))
                            / Decimal(1000000)
                        ),
                        conversions=str(metrics.get("conversions", 0)),
                        conversion_value=(
                            str(metrics["conversionsValue"])
                            if "conversionsValue" in metrics
                            else None
                        ),
                    )
                )
            return rows, data.get("nextPageToken")
        data = self.tiktok(
            "report/integrated/get/",
            {
                "advertiser_id": account.external_id,
                "report_type": "BASIC",
                "data_level": "AUCTION_AD",
                "dimensions": ["ad_id", "stat_time_day"],
                "metrics": [
                    "ad_name",
                    "campaign_id",
                    "campaign_name",
                    "adgroup_id",
                    "spend",
                    "impressions",
                    "clicks",
                    "conversion",
                    "currency",
                ],
                "start_date": since.isoformat(),
                "end_date": until.isoformat(),
                "page": int(cursor or 1),
                "page_size": 1000,
            },
            account.external_id,
        )
        info = data.get("page_info") or {}
        if not isinstance(info.get("total_page"), int) or not isinstance(
            info.get("page"), int
        ):
            raise ImportFailure("TikTok report pagination is missing")
        if info["page"] != int(cursor or 1):
            raise ImportFailure("TikTok report pagination did not advance")
        if info.get("total_number", 0) > config.MAX_REPORT_ROWS:
            raise ImportFailure(
                "TikTok report exceeds the supported row limit; shorten the correction window"
            )
        rows = []
        for value in data.get("list", []):
            m = value["metrics"]
            d = value["dimensions"]
            ad = identity(d["ad_id"])
            rows.append(
                dict(
                    account_id=account.external_id,
                    external_key=ad,
                    external_id=ad,
                    name=str(m.get("ad_name") or "Ad " + ad)[:500],
                    report_date=str(d["stat_time_day"])[:10],
                    currency=m.get("currency", account.currency),
                    timezone=account.timezone,
                    dataset="tiktok:optimization_conversion:provider_attribution:v1",
                    dimensions={
                        "campaign_id": str(m["campaign_id"]),
                        "campaign_name": m.get("campaign_name"),
                        "group_id": str(m["adgroup_id"]),
                        "objective": "optimization_conversion",
                    },
                    impressions=str(m.get("impressions", 0)),
                    clicks=str(m.get("clicks", 0)),
                    spend=str(m.get("spend", 0)),
                    conversions=str(m.get("conversion", 0)),
                    conversion_value=None,
                )
            )
        return rows, (
            str(info["page"] + 1) if info["page"] < info["total_page"] else None
        )
