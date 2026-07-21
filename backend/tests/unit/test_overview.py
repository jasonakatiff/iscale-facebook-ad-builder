"""Overview (Sprint 2) cross-platform aggregation route unit tests."""
from fastapi import status


class TestOverviewAuthGate:
    def test_overview_requires_auth(self, client):
        response = client.get("/api/v1/overview")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestOverviewAggregation:
    def test_overview_ok_with_no_platforms_connected(self, client, auth_headers):
        """Neither Meta nor Google Ads has an active connection for this test
        user -- the route must still return 200 with an empty campaign list
        and per-platform errors, never a 500 just because nothing is
        connected yet."""
        response = client.get("/api/v1/overview", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["campaigns"] == []
        assert isinstance(body["errors"], dict)
        assert "google" in body["errors"]

    def test_overview_accepts_date_preset_and_ad_account_id(self, client, auth_headers):
        response = client.get(
            "/api/v1/overview",
            headers=auth_headers,
            params={"date_preset": "last_7d", "ad_account_id": "123456"},
        )
        assert response.status_code == status.HTTP_200_OK
