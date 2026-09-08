# Settings and User Management

BreadWinner · Powered by theLeadRouter.com

Settings includes Ad Styles and Prompts used by the creative workflows. Inspect and edit the controls available for the selected item. Some style edits and the AI-style-generation demo currently affect frontend state only; General Settings is unfinished. Do not assume those demo controls persist or contact an AI service. Use the documented /api/v1/ad-styles and /api/v1/prompts operations for server-backed automation and verify the resulting record.

User Management is restricted to administrators. Add or manage users and roles using the supported controls. Deactivating an owner prevents that user's platform API keys from authenticating. Changing roles changes the permissions of their keys on subsequent calls.

API groups: /api/v1/users and /api/v1/auth. User keys cannot invoke browser account-security/OAuth endpoints; use administrator user-management operations where documented and authorized. Never place shared provider secrets in client-side settings or exported documentation.
