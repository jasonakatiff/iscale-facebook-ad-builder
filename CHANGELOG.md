# Changelog

## [2026-09-04] BreadWinner frontend restoration

- Restore BreadWinner branding, upstream logo/HTML/production env template, Dashboard at `/`, and Overview at `/overview`.
- Remove contributor public pages, process documents, and production compose file; restore upstream README with integration configuration and generic env examples.
- Keep optional Docker/nginx hosting with backend port 8000 and a same-origin Docker build API URL; preserve Railway preview hosts and proxy overrides.
- Load TikTok campaigns on connection discovery, date changes, and advertiser changes; report network failures.

Plan: [BreadWinner frontend restoration](./frontend/.claude/plans/breadwinner-tiktok.md). Tests: 6 passing; Vite build passes; 14 added/edited frontend files lint clean (81 pre-existing errors and 25 warnings elsewhere). HTTP homepage/logo checks pass. Browser smoke blocked by Chrome launch failure. Remaining backend branding matches belong to the separate backend task.

## [2026-09-03] Fork contributions: masgant99 auth pass

### Security
- 44 API routes had no authentication at all: the whole Research module (saved searches, verticals, blacklists, brand scrapes, run-scheduled-searches), Ad Remix, ad styles, prompts, dashboard stats, copy generation, and file uploads. Verified with the test client returning 200 without a token. Every one now requires a logged-in user; only login and refresh remain public. (masgant99 PR #3, commit `98d033c`, router files only)
- Settings page now sends the bearer token when loading prompts and ad styles. (masgant99 `98d033c`)
- Research API client (`frontend/src/api/research.js`) now attaches the bearer token and refreshes once on 401, matching `authFetch`. Without this the Research pages would have broken once their routes were protected.

Plan: none (external contribution review). Tests: backend pytest 99 passing; unauthenticated probe of 8 previously-open routes now returns 401; frontend `vite build` OK.

## [2026-09-03] Fork contributions: ryuiciwazaka subset

### Added
- `GET /api/v1/facebook/insights`: Marketing API insights (spend, impressions, CTR, ROAS, actions) at account, campaign, ad set, or ad level, by date preset or custom range, optional breakdown. Backend only; groundwork for Reporting and the planned Facebook data cache. (ryuiciwazaka `7caaf39`, backend files)

### Fixed
- Ad Library scraper honors `country` and `active_status` from the saved page URL instead of hardcoding US/active, forces an en-US locale so DOM selectors match in other countries, and waits on `domcontentloaded` with a longer timeout. (ryuiciwazaka `94a3dae`, `6ca1e62`)

### Not taken from this fork
- Turkish-language Reporting page, ad edit/pause/budget drawer, A/B duplicate, creative analytics, and VLM strategy recommender. All are tailored to one Turkish boutique (prompts, currency, power words), the duplicate flow falls back to the contributor's store URL, and the write endpoints use the login check instead of `campaigns:write`. Kept as reference for the reporting work.

Plan: none (external contribution review). Tests: backend pytest 99 passing, 1 xfailed.

## [2026-09-03] Fork contributions: SmittyCode subset

### Added
- `backend/startup.py`: database bootstrap. Empty database gets the schema from the models and is stamped at Alembic head; existing databases run `alembic upgrade head`; a database with tables but no `alembic_version` is refused. Fixes fresh Railway deploys, which failed because the first Alembic revision assumes existing tables. (SmittyCode `aac7b16`)
- `frontend/src/utils/mediaUrl.js`: resolves backend-relative `/uploads/...` media paths against the API origin so legacy generated ads render on split frontend/backend services. (SmittyCode `20ca2bf`)
- `frontend/railway.toml` for the frontend service; root `railway.toml` now configures only the backend with the Dockerfile builder. Closes the cause of issue #1 (Nixpacks at repo root). (SmittyCode `a5e5342`, `94047a6`)

### Fixed
- Batch-saving generated ads no longer fails when the image wizard used a built-in style: style IDs are not `winning_ads` rows, so `template_id` is nulled instead of violating the foreign key. (SmittyCode `20ca2bf`)
- `POST /api/v1/brands` and `POST /api/v1/profiles` no longer 307-redirect to the trailing-slash form. (SmittyCode `2efd969`, `230540c`)
- Vite preview accepts `.up.railway.app` hosts plus any listed in `PREVIEW_ALLOWED_HOSTS`. (SmittyCode `d999fef`, adapted)

### Not taken from this fork
- Removing the brand-to-profile filter in the ad wizards (product decision, not a bug).
- The alternate R2 upload rewrite; main already carries an equivalent fix.
- The contributor's `AGENTS.md`.

Plan: none (external contribution review). Tests: backend pytest 99 passing, 1 xfailed; `startup.py` exercised against empty, migrated, and unversioned local databases; frontend `vite build` OK.

## [2026-09-03]

### Changed
- This repo is now the canonical codebase. The private `A4DLLC/breadWinner.com` repo is retired; production deploys from `main` here.

### Fixed
- Generated images now upload to Cloudflare R2 instead of local disk, so they survive redeploys (ported from breadWinner `cc921a1`).
- Database engine uses `pool_pre_ping`, `pool_recycle`, and a connect timeout to recover from dropped Railway connections (ported from breadWinner `cc921a1`).
- Batch save endpoint logs full tracebacks on failure (ported from breadWinner `cd71f4b`).
- Backend test suite: disable the slowapi login rate limit under pytest. Fixtures log in per test and were tripping the 5/min limit, failing 77 of 100 tests since the public-release hardening commit.

Plan: none (port of existing fixes). Tests: backend pytest 99 passing, 1 xfailed (local Postgres 15, Python 3.12).
