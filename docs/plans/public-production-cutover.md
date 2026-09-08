# Public production cutover

Status: implementation authorized; acceptance checks in progress.

## Outcome

Hosted users and public installers receive the same maintained application. Creative provenance, cross-platform analytics, request controls, and posting recovery remain available after the repository transition. The former private repository becomes an archived record after production verification.

## Acceptance criteria

- [x] Carry missing production runtime, migrations, and tests into public history without importing private ancestry, credentials, customer data, or private release evidence.
- [x] Retain current public installer behavior, product branding, dependency updates, and upload/Graph API security fixes.
- [x] Support fresh databases and upgrades from both `bw_install_001` and `analytics_20260911`; preserve users, password hashes, encrypted credentials, and existing ad IDs.
- [ ] Pass backend, frontend, browser, migration, and container checks on the combined public revision.
- [x] Scan tracked files and outgoing history for secrets, internal URLs, personal paths, and deployment/customer identifiers. Review existing public-history findings separately from the new change.
- [ ] Merge the verified public PR and connect the existing hosted API, frontend, and worker to public main while preserving database, storage, environment values, and domain configuration.
- [ ] Verify production health, login, creative library, analytics, settings, and worker status at the public revision.
- [ ] Archive the private repository after deployment verification and account for its remaining open work.
- [ ] Remove task-owned test databases and stop task-owned servers.

## Validation

Phase 0: `backend/tests/integration/test_public_cutover.py` verifies a single migration head joining both released database histories. It fails on public main before integration.

Upgrade coverage runs both released schema baselines in disposable localhost PostgreSQL databases and checks preserved test records after startup. Existing posting, creative, analytics, installation, upload security, and Graph read tests run with the combined backend suite. Frontend unit tests, production build, Playwright flows, agent-browser production checks, and installation container checks cover application compatibility.

Hygiene coverage uses Gitleaks default rules with full redaction plus a repository-specific tracked-content checker. Scan reports retain paths, rules, and counts, never matching secret values. Scan outgoing commits before pushing. Keep detailed hosted deployment evidence outside the public repository.

## Release sequence

1. Record source revisions and deployment configuration; work from public main in an isolated worktree.
2. Reconcile selected files and add an additive migration merge. Review conflicts against both released versions.
3. Complete tests and hygiene scans, then publish and merge the public PR.
4. Check production schema and backup availability; switch service sources and deploy the verified public commit.
5. Verify hosted behavior and worker readiness; archive the private repository and document canonical development location.

No live ad launches, paid generation, customer notifications, or irreversible data deletion are part of acceptance testing. Production secrets remain in their existing storage.

## Unresolved questions

None. Repository publication, Railway cutover, hygiene scanning, and archival are authorized.

## Verification evidence

- Phase 0 migration graph check failed before integration and passed after joining the released heads.
- Full combined backend suite: 613 passed with one existing XPASS. Final storage, migration, and security subset: 71 passed after the last integration edits.
- Frontend: 98 unit tests and production build passed. Browser acceptance verified external image/video uploads, creator attribution, frozen launch metadata, analytics source imports, patterns, metadata revisions, mobile layouts, and saved Meta request settings with simulated providers and isolated PostgreSQL.
- Gitleaks candidate scan and tracked example-environment scan: zero findings. Public content policy: zero findings. Known deployment credentials were compared in memory against the candidate; none matched.
- Existing public history contains a fixed test-only encryption key in two old test/CI files. It is absent from current code and differs from the configured deployment keys. Existing public history was not rewritten.
- Removed 90 previously tracked upload artifacts from the published tree; local copies remain ignored. Private history, private evidence, and runtime secret files were not exported.
- Deployment images and hosted acceptance are pending release CI and cutover. Local Docker daemon was unavailable, so container verification runs in CI.
