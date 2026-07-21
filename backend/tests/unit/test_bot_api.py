"""Safety boundaries for the Ads Studio machine-to-machine bot API."""
import secrets

from fastapi import status


class TestBotApiAuth:
    def test_connections_requires_api_key_not_jwt(self, client):
        response = client.get("/api/v1/bot/connections")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_safety_requires_api_key(self, client):
        response = client.get("/api/v1/bot/safety")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_overview_requires_api_key(self, client):
        response = client.get("/api/v1/bot/overview")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestBotApiScopes:
    def test_read_key_can_get_safety_policy(self, client, db_session):
        from app.models import ApiKey
        from app.core.deps import _hash_api_key
        raw = f"ads_studio_bot_test_{secrets.token_urlsafe(16)}"
        db_session.add(ApiKey(name="bot", key_hash=_hash_api_key(raw), scopes=["ads:read"]))
        db_session.commit()

        response = client.get("/api/v1/bot/safety", headers={"Authorization": f"Bearer {raw}"})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["can_spend"] is False

    def test_bot_has_no_write_routes_in_openapi(self, client):
        schema = client.get("/api/v1/openapi.json").json()
        bot_paths = [path for path in schema["paths"] if path.startswith("/api/v1/bot")]
        assert bot_paths == ["/api/v1/bot/connections", "/api/v1/bot/safety", "/api/v1/bot/overview"]
        assert all("post" not in schema["paths"][path] for path in bot_paths)
