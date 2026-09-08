"""M1b workspace authorization through real API/auth/PostgreSQL."""

from uuid import uuid4

import pytest
from app.models import ApiKey, MetaAdsConnection
from app.core.deps import _hash_api_key
from tests.workspace_fixtures import workspace_data, member, grant  # noqa: F401


def test_workspace_routes_require_user_auth(client):
    response = client.get("/api/v2/workspaces")
    assert response.status_code == 401
    assert set(response.json()["error"]) == {"code", "message", "details"}


@pytest.mark.parametrize(
    "role,can_sync,expected",
    [
        ("viewer", True, 403),
        ("creative_editor", True, 403),
        ("buyer", False, 403),
        ("buyer", True, 202),
        ("publisher", True, 202),
        ("admin", True, 202),
    ],
)
def test_explicit_account_grant_and_role_intersection(
    workspace_data, role, can_sync, expected
):
    data = workspace_data
    member(data, role)
    url = f"/api/v2/accounts/{data['account']}"
    assert (
        data["client"].get(url + "/snapshot", headers=data["user_headers"]).status_code
        == 404
    )
    grant(data, can_sync)
    read = data["client"].get(url + "/snapshot", headers=data["user_headers"])
    assert read.status_code == 200 and read.json()["data"] == []
    assert read.json()["sync"]["coverage"] == "none"
    response = data["client"].post(
        url + "/sync", json={"resource": "campaigns"}, headers=data["user_headers"]
    )
    assert response.status_code == expected


def test_workspace_and_account_ids_cannot_cross_scope(workspace_data):
    data = workspace_data
    member(data)
    grant(data)
    result = data["client"].get(
        f"/api/v2/workspaces/{data['other_workspace']}/connections",
        headers=data["user_headers"],
    )
    assert result.status_code == 404 and "test-other" not in result.text
    bad = data["client"].put(
        f"/api/v2/workspaces/{data['other_workspace']}/accounts/{data['account']}/grants/{data['admin']}",
        json={"can_sync": True, "is_active": True},
        headers=data["headers"],
    )
    assert bad.status_code == 404
    assert (
        data["client"]
        .get(f"/api/v2/accounts/{uuid4()}/snapshot", headers=data["user_headers"])
        .json()
        == result.json()
    )


def test_revocation_blocks_cached_reads_and_job_visibility(workspace_data):
    data = workspace_data
    member(data)
    grant(data)
    job = (
        data["client"]
        .post(
            f"/api/v2/accounts/{data['account']}/sync",
            json={},
            headers=data["user_headers"],
        )
        .json()
    )
    grant(data, active=False)
    for route in [
        f"/api/v2/accounts/{data['account']}/snapshot",
        f"/api/v2/sync-jobs/{job['id']}",
    ]:
        assert (
            data["client"].get(route, headers=data["user_headers"]).status_code == 404
        )
    grant(data)
    member(data, active=False)
    assert (
        data["client"]
        .get(
            f"/api/v2/workspaces/{data['workspace']}/connections",
            headers=data["user_headers"],
        )
        .status_code
        == 404
    )
    assert (
        data["client"]
        .get("/api/v2/workspaces", headers=data["user_headers"])
        .json()["data"]
        == []
    )


def test_members_cannot_escalate_roles_or_grants(workspace_data):
    data = workspace_data
    member(data, "viewer")
    for path, body in [
        (f"members/{data['user']}", {"role": "admin", "is_active": True}),
        (
            f"accounts/{data['account']}/grants/{data['user']}",
            {"can_sync": True, "is_active": True},
        ),
    ]:
        result = data["client"].put(
            f"/api/v2/workspaces/{data['workspace']}/{path}",
            json=body,
            headers=data["user_headers"],
        )
        assert result.status_code == 403


def test_connection_binding_requires_personal_ownership_and_redacts_tokens(
    workspace_data,
):
    data = workspace_data
    member(data, "admin")
    result = data["client"].post(
        f"/api/v2/workspaces/{data['workspace']}/connections",
        json={"meta_connection_id": data["credential"]},
        headers=data["user_headers"],
    )
    assert result.status_code == 404
    listing = data["client"].get(
        f"/api/v2/workspaces/{data['workspace']}/connections", headers=data["headers"]
    )
    assert listing.status_code == 200
    assert (
        "test-workspace-token" not in listing.text and "encrypted" not in listing.text
    )
    assert listing.json()["data"][0]["external_account_id"] == "act_123"


