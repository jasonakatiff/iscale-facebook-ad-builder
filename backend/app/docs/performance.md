# Performance Reports and Dashboard

theLeadRouter — Ad Builder & Manager

Open Performance Reports → Overview to inspect available connected-provider performance. The overview combines provider rows and reports provider errors separately; one unavailable integration does not imply that every other provider failed. Check the selected date range and account context.

Dashboard shows application inventory and activity. API groups: /api/v1/overview and /api/v1/dashboard. Provider-specific insights also appear under their API groups.

## Existing limits
The legacy /reporting page currently displays sample metrics and unfinished controls. Treat that page as a visual demonstration, not a financial or campaign-performance source. The workflow prototype's report screens also use sample data. Use live Overview/provider endpoints for automation, and inspect returned errors before using totals.

Workspace sync snapshots currently contain account metadata; they are not scheduled spend or insight imports. There is no automatic push of campaign spend into LeadRouter in this release.
