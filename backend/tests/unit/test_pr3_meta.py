"""Meta provider boundary and legacy configuration regressions."""
import asyncio
import ast
from pathlib import Path

import httpx
import pytest
from facebook_business.api import FacebookAdsApi

from app.api.v1.facebook import get_facebook_service
from app.models import MetaAdsConnection
from app.core.token_encryption import encrypt_token
from app.services.facebook_service import FacebookService
from app.services import meta_ads_oauth


@pytest.fixture
def sdk_init(monkeypatch):
    def initialize(**kwargs):
        # Deliberately set a different global default to reproduce another
        # request changing it between init() and get_default_api().
        own_api = FacebookAdsApi(object())
        FacebookAdsApi.set_default_api(FacebookAdsApi(object()))
        return own_api
    monkeypatch.setattr(FacebookAdsApi, "init", initialize)


def test_service_accounts_keep_their_own_api(sdk_init):
    first = FacebookService(access_token="test-token-one", ad_account_id="111")
    second = FacebookService(access_token="test-token-two", ad_account_id="222")
    assert first.api is not second.api
    assert first.account.get_api() is first.api
    assert second.account.get_api() is second.api
    assert first.api is not FacebookAdsApi.get_default_api()
    assert second.api is not FacebookAdsApi.get_default_api()


def test_all_sdk_constructors_receive_instance_api():
    source = Path(__file__).parents[2] / "app/services/facebook_service.py"
    tree = ast.parse(source.read_text())
    sdk_names = {alias.asname or alias.name for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("facebook_business.adobjects.") for alias in node.names}
    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in sdk_names]
    assert calls
    for call in calls:
        api = next((kw.value for kw in call.keywords if kw.arg == "api"), None)
        assert isinstance(api, ast.Attribute) and ast.unparse(api) == "self.api", (call.func.id, call.lineno)


@pytest.mark.parametrize("env_name", ["FACEBOOK_ACCESS_TOKEN", "VITE_FACEBOOK_ACCESS_TOKEN"])
def test_facebook_env_fallback(db_session, test_user, monkeypatch, sdk_init, env_name):
    monkeypatch.delenv("FACEBOOK_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("VITE_FACEBOOK_ACCESS_TOKEN", raising=False)
    monkeypatch.setenv(env_name, "test-env-token")
    service = get_facebook_service(db=db_session, current_user=test_user)
    assert service.access_token == "test-env-token"
    assert service.api is not None


def test_active_meta_connection_takes_precedence(db_session, test_user, monkeypatch, sdk_init):
    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-env-token")
    db_session.add(MetaAdsConnection(user_id=test_user.id, ad_account_id="act_111", encrypted_access_token=encrypt_token("test-oauth-token"), is_active=True))
    db_session.commit()
    service = get_facebook_service(db=db_session, current_user=test_user)
    assert service.access_token == "test-oauth-token"
    assert service.ad_account_id == "act_111"


def test_facebook_no_tokens_returns_404(client, auth_headers, monkeypatch):
    monkeypatch.delenv("FACEBOOK_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("VITE_FACEBOOK_ACCESS_TOKEN", raising=False)
    response = client.get("/api/v1/facebook/accounts", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.parametrize("long_response", [
    {"access_token": "test-long-token", "expires_in": 5184000},
    {"error": {"message": "test-exchange-failed"}},
])
def test_meta_exchanges_short_token_for_long_lived_token(monkeypatch, long_response):
    requests = []
    def handle(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(200, json={"access_token": "test-short-token", "expires_in": 3600})
        return httpx.Response(200, json=long_response)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(meta_ads_oauth.httpx, "AsyncClient", lambda **kw: original_client(transport=httpx.MockTransport(handle), **kw))
    call = meta_ads_oauth.exchange_code("test-code", "test-client", "test-secret", "https://api.example.com/callback")
    if "error" in long_response:
        with pytest.raises(meta_ads_oauth.MetaOAuthError, match="test-exchange-failed"):
            asyncio.run(call)
    else:
        assert asyncio.run(call) == long_response
    assert len(requests) == 2
    assert str(requests[1].url).startswith(f"{meta_ads_oauth.META_GRAPH_URL}/oauth/access_token?")
    assert dict(requests[1].url.params) == {
        "grant_type": "fb_exchange_token", "client_id": "test-client",
        "client_secret": "test-secret", "fb_exchange_token": "test-short-token",
    }
