"""Meta OAuth helpers for Ads Studio's per-user Marketing API connection."""
from urllib.parse import urlencode

import httpx


META_API_VERSION = "v25.0"
META_AUTH_URL = f"https://www.facebook.com/{META_API_VERSION}/dialog/oauth"
META_GRAPH_URL = f"https://graph.facebook.com/{META_API_VERSION}"
META_SCOPES = [
    "ads_read",
    "ads_management",
    "business_management",
    "pages_show_list",
    "pages_read_engagement",
]


class MetaOAuthError(Exception):
    pass


def build_oauth_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": ",".join(META_SCOPES),
        "response_type": "code",
    }
    return f"{META_AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str, client_id: str, client_secret: str, redirect_uri: str) -> dict:
    params = {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{META_GRAPH_URL}/oauth/access_token", params=params)
    data = response.json()
    if response.status_code != 200 or data.get("error") or not data.get("access_token"):
        error = data.get("error", {})
        raise MetaOAuthError(error.get("message") or f"Meta token exchange failed (HTTP {response.status_code}).")
    return data


async def list_ad_accounts(access_token: str) -> list[dict]:
    params = {
        "access_token": access_token,
        "fields": "id,name,account_id,account_status,currency,timezone_name",
        "limit": 200,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{META_GRAPH_URL}/me/adaccounts", params=params)
    data = response.json()
    if response.status_code != 200 or data.get("error"):
        error = data.get("error", {})
        raise MetaOAuthError(error.get("message") or f"Failed to list Meta ad accounts (HTTP {response.status_code}).")
    return data.get("data", [])