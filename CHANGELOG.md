# Changelog

## [2026-09-03]

### Changed
- This repo is now the canonical codebase. The private `A4DLLC/breadWinner.com` repo is retired; production deploys from `main` here.

### Fixed
- Generated images now upload to Cloudflare R2 instead of local disk, so they survive redeploys (ported from breadWinner `cc921a1`).
- Database engine uses `pool_pre_ping`, `pool_recycle`, and a connect timeout to recover from dropped Railway connections (ported from breadWinner `cc921a1`).
- Batch save endpoint logs full tracebacks on failure (ported from breadWinner `cd71f4b`).

Plan: none (port of existing fixes). Tests: `py_compile` OK on changed files; pytest not run (no database available in this session).
