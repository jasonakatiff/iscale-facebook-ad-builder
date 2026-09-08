# Native LeadRouter integration

BreadWinner · Powered by theLeadRouter.com

LeadRouter is built into BreadWinner. No plugin installation is required.

## Connect once

Open Connections → Configure LeadRouter, or Settings → Configure LeadRouter.
Choose Partner account for a LeadRouter partner portal key, or Organization API key for organization campaign access. Enter an `lr_` API key with campaign read access and select Connect LeadRouter. BreadWinner verifies the key before saving it.

The connection is private to your BreadWinner user. Even an organization key does not grant its access to your BreadWinner teammates. Credentials are encrypted on the backend, never returned to the browser, and never included in exported docs, campaign drafts, or AI prompts. A `pk_` posting key is a different credential and cannot be used to browse campaigns.

To replace a key or switch accounts, disconnect and reconnect. Disconnecting removes your stored credential and personal default/campaign associations. It does not alter your LeadRouter account or published ads. Existing browser drafts retain their campaign reference until cleared; an old connection reference cannot pass live validation after reconnection.

The built-in connector uses https://theleadrouter.com. Custom installation domains and workspace-wide sharing are not configured by this release.

## Where LeadRouter appears

| Location | Native behavior |
| --- | --- |
| Connections and Settings | Configure the connection, browse campaigns, refresh data, and disconnect. |
| Brand and Product editors | Expand LeadRouter default to save a personal campaign choice separately from the shared catalog record. |
| LeadRouter settings | Search brands and products and manage the same defaults centrally. |
| Image Ads → Campaign | Select a campaign or explicitly use the product/brand default; Use LeadRouter offer in brief copies its current offer name into the editable offer field. |
| Facebook Campaigns → Campaign Setup | Select an optional LeadRouter campaign. The browser draft keeps the association. |
| Review & Launch | Review the association; current connection and campaign access are checked before publishing. The resulting local campaign gets a private association. |
| Campaign Reporting | Select a LeadRouter campaign to see its available lifetime lead count, status, offer, and your linked BreadWinner campaigns. |
| Help & API Docs | Download this guide and the current OpenAPI contract for API automation. |

Product defaults take precedence over brand defaults. Applying a default in a creative brief is explicit and does not overwrite the offer until you select Use LeadRouter offer in brief. Save a new brand/product before assigning its native default. Campaign strategy presets remain reusable independently of your personal LeadRouter connection.

Only active campaigns can be saved as defaults or linked during publication. Reporting and the settings browser can display inactive campaigns. If a key loses access, expires, or a campaign becomes inactive, the app displays an error and requires an available selection. Clearing the optional link allows the regular campaign workflow to continue.

## Refresh and reporting

Opening an expanded picker or the reporting page requests campaign pages from LeadRouter. Refresh campaigns requests them again. There is no background timer, scheduled polling, or automatic lead delivery. The UI displays the last fetched time. The searchable catalog supports up to 10,000 campaigns; larger accounts need a key with narrower campaign access.

The API exposes only campaign identifiers, names, offer/vertical labels, status, and available lifetime lead counts. Posting keys, private specification tokens, lead records, and other provider fields are excluded. Lead counts are not filtered to a date range or attributed to an individual BreadWinner ad. A campaign association alone does not calculate conversions, revenue, or ROAS.

## Use with Claude Code or another API client

Connect LeadRouter once in your BreadWinner browser session. Then use a BreadWinner user API key in the Bearer header against these BreadWinner routes:

| Method | Path under /api/v1 | Purpose |
| --- | --- | --- |
| GET | /leadrouter/connection | Current private connection metadata; never its key. |
| GET | /leadrouter/campaigns?limit=100&offset=0 | Live, paginated campaign choices. |
| GET | /leadrouter/campaigns/{campaign_id}?connectionId={connection_id} | Revalidate a selected campaign against this connection. |
| GET | /leadrouter/defaults | Paginated private saved defaults and published associations. |
| GET | /leadrouter/defaults/resolve?productId={product_id} | Product default, falling back to its brand default. |
| GET | /leadrouter/defaults/resolve?brandId={brand_id} | Personal brand default. |
| GET, PUT, DELETE | /leadrouter/defaults/{resource_type}/{resource_id} | Read, save, or remove a brand, product, or campaign association. |

PUT accepts `{ "connectionId": "<connection UUID>", "campaignId": "<LeadRouter campaign UUID>" }`. `resource_type` is `brand`, `product`, or `campaign`; `resource_id` is an existing BreadWinner record identifier, not a LeadRouter identifier. PUT revalidates ownership of the connection and current upstream campaign access. Lists use `{ data, pagination: { total, limit, offset, hasMore } }`. Errors use `{ error: { code, message, details } }`.

Read keys can read the owner's native metadata and campaign catalog. Read/write keys can also save/remove the owner's associations. Browser sessions are required for PUT/DELETE `/leadrouter/connection`. The LeadRouter key and BreadWinner API key are separate credentials with separate purposes.

## Deliver leads and preserve tracking

This connection does not post leads, import Meta lead-form submissions, or send ad spend into LeadRouter. A landing page or form must use LeadRouter's posting integration with the required campaign mapping and posting key. Keep that posting key on the submission server.

Existing Meta URL parameters can carry campaign, ad-set, and ad identifiers to a landing page. That page must preserve and map those values into supported LeadRouter posting fields. Adding URL parameters alone does not submit a lead. Use LeadRouter's posting documentation for the selected campaign before enabling delivery.
