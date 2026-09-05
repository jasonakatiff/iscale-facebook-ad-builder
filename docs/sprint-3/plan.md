# Sprint 3 — TikTok Ads Integration

**Goal**: Add TikTok as the third platform tab. Higher uncertainty than
Google/Meta — TikTok Business API registration friction is unknown at plan time.

## Tasks

1. **Research (do first, before writing code)**
   - Register at [business-api.tiktok.com](https://business-api.tiktok.com) as a
     developer, create an app, request Marketing API scope
   - Document actual friction encountered (mirrors how Meta's Business Verification
     blocker was documented) — if registration is as hard as Meta's, evaluate
     whether to defer TikTok entirely rather than force it
   - Confirm sandbox/test-account access tier vs. production tier requirements

2. **Backend: TikTok OAuth + service** (`backend/app/services/tiktok_ads_service.py`)
   - OAuth 2.0 (Authorization Code) flow — same shape as Google's, reuse the Fernet
     encryption helper built in Sprint 1
   - `get_campaign_performance(advertiser_id)` via TikTok Reporting API
   - `create_campaign(...)` — PAUSED-by-default, same safety convention as Sprint 2

3. **Backend: API routes** (`backend/app/api/v1/tiktok_ads.py`)
   - Mirrors the Google Ads route shape from Sprint 1

4. **Frontend: TikTok tab** (`frontend/src/pages/TikTokAdsCampaigns.jsx`)
   - Same UI pattern as Google/Meta tabs
   - Add to `Overview.jsx` aggregation (third platform row)

5. **Tests**: pytest + vitest, same coverage bar as Sprints 1-2

6. **Auth gate verification (do not skip)** — same checks as Sprint 1 Task 9,
   applied to the new TikTok route/page: `TikTokAdsCampaigns.jsx` must be inside
   `PrivateRoute`, every `tiktok_ads.py` route (except OAuth callback) must depend
   on `get_current_active_user`, unauthenticated request to the campaigns endpoint
   must return 401.

## Risk flag

If TikTok Business API registration turns out to require business
verification/documents similar to Meta (unknown until Task 1 research is done),
this sprint may need to pause on a manual step exactly like the Meta Business
Verification blocker earlier in this project — document it the same way (which
step failed) rather than guessing at workarounds.
