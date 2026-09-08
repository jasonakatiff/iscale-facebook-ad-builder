# Google Ads and TikTok Ads

theLeadRouter — Ad Builder & Manager

Open Ad Deployment and select Google Ads or TikTok Ads. Connect an account through the browser, choose the account, and review the platform-specific campaign and performance controls. Provider OAuth setup must be configured for that deployment. Reconnect when the app reports expired or unavailable access.

API groups: /api/v1/google-ads and /api/v1/tiktok-ads. Use the OpenAPI operation schemas for campaign types and required fields. User API keys can operate existing connections according to owner permissions and key scope. OAuth start/callback and account-security actions require a browser session; an API key is not a substitute for provider consent.

Provider errors can indicate missing app configuration, missing permissions, disabled accounts, or invalid campaign settings. Check the account identity and returned error before retrying. Never infer that Meta, Google, and TikTok use identical budget units or objectives; follow each documented schema.
