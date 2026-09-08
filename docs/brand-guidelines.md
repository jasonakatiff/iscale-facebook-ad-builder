# theLeadRouter — Ad Studio

The public v2 product name is **theLeadRouter — Ad Studio**. It covers the ad workspace: research, creative generation, campaign launching, reporting, and management.

- Brand wordmark: `theLeadRouter`.
- Product descriptor: `Ad Studio`.
- Full title: `theLeadRouter — Ad Studio`.
- Version: `2.0.0-rc.1`, the public v2 release candidate.
- Short references: `Ad Studio` or `your ad workspace`.
- LeadRouter integration credentials and ad workspace API keys are separate. Use `LeadRouter connection key` and `workspace API key` in instructions.

Use the existing blue theme and configurable workspace branding. Existing `VITE_APP_*` and `BRAND_NAME` settings remain supported. Stored identifiers, API routes, credential prefixes, environment keys, deployment service names, and historical release records keep their existing values for compatibility.

Public source is `jasonakatiff/theleadrouter-ad-studio`. The [public v2 release](deployment/v2-railway-release.md) connects this repository to the Railway one-click template. The owner selected Ad Studio for the product, repository, and Railway naming. Marketplace publication remains a separate release decision.

Verification covers the existing branding and frontend suites, the production frontend build, scoped lint, and desktop/mobile browser rendering. Naming changes do not require new database migrations or live advertising calls.

## Previous v2 branding verification

- 85 existing frontend tests passed, including configured workspace-name/logo overrides.
- 12 backend API-key/documentation tests passed using an isolated PostgreSQL database on Python 3.12; the database was removed after testing.
- Production frontend build, scoped ESLint, Python/JSON parsing, and diff whitespace checks passed.
- Desktop (1440 px) and mobile (390 px) login, workspace navigation, and Help branding rendered without horizontal overflow. Workspace account and help responses were simulated for browser checks.
- Local browser and frontend server were stopped after verification. Production deployment and full release acceptance remain pending.
