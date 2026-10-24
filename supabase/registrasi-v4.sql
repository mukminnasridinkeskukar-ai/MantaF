-- ============================================================================
-- MANTAF v3.1 — REGISTRASI AKUN + PERSETUJUAN SUPERADMIN
-- Manajemen Tata Kelola Jabatan Fungsional Kesehatan
-- Dinas Kesehatan Kabupaten Kutai Kartanegara
-- ============================================================================
-- CARA PAKAI:
--   1. Buka Supabase Dashboard > SQL Editor > New query
--   2. Copy SELURUH isi file ini, klik "Run"
--   3. AMAN dijalankan BERULANG (idempotent & additive) — tidak menghapus data.
--   WAJIB dijalankan SETELAH multiuser-v3.sql (kolom role/unit_kerja/nik).
--
-- YANG DILAKUKAN FILE INI (4 FITUR BARU):
--   1. REGISTRASI MANDIRI  : pengunjung mendaftar sendiri dari halaman login
--                            (tombol "Daftar Akun") → akun berstatus PENDING.
--   2. PERSETUJUAN ADMIN   : akun pending BARU BISA LOGIN setelah disetujui
--                            superadmin (Setujui/Tolak dari Panel Admin).
--   3. NIK SATU AKUN       : 1 NIK hanya boleh dipakai 1 akun (unique index
--                            + validasi di semua RPC: registrasi, buat akun,
--                            ubah akun, setujui akun).
--   4. USERNAME KHUSUS     : setiap akun hanya bisa mengganti PASSWORD-nya
--                            sendiri; USERNAME hanya dapat diubah SUPERADMIN
--                            (RPC admin_change_username). Ubah username sendiri
--                            (admin_change_my_username) DINONAKTIFKAN.
--
-- ATURAN BARU LOGIN:
--   - Akun PENDING  → login ditolak: "Akun Anda masih menunggu persetujuan
--     superadmin" (kode AKUN_PENDING — ditampilkan jelas di layar login).
--   - Akun DITOLAK  → login ditolak + alasan penolakan ditampilkan
--     (kode AKUN_DITOLAK). Superadmin dapat menghapus akun ditolak agar
--     pemohon bisa mendaftar ulang, atau menyetujuinya kembali.
--   - Akun existing (sebelum v3.1) otomatis berstatus APPROVED → tetap login.
--
-- ROLE YANG BOLEH DIDAFTARKAN MANDIRI (registrasi publik):
--   operator, pimpinan_faskes, observer, pejabat_fungsional
--   (akun SUPERADMIN hanya dibuat oleh superadmin lewat Panel Admin.)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- A. KOLOM BARU admin_users (status persetujuan)
--    Semua akun lama otomatis 'approved' → tidak ada yang terkunci.
-- ---------------------------------------------------------------------------
alter table public.admin_users add column if not exists approval_status text not null default 'approved';
alter table public.admin_users add column if not exists approved_by      text not null default '';
alter table public.admin_users add column if not exists approved_at      timestamptz;
alter table public.admin_users add column if not exists rejection_note   text not null default '';
alter table public.admin_users add column if not exists registered_email text not null default '';

create index if not exists idx_admin_users_approval on public.admin_users (approval_status);

-- Normalisasi: baris lama yang entah bagaimana kosong → approved
update public.admin_users set approval_status = 'approved' where approval_status is null or approval_status = '';


-- ---------------------------------------------------------------------------
-- B. ATURAN 1 NIK = 1 AKUN (unique partial index)
--    Index dibuat HANYA bila data NIK existing tidak ada duplikat.
--    Bila ada duplikat, script tetap jalan (tidak gagal) — duplikat harus
--    dibersihkan manual, sementara validasi RPC di bawah tetap menjaga.
-- ---------------------------------------------------------------------------
do $$
declare
  v_dup integer;
