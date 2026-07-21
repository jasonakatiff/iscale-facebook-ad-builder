# Sprint 1 — Progress Tracker

Status: 🔜 Starting

| Task | Status |
|---|---|
| 1. Backend config + dependencies | ⬜ |
| 2. DB model + migration | ⬜ |
| 3. OAuth flow | ⬜ |
| 4. Google Ads client wrapper | ⬜ |
| 5. API routes | ⬜ |
| 6. Frontend Google Ads tab | ⬜ |
| 7. Manual OAuth Client step (flag for human) | ⬜ |
| 8. Tests | ⬜ |

## Notes
- Reference implementation: `apps/optima/lib/google-ads-oauth.ts` +
  `apps/optima/lib/google-ads-client.ts` in the `nalarin` monorepo (working OAuth
  flow, TypeScript — port the logic/shape to Python, not a literal copy).
- GCP project already has Google Ads API enabled — no fresh Cloud Console project
  setup needed, only a new OAuth Client (see Task 7).
