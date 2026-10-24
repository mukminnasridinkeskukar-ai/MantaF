-- ============================================================================
-- MANTAF v3.1 — HOTFIX REGISTRASI AKUN (REVISI 2, 24-10-2026)
-- Manajemen Tata Kelola Jabatan Fungsional Kesehatan
-- Dinas Kesehatan Kabupaten Kutai Kartanegara
-- ============================================================================
-- MEMPERBAIKI ERROR:
--   "column reference \"id\" is ambiguous"  (HTTP 400 saat Daftar Akun)
--
-- PENGARUH (2 fitur):
--   1. Tombol "Daftar Akun" di halaman login -> GAGAL dgn error di atas.
--   2. Panel Admin > Manajemen Akun > Tambah Akun -> akan gagal error yang
--      sama (fungsi admin_create_user punya pola yang sama).
--
-- PENYEBAB:
--   Kolom output RETURNS TABLE(id uuid, ...) otomatis menjadi VARIABEL
--   PL/pgSQL di dalam fungsi. Pada klausa 'INSERT ... RETURNING id', nama
--   'id' jadi AMBIGU — bentrok antara kolom admin_users.id dan variabel
--   output fungsi. Perbaikan: tulis eksplisit 'RETURNING admin_users.id'.
--
-- CARA PAKAI (± 10 detik):
--   1. Buka Supabase Dashboard > SQL Editor > New query
--   2. Copy SELURUH isi file ini, klik "Run"
--   3. Selesai — tombol Daftar Akun langsung berfungsi (tidak perlu restart).
--   AMAN dijalankan BERULANG (idempotent) — tidak mengubah/menghapus data.
--   Alternatif: jalankan ulang registrasi-v4.sql (REVISI 2) secara penuh;
--   hasilnya sama, file ini hanya versi ringkas berisi 2 fungsi terdampak.
-- ============================================================================


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
  returning admin_users.id into v_newid;  -- REVISI 2: dikualifikasi agar tidak ambigu dgn variabel output fungsi

  return query select v_newid, trim(p_username), v_nama, v_role, 'pending'::text;
end;
$$;

grant execute on function public.admin_register_request(text, text, text, text, text, text, text) to anon, authenticated;


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
  returning admin_users.id into v_newid;  -- REVISI 2: dikualifikasi agar tidak ambigu dgn variabel output fungsi

  return query select v_newid, trim(p_username), v_nama, v_role;
end;
$$;

grant execute on function public.admin_create_user(text, text, text, text, text, text, text, text) to anon, authenticated;
