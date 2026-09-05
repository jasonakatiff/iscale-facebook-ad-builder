# Sprint 6 — Plan: Finalisasi PR, Deploy Produksi, Verifikasi, Runbook White-Label

Status awal (3 Sep 2026, setelah commit `f6f4124` di main lokal = fork/main):

- 15 commit (Sprint 0–5 + 3 baru) ada di fork `masgant99/iscale-facebook-ad-builder`.
- Upstream `jasonakatiff/iscale-facebook-ad-builder` (redirect dari origin iscale-llc) belum merge → PR #3 menunggu review.
- Produksi `ads.nalar.army` jalan di Railway; **sumber deploy (repo/branch mana) harus dikonfirmasi** (lihat F0).
- Unit test 114 passed, build frontend pass, white-label env-var terverifikasi (build klien = 0 hit Nalarin).

---

## F0 — Audit state (saya, read-only, ~10 menit)

Tujuan: tutup semua ketidakpastian sebelum menyentuh produksi.

1. `git fetch fork && git rev-list --left-right --count main...fork/main` → pastikan 0/0.
2. `gh pr view 3 --repo jasonakatiff/iscale-facebook-ad-builder` → head branch PR #3 = fork/main? Kalau iya, 15 commit otomatis masuk PR; kalau tidak, butuh PR baru.
3. Produksi live check:
   - `curl -s https://ads.nalar.army/api/v1/health` → 200?
   - `curl -s -o /dev/null -w '%{http_code}' https://ads.nalar.army/api/v1/google-ads/connection` → 401 (ada) vs 404 (belum ter-deploy).
   - `curl -s -o /dev/null -w '%{http_code}' https://ads.nalar.army/api/v1/facebook/connection` → 401 (route Meta baru ada) vs 404 (kode lama).
4. `railway whoami && railway status` (kalau CLI tersedia + login) → repo & branch sumber deploy service backend/frontend.
5. Cek `.env.local` / `.env` lokal: ada `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET`? (cek keberadaan saja, isi tidak ditampilkan di chat).

Output F0: peta gap produksi vs main + keputusan jalur deploy (F2).

## F1 — PR upstream

- Kalau PR #3 head = fork/main: hanya menunggu merge oleh pemilik upstream (jasonakatiff). Bos follow-up / tag maintainer.
- Kalau head branch lain: `gh pr create` baru dari fork/main → upstream main, isi ringkasan Sprint 0–6.
- PR merge = prasyarat **Opsi A** deploy; kalau upstream lambat/tidak respons → **Opsi B** (F2) dan PR tetap jalan paralel.

## F2 — Deploy produksi (perlu approval Bos)

Prasyarat teknis (sudah siap):

- Migration `c4e8a21b9f30` chain benar (revises `b7c2d91e4a10`), Dockerfile jalankan `alembic upgrade head` otomatis saat deploy.
- Healthcheck nginx menunggu backend (commit `82bfc46`).

Env baru yang WAJIB di Railway sebelum deploy:

```
FACEBOOK_APP_ID=...            # dari Meta App console (Bos / dari .env lokal)
FACEBOOK_APP_SECRET=...        # rahasia — set via Railway dashboard/CLI, jangan di chat
FACEBOOK_OAUTH_REDIRECT_URI=https://ads.nalar.army/api/v1/facebook/oauth/callback
BRAND_NAME=Nalarin Ads Studio  # default, opsional
```

Dua jalur deploy:

- **Opsi A (sesuai CLAUDE.md):** upstream merge PR → Railway auto-deploy dari origin/main. Nol perubahan infra.
- **Opsi B (kalau upstream macet):** Railway service backend+frontend di-repoint ke repo `masgant99/iscale-facebook-ad-builder` branch `main` (Settings → GitHub repo). Produksi langsung dapat 15 commit. Bisa dibalik kapan pun.

Urutan eksekusi (saya, dengan approval per langkah bila menyentuh produksi):

1. Set env di Railway (nilai App ID/Secret — saya ambil dari `.env` lokal via CLI tanpa echo ke chat, atau Bos set manual di dashboard).
2. Trigger deploy (merge upstream untuk Opsi A / repoint+deploy untuk Opsi B).
3. `railway logs --tail 30` → tunggu `Uvicorn running on http://0.0.0.0:8080` + tidak ada error alembic.

Rollback: Railway → Deployments → Redeploy commit sebelumnya. Migration baru cuma CREATE TABLE (idempotent + guard inspector), aman.

## F3 — Verifikasi pasca-deploy (saya + 1 klik dari Bos)

