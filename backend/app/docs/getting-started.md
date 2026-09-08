# Getting started

theLeadRouter — Ad Studio

Ad Studio is an ad workspace powered by theLeadRouter.com. Research competitors, build creatives, configure campaigns, and inspect performance. An administrator creates your user account; sign in at /login.

## Your workflow
1. Research: find ads and save useful references.
2. Creative Building: choose image ads, video ads, or Ad Remix.
3. Ad Deployment: choose Meta, Google Ads, or TikTok, then review the connected account and campaign settings.
4. Performance Reports: use Overview for connected-provider data and Dashboard for workspace inventory.

Expand Creative Building to open Winning Ads, Generated Ads, Brands, Products, and Customer Profiles. Bottom navigation contains Settings, Connections, API Keys, Themes, and Help & API Docs. User Management requires the admin role.

## Identity and access
A user API key acts as its owner, within the key's access level and the owner's current roles. Workspace membership further restricts /api/v2 workspace resources. Legacy /api/v1 brand/product/creative catalogs are shared within this installation; they are not separate private tenants per user. Do not assume a separate user account creates an isolated catalog.

Light, dark, and system appearance are available from the top bar. Themes changes the palette; appearance chooses its light or dark variant. Browser campaign drafts and appearance preferences stay in the browser. Server libraries persist in PostgreSQL.

## Integrations and limitations
AI generation requires configured provider keys. Personal Meta OAuth requires deployment-level Meta app setup; a managed Meta connection can still be available. The workflow prototype uses sample data and is distinct from live workflows. The legacy Reporting page and some General Settings controls remain demonstrations, not live automation.
