import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import MagicMock, patch

# For tests, use a SEPARATE dev database to avoid polluting production
# Set TEST_DATABASE_URL env var or fallback to dev database

from app.main import app
from app.database import Base, get_db
from app.models import User, Role
from app.core.security import get_password_hash
from app.core.config import settings
from app.core.rate_limit import limiter

# Use DATABASE_URL from env (CI sets this to localhost postgres)
# No fallback - DATABASE_URL must be set
TEST_DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    raise ValueError("DATABASE_URL or TEST_DATABASE_URL environment variable required for tests")
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Reset slowapi's limiter before every test.

    All TestClient requests share one fake client IP, so rate-limited routes
    (e.g. 5/minute on login) get exhausted after only a handful of tests in
    the same session — regardless of whether they call login directly or via
    the `auth_headers` fixture. This only resets the test process's in-memory
    limiter state; it has no effect on production.
    """
    limiter.reset()
    yield


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test.

    Note: Uses PostgreSQL. Tables are not dropped after tests to preserve
    production data. Test user is cleaned up individually.
    """
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        # Clean up test data (don't drop tables in production DB)
        # Delete test user if it exists
        from app.models import User, RefreshToken
        test_user = session.query(User).filter(User.email == "test@example.com").first()
        if test_user:
            session.query(RefreshToken).filter(RefreshToken.user_id == test_user.id).delete()
            session.delete(test_user)
            session.commit()
        session.close()


@pytest.fixture(scope="function")
def client(db_session):
    """Create test client with database override."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session):
    """Create a test user with admin role and all permissions."""
    from app.models import Permission

    # Get or create permissions
    def get_or_create_permission(name, description):
        perm = db_session.query(Permission).filter(Permission.name == name).first()
        if not perm:
            perm = Permission(name=name, description=description)
            db_session.add(perm)
        return perm

    # Create all permissions needed for tests
    all_permissions = [
        ("campaigns:write", "Write campaigns"),
        ("ads:write", "Write ads"),
        ("ads:delete", "Delete ads"),
        ("brands:write", "Write brands"),
        ("brands:delete", "Delete brands"),
        ("products:write", "Write products"),
        ("products:delete", "Delete products"),
        ("profiles:write", "Write profiles"),
        ("profiles:delete", "Delete profiles"),
    ]

    permissions = []
    for name, desc in all_permissions:
        perm = get_or_create_permission(name, desc)
        permissions.append(perm)
    db_session.commit()

    # Get or create admin role with all permissions
    admin_role = db_session.query(Role).filter(Role.name == "admin").first()
    if not admin_role:
        admin_role = Role(name="admin", description="Administrator")
        for perm in permissions:
            admin_role.permissions.append(perm)
        db_session.add(admin_role)
        db_session.commit()
    else:
        # Ensure admin role has all permissions
        for perm in permissions:
            if perm not in admin_role.permissions:
                admin_role.permissions.append(perm)
        db_session.commit()

    # Clean up any existing test user
    existing_user = db_session.query(User).filter(User.email == "test@example.com").first()
    if existing_user:
        from app.models import RefreshToken
        db_session.query(RefreshToken).filter(RefreshToken.user_id == existing_user.id).delete()
        db_session.delete(existing_user)
        db_session.commit()

    # Create test user
    user = User(
        email="test@example.com",
        hashed_password=get_password_hash("testpassword"),
        name="Test User",
        is_active=True
    )
    user.roles.append(admin_role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(client, test_user):
    """Get authentication headers for test user."""
    response = client.post(
        "/api/v1/auth/login/json",
        json={"email": "test@example.com", "password": "testpassword"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_facebook_service(client):
    """Mock FacebookService for testing."""
    from app.api.v1.facebook import get_facebook_service

    service = MagicMock()
    service.api = MagicMock()

    def override_get_facebook_service():
        return service

    app.dependency_overrides[get_facebook_service] = override_get_facebook_service
    yield service
    # Clean up the override
    if get_facebook_service in app.dependency_overrides:
        del app.dependency_overrides[get_facebook_service]
