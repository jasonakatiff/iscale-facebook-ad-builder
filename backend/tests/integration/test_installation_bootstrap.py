"""Exercise real startup in separate processes and an isolated empty database."""
import os
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def bootstrap_env():
    url = os.environ["TEST_INSTALL_BOOTSTRAP_URL"]
    engine = create_engine(url)
    assert engine.url.host in {"localhost", "127.0.0.1"}
    assert engine.url.database.startswith("test_")
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    env = {**os.environ, "DATABASE_URL": url,
           "ADMIN_EMAIL": "test-owner@example.com", "ADMIN_PASSWORD": "test-owner-password-123"}
    yield engine, env
    engine.dispose()


def run_bootstrap(env):
    return subprocess.run([sys.executable, "-c", "from startup import bootstrap_database; bootstrap_database()"],
                          cwd=ROOT, env=env, capture_output=True, text=True, timeout=60)


def test_fresh_install_consumes_bootstrap_once(bootstrap_env):
    engine, env = bootstrap_env
    first = run_bootstrap(env)
    assert first.returncode == 0, first.stderr
    again = run_bootstrap({**env, "ADMIN_EMAIL": "test-attacker@example.com"})
    assert again.returncode == 0, again.stderr
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 1
        row = conn.execute(text("SELECT initialized, setup_status FROM installation_state")).one()
        assert row.initialized and row.setup_status == "pending"


def test_concurrent_starts_create_one_owner(bootstrap_env):
    engine, env = bootstrap_env
    processes = [subprocess.Popen([sys.executable, "-c", "from startup import bootstrap_database; bootstrap_database()"],
                                   cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                 for _ in range(2)]
    for process in processes:
        _, errors = process.communicate(timeout=60)
        assert process.returncode == 0, errors
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 1


def test_missing_credentials_fail_actionably_then_recover(bootstrap_env):
    engine, env = bootstrap_env
    failed = run_bootstrap({**env, "ADMIN_PASSWORD": ""})
    assert failed.returncode != 0
    assert "ADMIN_EMAIL and ADMIN_PASSWORD" in failed.stderr
    success = run_bootstrap(env)
    assert success.returncode == 0, success.stderr
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 1
