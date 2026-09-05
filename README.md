# MantaF v2.0 — Supabase Edition

**Manajemen Tata Kelola Jabatan Fungsional Kesehatan**
Dinas Kesehatan Kabupaten Kutai Kartanegara

Frontend statis (untuk **GitHub Pages**) + Backend **Supabase** (Database, Auth RPC, Storage).
Aplikasi dipecah menjadi file modular agar lebih ringan: setiap halaman dimuat hanya saat dibuka (*lazy-load*).

---

## 📁 Struktur Proyek

```
mantaf/
├── index.html              ← Entry utama (shell + sidebar 3 bagian + router)
├── partials/               ← Potongan HTML per halaman (lazy-load)
│   ├── landing.html          Halaman depan (splash → landing)
│   ├── dashboard.html        Statistik + donut chart
│   ├── petunjuk.html         Kartu dokumen PDF petunjuk penggunaan
│   ├── pengumuman.html       Daftar pengumuman (publik)
│   ├── bezetting.html        Tabel bezetting + filter (publik)
│   ├── ukom.html             Formulir pendaftaran UKOM
│   ├── peserta-ukom.html     Data peserta UKOM (publik)
│   ├── status.html           Cek status peserta
│   └── admin.html            Panel admin (login + CRUD 4 tab)
├── assets/
│   ├── css/
│   │   ├── base.css          Design tokens & komponen bersama
│   │   ├── landing.css       Splash + landing page
│   │   ├── app.css           Sidebar (3 bagian) + topbar + layout
│   │   └── admin.css         Panel admin + modal CRUD
│   └── js/
│       ├── config.js         ⚙️ KONFIGURASI SUPABASE (WAJIB DIEDIT)
│       ├── utils.js          Escape, toast, pagination, modal
│       ├── api.js            Lapisan akses data Supabase (CRUD)
│       ├── loader.js         Pemuat partial + registry
│       ├── app.js            Router section, sidebar, boot
│       ├── landing.js        Landing: partikel, reveal, counter
│       ├── dashboard.js      Statistik & chart dashboard
│       ├── petunjuk.js       Kartu PDF + popup preview petunjuk
│       ├── pengumuman.js     Read pengumuman
│       ├── bezetting.js      Read + filter bezetting
│       ├── ukom.js           Submit pendaftaran + upload storage
│       ├── peserta-ukom.js   Tabel peserta publik
│       ├── status.js         Cek status + form perbaikan
│       ├── admin.js          Login + CRUD total 4 tab (termasuk upload PDF)
│       └── csvimport.js      Upload massal CSV (semua menu admin)
├── templates/               ← Template CSV siap isi (sesuai tabel Supabase)
│   ├── template-pengumuman.csv
│   ├── template-bezetting.csv
│   ├── template-peserta-ukom.csv
│   └── template-petunjuk.csv
└── supabase/
    └── schema.sql            ← SQL lengkap untuk Supabase
```

---

## 🚀 Langkah Setup (5 Menit)

### 1️⃣ Setup Supabase (Backend)

