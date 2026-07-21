"""TikTok Ads route safety and configuration tests."""
from fastapi import status


class TestTikTokAdsAuthGate:
    def test_connection_requires_auth(self, client):
        assert client.get("/api/v1/tiktok-ads/connection").status_code == status.HTTP_401_UNAUTHORIZED

    def test_campaigns_requires_auth(self, client):
        assert client.get("/api/v1/tiktok-ads/campaigns").status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_campaign_requires_auth(self, client):
        response = client.post("/api/v1/tiktok-ads/campaigns", json={"name": "x", "daily_budget": 10, "confirm": True})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestTikTokAdsConfirmationGuard:
    def test_create_without_confirm_is_rejected_before_connection_lookup(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr("app.api.v1.tiktok_ads.settings.TIKTOK_ADS_APP_ID", "test-app")
        monkeypatch.setattr("app.api.v1.tiktok_ads.settings.TIKTOK_ADS_APP_SECRET", "test-secret")
        response = client.post("/api/v1/tiktok-ads/campaigns", headers=auth_headers, json={"name": "Draft", "daily_budget": 10})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "confirm" in response.json()["detail"].lower()

    def test_unconfigured_campaigns_return_clear_503(self, client, auth_headers):
        response = client.get("/api/v1/tiktok-ads/campaigns", headers=auth_headers)
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "not configured" in response.json()["detail"].lower()


class TestTikTokOAuthCallback:
    def test_callback_requires_state_and_code(self, client):
        assert client.get("/api/v1/tiktok-ads/oauth/callback").status_code == status.HTTP_400_BAD_REQUEST
