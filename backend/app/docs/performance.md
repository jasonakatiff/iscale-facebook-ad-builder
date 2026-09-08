# Performance Reports and Dashboard

theLeadRouter — Ad Studio

Open Performance Reports → Overview to inspect available connected-provider performance. The overview combines provider rows and reports provider errors separately; one unavailable integration does not imply that every other provider failed. Check the selected date range and account context.

Dashboard shows application inventory and activity. API groups: /api/v1/overview and /api/v1/dashboard. Provider-specific insights also appear under their API groups.

## Imported ad reporting
Campaign Reporting at `/reporting` displays committed daily Meta snapshots for ads created/reconciled through the posting queue, alongside separately labeled LeadRouter lifetime counts. It has real empty/error states and no sample totals. Status defaults to 5 minutes for new/pending ads and 1 hour for stable ads; daily-granularity performance defaults to 4 hours after each successful run. Normal performance refreshes replace the last 2 account-local days; the first/24-hour correction run replaces 35 days. Admins configure intervals and windows in Settings → Traffic source sync. Async reports stage pages before atomically replacing the window. Failed partial performance imports preserve the previous window.

Each row retains account currency, timezone, reporting date, Meta ad ID and import time. Reimports replace totals rather than add duplicates. Keep currencies and overlapping action types separate. Pre-queue ads are not adopted automatically; an empty list does not establish zero lifetime performance. The separate workflow prototype still uses sample data.

See the [Posting queue guide](/api/v1/help/docs/posting-queue) for schedules and recovery, and [Delivery API reference](/api/v1/help/docs/delivery-api) for `/syncs`, `/report`, exact decimal strings and pagination.

Workspace sync snapshots currently contain account metadata; they are not scheduled spend or insight imports. There is no automatic push of campaign spend into LeadRouter in this release.

## Creative analytics

Open **Performance Reports → Creative analytics** to compare saved Meta, Google and TikTok results with creative metadata. See the Creative analytics guide in Help for source setup, creative matching, user attribution, statistical evidence and import limits.
