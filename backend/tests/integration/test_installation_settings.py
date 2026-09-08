"""Installation API contracts against task-owned PostgreSQL."""
import pytest
from sqlalchemy import text


@pytest.fixture(autouse=True)
def clear_installation(db_session, monkeypatch):
    from app.core.config import settings
    for key in ("GEMINI_API_KEY", "FAL_AI_API_KEY", "KIE_AI_API_KEY"):
        monkeypatch.setattr(settings, key, "")
    assert db_session.bind.url.host in {None, "localhost", "127.0.0.1"}
    assert db_session.bind.url.database.startswith("test_")
    for name in ("provider_connections", "installation_state"):
        if db_session.execute(text("SELECT to_regclass(:name)"), {"name": name}).scalar():
            db_session.execute(text(f"DELETE FROM {name}"))
    db_session.commit()
    yield


def test_installation_requires_login(client):
    assert client.get("/api/v1/installation").status_code == 401


def test_provider_key_is_encrypted_and_never_returned(client, auth_headers, db_session):
    key = "test-provider-secret-12345678"
    response = client.put("/api/v1/installation/providers/gemini", headers=auth_headers,
                          json={"api_key": key})
    assert response.status_code == 200, response.text
    assert key not in response.text
    assert response.json()["status"] == "saved_unverified"
    stored = db_session.execute(text(
        "SELECT encrypted_key FROM provider_connections WHERE provider = 'gemini'"
    )).scalar_one()
    assert stored != key and key not in stored
    listing = client.get("/api/v1/installation/providers", headers=auth_headers)
    assert listing.status_code == 200
    assert key not in listing.text and stored not in listing.text


def test_replace_and_disconnect_take_effect_without_restart(client, auth_headers, db_session, monkeypatch):
    from app.services.provider_settings import get_provider_key
    from app.core.config import settings
    monkeypatch.setattr(settings, "FAL_AI_API_KEY", "test-environment-fallback")
    assert get_provider_key("fal", db_session) == "test-environment-fallback"
    for key in ("test-first-provider-key", "test-replacement-provider-key"):
        response = client.put("/api/v1/installation/providers/fal", headers=auth_headers,
                              json={"api_key": key})
        assert response.status_code == 200
        assert get_provider_key("fal", db_session) == key
    assert client.delete("/api/v1/installation/providers/fal", headers=auth_headers).status_code == 200
    assert get_provider_key("fal", db_session) is None


def test_non_admin_cannot_manage_credentials(client, auth_headers, test_user, db_session):
    test_user.roles.clear()
    test_user.is_superuser = False
    db_session.commit()
    for method, path, kwargs in [
        ("get", "/api/v1/installation/providers", {}),
        ("put", "/api/v1/installation/providers/fal", {"json": {"api_key": "test-secret-key"}}),
        ("delete", "/api/v1/installation/providers/fal", {}),
        ("post", "/api/v1/installation/providers/fal/test", {}),
        ("patch", "/api/v1/installation", {"json": {"step": "providers"}}),
    ]:
        response = getattr(client, method)(path, headers=auth_headers, **kwargs)
        assert response.status_code == 403, (path, response.text)


def test_progress_is_persisted_and_defer_does_not_fake_connections(client, auth_headers, db_session):
    from app.models import InstallationState
    db_session.add(InstallationState(id=1, initialized=True, setup_status="pending"))
    db_session.commit()
    assert client.get("/api/v1/installation", headers=auth_headers).json()["setup_required"]
    response = client.patch("/api/v1/installation", headers=auth_headers,
                            json={"step": "providers", "status": "in_progress"})
    assert response.status_code == 200
    db_session.expire_all()
    assert client.get("/api/v1/installation", headers=auth_headers).json()["step"] == "providers"
    client.patch("/api/v1/installation", headers=auth_headers,
                 json={"step": "providers", "status": "deferred"})
    state = client.get("/api/v1/installation", headers=auth_headers).json()
    assert not state["setup_required"]
    assert state["capabilities"]["image_generation"] is False


def test_provider_validation_is_truthful_and_redacted(client, auth_headers, monkeypatch):
    from app.services import provider_settings
    client.put("/api/v1/installation/providers/gemini", headers=auth_headers,
               json={"api_key": "test-rejected-secret"})
    async def rejected(*args, **kwargs):
        return "invalid", "The provider rejected this key. Replace it and try again."
    monkeypatch.setattr(provider_settings, "check_provider_key", rejected)
    result = client.post("/api/v1/installation/providers/gemini/test", headers=auth_headers)
    assert result.status_code == 200
    assert result.json()["status"] == "invalid"
    assert "test-rejected-secret" not in result.text


def test_unknown_and_blank_provider_values_rejected(client, auth_headers):
    assert client.put("/api/v1/installation/providers/unknown", headers=auth_headers,
                      json={"api_key": "test-provider-key"}).status_code == 404
    assert client.put("/api/v1/installation/providers/fal", headers=auth_headers,
                      json={"api_key": "   "}).status_code == 422


def test_missing_image_key_never_generates_placeholder(client, auth_headers, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "FAL_AI_API_KEY", "")
    response = client.post("/api/v1/generated-ads/generate-image", headers=auth_headers,
                           json={"brand": {}, "product": {}, "profile": {}, "copy": {},
                                 "template": {}, "count": 1,
                                 "imageSizes": [{"width": 1024, "height": 1024, "name": "Square"}]})
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "provider_not_configured"


def test_validation_never_echoes_secret_input(client, auth_headers):
    secret = "test-private-secret-with whitespace"
    result = client.put("/api/v1/installation/providers/gemini", headers=auth_headers, json={"api_key": secret})
    assert result.status_code == 422
    assert secret not in result.text and "test-private-secret" not in result.text
    assert result.json()["error"]["code"] == "invalid_input"


def test_replaced_key_cannot_receive_stale_verification(client, auth_headers, monkeypatch):
    from app.database import SessionLocal
    from app.services import provider_settings
    client.put("/api/v1/installation/providers/gemini", headers=auth_headers, json={"api_key": "test-first-key"})
    async def replace_during_check(provider, key):
        with SessionLocal() as other:
            provider_settings.save_provider_key(other, provider, "test-second-key", None)
        return "connected", "Old key was connected"
    monkeypatch.setattr(provider_settings, "check_provider_key", replace_during_check)
    result = client.post("/api/v1/installation/providers/gemini/test", headers=auth_headers)
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "connection_changed"
    row = client.get("/api/v1/installation/providers", headers=auth_headers).json()["data"][0]
    assert row["status"] == "saved_unverified"


def test_invalid_image_size_makes_zero_provider_calls(client, auth_headers, monkeypatch):
    from app.api.v1 import generated_ads
    from unittest.mock import AsyncMock, Mock
    client.put("/api/v1/installation/providers/fal", headers=auth_headers, json={"api_key": "test-fal-key"})
    provider = Mock(submit=AsyncMock())
    monkeypatch.setattr(generated_ads.fal_client, "AsyncClient", lambda **kwargs: provider)
    response = client.post("/api/v1/generated-ads/generate-image", headers=auth_headers,
                           json={"imageSizes": [{"width": 1080, "height": 1080}, {"width": 0, "height": 1080}]})
    assert response.status_code == 422
    provider.submit.assert_not_awaited()


def test_fal_check_does_not_claim_generation_key_verified():
    import asyncio
    from app.services.provider_settings import check_provider_key
    status, message = asyncio.run(check_provider_key("fal", "test-fal-key"))
    assert status == "saved_unverified"
    assert "no credits" in message.lower()
