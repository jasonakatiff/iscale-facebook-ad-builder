# Sprint 8 — Progress: UX polish paralel (3 Sep 2026)

## Task
Kerjakan paralel setelah QA: (A) mobile heading scale halaman lama,
(B) token-expiry warning Meta, (C) ErrorBoundary global.

## Perubahan (commit `136b37a`, pushed ke fork, PR #3 auto-include)

A — Mobile heading scale (1 rule, 24+ halaman):
- `index.css`: `@media (max-width:639px)` mengecilkan `main h1` (1.5rem) dan
  `main h2` (1.25rem). Halaman legacy desktop-first (Dashboard, Brands,
  Research, CreateAds, Settings, WinningAds, GeneratedAds, Reporting) dapat
  floor mobile tanpa edit per-file JSX.

B — Token-expiry warning:
- `facebook.py` `/connection`: expose `token_expires_at` (naive datetime
  dinormalisasi UTC) + test baru.
- `ConnectAccountCard`: prop `warning` (notice amber inline) + stacking mobile.
- `FacebookCampaigns`: `metaTokenWarning` — badge kalau token expired atau
  ≤7 hari sebelum expired, arahan reconnect SEBELUM Meta 401 merusak flow.

C — ErrorBoundary:
- Komponen class global di App (luar semua provider). Render crash = retry
  card (bukan white screen); `console.error` untuk triage.

## QA (semua pass sebelum commit)
- pytest: **123 passed** (122 + 1 token-expiry) — postgres docker ephemeral
- vitest: 1 passed; vite build: pass
- Review diff: +130/−7, additive, tanpa perubahan model/migration

## Deploy + verifikasi live
- Backend + frontend container rebuild → healthy
- `/health` 200; `/facebook/connection` 401 anonim (route hidup)
- Bundle live: ErrorBoundary ("Something went wrong" + retry) terkandung;
  CSS live: `@media(max-width:639px){main h1...}` ter-bake
- E2e: login smoke → Overview + Facebook Campaigns render normal, kartu baru
  muncul; cleanup smoke user (prod DB 2 user asli)

## Status
- Prod: sprint-8 live. main = fork/main = `136b37a`. Working tree clean.
