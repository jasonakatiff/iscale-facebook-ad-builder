"""Security regressions from the PR3 deployment review (real DB and routes)."""
import secrets
from unittest.mock import AsyncMock

import pytest

from app.core.deps import _hash_api_key
from app.core.oauth_state import create_oauth_state
from app.models import ApiKey, GoogleAdsConnection, MetaAdsConnection, TikTokAdsConnection, User


PROVIDERS = [
    ("google-ads", "google-ads", GoogleAdsConnection, "customer_id", "1111111111"),
    ("facebook", "meta-ads", MetaAdsConnection, "ad_account_id", "act_111"),
    ("tiktok-ads", "tiktok-ads", TikTokAdsConnection, "advertiser_id", "111"),
]


@pytest.mark.parametrize("path,provider,model,field,value", PROVIDERS)
@pytest.mark.parametrize("cookie", [None, "test-mismatch"])
def test_oauth_requires_matching_cookie(client, test_user, monkeypatch, path, provider, model, field, value, cookie):
    exchange = AsyncMock(side_effect=AssertionError("Unbound callback reached provider"))
    target = "exchange_code" if path == "facebook" else "exchange_code_for_tokens"
    monkeypatch.setattr(f"app.api.v1.{path.replace('-', '_')}.{target}", exchange)
    state = create_oauth_state(test_user.id, provider)
    if cookie:
        client.cookies.set("oauth_state", cookie)
    response = client.get(f"/api/v1/{path}/oauth/callback", params={"code": "test-code", "state": state})
    assert response.status_code == 400
    assert ("mismatch" if cookie else "cookie") in response.json()["detail"].lower()
    assert 'oauth_state=""' in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]
    exchange.assert_not_awaited()


@pytest.mark.parametrize("path,provider,model,field,value", PROVIDERS)
def test_successful_callback_clears_cookie(client, test_user, db_session, monkeypatch, path, provider, model, field, value):
    module = f"app.api.v1.{path.replace('-', '_')}"
    tokens = {"access_token": "test-access", "refresh_token": "test-refresh", "advertiser_ids": [value], "expires_in": 5184000}
    if path == "facebook":
        monkeypatch.setattr(f"{module}.exchange_code", AsyncMock(return_value=tokens))
        monkeypatch.setattr(f"{module}.list_ad_accounts", AsyncMock(return_value=[{"id": value, "name": "test-account"}]))
    else:
        monkeypatch.setattr(f"{module}.exchange_code_for_tokens", AsyncMock(return_value=tokens))
        if path == "google-ads":
            monkeypatch.setattr(f"{module}.list_accessible_customers", AsyncMock(return_value=[value]))
    state = create_oauth_state(test_user.id, provider)
    client.cookies.set("oauth_state", state)
    response = client.get(f"/api/v1/{path}/oauth/callback", params={"code": "test-code", "state": state}, follow_redirects=False)
    assert response.status_code in (302, 307)
    assert 'oauth_state=""' in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]
    row = db_session.query(model).filter_by(user_id=test_user.id).one()
    assert row.is_active is True
    from app.core.token_encryption import decrypt_token
    assert decrypt_token(row.encrypted_access_token) == "test-access"
    if path == "facebook":
        from datetime import datetime, timezone
        assert 5183900 < (row.access_token_expires_at - datetime.now(timezone.utc)).total_seconds() <= 5184000


@pytest.mark.parametrize("path,body", [
    ("google-ads/campaigns", {"name": "test-campaign", "daily_budget_micros": 1000000, "confirm": True}),
    ("google-ads/campaigns/123/pause", {"confirm": True}),
    ("google-ads/campaigns/123/enable", {"confirm": True}),
    ("google-ads/campaigns/123/negative-keywords", {"keywords": ["test"], "confirm": True}),
    ("tiktok-ads/campaigns", {"name": "test-campaign", "daily_budget": 10, "confirm": True}),
])
def test_campaign_writes_require_permission(client, auth_headers, test_user, db_session, path, body):
    test_user.roles.clear()
    db_session.commit()
    response = client.post(f"/api/v1/{path}", headers=auth_headers, json=body)
    assert response.status_code == 403
    assert "campaigns:write" in response.json()["detail"]


@pytest.mark.parametrize("path,provider,model,field,value", PROVIDERS)
def test_reselect_active_connection_stays_active(client, auth_headers, test_user, db_session, path, provider, model, field, value):
    token_field = "encrypted_access_token" if model is MetaAdsConnection else "encrypted_refresh_token"
    selected = model(user_id=test_user.id, **{field: value, token_field: "test-token"}, is_active=True)
    db_session.add(selected)
    db_session.commit()
    response = client.post(f"/api/v1/{path}/connection/select", headers=auth_headers, json={field: value})
    assert response.status_code == 200
    db_session.refresh(selected)
    assert selected.is_active is True


def test_bot_connections_are_scoped_to_key_owner(client, test_user, db_session):
    raw = f"test-bot-{secrets.token_hex(12)}"
    outsider = User(email=f"test-outsider-{secrets.token_hex(6)}@example.com", hashed_password="test-unused", name="test-outsider")
    key = ApiKey(name="test-bound", key_hash=_hash_api_key(raw), scopes=["ads:read"], created_by_user_id=test_user.id)
    db_session.add_all([outsider, key])
    db_session.flush()
    for owner, suffix in [(test_user.id, "owned"), (outsider.id, "foreign")]:
        db_session.add_all([
            GoogleAdsConnection(user_id=owner, customer_id=f"test-{suffix}", encrypted_refresh_token="test-secret", is_active=True),
            TikTokAdsConnection(user_id=owner, advertiser_id=f"test-{suffix}", encrypted_refresh_token="test-secret", is_active=True),
        ])
    db_session.commit()
    try:
        response = client.get("/api/v1/bot/connections", headers={"Authorization": f"Bearer {raw}"})
        assert response.status_code == 200
        assert [row["customer_id"] for row in response.json()["google_ads"]] == ["test-owned"]
        assert [row["advertiser_id"] for row in response.json()["tiktok_ads"]] == ["test-owned"]
        assert "test-secret" not in response.text
    finally:
        db_session.delete(key)
        db_session.delete(outsider)
        db_session.commit()


def test_unbound_bot_cannot_list_connections(client, db_session):
    raw = f"test-bot-{secrets.token_hex(12)}"
    key = ApiKey(name="test-unbound", key_hash=_hash_api_key(raw), scopes=["ads:read"])
    db_session.add(key)
    db_session.commit()
    try:
        response = client.get("/api/v1/bot/connections", headers={"Authorization": f"Bearer {raw}"})
        assert response.status_code == 403
    finally:
        db_session.delete(key)
        db_session.commit()


@pytest.mark.parametrize("secure,samesite", [(True, "none"), (False, "lax")])
def test_state_cookie_supports_split_frontend_origin(secure, samesite):
    from fastapi import Response
    from app.core.oauth_state import set_oauth_state_cookie
    response = Response()
    set_oauth_state_cookie(response, "test-state", secure=secure)
    cookie = response.headers["set-cookie"]
    assert f"SameSite={samesite}" in cookie
    assert ("Secure" in cookie) is secure
    assert "HttpOnly" in cookie
