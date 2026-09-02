"""Google Ads OAuth + campaign routes unit tests."""
import pytest
from fastapi import status
from types import SimpleNamespace

from app.api.v1.google_ads import _google_ads_error_status


def _google_error(message):
    return SimpleNamespace(failure=SimpleNamespace(errors=[SimpleNamespace(message=message)]))


class TestGoogleAdsErrorStatus:
    def test_developer_token_test_access_is_forbidden(self):
        error = _google_error("The developer token is only approved for use with test accounts.")
        assert _google_ads_error_status(error) == status.HTTP_403_FORBIDDEN

    def test_deactivated_customer_is_forbidden(self):
        error = _google_error("The customer account can't be accessed because it is deactivated.")
        assert _google_ads_error_status(error) == status.HTTP_403_FORBIDDEN

    def test_unclassified_provider_failure_is_bad_gateway(self):
        error = _google_error("Temporary Google Ads API failure.")
        assert _google_ads_error_status(error) == status.HTTP_502_BAD_GATEWAY


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

    def test_connections_requires_auth(self, client):
        response = client.get("/api/v1/google-ads/connections")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_select_connection_requires_auth(self, client):
        response = client.post("/api/v1/google-ads/connection/select", json={"customer_id": "1234567890"})
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

    def test_select_connection_activates_only_owned_candidate(self, client, auth_headers, db_session, test_user):
        from app.models import GoogleAdsConnection

        first = GoogleAdsConnection(
            user_id=test_user.id,
            customer_id="1111111111",
            encrypted_refresh_token="refresh-one",
            is_active=True,
        )
        second = GoogleAdsConnection(
            user_id=test_user.id,
            customer_id="2222222222",
            encrypted_refresh_token="refresh-two",
            is_active=False,
        )
        db_session.add_all([first, second])
        db_session.commit()

        response = client.post(
            "/api/v1/google-ads/connection/select",
            headers=auth_headers,
            json={"customer_id": "222-222-2222"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["customer_id"] == "2222222222"
        db_session.refresh(first)
        db_session.refresh(second)
        assert first.is_active is False
        assert second.is_active is True

    def test_select_unknown_connection_is_404(self, client, auth_headers):
        response = client.post(
            "/api/v1/google-ads/connection/select",
            headers=auth_headers,
            json={"customer_id": "9999999999"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestGoogleAdsOAuthCallback:
    """The callback route is intentionally public (no JWT) — identity comes
    from the signed `state` query parameter Google echoes back, which is
    itself a self-verifying JWT (signature + expiry + provider binding). The
    oauth_state cookie is validated as a defense-in-depth match ONLY when
    present, since some browser/dev setups (cross-port localhost) don't
    reliably persist third-party-ish cookies — its absence alone must never
    fail an otherwise-valid, signed state."""

    def test_callback_missing_code_is_400(self, client):
        response = client.get("/api/v1/google-ads/oauth/callback")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_callback_with_error_param_is_400(self, client):
        response = client.get("/api/v1/google-ads/oauth/callback?error=access_denied")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_callback_missing_state_param_is_400(self, client):
        response = client.get("/api/v1/google-ads/oauth/callback?code=fake-code")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_callback_forged_state_param_is_400(self, client):
        response = client.get("/api/v1/google-ads/oauth/callback?code=fake-code&state=not-a-real-signed-token")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_callback_valid_state_but_no_cookie_still_proceeds_past_state_check(self, client, auth_headers, db_session):
        """The core fix under test: a valid signed state with NO oauth_state
        cookie at all must not be rejected for that reason alone (it should
        fail later, e.g. on the Google token exchange with a fake code — not
        on state/CSRF validation)."""
        from app.core.oauth_state import create_oauth_state
        me = client.get("/api/v1/auth/me", headers=auth_headers).json()
        state = create_oauth_state(me["id"], "google-ads")
        response = client.get(f"/api/v1/google-ads/oauth/callback?code=fake-code&state={state}")
        # Not configured in this test env -> fails on config check before ever
        # reaching Google, but crucially NOT with "missing state" / cookie errors.
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_502_BAD_GATEWAY]
        assert "cookie" not in response.json().get("detail", "").lower()

    def test_callback_state_cookie_mismatch_with_query_state_is_400(self, client):
        client.cookies.set("oauth_state", "a-completely-different-token")
        response = client.get("/api/v1/google-ads/oauth/callback?code=fake-code&state=some-other-token")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "mismatch" in response.json()["detail"].lower()


class TestGoogleAdsNotConfigured:
    """When GOOGLE_ADS_CLIENT_ID/SECRET/DEVELOPER_TOKEN aren't set, connect-flow
    routes must fail clearly, not crash. Explicitly monkeypatches settings
    rather than relying on the ambient .env — this repo's .env now has real
    credentials configured (Sprint 1 verification), so the "unconfigured"
    state must be simulated, not assumed from the environment."""

    def test_oauth_start_without_config_is_500(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr("app.api.v1.google_ads.settings.GOOGLE_ADS_CLIENT_ID", "")
        response = client.get("/api/v1/google-ads/oauth/start", headers=auth_headers, follow_redirects=False)
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


class TestGoogleAdsWriteRoutesRequireAuth:
    """Same auth-gate guarantee as the read routes (TestGoogleAdsAuthGate)."""

    def test_create_campaign_requires_auth(self, client):
        response = client.post("/api/v1/google-ads/campaigns", json={"name": "x", "daily_budget_micros": 1000000, "confirm": True})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_pause_campaign_requires_auth(self, client):
        response = client.post("/api/v1/google-ads/campaigns/123/pause", json={"confirm": True})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_enable_campaign_requires_auth(self, client):
        response = client.post("/api/v1/google-ads/campaigns/123/enable", json={"confirm": True})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_negative_keywords_requires_auth(self, client):
        response = client.post("/api/v1/google-ads/campaigns/123/negative-keywords", json={"keywords": ["x"], "confirm": True})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestGoogleAdsWriteConfirmationGuard:
    """Every write action must reject silently-unconfirmed requests with 400
    BEFORE doing anything else (including looking up a connection) — this is
    the core Sprint 2 safety requirement: no write ever happens without an
    explicit confirm=true from a caller that has already shown the user a
    preview of the change."""

    def test_create_campaign_without_confirm_is_400(self, client, auth_headers):
        response = client.post(
            "/api/v1/google-ads/campaigns",
            headers=auth_headers,
            json={"name": "Test Campaign", "daily_budget_micros": 5_000_000},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "confirm" in response.json()["detail"].lower()

    def test_create_campaign_with_confirm_false_is_400(self, client, auth_headers):
        response = client.post(
            "/api/v1/google-ads/campaigns",
            headers=auth_headers,
            json={"name": "Test Campaign", "daily_budget_micros": 5_000_000, "confirm": False},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pause_campaign_without_confirm_is_400(self, client, auth_headers):
        response = client.post("/api/v1/google-ads/campaigns/123/pause", headers=auth_headers, json={})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_enable_campaign_without_confirm_is_400(self, client, auth_headers):
        response = client.post("/api/v1/google-ads/campaigns/123/enable", headers=auth_headers, json={})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_negative_keywords_without_confirm_is_400(self, client, auth_headers):
        response = client.post(
            "/api/v1/google-ads/campaigns/123/negative-keywords",
            headers=auth_headers,
            json={"keywords": ["competitor brand"]},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_campaign_confirmed_but_no_connection_is_404(self, client, auth_headers):
        """Once confirmed, the guard passes and the route proceeds to the
        next real check (an active connection must exist) -- proving the
        confirm gate isn't masking every other code path."""
        response = client.post(
            "/api/v1/google-ads/campaigns",
            headers=auth_headers,
            json={"name": "Test Campaign", "daily_budget_micros": 5_000_000, "confirm": True},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_pause_campaign_confirmed_but_no_connection_is_404(self, client, auth_headers):
        response = client.post("/api/v1/google-ads/campaigns/123/pause", headers=auth_headers, json={"confirm": True})
        assert response.status_code == status.HTTP_404_NOT_FOUND
