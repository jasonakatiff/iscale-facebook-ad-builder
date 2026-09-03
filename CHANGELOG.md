# Changelog

## [2026-09-03]

### Changed
- This repo is now the canonical codebase. The private `A4DLLC/breadWinner.com` repo is retired; production deploys from `main` here.

### Fixed
- Generated images now upload to Cloudflare R2 instead of local disk, so they survive redeploys (ported from breadWinner `cc921a1`).
- Database engine uses `pool_pre_ping`, `pool_recycle`, and a connect timeout to recover from dropped Railway connections (ported from breadWinner `cc921a1`).
- Batch save endpoint logs full tracebacks on failure (ported from breadWinner `cd71f4b`).
- Backend test suite: disable the slowapi login rate limit under pytest. Fixtures log in per test and were tripping the 5/min limit, failing 77 of 100 tests since the public-release hardening commit.

Plan: none (port of existing fixes). Tests: backend pytest 99 passing, 1 xfailed (local Postgres 15, Python 3.12).
