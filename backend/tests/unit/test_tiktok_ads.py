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


class TestTikTokMultiAdvertiser:
    """Sprint 7 parity: /connections, /connection/select, multi-advertiser callback."""

    def test_connections_requires_auth(self, client):
        assert client.get("/api/v1/tiktok-ads/connections").status_code == status.HTTP_401_UNAUTHORIZED

    def test_select_requires_auth(self, client):
        response = client.post("/api/v1/tiktok-ads/connection/select", json={"advertiser_id": "123"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_select_activates_only_owned_candidate(self, client, auth_headers, db_session, test_user):
        from app.models import TikTokAdsConnection

        first = TikTokAdsConnection(
            user_id=test_user.id, advertiser_id="111", account_name="First",
            encrypted_refresh_token="refresh-one", is_active=True,
        )
        second = TikTokAdsConnection(
            user_id=test_user.id, advertiser_id="222", account_name="Second",
            encrypted_refresh_token="refresh-two", is_active=False,
        )
        db_session.add_all([first, second])
        db_session.commit()

        response = client.post(
            "/api/v1/tiktok-ads/connection/select",
            headers=auth_headers,
            json={"advertiser_id": "222"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["advertiser_id"] == "222"
        db_session.refresh(first)
        db_session.refresh(second)
        assert first.is_active is False
        assert second.is_active is True

    def test_select_unknown_advertiser_is_404(self, client, auth_headers):
        response = client.post(
            "/api/v1/tiktok-ads/connection/select",
            headers=auth_headers,
            json={"advertiser_id": "999"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_connections_lists_all_owned(self, client, auth_headers, db_session, test_user):
        from app.models import TikTokAdsConnection

        db_session.add_all([
            TikTokAdsConnection(user_id=test_user.id, advertiser_id="111", encrypted_refresh_token="r1", is_active=True),
            TikTokAdsConnection(user_id=test_user.id, advertiser_id="222", encrypted_refresh_token="r2", is_active=False),
        ])
        db_session.commit()

        response = client.get("/api/v1/tiktok-ads/connections", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        entries = response.json()["connections"]
        assert [entry["advertiser_id"] for entry in entries] == ["111", "222"]
        assert entries[0]["selected"] is True
        assert entries[1]["selected"] is False

    def test_disconnect_deactivates_all_owned(self, client, auth_headers, db_session, test_user):
        from app.models import TikTokAdsConnection

        first = TikTokAdsConnection(user_id=test_user.id, advertiser_id="111", encrypted_refresh_token="r1", is_active=True)
        second = TikTokAdsConnection(user_id=test_user.id, advertiser_id="222", encrypted_refresh_token="r2", is_active=False)
        db_session.add_all([first, second])
        db_session.commit()

        response = client.delete("/api/v1/tiktok-ads/connection", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        db_session.refresh(first)
        db_session.refresh(second)
        assert first.is_active is False
        assert second.is_active is False
