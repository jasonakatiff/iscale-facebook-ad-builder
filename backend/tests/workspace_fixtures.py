"""Real local PostgreSQL/auth setup for M1b acceptance tests."""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import uuid4

import pytest
from facebook_business.api import FacebookAdsApi

from app.core.security import get_password_hash
from app.core.token_encryption import encrypt_token
from app.models import MetaAdsConnection, User


@pytest.fixture
def workspace_data(client, db_session, test_user, auth_headers, monkeypatch):
    url = urlparse(str(db_session.bind.url))
    assert url.hostname in ("localhost", "127.0.0.1") and url.path.startswith("/test_")

    def deny_network(*args, **kwargs):
        raise AssertionError("Unexpected real Meta transport")

    monkeypatch.setattr(FacebookAdsApi, "call", deny_network)
    user = User(
        email=f"test-workspace-{uuid4()}@example.com",
        hashed_password=get_password_hash("test-workspace-password"),
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()
    credential = MetaAdsConnection(
        user_id=test_user.id,
        ad_account_id="act_123",
        account_name="test-private-account",
        encrypted_access_token=encrypt_token("test-workspace-token"),
        access_token_expires_at=datetime.now(timezone.utc) + timedelta(days=3),
        is_active=True,
    )
    db_session.add(credential)
    db_session.commit()
    response = client.post(
        "/api/v2/workspaces", json={"name": "test-workspace"}, headers=auth_headers
    )
    assert response.status_code == 201, response.text
    workspace = response.json()
    second = client.post(
        "/api/v2/workspaces",
        json={"name": "test-other-workspace"},
        headers=auth_headers,
    )
    assert second.status_code == 201
    account = client.post(
        f"/api/v2/workspaces/{workspace['id']}/connections",
        json={"meta_connection_id": credential.id},
        headers=auth_headers,
    )
    assert account.status_code == 201, account.text
    login = client.post(
        "/api/v1/auth/login/json",
        json={"email": user.email, "password": "test-workspace-password"},
    )
    assert login.status_code == 200
    data = {
        "workspace": workspace["id"],
        "other_workspace": second.json()["id"],
        "account": account.json()["id"],
        "admin": test_user.id,
        "user": user.id,
        "headers": auth_headers,
        "user_headers": {"Authorization": "Bearer " + login.json()["access_token"]},
        "credential": credential.id,
        "client": client,
        "db": db_session,
    }
    yield data
    db_session.rollback()
    from app.models import Workspace

    for workspace_id in [data["workspace"], data["other_workspace"]]:
        row = db_session.get(Workspace, workspace_id)
        if row:
            db_session.delete(row)
    db_session.commit()
    db_session.delete(user)
    db_session.commit()


def member(data, role="buyer", active=True):
    result = data["client"].put(
        f"/api/v2/workspaces/{data['workspace']}/members/{data['user']}",
        json={"role": role, "is_active": active},
        headers=data["headers"],
    )
    assert result.status_code == 200, result.text
    return result


def grant(data, can_sync=True, active=True):
    result = data["client"].put(
        f"/api/v2/workspaces/{data['workspace']}/accounts/{data['account']}/grants/{data['user']}",
        json={"can_sync": can_sync, "is_active": active},
        headers=data["headers"],
    )
    assert result.status_code == 200, result.text
    return result
