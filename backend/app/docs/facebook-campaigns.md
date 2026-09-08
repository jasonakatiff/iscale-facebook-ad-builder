# Facebook campaigns and tracking

theLeadRouter — Ad Builder & Manager

Open Ad Deployment → Facebook Campaigns. The connection panel distinguishes managed workspace access, a personal connection, disconnected status, expired access, and account selection. Personal connection controls are unavailable until the deployment's Meta OAuth setup is complete.

## Six steps
1. Ad Account: search for and select an accessible account.
2. Campaign: choose new or existing, objective, applicable special categories, and ABO or CBO budget strategy.
3. Ad Set: configure targeting, placement, conversion settings, pixel, scheduling, and ad-set budget where required.
4. Creative: choose the Page/Instagram identity, upload media, enter copy, landing-page URL, and URL parameters.
5. Bulk Ads: review individual ad names and combinations.
6. Review & Launch: inspect the complete payload and then explicitly create the paused ads.

The base Campaign Setup fits a desktop viewport; conditional budget, location, or existing-campaign controls add content. Back and Next Step retain your draft. Browser drafts can include media and persist between reloads. Discard draft removes this browser draft, not objects already created in Meta. An interrupted publish can require reconciliation; do not repeat publication blindly.

## Reuse and tracking
Saved settings library lets you save, load, rename through update, or delete presets for an account. Review Page, pixel, targeting, and budget after applying a preset. URL parameters are separate from the landing-page URL. Insert Meta macros for campaign/ad-set/ad identifiers; account defaults and admin-only system defaults affect later configurations.

API group: /api/v1/facebook. Campaigns, ad sets, creatives, ads, uploads, account lists, and insights are exposed in the OpenAPI document. The API's create endpoints contact Meta directly; the browser's Review & Launch screen is not an API approval gate. Read/write keys can perform those actions when their owner has the required permission. Use PAUSED status and reconcile returned Meta IDs before retrying a write.

## Queued ad posting

The campaign wizard submits media, creative and ad work to `POST /api/v1/delivery/launches`. It returns a durable job; follow Posting queue or `GET /api/v1/delivery/jobs/{id}` for progress. New ads remain PAUSED. Admins control the shared cadence and retry limits at Posting queue.

Direct `POST /api/v1/facebook/ads` requests now require a stable `Idempotency-Key` header and return HTTP 202 with the job. Repeat the same key and payload after a lost response. Read `results.ad_id` only when status is `succeeded`. A write with an unknown outcome stops for reconciliation.

Status imports default to five minutes and daily performance imports to fifteen minutes. Import identity is buyer/account/Facebook ad, with one daily snapshot per attribution dataset; reimports replace totals. LeadRouter lifetime counts remain separately labeled in Reporting.
