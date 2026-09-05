# PR3 backend verification — 2026-09-04

All 12 specification items completed in this worktree. No push. No production database or provider API writes. Reserved paths unchanged.

## Fix traceability

| Item | Result | Commit | Source |
| --- | --- | --- | --- |
| 1 | Restored all 16 original migrations; removed replacement baseline; additive API key/Google tables; nullable refresh hash and legacy token retained; contract migration excluded from versions | acba08c | alembic/versions/b7c2d91e4a10_add_tiktok_ads_connections.py:14; alembic/versions/d5f6a7b8c9d0_add_api_keys_and_google_ads_connections.py:15; alembic/versions/a1d2e3f4b5c6_hash_refresh_tokens.py:19; app/models.py:96; alembic/pending/z9_drop_refresh_token_plaintext.py:1 |
| 2 | Shared active-user Meta connection resolver with env-token fallback | a10e8fe, 3bbf27f | app/services/facebook_service.py:710; app/api/v1/facebook.py:33; app/api/v1/overview.py:50 |
| 3 | Required matching OAuth cookie for all three providers; expire cookies on callback success/error; HTTPS cookies support separate frontend sites | 3bbf27f | app/api/v1/google_ads.py:123; app/api/v1/facebook.py:70; app/api/v1/tiktok_ads.py:93; app/main.py:43; app/core/oauth_state.py:75 |
| 4 | campaigns:write required on every Google/TikTok campaign/keyword write; confirmation and connection checked before provider configuration | 3bbf27f | app/api/v1/google_ads.py:382; app/api/v1/tiktok_ads.py:223 |
| 5 | Bot connections restricted to API key owner; unbound keys rejected | 3bbf27f | app/api/v1/bot.py:24 |
| 6 | Meta short-lived token exchanged for long-lived token; returned expiry retained | a10e8fe | app/services/meta_ads_oauth.py:42 |
| 7 | SDK init return value retained; all SDK constructors explicitly receive instance API | a10e8fe | app/services/facebook_service.py:35 |
| 8 | Active selection persists for all three providers with synchronized bulk updates | 3bbf27f | app/api/v1/google_ads.py:262; app/api/v1/facebook.py:177; app/api/v1/tiktok_ads.py:189 |
| 9 | Railway proxy wildcard restored; docs/redoc/OpenAPI exclude CSP | 3bbf27f | app/main.py:53; app/main.py:69 |
| 10 | All eight requested TikTok presets resolved consistently in campaigns and overview | 3bbf27f | app/api/v1/tiktok_ads.py:55; app/api/v1/overview.py:105 |
| 11 | BreadWinner restored as default brand | 0d0d47a | app/core/config.py:11 |
| 12 | Encryption test key set in CI and conftest before application import | 0d0d47a | ../.github/workflows/test.yml:52; tests/conftest.py:12 |

## Tests

Used the supplied venv Python (3.12.13), PostgreSQL 15.15, and the exact supplied test environment. No packages installed.

From backend/: `python -m pytest -q -p no:cacheprovider`

```text
214 passed, 1 xpassed, 1 warning in 70.94s (0:01:10)
```

The existing XPASS and Pydantic `ImageGenerationRequest.copy` shadowing warning are unchanged. The seven original `TestGoogleAdsWriteConfirmationGuard` assertions remain unchanged: their failures were caused by configuration validation preceding confirmation/connection checks.

With `OAUTH_TOKEN_ENCRYPTION_KEY` unset, conftest fallback verified by docs tests:

```text
3 passed, 11 deselected, 1 warning in 1.18s
```

Plan gate: the global script is specific to root TypeScript projects (3/4). Worktree-local `.claude/scripts/validate-python-plan.sh` checks the same four requirements against backend Python tests and passes 4/4.

## Migration acceptance output

Command from backend/: `python tests/migrations/verify_pr3_migrations.py`

The verifier creates isolated local codex_pr3 databases, uses actual `origin/main` models for the production-style schema, compares new tables against current models (columns, types, nullability, defaults, primary keys, indexes and foreign keys), reruns additive upgrades, and exercises real login/refresh routes. It drops its disposable databases in a finally block.

```text
Empty database detected; creating the current application schema
Creating database tables...
Tables created successfully!
Fresh database schema created and stamped at Alembic head
  Created permission: brands:read
  Created permission: brands:write
  Created permission: brands:delete
  Created permission: products:read
  Created permission: products:write
  Created permission: products:delete
  Created permission: ads:read
  Created permission: ads:write
  Created permission: ads:delete
  Created permission: campaigns:read
  Created permission: campaigns:write
  Created permission: campaigns:delete
  Created permission: templates:read
  Created permission: templates:write
  Created permission: templates:delete
  Created permission: users:read
  Created permission: users:write
  Created role: admin
  Created role: manager
  Created role: editor
  Created role: viewer
Roles and permissions seeded successfully!
ADMIN_EMAIL and ADMIN_PASSWORD are not set; skipping admin creation
(a) PASS: empty bootstrap_database() succeeded; head=a1d2e3f4b5c6
(b) PASS: origin/main create_all + stamp add_page_fields_001 + upgrade head=a1d2e3f4b5c6
    api_keys, google_ads_connections, meta_ads_connections, tiktok_ads_connections present; model schemas match; token/token_hash nullable; unique hash index; additive upgrades idempotent
✅ Connected to PostgreSQL
   Version: PostgreSQL 15.15 (Homebrew) on aarch64-apple-darwin24.6.0, compiled by Apple clang version 17.0.0 (clang-1700.4.4.1), 64-bit
(c) PASS: legacy plaintext row retained; old refresh=401; new login=200; hash-only storage; new refresh=200; replay=401
Cleanup: disposable codex_pr3 databases dropped
```

## Remaining notes

The plaintext-drop migration intentionally remains in `alembic/pending/` for a later release, as specified. No implementation blockers. Changes were not deployed or pushed.
