-- ============================================================================
-- MANTAF v3.0 — MIGRASI MULTI-USER (5 ROLE)
-- Manajemen Tata Kelola Jabatan Fungsional Kesehatan
-- Dinas Kesehatan Kabupaten Kutai Kartanegara
-- ============================================================================
-- CARA PAKAI:
--   1. Buka Supabase Dashboard > SQL Editor > New query
--   2. Copy SELURUH isi file ini, klik "Run"
--   3. AMAN dijalankan BERULANG (idempotent & additive) — tidak menghapus data.
--
-- PERINGATAN (sejak v3.1): JANGAN jalankan ulang file ini SETELAH
--   registrasi-v4.sql sudah dipasang — file ini akan menimpa kembali fungsi v4
--   (gerbang persetujuan akun, validasi 1 NIK 1 akun, dll) dengan versi v3.
--   Bila perlu mengulang migrasi fungsi, gunakan registrasi-v4.sql (REVISI 2)
--   yang sudah mencakup semua fungsi v3 + fitur v3.1.
--
-- REVISI 2 (HOTFIX 24-10-2026): perbaiki 'column reference "id" is ambiguous'
--   pada admin_create_user — 'RETURNING id' dikualifikasi menjadi
--   'RETURNING admin_users.id' (kolom output RETURNS TABLE(id) bentrok dgn
--   variabel PL/pgSQL).
--
-- YANG DILAKUKAN FILE INI:
--   A. Kolom baru admin_users : unit_kerja, nik, email (+ pastikan kolom audit v2 ada)
--   B. Migrasi role lama      : 'admin' -> 'superadmin' (akses penuh, istilah baru)
--   C. Kolom baru peserta_ukom: account_username (menautkan pendaftaran dgn akun)
--   D. RPC admin_login v3     : return unit_kerja, nik, avatar_url + lockout tetap jalan
--   E. RPC profil & kelola akun v3 : mendukung 5 role + simpan unit_kerja/nik
--   F. Seed 3 akun contoh     : pimpinan_faskes, observer, pejabat_fungsional
--
-- DAFTAR ROLE v3:
--   superadmin        -> akses penuh + manajemen semua akun
--   operator          -> CRUD Peserta UKOM (+import CSV), lainnya lihat saja
--   pimpinan_faskes   -> dashboard faskes sendiri (berdasar unit_kerja akun)
--   observer          -> memantau seluruh data (read-only)
--   pejabat_fungsional-> dashboard pribadi (riwayat pendaftaran sendiri)
--
-- LOGIN DEFAULT BARU (SEGERA GANTI via Akun Saya!):
--   pimpinan / pimpinan123   (Pimpinan Faskes)
--   observer / observer123   (Observer)
--   pejabat  / pejabat123    (Pejabat Fungsional)
--   (akun lama admin & operator TIDAK diubah password-nya)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. KOLOM BARU admin_users (profil per role)
-- ---------------------------------------------------------------------------
alter table public.admin_users add column if not exists unit_kerja text not null default '';
alter table public.admin_users add column if not exists nik       text not null default '';
alter table public.admin_users add column if not exists email     text not null default '';

-- Pastikan kolom audit & arsip dari v2.1-v2.4 tetap ada (idempotent)
alter table public.admin_users add column if not exists password_plain          text default '';
alter table public.admin_users add column if not exists avatar_url              text;
alter table public.admin_users add column if not exists last_login_at           timestamptz;
alter table public.admin_users add column if not exists last_password_change_at timestamptz;
alter table public.admin_users add column if not exists password_changed_by     text default '';
alter table public.admin_users add column if not exists failed_login_count      integer not null default 0;
alter table public.admin_users add column if not exists locked_until            timestamptz;

create index if not exists idx_admin_users_role on public.admin_users (role);

-- ---------------------------------------------------------------------------
-- B. MIGRASI ROLE LAMA: 'admin' -> 'superadmin'
--    (helper di bawah tetap MENERIMA 'admin' agar versi lama frontend aman)
-- ---------------------------------------------------------------------------
update public.admin_users set role = 'superadmin' where role = 'admin';

-- ---------------------------------------------------------------------------
-- C. KOLOM BARU peserta_ukom: account_username
--    Saat pejabat fungsional yang sedang login mengisi formulir Daftar UKOM,
--    username-nya dicatat di baris pendaftaran -> dashboard pribadi otomatis
--    menampilkan riwayat tanpa perlu konfigurasi tambahan.
-- ---------------------------------------------------------------------------
alter table public.peserta_ukom add column if not exists account_username text default '';
create index if not exists idx_peserta_akun on public.peserta_ukom (account_username);

