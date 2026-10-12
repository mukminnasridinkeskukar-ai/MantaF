-- ============================================================================
-- MANTAF v2 — KEAMANAN AKUN (ADMIN & OPERATOR)
-- ============================================================================
-- File ini ADDITIVE & IDEMPOTENT — aman dijalankan ulang.
-- Dapat dijalankan SETELAH schema.sql / perbaikan-login-admin.sql.
--
-- PENTING (v2.1.1 — fix):
--   Bila sebelumnya Anda mendapat error "column nama of relation admin_users
--   does not exist" atau RPC `admin_login` / `admin_list_users` tidak ditemukan,
--   file ini sudah diperbaiki dengan:
--     1. DROP semua function lama di awal (cascade) → memastikan recreate bersih
--        tanpa konflik language (sql vs plpgsql) atau return type.
--     2. ALTER TABLE add column `nama`, `role`, `aktif` sebelum INSERT/SELECT.
--
-- Yang ditambahkan:
--   0a. DROP function lama (cascade) supaya recreate bersih.
--   0b. Pastikan tabel admin_users + kolom inti (nama, role, aktif) ada.
--   A.  Kolom audit: last_login_at, last_password_change_at, password_changed_by,
--       failed_login_count, locked_until, avatar_url.
--   B.  Role 'operator' + seed akun default (username: operator | password: operator123).
--   C.  RPC admin_login versi aman (lockout 5x gagal → kunci 15 menit + audit trail).
--   D.  RPC admin_get_my_profile(p_username)         → profil sendiri.
--   E0. RPC admin_set_my_avatar(...)                 → upload/hapus foto profil.
--   E.  RPC admin_change_my_username(...)            → ubah username sendiri.
--   F.  RPC admin_change_password(...)               → ganti password (catat audit).
--   G.  RPC _admin_verify_requester(...) (internal)  → verifikasi admin untuk RPC manajemen.
--   H.  RPC admin_list_users(...)                    → daftar akun (admin only).
--   I.  RPC admin_create_user(...)                   → buat akun baru (admin only).
--   J.  RPC admin_update_user(...)                   → ubah nama/role/aktif (admin only).
--   K.  RPC admin_reset_user_password(...)           → reset password akun lain (admin only).
--   L.  RPC admin_delete_user(...)                   → hapus akun (admin only).
--   M.  RPC admin_unlock_user(...)                   → buka kunci manual (admin only).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. EKSTENSI
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------------
-- 0a. DROP SEMUA FUNCTION LAMA (jika ada) supaya bisa di-recreate bersih
--     Tanpa ini, "create or replace" bisa GAGAL bila function lama di-define
--     dengan language/return type berbeda (mis. dari schema.sql versi lawas).
--     DROP IF EXISTS aman bila function belum pernah dibuat.
--     CASCADE memastikan dependensi ikut terhapus.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_login(text, text) cascade;
drop function if exists public.admin_get_my_profile(text) cascade;
drop function if exists public.admin_change_my_username(text, text, text) cascade;
drop function if exists public.admin_change_password(text, text, text) cascade;
drop function if exists public.admin_set_my_avatar(text, text, text) cascade;
drop function if exists public.admin_list_users(text, text) cascade;
drop function if exists public.admin_create_user(text, text, text, text, text, text) cascade;
drop function if exists public.admin_update_user(text, text, uuid, text, text, boolean) cascade;
drop function if exists public.admin_reset_user_password(text, text, uuid, text) cascade;
drop function if exists public.admin_delete_user(text, text, uuid) cascade;
drop function if exists public.admin_unlock_user(text, text, uuid) cascade;
drop function if exists public._admin_verify_requester(text, text) cascade;


-- ---------------------------------------------------------------------------
-- 0b. PASTIKAN TABEL admin_users ADA & KOLON INTI LENGKAP
--     (Untuk user dengan skema lama yang belum run schema.sql terbaru.
--      ALTER ... ADD COLUMN IF NOT EXISTS aman dijalankan berulang kali.)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Kolom inti (dari schema.sql terbaru) — ditambahkan jika belum ada
alter table public.admin_users add column if not exists nama  text not null default 'Administrator';
alter table public.admin_users add column if not exists role  text not null default 'admin';
alter table public.admin_users add column if not exists aktif boolean not null default true;


