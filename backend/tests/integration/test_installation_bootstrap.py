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


def test_setup_command_preserves_owner_and_encrypted_provider_on_rerun(bootstrap_env):
    engine, env = bootstrap_env
    env = {**env, "AD_STUDIO_PYTHON": sys.executable}

    def setup(values):
        result = subprocess.run(["bash", str(ROOT.parent / "setup.sh"), "--skip-install"],
                                cwd=ROOT, env=values, capture_output=True, text=True, timeout=60)
        assert result.returncode == 0, result.stderr
        assert "database setup complete" in result.stdout
        for key in ("SECRET_KEY", "OAUTH_TOKEN_ENCRYPTION_KEY", "ADMIN_PASSWORD"):
            if values.get(key):
                assert values[key] not in result.stdout + result.stderr

    setup(env)
    with engine.connect() as conn:
        owner = conn.execute(text("SELECT id, email, hashed_password FROM users")).one()
        assert owner.email == env["ADMIN_EMAIL"]
        state = conn.execute(text("SELECT initialized, setup_status FROM installation_state")).one()
        assert state.initialized and state.setup_status == "pending"

    save = subprocess.run([sys.executable, "-c", """
from app.database import SessionLocal
from app.models import User
from app.services.provider_settings import save_provider_key
with SessionLocal() as db:
    save_provider_key(db, 'gemini', 'test-preserved-provider-key', db.query(User).one().id)
"""], cwd=ROOT, env=env, capture_output=True, text=True, timeout=30)
    assert save.returncode == 0, save.stderr
    with engine.connect() as conn:
        encrypted = conn.execute(text("SELECT encrypted_key FROM provider_connections WHERE provider='gemini'")).scalar_one()
        assert encrypted != "test-preserved-provider-key"

    setup({**env, "ADMIN_EMAIL": "test-replacement@example.com",
           "ADMIN_PASSWORD": "test-replacement-password"})
    setup({key: value for key, value in env.items() if key not in {"ADMIN_EMAIL", "ADMIN_PASSWORD"}})
    with engine.connect() as conn:
        assert conn.execute(text("SELECT id, email, hashed_password FROM users")).all() == [owner]
        assert conn.execute(text("SELECT encrypted_key FROM provider_connections WHERE provider='gemini'")).scalar_one() == encrypted
    decrypt = subprocess.run([sys.executable, "-c", """
from app.services.provider_settings import require_provider_key
assert require_provider_key('gemini') == 'test-preserved-provider-key'
"""], cwd=ROOT, env=env, capture_output=True, text=True, timeout=30)
    assert decrypt.returncode == 0, decrypt.stderr
