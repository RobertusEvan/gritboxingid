# GRIT BOXING ID

Website GRIT Boxing untuk mengelola acara dan menjual tiket melalui Midtrans
Snap. Pembeli tidak perlu membuat akun: setelah pembayaran dikonfirmasi
Midtrans, sistem membuat kode tiket unik, menyimpannya di PostgreSQL, lalu
mengirimkannya ke email pembeli.

## Menjalankan secara lokal

1. Gunakan Node.js dan PostgreSQL, lalu buat database untuk aplikasi.
2. Isi `backend/.env` dengan pengaturan database, Midtrans Sandbox, SMTP,
   serta pengaturan admin:

   ```env
   DATABASE_URL=postgresql://...
   MIDTRANS_SERVER_KEY=...
   MIDTRANS_CLIENT_KEY=...
   SMTP_HOST=...
   SMTP_PORT=465
   SMTP_USER=...
   SMTP_PASS=...
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=use-a-unique-password-with-at-least-12-characters
   ADMIN_JWT_SECRET=use-a-random-secret-with-at-least-32-characters
   ```

   Secret acak dapat dibuat dengan
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Jangan membagikan atau commit file `.env`.
3. Dari folder `backend`, jalankan:

   ```sh
   npm install
   node server.js
   ```

   Backend menyiapkan tabel pesanan, pengaturan acara/tiket, dan tiket terbit
   saat mulai. Pastikan database dapat diakses.
4. Sajikan folder `frontend` menggunakan Live Server atau web server statis,
   lalu buka `index.html`. Dashboard admin tersedia di `admin.html`.
   Frontend lokal memakai API `http://localhost:3000`.

## Mengelola acara dan tiket

Di dashboard admin, atur satu acara pada satu waktu. Isi nama, lokasi, waktu
mulai dan selesai, lalu centang **Buka penjualan tiket** untuk mengaktifkan
pembelian. Kode tiket kedaluwarsa pada waktu selesai acara. Jika belum ada
acara, kosongkan informasi acara dan simpan; penjualan akan tertutup.

Dashboard juga dapat menambah atau mengubah jenis tiket dan memeriksa kode
melalui menu **Cek kode tiket**. Hasil pemeriksaan berupa valid, expire, atau
tidak ditemukan. Setiap pesanan yang berhasil dibayar hanya menerbitkan satu
kode tiket dan mengurangi stok satu kali; notifikasi Midtrans berulang tidak
menerbitkan tiket baru atau mengurangi stok lagi. Kode tiket disimpan sebelum
pengiriman email, jadi kegagalan SMTP tidak menghilangkan tiket tersebut.

Untuk menemukan kode terbaru lewat Neon SQL Editor:

```sql
SELECT ticket_code, order_id, ticket_name, event_name, expires_at, created_at
FROM grit_issued_tickets
ORDER BY created_at DESC
LIMIT 20;
```

Untuk produksi, atur `MIDTRANS_IS_PRODUCTION=true`, gunakan kredensial produksi,
HTTPS, dan arahkan URL notifikasi Midtrans ke
`https://<domain-api>/api/midtrans/webhook`. Jika frontend dan backend tidak
berjalan lokal bersama, ubah `API_URL` di `frontend/script.js` dan
`frontend/admin.js` ke URL API yang benar. Midtrans tidak dapat mengakses
`localhost`; untuk pengujian lokal gunakan URL publik sementara/tunnel atau
server backend yang dapat diakses dari internet.

Pastikan pengirim mengizinkan autentikasi SMTP dan alamat `SMTP_USER` dapat
digunakan sebagai alamat pengirim. Email tiket hanya dikirim setelah notifikasi
pembayaran berhasil diproses backend. Jika SMTP gagal, backend mencatat error
dan mengembalikan HTTP 500 agar notifikasi dapat dicoba ulang.
