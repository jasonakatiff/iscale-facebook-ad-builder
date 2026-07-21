# PROJECT_BRIEF.md — NALARIN Ads Studio

Single source of truth across all chats/sessions for this project. Update Sections 7+8 every sprint.

## 1. Project Overview

Standalone (non-monorepo) full-stack app to **manage and optimize paid ads** across
**Meta (Facebook/Instagram)**, **Google Ads**, and **TikTok Ads** from one unified
dashboard. Forked from `iscale-llc/iscale-facebook-ad-builder` (MIT), which already
provides Meta ad management. This project extends it with Google Ads and TikTok Ads
modules, plus a cross-platform reporting view.

- **Repo**: `D:\PROJECTS\adbuilder-studio` (own git repo, forked on GitHub — NOT part
  of the `nalarin` pnpm monorepo, per explicit instruction: "app baru, tidak untuk
  tambahkan fitur app lain").
- **Product name**: NALARIN Ads Studio (display name only; repo/folder name stays
  `adbuilder-studio` — renaming would break the existing fork/git history for no
  functional benefit).
- **Target deploy**: `https://ads.nalar.army` (Docker Compose, Caddy reverse proxy,
  same pattern as the MedSos deployment). This is a **firm requirement**, not
  tentative: standalone repo, standalone subdomain, standalone Postgres — never
  merged into the `nalarin` pnpm monorepo or any existing app.
- **Access control**: the app requires login for every route — inherited from the
  fork (JWT auth, `PrivateRoute` wrapper on the frontend, `get_current_active_user`
  dependency on the backend). This is a **firm requirement**: every new page/route
  added in Sprints 1-3 (Google Ads, TikTok Ads, Overview) must be wrapped by the
  same gate — no route may render dashboard data without a valid session. See
  Sprint 1/3 Task "Auth gate verification" and the Sprint 4 verification checklist.
- **Telegram integration**: a dedicated Hermes bot profile (`ads-studio-agent`) is a
  **required** Sprint 4 deliverable, not optional — same safety pattern as
  `medsos-agent` (new profile, own bot token, scoped read-only + draft-only API
  key, never reusing an existing Hermes profile/bot).

## 2. Concept / Product Description

One dashboard, three tabs (Meta / Google / TikTok), plus a combined "Overview" page
that shows spend, ROAS, and campaign health side by side across all connected
platforms. AI-assisted ad copy/image generation (already built for Meta) is the
differentiator vs. plain "Ads Manager" clones.

## 2a. UX / Design System (verified 2026-07-21, do not re-guess this)

- **Existing visual language**: amber/cream "BreadWinner" palette (`bg-[#FFFAF0]`
  page background, `amber-600`/`amber-900` accents), plain Tailwind (no
  theme customization in `tailwind.config.js`), `lucide-react` icons only — no
  component library (no Radix/shadcn/Headless UI). Cards are consistently
  `bg-white rounded-xl border border-gray-200 shadow-sm`.
- **No charting library exists.** Added `recharts` as the decision for Sprint 1
  (see Sprint 1 Task 9) — use it for Sprint 2's Overview page too, don't
  introduce a second charting approach.
- **No existing "Connect Account" UI to copy.** Meta integration uses a single
  static `.env` token (not per-user OAuth), so Google Ads (Sprint 1) is the
  *first* OAuth-connect UI in this app. Corrected an earlier wrong assumption
  that `FacebookCampaigns.jsx` was a reusable reference — it is actually a
  6-step ad-creation wizard, unrelated to account connection or performance
  viewing.
- **`Reporting.jsx` is mock data only** (hardcoded numbers, not wired to any
  API) — do not treat it as a working reference for real data-bound tables.
- **New shared components** (built once in Sprint 1, reused by Google/TikTok/
  Meta-if-retrofitted and the Sprint 2 Overview page): `ConnectAccountCard.jsx`,
  `PerformanceTable.jsx`. Any future platform tab must compose these, not
  reimplement its own card/table markup.

## 3. Tech Stack

- **Backend**: FastAPI (Python 3.11+), SQLAlchemy + Alembic, PostgreSQL, existing
  service-per-platform pattern (`app/services/facebook_service.py` etc.)
- **Frontend**: React 19 + Vite, Tailwind, page-per-feature pattern
  (`src/pages/FacebookCampaigns.jsx` etc.)
- **AI**: Google Gemini (copy), Fal.ai (images) — already wired for Meta, reused as-is.
- **Deployment**: Docker Compose (already set up for the Meta MVP), Caddy, cloudflared
  — mirrors the MedSos NALARIN deployment pattern exactly.
- **New for this project**:
  - `google-ads` (Python client library) for Google Ads API
  - TikTok Business API (`business-api.tiktok.com`) — official REST, no official
    Python SDK, use `httpx` directly

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React (Vite) — Dashboard                                │
│  ├─ Overview (cross-platform)                            │
│  ├─ Meta tab (existing: Campaigns, Research, AdRemix...)  │
│  ├─ Google Ads tab (NEW)                                  │
│  └─ TikTok Ads tab (NEW)                                  │
└───────────────────────┬───────────────────────────────────┘
                         │ REST (api/v1)
┌───────────────────────▼───────────────────────────────────┐
│  FastAPI backend                                          │
│  ├─ services/facebook_service.py   (existing)              │
│  ├─ services/google_ads_service.py (NEW)                   │
│  └─ services/tiktok_ads_service.py (NEW)                    │
└───────────────────────┬───────────────────────────────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        Meta Graph   Google Ads   TikTok Business
        API          API          API
```

## 5. Key Files Map

| Path | Purpose |
|---|---|
| `backend/app/services/facebook_service.py` | Existing Meta integration — reference pattern |
| `backend/app/services/google_ads_service.py` | NEW — Google Ads client wrapper (Sprint 1) |
| `backend/app/services/tiktok_ads_service.py` | NEW — TikTok Ads client wrapper (Sprint 3) |
| `backend/app/api/v1/` | Route modules, one per platform |
| `backend/app/models.py` | SQLAlchemy models — add `GoogleAdsConnection`, `TikTokAdsConnection` |
| `backend/alembic/` | Migrations for the new connection tables |
| `frontend/src/pages/FacebookCampaigns.jsx` | Existing Meta UI — reference pattern |
| `frontend/src/pages/GoogleAdsCampaigns.jsx` | NEW (Sprint 1) |
| `frontend/src/pages/TikTokAdsCampaigns.jsx` | NEW (Sprint 3) |
| `frontend/src/pages/Overview.jsx` | NEW (Sprint 2) — cross-platform summary |
| `docker-compose.yml` / `docker-compose.prod.yml` | Deployment config |

## 6. Team Roles (solo + AI agent — informal mapping)

Single human operator + one AI agent doing all roles (Sage-style backend, Nova-style
frontend, Remy-style planning). No multi-chat split needed at this scale — documented
here only so the plan structure stays compatible with the orchestration skill.

## 7. Sprint Status

| Sprint | Scope | Status |
|---|---|---|
| 1 | Google Ads integration (read-only: OAuth + campaign/ad performance) | ✅ Implemented; OAuth verified end-to-end |
| 2 | Google Ads write actions + cross-platform Overview page | ✅ Implemented; preview + explicit confirmation safety guard |
| 3 | TikTok Ads integration (research + read + write) | ✅ Implemented fail-closed; awaiting TikTok developer app approval |
| 4 | Deploy to `ads.nalar.army` (Docker/Caddy/cloudflared) + **required** Hermes Telegram bot (`ads-studio-agent`) | 🟨 Site live; read-only bot API/profile ready, awaiting dedicated BotFather token |
| 5 | Hardening: tests, security review, docs, handoff | ✅ Code/tests/docs completed; external provider prerequisites remain |

## 8. Current State

(2026-07-21) The standalone production app is live at `https://ads.nalar.army`
through Docker Compose, Caddy, and cloudflared. Public root and health return 200;
unauthenticated data APIs return 401. Google Ads OAuth was verified through real
Google consent and persists encrypted OAuth tokens, but the currently connected
customer reports `CUSTOMER_NOT_ENABLED` until Google API/developer-token/account
access is enabled. TikTok OAuth/reporting/campaign implementation is present but
intentionally returns a clear unconfigured response until a TikTok for Business
developer app receives Marketing API approval. The dedicated `ads-studio-agent`
Hermes profile is isolated from MedSos/GitHub credentials and has an owner-bound
`ads:read` key only; its live API reports `can_spend=false` and exposes no write
route. It awaits a dedicated BotFather token before its Telegram gateway starts.

## 9. Security Rules

- Never commit `.env`, tokens, or client secrets — `.gitignore` already covers this
  (inherited from fork) plus `.gitleaks.toml` pre-commit scanning.
- Encrypt stored OAuth refresh tokens at rest (mirror `@nalarin/utils/crypto` pattern
  from Optima — same encrypt/decrypt approach, reimplemented in Python with
  `cryptography.Fernet` since this is a separate Python codebase).
- All new API routes require the existing auth middleware (this app already has
  Login/Register + JWT — reuse, do not bypass).
- OAuth state parameter required on every OAuth flow (CSRF protection) — same as
  Optima's `google-ads-oauth-state` cookie pattern.
- Rate-limit new platform API calls (reuse `rate_limiter.py`, already present for Meta).

## 10. How to Run Locally

```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev

# Full stack (Docker)
docker compose up -d
```

## 11. How to Deploy

Sprint 4 target: Docker Compose → Caddy `ads.nalar.army` block → cloudflared ingress
entry. Exact steps mirror `docs/repo-memory` notes for the MedSos deployment (see
`nalarin` repo memory: `/memories/session/medsos-studio-plan.md` for the proven
Caddy `header_up X-Forwarded-Proto https` fix — apply proactively this time instead
of hitting the same 3 bugs again).

## 12. Cross-Chat Handoff Protocol

Since this is a single-operator project (no parallel dev/QA chats needed at this
scale), handoff is sequential across sessions:
- Before ending a session, update Section 7 + 8 above and the current sprint's
  `docs/sprint-N/progress.md`.
- Cold start prompt for a new session: *"Read PROJECT_BRIEF.md and
  docs/sprint-N/progress.md. Continue from where it left off."*

## 13. Bug & Fix Tracking

Use GitHub Issues on the fork (`gh issue create`) for anything non-trivial found
during a sprint. Reference issue numbers in commits: `fix: ... (Fixes #N)`.

## 14. Multi-Repo Setup

Single repo, single branch strategy: `main` is always deployable. Work happens
directly on `main` for this solo project (no PR review step needed) unless a change
is large/risky, in which case use `feature/sprint-N` and merge (not rebase) when the
sprint's plan is complete.

---

## Autonomous Decision Log (per "tidak tanya tanya saya")

Decisions made without stopping to ask, so future sessions understand the "why":

1. **Kept repo name `adbuilder-studio`** instead of renaming — avoids breaking the
   existing GitHub fork remote/history for a cosmetic change only.
2. **Reuse Google Cloud project `nalarin-500102`** (same one used by Optima and
   MedSos/YouTube) instead of creating a new GCP project — it already has the
   Google Ads API enabled and is already verified for OAuth consent (no fresh
   verification wait).
3. **New OAuth Client for this app, same GCP project** — cleaner isolation than
   reusing Optima's exact client ID (different redirect URI/app), still zero extra
   verification since it's the same already-configured project.
4. **TikTok deferred to Sprint 3** (after Google, not in parallel) — Google Ads
   integration has a known-working reference implementation to port (Optima);
   TikTok Business API registration friction is unknown and shouldn't block Google
   Ads shipping first.
5. **No multi-tenant developer-token input UI** (unlike Optima, which asks each user
   for their own token) — this app is single-operator, so the Google Ads developer
   token is stored server-side in `.env`, simpler for this use case.
6. **Deploy port**: `3024` (next free port after MedSos's `3023`, per NALARIN port
   allocation convention) — reserved for Sprint 4, not used yet.
7. **Hermes bot upgraded from optional to required** (per explicit instruction:
   "integrasikan dengan hermes / bot hermes telegram") — Sprint 4 Task 6 rewritten
   accordingly; dashboard stays primary, bot is a required secondary channel for
   alerts/quick read queries (mirrors Optima's dashboard+bot split).
8. **Login gate confirmed as a hard requirement** (per explicit instruction: "buat
   ada login ketika akses") — the fork already has one (JWT + PrivateRoute +
   `get_current_active_user`); no new work needed to add it, only verification
   tasks added to Sprints 1/3/4 to ensure new routes don't accidentally bypass it.
