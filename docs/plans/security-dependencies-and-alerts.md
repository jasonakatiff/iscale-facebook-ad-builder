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
- [ ] Backend, frontend unit/build/coverage, installation and container checks pass
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
the fix. GitHub CI and merge verification are next. No unresolved questions.
