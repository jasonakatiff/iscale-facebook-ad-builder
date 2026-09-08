# Creative analytics

Creative analytics joins saved daily ad performance to the creative, its original creator and its metadata. Open **Performance Reports → Creative analytics**. The page reads PostgreSQL; refreshing the page never requests advertising data.

## Connect and import

Connect Google in **Ad Deployment → Google Ads**, or TikTok in **Ad Deployment → TikTok Ads**. In **Creative analytics → Data sources**, select your active connection and enable the source. Google manager discovery lists authorized child accounts; performance queries run against each child account. TikTok discovery lists the advertisers authorized by the connection, then reports on every ad in each advertiser. There is no per-ad performance polling.

Account discovery is cached for 24 hours. Defaults are a four-hour performance refresh, a two-day recent window and a daily 30-day correction window for delayed attribution. Each provider has its own shared allowance of 60 requests/minute, 5,000/day and at most two concurrent requests. These allowances cover this analytics importer and its token refreshes; existing interactive Google/TikTok campaign operations have separate behavior. Facebook uses the existing delivery controls.

A single elected worker advances one account report page at a time. Settings are ceilings; concurrency two does not force two simultaneous imports. Reporting uses seven-day chunks, bounded pages and a maximum 100,000 rows per account refresh. Unsupported provider report sizes fail visibly and preserve the prior complete report. TikTok's synchronous reporting limits also apply; very large advertisers may require a future partitioned or asynchronous reporting adapter.

**Request performance refresh** queues work; repeated requests reuse pending work or results less than five minutes old. A throttled report waits for capacity and resumes its saved page. Failed or expired reports retain the last complete dataset. Correct the connection/configuration error before requesting a fresh import. **Pause source** stops subsequent import work; a request already running can finish. Disconnecting the underlying connection revokes future imports.

## Match creative and track users

In **Imported ads**, choose **Link creative**, then select the matching library creative or upload an external image/video. The upload is analyzed using the existing creative library. Select the exact creative used by the remote ad; performance for an ad combining multiple assets cannot establish which individual asset caused the result.

Saving records the linking user and a frozen metadata snapshot. Later library edits do not rewrite that snapshot. A corrected link applies to all imported history for the ad and increments the binding revision; before/after snapshots and the acting user remain in the audit history. The original Google/TikTok launching user remains unknown. Facebook launches retain their existing creator, launching user and immutable snapshot automatically. This release does not add a Google/TikTok campaign publisher or infer links from ad names.

Only the connection owner can manage imports or links. Users read their own performance. Administrators can select **All users’ performance**; shared settings remain admin-only. Creator, linking user and launching user are distinct fields. Unknown historical users remain unknown.

## Read patterns

Choose CPA, ROAS or CTR. The saved default is CPA. Compare creative within platform, account, currency, attribution dataset, ad group, objective and ad format. Facebook uses the configured conversion event, Google uses primary conversions by interaction date, and TikTok uses optimization conversions. Currency amounts and attribution definitions are never pooled into a cross-platform total. TikTok conversion value is unavailable in this importer and excluded from ROAS.

The analysis ignores today plus two full days by default while attribution settles. A comparison needs at least four creatives and 1,000 impressions per creative; CPA comparisons also need ten conversions across the group. Zero-conversion ads stay in the CPA denominator. If the winning cutoff is tied, the entire group is excluded from winner analysis.

Repeated imports of the same remote ad/day are deduplicated before scoring; conflicting links exclude the affected creative. Duplicate placements of one creative in a group are aggregated. Across groups, each asset contributes only its highest-impression group, selected before examining outcomes, so repeated use cannot multiply evidence. Conflicting metadata snapshots for the same creative/group are excluded. Filter to a platform or account to examine a different deployment context.

Traits include observed creative metadata, creator, saved or built-in template, brand palette and up to twenty recorded source-image identities. Source-image identity uses the saved reference URL, not perceptual image matching. Trait and trait-pair rows show actual winner overlap and the expected overlap based on those groups. Constant traits are excluded, including constant fields added to pairs. Up to 256 candidate patterns are selected by sample size before testing; 4,095 within-group random permutations and Benjamini-Hochberg correction produce the adjusted p-value. “Stronger evidence” passes the configured false discovery threshold; “Exploratory” does not. These are observational associations, not causal estimates or promises of future performance.

Reports are limited to 50,000 daily rows and 2,000 creative/group combinations. Narrow the account, platform or period if prompted. Supporting examples use the saved snapshot. Use patterns to design controlled creative tests; audience, targeting, allocation and timing still affect outcomes.

## Settings and API

**Settings → Traffic source sync → Google, TikTok and creative analytics** contains provider schedules/request budgets and pattern thresholds. Saved changes affect subsequent scheduling without restarting the server. Missing provider setup is displayed explicitly.

All routes below are relative to `/api/v1/analytics` and require authentication. Lists use `data` and `pagination`; errors use `error.code`, `error.message` and `error.details`.

| Routes | Purpose |
| --- | --- |
| `GET /settings`; `PUT /settings/google`, `/settings/tiktok`, `/settings/patterns` | Inspect or administer validated shared defaults. |
| `GET /connections`; `GET/POST /sources`; `PATCH /sources/{id}` | Select an owned connection, enable or pause an import source. |
| `POST /sources/{id}/discover`; `GET /accounts`; `POST /accounts/{id}/sync` | Cache discovery, inspect import status and queue refreshes. |
| `GET /report-accounts`; `GET /report`; `GET /patterns` | Read saved account choices, daily results and pattern evidence. Optional `platform`, `account_id`, `days`, and admin-only `all_users`; patterns also accepts `metric`. |
| `GET /ads`; `PUT /ads/{id}/creative` | List imported ads and bind a ready asset using `creative_asset_id` and `expected_revision`. A null asset removes the link. |

See the deployed OpenAPI specification for exact validation bounds. Production Google/TikTok end-to-end validation requires configured provider credentials and active advertiser connections; simulated test success does not prove live access.
