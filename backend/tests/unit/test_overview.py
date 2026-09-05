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

    def test_overview_uses_active_meta_connection_token(self, client, auth_headers, db_session, test_user, monkeypatch):
        """Regression (Sprint 6): _fetch_meta_rows must drive FacebookService
        with the user's active MetaAdsConnection token, not the empty env
        fallback. Before the fix this died with a raw
        "Facebook API Init Error: 'NoneType' object has no attribute 'encode'"
        even for connected users."""
        from app.models import MetaAdsConnection
        from app.api.v1 import overview as overview_module

        db_session.add(MetaAdsConnection(
            user_id=test_user.id,
            ad_account_id="act_1350206440591360",
            account_name="Nalarin Ads",
            encrypted_access_token="cipher-blob",
            is_active=True,
        ))
        db_session.commit()

        captured = {}

        class FakeService:
            def __init__(self, **kwargs):
                captured.update(kwargs)
                self.api = None
                self.ad_account_id = kwargs.get("ad_account_id")

            def initialize(self):
                self.api = object()

            def get_campaigns(self, ad_account_id=None):
                return [{"id": "c1", "name": "Meta Campaign"}]

            def get_campaign_insights(self, campaign_id, date_preset="last_30d", **kw):
                return {"spend": 10.0, "impressions": 100, "clicks": 5, "conversions": 1.0}

        monkeypatch.setattr(overview_module, "FacebookService", FakeService)
        monkeypatch.setattr(overview_module, "decrypt_token", lambda blob: "plaintext-token")

        response = client.get("/api/v1/overview", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert captured.get("access_token") == "plaintext-token"
        assert captured.get("ad_account_id") == "act_1350206440591360"
        meta_rows = [row for row in body["campaigns"] if row["platform"] == "meta"]
        assert meta_rows and meta_rows[0]["campaign_name"] == "Meta Campaign"
        assert "meta" not in body["errors"]

    def test_overview_meta_missing_token_message_is_actionable(self, client, auth_headers, monkeypatch):
        """When no Meta connection exists and env token is empty, the meta error
        must be a user-actionable message, not raw NoneType SDK noise."""
        from app.api.v1 import overview as overview_module

        class BrokenService:
            def __init__(self, **kwargs):
                self.api = None
                self.ad_account_id = None

            def initialize(self):
                raise RuntimeError("Facebook API Init Error: 'NoneType' object has no attribute 'encode'")

        monkeypatch.setattr(overview_module, "FacebookService", BrokenService)

        response = client.get("/api/v1/overview", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        meta_error = response.json()["errors"].get("meta", "")
        assert "NoneType" not in meta_error
        assert "No connected Meta Ads account" in meta_error
