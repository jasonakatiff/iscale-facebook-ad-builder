import os
from urllib.parse import urlsplit

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

url = os.environ.get("DATABASE_URL", "")
parsed = urlsplit(url)
if parsed.hostname not in {"127.0.0.1", "localhost"} or not parsed.path.startswith(
    "/test_delivery_"
):
    raise RuntimeError(
        "Use a localhost test_delivery_* database; shared data is forbidden"
    )

from app.database import Base
from app import models
from app.creatives import models as creative_models


@pytest.fixture(scope="session")
def engine():
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def sessions(engine):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    with engine.begin() as conn:
        names = ", ".join(
            '"' + table.name + '"' for table in Base.metadata.sorted_tables
        )
        conn.execute(text("TRUNCATE " + names + " CASCADE"))


@pytest.fixture
def buyer(sessions):
    with sessions() as db:
        user = models.User(
            id="test-buyer",
            email="test-buyer@example.com",
            name="test-buyer",
            hashed_password="test-unused",
            is_active=True,
            is_superuser=True,
        )
        db.add(user)
        db.commit()
        return user
