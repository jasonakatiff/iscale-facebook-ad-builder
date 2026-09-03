"""Meta Ads OAuth and account-selection route tests."""
from urllib.parse import parse_qs, urlparse

from fastapi import status

from app.models import MetaAdsConnection
from app.services.meta_ads_oauth import META_SCOPES, build_oauth_url
from app.services.facebook_service import FacebookService


class TestMetaOAuthHelpers:
    def test_oauth_url_contains_callback_state_and_required_scopes(self):
        url = build_oauth_url("app-id", "https://ads.example.com/callback", "signed-state")
        query = parse_qs(urlparse(url).query)

        assert query["client_id"] == ["app-id"]
        assert query["redirect_uri"] == ["https://ads.example.com/callback"]
        assert query["state"] == ["signed-state"]
        assert set(query["scope"][0].split(",")) == set(META_SCOPES)

    def test_ad_accounts_are_limited_to_selected_connection(self, monkeypatch):
        accounts = [
            {"id": "act_111", "name": "Personal"},
            {"id": "act_222", "name": "Nalarin Ads"},
        ]

        class FakeUser:
            def __init__(self, fbid, api):
                pass

            def get_ad_accounts(self, fields):
                return accounts

        monkeypatch.setattr("app.services.facebook_service.User", FakeUser)
        service = FacebookService(access_token="token", ad_account_id="act_222")
        service.api = object()

        assert service.get_ad_accounts() == [{"id": "act_222", "name": "Nalarin Ads"}]


class TestMetaAuthGate:
    def test_oauth_start_requires_auth(self, client):
        assert client.get("/api/v1/facebook/oauth/start").status_code == status.HTTP_401_UNAUTHORIZED

    def test_connection_requires_auth(self, client):
        assert client.get("/api/v1/facebook/connection").status_code == status.HTTP_401_UNAUTHORIZED

    def test_connections_requires_auth(self, client):
        assert client.get("/api/v1/facebook/connections").status_code == status.HTTP_401_UNAUTHORIZED

    def test_select_requires_auth(self, client):
        response = client.post("/api/v1/facebook/connection/select", json={"ad_account_id": "123"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestMetaConnectionStatus:
    def test_no_connection_reports_disconnected(self, client, auth_headers):
        response = client.get("/api/v1/facebook/connection", headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"connected": False}

    def test_connection_reports_token_expiry(self, client, auth_headers, db_session, test_user):
        """Sprint 8: /facebook/connection must expose token_expires_at (naive
        datetimes normalized to UTC) so the UI can flag a lapsed token."""
        from datetime import datetime
        from app.models import MetaAdsConnection

        naive = datetime(2026, 8, 22, 6, 53, 57)  # naive on purpose — Postgres may return naive
        db_session.add(MetaAdsConnection(
            user_id=test_user.id,
            ad_account_id="act_1350206440591360",
            account_name="Nalarin Ads",
            encrypted_access_token="token",
            is_active=True,
            access_token_expires_at=naive,
        ))
        db_session.commit()

        response = client.get("/api/v1/facebook/connection", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["connected"] is True
        assert body["token_expires_at"].startswith("2026-08-22T06:53:57")

    def test_select_activates_only_owned_candidate(self, client, auth_headers, db_session, test_user):
        first = MetaAdsConnection(
            user_id=test_user.id,
            ad_account_id="act_111",
            account_name="First",
            encrypted_access_token="token-one",
            is_active=True,
        )
        second = MetaAdsConnection(
            user_id=test_user.id,
            ad_account_id="act_222",
            account_name="Second",
            encrypted_access_token="token-two",
            is_active=False,
        )
        db_session.add_all([first, second])
        db_session.commit()

        response = client.post(
            "/api/v1/facebook/connection/select",
            headers=auth_headers,
            json={"ad_account_id": "222"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["ad_account_id"] == "act_222"
        db_session.refresh(first)
        db_session.refresh(second)
        assert first.is_active is False
        assert second.is_active is True

    def test_select_unknown_connection_is_404(self, client, auth_headers):
        response = client.post(
            "/api/v1/facebook/connection/select",
            headers=auth_headers,
            json={"ad_account_id": "999"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestMetaOAuthRoutes:
    def test_callback_requires_code_and_state(self, client):
        response = client.get("/api/v1/facebook/oauth/callback")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_oauth_start_returns_meta_consent_url(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr("app.api.v1.facebook.settings.FACEBOOK_APP_ID", "meta-app-id")
        monkeypatch.setattr("app.api.v1.facebook.settings.FACEBOOK_APP_SECRET", "meta-app-secret")
        monkeypatch.setattr(
            "app.api.v1.facebook.settings.FACEBOOK_OAUTH_REDIRECT_URI",
            "https://ads.example.com/api/v1/facebook/oauth/callback",
        )

        response = client.get("/api/v1/facebook/oauth/start", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        oauth_url = response.json()["oauth_url"]
        query = parse_qs(urlparse(oauth_url).query)
        assert query["client_id"] == ["meta-app-id"]
        assert query["redirect_uri"] == ["https://ads.example.com/api/v1/facebook/oauth/callback"]
