-- ============================================================================
-- MANTAF - SUPABASE DATABASE SCHEMA
-- Manajemen Tata Kelola Jabatan Fungsional Kesehatan
-- Dinas Kesehatan Kabupaten Kutai Kartanegara
-- ============================================================================
-- CARA PAKAI:
--   1. Buka Supabase Dashboard > SQL Editor
--   2. Copy seluruh isi file ini, lalu klik "Run"
--   3. AMAN dijalankan BERULANG kali (idempotent): tabel / kolom / policy /
--      bucket yang sudah ada akan DIREVISI, tanpa menghapus data Anda.
--   4. Ekstensi pgcrypto otomatis diaktifkan di schema "extensions"
--   5. Login admin default -> username: admin | password: admin123
--      SEGERA ganti password setelah login pertama (lihat catatan di bawah).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. EKSTENSI
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. TABEL ADMIN_USERS (login panel admin)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  nama          text not null default 'Administrator',
  role          text not null default 'admin',
  aktif         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Revisi tabel lama: pastikan kolom lengkap (tidak mengubah data yang ada)
alter table public.admin_users add column if not exists nama  text not null default 'Administrator';
alter table public.admin_users add column if not exists role  text not null default 'admin';
alter table public.admin_users add column if not exists aktif boolean not null default true;

-- Seed admin default (password: admin123) -- GANTI SETELAH LOGIN PERTAMA!
insert into public.admin_users (username, password_hash, nama)
values ('admin', crypt('admin123', gen_salt('bf')), 'Administrator MantaF')
on conflict (username) do nothing;

