# Connections, workspaces, and refresh

theLeadRouter — Ad Studio

Open Connections. Select an existing workspace or, as an administrator, create one and add members. Choose the accounts the team is allowed to use. Membership, role, and account grants control visibility and refresh access.

A workspace is not automatically created for every new login. A personal Meta grant is needed for the workspace-account connection flow; a legacy managed campaign connection is separate. If no workspace membership appears, an administrator needs to configure it.

Refresh is manual, one selected account at a time. The worker polls the database queue every five seconds. The page checks saved status every 30 seconds while idle and every two seconds while active. Those checks do not pull every Meta account. A snapshot becomes stale after one hour; staleness does not enqueue another refresh.

API group: /api/v2/workspaces. Requests run under the API key owner's actual membership and account grants. Read/write scope alone does not grant workspace administration or can_sync. Request IDs and job status identify refresh progress. Inspect failures before retrying. No ad creation or automatic spend changes occur during metadata refresh.
