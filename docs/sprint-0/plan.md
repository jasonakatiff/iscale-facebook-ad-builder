# Sprint 0 — Readiness & Security Pass

**Why this sprint exists**: an adversarial review (GPT-5.5, 2026-07-21) found that
Sprints 1-5 as originally written rested on false or undecided assumptions —
inherited public backend endpoints, nonexistent Docker Compose files, an
unimplemented OAuth state mechanism, an undecided bot-auth design, and a sprint
ordering bug (Sprint 4 depends on an MCP endpoint no earlier sprint creates). This
sprint closes those gaps so Sprints 1-5 can run without stopping for undecided
architecture. Full review kept in `docs/sprint-0/review-2026-07-21.md`.

**Goal**: Every assumption later sprints rely on is either true today or made true
by the end of this sprint.

## Tasks

1. **Fix inherited public backend endpoints (real security gap, predates this project)**
   - Add `current_user: User = Depends(get_current_active_user)` to every route in
     `backend/app/api/v1/dashboard.py` (currently `GET /api/v1/dashboard/stats` has
     no auth dependency at all)
   - Same fix for `backend/app/api/v1/research.py`: search, saved searches,
     blacklist edits, scheduled-search trigger, vertical creation, brand scrape
     creation — audit every route in the file, not just the ones named here
   - This is a pre-existing hole inherited from the fork, not something Sprint 1-3
     introduced — fix it now so the "login gate" requirement in PROJECT_BRIEF is
     actually true before we add more platforms on top

2. **Create Docker Compose from scratch (repo currently has Railway config only)**
   - `docker-compose.yml` (dev): `backend` (uvicorn --reload), `frontend` (vite dev
     server), `postgres` (named volume, no host port published)
   - `docker-compose.prod.yml`: `backend` (gunicorn/uvicorn workers, bound to
     `127.0.0.1:3024`), `frontend` (built static bundle served by the backend or a
     lightweight nginx container), `postgres` (isolated compose project name, e.g.
     `-p ads-studio`, never shared with `nalarin-postgres` or MedSos's Postgres)
   - Leave `railway.toml` / `RAILWAY_DEPLOYMENT.md` in place (harmless), but Docker
     Compose is now the actual deploy path per PROJECT_BRIEF Section 11
   - Verify locally: `docker compose up` boots all three services before Sprint 4
     touches real Caddy/cloudflared

3. **Shared OAuth utilities (used by Google in Sprint 1 and TikTok in Sprint 3 — build once)**
   - `backend/app/core/oauth_state.py`: signs a short-lived state token (HMAC with
     `SECRET_KEY`, embeds `user_id` + nonce + expiry), set as an `httpOnly`,
     `Secure`, `SameSite=Lax` cookie in `/oauth/start`, verified and bound to the
     same user in `/oauth/callback`. This is what makes the callback safe to skip
     the normal JWT dependency — the plan referenced this mechanism before it
     existed; it's built here first.
   - `backend/app/core/token_encryption.py`: Fernet helper. Env var name:
     `OAUTH_TOKEN_ENCRYPTION_KEY` (generate with `Fernet.generate_key()`). App must
     fail to start with a clear error if this key is missing or malformed —
     never silently fall back to storing tokens in plaintext.

4. **Bot / machine-to-machine auth design (decide now, not deferred to Sprint 4)**
   - New `ApiKey` model in `backend/app/models.py`: `id, name, key_hash (sha256),
     scopes (JSON list), created_at, last_used_at, revoked_at, created_by_user_id`
     — same shape as the hash-at-rest / scoped / revocable pattern used elsewhere
     in NALARIN for issued API keys
   - New dependency `get_api_key_principal` in `backend/app/core/deps.py`:
     validates `Authorization: Bearer <key>` against `key_hash`, rejects revoked
     keys, enforces the route's required scope
   - Scopes for this project: `ads:read`, `ads:draft` only. **`ads:publish` /
     `ads:spend` scopes do not exist for bot keys** — this is enforced in the route
     dependency itself, not just described in the bot's `SOUL.md` persona (the
     review flagged relying on persona text alone as a real risk for a
     money-spending app)
   - One-off script `backend/scripts/create_api_key.py` — mints a key, prints it
     once to the terminal (never logged, never stored in the DB except as a hash)

5. **Cross-platform write-safety normalization**
   - `FacebookService.create_ad` currently defaults to `ACTIVE` — change the
     default to `PAUSED` so Meta matches the safety convention Sprint 2 introduces
     for Google (and Sprint 3 for TikTok). Document this as a deliberate behavior
     change vs. the upstream fork in `docs/sprint-0/done.md`.

6. **Meta insights gap (unblocks Sprint 2's Overview page)**
   - Add `FacebookService.get_campaign_insights(campaign_id, date_range)` —
     spend/impressions/clicks/conversions via the Graph API `insights` edge. The
     existing Meta campaign list only returns metadata, not performance numbers —
     without this, Sprint 2's cross-platform Overview has nothing real to show for
     the Meta side.

7. **Cheap hardening carried forward from the review**
   - Add a `Content-Security-Policy` header alongside the existing security
     headers in `backend/app/main.py`
   - Narrow `TRUSTED_PROXIES` from `"*"` to the actual Caddy hop (`127.0.0.1`) for
     the production config

8. **Dependency resolver pre-check**
   - Current pins of note: `fastapi==0.104.1`, `httpx==0.25.1`,
     `python-jose==3.3.0`, `google-generativeai==0.8.5`. Before Sprint 1 adds
     `google-ads`, run `pip install -r requirements.txt` with it added and resolve
     any conflicts (likely candidates: `protobuf`, `google-api-core`, `grpcio`) —
     do this as a Sprint 0 exit check, not a Sprint 1 surprise.

## Verification checklist

- [ ] Every `/api/v1/*` route (old and new) returns 401 without a valid JWT or
      valid API key, except the genuinely public ones (`/login`, OAuth callbacks).
      `/register` is admin-gated, not public — confirm it still requires an
      authenticated admin caller.
- [ ] `docker compose up` (dev file) boots backend + frontend + postgres locally
- [ ] `docker compose -f docker-compose.prod.yml up -d` boots the production shape
      locally before Sprint 4 touches real Caddy/cloudflared
- [ ] App fails to start (clear error, not silent plaintext fallback) if
      `OAUTH_TOKEN_ENCRYPTION_KEY` is missing or malformed
- [ ] A minted API key with only the `ads:read` scope gets 403 on a route that
      requires `ads:draft`
- [ ] `FacebookService.create_ad` creates a `PAUSED` ad by default; existing tests
      updated if they assumed `ACTIVE`
- [ ] `pip install -r requirements.txt` (with `google-ads` added) resolves cleanly

## Out of scope

- Actually calling the Google/TikTok APIs (Sprint 1/3) — this sprint only builds
  the shared plumbing they'll use
- Deploying to `ads.nalar.army` (Sprint 4) — this sprint only makes the Docker
  Compose files exist and boot locally