-- ---------------------------------------------------------------------------
-- D. HELPER BERSAMA (standalone — aman di-run meski akun-security.sql belum ada)
-- ---------------------------------------------------------------------------
create or replace function public._admin_check_password(
  p_password_hash text,
  p_password_plain text,
  p_password text
)
returns boolean
language plpgsql
stable
set search_path = public, extensions
as $$
begin
  if p_password is null or p_password = '' then
    return false;
  end if;

  -- 1. Hash bcrypt (path normal)
  if p_password_hash is not null and left(p_password_hash, 3) = '$2' then
    return p_password_hash = crypt(p_password, p_password_hash);
  end if;

  -- 2. Hash teks biasa (hasil edit manual di Table Editor)
  if p_password_hash is not null and p_password_hash <> '' then
    if p_password_hash = p_password then
      return true;
    end if;
  end if;

  -- 3. Kolom password_plain (arsip yang terlihat admin)
  if p_password_plain is not null and p_password_plain <> '' then
    return p_password_plain = p_password;
  end if;

  return false;
end;
$$;

-- Trigger sinkronisasi password_plain -> password_hash (bila belum ada)
create or replace function public._sync_password_plain()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.password_plain is not null
     and btrim(new.password_plain) <> ''
     and length(btrim(new.password_plain)) >= 6
     and (tg_op = 'INSERT' or new.password_plain is distinct from old.password_plain)
     and (new.password_hash is null
          or not public._admin_check_password(new.password_hash, null, btrim(new.password_plain))) then
    new.password_hash := crypt(btrim(new.password_plain), gen_salt('bf'));
    new.updated_at    := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_users_sync_plain on public.admin_users;
create trigger trg_admin_users_sync_plain
before insert or update on public.admin_users
for each row execute function public._sync_password_plain();

-- ---------------------------------------------------------------------------
-- E. RPC LOGIN v3 (semua role) — ganti signature lama, wajib DROP dulu
--    Return: id, username, nama, role, unit_kerja, nik, avatar_url
--    Lockout 5x gagal -> kunci 15 menit tetap berlaku.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_login(text, text);