1. `GET /api/v1/health` → 200.
2. Route baru hidup: `/api/v1/facebook/connection` → 401 (route ada), `/api/v1/google-ads/connections` → 401.
3. Migration applied: indikasi tidak 500 di route connection setelah login.
4. **OAuth e2e (Bos klik, ±2 menit):** login → Facebook Campaigns → Connect Meta → consent di Meta → pilih ad account (kalau >1) → wizard muncul + toast "Meta ad account selected".
5. Smoke e2e (saya): `cd frontend && BASE_URL=https://ads.nalar.army npm run test:smoke` (login + halaman utama).
6. Bot API tetap sehat: skill `ads-studio-report` → connections.
7. Halaman publik: `/about` `/privacy` `/terms` `/data-deletion` render (nginx location baru).

## F4 — Meta App console (Bos, manual, ±30 menit)

1. Meta App dashboard → tambah product **Facebook Login** (kalau belum) → set Valid OAuth Redirect URIs: `https://ads.nalar.army/api/v1/facebook/oauth/callback`.
2. Pastikan app **Live mode** (bukan Development) — Development mode OAuth hanya jalan untuk akun developer/tester.
3. Marketing API product aktif + token page/ads permission.
4. Untuk akun iklan sendiri: Standard Access cukup. Advanced Access (ads_read/ads_management untuk user lain) → perlu App Review — kerjakan hanya kalau mau klien connect dengan login mereka sendiri.
5. App ID/Secret → Railway env (F2 langkah 1).

## F5 — Item manual tertunda (Bos)

| Item | Artefak | Aksi |
|---|---|---|
| Google Ads API Basic Access | Draft RTF `docs/google-ads-api-basic-access-application.rtf` (f6f4124) | Submit via Google Ads API Center (developer token masih test-only → produksi butuh Basic Access) |
| TikTok Marketing API | — | Submit dev app for Business approval (kalau TikTok mau dipakai) |
| PR upstream merge | PR #3 (atau PR baru) | Follow-up jasonakatiff |

## F6 — Runbook white-label klien pertama (template, eksekusi saat klien ada)

Per klien, ~2–4 jam:

1. **Aset:** nama brand, logo persegi PNG ≥512px (`frontend/public/logo.png` klien), operator + URL, domain.
2. **Railway project BARU** (duplicate service config dari Nalarin) + PostgreSQL service baru. Jangan sentuh project ads.nalar.army.
3. **Env klien:**
   - Build: `VITE_APP_NAME`, `VITE_APP_LOGO=/logo.png`, `VITE_APP_TAGLINE`, `VITE_APP_OPERATOR`, `VITE_APP_OPERATOR_URL`
   - Backend: `BRAND_NAME`, `FRONTEND_URL=https://<domain-klien>`, `DATABASE_URL`, `SECRET_KEY` baru, `OAUTH_TOKEN_ENCRYPTION_KEY` baru, `FACEBOOK_OAUTH_REDIRECT_URI=https://<domain-klien>/api/v1/facebook/oauth/callback` (+ varian Google/TikTok), R2 (bucket terpisah atau folder per klien).
4. **File per-instance (kode, saya):** ganti `public/nalarin_ads_studio_logo.png` → logo klien, rewrite `public/{about,privacy,terms,data-deletion}/index.html` (nama operator, kontak, domain klien; jangan timpa file instance Nalarin — commit di branch `client/<nama>` atau repo terpisah). `LICENSE` (MIT) WAJIB tetap.
5. **OAuth consoles (Bos):** redirect URI domain klien di Meta App (atau App terpisah per klien — lebih bersih), Google Cloud OAuth client baru, TikTok dev app.
6. **Build+deploy:** branch klien → Railway project klien.
7. **Verifikasi:** grep bundle 0 hit "Nalarin"; health 200; login; halaman legal klien; MIT ada.

## Definition of Done "semuanya selesai"

- [ ] F0 audit: peta gap + sumber deploy dikonfirmasi
- [ ] F1: PR upstream up-to-date (15 commit) / PR baru dibuat
- [ ] F2: env Meta di Railway + deploy jalan (Opsi A atau B)
- [ ] F3: health 200, route baru 401, OAuth e2e connect+select sukses, smoke pass, bot API sehat, halaman publik render
- [ ] F4: Meta App live + redirect URI terdaftar
- [ ] F5: Google Basic Access terkirim + TikTok submitted + PR merge difollow-up
- [ ] F6: runbook ini bisa dieksekusi verbatim untuk klien pertama

## Risiko

- **Meta App Development mode** → OAuth gagal untuk akun non-dev. Mitigasi: F4 langkah 2.
- **Upstream tidak merge** → Opsi B, reversible.
- **Migration gagal di produksi** → logs alembic; down() tersedia; tabel baru idempotent.
- **App review Meta** (kalau klien pakai login sendiri) → lead time beberapa hari–minggu. Bukan blocker untuk akun sendiri.