-- ---------------------------------------------------------------------------
-- 2. TABEL PENGUMUMAN
-- ---------------------------------------------------------------------------
create table if not exists public.pengumuman (
  id         uuid primary key default gen_random_uuid(),
  judul      text not null,
  isi        text not null,
  tanggal    date not null default current_date,
  prioritas  text not null default 'Normal' check (prioritas in ('Normal','Penting','Segera')),
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Revisi tabel lama: pastikan kolom lengkap
alter table public.pengumuman add column if not exists prioritas text not null default 'Normal';
alter table public.pengumuman add column if not exists aktif      boolean not null default true;

-- ---------------------------------------------------------------------------
-- 3. TABEL BEZETTING
-- ---------------------------------------------------------------------------
create table if not exists public.bezetting (
  id                  uuid primary key default gen_random_uuid(),
  instansi            text not null,
  jenis_jabatan       text not null,
  jenjang             text not null,
  kebutuhan           integer not null default 0 check (kebutuhan >= 0),
  pemangku            integer not null default 0 check (pemangku >= 0),
  lowongan            integer not null default 0 check (lowongan >= 0),
  pemangku_saat_ini   text default '',
  pemangku_disetujui  text default '',
  sisa                integer generated always as (greatest(lowongan, 0)) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Revisi tabel lama: pastikan kolom lengkap
alter table public.bezetting add column if not exists kebutuhan          integer not null default 0;
alter table public.bezetting add column if not exists pemangku           integer not null default 0;
alter table public.bezetting add column if not exists lowongan           integer not null default 0;
alter table public.bezetting add column if not exists pemangku_saat_ini  text default '';
alter table public.bezetting add column if not exists pemangku_disetujui text default '';
alter table public.bezetting add column if not exists sisa integer generated always as (greatest(lowongan, 0)) stored;

create index if not exists idx_bezetting_instansi      on public.bezetting (instansi);
create index if not exists idx_bezetting_jenis_jabatan on public.bezetting (jenis_jabatan);
create index if not exists idx_bezetting_jenjang       on public.bezetting (jenjang);

-- ---------------------------------------------------------------------------
-- 4. TABEL PESERTA_UKOM
--    - Kolom A-I: data pendaftaran (diisi peserta lewat formulir)
--    - Kolom file: URL public dari Supabase Storage (bucket: foto / dokumen)
--    - Kolom admin: diisi admin (periode, no peserta, PAK, status, sertifikat)
-- ---------------------------------------------------------------------------
create table if not exists public.peserta_ukom (
  id                 uuid primary key default gen_random_uuid(),
  -- Data pribadi
  nik                text not null check (char_length(nik) = 16),
  nip                text not null,
  nama_tanpa_gelar   text not null,
  jenis_kelamin      text check (jenis_kelamin in ('Laki-Laki','Perempuan')),
  nama_unit_kerja    text not null,
  pangkat_golongan   text,
  no_sk_jabfung      text,
  -- Data jabatan
  jabfung_saat_ini   text,
  jenjang_saat_ini   text,
  jabfung_tujuan     text,
  jenjang_tujuan     text,
  jenis_ukom         text,
  nilai_pak_terakhir text,
  -- Kontak
  nomor_whatsapp     text,
  email_aktif        text,
  -- File (URL Supabase Storage)
  file_pak           text,
  file_foto          text,
  file_drh           text,
  file_ijazah        text,
  file_str           text,
  file_sk_pangkat    text,
  file_sk_jabfung    text,
  file_skp           text,
  file_skmd          text,
  -- Data kelola admin
  periode            text,
  no_peserta         text,
  pak_instansi       text,
  pak_siasn          text,
  status_periode     text default '-',
  absen              text default '-',
  status_ukom        text default '-',
  sertifikat         text,
  -- Verifikasi
  status_verifikasi  text not null default 'Menunggu'
                     check (status_verifikasi in ('Menunggu','Proses','Disetujui','Ditolak','Dilimpahkan','Batal','Perbaikan')),
  catatan_admin      text default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Revisi tabel lama: pastikan SEMUA kolom peserta_ukom lengkap
-- (termasuk kolom yang ditambahkan belakangan: sertifikat, absen, dst.)
alter table public.peserta_ukom add column if not exists nik                text;
alter table public.peserta_ukom add column if not exists nip                text;
alter table public.peserta_ukom add column if not exists nama_tanpa_gelar   text;
alter table public.peserta_ukom add column if not exists jenis_kelamin      text;
alter table public.peserta_ukom add column if not exists nama_unit_kerja    text;
alter table public.peserta_ukom add column if not exists pangkat_golongan   text;
alter table public.peserta_ukom add column if not exists no_sk_jabfung      text;
alter table public.peserta_ukom add column if not exists jabfung_saat_ini   text;
alter table public.peserta_ukom add column if not exists jenjang_saat_ini   text;
alter table public.peserta_ukom add column if not exists jabfung_tujuan     text;
alter table public.peserta_ukom add column if not exists jenjang_tujuan     text;
alter table public.peserta_ukom add column if not exists jenis_ukom         text;
alter table public.peserta_ukom add column if not exists nilai_pak_terakhir text;
alter table public.peserta_ukom add column if not exists nomor_whatsapp     text;
alter table public.peserta_ukom add column if not exists email_aktif        text;
alter table public.peserta_ukom add column if not exists file_pak           text;
alter table public.peserta_ukom add column if not exists file_foto          text;
alter table public.peserta_ukom add column if not exists file_drh           text;
alter table public.peserta_ukom add column if not exists file_ijazah        text;
alter table public.peserta_ukom add column if not exists file_str           text;
alter table public.peserta_ukom add column if not exists file_sk_pangkat    text;
alter table public.peserta_ukom add column if not exists file_sk_jabfung    text;
alter table public.peserta_ukom add column if not exists file_skp           text;
alter table public.peserta_ukom add column if not exists file_skmd          text;
alter table public.peserta_ukom add column if not exists periode            text;
alter table public.peserta_ukom add column if not exists no_peserta         text;
alter table public.peserta_ukom add column if not exists pak_instansi       text;
alter table public.peserta_ukom add column if not exists pak_siasn          text;
alter table public.peserta_ukom add column if not exists status_periode     text default '-';
alter table public.peserta_ukom add column if not exists absen              text default '-';
alter table public.peserta_ukom add column if not exists status_ukom        text default '-';
alter table public.peserta_ukom add column if not exists sertifikat         text;
alter table public.peserta_ukom add column if not exists status_verifikasi  text not null default 'Menunggu';
alter table public.peserta_ukom add column if not exists catatan_admin      text default '';
alter table public.peserta_ukom add column if not exists created_at         timestamptz not null default now();
alter table public.peserta_ukom add column if not exists updated_at         timestamptz not null default now();

create index if not exists idx_peserta_nik       on public.peserta_ukom (nik);
create index if not exists idx_peserta_nip       on public.peserta_ukom (nip);
create index if not exists idx_peserta_nama      on public.peserta_ukom (nama_tanpa_gelar);
create index if not exists idx_peserta_unit      on public.peserta_ukom (nama_unit_kerja);
create index if not exists idx_peserta_status    on public.peserta_ukom (status_verifikasi);
create index if not exists idx_peserta_periode   on public.peserta_ukom (periode);

-- ---------------------------------------------------------------------------
-- 4b. TABEL PETUNJUK (menu "Petunjuk Penggunaan" — kartu PDF)
--     - file_url : URL public PDF dari Supabase Storage (bucket: petunjuk)
--     - urutan   : urutan tampil kartu (kecil = atas)
-- ---------------------------------------------------------------------------
create table if not exists public.petunjuk (
  id          uuid primary key default gen_random_uuid(),
  judul       text not null,
  deskripsi   text default '',
  file_url    text not null,
  urutan      integer not null default 0,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Revisi tabel lama: pastikan kolom lengkap
alter table public.petunjuk add column if not exists judul     text;
alter table public.petunjuk add column if not exists deskripsi text default '';
alter table public.petunjuk add column if not exists file_url  text;
alter table public.petunjuk add column if not exists urutan    integer not null default 0;
alter table public.petunjuk add column if not exists aktif     boolean not null default true;

create index if not exists idx_petunjuk_urutan on public.petunjuk (urutan);

-- ---------------------------------------------------------------------------
-- 5. TRIGGER updated_at otomatis
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_admin_updated_at    on public.admin_users;
create trigger trg_admin_updated_at    before update on public.admin_users    for each row execute function public.set_updated_at();

drop trigger if exists trg_pengumuman_updated  on public.pengumuman;
create trigger trg_pengumuman_updated  before update on public.pengumuman     for each row execute function public.set_updated_at();

drop trigger if exists trg_bezetting_updated   on public.bezetting;
create trigger trg_bezetting_updated   before update on public.bezetting      for each row execute function public.set_updated_at();

drop trigger if exists trg_peserta_updated     on public.peserta_ukom;
create trigger trg_peserta_updated     before update on public.peserta_ukom   for each row execute function public.set_updated_at();

drop trigger if exists trg_petunjuk_updated    on public.petunjuk;
create trigger trg_petunjuk_updated    before update on public.petunjuk        for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RPC: LOGIN ADMIN
--    Frontend memanggil: supabase.rpc('admin_login', { p_username, p_password })
--    Return data admin bila cocok, table kosong bila salah.
-- ---------------------------------------------------------------------------
create or replace function public.admin_login(p_username text, p_password text)
returns table (id uuid, username text, nama text, role text)
language sql
security definer
set search_path = public, extensions
as $$
  select id, username, nama, role
  from public.admin_users
  where username = p_username
    and aktif = true
    and password_hash = crypt(p_password, password_hash)
  limit 1;
$$;

-- RPC: GANTI PASSWORD ADMIN (dipanggil dari panel admin setelah login)
create or replace function public.admin_change_password(p_username text, p_password_lama text, p_password_baru text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  select exists (
    select 1 from public.admin_users
    where username = p_username and aktif = true
      and password_hash = crypt(p_password_lama, password_hash)
  ) into v_ok;

  if v_ok then
    update public.admin_users
    set password_hash = crypt(p_password_baru, gen_salt('bf'))
    where username = p_username;
  end if;

  return v_ok;
end;
$$;

grant execute on function public.admin_login(p_username text, p_password text) to anon, authenticated;
grant execute on function public.admin_change_password(p_username text, p_password_lama text, p_password_baru text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS)
--    Konfigurasi "siap pakai": publik boleh baca + tulis agar aplikasi statis
--    (GitHub Pages + anon key) langsung berfungsi, KECUALI admin_users yang
--    hanya bisa diakses lewat RPC (security definer).
--
--    PENGAMANAN LANJUTAN (opsional, disarankan):
--    Jika ingin lebih ketat, aktifkan Supabase Auth, lalu ganti policy tulis
--    menjadi: `to authenticated` saja. Baca tetap untuk anon.
-- ---------------------------------------------------------------------------
alter table public.admin_users   enable row level security;
alter table public.pengumuman    enable row level security;
alter table public.bezetting     enable row level security;
alter table public.peserta_ukom  enable row level security;
alter table public.petunjuk      enable row level security;

-- admin_users: tidak ada policy -> tidak bisa dibaca/diubah langsung dari client.
-- Akses hanya melalui RPC security definer di atas.

-- pengumuman  (SEMUA policy wajib punya drop if exists agar bisa dijalankan ulang)
drop policy if exists "pengumuman_read"   on public.pengumuman;
drop policy if exists "pengumuman_write"  on public.pengumuman;
drop policy if exists "pengumuman_upd"    on public.pengumuman;
drop policy if exists "pengumuman_del"    on public.pengumuman;
create policy "pengumuman_read"  on public.pengumuman for select to anon, authenticated using (true);
create policy "pengumuman_write" on public.pengumuman for insert to anon, authenticated with check (true);
create policy "pengumuman_upd"   on public.pengumuman for update to anon, authenticated using (true) with check (true);
create policy "pengumuman_del"   on public.pengumuman for delete to anon, authenticated using (true);

-- bezetting
drop policy if exists "bezetting_read"   on public.bezetting;
drop policy if exists "bezetting_write"  on public.bezetting;
drop policy if exists "bezetting_upd"    on public.bezetting;
drop policy if exists "bezetting_del"    on public.bezetting;
create policy "bezetting_read"  on public.bezetting for select to anon, authenticated using (true);
create policy "bezetting_write" on public.bezetting for insert to anon, authenticated with check (true);
create policy "bezetting_upd"   on public.bezetting for update to anon, authenticated using (true) with check (true);
create policy "bezetting_del"   on public.bezetting for delete to anon, authenticated using (true);

-- peserta_ukom
drop policy if exists "peserta_read"   on public.peserta_ukom;
drop policy if exists "peserta_write"  on public.peserta_ukom;
drop policy if exists "peserta_upd"    on public.peserta_ukom;
drop policy if exists "peserta_del"    on public.peserta_ukom;
create policy "peserta_read"  on public.peserta_ukom for select to anon, authenticated using (true);
create policy "peserta_write" on public.peserta_ukom for insert to anon, authenticated with check (true);
create policy "peserta_upd"   on public.peserta_ukom for update to anon, authenticated using (true) with check (true);
create policy "peserta_del"   on public.peserta_ukom for delete to anon, authenticated using (true);

-- petunjuk
drop policy if exists "petunjuk_read"   on public.petunjuk;
drop policy if exists "petunjuk_write"  on public.petunjuk;
drop policy if exists "petunjuk_upd"    on public.petunjuk;
drop policy if exists "petunjuk_del"    on public.petunjuk;
create policy "petunjuk_read"  on public.petunjuk for select to anon, authenticated using (true);
create policy "petunjuk_write" on public.petunjuk for insert to anon, authenticated with check (true);
create policy "petunjuk_upd"   on public.petunjuk for update to anon, authenticated using (true) with check (true);
create policy "petunjuk_del"   on public.petunjuk for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 8. STORAGE BUCKETS (untuk upload foto & dokumen)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('foto', 'foto', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('dokumen', 'dokumen', true)
on conflict (id) do update set public = true;

-- Bucket petunjuk: menyimpan file PDF petunjuk penggunaan (akses publik baca)
insert into storage.buckets (id, name, public)
values ('petunjuk', 'petunjuk', true)
on conflict (id) do update set public = true;

-- Policy storage: publik boleh upload & baca file di bucket foto/dokumen/petunjuk
drop policy if exists "foto_public_read"   on storage.objects;
drop policy if exists "foto_public_write"  on storage.objects;
drop policy if exists "foto_public_update" on storage.objects;
drop policy if exists "dokumen_public_read"  on storage.objects;
drop policy if exists "dokumen_public_write" on storage.objects;
drop policy if exists "dokumen_public_update" on storage.objects;
drop policy if exists "petunjuk_public_read" on storage.objects;
drop policy if exists "petunjuk_public_write" on storage.objects;
drop policy if exists "petunjuk_public_update" on storage.objects;

create policy "foto_public_read"  on storage.objects for select to anon, authenticated using (bucket_id = 'foto');
create policy "foto_public_write" on storage.objects for insert to anon, authenticated with check (bucket_id = 'foto');
create policy "foto_public_update" on storage.objects for update to anon, authenticated using (bucket_id = 'foto') with check (bucket_id = 'foto');
create policy "dokumen_public_read"  on storage.objects for select to anon, authenticated using (bucket_id = 'dokumen');
create policy "dokumen_public_write" on storage.objects for insert to anon, authenticated with check (bucket_id = 'dokumen');
create policy "dokumen_public_update" on storage.objects for update to anon, authenticated using (bucket_id = 'dokumen') with check (bucket_id = 'dokumen');
create policy "petunjuk_public_read"  on storage.objects for select to anon, authenticated using (bucket_id = 'petunjuk');
create policy "petunjuk_public_write" on storage.objects for insert to anon, authenticated with check (bucket_id = 'petunjuk');
create policy "petunjuk_public_update" on storage.objects for update to anon, authenticated using (bucket_id = 'petunjuk') with check (bucket_id = 'petunjuk');

-- Izinkan penghapusan objek storage petunjuk (saat admin menghapus dokumen)
drop policy if exists "petunjuk_public_delete" on storage.objects;
create policy "petunjuk_public_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'petunjuk');

-- Izinkan penghapusan objek storage foto/dokumen
-- (dipakai panel admin saat berkas peserta diganti/dikosongkan)
drop policy if exists "foto_public_delete"    on storage.objects;
drop policy if exists "dokumen_public_delete" on storage.objects;
create policy "foto_public_delete"    on storage.objects for delete to anon, authenticated using (bucket_id = 'foto');
create policy "dokumen_public_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'dokumen');

-- ---------------------------------------------------------------------------
-- 9. VIEW STATISTIK DASHBOARD (opsional, untuk monitoring cepat di Supabase)
-- ---------------------------------------------------------------------------
drop view if exists public.v_dashboard_stats;
create view public.v_dashboard_stats as
select
  (select count(*) from public.peserta_ukom)                              as total_peserta,
  (select count(distinct nama_unit_kerja) from public.peserta_ukom)       as total_instansi,
  (select coalesce(sum(lowongan), 0) from public.bezetting)               as total_lowongan,
  (select count(*) from public.pengumuman where aktif = true)             as total_pengumuman,
  (select count(*) from public.petunjuk where aktif = true)               as total_petunjuk;

-- ============================================================================
-- SELESAI. Catatan:
-- 1. Login admin default -> admin / admin123. Ganti via panel admin.
-- 2. Isi SUPABASE_URL dan SUPABASE_ANON_KEY pada file assets/js/config.js
-- 3. Kolom "sisa" pada bezetting otomatis mengikuti nilai "lowongan".
-- 4. Dokumen PDF "Petunjuk Penggunaan" diunggah lewat Panel Admin (tab
--    Petunjuk); file tersimpan di bucket storage "petunjuk".
-- ============================================================================
