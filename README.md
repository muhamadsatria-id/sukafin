# SUKAFIN

Aplikasi alokasi dana & 7 tangga kekayaan, mobile-first, memakai desain Tailwind (teal/gold).

## Arsitektur

- **Frontend**: `index.html` — Tailwind CDN, font Instrument Sans / Red Hat Text, Material Symbols, 5 tab bottom nav (Beranda, Dompet, In-Outflow, Level, Manage User).
- **Backend lokal**: `server.js` — Node.js `node:http` + SQLite.
- **Backend Vercel**: `api/[...path].js` — Vercel Function dengan PostgreSQL Neon.
- **Database lokal**: `db/sukafin.sqlite` dengan migrasi di `db/migrations/` dan seeder di `db/seeds/`.

Vercel Functions tidak memiliki filesystem persisten, jadi database SQLite lokal hanya digunakan saat development. Schema Neon dan akun superadmin dibuat otomatis saat API pertama kali dipanggil.

## Deploy ke Vercel

1. Import repository GitHub ini ke Vercel. Push berikutnya akan membuat deployment baru otomatis.
2. Di project Vercel, buka **Storage / Marketplace**, buat database **Neon Postgres**, lalu hubungkan ke project. Integrasi umumnya menambahkan `DATABASE_URL`; API juga menerima `POSTGRES_URL` dan nama Neon umum lainnya.
3. Di **Settings → Environment Variables**, tambahkan:

   - `SUPERADMIN_USERNAME`: username admin awal.
   - `SUPERADMIN_PASSWORD`: password admin yang kuat dan unik.

   Terapkan ke environment yang digunakan (Production dan Preview bila diperlukan), lalu redeploy agar variable tersedia.
4. Buka URL deployment dan login memakai username/password yang diatur di langkah 3.

Jangan gunakan kredensial demo lokal untuk production. Jika akun superadmin dengan username tersebut sudah ada, seeder tidak akan mengubah password atau role yang tersimpan.

## Menjalankan lokal

Gunakan Node.js 22.13+:

```bash
npm start
```

Lalu buka `http://localhost:4173`. Database SQLite lokal otomatis dimigrasikan dan diisi akun demo `superadmin` / `superadmin123`. Kredensial tersebut hanya untuk development.

## API

| Method | Endpoint                 | Akses       | Fungsi                          |
|--------|--------------------------|-------------|---------------------------------|
| GET    | `/api/health`            | publik      | Cek koneksi database            |
| POST   | `/api/login`             | publik      | Login, mengembalikan bearer token |
| POST   | `/api/logout`            | auth        | Hapus sesi                      |
| GET    | `/api/me`                | auth        | Data akun aktif                 |
| PATCH  | `/api/profile`            | auth        | Ubah nama, username, foto, atau password sendiri |
| GET    | `/api/records`           | auth        | Transaksi milik akun aktif      |
| POST   | `/api/records`           | auth        | Tambah transaksi                |
| DELETE | `/api/delete-record?id=:id` | auth        | Hapus transaksi sendiri       |
| GET    | `/api/users`             | superadmin  | Daftar user + jumlah transaksi  |
| POST   | `/api/users`             | superadmin  | Tambah user                     |
| DELETE | `/api/delete-user?id=:id` | superadmin  | Hapus user beserta datanya    |
| GET    | `/api/meta`              | auth        | Info schema, akun, transaksi    |
| GET    | `/api/backup`            | superadmin  | Unduh SQLite lokal; backup Neon melalui provider |

Semua error memakai bentuk `{ "error": { "code", "message" } }`.
Endpoint penghapusan memakai rute satu tingkat agar Vercel dapat memetakan file Function secara konsisten.

## Seed + migrasi manual

```bash
npm run db:init
```

## Catatan

Beranda dan ringkasan aplikasi dapat dijelajahi tanpa login; data keuangan pribadi hanya dimuat setelah autentikasi. Mencatat transaksi akan meminta pengguna login. User dan superadmin dapat mengubah nama, username, foto profil, dan password melalui tombol profil. Foto PNG/JPG/WebP disimpan di database, maksimal 256 KB.

Di Vercel, sesi disimpan di Neon dan berlaku 7 hari, sehingga tidak hilang saat function berhenti. Data transaksi dibatasi oleh `user_id` di server, bukan hanya di frontend. Superadmin dapat menghapus akun user beserta transaksi dan sesinya; akun superadmin tidak dapat dihapus dari menu tersebut. Backup production dilakukan melalui Neon.
