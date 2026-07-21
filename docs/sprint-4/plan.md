# Sprint 4 — Deployment + Optional Telegram Bot

**Goal**: Ship it. Get `https://ads.nalar.army` live, backed by the same
Docker+Caddy+cloudflared pattern already proven for MedSos.

## Tasks

1. **Docker**
   - Confirm `docker-compose.prod.yml` binds the app to `127.0.0.1:3024` (reserved
     port, see PROJECT_BRIEF Decision Log #6)
   - Isolated Postgres (own compose project name, e.g. `-p ads-studio`), do not
     share with `nalarin-postgres` or MedSos's Postgres

2. **Caddy**
   - New `http://ads.nalar.army { ... reverse_proxy 127.0.0.1:3024 { header_up
     X-Forwarded-Proto https } }` block — apply the `header_up` fix **proactively**
     this time (already known root-cause from MedSos, see repo memory
     `nalarin-routing-notes.md`) instead of discovering it again via redirect loops.
   - Validate with `caddy validate`, reload via `scripts/reload-caddy-graceful.ps1`
     (already fixed/working script, do not rewrite it again)

3. **cloudflared**
   - Add `ads.nalar.army` ingress entry to `C:\Users\User\.cloudflared\config.yml`

4. **OAuth redirect URIs**
   - Add the production callback URLs (Google + TikTok) to their respective
     developer consoles — flag as manual Console step, cannot be automated

5. **Boot persistence**
   - `scripts/start-adsstudio-docker.ps1` (mirrors `start-medsos-docker.ps1`)
   - Add entry to `scripts/health-monitor.ps1` and `Restore-AdsStudio` to
     `scripts/boot-supervisor.ps1`

6. **Hermes Telegram bot integration (required, not optional)**
   - New Hermes profile `ads-studio-agent` — **do not reuse any existing profile**
     (mirrors the `medsos-agent` precedent): `hermes profile create ads-studio-agent
     --clone-from medsos-agent --description "NALARIN Ads Studio Telegram bot"`
   - New Telegram bot via @BotFather — own `TELEGRAM_BOT_TOKEN`, own username, set
     in the new profile's `.env`; keep `TELEGRAM_ALLOWED_USERS` restricted to the
     operator's own Telegram ID (inherited from the clone source)
   - Rewrite `SOUL.md` for this profile: Indonesian persona for "Ads Studio Agent",
     explicit rule that it can only *read* campaign performance and *draft*
     changes — it must never call any "publish"/"apply"/"spend" tool directly
     without the operator confirming in the dashboard first
   - Add a scoped API key on the backend (new `api_keys` row/table, or reuse the
     existing JWT auth with a dedicated bot service-account user that has the
     `viewer` role only — pick whichever the existing auth system in
     `backend/app/models.py` already supports; do not build a parallel auth
     system for the bot)
   - Register the backend's REST endpoints as MCP tools for this profile (`hermes
     mcp add ads-studio --url https://ads.nalar.army/api/v1/mcp --auth header`,
     or equivalent per whatever MCP surface Sprint 5 hardening exposes) — read-only
     campaign/performance tools + `draft_*` tools only, no `publish_*`/`apply_*`
     tools bound to this bot's key
   - Start the gateway as a background process (WMI `Win32_Process.Create`, same
     as every other Hermes profile on this machine — Scheduled Task install is
     admin-locked and not used by any sibling profile)
   - Verify: send a real Telegram message asking for campaign performance, confirm
     a response; confirm asking it to "publish"/"spend money" is refused per SOUL.md

## Verification checklist (mirror the MedSos verification pattern)

- [ ] `curl` direct to `127.0.0.1:3024` returns 200
- [ ] `curl` via local Caddy (`127.0.0.1:80` + Host header) returns 200
- [ ] `curl` public `https://ads.nalar.army` returns 200
- [ ] Login works end-to-end
- [ ] Unauthenticated request to `/` (dashboard) redirects to `/login`, not a data
      leak — re-check specifically in production build (Vite prod build can behave
      differently from `npm run dev`)
- [ ] Unauthenticated request to any `/api/v1/*` data endpoint (Google/TikTok/Meta)
      returns 401 in production, not just localhost
- [ ] Google Ads OAuth connect works end-to-end in production (not just localhost)
- [ ] Hermes `ads-studio-agent` bot responds on Telegram and is confirmed running
      as its own profile (not piggybacking on `medsos-agent` or `optima-ads-agent`)
