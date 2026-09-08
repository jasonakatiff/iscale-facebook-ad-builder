# User API keys

BreadWinner · Powered by theLeadRouter.com

Open API Keys and choose a descriptive name, access level, and expiry. Read-only is the default. Read/write adds POST, PUT, PATCH, and DELETE access but still enforces the user's roles and resource permissions. Keys expire after 1–365 days; the default is 90 days. A user can have at most 20 active keys.

The key is displayed once after creation. Copy it before dismissing the panel. BreadWinner stores only its SHA-256 hash and a short display prefix. Existing keys list their name, scope, creation, last-use, expiry, and revocation state. Rename a label without changing its token. Revoke a key to stop future authentication; revocation is idempotent.

Send `Authorization: Bearer bw_live_REPLACE_WITH_YOUR_KEY` on requests. Never put a key in a URL, Git repository, shared Markdown file, screenshot, or committed Claude Code settings. API keys cannot create/list/rename/revoke other API keys; management requires a signed-in browser session.

A key's owner must remain active. Revoked, expired, unknown, and ownerless platform keys fail. Platform keys require platform:read; read/write keys also have platform:write. Legacy ads_studio bot keys retain their separate ads:read / ads:draft contracts and do not gain platform access.

New API-key endpoints: GET/POST /api/v1/api-keys and PATCH/DELETE /api/v1/api-keys/{key_id}. Errors use `{ "error": { "code", "message", "details" } }`. The create response includes `apiKey` once; later responses exclude both the raw key and hash. Last-use time is updated at most once per minute.

## Diagnostics access

Administrators can select **Diagnostics and feedback** to grant `telemetry:read` and `feedback:write` without business API access. These keys use the same expiry and revocation controls; removing admin access disables them. Existing administrator read-only keys can query telemetry, and read/write keys can also submit feedback. Read the Telemetry guide for trace lookup and agent examples.