-- ---------------------------------------------------------------------------
-- A. KOLON BARU PADA admin_users (audit & keamanan)
-- ---------------------------------------------------------------------------
alter table public.admin_users add column if not exists last_login_at           timestamptz;
alter table public.admin_users add column if not exists last_password_change_at timestamptz;
alter table public.admin_users add column if not exists password_changed_by     text;
alter table public.admin_users add column if not exists failed_login_count     integer not null default 0;
alter table public.admin_users add column if not exists locked_until           timestamptz;
alter table public.admin_users add column if not exists avatar_url             text;

-- Pastikan role mendukung 'operator' (constraint tidak ditambahkan agar fleksibel;
-- pengecekan nilai dilakukan di RPC).


-- ---------------------------------------------------------------------------
-- B. SEED AKUN OPERATOR DEFAULT (password: operator123) — GANTI SETELAH LOGIN!
-- ---------------------------------------------------------------------------
insert into public.admin_users (username, password_hash, nama, role)
values ('operator', crypt('operator123', gen_salt('bf')), 'Operator MantaF', 'operator')
on conflict (username) do nothing;

-- Pastikan akun admin default tetap ada dengan role 'admin'
update public.admin_users
set role = coalesce(nullif(role, ''), 'admin')
where username = 'admin';


-- ---------------------------------------------------------------------------
-- C. FUNGSI LOGIN VERSI AMAN (dengan lockout & audit)
--    Menggantikan fungsi admin_login sebelumnya (yang hanya cek crypt).
--    Tetap menerima teks biasa lama (sisa editan Table Editor) lalu
--    meng-upgrade-nya ke bcrypt otomatis — kompatibel dengan versi lama.
-- ---------------------------------------------------------------------------
create or replace function public.admin_login(p_username text, p_password text)
returns table (id uuid, username text, nama text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row            public.admin_users;
  v_cocok          boolean := false;
  v_max_attempts   integer := 5;
  v_lock_minutes   integer := 15;
begin
  -- Normalisasi username (case-insensitive, trim)
  select * into v_row
  from public.admin_users
  where lower(username) = lower(trim(p_username))
  limit 1;

  -- Username tidak ditemukan → return kosong (jangan bocorkan info)
  if v_row.id is null then
    return;
  end if;

  -- Akun nonaktif
  if v_row.aktif = false then
    return;
  end if;

  -- Akun sedang dikunci
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return;
  end if;

  -- Jika lock sudah lewat, reset counter
  if v_row.locked_until is not null and v_row.locked_until <= now() then
    update public.admin_users
    set failed_login_count = 0, locked_until = null
    where id = v_row.id;
    v_row.failed_login_count := 0;
    v_row.locked_until := null;
  end if;

  -- Cocokkan password (bcrypt ATAU teks biasa lama)
  if left(v_row.password_hash, 3) = '$2' then
    v_cocok := (v_row.password_hash = crypt(p_password, v_row.password_hash));
  else
    v_cocok := (v_row.password_hash = p_password);
  end if;

  if v_cocok then
    -- Upgrade teks biasa → bcrypt
    if left(v_row.password_hash, 3) <> '$2' then
      update public.admin_users
      set password_hash = crypt(p_password, gen_salt('bf'))
      where id = v_row.id;
    end if;

    -- Reset counter & catat login terakhir
    update public.admin_users
    set failed_login_count = 0,
        locked_until       = null,
        last_login_at      = now()
    where id = v_row.id;

    return query select v_row.id, v_row.username, v_row.nama, v_row.role;
    return;
  end if;

  -- Password salah → tambah counter, kunci bila mencapai batas
  update public.admin_users
  set failed_login_count = failed_login_count + 1,
      locked_until = case
        when failed_login_count + 1 >= v_max_attempts
          then now() + (v_lock_minutes || ' minutes')::interval
        else locked_until
      end
  where id = v_row.id;

  return;
end;
$$;

-- WAJIB: grant execute ke anon & authenticated supaya bisa dipanggil dari client
-- (drop function di atas menghapus grants lama dari schema.sql).
grant execute on function public.admin_login(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- D. FUNGSI GET PROFIL SENDIRI (untuk modal "Akun Saya")
--    Mengembalikan info profil SENDIRI berdasarkan username di session.
--    TIDAK mengembalikan password_hash.
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_my_profile(p_username text)
returns table (
  id uuid,
  username text,
  nama text,
  role text,
  aktif boolean,
  avatar_url text,
  last_login_at timestamptz,
  last_password_change_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  select id, username, nama, role, aktif, avatar_url,
         last_login_at, last_password_change_at,
         created_at, updated_at
  from public.admin_users
  where lower(username) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.admin_get_my_profile(p_username text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- E0. FUNGSI SET AVATAR SENDIRI (upload foto profil)
--     Verifikasi password (sama pola keamanan-nya dengan RPC manajemen akun).
--     URL avatar adalah URL publik dari bucket storage "foto" subfolder "avatar".
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_my_avatar(
  p_username text,
  p_password text,
  p_avatar_url text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row   public.admin_users;
  v_cocok boolean := false;
begin
  select * into v_row
  from public.admin_users
  where lower(username) = lower(trim(p_username))
    and aktif = true
  limit 1;

  if v_row.id is null then
    return false;
  end if;

  if left(v_row.password_hash, 3) = '$2' then
    v_cocok := (v_row.password_hash = crypt(p_password, v_row.password_hash));
  else
    v_cocok := (v_row.password_hash = p_password);
  end if;

  if not v_cocok then
    return false;
  end if;

  -- NULL atau string kosong = hapus avatar
  update public.admin_users
  set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), '')
  where id = v_row.id;

  return true;
end;
$$;

grant execute on function public.admin_set_my_avatar(text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- E. FUNGSI UBAH USERNAME SENDIRI
--    Wajib verifikasi password. Username baru harus unik (case-insensitive).
-- ---------------------------------------------------------------------------
create or replace function public.admin_change_my_username(
  p_username_lama text,
  p_username_baru text,
  p_password      text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row   public.admin_users;
  v_cocok boolean := false;
  v_uname text;
begin
  -- Validasi format username baru
  v_uname := lower(trim(p_username_baru));
  if v_uname = '' or length(v_uname) < 3 or length(v_uname) > 50 then
    return false;
  end if;
  if v_uname !~ '^[a-z0-9._-]+$' then
    return false;
  end if;

  select * into v_row
  from public.admin_users
  where lower(username) = lower(trim(p_username_lama))
    and aktif = true
  limit 1;

  if v_row.id is null then
    return false;
  end if;

  -- Cek password
  if left(v_row.password_hash, 3) = '$2' then
    v_cocok := (v_row.password_hash = crypt(p_password, v_row.password_hash));
  else
    v_cocok := (v_row.password_hash = p_password);
  end if;

  if not v_cocok then
    return false;
  end if;

  -- Cek unik (kecuali diri sendiri)
  if exists (
    select 1 from public.admin_users
    where lower(username) = v_uname
      and id <> v_row.id
  ) then
    return false;
  end if;

  -- Update username
  update public.admin_users
  set username = trim(p_username_baru)
  where id = v_row.id;

  return true;
end;
$$;

grant execute on function public.admin_change_my_username(text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- F. FUNGSI GANTI PASSWORD (diperbarui: catat last_password_change_at & by)
--    Tetap kompatibel dengan signature lama (p_username, p_password_lama, p_password_baru).
-- ---------------------------------------------------------------------------
create or replace function public.admin_change_password(
  p_username     text,
  p_password_lama text,
  p_password_baru text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row   public.admin_users;
  v_cocok boolean := false;
begin
  if p_password_baru is null or length(trim(p_password_baru)) < 6 then
    return false;
  end if;

  select * into v_row
  from public.admin_users
  where lower(username) = lower(trim(p_username))
    and aktif = true
  limit 1;

  if v_row.id is null then
    return false;
  end if;

  if left(v_row.password_hash, 3) = '$2' then
    v_cocok := (v_row.password_hash = crypt(p_password_lama, v_row.password_hash));
  else
    v_cocok := (v_row.password_hash = p_password_lama);
  end if;

  if v_cocok then
    update public.admin_users
    set password_hash            = crypt(p_password_baru, gen_salt('bf')),
        last_password_change_at  = now(),
        password_changed_by      = p_username
    where id = v_row.id;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.admin_change_password(text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- G. FUNGSI INTERNAL: VERIFIKASI REQUESTER (admin only, password benar)
--    Dipakai oleh RPC manajemen akun di bawah agar logika tidak diulang.
-- ---------------------------------------------------------------------------
create or replace function public._admin_verify_requester(
  p_requester_username text,
  p_requester_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row   public.admin_users;
  v_cocok boolean := false;
begin
  select * into v_row
  from public.admin_users
  where lower(username) = lower(trim(p_requester_username))
    and aktif = true
  limit 1;

  if v_row.id is null or v_row.role <> 'admin' then
    return false;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return false;
  end if;

  if left(v_row.password_hash, 3) = '$2' then
    v_cocok := (v_row.password_hash = crypt(p_requester_password, v_row.password_hash));
  else
    v_cocok := (v_row.password_hash = p_requester_password);
  end if;

  return v_cocok;
end;
$$;


-- ---------------------------------------------------------------------------
-- H. FUNGSI LIST USERS (admin only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_requester_username text,
  p_requester_password text
)
returns table (
  id uuid,
  username text,
  nama text,
  role text,
  aktif boolean,
  avatar_url text,
  last_login_at timestamptz,
  last_password_change_at timestamptz,
  failed_login_count integer,
  locked_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return;
  end if;

  return query
  select id, username, nama, role, aktif, avatar_url,
         last_login_at, last_password_change_at,
         failed_login_count, locked_until,
         created_at, updated_at
  from public.admin_users
  order by
    case when role = 'admin' then 0 else 1 end,
    username asc;
end;
$$;

grant execute on function public.admin_list_users(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- I. FUNGSI CREATE USER (admin only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_user(
  p_requester_username text,
  p_requester_password text,
  p_username           text,
  p_password           text,
  p_nama               text,
  p_role               text
)
returns table (id uuid, username text, nama text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uname text;
  v_role  text;
  v_nama  text;
  v_newid uuid;
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return;
  end if;

  -- Validasi username
  v_uname := lower(trim(p_username));
  if v_uname = '' or length(v_uname) < 3 or length(v_uname) > 50 then
    return;
  end if;
  if v_uname !~ '^[a-z0-9._-]+$' then
    return;
  end if;

  -- Validasi password
  if p_password is null or length(trim(p_password)) < 6 then
    return;
  end if;

  -- Validasi role
  v_role := lower(trim(coalesce(p_role, 'operator')));
  if v_role not in ('admin', 'operator') then
    v_role := 'operator';
  end if;

  v_nama := trim(coalesce(p_nama, ''));
  if v_nama = '' then
    v_nama := v_uname;
  end if;

  -- Cek unik
  if exists (select 1 from public.admin_users where lower(username) = v_uname) then
    return;
  end if;

  insert into public.admin_users (username, password_hash, nama, role,
                                  last_password_change_at, password_changed_by)
  values (trim(p_username), crypt(p_password, gen_salt('bf')), v_nama, v_role,
          now(), p_requester_username)
  returning id into v_newid;

  return query select v_newid, trim(p_username), v_nama, v_role;
end;
$$;

grant execute on function public.admin_create_user(text, text, text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- J. FUNGSI UPDATE USER (admin only) — ubah nama/role/aktif
--     Tidak boleh menonaktifkan / menurunkan role admin terakhir.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_user(
  p_requester_username text,
  p_requester_password text,
  p_id                 uuid,
  p_nama               text,
  p_role               text,
  p_aktif              boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target   public.admin_users;
  v_role     text;
  v_nama     text;
  v_admin_cnt integer;
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return false;
  end if;

  select * into v_target from public.admin_users where id = p_id;
  if v_target.id is null then
    return false;
  end if;

  v_role := lower(trim(coalesce(p_role, v_target.role)));
  if v_role not in ('admin', 'operator') then
    v_role := v_target.role;
  end if;
  v_nama := trim(coalesce(p_nama, ''));
  if v_nama = '' then
    v_nama := v_target.nama;
  end if;

  -- Jika akan menurunkan/menonaktifkan admin → pastikan masih ada minimal 1 admin aktif lain
  if v_target.role = 'admin' and (v_role <> 'admin' or p_aktif = false) then
    select count(*) into v_admin_cnt
    from public.admin_users
    where role = 'admin' and aktif = true and id <> v_target.id;

    if v_admin_cnt < 1 then
      return false;  -- tidak boleh hapus admin terakhir
    end if;
  end if;

  update public.admin_users
  set nama  = v_nama,
      role  = v_role,
      aktif = coalesce(p_aktif, v_target.aktif)
  where id = v_target.id;

  return true;
end;
$$;

grant execute on function public.admin_update_user(text, text, uuid, text, text, boolean) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- K. FUNGSI RESET PASSWORD AKUN LAIN (admin only)
--    Admin tidak perlu tahu password lama akun tersebut.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_user_password(
  p_requester_username text,
  p_requester_password text,
  p_id                 uuid,
  p_password_baru      text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target public.admin_users;
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return false;
  end if;

  if p_password_baru is null or length(trim(p_password_baru)) < 6 then
    return false;
  end if;

  select * into v_target from public.admin_users where id = p_id;
  if v_target.id is null then
    return false;
  end if;

  update public.admin_users
  set password_hash            = crypt(p_password_baru, gen_salt('bf')),
      last_password_change_at  = now(),
      password_changed_by      = p_requester_username,
      failed_login_count       = 0,
      locked_until             = null
  where id = v_target.id;

  return true;
end;
$$;

grant execute on function public.admin_reset_user_password(text, text, uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- L. FUNGSI DELETE USER (admin only)
--    Tidak boleh hapus diri sendiri & tidak boleh hapus admin terakhir.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_user(
  p_requester_username text,
  p_requester_password text,
  p_id                 uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target    public.admin_users;
  v_requester public.admin_users;
  v_admin_cnt integer;
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return false;
  end if;

  select * into v_target from public.admin_users where id = p_id;
  if v_target.id is null then
    return false;
  end if;

  -- Ambil data requester untuk cek diri sendiri
  select * into v_requester
  from public.admin_users
  where lower(username) = lower(trim(p_requester_username))
  limit 1;

  if v_target.id = v_requester.id then
    return false;  -- tidak boleh hapus diri sendiri
  end if;

  -- Tidak boleh hapus admin terakhir
  if v_target.role = 'admin' then
    select count(*) into v_admin_cnt
    from public.admin_users
    where role = 'admin' and aktif = true and id <> v_target.id;
    if v_admin_cnt < 1 then
      return false;
    end if;
  end if;

  delete from public.admin_users where id = v_target.id;
  return true;
end;
$$;

grant execute on function public.admin_delete_user(text, text, uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- M. UNLOCK AKUN (admin only) — buka kunci manual bila user terkunci
-- ---------------------------------------------------------------------------
create or replace function public.admin_unlock_user(
  p_requester_username text,
  p_requester_password text,
  p_id                 uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target public.admin_users;
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return false;
  end if;

  select * into v_target from public.admin_users where id = p_id;
  if v_target.id is null then
    return false;
  end if;

  update public.admin_users
  set failed_login_count = 0,
      locked_until       = null
  where id = v_target.id;

  return true;
end;
$$;

grant execute on function public.admin_unlock_user(text, text, uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- N. VERIFIKASI (dijalankan otomatis)
-- ---------------------------------------------------------------------------
-- Harus mengembalikan 2 baris (admin + operator) jika sukses.
select username, nama, role, aktif
from public.admin_users
where lower(username) in ('admin', 'operator')
order by role, username;


-- ============================================================================
-- CATATAN PENGGUNAAN:
-- 1. Setelah script ini dijalankan, login dengan:
--      Admin    → username: admin     | password: admin123
--      Operator → username: operator  | password: operator123
--    SEGERA ganti password keduanya lewat tombol "Ganti Password" di Panel Admin.
-- 2. Operator hanya bisa akses tab data (Pengumuman/Bezetting/Peserta/Petunjuk)
--    dan mengelola akunnya sendiri (Akun Saya → Ubah Username & Ganti Password).
-- 3. Admin punya tambahan tab "Manajemen Akun" untuk CRUD semua akun +
--    reset password + unlock akun yang terkunci otomatis.
-- 4. Setelah 5x gagal login berturut-turut, akun otomatis terkunci 15 menit.
-- 5. Tabel admin_users tetap dilindungi RLS (tidak bisa dibaca langsung dari
--    client); semua akses lewat RPC security definer di atas.
-- ============================================================================
