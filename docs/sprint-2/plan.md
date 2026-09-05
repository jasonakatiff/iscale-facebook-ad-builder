# Sprint 2 — Google Ads Write Actions + Cross-Platform Overview

**Goal**: Let the dashboard actually manage Google Ads (not just read), and add one
page that shows Meta + Google side by side.

## Tasks

1. **Backend: Google Ads write tools** (extend `google_ads_service.py`)
   - `create_campaign(customer_id, name, budget, ...)` — created **PAUSED** by default
     (safety default, same convention as AdLoop)
   - `pause_campaign` / `enable_campaign`
   - `add_negative_keywords`
   - All write endpoints require an explicit `confirm=true` param — no silent writes

2. **Frontend: Google Ads write UI**
   - "Create campaign" form on `GoogleAdsCampaigns.jsx` (budget, keywords, RSA headlines/descriptions)
   - Pause/enable toggle per campaign row
   - Preview-before-apply modal (matches the safety pattern already used for Meta's `AdRemix`)

3. **Backend: Overview aggregation endpoint**
   - `GET /api/v1/overview` — merges Meta + Google campaign performance into one
     normalized shape: `{ platform, campaign_name, spend, impressions, clicks, conversions, cpa }`

4. **Frontend: Overview page** (`frontend/src/pages/Overview.jsx`)
   - Combined table + simple bar chart (spend by platform)
   - Becomes the new default landing page after login

5. **Tests**: pytest for write-confirmation guard, vitest for Overview aggregation rendering

## Out of scope
- TikTok (Sprint 3), deployment (Sprint 4)
