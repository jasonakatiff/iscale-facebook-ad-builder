# CodeQL security findings — 2026-09-08

Status: in-progress

## Outcome

Prevent campaign writers from fetching private network resources or uploading
server files through Facebook media uploads. Constrain Facebook Graph reads and
keep telemetry redaction responsive for hostile input. Classify all six critical
and eleven high alerts against current code with reproducible evidence.

## Scope and authorization

Jason authorized validation and fixes after the GitHub security setup. Target:
`jasonakatiff/theleadrouter-ad-studio`, base `cd83d131301b44548bf1e1b0261661df034f485c`,
branch `fix/security-codeql-findings`. Prepare a pull request and run CI. No
production application deployment, provider writes, database migrations, or
unrelated dependency PR merges are included.

## Acceptance criteria

- [x] Facebook image/video uploads reject private addresses, unsafe redirects,
  non-HTTP schemes, and all caller-supplied filesystem paths before provider upload.
- [x] Public media uses the existing DNS-pinned downloader with byte/time limits;
  temporary files close on success and provider failure.
- [x] Graph reads reject path/query injection and HTTP redirects while preserving
  supported account, ad, insight, video, and thumbnail reads.
- [x] Telemetry redaction preserves credential/email/query removal and completes
  bounded hostile inputs within a regression-test deadline.
- [x] Each of the 17 critical/high alerts has a fix or an evidence-backed
  non-exploitable classification. No security alert is silently dismissed.
- [ ] Focused regressions, the backend suite, and required GitHub checks pass.

## Phase 0: Tests

- `backend/tests/security/test_codeql_regressions.py`: public media boundaries,
  redirect/DNS rebinding resistance, local-file rejection, cleanup, Graph paths,
  and telemetry redaction timing.
- Existing `tests/posting/test_media.py`, `tests/posting/test_provider.py`,
  `tests/test_video_upload.py`, `tests/unit/test_theme_library.py`, OAuth/key and
  telemetry tests cover compatibility and existing mitigations.
- Run with the existing Python 3.12 environment and a new localhost
  `test_delivery_security_20260908` database. No shared database or live Meta call.

## Implementation

1. Reuse `app.delivery.media.download_media` in legacy Facebook upload methods.
2. Validate Graph IDs/edges and disable redirects on the three flagged readers.
3. Replace ambiguous email/URL redaction regexes with bounded token processing.
4. Record the full alert triage, update the changelog, and prepare the PR.

## Verification

Phase 0 reproduced 38 failures with 6 baseline passes, then two API validation
failures. After fixes, 139 focused tests passed (including an added URL-userinfo regression). Outbound provider calls are mocked;
database tests use real local PostgreSQL. No browser UI behavior is being changed.
The full backend suite passed: 504 passed and one pre-existing XPASS in 131.48 seconds.
That run preceded the final redaction-order change; the affected 139-test group was
then rerun successfully. GitHub CI will run the complete final revision.

Detailed per-alert evidence is in
[CodeQL triage](../security/codeql-triage-2026-09-08.md).

## Initial triage

- #16/#17: arbitrary URLs and local paths reach legacy upload methods; confirmed.
- #12/#13: caller-controlled temp suffix/removal and local-file upload paths;
  resolved by the same managed downloader change.
- #23/#24/#25: fixed Graph host; path and redirect validation need hardening.
- #18: both theme import and refresh apply a strict GitHub URL validator;
  redirects and environment proxies are already disabled.
- #20/#21: overlapping unanchored redaction patterns require a timing regression.
- #11/#14/#15/#19/#26/#27/#28: trace source and sink before classification.

## Unresolved questions

None for implementation. Production merge/deployment is outside this authorization.
