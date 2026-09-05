"""Railway headers and TikTok reporting date regressions."""
import asyncio
from datetime import date
from unittest.mock import AsyncMock

import pytest

from app.api.v1 import overview, tiktok_ads
from app.models import TikTokAdsConnection


@pytest.mark.parametrize("path", ["/api/v1/docs", "/api/v1/redoc", "/api/v1/openapi.json"])
def test_api_documentation_has_no_csp(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert "content-security-policy" not in response.headers
    assert response.headers["x-content-type-options"] == "nosniff"


def test_regular_api_keeps_csp(client):
    assert "content-security-policy" in client.get("/health").headers


def test_railway_proxy_headers_are_trusted(client):
    response = client.get("/health", headers={"X-Forwarded-Proto": "https"})
    assert "strict-transport-security" in response.headers


@pytest.mark.parametrize("preset,since,until", [
    ("today", "2026-03-01", "2026-03-01"),
    ("yesterday", "2026-02-28", "2026-02-28"),
    ("last_7d", "2026-02-23", "2026-03-01"),
    ("last_14d", "2026-02-16", "2026-03-01"),
    ("last_30d", "2026-01-31", "2026-03-01"),
    ("last_90d", "2025-12-02", "2026-03-01"),
    ("this_month", "2026-03-01", "2026-03-01"),
    ("last_month", "2026-02-01", "2026-02-28"),
])
def test_overview_tiktok_date_presets(db_session, test_user, monkeypatch, preset, since, until):
    class FixedDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 3, 1)
    monkeypatch.setattr(tiktok_ads, "date", FixedDate)
    db_session.add(TikTokAdsConnection(user_id=test_user.id, advertiser_id="test-111", encrypted_refresh_token="test-refresh", is_active=True))
    db_session.commit()
    report = AsyncMock(return_value=[])
    monkeypatch.setattr(overview, "get_valid_tiktok_access_token", AsyncMock(return_value="test-access"))
    monkeypatch.setattr(overview, "get_tiktok_campaign_performance", report)
    asyncio.run(overview._fetch_tiktok_rows(db_session, test_user.id, preset))
    report.assert_awaited_once_with("test-access", "test-111", since, until)


def test_last_month_handles_leap_year_and_year_boundary(monkeypatch):
    for today, expected in [(date(2024, 3, 1), ("2024-02-01", "2024-02-29")), (date(2026, 1, 1), ("2025-12-01", "2025-12-31"))]:
        class FixedDate(date):
            @classmethod
            def today(cls):
                return today
        monkeypatch.setattr(tiktok_ads, "date", FixedDate)
        assert tiktok_ads._date_range("last_month") == expected
