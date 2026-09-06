-- ============================================================================
-- MANTAF v2 — PERBAIKAN LOGIN ADMIN (password tidak berhasil)
-- ============================================================================
-- CARA PAKAI:
--   1. Buka Supabase Dashboard > SQL Editor
--   2. Jalankan LANGKAH 1 dulu untuk melihat kondisi akun admin Anda
--   3. Jalankan LANGKAH 2 untuk mengganti password (ganti teks
--      'PasswordBaru123' dengan password yang Anda inginkan)
--   4. Jalankan LANGKAH 3 — jika muncul 1 baris berisi username, login
--      di panel admin PASTI berhasil dengan password baru tersebut
-- ============================================================================


-- ---------------------------------------------------------------------------
-- LANGKAH 1 — LIHAT KONDISI AKUN ADMIN (aman, hanya membaca)
-- ---------------------------------------------------------------------------
-- Hasil yang sehat:
--   - minimal 1 baris berisi username Anda
--   - aktif  = true
--   - prefix_hash diawali "$2a$" atau "$2b$" (hash bcrypt yang valid)
--
-- PENTING: bila prefix_hash TIDAK diawali "$2a$"/"$2b$", artinya kolom
-- password_hash berisi teks biasa (biasanya karena pernah diketik/diubah
-- lewat Table Editor) — inilah penyebab paling umum login selalu gagal,
-- karena fungsi admin_login membandingkan dengan crypt() bcrypt.
-- ---------------------------------------------------------------------------
select username, aktif, left(password_hash, 7) as prefix_hash, updated_at
from public.admin_users
order by created_at;


-- ---------------------------------------------------------------------------
-- LANGKAH 2 — RESET PASSWORD DENGAN BCRYPT YANG BENAR
-- ---------------------------------------------------------------------------
-- Ganti 'PasswordBaru123' dengan password pilihan Anda (minimal 6 karakter,
-- sesuai validasi panel admin). Jangan pakai tanda kutip tunggal di dalamnya.
-- Query ini sekaligus mengaktifkan kembali akun (aktif = true).
-- ---------------------------------------------------------------------------
update public.admin_users
set password_hash = crypt('PasswordBaru123', gen_salt('bf')),
    aktif = true
where username = 'admin';


-- ---------------------------------------------------------------------------
-- LANGKAH 3 — VERIFIKASI (WAJIB)
-- ---------------------------------------------------------------------------
-- Harus mengembalikan SATU baris berisi username, nama, dan role.
-- Bila hasilnya kosong, login di aplikasi akan tetap gagal.
-- ---------------------------------------------------------------------------
select * from public.admin_login('admin', 'PasswordBaru123');


-- ---------------------------------------------------------------------------
-- TAMBAHAN A — bila LANGKAH 1 hasilnya KOSONG (belum ada akun admin sama
-- sekali), buat akun default: admin / admin123 — segera ganti setelah login.
-- ---------------------------------------------------------------------------
-- insert into public.admin_users (username, password_hash, nama)
-- values ('admin', crypt('admin123', gen_salt('bf')), 'Administrator MantaF')
-- on conflict (username) do nothing;


-- ---------------------------------------------------------------------------
-- TAMBAHAN B — bila username Anda bukan 'admin', lihat nama yang benar di
-- LANGKAH 1, lalu sesuaikan bagian `where username = '...'` di LANGKAH 2
-- dan parameternya di LANGKAH 3.
-- ---------------------------------------------------------------------------


-- ============================================================================
-- CATATAN PENTING:
-- 1. JANGAN PERNAH mengubah kolom password_hash lewat Table Editor dengan
--    mengetik password biasa. Hash bcrypt tidak bisa dibuat manual — selalu
--    gunakan query di LANGKAH 2, atau tombol "Ganti Password" di Panel Admin.
-- 2. Setelah reset, login di aplikasi dengan username + password baru.
--    Bila halaman masih menolak, tekan Ctrl+Shift+R (hard refresh) agar
--    browser memuat admin.js terbaru, bukan versi cache.
-- 3. Tabel admin_users sengaja TIDAK punya policy RLS baca langsung —
--    kredensial hanya dapat diperiksa lewat fungsi keamanan admin_login().
--    Itu normal dan bukan error.
-- ============================================================================
