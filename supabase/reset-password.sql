-- ============================================================================
-- MANTAF — RESET AKUN ADMIN & OPERATOR (GUNAKAN HANYA SAAT DARURAT)
-- ============================================================================
-- Masalah: Password admin lupa / hash corrupt / akun terkunci terus
-- Solusi: Reset password admin & operator ke default + unlock akun
--
-- CARA PAKAI:
--   1. Buka Supabase Dashboard → SQL Editor → New query
--   2. Salin seluruh isi file ini
--   3. Klik Run
--   4. Login di aplikasi dengan:
--        Admin    → admin     / admin123
--        Operator → operator  / operator123
--   5. Setelah berhasil login, segera ganti password lewat "Akun Saya"
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. EKSTENSI
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------------
-- 1. PASTIKAN TABEL & KOLON ADA (kompatibel dengan skema lama/baru)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.admin_users add column if not exists nama                     text not null default 'Administrator';
alter table public.admin_users add column if not exists role                     text not null default 'admin';
alter table public.admin_users add column if not exists aktif                    boolean not null default true;
alter table public.admin_users add column if not exists last_login_at            timestamptz;
alter table public.admin_users add column if not exists last_password_change_at  timestamptz;
alter table public.admin_users add column if not exists password_changed_by      text;
alter table public.admin_users add column if not exists failed_login_count       integer not null default 0;
alter table public.admin_users add column if not exists locked_until             timestamptz;
alter table public.admin_users add column if not exists avatar_url               text;


-- ---------------------------------------------------------------------------
-- 2. RESET PASSWORD ADMIN → admin123 + UNLOCK + AKTIFKAN
--    (bila akun belum ada, dibuat; bila sudah ada, di-overwrite passwordnya)
-- ---------------------------------------------------------------------------
-- >>> GANTI 'admin123' DI BAWAH JIKA INGIN PASSWORD LAIN <<<
insert into public.admin_users (username, password_hash, nama, role, aktif,
                                failed_login_count, locked_until,
                                last_password_change_at, password_changed_by)
values ('admin',
        crypt('admin123', gen_salt('bf')),
        'Administrator MantaF',
        'admin',
        true,
        0,
        null,
        now(),
        'system-reset')
on conflict (username) do update
  set password_hash            = crypt('admin123', gen_salt('bf')),
      aktif                    = true,
      failed_login_count       = 0,
      locked_until             = null,
      last_password_change_at  = now(),
      password_changed_by      = 'system-reset';


-- ---------------------------------------------------------------------------
-- 3. RESET PASSWORD OPERATOR → operator123 + UNLOCK + AKTIFKAN
-- ---------------------------------------------------------------------------
-- >>> GANTI 'operator123' DI BAWAH JIKA INGIN PASSWORD LAIN <<<
insert into public.admin_users (username, password_hash, nama, role, aktif,
                                failed_login_count, locked_until,
                                last_password_change_at, password_changed_by)
values ('operator',
        crypt('operator123', gen_salt('bf')),
        'Operator MantaF',
        'operator',
        true,
        0,
        null,
        now(),
        'system-reset')
on conflict (username) do update
  set password_hash            = crypt('operator123', gen_salt('bf')),
      aktif                    = true,
      failed_login_count       = 0,
      locked_until             = null,
      last_password_change_at  = now(),
      password_changed_by      = 'system-reset';


-- ---------------------------------------------------------------------------
-- 4. VERIFIKASI — harus muncul 2 baris (admin + operator)
-- ---------------------------------------------------------------------------
select au.username,
       au.nama,
       au.role,
       au.aktif,
       au.failed_login_count,
       au.locked_until,
       au.last_password_change_at
from public.admin_users au
where lower(au.username) in ('admin', 'operator')
order by au.role, au.username;


-- ============================================================================
-- CATATAN:
-- 1. Setelah script ini dijalankan, password akan SELALU di-reset ke default:
--      Admin    → admin123
--      Operator → operator123
--    Gunakan HANYA saat lupa password. Untuk penggunaan rutin, gunakan
--    tombol "Akun Saya" di aplikasi untuk ganti password.
-- 2. Setelah berhasil login, segera ganti password lewat Panel Admin.
-- 3. Akun yang terkunci (karena 5x gagal login) juga akan di-unlock.
-- ============================================================================
