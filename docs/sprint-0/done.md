# Sprint 0 — Done

Completed 2026-07-21. All tasks from `docs/sprint-0/plan.md` are implemented
and verified (not just claimed) — every item in that plan's verification
checklist was actually run, not just read.

## What changed vs. the original plan (things discovered during execution)

The plan assumed the security gap was limited to `dashboard.py` and
`research.py`. It was much larger: `ad_remix.py`, `ad_styles.py`,
`copy_generation.py`, `prompts.py`, `uploads.py`, and three more routes in
`research.py` (`/brand-scrapes*`) were also completely public. Found via a
small script that scanned every `@router.*` decorator in `backend/app/api/v1/`
for a missing `get_current_active_user`/`get_current_superuser`/`require_*`
dependency, cross-checked against `auth.py` (intentionally public:
login/register). Fixed all of them — 33 routes gated in total, not the ~9 the
plan named explicitly.

One frontend caller needed a matching fix: `frontend/src/pages/Settings.jsx`
called `/prompts` and `/ad-styles` with plain `fetch()` (no Authorization
header) — every other page already used the existing `authFetch` from
`useAuth()` (`context/AuthContext.jsx`). Updated `Settings.jsx` to use the same
pattern instead of inventing a new one.

## Docker Compose — bigger rabbit hole than expected

`docker compose up` on a genuinely fresh database failed on the very first
migration. Root cause: none of the 16 existing Alembic migrations ever created
a table — they were all `ALTER`/incremental `CREATE TABLE` statements written
against a schema that was always bootstrapped via `Base.metadata.create_all()`
in `init_db.py`. Railway's actual deploy (`railway.toml` `startCommand`)
doesn't run `alembic upgrade head` at all (it overrides the Dockerfile's CMD),
so this had never been exercised end-to-end before.

Fix: squashed the 16 migrations into one baseline
(`alembic/versions/fba8f217905e_initial_schema_baseline.py`) that creates the
full current schema via `Base.metadata.create_all()`. The 16 original files are
kept for reference only in `backend/_superseded_migrations_reference/`
(outside Alembic's scan path, so they're never executed). Any new schema
change from here on is a normal new migration on top of this baseline.

Also hit two Docker Compose pitfalls worth remembering (see
`/memories/repo/` — will be added to `nalarin-package-notes.md` or similar):
- List-type keys (`ports`, `volumes`) MERGE across `-f a.yml -f b.yml`, they do
  not replace. An override that only adds `ports: [...]` will leak the base
  file's ports too. `!reset` didn't behave as documented in this Compose
  version when tested. Safest fix: make prod a fully standalone compose file
  instead of an overlay.
- If a service's `image:` name collides with a real upstream image tag (e.g.
  reusing `node:20-alpine` as both a pulled base image and a locally-built
  service name), Compose can retag your build output ON TOP of the real
  upstream image in the local cache, silently corrating it for every other
  project on the machine that references that tag. Always give
  custom-built services their own distinct image name.

Final files: `docker-compose.yml` (dev, port 8010 for backend — 8000 was
already taken by an unrelated `kw-dryrun-api-1` container on this machine —
and 5173 for frontend), `docker-compose.prod.yml` (standalone, port 3024,
nginx serves the built frontend and proxies `/api`+`/uploads` to the backend
container internally — only port 3024 is published to the host).

## Verified end-to-end (not just unit tested)

- `docker compose up` (dev): postgres healthy, backend migrates + serves
  `/health` 200, frontend serves 200 on 5173.
- `docker compose -f docker-compose.prod.yml up -d`: same, through nginx on
  3024 only — `/`, `/health`, and `/api/v1/dashboard/stats` (401 without auth)
  all verified through the single public port.
- Full pytest suite: 104 passed, 1 xpassed (0 failed) after fixing a
  pre-existing test-isolation bug (see below) — includes 5 new tests for the
  `ApiKey`/`require_api_key_scope` mechanism.
- `OAUTH_TOKEN_ENCRYPTION_KEY` missing → app fails at import time with a clear
  message (confirmed by unsetting it and importing `app.core.token_encryption`
  directly).
- `pip install -r requirements.txt` with `google-ads` added resolves with zero
  conflicts (`pip check` clean) on Python 3.11.15.

## Pre-existing bug fixed as a side effect

The full test suite originally failed 6+ tests with `429 Too Many Requests`.
Root cause (unrelated to anything in this sprint): `tests/conftest.py`'s
`auth_headers` fixture is function-scoped and calls `/api/v1/auth/login/json`
fresh for every test that uses it; combined with the 5/minute login rate limit
and every `TestClient` request sharing one fake IP, the limiter was already
exhausted partway through a full `pytest tests/` run. Fixed with an `autouse`
fixture that calls `limiter.reset()` before each test — test-only, no
production behavior changed.

## Deliberate behavior changes vs. upstream fork

- `FacebookService.create_ad` now defaults to `PAUSED` (was `ACTIVE`) — matches
  the safety convention Sprint 1/3 use for Google/TikTok: a new ad must never
  start spending without an explicit human decision to activate it.
- `TRUSTED_PROXIES` now defaults to `127.0.0.1` (was `*`) — a wildcard let any
  client spoof `X-Forwarded-For`/`X-Forwarded-Proto`.
- Added a `Content-Security-Policy` header in `app/main.py`.

## New shared infrastructure (used starting Sprint 1)

- `app/core/oauth_state.py` — signed, short-lived OAuth state token + cookie
  helpers, used by Google Ads (Sprint 1) and TikTok Ads (Sprint 3) OAuth flows.
- `app/core/token_encryption.py` — Fernet helper for encrypting stored OAuth
  tokens at rest (`OAUTH_TOKEN_ENCRYPTION_KEY` env var).
- `ApiKey` model + `require_api_key_scope()` dependency (`app/core/deps.py`) —
  scoped (`ads:read`, `ads:draft` only — `ads:publish`/`ads:spend` do not exist
  as bot scopes, enforced in code) machine-to-machine auth for the Sprint 4
  Hermes Telegram bot. Minting script: `backend/scripts/create_api_key.py`.
- `GoogleAdsConnection` model — added now (alongside `ApiKey`) so Sprint 1
  starts directly on the OAuth/service work instead of a schema task.
- `FacebookService.get_campaign_insights()` — spend/impressions/clicks/
  conversions via the Graph API `insights` edge, unblocks Sprint 2's
  cross-platform Overview page for the Meta side.

## Still true / carried forward unchanged

- Fernet key env var name: `OAUTH_TOKEN_ENCRYPTION_KEY` (generated value lives
  in the local `.env` only, never committed).
- Bot auth architecture decided: scoped `ApiKey` (not a service-account user)
  — matches the pattern already used for MedSos's Telegram bot.
