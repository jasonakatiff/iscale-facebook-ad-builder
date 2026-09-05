"""Tests for the machine-to-machine API key dependency (app.core.deps.require_api_key_scope)."""
import secrets
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.core.deps import require_api_key_scope, _hash_api_key
from app.models import ApiKey


@pytest.fixture
def api_key_app(db_session):
    """A tiny standalone app exposing one route per scope, wired to the real DB session."""
    app = FastAPI()

    @app.get("/read-only")
    def read_only(key: ApiKey = Depends(require_api_key_scope("ads:read"))):
        return {"ok": True}

    @app.get("/draft-only")
    def draft_only(key: ApiKey = Depends(require_api_key_scope("ads:draft"))):
        return {"ok": True}

    from app.database import get_db
    app.dependency_overrides[get_db] = lambda: db_session
    return app


def _make_key(db_session, scopes):
    raw = "ads_studio_test_" + secrets.token_urlsafe(24)
    db_session.add(ApiKey(name="test key", key_hash=_hash_api_key(raw), scopes=scopes))
    db_session.commit()
    return raw


class TestApiKeyScopes:
    def test_missing_header_is_401(self, api_key_app):
        client = TestClient(api_key_app)
        response = client.get("/read-only")
        assert response.status_code == 401

    def test_unknown_key_is_401(self, api_key_app):
        client = TestClient(api_key_app)
        response = client.get("/read-only", headers={"Authorization": "Bearer nope"})
        assert response.status_code == 401

    def test_read_scope_allows_read_route(self, api_key_app, db_session):
        raw = _make_key(db_session, ["ads:read"])
        client = TestClient(api_key_app)
        response = client.get("/read-only", headers={"Authorization": f"Bearer {raw}"})
        assert response.status_code == 200

    def test_read_only_key_is_403_on_draft_route(self, api_key_app, db_session):
        """The core safety guarantee: a key scoped to ads:read only must never
        be usable on an ads:draft (or higher) route."""
        raw = _make_key(db_session, ["ads:read"])
        client = TestClient(api_key_app)
        response = client.get("/draft-only", headers={"Authorization": f"Bearer {raw}"})
        assert response.status_code == 403

    def test_revoked_key_is_401(self, api_key_app, db_session):
        from datetime import datetime, timezone
        raw = "ads_studio_test_" + secrets.token_urlsafe(24)
        key = ApiKey(name="revoked", key_hash=_hash_api_key(raw), scopes=["ads:read"], revoked_at=datetime.now(timezone.utc))
        db_session.add(key)
        db_session.commit()
        client = TestClient(api_key_app)
        response = client.get("/read-only", headers={"Authorization": f"Bearer {raw}"})
        assert response.status_code == 401
