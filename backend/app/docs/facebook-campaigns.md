# Facebook campaigns and tracking

BreadWinner · Powered by theLeadRouter.com

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
