"""Run from backend with the supplied test env; creates/drops only local codex_ DBs.

Uses origin/main models to reproduce the owner's stamped production schema.
This standalone acceptance check is separate from pytest because CI checkouts
need not contain origin/main and ordinary tests need no CREATEDB privilege.
"""
import os
from pathlib import Path
import subprocess
import sys
import uuid

import psycopg2
from psycopg2 import sql

BACKEND = Path(__file__).resolve().parents[2]
HEAD = "a1d2e3f4b5c6"


def run(database, code):
    env = dict(os.environ, DATABASE_URL=f"postgresql://localhost:5432/{database}", PYTHONDONTWRITEBYTECODE="1")
    result = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=env, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout.strip()


def main():
    suffix = uuid.uuid4().hex[:10]
    empty_db, prod_db = f"codex_pr3_empty_{suffix}", f"codex_pr3_prod_{suffix}"
    admin = psycopg2.connect("postgresql://localhost:5432/postgres")
    admin.autocommit = True
    created = []
    try:
        with admin.cursor() as cursor:
            for database in (empty_db, prod_db):
                cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
                created.append(database)
        print(run(empty_db, f'''
from startup import bootstrap_database
from app.database import engine
from sqlalchemy import text
bootstrap_database()
with engine.connect() as conn:
    head = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
assert head == {HEAD!r}, head
print("(a) PASS: empty bootstrap_database() succeeded; head=" + head)
'''))
        run(prod_db, '''
import subprocess, sys, types
from datetime import datetime, timedelta, timezone
from app.database import Base, engine, SessionLocal
from app.core.security import get_password_hash
upstream = types.ModuleType("test_upstream_models")
sys.modules[upstream.__name__] = upstream
exec(subprocess.check_output(["git", "show", "origin/main:backend/app/models.py"], text=True), upstream.__dict__)
Base.metadata.create_all(engine)
with SessionLocal() as db:
    user = upstream.User(id="test-migration-user", email="test-migration@example.com", name="test-migration", hashed_password=get_password_hash("test-password"), is_active=True)
    db.add(user)
    db.flush()
    db.add(upstream.RefreshToken(id="test-legacy-row", user_id=user.id, token="test-legacy-refresh", expires_at=datetime.now(timezone.utc) + timedelta(days=7)))
    db.commit()
''')
        print(run(prod_db, f'''
from alembic import command
from alembic.config import Config
from app.database import engine
from app.models import ApiKey, GoogleAdsConnection
from sqlalchemy import inspect, text
config = Config("alembic.ini")
command.stamp(config, "add_page_fields_001")
command.upgrade(config, "head")
inspector = inspect(engine)
required = {{"api_keys", "google_ads_connections", "meta_ads_connections", "tiktok_ads_connections"}}
assert required <= set(inspector.get_table_names())
columns = {{c["name"]: c for c in inspector.get_columns("refresh_tokens")}}
assert columns["token_hash"]["nullable"] and columns["token"]["nullable"]
assert any(i["column_names"] == ["token_hash"] and i["unique"] for i in inspector.get_indexes("refresh_tokens"))
for model in (ApiKey, GoogleAdsConnection):
    table = model.__table__
    actual = {{c["name"]: c for c in inspector.get_columns(table.name)}}
    assert set(actual) == set(table.columns.keys())
    for col in table.columns:
        assert actual[col.name]["nullable"] == col.nullable, col.name
        assert str(actual[col.name]["type"]) == str(col.type.compile(engine.dialect)), col.name
        expected_default = str(col.server_default.arg) if col.server_default is not None else None
        assert actual[col.name]["default"] == expected_default, col.name
    assert inspector.get_pk_constraint(table.name)["constrained_columns"] == ["id"]
    expected_indexes = {{(i.name, tuple(c.name for c in i.columns), bool(i.unique)) for i in table.indexes}}
    actual_indexes = {{(i["name"], tuple(i["column_names"]), bool(i["unique"])) for i in inspector.get_indexes(table.name)}}
    assert actual_indexes == expected_indexes, (actual_indexes, expected_indexes)
    fk = inspector.get_foreign_keys(table.name)[0]
    expected_fk = next(iter(table.foreign_keys))
    assert fk["referred_table"] == "users" and fk["referred_columns"] == ["id"]
    assert fk["constrained_columns"] == [expected_fk.parent.name]
    assert fk["options"]["ondelete"] == expected_fk.ondelete
with engine.connect() as conn:
    assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == {HEAD!r}
    assert conn.execute(text("SELECT token FROM refresh_tokens WHERE id='test-legacy-row'")).scalar_one() == "test-legacy-refresh"
# Re-run every additive migration over already-created tables/columns.
command.stamp(config, "add_page_fields_001")
command.upgrade(config, "head")
print("(b) PASS: origin/main create_all + stamp add_page_fields_001 + upgrade head=" + {HEAD!r})
print("    api_keys, google_ads_connections, meta_ads_connections, tiktok_ads_connections present; model schemas match; token/token_hash nullable; unique hash index; additive upgrades idempotent")
'''))
        print(run(prod_db, '''
from fastapi.testclient import TestClient
from sqlalchemy import text
from app.main import app
from app.database import engine
from app.core.rate_limit import limiter
from app.core.security import hash_refresh_token
limiter.enabled = False
with TestClient(app) as client:
    legacy = client.post("/api/v1/auth/refresh", json={"refresh_token": "test-legacy-refresh"})
    assert legacy.status_code == 401, legacy.text
    login = client.post("/api/v1/auth/login/json", json={"email": "test-migration@example.com", "password": "test-password"})
    assert login.status_code == 200, login.text
    fresh = login.json()["refresh_token"]
    with engine.connect() as conn:
        row = conn.execute(text("SELECT token, token_hash FROM refresh_tokens WHERE token_hash=:hash"), {"hash": hash_refresh_token(fresh)}).one()
        assert row.token is None and row.token_hash != fresh
        assert conn.execute(text("SELECT count(*) FROM refresh_tokens WHERE id='test-legacy-row' AND token_hash IS NULL")).scalar_one() == 1
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": fresh})
    assert refreshed.status_code == 200, refreshed.text
    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": fresh})
    assert replay.status_code == 401, replay.text
print("(c) PASS: legacy plaintext row retained; old refresh=401; new login=200; hash-only storage; new refresh=200; replay=401")
'''))
    finally:
        with admin.cursor() as cursor:
            for database in created:
                cursor.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database)))
        admin.close()
        print("Cleanup: disposable codex_pr3 databases dropped")


if __name__ == "__main__":
    main()
