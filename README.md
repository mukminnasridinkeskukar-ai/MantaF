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
│   ├── pengumuman.html       Daftar pengumuman (publik)
│   ├── bezetting.html        Tabel bezetting + filter (publik)
│   ├── ukom.html             Formulir pendaftaran UKOM
│   ├── peserta-ukom.html     Data peserta UKOM (publik)
│   ├── status.html           Cek status peserta
│   └── admin.html            Panel admin (login + CRUD)
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
│       ├── pengumuman.js     Read pengumuman
│       ├── bezetting.js      Read + filter bezetting
│       ├── ukom.js           Submit pendaftaran + upload storage
│       ├── peserta-ukom.js   Tabel peserta publik
│       ├── status.js         Cek status + form perbaikan
│       └── admin.js          Login + CRUD total 3 tab
└── supabase/
    └── schema.sql            ← SQL lengkap untuk Supabase
```

---

## 🚀 Langkah Setup (5 Menit)

### 1️⃣ Setup Supabase (Backend)

1. Buat akun/project baru di [supabase.com](https://supabase.com) (gratis).
2. Buka **SQL Editor** → klik **New query**.
3. Salin **seluruh isi** `supabase/schema.sql` → klik **Run**.
   - Membuat tabel: `admin_users`, `pengumuman`, `bezetting`, `peserta_ukom`
   - Membuat bucket Storage: `foto`, `dokumen`
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
| **1. Menu Utama** | Dashboard |
| **2. Data & Informasi** | Pengumuman · Bezetting · Data Peserta UKOM |
| **3. Layanan & Admin** | Daftar UKOM · Cek Status · Admin |

## 🛡️ Panel Admin — CRUD Total (Data Bagian ke-2)

Login sebagai admin, lalu tersedia 3 tab yang masing-masing mendukung **Create, Read, Update, Delete**:

| Tab | Kemampuan |
|---|---|
| 📢 **Pengumuman** | Tambah/edit/hapus, prioritas (Normal/Penting/Segera), aktif/nonaktif, cari judul |
| 🗂️ **Bezetting** | Tambah/edit/hapus baris, saran instansi & jabfung (datalist), filter instansi, kolom *sisa* otomatis |
| 👥 **Peserta UKOM** | Tambah/edit/hapus peserta, kelola periode & no. peserta, PAK Instansi/SI ASN, absen & status UKOM, ganti foto/sertifikat, ubah **status verifikasi** + **catatan admin** dari modal detail |

Perubahan admin langsung tampil di halaman publik (dashboard, pengumuman, bezetting, data peserta, cek status).

## 🗃️ Skema Database (Ringkas)

| Tabel | Fungsi | Kolom kunci |
|---|---|---|
| `admin_users` | Akun admin (hash bcrypt via pgcrypto) | username, password_hash |
| `pengumuman` | Pengumuman publik | judul, isi, tanggal, prioritas, aktif |
| `bezetting` | Kebutuhan jabfung | instansi, jenis_jabatan, jenjang, kebutuhan, pemangku, lowongan, sisa (generated) |
| `peserta_ukom` | Peserta + berkas (URL Storage) | nik, nip, nama, unit kerja, file_*, periode, no_peserta, status_verifikasi, catatan_admin |

Storage: bucket **foto** (foto 4x6, sertifikat) & **dokumen** (PDF persyaratan) — keduanya publik agar URL bisa dibaca langsung.

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
| Upload gagal | Pastikan bucket `foto` & `dokumen` ada; ukuran file ≤ 2MB |
| Foto tidak tampil | Foto diupload ke bucket publik; cek URL di kolom `file_foto` |

---

© 2026 Dinas Kesehatan Kab. Kutai Kartanegara · © Mukmin Nasri 2026