begin
  select count(*) into v_dup from (
    select lower(btrim(nik)) as n
    from public.admin_users
    where nik is not null and btrim(nik) <> ''
    group by lower(btrim(nik))
    having count(*) > 1
  ) d;

  if v_dup = 0 then
    execute 'create unique index if not exists uq_admin_users_nik on public.admin_users (lower(btrim(nik))) where nik is not null and btrim(nik) <> ''''';
    raise notice 'OK: unique index NIK aktif (1 NIK hanya boleh 1 akun).';
  else
    raise notice 'PERINGATAN: ditemukan % pasangan NIK ganda pada admin_users. Unique index TIDAK dibuat — bersihkan duplikat NIK lalu jalankan ulang file ini.', v_dup;
  end if;
end $$;

-- Helper cek NIK dipakai akun lain (dipakai banyak RPC di bawah)
create or replace function public._admin_nik_taken(p_nik text, p_exclude_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.admin_users au
    where au.nik is not null
      and btrim(au.nik) <> ''
      and lower(btrim(au.nik)) = lower(btrim(p_nik))
      and (p_exclude_id is null or au.id <> p_exclude_id)
  );
$$;


-- ---------------------------------------------------------------------------
-- C. RPC LOGIN v4 — tolak akun PENDING / DITOLAK dengan pesan jelas.
--    Pesan diawali kode "AKUN_PENDING:" / "AKUN_DITOLAK:" / "AKUN_NONAKTIF:"
--    agar frontend bisa menampilkan alasan yang ramah pengguna.
--    Urutan pemeriksaan: user ada → tidak terkunci → password benar →
--    baru status persetujuan (agar tidak membocorkan info ke non-pemilik).
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

    -- ===== v3.1: GERBANG PERSETUJUAN =====
    if v_row.aktif = false then
      raise exception 'AKUN_NONAKTIF: Akun Anda dinonaktifkan. Hubungi superadmin untuk informasi lebih lanjut.';
    end if;

    if coalesce(v_row.approval_status, 'approved') = 'pending' then
      raise exception 'AKUN_PENDING: Pendaftaran akun "%s" masih MENUNGGU PERSETUJUAN superadmin. Silakan tunggu hingga disetujui, Anda akan bisa login setelahnya.', v_row.username;
    end if;

    if coalesce(v_row.approval_status, 'approved') = 'rejected' then
      if coalesce(v_row.rejection_note, '') = '' then
        raise exception 'AKUN_DITOLAK: Pendaftaran akun "%s" DITOLAK oleh superadmin. Hubungi superadmin untuk informasi lebih lanjut.', v_row.username;
      else
        raise exception 'AKUN_DITOLAK: Pendaftaran akun "%s" DITOLAK oleh superadmin. Alasan: %s', v_row.username, v_row.rejection_note;
      end if;
    end if;

    -- Normalisasi role lama 'admin' -> 'superadmin' saat dikembalikan
    return query select v_row.id, v_row.username, v_row.nama,
                        case when v_row.role = 'admin' then 'superadmin' else v_row.role end,
                        v_row.unit_kerja, v_row.nik, v_row.avatar_url;
    return;
  end if;

  -- Password salah → hitung kegagalan (lockout tetap berlaku)
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
-- D. RPC REGISTRASI MANDIRI (publik — tanpa login)
--    Membuat akun berstatus PENDING. Validasi lengkap:
--    username format+unik, password min 6, role 4 pilihan (TANPA superadmin),
--    unit_kerja wajib utk pimpinan faskes, NIK 16 digit + ATURAN 1 NIK 1 AKUN.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_register_request(text, text, text, text, text, text, text);

create or replace function public.admin_register_request(
  p_username   text,
  p_password   text,
  p_nama       text,
  p_role       text,
  p_unit_kerja text default '',
  p_nik        text default '',
  p_email      text default ''
)
returns table (id uuid, username text, nama text, role text, approval_status text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uname text;
  v_role  text;
  v_nama  text;
  v_unit  text;
  v_nik   text;
  v_email text;
  v_newid uuid;
begin
  -- 1. Username: 3-50 karakter, hanya huruf kecil/angka/._-
  v_uname := lower(trim(coalesce(p_username, '')));
  if v_uname = '' or length(v_uname) < 3 or length(v_uname) > 50 then
    raise exception 'REG_GAGAL: Username harus 3-50 karakter.';
  end if;
  if v_uname !~ '^[a-z0-9._-]+$' then
    raise exception 'REG_GAGAL: Username hanya boleh huruf, angka, titik, underscore, dan strip.';
  end if;
  if exists (select 1 from public.admin_users au where lower(au.username) = v_uname) then
    raise exception 'REG_GAGAL: Username "%s" sudah dipakai. Silakan pilih username lain.', v_uname;
  end if;

  -- 2. Password minimal 6 karakter
  if p_password is null or length(trim(p_password)) < 6 then
    raise exception 'REG_GAGAL: Password minimal 6 karakter.';
  end if;

  -- 3. Nama wajib
  v_nama := trim(coalesce(p_nama, ''));
  if v_nama = '' then
    raise exception 'REG_GAGAL: Nama lengkap wajib diisi.';
  end if;

  -- 4. Role: hanya 4 role non-superadmin (registrasi mandiri)
  v_role := lower(trim(coalesce(p_role, '')));
  if v_role not in ('operator', 'pimpinan_faskes', 'observer', 'pejabat_fungsional') then
    raise exception 'REG_GAGAL: Role pendaftaran tidak valid.';
  end if;

  -- 5. Unit kerja wajib untuk pimpinan faskes
  v_unit := trim(coalesce(p_unit_kerja, ''));
  if v_role = 'pimpinan_faskes' and v_unit = '' then
    raise exception 'REG_GAGAL: Unit Kerja / Faskes wajib diisi untuk Pimpinan Faskes.';
  end if;

  -- 6. NIK: format 16 digit + ATURAN 1 NIK HANYA 1 AKUN (termasuk akun pending)
  v_nik := trim(coalesce(p_nik, ''));
  if v_nik <> '' then
    if v_nik !~ '^[0-9]{16}$' then
      raise exception 'REG_GAGAL: NIK harus tepat 16 digit angka.';
    end if;
    if public._admin_nik_taken(v_nik) then
      raise exception 'REG_GAGAL: NIK ini sudah terdaftar pada akun lain. Setiap akun hanya boleh menggunakan 1 NIK.';
    end if;
  elsif v_role = 'pejabat_fungsional' then
    raise exception 'REG_GAGAL: NIK (16 digit) wajib diisi untuk Pejabat Fungsional.';
  end if;

  -- 7. Email opsional — simpan bila formatnya masuk akal
  v_email := trim(coalesce(p_email, ''));
  if v_email <> '' and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'REG_GAGAL: Format email tidak valid.';
  end if;

  -- 8. Buat akun PENDING (password_plain ikut diarsipkan sesuai konvensi v2)
  insert into public.admin_users
    (username, password_hash, password_plain, nama, role,
     unit_kerja, nik, email, registered_email,
     aktif, approval_status, approved_by, approved_at, rejection_note)
  values
    (trim(p_username), crypt(trim(p_password), gen_salt('bf')), trim(p_password), v_nama, v_role,
     v_unit, v_nik, v_email, v_email,
     true, 'pending', '', null, '')
  returning id into v_newid;

  return query select v_newid, trim(p_username), v_nama, v_role, 'pending'::text;
end;
$$;

grant execute on function public.admin_register_request(text, text, text, text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- E. RPC DAFTAR AKUN PENDING (superadmin only)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_pending_users(text, text);

create or replace function public.admin_list_pending_users(
  p_requester_username text,
  p_requester_password text
)
returns table (
  id uuid,
  username text,
  nama text,
  role text,
  unit_kerja text,
  nik text,
  registered_email text,
  created_at timestamptz
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
  select au.id, au.username, au.nama,
         case when au.role = 'admin' then 'superadmin' else au.role end,
         au.unit_kerja, au.nik, au.registered_email, au.created_at
  from public.admin_users au
  where au.approval_status = 'pending'
  order by au.created_at asc;
end;
$$;

grant execute on function public.admin_list_pending_users(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- F. RPC SETUJUI AKUN (superadmin only)
--    Role / unit kerja / NIK dapat disesuaikan saat persetujuan.
--    NIK divalidasi ulang (aturan 1 NIK 1 akun) sebelum disetujui.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_approve_user(text, text, uuid, text, text, text);

create or replace function public.admin_approve_user(
  p_requester_username text,
  p_requester_password text,
  p_id                 uuid,
  p_role               text default '',
  p_unit_kerja         text default '',
  p_nik                text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target   public.admin_users;
  v_role     text;
  v_unit     text;
  v_nik      text;
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return false;
  end if;

  select au.* into v_target from public.admin_users au where au.id = p_id;
  if v_target.id is null then
    return false;
  end if;
  if coalesce(v_target.approval_status, 'approved') = 'approved' then
    return true;  -- sudah approved sebelumnya — idempotent
  end if;

  -- Role penyesuaian (opsional; default = role yang diminta)
  v_role := lower(trim(coalesce(p_role, '')));
  if v_role = '' then
    v_role := v_target.role;
  end if;
  if v_role = 'admin' then
    v_role := 'superadmin';
  end if;
  if v_role not in ('superadmin', 'operator', 'pimpinan_faskes', 'observer', 'pejabat_fungsional') then
    return false;
  end if;

  v_unit := trim(coalesce(p_unit_kerja, v_target.unit_kerja));
  v_nik  := trim(coalesce(p_nik, v_target.nik));

  -- Unit kerja wajib utk pimpinan faskes
  if v_role = 'pimpinan_faskes' and v_unit = '' then
    return false;
  end if;

  -- NIK: format + aturan 1 NIK 1 akun (kecuali milik akun ini sendiri)
  if v_nik <> '' then
    if v_nik !~ '^[0-9]{16}$' then
      return false;
    end if;
    if public._admin_nik_taken(v_nik, v_target.id) then
      return false;
    end if;
  end if;

  update public.admin_users
  set approval_status = 'approved',
      approved_by     = p_requester_username,
      approved_at     = now(),
      rejection_note  = '',
      role            = v_role,
      unit_kerja      = v_unit,
      nik             = v_nik,
      aktif           = true
  where admin_users.id = v_target.id;

  return true;
end;
$$;

grant execute on function public.admin_approve_user(text, text, uuid, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- G. RPC TOLAK AKUN (superadmin only) — simpan alasan penolakan
-- ---------------------------------------------------------------------------
drop function if exists public.admin_reject_user(text, text, uuid, text);

create or replace function public.admin_reject_user(
  p_requester_username text,
  p_requester_password text,
  p_id                 uuid,
  p_note               text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target public.admin_users;
  v_note   text;
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return false;
  end if;

  select au.* into v_target from public.admin_users au where au.id = p_id;
  if v_target.id is null then
    return false;
  end if;

  -- Tidak boleh menolak/menonaktifkan superadmin terakhir
  if v_target.role in ('admin','superadmin') then
    declare
      v_admin_cnt integer;
    begin
      select count(*) into v_admin_cnt
      from public.admin_users au3
      where au3.role in ('admin','superadmin')
        and au3.aktif = true
        and au3.id <> v_target.id;
      if v_admin_cnt < 1 then
        return false;
      end if;
    end;
  end if;

  v_note := trim(coalesce(p_note, ''));
  if v_note = '' then
    v_note := 'Tidak memenuhi persyaratan.';
  end if;

  update public.admin_users
  set approval_status = 'rejected',
      approved_by     = p_requester_username,
      approved_at     = now(),
      rejection_note  = v_note
  where admin_users.id = v_target.id;

  return true;
end;
$$;

grant execute on function public.admin_reject_user(text, text, uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- H. RPC UBAH USERNAME OLEH SUPERADMIN (pengganti ubah-username-mandiri)
--    Superadmin dapat mengubah username AKUN MANAPUN (termasuk miliknya).
--    Akun lain TIDAK bisa mengubah username sendiri — hanya password.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_change_username(text, text, uuid, text);

create or replace function public.admin_change_username(
  p_requester_username text,
  p_requester_password text,
  p_id                 uuid,
  p_new_username       text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target   public.admin_users;
  v_uname    text;
begin
  if not public._admin_verify_requester(p_requester_username, p_requester_password) then
    return false;
  end if;

  select au.* into v_target from public.admin_users au where au.id = p_id;
  if v_target.id is null then
    return false;
  end if;

  v_uname := lower(trim(coalesce(p_new_username, '')));
  if v_uname = '' or length(v_uname) < 3 or length(v_uname) > 50 then
    return false;
  end if;
  if v_uname !~ '^[a-z0-9._-]+$' then
    return false;
  end if;
  if exists (
    select 1 from public.admin_users au2
    where lower(au2.username) = v_uname and au2.id <> v_target.id
  ) then
    return false;
  end if;

  update public.admin_users
  set username = trim(p_new_username)
  where admin_users.id = v_target.id;

  return true;
end;
$$;

grant execute on function public.admin_change_username(text, text, uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- I. NONAKTIFKAN UBAH USERNAME MANDIRI (v3.1 — kebijakan baru)
--    Fungsi lama admin_change_my_username DIKECUALIKAN: selalu gagal.
--    Dibuat ulang (bukan dihapus) agar frontend lama tetap menerima respons
--    "gagal" yang jelas, bukan error "function not found".
-- ---------------------------------------------------------------------------
drop function if exists public.admin_change_my_username(text, text, text);

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
begin
  -- v3.1: USERNAME hanya dapat diubah oleh SUPERADMIN lewat Panel Admin
  -- (RPC admin_change_username). Ubah username mandiri dinonaktifkan.
  return false;
end;
$$;

grant execute on function public.admin_change_my_username(text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- J. CREATE USER v4 — validasi 1 NIK 1 akun + akun buatan superadmin
--    langsung 'approved' (approved_by = superadmin pembuat)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_create_user(text, text, text, text, text, text, text, text);

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

  v_uname := lower(trim(p_username));
  if v_uname = '' or length(v_uname) < 3 or length(v_uname) > 50 then
    return;
  end if;
  if v_uname !~ '^[a-z0-9._-]+$' then
    return;
  end if;

  if p_password is null or length(trim(p_password)) < 6 then
    return;
  end if;

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

  v_faskes := trim(coalesce(p_unit_kerja, ''));
  v_nik    := trim(coalesce(p_nik, ''));
  if v_nik <> '' then
    if v_nik !~ '^[0-9]{16}$' then
      return;  -- NIK diisi tapi tidak valid (harus 16 digit angka)
    end if;
    if public._admin_nik_taken(v_nik) then
      return;  -- v3.1: NIK sudah dipakai akun lain — 1 NIK hanya 1 akun
    end if;
  end if;

  if exists (select 1 from public.admin_users au where lower(au.username) = v_uname) then
    return;
  end if;

  insert into public.admin_users (username, password_hash, password_plain, nama, role,
                                  unit_kerja, nik, last_password_change_at, password_changed_by,
                                  approval_status, approved_by, approved_at)
  values (trim(p_username), crypt(p_password, gen_salt('bf')), p_password, v_nama, v_role,
          v_faskes, v_nik, now(), p_requester_username,
          'approved', p_requester_username, now())
  returning id into v_newid;

  return query select v_newid, trim(p_username), v_nama, v_role;
end;
$$;

grant execute on function public.admin_create_user(text, text, text, text, text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- K. UPDATE USER v4 — validasi 1 NIK 1 akun saat superadmin mengubah NIK
-- ---------------------------------------------------------------------------
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
  v_nik_baru  text;
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

  -- v3.1: validasi NIK baru (bila diisi/diubah) — 1 NIK hanya 1 akun
  v_nik_baru := trim(coalesce(p_nik, v_target.nik));
  if v_nik_baru <> '' then
    if v_nik_baru !~ '^[0-9]{16}$' then
      return false;
    end if;
    if public._admin_nik_taken(v_nik_baru, v_target.id) then
      return false;
    end if;
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
-- L. LIST USERS v4 — tambah kolom status persetujuan utk tabel Manajemen Akun
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
  approval_status text,
  approved_by text,
  approved_at timestamptz,
  rejection_note text,
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
         coalesce(au.approval_status, 'approved'),
         au.approved_by, au.approved_at, au.rejection_note,
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
-- M. PROFIL SENDIRI v4 — sertakan status persetujuan (agar akun pending
--    yang mencoba lihat profil mendapat info status)
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
  approval_status text,
  rejection_note text,
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
         coalesce(au.approval_status, 'approved'),
         au.rejection_note,
         au.last_login_at, au.last_password_change_at,
         au.created_at, au.updated_at
  from public.admin_users au
  where lower(au.username) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.admin_get_my_profile(text) to anon, authenticated;


-- ============================================================================
-- SELESAI — verifikasi cepat (jalankan di SQL Editor bila perlu):
--   select username, nama, role, approval_status
--   from public.admin_users order by approval_status, role;
--
-- Ringkasan kebijakan v3.1:
--   1. Tombol "Daftar Akun" di halaman login → akun PENDING.
--   2. Superadmin menyetujui (Panel Admin > Persetujuan Akun) → akun aktif.
--   3. 1 NIK hanya boleh dipakai 1 akun (index + validasi semua RPC).
--   4. Password: tiap akun mengubah miliknya sendiri.
--      Username: HANYA superadmin (Panel Admin > Manajemen Akun > ikon pensil username).
-- ============================================================================