create or replace function public.admin_login(p_username text, p_password text)
returns table (id uuid, username text, nama text, role text,
               unit_kerja text, nik text, avatar_url text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row            public.admin_users;
  v_cocok_hash     boolean := false;
  v_cocok_plain    boolean := false;
  v_max_attempts   integer := 5;
  v_lock_minutes   integer := 15;
begin
  select au.* into v_row
  from public.admin_users au
  where lower(au.username) = lower(trim(p_username))
  limit 1;

  if v_row.id is null then
    return;
  end if;

  if v_row.aktif = false then
    return;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return;
  end if;

  if v_row.locked_until is not null and v_row.locked_until <= now() then
    update public.admin_users
    set failed_login_count = 0, locked_until = null
    where admin_users.id = v_row.id;
    v_row.failed_login_count := 0;
    v_row.locked_until := null;
  end if;

  v_cocok_hash  := public._admin_check_password(v_row.password_hash, null, p_password);
  v_cocok_plain := not v_cocok_hash
                   and public._admin_check_password(null, v_row.password_plain, p_password);

  if v_cocok_hash or v_cocok_plain then
    if v_cocok_plain then
      update public.admin_users
      set password_hash = crypt(p_password, gen_salt('bf'))
      where admin_users.id = v_row.id;
    end if;

    update public.admin_users
    set failed_login_count = 0,
        locked_until       = null,
        last_login_at      = now(),
        password_plain     = coalesce(nullif(v_row.password_plain, ''), p_password)
    where admin_users.id = v_row.id;

    -- Normalisasi role lama 'admin' -> 'superadmin' saat dikembalikan
    return query select v_row.id, v_row.username, v_row.nama,
                        case when v_row.role = 'admin' then 'superadmin' else v_row.role end,
                        v_row.unit_kerja, v_row.nik, v_row.avatar_url;
    return;
  end if;

  update public.admin_users
  set failed_login_count = failed_login_count + 1,
      locked_until = case
        when failed_login_count + 1 >= v_max_attempts
          then now() + (v_lock_minutes || ' minutes')::interval
        else locked_until
      end
  where admin_users.id = v_row.id;

  return;
end;
$$;

grant execute on function public.admin_login(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- F. VERIFIKASI REQUESTER v3 — terima 'superadmin' ATAU legacy 'admin'
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
begin
  select au.* into v_row
  from public.admin_users au
  where lower(au.username) = lower(trim(p_requester_username))
    and au.aktif = true
  limit 1;

  if v_row.id is null or v_row.role not in ('admin', 'superadmin') then
    return false;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return false;
  end if;

  return public._admin_check_password(v_row.password_hash, v_row.password_plain, p_requester_password);
end;
$$;


-- ---------------------------------------------------------------------------
-- G. PROFIL SENDIRI v3 (+ unit_kerja, nik, email) — ganti signature, DROP dulu
-- ---------------------------------------------------------------------------
drop function if exists public.admin_get_my_profile(text);

create or replace function public.admin_get_my_profile(p_username text)
returns table (
  id uuid,
  username text,
  nama text,
  role text,
  unit_kerja text,
  nik text,
  email text,
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
  select au.id, au.username, au.nama,
         case when au.role = 'admin' then 'superadmin' else au.role end,
         au.unit_kerja, au.nik, au.email, au.aktif, au.avatar_url,
         au.last_login_at, au.last_password_change_at,
         au.created_at, au.updated_at
  from public.admin_users au
  where lower(au.username) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.admin_get_my_profile(text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- H. LIST USERS v3 (+ unit_kerja, nik) — hanya superadmin/admin
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_users(text, text);

create or replace function public.admin_list_users(
  p_requester_username text,
  p_requester_password text
)
returns table (
  id uuid,
  username text,
  password_plain text,
  nama text,
  role text,
  unit_kerja text,
  nik text,
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
  select au.id, au.username, au.password_plain, au.nama,
         case when au.role = 'admin' then 'superadmin' else au.role end,
         au.unit_kerja, au.nik, au.aktif, au.avatar_url,
         au.last_login_at, au.last_password_change_at,
         au.failed_login_count, au.locked_until,
         au.created_at, au.updated_at
  from public.admin_users au
  order by
    case when au.role in ('admin','superadmin') then 0
         when au.role = 'operator' then 1
         else 2 end,
    au.username asc;
end;
$$;

grant execute on function public.admin_list_users(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- I. CREATE USER v3 — tambah p_unit_kerja & p_nik (default kosong),
--    validasi 5 role, 'admin' dinormalisasi ke 'superadmin'
-- ---------------------------------------------------------------------------
drop function if exists public.admin_create_user(text, text, text, text, text, text);

create or replace function public.admin_create_user(
  p_requester_username text,
  p_requester_password text,
  p_username           text,
  p_password           text,
  p_nama               text,
  p_role               text,
  p_unit_kerja         text default '',
  p_nik                text default ''
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
  v_faskes text;
  v_nik    text;
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

  -- Validasi role (5 role v3; 'admin' = alias lama -> superadmin)
  v_role := lower(trim(coalesce(p_role, 'operator')));
  if v_role = 'admin' then
    v_role := 'superadmin';
  end if;
  if v_role not in ('superadmin', 'operator', 'pimpinan_faskes', 'observer', 'pejabat_fungsional') then
    v_role := 'operator';
  end if;

  v_nama := trim(coalesce(p_nama, ''));
  if v_nama = '' then
    v_nama := v_uname;
  end if;

  -- unit_kerja wajib relevan utk pimpinan faskes; NIK 16 digit utk pejabat (opsional)
  v_faskes := trim(coalesce(p_unit_kerja, ''));
  v_nik    := trim(coalesce(p_nik, ''));
  if v_nik <> '' and v_nik !~ '^[0-9]{16}$' then
    return;  -- NIK diisi tapi tidak valid (harus 16 digit angka)
  end if;

  -- Cek unik
  if exists (select 1 from public.admin_users au where lower(au.username) = v_uname) then
    return;
  end if;

  insert into public.admin_users (username, password_hash, password_plain, nama, role,
                                  unit_kerja, nik, last_password_change_at, password_changed_by)
  values (trim(p_username), crypt(p_password, gen_salt('bf')), p_password, v_nama, v_role,
          v_faskes, v_nik, now(), p_requester_username)
  returning admin_users.id into v_newid;  -- REVISI 2: dikualifikasi agar tidak ambigu dgn variabel output fungsi

  return query select v_newid, trim(p_username), v_nama, v_role;
end;
$$;

grant execute on function public.admin_create_user(text, text, text, text, text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- J. UPDATE USER v3 — tambah p_unit_kerja & p_nik,
--    proteksi superadmin terakhir tetap berlaku
-- ---------------------------------------------------------------------------
drop function if exists public.admin_update_user(text, text, uuid, text, text, boolean);

create or replace function public.admin_update_user(
  p_requester_username text,
  p_requester_password text,
  p_id                 uuid,
  p_nama               text,
  p_role               text,
  p_aktif              boolean,
  p_unit_kerja         text default null,
  p_nik                text default null
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

  select au.* into v_target from public.admin_users au where au.id = p_id;
  if v_target.id is null then
    return false;
  end if;

  v_role := lower(trim(coalesce(p_role, v_target.role)));
  if v_role = 'admin' then
    v_role := 'superadmin';
  end if;
  if v_role not in ('superadmin', 'operator', 'pimpinan_faskes', 'observer', 'pejabat_fungsional') then
    v_role := v_target.role;
  end if;

  v_nama := trim(coalesce(p_nama, ''));
  if v_nama = '' then
    v_nama := v_target.nama;
  end if;

  -- Jika akan menurunkan/menonaktifkan superadmin -> pastikan masih ada >= 1 superadmin aktif lain
  if v_target.role in ('admin','superadmin') and (v_role <> 'superadmin' or p_aktif = false) then
    select count(*) into v_admin_cnt
    from public.admin_users au
    where au.role in ('admin','superadmin') and au.aktif = true and au.id <> v_target.id;

    if v_admin_cnt < 1 then
      return false;  -- tidak boleh turunkan/hapus superadmin terakhir
    end if;
  end if;

  update public.admin_users
  set nama       = v_nama,
      role       = v_role,
      aktif      = coalesce(p_aktif, v_target.aktif),
      unit_kerja = coalesce(p_unit_kerja, v_target.unit_kerja),
      nik        = coalesce(p_nik, v_target.nik)
  where admin_users.id = v_target.id;

  return true;
end;
$$;

grant execute on function public.admin_update_user(text, text, uuid, text, text, boolean, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- K. DELETE USER v3 — proteksi superadmin terakhir utk role baru
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

  select au.* into v_target from public.admin_users au where au.id = p_id;
  if v_target.id is null then
    return false;
  end if;

  select au2.* into v_requester
  from public.admin_users au2
  where lower(au2.username) = lower(trim(p_requester_username))
  limit 1;

  if v_target.id = v_requester.id then
    return false;  -- tidak boleh hapus diri sendiri
  end if;

  -- Tidak boleh hapus superadmin terakhir
  if v_target.role in ('admin','superadmin') then
    select count(*) into v_admin_cnt
    from public.admin_users au3
    where au3.role in ('admin','superadmin') and au3.aktif = true and au3.id <> v_target.id;
    if v_admin_cnt < 1 then
      return false;
    end if;
  end if;

  delete from public.admin_users where admin_users.id = v_target.id;
  return true;
end;
$$;

grant execute on function public.admin_delete_user(text, text, uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- L. SEED AKUN CONTOH UNTUK 3 ROLE BARU (on conflict do nothing ->
--    password akun yang sudah ada TIDAK ditimpa. SEGERA GANTI via Akun Saya!)
-- ---------------------------------------------------------------------------
insert into public.admin_users (username, password_hash, password_plain, nama, role, unit_kerja)
values ('pimpinan', crypt('pimpinan123', gen_salt('bf')), 'pimpinan123',
        'Pimpinan Faskes (Contoh)', 'pimpinan_faskes', 'Puskesmas Tenggarong')
on conflict (username) do nothing;

insert into public.admin_users (username, password_hash, password_plain, nama, role)
values ('observer', crypt('observer123', gen_salt('bf')), 'observer123',
        'Observer (Contoh)', 'observer')
on conflict (username) do nothing;

insert into public.admin_users (username, password_hash, password_plain, nama, role)
values ('pejabat', crypt('pejabat123', gen_salt('bf')), 'pejabat123',
        'Pejabat Fungsional (Contoh)', 'pejabat_fungsional')
on conflict (username) do nothing;

-- Pastikan akun admin lama tetap aktif & ber-role superadmin (tanpa ubah password)
update public.admin_users
set role = 'superadmin', aktif = true
where lower(username) = 'admin' and role <> 'superadmin';

-- Pastikan akun operator lama tetap aktif (tanpa ubah password)
update public.admin_users
set role = 'operator', aktif = true
where lower(username) = 'operator' and role <> 'operator';


-- ============================================================================
-- SELESAI — verifikasi cepat (jalankan di SQL Editor bila perlu):
--   select username, nama, role, unit_kerja from public.admin_users order by role;
-- Login contoh role baru:
--   pimpinan / pimpinan123   |  observer / observer123  |  pejabat / pejabat123
-- ============================================================================
