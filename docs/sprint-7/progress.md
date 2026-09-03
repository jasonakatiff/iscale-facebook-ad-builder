# Sprint 7 — Progress: TikTok Ads multi-advertiser parity (3 Sep 2026)

## Task
Buat plan → eksekusi → review → commit → push → deploy (autopilot).

## Perubahan (commit `45c6a3c`, pushed ke fork, PR #3 auto-include)

Backend (`app/api/v1/tiktok_ads.py`, +95/−29):
- OAuth callback menyimpan SEMUA advertiser dari grant (dulu: hanya pertama);
  auto-aktif hanya jika grant 1 advertiser, kalau >1 redirect `?select=1`
- `GET /connections` — list semua advertiser milik user (selected flag)
- `POST /connection/select` — aktifkan advertiser milik user (404 selain itu)
- `DELETE /connection` — deaktivasi semua (paritas Meta/Google)

Frontend (`TikTokAdsCampaigns.jsx`, +115/−29):
- Grid pilih advertiser (aria-pressed, disabled saat selecting, fokus ring)
- "Change TikTok advertiser" + handling `select=1`/`connected=1`
- Mobile pass: heading/spacing/form responsif (paritas Overview)

Test: +6 unit test TikTok (auth gate, select owned/unknown, list, disconnect-all).

## Verifikasi
- pytest: **122 passed** (116 + 6) — docker postgres ephemeral, container dihapus
- vitest: 1 passed; vite build: pass
- Deploy: backend + frontend container rebuild → healthy
- Live: `/health` 200; `/tiktok-ads/connections` + `/connection/select` → 401
  anonim (route baru hidup); bundle live berisi "Choose a TikTok advertiser"
- E2e: login smoke → `/tiktok-ads` render kartu Connect; API connection(s)
  untuk user smoke = kosong (benar, user tanpa koneksi)
- Cleanup: smoke user + temp files + test container dihapus; prod DB 2 user asli

## Status
- Prod `ads.nalar.army`: sprint-7 live (backend + frontend)
- Paritas multi-account: Meta ✅ Google ✅ TikTok ✅
- Working tree clean; main = fork/main = `45c6a3c`

## Sisa manual (tidak berubah dari sprint-6)
- PR #3 tunggu merge jasonakatiff
- TikTok dev app approval (untuk bisa OAuth real; kode siap)
- Google Ads Basic Access submission
- Connect ulang Meta via UI kalau token expired (~60 hari)
