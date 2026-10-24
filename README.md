# MantaF v3.1.0 — Multi-User Edition

**Manajemen Tata Kelola Jabatan Fungsional Kesehatan**
Dinas Kesehatan Kabupaten Kutai Kartanegara

Frontend statis (untuk **GitHub Pages**) + Backend **Supabase** (Database, Auth RPC, Storage).
Aplikasi dipecah menjadi file modular agar lebih ringan: setiap halaman dimuat hanya saat dibuka (*lazy-load*).

> **v3.1.0 — REGISTRASI MANDIRI + PERSETUJUAN SUPERADMIN + ATURAN NIK & USERNAME:**
> 1. **Tombol "Daftar Akun" di halaman login** — pengunjung dapat mendaftar sendiri
>    (nama, username, password, role, unit kerja, NIK, email). Pendaftaran baru
>    berstatus **Menunggu Persetujuan** dan **belum bisa login**.
> 2. **Persetujuan oleh Superadmin** — tab baru **Persetujuan Akun** di Panel Admin
>    (khusus superadmin): daftar pemohon, **Setujui** (role/unit/NIK masih dapat
>    disesuaikan) atau **Tolak** beserta alasan. Pemohon yang mencoba login melihat
>    statusnya dengan jelas (Menunggu / Ditolak + alasan). Akun lama otomatis berstatus
>    disetujui — tidak ada yang terkunci setelah migrasi.
> 3. **1 NIK hanya boleh 1 akun** — unique index pada `admin_users` + validasi di semua
>    RPC (registrasi, tambah akun, ubah akun, setujui akun). NIK wajib untuk Pejabat
>    Fungsional, opsional role lain (16 digit angka).
> 4. **Username hanya dapat diubah Superadmin** — setiap akun hanya dapat mengganti
>    **password-nya sendiri** (Akun Saya). Fitur ubah username mandiri DINONAKTIFKAN;
>    superadmin mengubah username akun manapun dari **Manajemen Akun** (ikon user-pen)
>    dengan verifikasi password superadmin.
> 5. **Migrasi database** — jalankan `supabase/registrasi-v4.sql` (additive & idempotent,
>    WAJIB setelah `multiuser-v3.sql`): kolom `approval_status`/`approved_by`/`approved_at`/
>    `rejection_note`/`registered_email`, unique index NIK, RPC baru
>    `admin_register_request`, `admin_list_pending_users`, `admin_approve_user`,
>    `admin_reject_user`, `admin_change_username` (semua role lama tetap jalan).
> 6. **Hotfix REVISI 2 (24-10-2026)** — bila tombol **Daftar Akun** gagal dengan error
>    `column reference "id" is ambiguous` (HTTP 400), jalankan `supabase/hotfix-registrasi-v4.1.sql`
>    di SQL Editor (±10 detik, idempotent) ATAU jalankan ulang `registrasi-v4.sql` versi terbaru
>    (isi fungsi sudah diperbaiki: `RETURNING id` → `RETURNING admin_users.id`).

> **v3.0.0 — MULTI-USER 5 ROLE + LOGO BARU + PWA:**
> 1. **Sistem multi-user 5 role** — **Superadmin** (akses penuh + kelola semua akun,
>    pengganti role "admin"), **Operator** (CRUD Peserta UKOM + Import CSV),
>    **Pimpinan Faskes** (dashboard faskes sendiri, monitoring peserta unit kerjanya),
>    **Observer** (memantau seluruh data, read-only), dan **Pejabat Fungsional**
>    (dashboard pribadi riwayat pendaftaran + daftar UKOM). Menu sidebar otomatis
>    menyesuaikan role; login satu pintu untuk semua role.
> 2. **Logo MantaF baru yang elegan** — kuadrat rounded gradasi teal kesehatan +
>    monogram "M" + denyut nadi EKG emas. Tersedia lengkap: favicon 16/32,
>    ikon 64/192/512, **maskable icon** (Android adaptive), dan **apple-touch-icon 180**
>    (iPad/iPhone) — tampil tajam & elegan di home screen Android/smartphone/iPad/tablet.
> 3. **Siap PWA** — `manifest.webmanifest` + service worker ringan: platform dapat
>    *Add to Home Screen* dengan ikon penuh, warna tema teal, dan tampilan standalone.
> 4. **Migrasi database** — jalankan `supabase/multiuser-v3.sql` (additive & idempotent):
>    kolom baru `unit_kerja`/`nik`/`email` pada `admin_users`, kolom `account_username`
>    pada `peserta_ukom`, RPC login/profil/kelola akun v3, seed akun contoh 3 role baru.
>    Role lama `admin` otomatis menjadi `superadmin` — password lama TIDAK berubah.

