# Sprint 1 — Google Ads Integration (Read-Only)

**Goal**: Connect Google Ads via OAuth and show real campaign/ad performance data in
a new dashboard tab. Read-only — no campaign creation yet (that's Sprint 2).

**Success criteria**: Logging into the app, clicking "Google Ads" tab, connecting an
account via OAuth, and seeing a real campaign performance table (impressions,
clicks, cost, conversions) pulled live from the Google Ads API.

## Tasks

1. **Backend: config + dependencies**
   - ~~Add `google-ads` to `backend/requirements.txt`~~ — done in Sprint 0
     (dependency resolution pre-check), already installed and conflict-free.
   - Add env vars to `.env.example`: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`,
     `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`,
     `GOOGLE_ADS_OAUTH_REDIRECT_URI`

2. **Backend: DB model + migration**
   - ~~`GoogleAdsConnection` model~~ — done in Sprint 0 (added to `app/models.py`
     alongside `ApiKey` so this sprint could start directly on OAuth/service
     work). Fields: `user_id, customer_id, account_name,
     encrypted_refresh_token, encrypted_access_token,
     access_token_expires_at, is_active`. It's part of the Sprint 0 baseline
     migration (`fba8f217905e_initial_schema_baseline.py`) — no separate
     migration needed unless the shape changes.

3. **Backend: OAuth flow** (`backend/app/services/google_ads_oauth.py`)
   - Port logic from `apps/optima/lib/google-ads-oauth.ts` (nalarin monorepo) —
     build-auth-url, exchange-code-for-token, refresh-token
   - State/CSRF guard: use `app.core.oauth_state` (`create_oauth_state` /
     `verify_oauth_state` / cookie helpers) — built in Sprint 0, shared with
     TikTok Ads in Sprint 3, don't reimplement.
   - At-rest encryption: use `app.core.token_encryption`
     (`encrypt_token`/`decrypt_token`, Fernet-based) — also built in Sprint 0,
     reads `OAUTH_TOKEN_ENCRYPTION_KEY` from `.env`. Mirrors `@nalarin/utils/crypto`.

4. **Backend: Google Ads client wrapper** (`backend/app/services/google_ads_service.py`)
   - `list_accessible_customers()`
   - `get_campaign_performance(customer_id, date_range)` — GAQL query for
     impressions/clicks/cost/conversions per campaign
   - `get_ad_performance(customer_id, campaign_id)`

5. **Backend: API routes** (`backend/app/api/v1/google_ads.py`)
   - `GET /api/v1/google-ads/oauth/start`
   - `GET /api/v1/google-ads/oauth/callback`
   - `GET /api/v1/google-ads/campaigns`
   - `GET /api/v1/google-ads/campaigns/{id}/ads`

6. **Frontend: UX design first — no existing reference to copy (corrected from an
   earlier wrong assumption)**
   - `FacebookCampaigns.jsx` is a 6-step ad-CREATION wizard, not a performance
     view — do not model the new tab on it.
   - There is no existing "Connect Account" UI anywhere in this app (Meta uses a
     static `.env` token, not per-user OAuth) — this is the **first** OAuth-connect
     UI in the codebase. Design it fresh, reusing only the existing visual
     language: amber-600 accents, `bg-white rounded-xl border border-gray-200
     shadow-sm` cards, `lucide-react` icons (no new icon set/component library).
   - New reusable components (place in `frontend/src/components/`, not copy-pasted
     per platform, since Meta/TikTok will need the same shapes):
     - `ConnectAccountCard.jsx` — disconnected state (platform logo/name + Connect
       button → OAuth redirect) vs. connected state (account name, disconnect
       button, "last synced" timestamp)
     - `PerformanceTable.jsx` — sortable columns (campaign, impressions, clicks,
       cost, conversions), date-range filter dropdown (reuse the `<select>` markup
       already in `Reporting.jsx`), empty-state and loading-state rows
   - `frontend/src/pages/GoogleAdsCampaigns.jsx` composes those two components;
     do NOT hardcode mock numbers into it (the existing `Reporting.jsx` mock-data
     anti-pattern must not be repeated for a page with a real backend behind it)
   - Add route + nav entry in `App.jsx` (inside the existing `PrivateRoute` tree)

7. **Manual one-time step (Console UI, cannot be automated)**
   - Add a new OAuth Client (Web application) under GCP project `nalarin-500102`,
     redirect URI `http://localhost:8000/api/v1/google-ads/oauth/callback` (dev) and
     `https://ads.nalar.army/api/v1/google-ads/oauth/callback` (prod, added in
     Sprint 4). Flagged here so the human knows this one step needs the browser.

8. **Tests**
   - Backend: pytest for OAuth state validation, token refresh, GAQL query building
   - Frontend: vitest for `GoogleAdsCampaigns.jsx` render + connect flow

9. **Charting library decision (needed here even though charts render in Sprint
   2)** — no chart library exists in `package.json` today. Add `recharts` now (MIT,
   Tailwind-friendly, pairs well with the existing minimal `lucide-react`
   aesthetic) so `PerformanceTable.jsx` can grow an optional trend sparkline
   without a mid-Sprint-2 dependency scramble. Do not build a custom SVG charting
   solution — not worth it at this app's scale.

10. **Auth gate verification (do not skip)**
   - Frontend: confirm the new `research` route in `App.jsx` is added *inside* the
     existing `<PrivateRoute><Layout /></PrivateRoute>` tree, never as a sibling of
     the public `/login` route
   - Backend: every route in `backend/app/api/v1/google_ads.py` takes
     `current_user: User = Depends(get_current_active_user)` (same pattern as
     `auth.py`) — except the OAuth callback route, which authenticates via the
     signed state cookie instead (documented exception, not an oversight)
   - Manual check: hit `GET /api/v1/google-ads/campaigns` with no/expired JWT →
     must return 401, not campaign data

## Out of scope (later sprints)

- Creating/pausing campaigns (Sprint 2)
- Cross-platform Overview page (Sprint 2)
- Deployment to `ads.nalar.army` (Sprint 4)
