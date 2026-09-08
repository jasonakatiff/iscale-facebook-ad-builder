from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock
import json
import httpx
import pytest
from app.analytics.providers import ReportProvider, ImportFailure, normalize_row
from app.analytics.models import AnalyticsSettings
from app.analytics.schemas import SourceConfig
from app.delivery.budget import RequestBudget, RequestDeferred
from app.delivery.models import ApiRequest, ApiCooldown
from .test_imports import report_row


def provider(platform):
    result = ReportProvider.__new__(ReportProvider)
    result.platform = platform
    result.connection = SimpleNamespace(customer_id="123")
    result.token = lambda: "test-token"
    result.budget = Mock()
    return result


def account():
    return SimpleNamespace(
        external_id="123", currency="USD", timezone="UTC", manager_id="456"
    )


def test_google_manager_discovery_queries_children_and_pages():
    p = provider("google")
    p.google = Mock(
        side_effect=[
            {"results": [{"customer": {"id": "123", "manager": True}}]},
            {
                "results": [
                    {
                        "customerClient": {
                            "id": "789",
                            "currencyCode": "USD",
                            "timeZone": "UTC",
                            "descriptiveName": "test-child",
                        }
                    }
                ],
                "nextPageToken": "test-next",
            },
        ]
    )
    rows, cursor = p.discover()
    assert rows == []
    rows, cursor = p.discover(cursor)
    assert rows[0]["manager_id"] == "123" and rows[0]["external_id"] == "789"
    assert cursor["token"] == "test-next"
    assert "customer_client.manager = FALSE" in p.google.call_args.args[1]


def test_google_report_exact_micros_and_identity():
    p = provider("google")
    p.google = Mock(
        return_value={
            "results": [
                {
                    "customer": {"id": "123", "currencyCode": "USD", "timeZone": "UTC"},
                    "campaign": {"id": "3", "advertisingChannelType": "SEARCH"},
                    "adGroup": {"id": "4"},
                    "adGroupAd": {
                        "resourceName": "customers/123/adGroupAds/4~5",
                        "ad": {"id": "5", "type": "RESPONSIVE_SEARCH_AD"},
                    },
                    "segments": {"date": "2026-09-01"},
                    "metrics": {
                        "impressions": "1000",
                        "clicks": "25",
                        "costMicros": "290001",
                        "conversions": Decimal("1.5"),
                        "conversionsValue": Decimal("2.39"),
                    },
                }
            ]
        }
    )
    rows, cursor = p.page(account(), date(2026, 9, 1), date(2026, 9, 1), None)
    assert rows[0]["spend"] == "0.290001" and rows[0]["conversion_value"] == "2.39"
    assert "FROM ad_group_ad" in p.google.call_args.args[1]
    assert p.google.call_args.args[0] == "123" and p.google.call_args.args[3] == "456"


def test_tiktok_bulk_report_uses_get_and_no_invented_revenue():
    p = provider("tiktok")
    p.request = Mock(
        return_value={
            "list": [
                {
                    "dimensions": {
                        "ad_id": "987",
                        "stat_time_day": "2026-09-01 00:00:00",
                    },
                    "metrics": {
                        "campaign_id": "456",
                        "adgroup_id": "789",
                        "spend": "0.29",
                        "conversion": "0",
                        "impressions": "50",
                        "clicks": "1",
                        "currency": "USD",
                    },
                }
            ],
            "page_info": {"page": 1, "total_page": 2},
        }
    )
    rows, cursor = p.page(account(), date(2026, 9, 1), date(2026, 9, 1), None)
    assert p.request.call_args.args[0] == "GET"
    assert p.request.call_args.kwargs["params"]["data_level"] == "AUCTION_AD"
    assert json.loads(p.request.call_args.kwargs["params"]["dimensions"]) == [
        "ad_id",
        "stat_time_day",
    ]
    assert rows[0]["conversion_value"] is None and cursor == "2"


@pytest.mark.parametrize(
    "field,value",
    [
        ("spend", "NaN"),
        ("spend", "-0.01"),
        ("spend", "0.0000001"),
        ("account_id", "456"),
        ("report_date", "2025-01-01"),
        ("currency", "EUR"),
        ("impressions", "1.5"),
    ],
)
def test_invalid_report_never_normalizes(field, value):
    row = report_row()
    row[field] = value
    with pytest.raises((ValueError, ImportFailure)):
        normalize_row(row, account(), date.today() - timedelta(days=2), date.today())


@pytest.mark.parametrize(
    "status,body,error",
    [
        (429, {}, RequestDeferred),
        (503, {}, ImportFailure),
        (200, {"code": 40100}, RequestDeferred),
        (200, {"code": 40102}, ImportFailure),
    ],
)
def test_transport_defers_throttles_and_stops_auth_errors(
    monkeypatch, status, body, error
):
    p = provider("tiktok")
    original = httpx.Client
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json=body))
    monkeypatch.setattr(
        httpx, "Client", lambda **kwargs: original(transport=transport, **kwargs)
    )
    with pytest.raises(error):
        p.request("GET", "https://business-api.tiktok.com/test")
    p.budget.finish.assert_called_once()
    if body.get("code") == 40102:
        assert p.budget.finish.call_args.args[-1] != 429


def test_shared_provider_budget_isolated_and_cooldowns_persist(
    analytics_db, analytics_engine
):
    analytics_db.add(
        AnalyticsSettings(
            key="google", values=SourceConfig(api_requests_per_minute=1).model_dump()
        )
    )
    analytics_db.commit()
    google = RequestBudget(analytics_engine, platform="google")
    ticket = google.reserve("123", "import")
    google.finish(ticket, {"Retry-After": "600"}, 429)
    with pytest.raises(RequestDeferred):
        RequestBudget(analytics_engine, platform="google").reserve("123", "import")
    other = RequestBudget(analytics_engine, platform="tiktok")
    other.finish(other.reserve("123", "import"))
    assert analytics_db.query(ApiRequest).count() == 2
    assert analytics_db.get(ApiCooldown, "google:global")
    assert not analytics_db.get(ApiCooldown, "tiktok:global")
