# 📚 MeBooks v2

Rekod buku yang kau baca, track progres muka surat, dan ikut kawan-kawan.

## Ciri

- **Scan ISBN** → maklumat buku auto (Google Books, fallback Open Library) → terus masuk rak
- **Rak peribadi** dengan status: 📋 Nak baca · 📖 Sedang baca · ✅ Dah habis
- **Progres bacaan**: "saya dah baca sampai muka surat 5" — +5/+10/+20, atau taip nombor. Sejarah setiap kemas kini disimpan.
- **Feed**: progres, mula baca, habis baca, dan rating kawan-kawan yang kau ikut
- **Follow / unfollow**, cari pengguna mengikut username
- **Profil**: rak awam, bio, jumlah pengikut
- **Akaun privat**: rak dan aktiviti hanya untuk pengikut
- **Nota peribadi**: hanya kau boleh baca (jadual berasingan, RLS ketat)

## Persediaan

### 1. Supabase
1. Buat projek Supabase **baru** (jangan guna projek production lama).
2. Buka **SQL Editor**, tampal dan jalankan `supabase/schema.sql` sekali sahaja.
3. Pergi **Project Settings → API**, salin `Project URL` dan `anon public` key.

### 2. Aplikasi
```bash
cp .env.example .env        # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm install
npm run dev                 # http://localhost:5173
```

Untuk build produksi: `npm run build` (output dalam `dist/`). Deploy ke Vercel/Netlify dengan env yang sama.

## Keselamatan

- Hanya **anon key** di frontend. Jangan sekali-kali letak `service_role` key.
- Semua keselamatan bergantung pada RLS dalam `schema.sql`.
- Progres hanya boleh diubah melalui fungsi `log_progress()` (trigger menghalang kemas kini terus). Ini memastikan setiap perubahan dicatat dan muncul dalam feed.
- Aktiviti feed dijana oleh pangkalan data, bukan client. Ia tidak mengandungi nota peribadi atau buku yang disorok.
- Jika buku disorok (`Papar dalam profil & feed` ditanda), semua aktiviti berkaitan buku itu dipadam.

## Struktur

```
src/
  lib/        api.ts (semua query), isbn.ts (validasi + tukar ISBN-13), lookup.ts (Google/Open Library)
  contexts/   AuthContext.tsx
  components/ AddBookModal, IsbnScanner, ShelfView, BookDetail, FeedView, ProfileView, SearchPeople
supabase/
  schema.sql  jadual, RLS, trigger, fungsi log_progress
```

## Had semasa

- Tiada follow request (akaun privat = pengikut terus diterima)
- Tiada notifikasi push
- Tiada dark mode
- Katalog buku dikongsi: sesiapa boleh tambah buku baru tetapi tidak boleh ubah yang sedia ada
