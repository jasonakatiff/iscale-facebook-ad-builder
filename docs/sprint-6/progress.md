# Sprint 6 — Progress: Autopilot audit & verification (3 Sep 2026)

## F0 — Audit state: DONE

- `main` lokal = `fork/main` (0/0) @ `46de038`; plan committed (`docs/sprint-6/plan.md`).
- **PR #3 up-to-date**: head = `masgant99:main` → semua 16 commit Sprint 0–6 otomatis
  termasuk; OPEN, menunggu review jasonakatiff.
  https://github.com/jasonakatiff/iscale-facebook-ad-builder/pull/3
- **Produksi = Docker lokal** (`ads-studio-prod` compose: backend+postgres+frontend,
  Caddy 127.0.0.1:3024, cloudflared tunnel `nalarin-local` → ads.nalar.army),
  BUKAN Railway. `railway` CLI login tapi tidak ada project linked (tidak dipakai).
- **Prod sudah menjalankan kode baru**: image dibangun 4 Agu 2026 dari working tree
  (= kode yang di-commit sprint ini). Semua route baru hidup di publik.
- Meta OAuth env di prod container: `FACEBOOK_APP_ID` set, `FACEBOOK_APP_SECRET` set,
  `FACEBOOK_OAUTH_REDIRECT_URI=https://ads.nalar.army/api/v1/facebook/oauth/callback`,
  `FACEBOOK_ACCESS_TOKEN` kosong (per-user OAuth dipakai, benar). `BRAND_NAME` kosong
  (default code "Nalarin Ads Studio", harmless).
- Alembic prod @ `c4e8a21b9f30` (migration meta_ads_connections applied).
- **2 koneksi Meta Ads sudah ada di prod** (OAuth pernah sukses):
  `act_1036448165666337` (Toel Wasesa Segara, inactive), `act_1350206440591360`
  (Nalarin Ads, active) — milik user didik.w.yudi@gmail.com.

## F2/F3 — Deploy & verifikasi: DONE (tanpa rebuild)

Karena prod image = working tree commit sprint ini, rebuild = nol benefit + risiko
downtime. Verifikasi langsung ke prod live:

| Check | Hasil |
|---|---|
| `GET /health` (publik via Cloudflare) | 200 `{"status":"healthy"}` |
| `GET /api/v1/facebook/connection` (no auth) | 401 — route baru hidup |
| `GET /api/v1/google-ads/connections` (no auth) | 401 — route baru hidup |
| `GET /api/v1/bot/safety` (key invalid) | 401 — gate benar |
| Container backend | Up 11 hari, healthy, log bersih (uvicorn 200) |
| Migration | `c4e8a21b9f30` applied |

UI e2e (browser native Hermes, https://ads.nalar.army):

- `/login` render benar (form + toast error untuk kredensial salah — no alert()).
- Login sukses (user smoke temp dibuat lalu dihapus) → redirect `/` (Overview).
- Sidebar render: logo Nalarin, "Nalarin Ads Studio", "Paid media operations",
  semua menu termasuk Facebook/Google/TikTok Campaigns.
- `/facebook-campaigns`: kartu "Meta Ads — Not connected + Connect" untuk user
  tanpa koneksi; wizard ter-gate connection (perilaku benar). API
  `/facebook/connection` & `/connections` 200 JSON untuk user smoke (empty, benar).
- `/google-ads`: kartu Connect render.
- `/` Overview: render penuh — date preset, tabel, pesan error platform per-baris
  (Meta init error untuk user smoke tanpa token = benar; Google/TikTok "not connected").
- `/overview` (path tanpa route) blank — bukan bug: nav Overview target `/` (index
  route); path unknown jatuh ke SPA fallback kosong. Dikenali, tidak diperbaiki
  (lazy: tidak ada user path yang memakai `/overview`).
- Halaman publik: `/about`, `/privacy`, `/terms`, `/data-deletion`, logo PNG — semua 200,
  konten legal Nalarin/Banyumedia benar.

Catatan error API (bukan regresi, sudah ada sebelumnya): Overview untuk user tanpa
koneksi Meta menampilkan `Facebook API Init Error: 'NoneType' object has no attribute
'encode'` — message mentah dari facebook SDK saat token kosong. Cosmetik; endpoint
tetap 200 dan UI tetap render. Kandidat polish sprint depan: catch + pesan
"No connected Meta Ads account" di overview.py.

## Cleanup

- Smoke user prod dibuat → diverifikasi → dihapus (refresh_tokens, user_roles, users).
- File creds temp (lokal + container) dihapus.
- Working tree bersih; tidak ada perubahan kode baru sprint ini (semua sudah di 2e50032/a45da72/f6f4124/46de038).

## Sisa manual (Bos) — tidak bisa automasi

1. **PR #3**: review/merge oleh jasonakatiff (atau tunggu; prod tidak tergantung ini).
2. **Meta App console** — pastikan Live mode + redirect URI
   `https://ads.nalar.army/api/v1/facebook/oauth/callback` terdaftar (OAuth sudah
   pernah sukses → kemungkinan besar sudah benar).
3. **Google Ads Basic Access**: submit draft `docs/google-ads-api-basic-access-application.rtf`
   via Ads API Center.
4. **TikTok**: dev app approval kalau mau aktifkan.
5. **Koneksi Meta milik akun sendiri**: OAuth via UI (login sebagai didik.w.yudi@gmail.com
   → Facebook Campaigns → Connect / Change account) — kredensial provider tidak
   boleh diketik agent.

## Verdict

Prod `ads.nalar.army` = sehat, feature-complete (Meta OAuth + multi-account +
Google/TikTok + bot API + halaman legal), branding default Nalarin utuh. Tidak ada
drift kode prod vs repo. Definition-of-done F0–F3 terpenuhi; F4–F5 manual di tangan Bos.
