"""M1c management reads use real API/auth/PostgreSQL and explicit scopes."""

import pytest
from app.models import User
from app.models import MetaAdsConnection, WorkspaceAccount
from app.core.token_encryption import encrypt_token

from tests.workspace_fixtures import workspace_data, member, grant  # noqa: F401


def get(data, suffix, headers=None):
    return data["client"].get(
        f"/api/v2/workspaces/{data['workspace']}/{suffix}",
        headers=headers or data["headers"],
    )


@pytest.mark.parametrize(
    "role,allowed", [("viewer", False), ("buyer", True), ("admin", True)]
)
def test_membership_role_and_effective_account_capability(
    workspace_data, role, allowed
):
    data = workspace_data
    member(data, role)
    grant(data, True)
    workspaces = (
        data["client"].get("/api/v2/workspaces", headers=data["user_headers"]).json()
    )
    assert workspaces["data"][0]["role"] == role
    account = get(data, "connections", data["user_headers"]).json()["data"][0]
    assert account["can_sync"] is allowed
    assert account["account_name"] == "test-private-account"
    grant(data, False)
    assert (
        get(data, "connections", data["user_headers"]).json()["data"][0]["can_sync"]
        is False
    )


def test_management_reads_paginate_and_hide_other_workspaces(workspace_data):
    data = workspace_data
    member(data)
    members = get(data, "members?limit=1").json()
    assert members["pagination"]["total"] == 2
    assert members["pagination"]["hasMore"] is True
    assert set(members["data"][0]) == {
        "user_id",
        "name",
        "email",
        "role",
        "is_active",
        "user_active",
    }
    accounts = get(data, "managed-connections").json()["data"]
    assert len(accounts) == 1 and accounts[0]["id"] == data["account"]
    assert "token" not in str(accounts)
    grants = get(data, f"accounts/{data['account']}/grants").json()["data"]
    other = next(row for row in grants if row["user_id"] == data["user"])
    assert other["is_active"] is False and other["can_sync"] is False
    foreign = data["client"].get(
        f"/api/v2/workspaces/{data['other_workspace']}/accounts/{data['account']}/grants",
        headers=data["headers"],
    )
    assert foreign.status_code == 404
    for suffix in [
        "members",
        "managed-connections",
        f"accounts/{data['account']}/grants",
        "member-candidates",
    ]:
        assert get(data, suffix, data["user_headers"]).status_code == 403


def test_admin_can_restore_grants_without_implicit_snapshot_access(workspace_data):
    data = workspace_data
    member(data, "admin")
    assert get(data, "connections", data["user_headers"]).json()["data"] == []
    assert get(data, "managed-connections", data["user_headers"]).status_code == 200
    assert (
        get(
            data, f"accounts/{data['account']}/grants", data["user_headers"]
        ).status_code
        == 200
    )
    assert (
        data["client"]
        .get(
            f"/api/v2/accounts/{data['account']}/snapshot", headers=data["user_headers"]
        )
        .status_code
        == 404
    )
    assert get(data, "member-candidates", data["user_headers"]).status_code == 403
    data["db"].get(User, data["admin"]).is_superuser = True
    data["db"].commit()
    candidates = get(data, "member-candidates?limit=1").json()
    assert candidates["pagination"]["hasMore"] is True
    assert set(candidates["data"][0]) == {"user_id", "name", "email"}


def test_reconnect_requires_owned_grant_for_same_registered_account(workspace_data):
    data = workspace_data
    member(data, "admin")
    path = f"/api/v2/workspaces/{data['workspace']}/connections/{data['account']}"
    body = {"meta_connection_id": data["credential"]}
    assert (
        data["client"].put(path, json=body, headers=data["user_headers"]).status_code
        == 404
    )
    credential = data["db"].get(MetaAdsConnection, data["credential"])
    replacement = MetaAdsConnection(
        user_id=data["admin"],
        ad_account_id="act_456",
        account_name="test-replacement",
        encrypted_access_token=encrypt_token("test-new-token"),
        access_token_expires_at=credential.access_token_expires_at,
    )
    data["db"].add(replacement)
    data["db"].commit()
    body = {"meta_connection_id": replacement.id}
    assert (
        data["client"].put(path, json=body, headers=data["headers"]).status_code == 409
    )
    data["db"].delete(credential)
    data["db"].flush()
    replacement.ad_account_id = "act_123"
    data["db"].commit()
    response = data["client"].put(path, json=body, headers=data["headers"])
    assert response.status_code == 200
    assert response.json()["state"] == "connected"
    data["db"].expire_all()
    assert (
        data["db"].get(WorkspaceAccount, data["account"]).meta_connection_id
        == replacement.id
    )
