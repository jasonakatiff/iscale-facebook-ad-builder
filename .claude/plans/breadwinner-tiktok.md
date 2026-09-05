# Plan: BreadWinner frontend restoration
Status: complete
Started: 2026-09-04
Updated: 2026-09-04

## Acceptance Criteria
- [x] Restore BreadWinner defaults, upstream logo, HTML shell, and production env template.
- [x] Remove public information pages, contributor process documents, and production compose file.
- [x] Dashboard renders at `/`; Overview renders at `/overview`; navigation matches.
- [x] Preserve ErrorBoundary and Google/TikTok routes.
- [x] Use generic integration env examples and append integration setup to upstream README.
- [x] Keep optional Docker files with backend host port 8000.
- [x] Load TikTok campaigns after connection discovery, date changes, and advertiser changes; display request errors.
- [x] Preserve Railway preview hosts and backend proxy configuration.
- [x] Build passes; added/edited frontend files have no lint errors; regression tests pass.
- [x] Commit as Jason Akatiff <jasona@iscale.com>; no push; clean worktree.

## Implementation Steps
- [x] Phase 0: Write Tests — TikTok component regression scenarios and baseline lint.
- [x] Restore branding, routes, docs, and deployment templates.
- [x] Fix TikTok loading and lint errors in added/edited files.
- [x] Run unit tests, build, lint, upstream comparisons, scope and identity scans; attempt browser smoke.
- [x] Update changelog and commit.

## Test Layers
- Gherkin: `tests/features/breadwinner-tiktok.feature` records frontend acceptance scenarios.
- Unit: `src/pages/TikTokAdsCampaigns.test.ts` exercises the rendered component, real table, and date control with an isolated frontend transport fixture.
- Auth: browser smoke planned for protected-page redirects; blocked by browser launch failure. Route registration and guards were inspected statically.
- Walking skeleton, API endpoint, migrations, DB constraints, pagination, error contracts, audit logs, relationships, and redaction: outside this frontend-only task; backend is owned separately.

## Progress Notes
- 2026-09-04: User authorized all implementation and local commit through the complete specification. Baseline lint: 90 errors, 25 warnings.
- 2026-09-04: Four backend files contain contributor identity matches and cannot be edited in this task.

## Verification Results
- Unit tests: 6 passed across 2 files. The new TikTok suite failed 4 of 5 cases before implementation and passes all 5 afterward.
- Build: `npm run build` succeeded in 1.88s; existing bundle-size and stale browser-mapping warnings remain.
- Lint: all 14 PR-added/currently-edited JavaScript and test files have 0 errors and 0 warnings. Full frontend lint retains 81 errors and 25 warnings in untouched files (baseline: 90 errors, 25 warnings).
- HTTP smoke: local Vite became ready; homepage and restored logo each returned HTTP 200.
- Browser smoke blocked: agent-browser could not launch Chrome, including a retry with its suggested launch option. No managed browser was available as a fallback.
- Configuration and scope: 31 specification checks passed, plus checks for protected routes, navigation, ErrorBoundary, Railway hosts, env hooks, and both proxies.
- Exact upstream matches: logo, index HTML, production env template. README preserves the upstream file as an exact prefix.
- Whole-repository identity scan retains matches in `backend/app/core/config.py`, `backend/app/services/google_ads_oauth.py`, `backend/tests/unit/test_meta_ads.py`, and `backend/tests/unit/test_overview.py`. The specification prohibits edits there. No matches outside backend and the permitted changelog.
- No backend, `.github/`, user secret, or dependency files changed. No push or external data writes.
- Evidence logs are in ignored `test-results/` at the worktree root.

## Bug Catches
- Component regression: missing initial load, missing date reload, missing advertiser reload, and absent network-error notification.

## Unresolved Questions
None.
