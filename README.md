# GRIT BOXING ID

GRIT Boxing ID adalah website untuk mengelola acara boxing sekaligus menjual
tiket secara online. Pembeli bisa langsung memesan tanpa membuat akun. Setelah
pembayaran berhasil dikonfirmasi oleh Midtrans, sistem akan membuat kode tiket
unik, menyimpannya ke PostgreSQL, lalu mengirimkannya ke email pembeli.

## Menjalankan di komputer sendiri

Sebelum mulai, siapkan Node.js dan PostgreSQL, lalu buat database untuk
aplikasi ini.

1. Buat file `backend/.env`, kemudian isi dengan pengaturan database, Midtrans
   Sandbox, email SMTP, dan akun admin seperti contoh berikut:

   ```env
   DATABASE_URL=postgresql://...
   MIDTRANS_SERVER_KEY=...
   MIDTRANS_SIGNATURE_SECRET_KEY=...
   MIDTRANS_CLIENT_KEY=...
   SMTP_HOST=...
   SMTP_PORT=465
   SMTP_USER=...
   SMTP_PASS=...
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=use-a-unique-password-with-at-least-12-characters
   ADMIN_JWT_SECRET=use-a-random-secret-with-at-least-32-characters
   ```

   Untuk membuat secret acak, kamu bisa menjalankan perintah ini:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Jangan membagikan file `.env` atau memasukkannya ke GitHub karena isinya
   mencakup data rahasia.

2. Pasang dependency dan jalankan backend dari folder `backend`:

   ```sh
   npm install
   node server.js
   ```

   Saat dijalankan, backend akan menyiapkan tabel pesanan, pengaturan acara dan
   tiket, serta tiket yang sudah terbit. Pastikan database-nya bisa diakses.

3. Buka terminal baru di folder utama project, pasang dependency, lalu
   jalankan website:

   ```sh
   npm install
   npm start
   ```

   Website bisa dibuka di `http://localhost:3000`, sedangkan dashboard admin
   ada di `http://localhost:3000/admin.html`. Kalau mau, folder `frontend` juga
   bisa dijalankan dengan Live Server selama backend lokal tetap aktif.
   Pengaturan alamat API lokal ada di `frontend/config.js`.

## Mengatur acara dan tiket

Pengaturan acara dilakukan lewat dashboard admin. Untuk saat ini, dashboard
mengatur satu acara dalam satu waktu. Isi nama, lokasi, waktu mulai, dan waktu
selesai acara. Setelah itu, centang **Buka penjualan tiket** kalau tiket sudah
bisa dibeli. Masa berlaku tiket mengikuti waktu selesai acara. Kalau belum
ada acara, kosongkan informasi acara lalu simpan supaya penjualan tetap
tertutup.

Di dashboard, kamu juga bisa menambah atau mengubah jenis tiket dan memeriksa
kode tiket lewat menu **Cek kode tiket**. Hasilnya bisa menunjukkan tiket
valid, sudah kedaluwarsa, atau tidak ditemukan.

Setiap pesanan yang berhasil dibayar hanya menerbitkan satu kode tiket dan
mengurangi stok satu kali. Jadi, kalau notifikasi pembayaran dari Midtrans
terkirim lebih dari sekali, tiket tidak akan terbit ulang dan stok tidak akan
berkurang lagi. Kode tiket disimpan sebelum email dikirim, jadi tiketnya tetap
ada meskipun pengiriman email sedang bermasalah.

Menu **Fight Card** dipakai untuk mengatur foto, nama fighter, dan kelas
pertandingan. Di menu **Logo Sponsor**, kamu bisa menambah, mengganti, atau
menghapus logo. Gambar PNG, JPG, atau WebP dengan ukuran maksimal 2 MB
disimpan di PostgreSQL bersama data website, jadi tetap tersedia setelah
deployment ke Vercel.

Kalau ingin melihat kode tiket terbaru lewat Neon SQL Editor, jalankan query
ini:

```sql
SELECT ticket_code, order_id, ticket_name, event_name, expires_at, created_at
FROM grit_issued_tickets
ORDER BY created_at DESC
LIMIT 20;
```

## Deploy ke Vercel

Project ini menggunakan Express sebagai Vercel Function, dan frontend-nya
dilayani dari project yang sama. Saat mengatur project di Vercel, gunakan
Root Directory di root repository (`.` atau kosong, bukan `frontend`), isi
Build Command dengan `npm run build`, dan biarkan Output Directory kosong.
Proses build akan menyalin frontend beserta gambarnya ke folder `public/`
supaya bisa dilayani oleh CDN Vercel. Setelah itu, deploy project.

Tambahkan environment variables yang ada di `backend/.env` lewat **Project
Settings → Environment Variables** di Vercel. Jangan commit file `.env`.
Website dan dashboard admin akan menggunakan domain Vercel yang sama.
Pengaturan di `frontend/config.js` otomatis memakai API dari domain tersebut.
Untuk mengecek status API, buka `/api/health`.

Ringkasan admin menghitung transaksi settlement dan metode pembayaran dari
database. Data ini diperbarui setelah webhook Midtrans berhasil diverifikasi,
bukan dari endpoint analitik privat dashboard Midtrans.

Di pengaturan Midtrans, isi URL Payment Notification dengan
`https://<domain-vercel>/api/midtrans/webhook`. Midtrans tidak bisa mengakses
`localhost`. Untuk Sandbox, gunakan Midtrans Sandbox Server Key dan Client Key
dari merchant yang sama, lalu atur `MIDTRANS_IS_PRODUCTION=false`.

Kalau dashboard Midtrans menampilkan `Signature Secret Key` terpisah, simpan
nilainya di `MIDTRANS_SIGNATURE_SECRET_KEY`. Kalau variabel itu tidak diatur,
webhook akan memakai `MIDTRANS_SERVER_KEY` agar tetap cocok dengan konfigurasi
lama. Jangan pernah mengirim secret lewat chat. Sebelum penjualan live,
pastikan juga kuota paket Vercel dan biaya transaksi Midtrans sudah
diperhitungkan.

Terakhir, pastikan layanan email mengizinkan autentikasi SMTP dan alamat
`SMTP_USER` bisa digunakan sebagai alamat pengirim. Email tiket dikirim setelah
backend berhasil memproses notifikasi pembayaran. Kalau SMTP gagal, backend
akan mencatat error dan mengembalikan HTTP 500 supaya notifikasi bisa dicoba
kembali.
