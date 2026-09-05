# Sprint 5 - Hardening and Handoff

## Shipped

- NALARIN Ads Studio is deployed at `https://ads.nalar.army`.
- Production runs in isolated Docker Compose project `ads-studio-prod`:
  nginx is bound only to `127.0.0.1:3024`; backend and Postgres remain internal.
- Caddy and cloudflared route the public hostname to that local production stack.
- Production nginx waits for FastAPI `/health` before starting, preventing the
  initial 502 race observed during deployment.
- Every dashboard/platform route is protected by JWT authentication; public
  smoke checks return 401 for unauthenticated data APIs.
- OAuth tokens are Fernet-encrypted at rest.
- Google/TikTok writes require an explicit confirmation and newly created
  campaigns default to paused.
- A scoped `ads:read` bot surface (`/api/v1/bot/*`) is live. It has no campaign
  mutation route and its API key is owner-bound and hash-stored.

## Verification Evidence

- Backend tests: `144 passed, 1 xpassed`.
- Frontend Vitest: `1 passed`.
- Production checks through public Cloudflare route: root `200`, health `200`,
  protected dashboard API `401`, unauthenticated bot overview `401`.
- Scoped live bot safety response confirms: `can_spend=false`,
  `can_create_campaigns=false`, `can_pause_campaigns=false`,
  `can_enable_campaigns=false`, `writes_enabled=false`.
- Health monitor reports `ads-studio` UP with the rest of the NALARIN platform.

## Known External Prerequisites

1. **Google Ads**: OAuth connection works, but the connected customer returns
   `CUSTOMER_NOT_ENABLED`. Enable the Google Ads customer/developer token/API
   access before expecting live campaign data.
2. **Google production callback**: confirm the provider console includes
   `https://ads.nalar.army/api/v1/google-ads/oauth/callback`.
3. **TikTok**: create/approve a TikTok for Business developer app with Marketing
   API access, then set `TIKTOK_ADS_APP_ID` and `TIKTOK_ADS_APP_SECRET`.
   Register `https://ads.nalar.army/api/v1/tiktok-ads/oauth/callback`.
4. **Telegram bot**: `ads-studio-agent` profile, isolated SOUL, and a read-only
   backend key are ready. Create a new BotFather bot and provide its token; do
   not reuse MedSos or other bot tokens. Only then start the dedicated gateway.

## Operational Follow-up

- The public DNS record has propagated to public resolvers; this Windows host
  may briefly retain a negative DNS cache. Public checks can use the resolved
  Cloudflare IP until that cache naturally expires.
- NALARIN shared routing/supervisor files contain unrelated MedSos changes in
  the same working-tree hunks. The active configuration is validated/live, but
  future commits should split those hunks carefully rather than mass-staging
  the dirty shared files.
