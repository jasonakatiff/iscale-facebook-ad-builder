"""M1a effective Meta authorization, through real API/auth/PostgreSQL."""
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import uuid4

import pytest
from facebook_business.api import FacebookAdsApi

from app.core.token_encryption import encrypt_token
from app.models import MetaAdsConnection, User
from app.services.facebook_service import resolve_facebook_service


@pytest.fixture(autouse=True)
def local_only(db_session, monkeypatch):
    url = urlparse(str(db_session.bind.url))
    assert url.hostname in ("localhost", "127.0.0.1") and url.path.startswith("/test_")
    for key in ("FACEBOOK_ACCESS_TOKEN", "VITE_FACEBOOK_ACCESS_TOKEN", "FACEBOOK_AD_ACCOUNT_ID", "VITE_FACEBOOK_AD_ACCOUNT_ID"):
        monkeypatch.delenv(key, raising=False)
    def no_transport(*args, **kwargs):
        raise AssertionError("No external Meta request is allowed in a connection-status test")
    monkeypatch.setattr(FacebookAdsApi, "call", no_transport)


def grant(db, user, *, account="act_111", active=True, expires=None, token="test-personal-token"):
    row = MetaAdsConnection(user_id=user.id, ad_account_id=account, account_name="test-personal-account", encrypted_access_token=encrypt_token(token), is_active=active, access_token_expires_at=expires)
    db.add(row)
    db.commit()
    return row


def status(client, headers):
    response = client.get("/api/v1/facebook/connection", headers=headers)
    assert response.status_code == 200, response.text
    for secret in ("test-system-token", "test-personal-token", "encrypted_access_token", "encryption key"):
        assert secret not in response.text
    return response.json()


def test_disconnected_state_requires_no_meta_call(client, auth_headers):
    body = status(client, auth_headers)
    assert body["state"] == "disconnected"
    assert body["connected"] is False and body["source"] is None


@pytest.mark.parametrize("prefix", ["", "VITE_"])
def test_status_and_service_share_managed_fallback(client, auth_headers, db_session, test_user, monkeypatch, prefix):
    monkeypatch.setenv(prefix + "FACEBOOK_ACCESS_TOKEN", "test-system-token")
    monkeypatch.setenv(prefix + "FACEBOOK_AD_ACCOUNT_ID", "123")
    body = status(client, auth_headers)
    assert body["connected"] is True and body["state"] == "connected"
    assert body["source"] == "managed" and body["can_disconnect"] is False
    assert body["ad_account_id"] == "act_123"
    service = resolve_facebook_service(db_session, test_user.id)
    assert service.access_token == "test-system-token" and service.ad_account_id == "act_123"


def test_token_only_managed_configuration_can_still_list_accounts(client, auth_headers, monkeypatch):
    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-system-token")
    body = status(client, auth_headers)
    assert body["source"] == "managed" and body["connected"] is True
    assert body["ad_account_id"] is None


@pytest.mark.parametrize("configured", [False, True])
def test_oauth_availability_is_independent_of_managed_access(client, auth_headers, monkeypatch, configured):
    from app.core.config import settings

    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-system-token")
    monkeypatch.setattr(settings, "FACEBOOK_APP_ID", "test-app")
    monkeypatch.setattr(settings, "FACEBOOK_APP_SECRET", "test-app-secret" if configured else "")
    monkeypatch.setattr(settings, "FACEBOOK_OAUTH_REDIRECT_URI", "https://test.example/callback")
    body = status(client, auth_headers)
    assert body["oauth_available"] is configured
    assert body["connected"] is True and body["source"] == "managed"
    if not configured:
        assert client.get("/api/v1/facebook/oauth/start", headers=auth_headers).status_code == 503


def test_personal_grant_has_priority_and_safe_metadata(client, auth_headers, db_session, test_user, monkeypatch):
    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-system-token")
    expiry = datetime.now(timezone.utc) + timedelta(days=3)
    grant(db_session, test_user, expires=expiry)
    body = status(client, auth_headers)
    assert body["source"] == "oauth" and body["can_disconnect"] is True
    assert body["token_expires_at"] == expiry.isoformat()
    assert resolve_facebook_service(db_session, test_user.id).access_token == "test-personal-token"


def test_expired_personal_grant_blocks_service_without_falling_back(client, auth_headers, db_session, test_user, monkeypatch):
    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-system-token")
    grant(db_session, test_user, expires=datetime.now(timezone.utc) - timedelta(seconds=1))
    body = status(client, auth_headers)
    assert body["state"] == "expired" and body["connected"] is False
    assert body["source"] == "oauth"
    response = client.get("/api/v1/facebook/accounts", headers=auth_headers)
    assert response.status_code == 409
    assert "expired" in response.json()["detail"].lower()


def test_corrupt_personal_token_is_unavailable_without_secret_details(client, auth_headers, db_session, test_user, monkeypatch):
    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-system-token")
    row = grant(db_session, test_user)
    row.encrypted_access_token = "test-corrupt-ciphertext"
    db_session.commit()
    body = status(client, auth_headers)
    assert body["connected"] is False and body["state"] == "unavailable"
    response = client.get("/api/v1/facebook/accounts", headers=auth_headers)
    assert response.status_code == 503
    assert "test-corrupt" not in response.text and "encryption key" not in response.text


def test_unselected_personal_accounts_require_selection(client, auth_headers, db_session, test_user):
    grant(db_session, test_user, active=False)
    body = status(client, auth_headers)
    assert body["state"] == "selection_required" and body["connected"] is False


def test_select_returns_full_effective_status(client, auth_headers, db_session, test_user):
    grant(db_session, test_user, active=False)
    response = client.post("/api/v1/facebook/connection/select", json={"ad_account_id": "111"}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == status(client, auth_headers)
    assert response.json()["source"] == "oauth"


def test_expired_selection_cannot_deactivate_current_account(client, auth_headers, db_session, test_user):
    first = grant(db_session, test_user)
    expired = grant(db_session, test_user, account="act_222", active=False, expires=datetime.now(timezone.utc) - timedelta(days=1))
    response = client.post("/api/v1/facebook/connection/select", json={"ad_account_id": "222"}, headers=auth_headers)
    assert response.status_code == 409
    db_session.refresh(first)
    db_session.refresh(expired)
    assert first.is_active and not expired.is_active


def test_disconnect_exposes_existing_managed_fallback(client, auth_headers, db_session, test_user, monkeypatch):
    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-system-token")
    grant(db_session, test_user)
    assert client.delete("/api/v1/facebook/connection", headers=auth_headers).status_code == 200
    body = status(client, auth_headers)
    assert body["source"] == "managed" and body["can_disconnect"] is False


def test_status_never_reads_another_users_grant(client, auth_headers, db_session):
    other = User(email=f"test-connection-{uuid4()}@example.com", hashed_password="test-unused", is_active=True)
    db_session.add(other)
    db_session.commit()
    grant(db_session, other, account="act_999")
    try:
        assert status(client, auth_headers)["state"] == "disconnected"
        response = client.post("/api/v1/facebook/connection/select", json={"ad_account_id": "999"}, headers=auth_headers)
        assert response.status_code == 404
        assert "act_999" not in client.get("/api/v1/facebook/connections", headers=auth_headers).text
    finally:
        db_session.delete(other)
        db_session.commit()


def test_connection_state_remains_authenticated(client, monkeypatch):
    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-system-token")
    response = client.get("/api/v1/facebook/connection")
    assert response.status_code == 401 and "test-system-token" not in response.text
