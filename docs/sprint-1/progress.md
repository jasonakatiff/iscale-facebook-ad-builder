# Sprint 1 — Progress Tracker

Status: � In progress (backend + frontend read-only flow built and verified;
manual OAuth Console step blocked on the user)

| Task | Status |
|---|---|
| 1. Backend config + dependencies | ✅ (google-ads in Sprint 0; env vars added) |
| 2. DB model + migration | ✅ (done in Sprint 0 baseline) |
| 3. OAuth flow | ✅ `app/services/google_ads_oauth.py` |
| 4. Google Ads client wrapper | ✅ `app/services/google_ads_service.py` |
| 5. API routes | ✅ `app/api/v1/google_ads.py` (registered in main.py) |
| 6. Frontend Google Ads tab | ✅ `ConnectAccountCard.jsx`, `PerformanceTable.jsx`, `GoogleAdsCampaigns.jsx`, nav+route wired |
| 7. Manual OAuth Client step (flag for human) | ⬜ **blocked on user** — see below |
| 8. Tests | ✅ 13 new tests (`tests/unit/test_google_ads.py`), full suite 117 passed + 1 xpassed |
| 9. Charting library decision | ✅ `recharts` added (Sprint 0), installed + verified loading via Vite |
| 10. Auth gate verification | ✅ all google-ads routes except `/oauth/callback` return 401 without JWT |

## What's verified (real, not just code review)
- Full backend test suite (118 tests) green inside the dev Docker container.
- `/api/v1/google-ads/*` routes appear in the OpenAPI schema and are
  auth-gated (curl-verified 401s).
- Frontend: all new/modified files (`GoogleAdsCampaigns.jsx`,
  `ConnectAccountCard.jsx`, `PerformanceTable.jsx`, `App.jsx`, `Layout.jsx`)
  compile cleanly through Vite (200 from the dev server for each module).
- `recharts` installed, `package-lock.json` regenerated and in sync (`npm ci`
  succeeds in a fresh container).

## NOT yet verified (needs real Google credentials — the blocker below)
- The actual OAuth round-trip (consent screen → callback → token exchange →
  `list_accessible_customers` → GAQL campaign query) has NOT been exercised
  against real Google Ads APIs. All automated tests use a server with
  `GOOGLE_ADS_CLIENT_ID/SECRET/DEVELOPER_TOKEN` unset, which correctly
  produces 500s ("not configured") — that's the tested path. The happy path
  is implemented per the ported nalarin `apps/optima` reference but is
  unverified end-to-end.

## Blocked — needs the user (Task 7)
Cannot be automated (Google requires interactive human login for Cloud
Console). The user needs to:
1. In Google Cloud Console (same project as the working `apps/optima`
   integration, or a new one), add a new OAuth 2.0 Client ID (Web
   application), authorized redirect URI:
   `http://localhost:8010/api/v1/google-ads/oauth/callback` (dev — port 8010,
   not 8000, since 8000 is taken by an unrelated container on this machine).
   Add the production URI later in Sprint 4:
   `https://ads.nalar.army/api/v1/google-ads/oauth/callback`.
2. Get/confirm a Google Ads **developer token** from
   https://ads.google.com/aw/apicenter under the manager account.
3. Provide: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`,
   `GOOGLE_ADS_DEVELOPER_TOKEN` (and `GOOGLE_ADS_LOGIN_CUSTOMER_ID` only if
   connecting via a manager/MCC account) — these get set in `.env` (already
   has placeholders, currently blank).

Once those three values exist, the full OAuth connect flow can be tested for
real (`/google-ads` page → Connect → Google consent → callback → campaign
table populates).

## Notes
- Reference implementation: `apps/optima/lib/google-ads-oauth.ts` +
  `apps/optima/lib/google-ads-client.ts` in the `nalarin` monorepo (working OAuth
  flow, TypeScript — ported the logic/shape to Python, not a literal copy).
  GAQL field names for campaign performance also taken from
  `apps/optima/lib/providers/google-ads.ts`'s `fetchGoogleCampaigns`.
- GCP project already has Google Ads API enabled — no fresh Cloud Console project
  setup needed, only a new OAuth Client (see Task 7).

