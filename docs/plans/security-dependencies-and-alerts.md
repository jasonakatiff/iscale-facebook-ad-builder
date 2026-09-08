# Critical dependencies and remaining CodeQL findings

## Outcome

Remove the three known critical dependency vulnerabilities without breaking owner
login, OAuth, frontend tests or installation. Stop campaign preflight responses
from exposing provider exception details. Limit CI token access and pin the
third-party coverage action. Reconcile the remaining CodeQL alerts using actual
callers and tests.

## Scope and acceptance

- [x] Upgrade python-jose to 3.5.0 and verify OpenSSH ECDSA keys cannot be used as
  HMAC secrets; existing login, OAuth state and token tests pass.
- [x] Upgrade Vitest and its matching coverage provider to 3.2.7; resolve
  shell-quote to a patched release in the lockfile; no critical npm audit findings.
- [x] Preflight returns fixed messages for unexpected errors and preserves trusted
  campaign validation guidance, status codes and the existing response shape.
- [x] All three workflows declare read-only contents permissions. The Codecov
  action uses a verified commit SHA allowed by repository policy.
- [x] Review all 21 remaining CodeQL entries. Implement supported fixes and record
  source/test evidence for false positives; no blanket scanner exclusions.
- [x] Backend, frontend unit/build/coverage, installation and container checks pass
  on the final PR revision. Review the final diff locally and verify clean secrets
  scanning before push. No production credentials, paid providers or customer DBs.

## Verification

Phase 0: add `backend/tests/security/test_dependency_hardening.py` for the vulnerable
JWT key handling and campaign exception response. Run it against the existing
python-jose 3.3.0 before changing requirements or response handling.

Run backend tests in an isolated local PostgreSQL database with explicit dummy
configuration. Run frontend `npm ci`, `npm run test:coverage` and `npm run build`.
Use the repository's required CI for Python 3.11, browser installation journeys
and disposable container persistence. Record dependency audit results separately
from CI success because the existing advisory job does not enforce its results.

## Release and boundaries

The target is public `jasonakatiff/theleadrouter-ad-studio`, starting from merged
PR #48 (`e2bbeaf`). Other open PRs are separate work. Publish a tested security PR;
this source change does not deploy the separate private BreadWinner installation.
Account authentication settings and unrelated dependency upgrades are outside this
follow-up. Existing high/medium dependency findings remain explicitly tracked.

## Status

Local verification complete: 509 backend tests passed with one existing XPASS;
85 frontend tests and coverage/build passed; npm audit has zero critical entries.
The new JWT and exception tests failed on the old implementation and pass after
the fix. After syncing PR #49, seven affected tests passed locally.

GitHub CI passed on `012da5efbedf5d7aea8d96cb9380e96d9b4f9008`:

- [Test Suite](https://github.com/jasonakatiff/theleadrouter-ad-studio/actions/runs/34244927110):
  512 backend tests, one existing XPASS and two subtests; 85 frontend unit tests,
  production build, 41 browser tests and container startup/persistence passed.
  The 27 existing browser tests requiring a separate live app were skipped.
- [Installation](https://github.com/jasonakatiff/theleadrouter-ad-studio/actions/runs/34244927004):
  all five installation/telemetry browser tests passed against isolated PostgreSQL
  and simulated provider responses. No paid or production operation was run.
- All ten PR checks, including CodeQL and GitGuardian, passed. The reviewed
  false-positive alerts were individually dismissed with comments linking PR #50;
  the eleven repaired findings await the merged default-branch scan.
- Local test databases were dropped and their absence verified. No local app
  server was started.

[PR #50](https://github.com/jasonakatiff/theleadrouter-ad-studio/pull/50) tracks the
final documentation revision, required checks, and merge receipt. The final head
must pass the active ruleset before merge. No unresolved implementation questions.