1. Buat akun/project baru di [supabase.com](https://supabase.com) (gratis).
2. Buka **SQL Editor** → klik **New query**.
3. Salin **seluruh isi** `supabase/schema.sql` → klik **Run**.
   - Membuat tabel: `admin_users`, `pengumuman`, `bezetting`, `peserta_ukom`, `petunjuk`
   - Membuat bucket Storage: `foto`, `dokumen`, `petunjuk`
   - Membuat RPC login admin + trigger `updated_at` + RLS
4. Login admin default → username: `admin` · password: `admin123`
   ⚠️ **Segera ganti** lewat Panel Admin → tombol **Ganti Password**.

### 2️⃣ Hubungkan Frontend

1. Di Supabase: **Settings → API**.
2. Salin **Project URL** dan **anon public key**.
3. Edit `assets/js/config.js`:

```js
const SUPABASE_CONFIG = {
  url: 'https://xxxxxxxxxxxx.supabase.co',  // ← Project URL
  anonKey: 'eyJhbGciOi...',                  // ← anon public key
  ...
};
```

### 3️⃣ Push ke GitHub (Frontend)

```bash
git init
git add .
git commit -m "MantaF v2.0 - Supabase Edition"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

4. Aktifkan **GitHub Pages**: `Settings → Pages → Source: Deploy from a branch → main / (root)`.
5. Buka `https://USERNAME.github.io/REPO/` — selesai! 🎉

> 💡 **Uji lokal** sebelum push: `npx serve .` atau ekstensi *Live Server* VS Code.
> Aplikasi **tidak bisa** dibuka langsung dengan double-click (file://) karena memuat partial secara dinamis.

---

## 🧭 Sidebar 3 Bagian

| Bagian | Isi |
|---|---|
| **1. Menu Utama** | Dashboard · Petunjuk Penggunaan |
| **2. Data & Informasi** | Pengumuman · Bezetting · Data Peserta UKOM |
| **3. Layanan & Admin** | Daftar UKOM · Cek Status · Admin |

## 📝 Daftar UKOM (Nomor Registrasi + Konfirmasi + Bukti)

Formulir pendaftaran kini menerbitkan identitas registrasi otomatis:

- **Strip registrasi di paling atas formulir** — **Nomor Registrasi** (format `REG-YYYYMMDD-XXXXXX`) dan **Waktu Pendaftaran** (jam berjalan, hari + tanggal + jam) dibuat otomatis sistem saat formulir dibuka; nomor tersimpan di kolom `no_registrasi` tabel `peserta_ukom` (unik, ada di schema.sql terbaru — **re-run schema.sql**).
- **Konfirmasi sebelum kirim** — setelah tombol *Kirim Pendaftaran*, muncul popup konfirmasi **"Apakah data yang Anda isi sudah benar dan lengkap?"** lengkap dengan ringkasan (nomor registrasi, nama, NIK, unit kerja, jenis UKOM, jabfung tujuan, jumlah dokumen). Peserta dapat memilih *Periksa Lagi* atau *Ya, Kirim Pendaftaran*.
- **Bukti Registrasi diterbitkan otomatis** setelah terkirim — kartu bukti berisi nomor registrasi, data pendaftar, waktu daftar, status *Menunggu Verifikasi*, dengan tombol **Cetak Bukti** (mencetak kartu bukti saja) dan **Tutup**. Formulir otomatis direset untuk pendaftar berikutnya.
- **Integrasi** — nomor registrasi tampil di hasil *Cek Status* dan di Panel Admin (modal detail & form edit peserta). Jika kolom `no_registrasi` belum ada di tabel (schema lama), pendaftaran tetap tersimpan otomatis (fallback tanpa kolom tsb).

## 🔍 Cek Status (Catatan Admin + Panduan Status)

Peserta mengecek pendaftaran dengan **NIK/NIP**, hasilnya kini lengkap:

- **Kartu hasil** — nama, NIK/NIP, badge status verifikasi, dan detail data (unit kerja, jenis UKOM, jabfung/jenjang tujuan, periode, no. peserta, status UKOM).
- **Panduan langkah berikutnya** — kotak berwarna per status (Menunggu, Proses, Disetujui, Ditolak, Dilimpahkan, Batal, Perbaikan) yang menjelaskan apa arti status tersebut bagi peserta.
- **Catatan Admin** — catatan yang ditulis admin (di Panel Admin) tampil menonjol dengan warna mengikuti status dan **waktu pembaruan**; jika kosong tampil keterangan "Belum ada catatan".
- **Lihat Sertifikat** — tombol muncul saat status *Disetujui* dan kolom `sertifikat` berisi URL; membuka di tab baru.
- **Perbaiki Data** — saat status *Perbaikan*, peserta dapat memperbarui NIP/nama dan mengunggah ulang 6 berkas (PAK, foto, ijazah, STR, SK pangkat, SK jabfung, maks 2MB). Setelah dikirim, status otomatis kembali ke *Menunggu* dan catatan admin dipertahankan + jejak audit pengiriman perbaikan.

## 📖 Petunjuk Penggunaan (Kartu PDF + Popup Baca-Saja)

Menu **Petunjuk Penggunaan** (di bawah Dashboard) menampilkan setiap panduan sebagai **kartu PDF**:

- **Baca Dokumen** — dokumen terbuka dalam *popup* dan dapat dibaca langsung (iframe PDF bawaan browser), lengkap dengan tombol **Tab Baru** di bar atasnya.
- **Baca-saja (read-only)** — fungsi unduh telah dihilangkan sepenuhnya: tombol Unduh tidak ada pada kartu maupun popup, dan toolbar viewer browser (unduh/cetak) disembunyikan via `#toolbar=0&navpanes=0`.
- Pencarian dokumen + tombol segarkan tersedia di toolbar.
- Sumber file: **bucket storage `petunjuk`** (URL publik tersimpan pada kolom `file_url` tabel `petunjuk`).
- Di perangkat iOS yang tidak mendukung iframe PDF, popup otomatis menampilkan tombol pembuka di tab baru.

## 🛡️ Panel Admin — CRUD Total

Login sebagai admin, lalu tersedia **4 tab** yang masing-masing mendukung **Create, Read, Update, Delete**:

| Tab | Kemampuan |
|---|---|
| 📢 **Pengumuman** | Tambah/edit/hapus, prioritas (Normal/Penting/Segera), aktif/nonaktif, cari judul |
| 🗂️ **Bezetting** | Tambah/edit/hapus baris, saran instansi & jabfung (datalist), filter instansi, kolom *sisa* otomatis |
| 👥 **Peserta UKOM** | Tambah/edit/hapus peserta, kelola periode & no. peserta, PAK Instansi/SI ASN, absen & status UKOM, ganti foto/sertifikat, ubah **status verifikasi** + **catatan admin** dari modal detail |
| 📖 **Petunjuk** | Unggah **PDF** ke bucket `petunjuk`, atur judul/deskripsi/urutan tampil/aktif, preview langsung dari tabel, hapus (file ikut terhapus dari storage) |

Perubahan admin langsung tampil di halaman publik (dashboard, petunjuk, pengumuman, bezetting, data peserta, cek status).

## 📥 Upload Massal (Import CSV) — Semua Menu Admin

Setiap tab Panel Admin (**Pengumuman**, **Bezetting**, **Peserta UKOM**, **Petunjuk**) memiliki tombol **Import CSV** untuk menambah/memperbarui data dalam jumlah besar:

1. **Unduh Template** — klik *Import CSV* → *Unduh Template*. Template kolomnya **identik dengan tabel Supabase** (`pengumuman`, `bezetting`, `peserta_ukom`, `petunjuk`) dan sudah termasuk 2 baris contoh (otomatis dilewati saat import). Salinan statis juga tersedia di folder `templates/`.
2. **Isi di Excel / Google Sheets** — simpan sebagai CSV. Format fleksibel:
   - pemisah `;` atau `,` (dideteksi otomatis),
   - tanggal `YYYY-MM-DD` **atau** `DD/MM/YYYY`,
   - status `Aktif`/`Nonaktif`, `true`/`false`, `Ya`/`Tidak` — semuanya diterima,
   - huruf besar-kecil tidak dipermasalahkan.
3. **Upload & Pratinjau** — file divalidasi per baris: baris error ditandai beserta alasannya (NIK bukan 16 digit, nilai status tidak dikenal, dll). Baris duplikat terdeteksi otomatis:
   - Pengumuman → kunci duplikat **judul**
   - Bezetting → kunci **instansi + jenis jabatan + jenjang**
   - Peserta UKOM → kunci **NIK**
   - Petunjuk → kunci **judul** (isi kolom `file_url` dengan URL publik PDF di bucket `petunjuk`)
4. **Pilih mode duplikat** — *Lewati* (hanya data baru) atau *Perbarui* (timpa data lama; kolom kosong di CSV tidak diubah).
5. **Import** — dikirim per-chunk (100 baris/request) dengan progress bar; baris yang gagal di tengah proses dilaporkan satu per satu. Ringkasan hasil + refresh data otomatis.

Opsi tambahan: **mode ganti total** (hapus semua data lama di tabel sebelum import) — meminta konfirmasi ulang sebelum dijalankan.

> ⚠️ **Tips Excel:** format kolom **NIK** sebagai *Text* sebelum menempel data, agar 16 digit tidak berubah menjadi notasi ilmiah (mis. `3,5E+15`).

## 🗃️ Skema Database (Ringkas)

| Tabel | Fungsi | Kolom kunci |
|---|---|---|
| `admin_users` | Akun admin (hash bcrypt via pgcrypto) | username, password_hash |
| `pengumuman` | Pengumuman publik | judul, isi, tanggal, prioritas, aktif |
| `bezetting` | Kebutuhan jabfung | instansi, jenis_jabatan, jenjang, kebutuhan, pemangku, lowongan, sisa (generated) |
| `peserta_ukom` | Peserta + berkas (URL Storage) | nik, nip, nama, unit kerja, file_*, periode, no_peserta, status_verifikasi, catatan_admin |
| `petunjuk` | Dokumen PDF petunjuk penggunaan | judul, deskripsi, file_url, urutan, aktif |

Storage: bucket **foto** (foto 4x6, sertifikat), **dokumen** (PDF persyaratan) & **petunjuk** (PDF panduan) — semuanya publik agar URL bisa dibaca langsung.

## 🔐 Catatan Keamanan

- RPC `admin_login` membandingkan password dengan `crypt()` bcrypt — password **tidak pernah** dikirim/disimpan mentah.
- `admin_users` dilindungi RLS (tidak bisa dibaca langsung dari client).
- Secara default RLS tabel data dibuka untuk `anon` agar aplikasi statis langsung jalan. Untuk produksi ketat: aktifkan **Supabase Auth**, ubah policy tulis menjadi `to authenticated`, dan batasi policy select `peserta_ukom`.
- Ganti password admin default segera.

## ❓ Troubleshooting

| Masalah | Solusi |
|---|---|
| Layar "Perlu Server Web" | Buka via GitHub Pages / `npx serve .`, bukan file:// |
| Data gagal dimuat | Cek `config.js` (URL & anon key), cek tabel sudah dibuat via schema.sql |
| Login admin gagal | Pastikan schema.sql sudah dijalankan (seed admin) |
| Error `crypt()` saat run schema | Gunakan schema.sql versi terbaru (sudah `with schema extensions`) |
| Import CSV: banyak NIK error | Format kolom NIK sebagai Text di Excel; jangan biarkan jadi notasi ilmiah |
| Import CSV: kolom wajib tidak ditemukan | Gunakan template dari tombol *Unduh Template* tanpa mengubah baris header |
| Upload gagal | Pastikan bucket `foto` & `dokumen` ada; ukuran file ≤ 2MB |
| Foto tidak tampil | Foto diupload ke bucket publik; cek URL di kolom `file_foto` |
| PDF petunjuk tidak terbuka | Pastikan file PDF ada di bucket `petunjuk` dan URL di kolom `file_url` valid; gunakan tombol *Tab Baru* |
| Tambah Dokumen Petunjuk gagal | Pastikan bucket `petunjuk` sudah dibuat (re-run schema.sql terbaru); PDF maksimal 2MB |

---

© 2026 Dinas Kesehatan Kab. Kutai Kartanegara · © Mukmin Nasri 2026
