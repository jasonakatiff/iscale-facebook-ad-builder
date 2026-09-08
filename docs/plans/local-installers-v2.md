# Repair v2 local installation paths

Status: acceptance verified; publication through PR #52
Started: 2026-09-08

## Outcome

Developers can initialize Ad Studio from an empty PostgreSQL database through the setup command or Docker Compose. Repeating setup and recreating containers preserves the owner, signing/encryption configuration, saved provider credentials, and creative media.

## Acceptance criteria

- [x] `setup.sh --check` validates Python/Node and supplied database/signing/encryption settings without installing dependencies, connecting to a database, writing secret files, or printing credentials.
- [x] Setup reports missing or malformed settings before changing the environment; it never generates or replaces signing/encryption keys.
- [x] Setup initializes through `startup.bootstrap_database`, creates one owner and pending onboarding state on an empty database, and preserves the owner and encrypted provider settings on reruns.
- [x] Setup documents backend, sync worker, and frontend commands, with a dependency-install skip mode for an already configured development environment.
- [x] Compose runs PostgreSQL, backend, sync worker, and Vite; the backend bootstraps before serving and the worker waits for readiness.
- [x] Compose reads explicitly supplied process settings, keeps secrets out of frontend configuration, and binds HTTP ports to loopback.
- [x] Named database and media volumes survive container recreation; frontend dependencies use a container volume rather than the host node_modules directory.
- [x] Fresh Compose install, owner login, pending setup, worker heartbeat, provider-key decryption, media persistence, and cleanup pass using disposable resources in CI.
- [x] README and changelog describe verified supported paths and link this plan.

## Scope and authorization

Jason authorized repairing the two open findings from the release consistency audit. Work targets the public repository through a checked PR. Existing Railway deployment behavior, authentication contracts, database schema, and private production deployment are unchanged. No secret files are created or edited. Test credentials exist only in test-process environments and disposable database/container state.

## Phase 0: Tests

- `backend/tests/local_setup/test_local_setup.py`: stdlib tests for environment validation, credential preservation, fail-closed command handling, and setup output. Run with `python3 -m unittest discover -s backend/tests/local_setup -v`.
- `backend/tests/integration/test_installation_bootstrap.py`: exercise the actual setup command on an isolated PostgreSQL database, including reruns and saved credential decryption.
- `backend/scripts/check_compose_installation.py`: exercise the checked-in Compose file with fresh named volumes and recreate its services; capture cleanup evidence. Run after image builds in the existing deployment-images CI job.
- The old wizard is not executed during Phase 0 because it writes secret files. Initial regression failures establish absent v2 validation/entry points without invoking that writer.

## Implementation

1. Add a process-environment preflight/bootstrap helper that reuses existing startup logic.
2. Replace the secret-writing wizard with a guided dependency/setup command and explicit check/skip-install modes.
3. Correct Compose bootstrap, add the worker, readiness checks, and persistent media/dependency volumes.
4. Add fresh-install/recreation verification to CI and update customer/developer documentation.

## Verification

Local Docker daemon is unavailable. Local PostgreSQL 15 binaries and Python 3.12 are available for isolated setup tests. Compose runtime verification ran successfully on GitHub's Docker runner; local Compose configuration validation did not require a daemon. No paid providers or production data will be used. Every task-owned local process and CI resource is cleaned up after testing.

Local evidence: the initial six helper tests failed because the v2 helper did not exist; the old secret-writing wizard was never executed. Eight completed preflight/CLI tests now pass. Four real PostgreSQL integration tests pass, including empty/concurrent bootstrap and actual setup-command reruns preserving one owner, its password hash, and the unchanged encrypted provider key with successful decryption. `bash -n setup.sh`, Python compilation, and Docker Compose configuration checks pass. Compose rejects missing signing/encryption settings and keeps frontend configuration free of secrets. The owned PostgreSQL PID 81997 exited, port 57187 was verified closed, and its disposable cluster was moved to Trash.

## Release and documentation

[PR #52](https://github.com/jasonakatiff/theleadrouter-ad-studio/pull/52) passed all required checks on implementation head `24ccee9`. [Test Suite evidence](https://github.com/jasonakatiff/theleadrouter-ad-studio/actions/runs/34248307984) confirms the actual Compose file bootstraps an empty database and serves owner login through Vite, saves encrypted credentials, records worker heartbeats, and preserves the owner/JWT/setup state/provider key/media after `down` and `up`. All test containers, volumes, and networks were removed. The existing container verification also passed.

Frontend verification passed 85 unit tests, a production build, and 41 browser tests; 27 existing tests requiring a separate live app were skipped. The installation/telemetry workflow passed five browser tests with simulated AI. CodeQL and secret checks passed. Documentation support claims now correspond to verified local setup and Compose behavior. No paid AI generation, hosted deployment, or private-repository changes form part of this repair.

## Unresolved questions

None.
