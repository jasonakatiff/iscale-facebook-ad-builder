# Sprint 7 — Plan: TikTok Ads multi-account parity + mobile polish

Motivasi: Meta & Google sudah punya multi-account select (Sprint 6). TikTok masih
single-account: OAuth callback simpan advertiser pertama saja, tidak ada route
list/select, UI tidak ada pemilih akun. Halaman TikTokAdsCampaigns juga belum
dapat pass mobile dari sprint sebelumnya.

## Perubahan backend (`backend/app/api/v1/tiktok_ads.py`)

1. **Callback multi-advertiser** (paritas `facebook.py`/`google_ads.py`):
   - simpan SEMUA `advertiser_ids` dari grant, bukan `[0]`
   - `is_active = not select_required` (aktif otomatis hanya kalau grant = 1 akun)
   - redirect `?select=1` kalau >1 akun, `?connected=1` kalau 1
2. **GET /connections** — list semua koneksi user (advertiser_id, account_name,
   selected) terurut.
3. **POST /connection/select** `{advertiser_id}` — validasi milik user (404 kalau
   tidak), deaktivasi lain, aktivasi pilihan.
4. **DELETE /connection** — deaktivasi SEMUA koneksi user (paritas Meta/Google).

Model & migration: TIDAK ADA perubahan — `TikTokAdsConnection` sudah cukup
(kolom `advertiser_id` + `is_active` sudah ada).

## Perubahan frontend (`frontend/src/pages/TikTokAdsCampaigns.jsx`)

- Pola sama dengan `GoogleAdsCampaigns.jsx`: state `connections`,
  `selectingAccount`, `selectingId`; `loadConnections`; grid pilih akun
  (aria-pressed, disabled saat selecting); query param `select=1`/`connected=1`
  dari callback; tombol "Change TikTok advertiser".
- Mobile pass: heading `text-2xl sm:text-3xl`, icon 28/32, spacing `space-y-4
  sm:space-y-6` (paritas Overview).

## Test (`backend/tests/unit/test_tiktok_ads.py` tambahan)

- `/connections` + `/connection/select` auth gate → 401
- select: aktivasi kandidat milik user saja, lainnya nonaktif
- select advertiser asing → 404
- callback multi-advertiser: semua tersimpan, hanya otomatis-aktif kalau 1

## Urutan eksekusi

1. Backend edit → pytest (docker postgres ephemeral) → harus 100% pass
2. Frontend edit → vitest → vite build
3. Review diff
4. Commit + push fork
5. Deploy: rebuild container backend + frontend prod, health check, verifikasi
   live (route baru 401-anonim, UI render)
6. Laporan

## Risiko

- Rendah: additive route, tidak sentuh model/migration. Prod tidak punya user
  TikTok konek (connections kosong) → tidak ada data yang tersentuh.
- Rollback: redeploy image lama.
