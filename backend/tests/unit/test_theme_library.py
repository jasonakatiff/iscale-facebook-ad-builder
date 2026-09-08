from uuid import uuid4
from app.models import User
from app.core.security import create_access_token

PALETTE = {
    "canvas": "#F6F7F8",
    "panel": "#FFFFFF",
    "text": "#222936",
    "muted": "#5C6677",
    "accent": "#295AD4",
    "accentText": "#FFFFFF",
    "accentInk": "#295AD4",
    "border": "#DDE1E7",
}
DARK = {
    **PALETTE,
    "canvas": "#171A20",
    "panel": "#1E222A",
    "text": "#E8ECF3",
    "muted": "#ACB6C5",
    "accentInk": "#9AB7FF",
    "border": "#363D48",
}
THEME = {"version": 1, "name": "test-custom-theme", "light": PALETTE, "dark": DARK}


def test_theme_crud_is_private_to_owner(client, auth_headers, db_session):
    response = client.post("/api/v1/themes", headers=auth_headers, json=THEME)
    assert response.status_code == 201, response.text
    theme_id = response.json()["data"]["id"]
    other = User(
        id=str(uuid4()),
        email=f"test-theme-{uuid4()}@example.com",
        hashed_password="unused",
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    headers = {"Authorization": f'Bearer {create_access_token({"sub":other.id})}'}
    try:
        assert client.get("/api/v1/themes", headers=headers).json()["data"] == []
        assert (
            client.put(
                f"/api/v1/themes/{theme_id}", headers=headers, json=THEME
            ).status_code
            == 404
        )
        assert (
            client.delete(f"/api/v1/themes/{theme_id}", headers=headers).status_code
            == 404
        )
        assert (
            client.put(
                f"/api/v1/themes/{theme_id}",
                headers=auth_headers,
                json={**THEME, "name": "test-renamed"},
            ).json()["data"]["name"]
            == "test-renamed"
        )
        assert (
            client.delete(
                f"/api/v1/themes/{theme_id}", headers=auth_headers
            ).status_code
            == 200
        )
    finally:
        db_session.delete(other)
        db_session.commit()


def test_theme_rejects_code_poor_contrast_and_arbitrary_hosts(client, auth_headers):
    for change in [
        {"light": {**PALETTE, "accent": "url(https://evil.example)"}},
        {"css": "body {display:none}"},
        {"light": {**PALETTE, "text": "#FFFFFF"}},
    ]:
        assert (
            client.post(
                "/api/v1/themes", headers=auth_headers, json={**THEME, **change}
            ).status_code
            == 422
        )
    for url in [
        "http://127.0.0.1/secret",
        "https://evil.example/theme.json",
        "https://raw.githubusercontent.com@127.0.0.1/theme.json",
        "https://raw.githubusercontent.com/o/r/main/theme.json?token=secret",
    ]:
        assert (
            client.post(
                "/api/v1/themes/import-github", headers=auth_headers, json={"url": url}
            ).status_code
            == 422
        )


def test_github_import_refresh_and_network_limits(client, auth_headers, monkeypatch):
    import httpx
    from app.api.v1 import themes

    original_client = httpx.AsyncClient
    mode = {"value": "valid"}

    def transport(request):
        assert str(request.url).startswith(
            "https://raw.githubusercontent.com/test-owner/test-repo/main/"
        )
        assert "authorization" not in request.headers
        if mode["value"] == "redirect":
            return httpx.Response(302, headers={"Location": "http://127.0.0.1/private"})
        if mode["value"] == "oversized":
            return httpx.Response(200, content=b" " * 32769)
        if mode["value"] == "timeout":
            raise httpx.ReadTimeout("test-timeout")
        return httpx.Response(
            200,
            json={
                **THEME,
                "name": (
                    "test-github-refreshed"
                    if mode["value"] == "refresh"
                    else "test-github"
                ),
            },
        )

    monkeypatch.setattr(
        themes.httpx,
        "AsyncClient",
        lambda **kwargs: original_client(
            **kwargs, transport=httpx.MockTransport(transport)
        ),
    )
    response = client.post(
        "/api/v1/themes/import-github",
        headers=auth_headers,
        json={"url": "https://github.com/test-owner/test-repo/blob/main/theme.json"},
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert (
        data["githubUrl"]
        == "https://raw.githubusercontent.com/test-owner/test-repo/main/theme.json"
    )
    mode["value"] = "refresh"
    assert (
        client.post(
            f'/api/v1/themes/{data["id"]}/refresh-github', headers=auth_headers
        ).json()["data"]["name"]
        == "test-github-refreshed"
    )
    for value, status in [("redirect", 502), ("oversized", 422), ("timeout", 502)]:
        mode["value"] = value
        assert (
            client.post(
                "/api/v1/themes/import-github",
                headers=auth_headers,
                json={
                    "url": "https://github.com/test-owner/test-repo/blob/main/theme.json"
                },
            ).status_code
            == status
        )
    client.delete(f'/api/v1/themes/{data["id"]}', headers=auth_headers)
