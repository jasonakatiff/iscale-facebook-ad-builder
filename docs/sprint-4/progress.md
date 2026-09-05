# Sprint 4 - Deployment and Hermes Bot Progress

## Completed

- Production Docker stack runs as `ads-studio-prod` with isolated Postgres.
- Public nginx binds only `127.0.0.1:3024`; FastAPI and Postgres are internal.
- Added backend healthcheck and nginx dependency so the public port waits for
  FastAPI readiness, eliminating the observed initial 502 startup race.
- Configured production Vite to use same-origin `/api/v1`, which nginx proxies
  internally to FastAPI. No provider secrets are present in browser assets.
- Added Caddy route for `ads.nalar.army` with `X-Forwarded-Proto: https`.
- Added cloudflared ingress entry and confirmed public DNS route maps to the
  existing `nalarin-local` tunnel.
- Added standalone starter `scripts/start-adsstudio-docker.ps1`; it is
  idempotent and used by the health monitor/boot supervisor hooks in the live
  working tree.
- Health monitor reports `20/20 apps UP`, including `ads-studio`.
- Added production read-only bot API:
  - `/api/v1/bot/safety`
  - `/api/v1/bot/connections`
  - `/api/v1/bot/overview`
  It requires a hashed `ads:read` key and exposes no write/publish/spend route.
- Created dedicated `ads-studio-agent` Hermes profile, scrubbed inherited
  MedSos/GitHub/MCP credentials, applied a strict read-only SOUL, and provisioned
  an owner-bound `ads:read` key privately in its profile environment.

## Verified

- Local production root and health: HTTP 200.
- Through local Caddy with `Host: ads.nalar.army`: root and health HTTP 200.
- Through public Cloudflare path (using public resolver address while local DNS
  negative cache settled): root HTTP 200, health JSON healthy.
- Public unauthenticated data API: HTTP 401.
- Public bot safety endpoint with scoped key reports:
  `can_spend=false`, `can_create_campaigns=false`, `can_pause_campaigns=false`,
  `can_enable_campaigns=false`, and `writes_enabled=false`.
- Backend tests after bot API: `144 passed, 1 xpassed`.

## Manual Provider Steps Still Required

1. Add these production redirect URIs in provider consoles:
   - Google Ads: `https://ads.nalar.army/api/v1/google-ads/oauth/callback`
   - TikTok Ads: `https://ads.nalar.army/api/v1/tiktok-ads/oauth/callback`
2. TikTok requires a TikTok for Business developer app approved for Marketing
   API before its app ID/secret can be populated.
3. Create a new BotFather bot and provide its token. The `ads-studio-agent`
   profile intentionally has `TELEGRAM_BOT_TOKEN=` blank and must not reuse
   MedSos or another bot token. Once supplied, start its own WMI gateway and
   verify Telegram reports/explicit refusal for spend or publish commands.

## Operational Notes

- This repository has local DNS negative-cache behavior for newly added
  `ads.nalar.army`; public resolvers (1.1.1.1 and 8.8.8.8) already resolve it.
- Shared NALARIN Caddy/supervisor files contain pre-existing MedSos changes in
  the same hunks, so only the standalone starter was committed independently
  (`nalarin` commit `5ca4d4a`). The active live configuration has been validated
  and applied, but do not mass-commit the shared dirty files.
