# Sprint 5 — Hardening & Handoff

**Goal**: Make it solid enough to leave running unattended.

## Tasks

1. **Security review**
   - Confirm no secrets committed (`.gitleaks.toml` already runs pre-commit — verify
     it actually catches something in a test commit, don't just assume it works)
   - Confirm all write endpoints (campaign create/pause) require auth + confirm=true
   - Confirm OAuth refresh tokens are encrypted at rest (Fernet), not plaintext in DB
   - Rate limiting present on all three platforms' API calls (reuse `rate_limiter.py`)

2. **Test coverage pass**
   - Run full pytest + vitest suite, fix any red tests
   - Add missing edge-case tests flagged during Sprints 1-3 but deferred

3. **Docs**
   - Update root `README.md` "Features" section to mention Google Ads + TikTok Ads
     (currently Meta-only, inherited from the fork)
   - Update AGPL/MIT attribution if any new dependency requires it

4. **Final handoff doc** (`docs/sprint-5/done.md`)
   - What's live, what's deferred, known limitations, next-step ideas
   - Update PROJECT_BRIEF.md Sections 7 + 8 to reflect final state
