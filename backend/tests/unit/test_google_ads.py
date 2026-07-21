"""Google Ads OAuth + campaign routes unit tests."""
import pytest
from fastapi import status


class TestGoogleAdsAuthGate:
    """Every route (except the public OAuth callback) must require a valid JWT."""

    def test_connection_requires_auth(self, client):
        response = client.get("/api/v1/google-ads/connection")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_campaigns_requires_auth(self, client):
        response = client.get("/api/v1/google-ads/campaigns")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_campaign_ads_requires_auth(self, client):
        response = client.get("/api/v1/google-ads/campaigns/123/ads")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_oauth_start_requires_auth(self, client):
        response = client.get("/api/v1/google-ads/oauth/start", follow_redirects=False)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_disconnect_requires_auth(self, client):
        response = client.delete("/api/v1/google-ads/connection")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestGoogleAdsConnectionStatus:
    def test_no_connection_reports_disconnected(self, client, auth_headers):
        response = client.get("/api/v1/google-ads/connection", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"connected": False}

    def test_campaigns_without_connection_is_404_or_500(self, client, auth_headers):
        """404 (no connection) once Google Ads is configured server-side; in
        this test environment (no GOOGLE_ADS_* env vars set) the more
        fundamental "not configured" check fires first and returns 500 —
        both are acceptable here, the route must never crash uncaught."""
        response = client.get("/api/v1/google-ads/campaigns", headers=auth_headers)
        assert response.status_code in [status.HTTP_404_NOT_FOUND, status.HTTP_500_INTERNAL_SERVER_ERROR]

    def test_disconnect_without_connection_is_ok(self, client, auth_headers):
        response = client.delete("/api/v1/google-ads/connection", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK


class TestGoogleAdsOAuthCallback:
    """The callback route is intentionally public (no JWT) — identity comes
    from the signed oauth_state cookie instead. Verify it still rejects
    forged/missing state rather than trusting the request blindly."""

    def test_callback_missing_code_is_400(self, client):
        response = client.get("/api/v1/google-ads/oauth/callback")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_callback_with_error_param_is_400(self, client):
        response = client.get("/api/v1/google-ads/oauth/callback?error=access_denied")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_callback_missing_state_cookie_is_400(self, client):
        response = client.get("/api/v1/google-ads/oauth/callback?code=fake-code")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_callback_forged_state_cookie_is_400(self, client):
        client.cookies.set("oauth_state", "not-a-real-signed-token")
        response = client.get("/api/v1/google-ads/oauth/callback?code=fake-code")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestGoogleAdsNotConfigured:
    """With no GOOGLE_ADS_CLIENT_ID/SECRET/DEVELOPER_TOKEN set (the default in
    this test environment), connect-flow routes must fail clearly, not crash."""

    def test_oauth_start_without_config_is_500(self, client, auth_headers):
        response = client.get("/api/v1/google-ads/oauth/start", headers=auth_headers, follow_redirects=False)
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
