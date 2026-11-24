# SUKAFIN

Aplikasi alokasi dana & 7 tangga kekayaan, mobile-first, memakai desain Tailwind (teal/gold).

## Arsitektur

- **Frontend**: `index.html` — Tailwind CDN, font Instrument Sans / Red Hat Text, Material Symbols, 5 tab bottom nav (Beranda, Dompet, In-Outflow, Level, Manage User).
- **Backend**: `server.js` — Node.js `node:http` + `node:sqlite` (tanpa dependency pihak ketiga).
- **Database**: `db/sukafin.sqlite` dengan migrasi di `db/migrations/` dan seeder di `db/seeds/`.

Migrasi + seeder dijalankan otomatis setiap kali server start.

## Menjalankan

```bash
npm start
```

Lalu buka `http://localhost:4173`.

Login superadmin:

```
username: superadmin
password: superadmin123
```

## API (ringkas)

| Method | Endpoint                 | Akses       | Fungsi                          |
|--------|--------------------------|-------------|---------------------------------|
| POST   | `/api/login`             | publik      | Login, mengembalikan bearer token |
| POST   | `/api/logout`            | auth        | Hapus sesi                      |
| GET    | `/api/me`                | auth        | Data akun aktif                 |
| GET    | `/api/records`           | auth        | Transaksi milik akun aktif      |
| POST   | `/api/records`           | auth        | Tambah transaksi                |
| DELETE | `/api/records/:id`       | auth        | Hapus transaksi sendiri         |
| GET    | `/api/users`             | superadmin  | Daftar user + jumlah transaksi  |
| POST   | `/api/users`             | superadmin  | Tambah user                     |
| DELETE | `/api/users/:id`         | superadmin  | Hapus user beserta datanya      |
| GET    | `/api/meta`              | auth        | Info schema, akun, transaksi    |
| GET    | `/api/backup`            | superadmin  | Unduh file `.sqlite`            |

Semua error memakai bentuk `{ "error": { "code", "message" } }`.

## Seed + migrasi manual

```bash
npm run db:init
```

## Catatan

Sesi login disimpan di memory server (token bearer) dan di localStorage browser. Token hilang saat server restart. Data transaksi tetap aman di SQLite karena dibatasi oleh `user_id` di server, bukan hanya di frontend.