def test_validation_pagination_audit_and_no_global_admin_bypass(
    workspace_data, test_user
):
    data = workspace_data
    member(data, "admin")
    data["db"].get(type(test_user), data["user"]).is_superuser = True
    data["db"].commit()
    assert (
        data["client"]
        .get(
            f"/api/v2/accounts/{data['account']}/snapshot", headers=data["user_headers"]
        )
        .status_code
        == 404
    )
    for body in [{"name": "test", "token": "test-secret"}, {"name": "   "}]:
        response = data["client"].post(
            "/api/v2/workspaces", json=body, headers=data["headers"]
        )
        assert response.status_code == 422 and "test-secret" not in response.text
    assert (
        data["client"]
        .get("/api/v2/workspaces?limit=0", headers=data["headers"])
        .status_code
        == 422
    )
    result = (
        data["client"].get("/api/v2/workspaces?limit=1", headers=data["headers"]).json()
    )
    assert result["pagination"] == {
        "total": 2,
        "limit": 1,
        "offset": 0,
        "hasMore": True,
    }
    audit = data["client"].get(
        f"/api/v2/workspaces/{data['workspace']}/audit", headers=data["headers"]
    )
    assert audit.status_code == 200 and len(audit.json()["data"]) >= 3
    assert "test-workspace-token" not in audit.text


def test_bot_read_key_cannot_enqueue(workspace_data):
    data = workspace_data
    key = ApiKey(
        name="test-workspace-bot",
        key_hash=_hash_api_key("test-workspace-api-key"),
        scopes=["ads:read"],
        created_by_user_id=data["admin"],
    )
    data["db"].add(key)
    data["db"].commit()
    try:
        response = data["client"].post(
            f"/api/v2/accounts/{data['account']}/sync",
            json={},
            headers={"Authorization": "Bearer test-workspace-api-key"},
        )
        assert response.status_code == 401
    finally:
        data["db"].delete(key)
        data["db"].commit()


def test_connection_loss_blocks_sync_but_preserves_authorized_history(workspace_data):
    data = workspace_data
    connection = data["db"].get(MetaAdsConnection, data["credential"])
    data["db"].delete(connection)
    data["db"].commit()
    response = data["client"].post(
        f"/api/v2/accounts/{data['account']}/sync", json={}, headers=data["headers"]
    )
    assert response.status_code == 409
    assert (
        data["client"]
        .get(f"/api/v2/accounts/{data['account']}/snapshot", headers=data["headers"])
        .status_code
        == 200
    )


def test_last_admin_cannot_be_removed_and_nonadmin_cannot_create_workspace(
    workspace_data,
):
    data = workspace_data
    result = data["client"].put(
        f"/api/v2/workspaces/{data['workspace']}/members/{data['admin']}",
        json={"role": "viewer", "is_active": False},
        headers=data["headers"],
    )
    assert result.status_code == 409
    assert (
        data["client"]
        .post(
            "/api/v2/workspaces",
            json={"name": "test-unapproved"},
            headers=data["user_headers"],
        )
        .status_code
        == 403
    )


def test_personal_account_selection_does_not_revoke_workspace_binding(workspace_data):
    data = workspace_data
    connection = data["db"].get(MetaAdsConnection, data["credential"])
    connection.is_active = False
    data["db"].commit()
    response = data["client"].post(
        f"/api/v2/accounts/{data['account']}/sync", json={}, headers=data["headers"]
    )
    assert response.status_code == 202


def test_personal_connection_picker_exposes_only_owned_metadata(workspace_data):
    data = workspace_data
    owned = data["client"].get("/api/v2/meta-connections", headers=data["headers"])
    assert owned.status_code == 200
    assert owned.json()["data"][0]["id"] == data["credential"]
    assert owned.json()["data"][0]["ad_account_id"] == "act_123"
    assert (
        "test-workspace-token" not in owned.text
        and "encrypted_access_token" not in owned.text
    )
    assert (
        data["client"]
        .get("/api/v2/meta-connections", headers=data["user_headers"])
        .json()["data"]
        == []
    )
