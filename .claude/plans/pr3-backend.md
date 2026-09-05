# Plan: PR3 backend Railway compatibility and security
Status: complete
Started: 2026-09-04
Updated: 2026-09-04

## Acceptance criteria
- All 12 specification fixes implemented, with existing assertions preserved.
- Full backend pytest suite passes using the supplied environment.
- Empty bootstrap, upstream schema upgrade, and legacy/new refresh flows pass on disposable local PostgreSQL databases.
- Small commits authored by Jason Akatiff <jasona@iscale.com>; no push; clean worktree.
- Changes confined to this worktree, excluding the paths reserved by the specification.

## Implementation steps
- [x] Phase 0: Write Tests
- [x] Restore migration history and additive refresh-token rollout.
- [x] Bind OAuth callbacks to cookies, enforce permissions and bot ownership, preserve account selection.
- [x] Restore Meta env fallback, isolate SDK instances, exchange long-lived tokens.
- [x] Correct Railway proxy, API docs CSP, TikTok dates, brand, and CI defaults.
- [x] Run full suite and all migration acceptance checks; record output; commit.

## Test layers
- Acceptance scenarios: migration bootstrap/upgrade and security behaviors recorded here and in Python tests.
- Walking skeleton/API/auth: real FastAPI TestClient requests and local PostgreSQL sessions.
- Unit: external SDK/HTTP boundary fakes; date boundaries and SDK instance isolation.
- Migration/constraints: real PostgreSQL, schema comparison, unique hash index, retained legacy rows.
- Cross-entity: bot key owner and connection owner isolation.
- Error contracts: existing HTTP status and detail assertions retained.
- Redaction: encrypted Meta token storage and hash-only refresh lookup.
- Pagination and audit logs: no changes to these contracts.
- Browser/UI: no UI changes; API docs verified with TestClient.

## Progress notes
- 2026-09-04: Read complete task; worktree initially clean. User authorizes implementation and local codex_ database lifecycle; no extra approval needed.

- 2026-09-04: Targeted red run: 43 failed, 31 passed. Migration check reproduced missing add_page_fields_001. Global validator passed 3/4 because it only scans root TypeScript tests; worktree-local Python adaptation passed 4/4.

- 2026-09-04: All 12 fixes implemented. Full suite on fresh codex_test: 214 passed, 1 existing XPASS, 1 existing warning. All three migration acceptance checks pass on PostgreSQL 15.15; schemas/defaults/indexes/FKs match, repeated upgrades are idempotent, plaintext rows survive, new login/refresh works. Encryption-key fallback verified with the variable unset (3 docs tests pass).
- 2026-09-04: Reserved paths unchanged; no push or production operations. Evidence saved in backend/PR3_VERIFICATION.md. Local test databases cleaned up.

## Bug catches
- 43 targeted failures reproduced before fixes, including all seven inherited Google write confirmation failures.
- PostgreSQL migration acceptance reproduced the missing production revision before restoration.
- Split-origin cookie regression reproduced Secure cookies using SameSite=Lax; HTTPS now uses SameSite=None.

## Unresolved questions
None.
