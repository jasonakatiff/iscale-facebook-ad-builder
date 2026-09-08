from urllib.parse import urlsplit
import os
import pytest


@pytest.fixture(autouse=True)
def isolated_database_only():
    target = urlsplit(os.environ["DATABASE_URL"])
    if target.hostname not in {"localhost", "127.0.0.1"} or not target.path.startswith(
        "/test_"
    ):
        pytest.fail(
            "Telemetry tests require a localhost database named test_*; shared data is forbidden."
        )


@pytest.fixture
def anyio_backend():
    return "asyncio"
