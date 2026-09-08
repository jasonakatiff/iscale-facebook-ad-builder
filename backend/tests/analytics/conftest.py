import os
from urllib.parse import urlsplit
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.analytics import models
from app.models import User


@pytest.fixture(scope="session")
def analytics_engine():
    url = os.environ["DATABASE_URL"]
    p = urlsplit(url)
    assert p.hostname in {"localhost", "127.0.0.1"} and p.path.startswith(
        "/test_delivery_"
    )
    e = create_engine(url)
    Base.metadata.create_all(e)
    yield e
    e.dispose()


@pytest.fixture
def analytics_db(analytics_engine):
    with sessionmaker(bind=analytics_engine, expire_on_commit=False)() as db:
        yield db
    with analytics_engine.begin() as c:
        c.execute(
            text(
                "TRUNCATE "
                + ",".join('"' + t.name + '"' for t in Base.metadata.sorted_tables)
                + " CASCADE"
            )
        )


@pytest.fixture
def analytics_owner(analytics_db):
    u = User(
        id="test-analytics-owner",
        email="test-analytics-owner@example.com",
        hashed_password="test-unused",
        is_active=True,
        is_superuser=True,
        name="test-analytics-owner",
    )
    analytics_db.add(u)
    analytics_db.commit()
    return u
