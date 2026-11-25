# Panduan Hosting SUKAFIN di Vercel

Panduan ini untuk menjalankan SUKAFIN dari repository GitHub ke Vercel dengan database Neon Postgres. Setelah setup pertama selesai, setiap push ke branch Production yang terhubung akan memicu deployment otomatis.

> **Penting:** Vercel tidak menyimpan perubahan pada file SQLite lokal secara permanen. Karena itu, deployment Vercel menggunakan Neon. Jangan memasukkan kredensial admin production ke file atau commit GitHub.

## 1. Push project ke GitHub

Pastikan versi project yang ingin di-host sudah di-commit dan di-push ke repository GitHub. Simpan perubahan lokal yang belum siap dipublikasikan secara terpisah.

## 2. Buat project Vercel dari GitHub

1. Masuk ke [Vercel](https://vercel.com/) dan pilih **Add New → Project**.
2. Hubungkan akun GitHub jika diminta. Berikan akses ke repository SUKAFIN.
3. Pilih repository ini lalu tekan **Import**.
4. Pada konfigurasi project:
   - **Root Directory**: folder root repository (biasanya `./`).
   - **Framework Preset**: **Other**, jika Vercel meminta pilihan.
   - Biarkan Build Command dan Output Directory menggunakan nilai otomatis/default; project ini tidak memerlukan proses build frontend khusus.
5. Pilih **Deploy** untuk membuat project. Jika database belum dihubungkan, API belum siap digunakan; lanjutkan ke langkah berikutnya.

Vercel mengenali function API dari folder `api/`. Jangan mengubah Root Directory ke folder lain.

## 3. Hubungkan database Neon

1. Buka project SUKAFIN di dashboard Vercel.
2. Buka **Storage** atau **Marketplace**, lalu pilih integrasi **Neon Postgres**.
3. Buat database baru atau pilih database Neon yang memang akan dipakai untuk SUKAFIN.
4. Hubungkan database ke project Vercel ini.
5. Pilih environment yang akan memakai database:
   - **Production** untuk situs utama.
   - **Preview** jika ingin deployment dari branch selain branch Production juga bisa dites.
   - **Development** hanya jika memang ingin memakai kredensial database tersebut saat development lokal.
6. Jangan memakai custom prefix untuk nama environment variable. Integrasi perlu menyediakan `DATABASE_URL` tanpa prefix.

Setelah terhubung, integrasi Neon menambahkan connection string ke Environment Variables Vercel secara otomatis. Nama yang disarankan adalah `DATABASE_URL`. API juga mengenali `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `DATABASE_URL_UNPOOLED`, `NEON_DATABASE_URL`, dan `NEON_POSTGRES_URL`, serta satu variable custom-prefix yang berakhiran `_DATABASE_URL` atau `_POSTGRES_URL`. Jika ada lebih dari satu koneksi database custom-prefix, gunakan nama tanpa prefix agar tidak ambigu. Jangan membagikan atau menaruh connection string itu di GitHub.

## 4. Atur kredensial admin

1. Di project Vercel, buka **Settings → Environment Variables**.
2. Tambahkan kedua variable berikut. Pilih **Production** dan, jika diperlukan, **Preview**:

   | Name | Value |
   | --- | --- |
   | `SUPERADMIN_USERNAME` | Username admin yang ingin dipakai |
   | `SUPERADMIN_PASSWORD` | Password unik dan kuat untuk admin |

3. Simpan perubahan. Jangan gunakan password demo lokal `superadmin123` untuk production dan jangan menambahkan kredensial ini ke file source code.

Saat API pertama kali dipanggil, aplikasi membuat tabel database dan akun superadmin secara otomatis. Tidak perlu menjalankan `npm run db:init` untuk Neon.

> Akun admin hanya dibuat jika username tersebut belum ada. Mengubah `SUPERADMIN_PASSWORD` setelah akun sudah dibuat tidak otomatis mengganti password di database. Untuk instalasi baru, gunakan database Neon yang masih kosong dan tentukan kredensial sebelum login pertama.

## 5. Deploy ulang setelah konfigurasi

Perubahan Environment Variables tidak mengubah deployment yang sudah berjalan. Setelah Neon dan kedua variable admin tersedia:

1. Buka tab **Deployments** di project Vercel.
2. Pilih deployment terbaru untuk branch Production.
3. Buka menu deployment lalu pilih **Redeploy**.
4. Tunggu sampai status deployment **Ready**.

Jika baru menghubungkan GitHub, pastikan deployment Production menggunakan branch utama repository yang benar, misalnya `main`.

## 6. Periksa aplikasi dan login

1. Dari halaman deployment, buka domain Production yang diberikan Vercel.
2. Periksa endpoint kesehatan dengan membuka `https://DOMAIN-VERCEL/api/health`. Respons yang diharapkan:

   ```json
   {"status":"ok"}
   ```

3. Buka `https://DOMAIN-VERCEL/` dan login menggunakan nilai `SUPERADMIN_USERNAME` dan `SUPERADMIN_PASSWORD`.
4. Pastikan halaman Manage User tersedia dan coba buat satu user uji jika diperlukan.

`DOMAIN-VERCEL` adalah domain Production milik project Anda, tanpa tanda kurung atau placeholder.

## 7. Deployment berikutnya

Setelah integrasi Git aktif, perubahan pada branch Production yang terhubung akan dideploy otomatis setiap kali di-push ke GitHub. Branch lain biasanya menghasilkan Preview Deployment. Pastikan environment **Preview** juga memiliki koneksi Neon dan kredensial admin jika Preview ingin digunakan.

## Pemecahan masalah

| Gejala | Yang perlu diperiksa |
| --- | --- |
| Endpoint API mengembalikan `DATABASE_NOT_CONFIGURED` | Pastikan Neon benar-benar terhubung ke project dan connection string tersedia untuk environment deployment (biasanya **Production**). API menerima `DATABASE_URL`, `POSTGRES_URL`, dan `POSTGRES_PRISMA_URL`. Variable custom-prefix lain harus berakhiran `_DATABASE_URL` atau `_POSTGRES_URL`; jika baru mengubah variable atau kode, push perubahan lalu pastikan deployment Production terbaru berstatus **Ready**. |
| Endpoint API mengembalikan `ADMIN_NOT_CONFIGURED` | Pastikan `SUPERADMIN_USERNAME` dan `SUPERADMIN_PASSWORD` dieja persis seperti ini dan tersedia untuk environment deployment. Lakukan redeploy setelah mengubah variable. |
| Halaman terbuka tetapi login gagal | Pastikan memakai kredensial admin yang tersimpan di Neon. Jika username sudah pernah dibuat, mengubah Environment Variables tidak mereset password akun lama. |
| `/api/health` tidak ditemukan | Pastikan Root Directory mengarah ke root repository dan file `api/[...path].js` ikut ter-commit. Periksa juga hasil dan log deployment di Vercel. |
| Data tidak muncul di deployment lain | Pastikan semua deployment terhubung ke database/environment Neon yang sama. Preview dapat menggunakan database atau branch Neon yang berbeda dari Production. |

Backup production dilakukan melalui fasilitas backup/export Neon, bukan dengan mengunduh file SQLite lokal.

## Referensi resmi

- [Deploy Git repositories dengan Vercel](https://vercel.com/docs/git)
- [Storage di Vercel Marketplace](https://vercel.com/docs/marketplace-storage)
- [Integrasi Neon terkelola untuk Vercel](https://neon.com/docs/guides/vercel-managed-integration)
