# Sprint 3 - TikTok Ads Progress

Status: Implemented and verified locally; awaiting TikTok for Business developer-app onboarding.

## Completed

- Added `TikTokAdsConnection` with encrypted OAuth access/refresh tokens.
- Added idempotent Alembic migration `b7c2d91e4a10_add_tiktok_ads_connections`.
- Added OAuth start/callback, connection status/disconnect, reporting, and guarded
  campaign-create routes under `/api/v1/tiktok-ads`.
- Campaign creation requires `confirm=true` and sends TikTok
  `operation_status=DISABLE`, so it is paused by default.
- Added `TikTokAdsCampaigns.jsx`, protected route, sidebar navigation, and TikTok
  platform normalization in the cross-platform Overview.
- Added six route safety tests: unauthenticated access, missing credentials,
  `confirm=true` write guard, and callback requirements.

## Verified

- Migration applied on local Docker Postgres: `b7c2d91e4a10 (head)`.
- OpenAPI lists all TikTok paths.
- Browser smoke: the protected TikTok page renders at `/tiktok-ads`, appears in
  sidebar navigation, and reports a clear onboarding message when credentials
  are absent instead of attempting a provider request.
- Backend suite: `139 passed, 1 xpassed`.
- Frontend Vitest: `1 passed`.
- Vite production build succeeds (existing bundle-size warning remains).

## Manual Prerequisite

TikTok does not provide credentials until a human completes developer/app
onboarding at `https://business-api.tiktok.com` and receives Marketing API
access. Supply these values only after approval:

- `TIKTOK_ADS_APP_ID`
- `TIKTOK_ADS_APP_SECRET`
- `TIKTOK_ADS_OAUTH_REDIRECT_URI`

Local callback URI already reserved in `.env.example`:
`http://localhost:8010/api/v1/tiktok-ads/oauth/callback`.

Until that manual approval happens, all TikTok routes fail closed with a clear
503 and no campaign write can occur.
