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
4. Dari folder project, jalankan `npm install`, lalu:

   ```sh
   npm start
   ```

   Buka `http://localhost:3000` untuk website dan
   `http://localhost:3000/admin.html` untuk dashboard. Alternatifnya, sajikan
   folder `frontend` dengan Live Server saat backend lokal berjalan. Pengaturan
   API lokal ada di `frontend/config.js`.

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

## Deploy di Vercel

Project ini mengekspos Express sebagai Vercel Function dan menyajikan frontend
dari project yang sama. Pada Vercel, atur Root Directory ke root repository
(`.` atau kosong, bukan `frontend`), Build Command ke `npm run build`, dan
biarkan Output Directory kosong. Build menyalin frontend serta gambar ke
`public/` agar dilayani oleh CDN Vercel. Lalu deploy ulang. Tambahkan
environment variables dari `backend/.env` melalui **Project Settings →
Environment Variables**; jangan commit `.env`. Setelah deployment, website dan
admin berjalan pada domain Vercel yang sama, dan `frontend/config.js`
otomatis memakai API same-origin. Health check tersedia di `/api/health`.

Atur URL Payment Notification Midtrans ke
`https://<domain-vercel>/api/midtrans/webhook`. Midtrans tidak dapat mengakses
`localhost`. Untuk Sandbox, gunakan Midtrans Sandbox Server Key dan Client Key
dari merchant yang sama serta `MIDTRANS_IS_PRODUCTION=false`. Jika dashboard
Midtrans menampilkan `Signature Secret Key` terpisah, simpan nilainya sebagai
`MIDTRANS_SIGNATURE_SECRET_KEY`; jika tidak diatur, webhook memakai
`MIDTRANS_SERVER_KEY` untuk kompatibilitas dengan konfigurasi lama. Jangan
pernah mengirim secret melalui chat.
Periksa kuota paket Vercel dan biaya transaksi Midtrans sebelum penjualan live.

Pastikan pengirim mengizinkan autentikasi SMTP dan alamat `SMTP_USER` dapat
digunakan sebagai alamat pengirim. Email tiket hanya dikirim setelah notifikasi
pembayaran berhasil diproses backend. Jika SMTP gagal, backend mencatat error
dan mengembalikan HTTP 500 agar notifikasi dapat dicoba ulang.