> **v2.4.1 — FIX tabrakan deklarasi `bezettingCache`:**
> 1. **Perbaiki `Uncaught SyntaxError: Identifier 'bezettingCache' has already been declared`** —
>    variabel cache di `dashboard.js` kini bernama `dashBezettingCache` sehingga tidak lagi
>    bentrok dengan deklarasi di `bezetting.js` (halaman **Bezetting** & **Data Peserta UKOM**
>    gagal termuat karena error ini). Referensi lintas file kini dilindungi pemeriksaan
>    `typeof` (admin.js, csvimport.js).
> 2. **Cache dashboard selalu segar** — setiap perubahan data dari Panel Admin maupun hasil
>    import CSV otomatis membuang cache dashboard (`dashPesertaCache` & `dashBezettingCache`)
>    agar kartu statistik, donut, dan grafik tren menampilkan angka terkini saat dibuka lagi.
>
> **v2.4 — Foto profil akun di sidebar + privasi pop up dashboard:**
> 1. **Foto profil kini tampil di SIDEBAR** — saat admin/operator login, bagian profil sidebar
>    menampilkan foto akun (fallback: inisial nama), nama lengkap, dan role (Administrator/Operator).
>    Log out → kembali ke logo MantaF. Ganti/hapus foto tetap lewat **Panel Admin → Akun Saya →
>    Ganti Foto** (berlaku untuk akun **admin & operator**, tersimpan di bucket `foto` subfolder
>    `avatar`, kolom `avatar_url` tabel `admin_users`).
> 2. **Pop up dashboard kini bebas data sensitif** — semua pop up (Status UKOM, Status Verifikasi,
>    kategori Jenis UKOM/Jabfung/Periode, Unit Kerja, Instansi, Tren bulanan) tidak lagi
>    menampilkan **NIK, NIP, nomor WA/telpon, maupun email**. Kolom yang tampil: No, Nama, Unit
>    Kerja, Jenis UKOM, Jabfung, Periode, dan status. Pencarian di pop up kini per nama/unit kerja.
>
> **v2.3 — Dashboard dikembangkan (kartu pop up):**
> 1. **Kartu "Status UKOM"** — donut + daftar status (Lulus / Tidak Lulus / Menunggu / Belum Ada
>    Status); klik salah satu status → **pop up daftar peserta** berstatus tersebut (dari Supabase).
> 2. **Kartu kategori dinamis** — **Jenis UKOM**, **Jabfung Saat Ini**, dan **Periode**: jumlah
>    peserta dihitung otomatis per nilai unik; klik kartu → pop up daftar pesertanya.
> 3. **Kartu per Unit Kerja** — satu kartu untuk tiap unit kerja + jumlah pesertanya, klik → pop up.
> 4. Semua pop up dilengkapi **kotak pencarian** (nama / NIK / NIP / No. peserta) agar daftar
>    panjang tetap mudah ditelusuri. File terkait: `partials/dashboard.html`, `assets/js/dashboard.js`,
>    `assets/css/app.css`.
> 5. **Kartu statistik kini bisa diklik** — **Total Instansi** → pop up daftar instansi beserta
>    jumlah pesertanya (klik nama instansi → pop up daftar peserta); **Total Lowongan** → pop up
>    rincian bezetting (instansi, jenis jabatan, jenjang, kebutuhan, pemangku, lowongan) dengan
>    pencarian.
> 6. **Grafik "Tren Pendaftaran per Bulan"** — area chart SVG 12 bulan terakhir (dihitung dari
>    tanggal daftar peserta); arahkan kursor ke titik untuk tooltip, klik titik → pop up daftar
>    peserta yang mendaftar pada bulan tersebut.
>
> **v2.2.1 — FIX login password & upload foto profil:**
> 1. **Password di kolom `password_plain` kini adalah password yang BERLAKU** — cocok dipakai
>    login, dan mengedit kolom itu langsung di **Supabase Table Editor** (min. 6 karakter)
>    otomatis mengganti password akun (trigger sync ke `password_hash`). Password **tidak berubah
>    sendiri** lagi: login sukses tidak menimpa `password_plain` yang sudah terisi.
> 2. **Upload foto profil tidak gagal lagi setelah refresh halaman** — password verifikasi RPC
>    kini disimpan di `sessionStorage` (sebelumnya hilang saat F5 → semua RPC "verifikasi password
>    gagal"). Bucket `foto` + policy storage juga dipastikan ada oleh `akun-security.sql`.
>
> **v2.2** — **Username & password terlihat oleh ADMIN saja**: kolom **Password** baru di tab
> **Manajemen Akun** (ter-masker + tombol lihat & salin), password juga tersimpan pada kolom
> `password_plain` tabel `admin_users` sehingga muncul di **Supabase Table Editor** (tabel profil akun).
> Operator & publik tetap tidak dapat melihatnya (RLS + verifikasi admin di sisi RPC).
>
> **v2.1** — keamanan akun untuk **admin & operator**, panel **Akun Saya** (lihat profil, ubah username & password sendiri), tab **Manajemen Akun** (CRUD semua akun oleh admin), **auto-lockout** 5x gagal login, audit login terakhir & perubahan password.

---

## 📁 Struktur Proyek

```
mantaf/
├── index.html              ← Entry utama (shell + sidebar 3 bagian + router)
├── tryoutukom.html         ← Halaman Try Out CAT BKN (standalone, menu sidebar + integrasi Supabase)
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
    ├── schema.sql            ← SQL skema utama (tabel lama)
    ├── tryout-schema.sql     ← SQL tambahan Try Out (tabel baru saja, additive-only)
    └── akun-security.sql     ← ⚙️ KEAMANAN AKUN v2.2.1 (admin + operator + manajemen akun)
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
4. Salin **seluruh isi** `supabase/tryout-schema.sql` → klik **Run** (untuk Try Out CAT BKN).
   - Tabel baru: `tryout_categories`, `tryout_questions`, `tryout_attempts` + seed 150 soal
   - **Additive-only**: tidak mengubah/menghapus tabel & data yang sudah ada; idempotent (aman di-run ulang)
5. **(WAJIB v2.2.1)** Salin **seluruh isi** `supabase/akun-security.sql` → klik **Run**.
   - Menambahkan kolom audit (`last_login_at`, `last_password_change_at`, `failed_login_count`, `locked_until`)
     **+ kolom `password_plain` (arsip password tampilan untuk admin)**
   - **v2.2.1**: verifikasi password menerima `password_plain` (helper `_admin_check_password`),
     trigger `trg_admin_users_sync_plain` (edit `password_plain` di Table Editor = ganti password),
     login sukses **tidak menimpa** `password_plain`, bucket `foto` + policy storage dipastikan ada
   - Mengganti RPC `admin_login` dengan versi auto-lockout (5x gagal → kunci 15 menit)
   - Menambahkan RPC: `admin_get_my_profile`, `admin_change_my_username`, `admin_list_users`, `admin_create_user`, `admin_update_user`, `admin_reset_user_password`, `admin_delete_user`, `admin_unlock_user`
   - Menambahkan role `operator` + seed akun default
   - **Additive-only & idempotent** — aman di-run ulang
6. **(WAJIB v3.0.0 — MULTI-USER)** Salin **seluruh isi** `supabase/multiuser-v3.sql` → klik **Run**.
   - Kolom baru `admin_users`: `unit_kerja`, `nik`, `email` (profil per role)
   - Kolom baru `peserta_ukom`: `account_username` (penaut pendaftaran ↔ akun pejabat)
   - RPC v3: `admin_login` (return role/unit_kerja/nik/avatar), `admin_get_my_profile`,
     `admin_list_users`, `admin_create_user` (+unit_kerja/nik), `admin_update_user` (+unit_kerja/nik),
     `admin_delete_user` (proteksi superadmin terakhir) — semua mendukung 5 role
   - Role lama `admin` → `superadmin` otomatis; helper menerima keduanya (kompatibel)
   - **Seed 3 akun contoh**: `pimpinan/pimpinan123` · `observer/observer123` · `pejabat/pejabat123`
   - **Additive-only & idempotent** — aman di-run ulang
7. Login default:
   - **Superadmin**         → username: `admin`     · password: `admin123`
   - **Operator**           → username: `operator`  · password: `operator123`
   - **Pimpinan Faskes**    → username: `pimpinan`  · password: `pimpinan123`
   - **Observer**           → username: `observer`  · password: `observer123`
   - **Pejabat Fungsional** → username: `pejabat`   · password: `pejabat123`

   ⚠️ **Segera ganti** semua password lewat tombol **Akun Saya**.

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
| `admin_users` | Akun admin/operator (hash bcrypt + arsip `password_plain` untuk tampilan admin) | username, password_hash, password_plain |
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

## 👥 Multi-User 5 Role (v3.0.0)

Sejak v3, platform mendukung **5 role pengguna** dengan login satu pintu
(Panel Admin → "Login Platform"). Menu sidebar, halaman default, dan hak akses
otomatis menyesuaikan role. Definisi role ada di `assets/js/roles.js`.

### Matriks Menu per Role

| Menu / Fitur | Superadmin | Operator | Pimpinan Faskes | Observer | Pejabat Fungsional | Pengunjung |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard (global) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dashboard Saya (pribadi) | — | — | — | — | ✅ | — |
| Dashboard Faskes (unit kerja sendiri) | — | — | ✅ | — | — | — |
| Petunjuk / Pengumuman / Bezetting / Data Peserta (baca) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Daftar UKOM (formulir) | ✅ | ✅ | — | — | ✅ | ✅ |
| Cek Status | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Try Out CAT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Panel Admin (manajemen data) | ✅ CRUD semua | ✅ CRUD Peserta saja | ❌ | ❌ | ❌ | ❌ |
| Manajemen Akun (semua role) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Akun Saya (profil, username, password, foto) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

### Deskripsi Role

| Role | Tugas Utama | Halaman Default Setelah Login |
|---|---|---|
| **Superadmin** | Kendali penuh: CRUD semua data + kelola akun 5 role (termasuk mengisi Unit Kerja pimpinan & NIK pejabat) | Panel Admin |
| **Operator** | Input/kelola data Peserta UKOM + Import CSV; data lain lihat saja | Panel Admin |
| **Pimpinan Faskes** | Monitoring peserta UKOM dari faskes/unit kerjanya: statistik, donut status, distribusi jenis UKOM, tabel peserta (read-only) | Dashboard Faskes |
| **Observer** | Memantau seluruh statistik & data platform tanpa hak ubah | Dashboard |
| **Pejabat Fungsional** | Mendaftar UKOM, memantau riwayat & status pendaftaran pribadi, unduh sertifikat | Dashboard Saya |

### Cara Kerja Penautan Data

- **Pimpinan Faskes** → data difilter otomatis berdasarkan kolom `unit_kerja` akun
  (diisi Superadmin di **Manajemen Akun**). Pencocokan longgar: nama unit kerja peserta
  yang memuat unit kerja akun ikut dihitung.
- **Pejabat Fungsional** → pendaftaran tertaut lewat kolom `account_username`
  (terisi otomatis saat pejabat mengisi formulir dalam keadaan login) **atau** NIK
  yang tercatat pada akunnya. Saat formulir dibuka dalam keadaan login, NIK akun
  otomatis ter-pra-isi.
- Keamanan tingkat RPC tetap berlaku: hanya `superadmin` (atau legacy `admin`) yang
  dapat memanggil RPC manajemen akun; proteksi superadmin terakhir tetap aktif.

## 🛡️ Keamanan Akun (v2.1) — Admin & Operator

Sejak v2.1, sistem akun punya **2 role**: `admin` dan `operator`, dengan model keamanan berlapis.

### Role & Hak Akses

| Role | Pengumuman | Bezetting | Peserta UKOM | Petunjuk | Akun Saya | Manajemen Akun |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Admin** | ✅ Full CRUD | ✅ Full CRUD | ✅ Full CRUD | ✅ Full CRUD | ✅ Ubah username, password & foto | ✅ CRUD semua akun |
| **Operator** | 👁️ Lihat saja | 👁️ Lihat saja | ✅ Full CRUD | 👁️ Lihat saja | ✅ Ubah username, password & foto | ❌ Disembunyikan |

**Catatan untuk Operator:**
- Tab **Pengumuman**, **Bezetting**, **Petunjuk** → tombol Tambah, Edit, Hapus, dan Import CSV disembunyikan; muncul banner **"Mode Lihat"** di atas tabel.
- Tab **Peserta UKOM** → full akses (tambah/edit/hapus peserta, ubah status verifikasi, upload berkas, import CSV).
- Bila operator mencoba mengakses fungsi terlarang via console/dev-tools, fungsi tetap di-guard di sisi JS (`canManagePengumuman()` dst.) dan menampilkan toast "Akses ditolak".
- **Keamanan tingkat database:** karena RLS saat ini terbuka untuk anon (agar aplikasi statis jalan), operator secara teknis masih bisa query langsung ke tabel via Supabase client. Untuk produksi ketat, aktifkan Supabase Auth dan ubah policy tulis ke `to authenticated` (lihat **Catatan Keamanan**).

### Akun Saya (lihat & ubah profil sendiri)

Tombol **Akun Saya** di kanan atas Panel Admin membuka modal profil yang menampilkan:
- Username (kode), nama lengkap, role, status akun
- **Login terakhir** (timestamp)
- **Password terakhir diubah** (timestamp)
- Tanggal akun dibuat

Dari modal ini, pengguna dapat:
- **Ubah Username** — username baru (3–50 karakter; huruf/angka/._-). Wajib verifikasi password saat ini. Username harus unik (case-insensitive).
- **Ganti Password** — password lama, password baru (min. 6 karakter), konfirmasi. Password baru harus berbeda dari lama. Setelah berhasil, sesi & memori RPC ikut diperbarui.

### Manajemen Akun (admin only)

Tab ke-5 **Manajemen Akun** (hanya muncul untuk admin) berisi:
- **Daftar akun** dengan kolom: Username, **Password (v2.2)**, Nama, Role, Status (Aktif/Nonaktif/Terkunci), Login Terakhir, Password Diubah, Aksi.
- **Lihat Password** — password ter-masker (`••••••••`); tombol 👁 menampilkan/menyembunyikan dan tombol salin menyalinnya ke clipboard. **Hanya admin** yang dapat melihat kolom ini; operator tidak pernah menerima data password dari server.
- **Tambah Akun** — username, nama, role (admin/operator), status, password awal.
- **Edit Akun** — ubah nama, role, status (username tidak dapat diubah demi integritas referensi).
- **Reset Password** — admin dapat mereset password akun lain tanpa perlu tahu password lamanya.
- **Buka Kunci** — manual unlock akun yang terkunci karena 5x gagal login.
- **Hapus Akun** — tidak bisa hapus diri sendiri & tidak bisa hapus **admin terakhir**.

> 📌 **Password di Supabase (v2.2.1):** password tersimpan pada kolom `password_plain` tabel
> `admin_users` — buka **Supabase Dashboard → Table Editor → admin_users** untuk melihat username
> & password semua akun (tabel profil akun). **Password yang tampil di kolom ini adalah password
> yang berlaku** dan bisa langsung dipakai login. Mengedit isinya langsung di Table Editor
> (min. 6 karakter) otomatis mengganti password akun tersebut — hash di-sync lewat trigger
> `trg_admin_users_sync_plain`. Login sukses **tidak** menimpa `password_plain` yang sudah
> terisi, sehingga nilai di tabel tidak berubah sendiri. Password akun lama yang belum
> login/diubah/direset sejak fitur aktif tampil *Belum tercatat* hingga kejadian tsb.
>
> ⚠️ Konsekuensi keamanan: siapa pun yang dapat membuka Supabase Dashboard dapat membaca
> password. Jangan bagikan akses dashboard & gunakan password yang kuat.

### Auto-Lockout (perlindungan brute force)

- Setiap upaya login gagal → counter `failed_login_count` bertambah.
- Setelah **5x gagal berturut-turut** → akun otomatis **terkunci 15 menit** (`locked_until`).
- Login yang berhasil → counter direset & `last_login_at` diupdate.
- Admin dapat membuka kunci manual kapan saja lewat tab Manajemen Akun.

### Audit Trail

Kolom baru pada tabel `admin_users`:
| Kolom | Isi |
|---|---|
| `last_login_at` | Timestamp login terakhir yang berhasil |
| `last_password_change_at` | Timestamp password terakhir diubah |
| `password_changed_by` | Siapa yang mengubah (untuk reset oleh admin: username admin) |
| `failed_login_count` | Jumlah gagal login sejak sukses terakhir |
| `locked_until` | Timestamp kunci berakhir (NULL bila tidak terkunci) |

### RPC Baru (di `akun-security.sql`)

| RPC | Akses | Fungsi |
|---|---|---|
| `admin_login(p_username, p_password)` | publik | Login + lockout + catat `last_login_at` + sinkron `password_plain` (tanpa menimpa) |
| `admin_get_my_profile(p_username)` | publik | Profil sendiri (tanpa password) |
| `admin_change_my_username(p_username_lama, p_username_baru, p_password)` | publik | Ubah username sendiri (verifikasi password) |
| `admin_change_password(p_username, p_password_lama, p_password_baru)` | publik | Ganti password sendiri (versi diperbarui) |
| `admin_list_users(p_requester_username, p_requester_password)` | **admin** | Daftar semua akun **termasuk `password_plain`** |
| `admin_create_user(...)` | admin | Buat akun baru |
| `admin_update_user(...)` | admin | Ubah nama/role/aktif |
| `admin_reset_user_password(...)` | admin | Reset password akun lain |
| `admin_delete_user(...)` | admin | Hapus akun (proteksi diri sendiri & admin terakhir) |
| `admin_unlock_user(...)` | admin | Buka kunci manual |

Semua RPC admin-only memverifikasi `username + password` requester lewat fungsi internal `_admin_verify_requester` (cek role=admin, aktif, tidak terkunci, password benar).

### Aturan Verifikasi Password (v2.2.1)

Semua verifikasi (login, ganti password, upload avatar, manajemen akun) memakai satu helper
bersama `_admin_check_password`. Password dianggap **benar** bila cocok dengan salah satu dari:
1. `password_hash` **bcrypt** (path normal),
2. `password_hash` **teks biasa** (hasil edit manual — otomatis di-upgrade ke bcrypt sekali),
3. kolom **`password_plain`** (nilai yang terlihat admin di Table Editor / tab Manajemen Akun).

Bila yang cocok hanya `password_plain`, `password_hash` di-sync otomatis (self-healing) sehingga
tabel dan kredensial login tidak pernah berbeda. **Password tidak pernah berubah sendiri.**

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
| Tab Manajemen Akun tidak muncul | Hanya muncul untuk role `admin`. Login sebagai admin, bukan operator. |
| Login gagal padahal password benar | Akun mungkin terkunci (5x gagal). Tunggu 15 menit atau minta admin lain membuka kunci. |
| Login gagal padahal password sesuai kolom `password_plain` | Bug v2.2 lama: verifikasi hanya cek `password_hash`. **Fix:** jalankan ulang `supabase/akun-security.sql` **v2.2.1** (idempotent) — kolom `password_plain` kini ikut diverifikasi & di-sync otomatis. |
| Password di tabel `admin_users` berubah sendiri | Bug v2.2 lama: login sukses menimpa `password_plain`. **Fix:** file SQL v2.2.1 — login sukses tidak menimpa nilai yang sudah terisi. |
| Upload foto profil gagal "verifikasi password gagal" | Terjadi setelah refresh halaman (password verifikasi hilang dari memori). **Fix:** deploy `assets/js/admin.js` v2.2.1 (password kini di `sessionStorage`). Jika masih gagal: logout → login ulang → coba lagi. |
| Upload foto profil gagal "Upload gagal (...)" | Jalankan ulang `akun-security.sql` v2.2.1 (bagian T memastikan bucket `foto` + policy storage ada). Cek juga ukuran file ≤ 2 MB, format JPG/PNG/WEBP. |
| Password di Manajemen Akun tampil *Belum tercatat* | Normal untuk akun lama. Arsip terisi otomatis setelah akun tsb login, mengganti password, atau di-reset admin. Untuk akun default (admin/operator) yang passwordnya masih default, jalankan ulang `akun-security.sql` — backfill otomatis mengisi `admin123` / `operator123`. |
| Tombol Akun Saya error "Gagal memuat profil" | Jalankan `supabase/akun-security.sql` di SQL Editor Supabase. |
| Tidak bisa hapus akun admin | Sistem melarang hapus admin terakhir & hapus diri sendiri. |
| Reset password admin lain gagal | Pastikan password Anda (admin) benar di sesi — logout & login ulang bila ragu. |
| Lupa password admin (tidak ada admin lain) | **Cara termudah (v2.2.1):** edit kolom `password_plain` akun admin di **Table Editor → admin_users** (min. 6 karakter) — hash otomatis di-sync, password langsung berlaku. Alternatif: buka `supabase/akun-security.sql` → bagian **Z. RESET PASSWORD** → uncomment, ganti password, run, comment kembali. |
| Password berubah sendiri setelah run SQL | TIDAK MUNGKIN. Bagian B pakai `ON CONFLICT DO NOTHING` → password yang sudah diganti tidak di-overwrite. Bila terjadi, cek apakah ada admin lain yang reset, atau apakah Anda menjalankan SQL dari sumber lain. |
| Hash password berubah setelah login pertama | Ini **normal**. Bila password sebelumnya teks biasa (dari edit Table Editor), sistem upgrade sekali ke bcrypt. Password tetap sama, hanya format penyimpanan yang berubah jadi aman. |

---

© 2026 Dinas Kesehatan Kab. Kutai Kartanegara · © Mukmin Nasri 2026
