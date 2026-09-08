"""User key lifecycle and actual protected API operations on isolated PostgreSQL."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.deps import _hash_api_key
from app.core.security import create_access_token
from app.models import ApiKey, User


def create_key(client, headers, access="read"):
    response = client.post(
        "/api/v1/api-keys",
        headers=headers,
        json={
            "name": "test-Claude Code",
            "access": access,
            "expiresInDays": 30,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def bearer(raw):
    return {"Authorization": f"Bearer {raw}"}


def test_key_lifecycle_and_read_scope(client, auth_headers, db_session, test_user):
    result = create_key(client, auth_headers)
    raw, key_id = result["apiKey"], result["data"]["id"]
    assert raw.startswith("bw_live_")
    row = db_session.query(ApiKey).filter(ApiKey.id == key_id).one()
    assert row.key_hash == _hash_api_key(raw)
    assert row.created_by_user_id == test_user.id
    assert raw not in repr(row.__dict__)
    response = client.get("/api/v1/api-keys", headers=auth_headers)
    assert raw not in response.text and row.key_hash not in response.text
    assert response.json()["pagination"]["total"] == 1
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/v1/brands", headers=bearer(raw)).status_code == 200
    assert (
        client.get("/api/v1/auth/me", headers=bearer(raw)).json()["id"] == test_user.id
    )
    assert (
        client.post("/api/v1/brands", headers=bearer(raw), json={}).status_code == 403
    )
    assert (
        client.get("/api/v1/facebook/oauth/start", headers=bearer(raw)).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/api-keys", headers=bearer(raw), json={"name": "test-escalation"}
        ).status_code
        == 403
    )
    assert (
        client.delete(f"/api/v1/api-keys/{key_id}", headers=auth_headers).status_code
        == 200
    )
    assert client.get("/api/v1/brands", headers=bearer(raw)).status_code == 401


def test_write_key_crud_respects_owner_permissions(
    client, auth_headers, db_session, test_user
):
    result = create_key(client, auth_headers, "write")
    headers = bearer(result["apiKey"])
    body = {
        "name": "test-key-brand",
        "colors": {
            "primary": "#123456",
            "secondary": "#234567",
            "highlight": "#345678",
        },
        "voice": "test",
        "products": [],
        "profileIds": [],
    }
    response = client.post("/api/v1/brands", headers=headers, json=body)
    assert response.status_code == 200, response.text
    brand_id = response.json()["id"]
    try:
        updated = client.put(
            f"/api/v1/brands/{brand_id}",
            headers=headers,
            json={**body, "name": "test-key-updated"},
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "test-key-updated"
    finally:
        assert (
            client.delete(f"/api/v1/brands/{brand_id}", headers=headers).status_code
            == 200
        )
    test_user.roles = []
    db_session.commit()
    assert client.post("/api/v1/brands", headers=headers, json=body).status_code == 403
    assert client.get("/api/v1/users", headers=headers).status_code == 403


def test_key_ownership_and_rename(client, auth_headers, db_session, test_user):
    result = create_key(client, auth_headers)
    key_id = result["data"]["id"]
    other = User(
        id=str(uuid4()),
        email=f"test-key-owner-{uuid4()}@example.com",
        hashed_password="unused",
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    other_headers = bearer(create_access_token({"sub": other.id}))
    try:
        assert (
            client.get("/api/v1/api-keys", headers=other_headers).json()["data"] == []
        )
        assert (
            client.delete(
                f"/api/v1/api-keys/{key_id}", headers=other_headers
            ).status_code
            == 404
        )
        assert (
            client.patch(
                f"/api/v1/api-keys/{key_id}",
                headers=other_headers,
                json={"name": "test-stolen"},
            ).status_code
            == 404
        )
        renamed = client.patch(
            f"/api/v1/api-keys/{key_id}",
            headers=auth_headers,
            json={"name": "test-renamed"},
        )
        assert renamed.status_code == 200
        assert renamed.json()["data"]["name"] == "test-renamed"
    finally:
        db_session.delete(other)
        db_session.commit()


@pytest.mark.parametrize(
    "invalid", ["expired", "inactive", "ownerless", "legacy", "unknown"]
)
def test_invalid_keys_fail_closed(client, auth_headers, db_session, test_user, invalid):
    result = create_key(client, auth_headers)
    key = db_session.query(ApiKey).filter(ApiKey.id == result["data"]["id"]).one()
    if invalid == "expired":
        key.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    if invalid == "inactive":
        test_user.is_active = False
    if invalid == "ownerless":
        key.created_by_user_id = None
    if invalid == "legacy":
        key.scopes = ["ads:read"]
    db_session.commit()
    raw = result["apiKey"] if invalid != "unknown" else "bw_live_" + "x" * 43
    assert client.get("/api/v1/brands", headers=bearer(raw)).status_code in [401, 403]


def test_key_input_validation(client, auth_headers):
    for body in [
        {"name": " "},
        {"name": "test", "access": "admin"},
        {"name": "test", "expiresInDays": 0},
        {"name": "test", "created_by_user_id": str(uuid4())},
    ]:
        response = client.post("/api/v1/api-keys", headers=auth_headers, json=body)
        assert response.status_code == 422
        assert set(response.json()["error"]) == {"code", "message", "details"}


def test_openapi_and_docs_bundle_are_machine_readable(client):
    response = client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "theLeadRouter.com" in schema["info"]["title"]
    assert (
        schema["components"]["securitySchemes"]["BreadWinnerBearer"]["scheme"]
        == "bearer"
    )
    assert "/api/v1/api-keys" in schema["paths"]
    docs = client.get("/api/v1/help/docs").json()
    assert len(docs["data"]) >= 10
    import io, zipfile

    bundle = client.get("/api/v1/help/download")
    assert bundle.status_code == 200
    with zipfile.ZipFile(io.BytesIO(bundle.content)) as archive:
        assert "openapi.json" in archive.namelist()
        assert "claude-code.md" in archive.namelist()
        assert "facebook-campaigns.md" in archive.namelist()


def test_api_key_keeps_workspace_membership_checks(client, auth_headers):
    key = create_key(client, auth_headers, "write")["apiKey"]
    response = client.get(f"/api/v2/workspaces/{uuid4()}/accounts", headers=bearer(key))
    assert response.status_code in [403, 404]


def test_api_key_cannot_call_account_security_endpoints(client, auth_headers):
    key = create_key(client, auth_headers, "write")["apiKey"]
    assert (
        client.post(
            "/api/v1/auth/register",
            headers=bearer(key),
            json={
                "email": "test-no-key-register@example.com",
                "password": "test-strong-password",
                "name": "test-no-key-register",
            },
        ).status_code
        == 403
    )
    assert client.get("/api/v1/api-keys", headers=bearer(key)).status_code == 403
