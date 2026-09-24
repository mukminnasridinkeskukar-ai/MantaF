-- ============================================================================
-- MANTAF - SKEMA DATABASE TRY OUT CAT BKN (TAMBAHAN)
-- Simulasi CAT BKN untuk Uji Kompetensi Jabatan Fungsional Kesehatan
-- Dinas Kesehatan Kabupaten Kutai Kartanegara
-- ============================================================================
-- CARA PAKAI:
--   1. Buka Supabase Dashboard > SQL Editor
--   2. Copy seluruh isi file ini, lalu klik "Run"
--
-- AMAN & ADDITIVE-ONLY (TIDAK MENYENTUH TABEL LAMA):
--   * Hanya MEMBUAT tabel baru: tryout_categories, tryout_questions,
--     tryout_attempts (+ index, trigger, policy, view, seed data).
--   * Tidak ada DROP/ALTER terhadap tabel yang sudah ada
--     (admin_users, pengumuman, bezetting, peserta_ukom, petunjuk, storage).
--   * Idempotent: aman dijalankan BERULANG kali.
--       - tryout_categories : seed pakai ON CONFLICT DO UPDATE (menyegarkan
--         label/warna, sesuai konfigurasi resmi).
--       - tryout_questions  : seed pakai ON CONFLICT DO NOTHING (tidak pernah
--         menimpa soal yang mungkin sudah diedit admin).
--
-- KETERKAITAN DENGAN SKEMA UTAMA:
--   * Trigger updated_at memakai function public.set_updated_at() yang sama
--     (dibuat ulang di sini bila skema utama belum pernah dijalankan).
--   * Konvensi RLS mengikuti skema utama (anon + authenticated). Kolom
--     identitas pada tryout_attempts BERSIFAT OPSIONAL & sukarela (boleh
--     kosong). Jika ingin lebih ketat, hapus policy read attempts atau batasi
--     ke "authenticated" saja.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. EKSTENSI (sama dengan skema utama; no-op bila sudah aktif)
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. TABEL TRYOUT_CATEGORIES (kisi-kisi / kelompok soal)
--    id berupa slug yang dipakai tryoutukom.html (mis. 'asuhan-pelayanan')
-- ---------------------------------------------------------------------------
create table if not exists public.tryout_categories (
  id          text primary key,
  urutan      integer not null default 0,
  label       text not null,
  short_label text not null,
  range_label text not null default '',
  section     text not null default 'teknis' check (section in ('teknis','man-soskul')),
  color       text not null default 'emerald',
  hex         text not null default '#10b981',
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. TABEL TRYOUT_QUESTIONS (bank soal)
--    id integer 1..150 agar urutan stabil & sinkron dengan label rentang
--    kategori (mis. 'Soal 1-30'). opsi berupa JSONB {"A": "...", ...}.
-- ---------------------------------------------------------------------------
create table if not exists public.tryout_questions (
  id          integer primary key,
  kategori_id text not null references public.tryout_categories(id)
              on update cascade on delete restrict,
  section     text not null default 'teknis' check (section in ('teknis','man-soskul')),
  pertanyaan  text not null,
  opsi        jsonb not null,
  jawaban     text not null check (jawaban in ('A','B','C','D','E')),
  pembahasan  text default '',
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tryout_soal_kategori on public.tryout_questions (kategori_id);
create index if not exists idx_tryout_soal_aktif    on public.tryout_questions (aktif);

-- ---------------------------------------------------------------------------
-- 3. TABEL TRYOUT_ATTEMPTS (hasil pengerjaan try out)
--    Satu baris = satu kali peserta menyelesaikan ujian.
--    * Kolom identitas (nama/nip/unit_kerja) OPSIONAL — diisi sukarela dari
--      halaman try out, boleh kosong (anonim).
--    * rincian_kategori : JSONB per kategori [{category,label,total,correct,...}]
--    * jawaban          : JSONB {id_soal: {answer:'A'|null, isDoubt:bool}}
--    * sumber_soal      : 'server' bila soal dimuat dari DB, 'lokal' bila
--      dari soal bawaan HTML (fallback offline).
-- ---------------------------------------------------------------------------
create table if not exists public.tryout_attempts (
  id               uuid primary key default gen_random_uuid(),
  nama             text default '',
  nip              text default '',
  unit_kerja       text default '',
  jumlah_soal      integer not null default 0 check (jumlah_soal >= 0),
  jumlah_dijawab   integer not null default 0 check (jumlah_dijawab >= 0),
  jumlah_benar     integer not null default 0 check (jumlah_benar >= 0),
  jumlah_salah     integer not null default 0 check (jumlah_salah >= 0),
  tidak_dijawab    integer not null default 0 check (tidak_dijawab >= 0),
  nilai            numeric(5,2) not null default 0 check (nilai >= 0 and nilai <= 100),
  lulus            boolean not null default false,
  passing_grade    integer not null default 70,
  durasi_detik     integer not null default 0 check (durasi_detik >= 0),
  sumber_soal      text not null default 'server' check (sumber_soal in ('server','lokal')),
  rincian_kategori jsonb not null default '[]'::jsonb,
  jawaban          jsonb not null default '{}'::jsonb,
  user_agent       text default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_tryout_attempt_created on public.tryout_attempts (created_at desc);
create index if not exists idx_tryout_attempt_nilai   on public.tryout_attempts (nilai desc);

-- ---------------------------------------------------------------------------
-- 4. TRIGGER updated_at (function yang sama dengan skema utama)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tryout_cat_updated      on public.tryout_categories;
create trigger trg_tryout_cat_updated      before update on public.tryout_categories for each row execute function public.set_updated_at();

drop trigger if exists trg_tryout_soal_updated     on public.tryout_questions;
create trigger trg_tryout_soal_updated     before update on public.tryout_questions  for each row execute function public.set_updated_at();

drop trigger if exists trg_tryout_attempt_updated  on public.tryout_attempts;
create trigger trg_tryout_attempt_updated  before update on public.tryout_attempts   for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (konvensi sama dengan skema utama: anon + authenticated)
-- ---------------------------------------------------------------------------
alter table public.tryout_categories enable row level security;
alter table public.tryout_questions  enable row level security;
alter table public.tryout_attempts   enable row level security;

-- tryout_categories (dibaca publik untuk menampilkan kisi-kisi)
drop policy if exists "tryout_cat_read"   on public.tryout_categories;
drop policy if exists "tryout_cat_write"  on public.tryout_categories;
drop policy if exists "tryout_cat_upd"    on public.tryout_categories;
drop policy if exists "tryout_cat_del"    on public.tryout_categories;
create policy "tryout_cat_read"   on public.tryout_categories for select to anon, authenticated using (true);
create policy "tryout_cat_write"  on public.tryout_categories for insert to anon, authenticated with check (true);
create policy "tryout_cat_upd"    on public.tryout_categories for update to anon, authenticated using (true) with check (true);
create policy "tryout_cat_del"    on public.tryout_categories for delete to anon, authenticated using (true);

-- tryout_questions (dibaca publik oleh halaman try out)
drop policy if exists "tryout_soal_read"   on public.tryout_questions;
drop policy if exists "tryout_soal_write"  on public.tryout_questions;
drop policy if exists "tryout_soal_upd"    on public.tryout_questions;
drop policy if exists "tryout_soal_del"    on public.tryout_questions;
create policy "tryout_soal_read"   on public.tryout_questions for select to anon, authenticated using (true);
create policy "tryout_soal_write"  on public.tryout_questions for insert to anon, authenticated with check (true);
create policy "tryout_soal_upd"    on public.tryout_questions for update to anon, authenticated using (true) with check (true);
create policy "tryout_soal_del"    on public.tryout_questions for delete to anon, authenticated using (true);

-- tryout_attempts
--   insert : publik (peserta mengirim hasil tanpa login)
--   select : publik (agregat untuk statistik/leaderboard; identitas opsional).
--            Untuk lebih privat: hapus policy read ini, lalu baca hasil hanya
--            lewat Supabase Dashboard / service key.
drop policy if exists "tryout_attempt_read"   on public.tryout_attempts;
drop policy if exists "tryout_attempt_write"  on public.tryout_attempts;
drop policy if exists "tryout_attempt_upd"    on public.tryout_attempts;
drop policy if exists "tryout_attempt_del"    on public.tryout_attempts;
create policy "tryout_attempt_read"   on public.tryout_attempts for select to anon, authenticated using (true);
create policy "tryout_attempt_write"  on public.tryout_attempts for insert to anon, authenticated with check (true);
create policy "tryout_attempt_upd"    on public.tryout_attempts for update to anon, authenticated using (true) with check (true);
create policy "tryout_attempt_del"    on public.tryout_attempts for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 6. VIEW STATISTIK TRY OUT (agregat tanpa data pribadi)
-- ---------------------------------------------------------------------------
drop view if exists public.v_tryout_stats;
create view public.v_tryout_stats as
select
  (select count(*) from public.tryout_attempts)                              as total_peserta,
  (select count(*) from public.tryout_attempts where lulus = true)           as total_lulus,
  (select coalesce(round(avg(nilai), 2), 0) from public.tryout_attempts)     as rata_nilai,
  (select count(*) from public.tryout_attempts
     where created_at >= now() - interval '7 days')                          as peserta_7hari,
  (select coalesce(max(nilai), 0) from public.tryout_attempts)               as nilai_tertinggi;

-- ---------------------------------------------------------------------------
-- 7. SEED DATA KATEGORI (6 kisi-kisi resmi — sinkron dengan halaman try out)
-- ---------------------------------------------------------------------------
insert into public.tryout_categories (id, urutan, label, short_label, range_label, section, color, hex)
values
  ('asuhan-pelayanan', 1, 'Asuhan & Pelayanan Kesehatan', 'Asuhan', '1-30', 'teknis', 'emerald', '#10b981'),
  ('etika-hukum', 2, 'Etika, Hukum Kesehatan & Patient Safety', 'Etika & Safety', '31-45', 'teknis', 'rose', '#f43f5e'),
  ('manajemen-puskesmas', 3, 'Manajemen Puskesmas & Kesehatan Masyarakat', 'Manajemen Puskesmas', '46-60', 'teknis', 'amber', '#f59e0b'),
  ('ppi-k3-kesling', 4, 'PPI, K3 & Kesehatan Lingkungan', 'PPI, K3 & Kesling', '61-70', 'teknis', 'cyan', '#06b6d4'),
  ('farmakologi-lab-gd-gizi', 5, 'Farmakologi, Lab, Gawat Darurat & Gizi', 'Farmakologi & GD', '71-85', 'teknis', 'violet', '#8b5cf6'),
  ('manajerial-sosio-kultural', 6, 'Manajerial & Sosio Kultural ASN BerAKHLAK', 'Manajerial & Sosio Kultural', '86-150', 'man-soskul', 'slate', '#64748b')
on conflict (id) do update set
  urutan      = excluded.urutan,
  label       = excluded.label,
  short_label = excluded.short_label,
  range_label = excluded.range_label,
  section     = excluded.section,
  color       = excluded.color,
  hex         = excluded.hex,
  updated_at  = now();

-- ---------------------------------------------------------------------------
-- 8. SEED DATA SOAL (150 soal, ON CONFLICT DO NOTHING agar tidak menimpa
--    hasil edit admin). Untuk memaksa sinkron ulang dari bawaan HTML,
--    jalankan:  delete from public.tryout_questions;  lalu jalankan file ini
--    sekali lagi (kategori tidak terhapus, aman).
-- ---------------------------------------------------------------------------
insert into public.tryout_questions (id, kategori_id, section, pertanyaan, opsi, jawaban, pembahasan)
values
  (1, 'asuhan-pelayanan', 'teknis', 'Tanda vital bayi baru lahir normal menunjukkan frekuensi nadi dalam rentang...', '{"A":"60-100 kali per menit","B":"100-160 kali per menit","C":"120-180 kali per menit","D":"80-120 kali per menit","E":"160-200 kali per menit"}'::jsonb, 'B', 'Frekuensi nadi normal bayi baru lahir adalah 100-160 kali per menit, lebih cepat dari dewasa.'),
  (2, 'asuhan-pelayanan', 'teknis', 'Inisiasi Menyusu Dini (IMD) sebaiknya dilakukan segera setelah bayi lahir selama minimal...', '{"A":"15 menit","B":"30 menit","C":"45 menit","D":"60 menit","E":"90 menit"}'::jsonb, 'D', 'IMD dilakukan minimal 60 menit (1 jam) pertama setelah lahir agar bayi mendapat kolostrum dan bonding terbentuk.'),
  (3, 'asuhan-pelayanan', 'teknis', 'Pada pemeriksaan tumbuh kembang balita menggunakan KMS, garis pertumbuhan yang berada di papan kuning (T) menunjukkan...', '{"A":"Status gizi baik","B":"Status gizi kurang","C":"Status gizi buruk","D":"Status gizi lebih","E":"Status gizi normal"}'::jsonb, 'B', 'Garis pertumbuhan di papan kuning (T) pada KMS menunjukkan status gizi kurang yang perlu diintervensi.'),
  (4, 'asuhan-pelayanan', 'teknis', 'Imunisasi BCG diberikan untuk mencegah penyakit...', '{"A":"Polio","B":"Campak","C":"Tuberkulosis","D":"Hepatitis B","E":"Difteri"}'::jsonb, 'C', 'Vaksin BCG (Bacillus Calmette-Guérin) diberikan untuk proteksi terhadap Tuberkulosis berat pada anak.'),
  (5, 'asuhan-pelayanan', 'teknis', 'Imunisasi polio pada bayi usia 0-11 bulan dilakukan sebanyak...', '{"A":"1 kali","B":"2 kali","C":"3 kali","D":"4 kali","E":"5 kali"}'::jsonb, 'D', 'Imunisasi polio diberikan 4 kali pada bayi: saat lahir (IPV-0), usia 2, 3, dan 4 bulan.'),
  (6, 'asuhan-pelayanan', 'teknis', 'Pengobatan Tuberkulosis (TB) menggunakan strategi DOTS yang mencakup periode pengobatan standar selama...', '{"A":"2 bulan","B":"4 bulan","C":"6 bulan","D":"8 bulan","E":"12 bulan"}'::jsonb, 'C', 'Strategi DOTS untuk TB standar berdurasi 6 bulan (2 bulan fase intensif + 4 bulan fase lanjutan).'),
  (7, 'asuhan-pelayanan', 'teknis', 'Saat melakukan pengkajian keperawatan, langkah pertama dalam proses keperawatan adalah...', '{"A":"Diagnosa keperawatan","B":"Perencanaan","C":"Pengkajian","D":"Implementasi","E":"Evaluasi"}'::jsonb, 'C', 'Proses keperawatan dimulai dengan pengkajian untuk mengumpulkan data subjektif dan objektif pasien.'),
  (8, 'asuhan-pelayanan', 'teknis', 'Tanda bahaya pada anak balita yang memerlukan rujukan segera ke fasilitas kesehatan adalah...', '{"A":"Nafsu makan menurun","B":"Batuk pilek ringan","C":"Tidak bisa minum/menyusu","D":"Berak warna hijau","E":"Suhu 37.5°C"}'::jsonb, 'C', 'Tidak bisa minum/menyusu merupakan tanda bahaya umum pada Balita Sakit (MTBS) yang mengindikasikan kondisi serius.'),
  (9, 'asuhan-pelayanan', 'teknis', 'Deteksi dini tumbuh kembang balita menggunakan KPSP dilakukan pada usia...', '{"A":"3-72 bulan","B":"6-60 bulan","C":"12-48 bulan","D":"0-24 bulan","E":"24-72 bulan"}'::jsonb, 'B', 'KPSP (Kuesioner Pra-Skrining Perkembangan) digunakan untuk skrining tumbuh kembang anak usia 6-60 bulan.'),
  (10, 'asuhan-pelayanan', 'teknis', 'Penyakit Tidak Menular (PTM) yang menjadi prioritas program Pengelolaan PTM di Puskesmas antara lain...', '{"A":"Tifus, kolera, diare","B":"Hipertensi, DM, kanker","C":"TB, HIV, malaria","D":"ISPA, pneumonia, asma","E":"Hepatitis, chikungunya"}'::jsonb, 'B', 'Prioritas PTM meliputi hipertensi, diabetes mellitus, kanker, dan penyakit jantung sesuai program Pengelolaan PTM.'),
  (11, 'asuhan-pelayanan', 'teknis', 'Klasifikasi stunting berdasarkan panjang badan menurut umur (PB/U) menggunakan z-score. Anak dikategorikan stunting jika z-score...', '{"A":"> +2 SD","B":"Antara -2 SD hingga +2 SD","C":"< -2 SD","D":"< -3 SD","E":"< -1 SD"}'::jsonb, 'C', 'Stunting (sangat pendek) didefinisikan sebagai PB/U atau TB/U dengan z-score < -2 SD; sangat pendek jika < -3 SD.'),
  (12, 'asuhan-pelayanan', 'teknis', 'Pada ibu hamil, pemberian tablet tambah darah (TTD) minimal selama...', '{"A":"30 hari","B":"60 hari","C":"90 hari","D":"120 hari","E":"180 hari"}'::jsonb, 'C', 'Ibu hamil dianjurkan mengonsumsi TTD minimal 90 hari selama kehamilan untuk mencegah anemia.'),
  (13, 'asuhan-pelayanan', 'teknis', 'Tanda/gejala K4 (Kunjungan ke-4) pada ibu hamil dilakukan pada trimester...', '{"A":"Trimester I (usia kehamilan < 12 minggu)","B":"Trimester II (usia kehamilan 12-24 minggu)","C":"Trimester III (usia kehamilan 24-36 minggu)","D":"Trimester IV (usia kehamilan > 36 minggu)","E":"Setiap trimester"}'::jsonb, 'C', 'K4 adalah kunjungan ke-4 ibu hamil yang dilakukan pada trimester III (usia kehamilan 24-36 minggu).'),
  (14, 'asuhan-pelayanan', 'teknis', 'Pada pemeriksaan tekanan darah, hipertensi pada dewasa didefinisikan sebagai tekanan sistolik dan diastolik berturut-turut...', '{"A":"> 110/70 mmHg","B":"> 120/80 mmHg","C":"> 130/85 mmHg","D":"> 140/90 mmHg","E":"> 160/100 mmHg"}'::jsonb, 'D', 'Hipertensi pada dewasa didefinisikan sebagai tekanan darah ≥ 140/90 mmHg berdasarkan Pedoman PTM Kemenkes.'),
  (15, 'asuhan-pelayanan', 'teknis', 'Pemberian ASI eksklusif dianjurkan selama minimal...', '{"A":"2 bulan","B":"4 bulan","C":"6 bulan","D":"12 bulan","E":"24 bulan"}'::jsonb, 'C', 'ASI eksklusif diberikan tanpa makanan/minuman lain selama 6 bulan pertama kehidupan bayi.'),
  (16, 'asuhan-pelayanan', 'teknis', 'Jenis imunisasi yang diberikan saat bayi lahir di fasilitas kesehatan adalah...', '{"A":"BCG dan polio","B":"Hepatitis B-0 dan polio-0","C":"Campak dan BCG","D":"DPT-HB-Hib","E":"IPV dan rotavirus"}'::jsonb, 'B', 'Saat lahir, bayi mendapat imunisasi Hepatitis B-0 (dalam 24 jam pertama) dan polio-0.'),
  (17, 'asuhan-pelayanan', 'teknis', 'Prinsip penanganan diare akut pada balita dengan rencana terapi B (diare tanpa dehidrasi) adalah...', '{"A":"Pemberian cairan IV dan rujukan segera","B":"Pemberian oralit, zinc, dan teruskan ASI/makanan","C":"Pemberian antibiotik spektrum luas","D":"Pemberian antidiare dan antiemetik","E":"Puasa 24 jam lalu reintroduksi cairan"}'::jsonb, 'B', 'Pada diare tanpa dehidrasi (rencana B), berikan oralit, zinc selama 10 hari, dan teruskan ASI/makanan.'),
  (18, 'asuhan-pelayanan', 'teknis', 'Penatalaksanaan awal penderita stroke iskemik akut yang datang < 4,5 jam sejak onset gejala adalah...', '{"A":"Pemberian aspirin oral","B":"Trombolisis dengan rt-PA","C":"Antikoagulan heparin IV","D":"Dekstran IV bolus","E":"Manitol IV"}'::jsonb, 'B', 'Pada stroke iskemik akut dalam window terapi < 4,5 jam, trombolisis dengan rt-PA (alteplase) adalah standar bila tidak ada kontraindikasi.'),
  (19, 'asuhan-pelayanan', 'teknis', 'Tanda klinis syok hipovolemik pada dewasa yang paling sensitif adalah...', '{"A":"Hipotensi","B":"Takikardia","C":"Penurunan kesadaran","D":"Ekstremitas dingin","E":"Oliguria"}'::jsonb, 'B', 'Takikardia adalah tanda paling awal dan sensitif syok hipovolemik, muncul sebelum hipotensi terjadi.'),
  (20, 'asuhan-pelayanan', 'teknis', 'Pada MTBS, klasifikasi pneumonia berat ditandai dengan...', '{"A":"Batuk, napas tidak cepat","B":"Batuk, napas cepat","C":"Batuk, stridor dan dinding dada bawah tertarik","D":"Batuk, demam ringan","E":"Batuk, pilek"}'::jsonb, 'C', 'Pneumonia berat pada MTBS ditandai dengan adanya stridor dan dinding dada bawah tertarik (chest indrawing).'),
  (21, 'asuhan-pelayanan', 'teknis', 'Frekuensi napas normal dewasa adalah...', '{"A":"8-12 kali/menit","B":"12-20 kali/menit","C":"20-30 kali/menit","D":"30-40 kali/menit","E":"40-60 kali/menit"}'::jsonb, 'B', 'Frekuensi napas normal dewasa adalah 12-20 kali per menit.'),
  (22, 'asuhan-pelayanan', 'teknis', 'Tanda Cushing triad pada peningkatan tekanan intrakranial meliputi...', '{"A":"Hipotensi, bradikardia, takipnea","B":"Hipertensi, bradikardia, pola napas ireguler","C":"Hipertensi, takikardia, demam","D":"Hipotensi, takikardia, hipoksia","E":"Hipertensi, takipnea, miosis"}'::jsonb, 'B', 'Triad Cushing: hipertensi, bradikardia, dan pola napas ireguler (cheyne-stokes) menandakan peningkatan TIK signifikan.'),
  (23, 'asuhan-pelayanan', 'teknis', 'Skrining kanker serviks menggunakan metode IVA (Inspeksi Visual dengan Asam Asetat) dilakukan pada wanita usia...', '{"A":"20-50 tahun","B":"30-50 tahun","C":"40-60 tahun","D":"25-65 tahun","E":"35-70 tahun"}'::jsonb, 'B', 'Skrining IVA dianjurkan pada wanita usia 30-50 tahun, dilakukan setiap 5 tahun jika hasil negatif.'),
  (24, 'asuhan-pelayanan', 'teknis', 'Pada bayi dengan ikterus fisiologis, biasanya muncul pada hari ke...', '{"A":"Hari ke-1","B":"Hari ke-2 sampai 3","C":"Hari ke-4 sampai 5","D":"Hari ke-7","E":"Hari ke-14"}'::jsonb, 'B', 'Ikterus fisiologis muncul pada hari ke-2 sampai ke-3, mencapai puncak hari ke-4-5, dan hilang dalam 1-2 minggu.'),
  (25, 'asuhan-pelayanan', 'teknis', 'Penanganan luka bakar derajat II dengan luas < 10% pada dewasa sebaiknya...', '{"A":"Dibiarkan terbuka","B":"Diberi salep antibiotik saja","C":"Dinginkan dengan air mengalir, beri penutup steril","D":"Segera rujuk ke RS","E":"Berikan es batu langsung ke luka"}'::jsonb, 'C', 'Luka bakar derajat II < 10% pada dewasa: dinginkan dengan air mengalir 20 menit, lalu tutup dengan kasa steril.')
on conflict (id) do nothing;

insert into public.tryout_questions (id, kategori_id, section, pertanyaan, opsi, jawaban, pembahasan)
values
  (26, 'asuhan-pelayanan', 'teknis', 'Pada Pengelolaan Terpadu Balita Sakit (MTBS), tanda umum bahaya yang memerlukan rujukan segera adalah...', '{"A":"Batuk lebih dari 7 hari","B":"Tidak bisa minum/menyusu, muntah semua, kejang","C":"Demam 2 hari","D":"Diare 2 kali sehari","E":"Pilek dan batuk"}'::jsonb, 'B', 'Tanda umum bahaya pada MTBS meliputi tidak bisa minum/menyusu, muntah semua, dan kejang — semuanya perlu rujukan segera.'),
  (27, 'asuhan-pelayanan', 'teknis', 'Tanda vital penderita dewasa dengan status gawat darurat yang memerlukan resusitasi segera adalah...', '{"A":"Sistolik 110 mmHg","B":"Sistolik < 90 mmHg","C":"Nadi 80 kali/menit","D":"Suhu 37.2°C","E":"SpO2 95%"}'::jsonb, 'B', 'Tekanan darah sistolik < 90 mmHg pada dewasa menandakan syok dan memerlukan resusitasi cairan segera.'),
  (28, 'asuhan-pelayanan', 'teknis', 'Pengobatan standar filariasis massal menggunakan obat...', '{"A":"Albendazole + DEC","B":"Ivermectin + DEC","C":"Praziquantel","D":"Metronidazole","E":"Diethylcarbamazine citrate tunggal"}'::jsonb, 'A', 'Pengobatan massal filariasis menggunakan kombinasi DEC + Albendazole diminum sekali setahun selama 5 tahun.'),
  (29, 'asuhan-pelayanan', 'teknis', 'Skrining tumbuh kembang bayi usia 0-6 bulan yang penting dilakukan terkait gangguan pendengaran adalah...', '{"A":"OAE (Otoacoustic Emission)","B":"Audiometri nada murni","C":"Rinne test","D":"Weber test","E":"BERA diagnostik"}'::jsonb, 'A', 'OAE (Otoacoustic Emission) adalah metode skrining pendengaran bayi baru lahir yang non-invasif dan cepat.'),
  (30, 'asuhan-pelayanan', 'teknis', 'Pada pasien dengan kejang demam kompleks, tanda yang membedakan dari kejang demam sederhana adalah...', '{"A":"Durasi < 5 menit, umum","B":"Durasi > 15 menit, fokal atau berulang dalam 24 jam","C":"Demam < 38°C","D":"Suhu normal saat kejang","E":"Tidak ada riwayat demam"}'::jsonb, 'B', 'Kejang demam kompleks ditandai durasi > 15 menit, fokal, atau berulang dalam 24 jam — berbeda dari kejang demam sederhana.'),
  (31, 'etika-hukum', 'teknis', 'Prinsip informed consent dalam pelayanan kesehatan berasaskan...', '{"A":"Otonomi pasien","B":"Beneficence","C":"Non-maleficence","D":"Justice","E":"Veracity"}'::jsonb, 'A', 'Informed consent berasaskan prinsip otonomi pasien, yaitu hak pasien untuk menentukan nasibnya sendiri.'),
  (32, 'etika-hukum', 'teknis', 'Prinsip bioetika', '{"A":"Menghormati keputusan pasien","B":"Melakukan yang terbaik untuk pasien","C":"Tidak menimbulkan kerugian","D":"Keadilan dalam distribusi sumber daya","E":"Mengatakan yang benar"}'::jsonb, 'B', 'Beneficence adalah prinsip berbuat baik, melakukan tindakan terbaik untuk kepentingan pasien.'),
  (33, 'etika-hukum', 'teknis', 'Prinsip non-maleficence dalam pelayanan kesehatan dikenal dengan istilah...', '{"A":"Berbuat baik","B":"Tidak membahayakan (primum non nocere)","C":"Menghormati otonomi","D":"Keadilan distribusi","E":"Mengatakan kebenaran"}'::jsonb, 'B', 'Non-maleficence berasal dari prinsip primum non nocere ='),
  (34, 'etika-hukum', 'teknis', 'Enam Sasaran Keselamatan Pasien (Patient Safety) menurut Permenkes yang pertama adalah...', '{"A":"Mengurangi risiko infeksi nosokomial","B":"Identifikasi pasien dengan benar","C":"Peningkatan keamanan obat yang perlu perhatian khusus","D":"Komitmen keselamatan pasien","E":"Komunikasi yang efektif"}'::jsonb, 'B', 'Sasaran 1 Patient Safety adalah identifikasi pasien dengan benar menggunakan minimal 2 identitas (nama lengkap + tanggal lahir).'),
  (35, 'etika-hukum', 'teknis', 'Pada Sasaran Keselamatan Pasien,', '{"A":"Sasaran 1: Identifikasi pasien","B":"Sasaran 3: Meningkatkan keamanan prosedur tindakan invasif","C":"Sasaran 4: Meningkatkan keamanan operasi","D":"Sasaran 5: Mengurangi risiko infeksi","E":"Sasaran 6: Mengurangi risiko pasien jatuh"}'::jsonb, 'C', 'Penandaan lokasi operasi termasuk Sasaran 4: Meningkatkan keamanan operasi (correct site, correct procedure, correct patient).'),
  (36, 'etika-hukum', 'teknis', 'Kewajiban tenaga kesehatan menjaga rahasia medis pasien tertuang dalam...', '{"A":"UU No. 36 Tahun 2009 tentang Kesehatan","B":"UU No. 29 Tahun 2004 tentang Praktik Kedokteran","C":"UU No. 44 Tahun 2009 tentang Rumah Sakit","D":"Semua di atas","E":"Permenkes tentang Rekam Medis"}'::jsonb, 'D', 'Kewajiban menjaga rahasia medis pasien diatur dalam berbagai UU: 36/2009, 29/2004, dan 44/2009.'),
  (37, 'etika-hukum', 'teknis', 'Hak pasien untuk menolak tindakan medis dilindungi oleh...', '{"A":"Prinsip veracity","B":"Prinsip otonomi","C":"Prinsip beneficence","D":"Prinsip justice","E":"Prinsip paternalism"}'::jsonb, 'B', 'Hak menolak tindakan adalah bentuk otonomi pasien yang harus dihormati tenaga kesehatan setelah diberi informasi.'),
  (38, 'etika-hukum', 'teknis', 'Sasaran Keselamatan Pasien ke-6 (Pasien Jatuh) menggunakan skala Morse. Skor Morse yang menunjukkan risiko jatuh tinggi adalah...', '{"A":"< 25","B":"25-50","C":"> 50","D":"> 75","E":"> 100"}'::jsonb, 'C', 'Skala Morse > 50 menunjukkan risiko jatuh tinggi yang memerlukan intervensi pencegahan.'),
  (39, 'etika-hukum', 'teknis', 'Sanksi hukum bagi tenaga kesehatan yang melakukan malapraktik sesuai UU No. 36 Tahun 2009 dapat berupa...', '{"A":"Teguran lisan saja","B":"Sanksi administratif, perdata, dan pidana","C":"Pemutusan kontrak kerja","D":"Denda administratif","E":"Tidak ada sanksi"}'::jsonb, 'B', 'Malapraktik dapat dikenai sanksi administratif (izin dicabut), perdata (ganti rugi), dan pidana jika memenuhi unsur pidana.'),
  (40, 'etika-hukum', 'teknis', 'Dalam komunikasi terapeutik, prinsip konfidensialitas dapat dilanggar dalam kondisi...', '{"A":"Saat pasien meminta","B":"Saat ada kepentingan umum yang lebih tinggi (wabah, kekerasan)","C":"Saat pasien akan pindah RS","D":"Saat dokter konsultan meminta","E":"Tidak pernah bisa dilanggar"}'::jsonb, 'B', 'Konfidensialitas dapat dilanggar jika kepentingan umum lebih tinggi (mis. wabah, ancaman nyawa orang lain).'),
  (41, 'etika-hukum', 'teknis', 'Prinsip komunikasi', '{"A":"Situation, Background, Assessment, Recommendation","B":"Subjective, Background, Action, Result","C":"Situation, Briefing, Analysis, Resolution","D":"Standard, Benchmark, Action, Report","E":"Symptom, Background, Allergy, Response"}'::jsonb, 'A', 'SBAR = Situation, Background, Assessment, Recommendation — format komunikasi standar untuk handover pasien.'),
  (42, 'etika-hukum', 'teknis', 'Pada informed consent, yang bukan merupakan unsur wajib adalah...', '{"A":"Diagnosis","B":"Tindakan medis dan tujuan","C":"Risiko dan komplikasi","D":"Biaya total pasti","E":"Alternatif tindakan"}'::jsonb, 'D', 'Biaya total pasti bukan unsur wajib informed consent (meskipun etis disampaikan); unsur wajib: diagnosis, tindakan, tujuan, risiko, alternatif, prognosis.'),
  (43, 'etika-hukum', 'teknis', 'Pada Sasaran Keselamatan Pasien ke-2 (Peningkatan keamanan obat), obat dengan', '{"A":"Obat dengan nama mirip dan ejaan mirip yang berisiko tertukar","B":"Obat generik dan paten","C":"Obat keras dan obat bebas","D":"Obat narkotik dan psikotropika","E":"Obat dosis tinggi"}'::jsonb, 'A', 'LASA = Look-Alike Sound-Alike, obat dengan nama/ejaan serupa yang berisiko tertukar, harus dikelola khusus.'),
  (44, 'etika-hukum', 'teknis', 'Dokumen rekam medis menurut Permenkes No. 24 Tahun 2022 harus disimpan minimal selama...', '{"A":"5 tahun","B":"10 tahun","C":"15 tahun","D":"20 tahun","E":"Selama pasien hidup"}'::jsonb, 'B', 'Berdasarkan Permenkes 24/2022, rekam medis disimpan minimal 10 tahun setelah pasien terakhir berobat.'),
  (45, 'etika-hukum', 'teknis', 'Sasaran 5 Keselamatan Pasien', '{"A":"Hand hygiene 5 momen","B":"Penggunaan APD lengkap","C":"Sterilisasi alat","D":"Isolasi pasien","E":"Pemberian antibiotik profilaksis"}'::jsonb, 'A', 'Sasaran 5 menekankan kepatuhan hand hygiene 5 momen sebagai langkah utama pencegahan infeksi nosokomial.'),
  (46, 'manajemen-puskesmas', 'teknis', 'Fungsi utama Puskesmas dalam Sistem Kesehatan Nasional adalah...', '{"A":"Pelayanan rawat inap spesialistik","B":"Pusat pelayanan kesehatan tingkat pertama dan kesehatan masyarakat","C":"Rujukan tertinggi kasus kompleks","D":"Pendidikan tenaga kesehatan","E":"Penelitian epidemiologi"}'::jsonb, 'B', 'Puskesmas berfungsi sebagai pusat pelayanan kesehatan tingkat pertama (UKP) dan pusat pelayanan kesehatan masyarakat (UKM).'),
  (47, 'manajemen-puskesmas', 'teknis', 'Standar Pelayanan Minimal (SPM) Puskesmas diatur berdasarkan...', '{"A":"Peraturan Menteri Kesehatan","B":"Peraturan Presiden","C":"Peraturan Pemerintah No. 2 Tahun 2018","D":"Keputusan Menteri Kesehatan","E":"Peraturan Daerah"}'::jsonb, 'C', 'SPM bidang kesehatan diatur dalam PP No. 2 Tahun 2018 tentang Standar Pelayanan Minimal.'),
  (48, 'manajemen-puskesmas', 'teknis', 'Upaya Kesehatan Masyarakat (UKM) di Puskesmas dikelompokkan menjadi...', '{"A":"UKM esensial dan UKM rujukan","B":"UKM dasar dan UKM lanjutan","C":"UKM preventif dan UKM kuratif","D":"UKM primer dan UKM sekunder","E":"UKM langsung dan UKM tidak langsung"}'::jsonb, 'A', 'UKM dibagi menjadi UKM esensial (dasar) dan UKM rujukan (klinik kesehatan masyarakat).'),
  (49, 'manajemen-puskesmas', 'teknis', 'PIS-PK (Penilaian Independen Pencapaian Kinerja Puskesmas) dilaksanakan dengan frekuensi...', '{"A":"Setiap bulan","B":"Setiap 3 bulan","C":"Setiap 6 bulan","D":"Setiap 1 tahun","E":"Setiap 5 tahun"}'::jsonb, 'D', 'PIS-PK (juga dikenal sebagai PKP — Penilaian Kinerja Puskesmas) dilakukan minimal 1 kali setahun.'),
  (50, 'manajemen-puskesmas', 'teknis', 'Sesuai Permenkes No. 25 Tahun 2014, jumlah Upaya Kesehatan Masyarakat Esensial di Puskesmas ada...', '{"A":"5 upaya","B":"6 upaya","C":"7 upaya","D":"8 upaya","E":"10 upaya"}'::jsonb, 'B', 'Permenkes 25/2014 mengatur 6 UKM Esensial: UKM P2M, UKM Kesehatan Ibu, UKM Kesehatan Anak, UKM Gizi, UKM Kesehatan Lingkungan, UKM Promkes.')
on conflict (id) do nothing;

insert into public.tryout_questions (id, kategori_id, section, pertanyaan, opsi, jawaban, pembahasan)
values
  (51, 'manajemen-puskesmas', 'teknis', 'Perencanaan obat di Puskesmas menggunakan metode...', '{"A":"Metode konvensional","B":"Metode ABC/VEN (Consumption-morbiditas)","C":"Metode trial and error","D":"Metode order langsung","E":"Metode stok maksimal"}'::jsonb, 'B', 'Perencanaan obat Puskesmas menggunakan metode ABC/VEN dengan analisis konsumsi dan morbiditas untuk efisiensi.'),
  (52, 'manajemen-puskesmas', 'teknis', 'PLP (Penerimaan, Penyimpanan, Pendistribusian) obat di Puskesmas termasuk dalam fungsi...', '{"A":"Perencanaan","B":"Pengadaan","C":"Pengelolaan","D":"Pemanfaatan","E":"Pengawasan"}'::jsonb, 'C', 'Penerimaan, penyimpanan, dan pendistribusian (PLP) termasuk fungsi pengelolaan obat di Puskesmas.'),
  (53, 'manajemen-puskesmas', 'teknis', 'Siklus manajemen Puskesmas yang ideal dimulai dari...', '{"A":"Pelaksanaan → Evaluasi → Perencanaan","B":"Perencanaan → Pelaksanaan → Pengawasan → Evaluasi","C":"Pengawasan → Perencanaan → Pelaksanaan","D":"Evaluasi → Perencanaan → Pelaksanaan","E":"Pelaksanaan → Perencanaan → Pengawasan"}'::jsonb, 'B', 'Siklus manajemen Puskesmas: Perencanaan → Pelaksanaan → Pengawasan dan Pengendalian → Evaluasi.'),
  (54, 'manajemen-puskesmas', 'teknis', 'Cakupan D/S pada Puskesmas mengukur...', '{"A":"Cakupan kunjungan bayi dibagi balita","B":"Cakupan kunjungan balita dibagi sasaran balita","C":"Cakupan kunjungan ibu hamil","D":"Cakupan imunisasi lengkap","E":"Cakupan penimbangan balita"}'::jsonb, 'B', 'D/S = jumlah balita yang ditimbang dibagi jumlah sasaran balita di wilayah kerja Puskesmas.'),
  (55, 'manajemen-puskesmas', 'teknis', 'Kegiatan UKM (Upaya Kesehatan Masyarakat) Perorangan di Puskesmas meliputi...', '{"A":"Promosi kesehatan","B":"Pemeriksaan dan pengobatan pasien rawat jalan","C":"Penyehatan lingkungan","D":"Surveilans epidemiologi","E":"Pemberantasan vektor"}'::jsonb, 'B', 'UKP (Upaya Kesehatan Perorangan) di Puskesmas meliputi pemeriksaan, diagnosis, dan pengobatan pasien rawat jalan.'),
  (56, 'manajemen-puskesmas', 'teknis', 'Pengisian SPM (Standar Pelayanan Minimal) di Puskesmas dilaporkan ke...', '{"A":"Kementerian Kesehatan langsung","B":"Dinas Kesehatan Kabupaten/Kota","C":"Bupati/Walikota langsung","D":"Kepala Daerah","E":"BPS"}'::jsonb, 'B', 'Puskesmas melaporkan SPM ke Dinas Kesehatan Kabupaten/Kota untuk diteruskan ke tingkat pusat.'),
  (57, 'manajemen-puskesmas', 'teknis', 'Pengorganisasian UKM rujukan di Puskesmas mencakup klinik untuk...', '{"A":"TB-MDR, kusta, DBD","B":"Kesehatan jiwa, gigi, geriatric","C":"P2 ISPA, diare, malaria","D":"Rawat inap dan UGD","E":"Spesialisasi penyakit dalam"}'::jsonb, 'A', 'UKM rujukan mencakup klinik TB MDR, kusta, filariasis, DBD, dan lain-lain yang membutuhkan penanganan khusus.'),
  (58, 'manajemen-puskesmas', 'teknis', 'Perencanaan Operasional Puskesmas (POP) dibuat untuk periode...', '{"A":"1 tahun","B":"2 tahun","C":"5 tahun","D":"10 tahun","E":"Bulanan"}'::jsonb, 'A', 'Perencanaan Operasional (POP) Puskesmas dibuat untuk periode 1 tahun (tahun berjalan) dengan kegiatan rinci.'),
  (59, 'manajemen-puskesmas', 'teknis', 'Indikator dari Rencana Usulan Kegiatan (RUK) Puskesmas terutama digunakan untuk...', '{"A":"Mengukur kinerja dokter","B":"Menyusun rencana kegiatan tahun berikutnya","C":"Mengukur kepuasan pasien","D":"Mengukur kualitas pelayanan","E":"Mengukur kinerja perawat"}'::jsonb, 'B', 'RUK (Rencana Usulan Kegiatan) Puskesmas adalah dokumen perencanaan untuk menyusun kegiatan tahun berikutnya.'),
  (60, 'manajemen-puskesmas', 'teknis', 'Konsep', '{"A":"Alma-Ata 1978","B":"Ottawa 1986","C":"Jakarta 1997","D":"Bangkok 2005","E":"Helsinki 2013"}'::jsonb, 'A', 'Deklarasi Alma-Ata 1978 menetapkan'),
  (61, 'ppi-k3-kesling', 'teknis', 'Lima momen cuci tangan menurut WHO tidak termasuk...', '{"A":"Sebelum kontak dengan pasien","B":"Sebelum tindakan aseptik","C":"Sesudah terpapar cairan tubuh","D":"Sesudah kontak dengan pasien","E":"Sebelum makan"}'::jsonb, 'E', 'Lima momen cuci tangan WHO: sebelum kontak pasien, sebelum tindakan aseptik, setelah risiko paparan cairan, setelah kontak pasien, setelah kontak lingkungan pasien — bukan sebelum makan.'),
  (62, 'ppi-k3-kesling', 'teknis', 'Penggunaan APD (Alat Pelindung Diri) yang benar saat menangani pasien COVID-19 suspek di ruang rawat adalah...', '{"A":"Masker bedah dan sarung tangan saja","B":"Masker N95, faceshield, gaun panjang, sarung tangan, sepatu boot","C":"Hanya masker N95","D":"Masker bedah dan goggle","E":"Tidak perlu APD bila jaga jarak 2m"}'::jsonb, 'B', 'Penanganan pasien suspek COVID-19 dengan tindakan aerosolized memerlukan APD lengkap level 3: N95, faceshield, gaun, sarung tangan, sepatu boot.'),
  (63, 'ppi-k3-kesling', 'teknis', 'Warna kantong plastik untuk limbah infeksius menurut Permenkes adalah...', '{"A":"Kuning","B":"Merah","C":"Hijau","D":"Hitam","E":"Putih"}'::jsonb, 'A', 'Limbah infeksius dikemas dalam kantong kuning dengan simbol biohazard.'),
  (64, 'ppi-k3-kesling', 'teknis', 'Limbah benda tajam (jarum suntik) harus dibuang ke...', '{"A":"Kantong kuning","B":"Kantong hitam","C":"Safety box kuning keras","D":"Kantong merah","E":"Tempat sampah biasa"}'::jsonb, 'C', 'Limbah benda tajam harus dibuang ke safety box kuning keras yang tahan tusukan.'),
  (65, 'ppi-k3-kesling', 'teknis', 'Pemilihan APD berdasarkan risiko paparan mengikuti prinsip...', '{"A":"Universal precaution","B":"Standard precaution","C":"Droplet precaution","D":"Contact precaution","E":"Airborne precaution"}'::jsonb, 'B', 'Standard precaution adalah prinsip dasar pemilihan APD untuk SEMUA pasien, diperketat sesuai tipe transmisi (kontak, droplet, airborne).'),
  (66, 'ppi-k3-kesling', 'teknis', 'Standar kualitas air bersih untuk kebutuhan domestik sesuai Permenkes No. 32 Tahun 2017 adalah...', '{"A":"E.coli = 0 per 100 ml","B":"E.coli < 10 per 100 ml","C":"E.coli < 100 per 100 ml","D":"E.coli < 1000 per 100 ml","E":"Tidak ada batasan"}'::jsonb, 'A', 'Sesuai Permenkes 32/2017, air bersih untuk minum harus 0 E.coli per 100 ml.'),
  (67, 'ppi-k3-kesling', 'teknis', 'SPMI (Standar Pelayanan Minimal Rumah Sakit) terkait PPI mensyaratkan angka infeksi nosokomial (ILO) ≤...', '{"A":"< 1%","B":"< 5%","C":"< 10%","D":"< 15%","E":"< 20%"}'::jsonb, 'B', 'Target nasional ILO ≤ 5% sesuai standar PPI di fasilitas kesehatan.'),
  (68, 'ppi-k3-kesling', 'teknis', 'Sanitasi total berbasis masyarakat (STBM) memiliki 5 pilar, yang pertama adalah...', '{"A":"Stop BABS Bebas","B":"Cuci tangan pakai sabun","C":"Pengelolaan air minum aman","D":"Pengelolaan sampah rumah tangga","E":"Pengelolaan limbah cair"}'::jsonb, 'A', 'Pilar pertama STBM adalah Stop BABS (Buang Air Besar Sembarangan) Bebas.'),
  (69, 'ppi-k3-kesling', 'teknis', 'Pada K3 (Keselamatan dan Kesehatan Kerja), APD untuk melindungi mata dari paparan cahaya pengelasan adalah...', '{"A":"Kacamata bening","B":"Welding helmet/goggle filter shade","C":"Faceshield bening","D":"Sarung tangan","E":"Respirator"}'::jsonb, 'B', 'Pengelasan memerlukan helmet/goggle dengan filter shade sesuai tingkat radiasi UV/IR untuk melindungi retina.'),
  (70, 'ppi-k3-kesling', 'teknis', 'Insidental finding seorang pekerja terpapar darah akibat tertusuk jarum suntik bekas. Tindakan pertama yang benar adalah...', '{"A":"Laporkan ke K3 dan segera lakukan post-exposure prophylaxis (PEP) HIV","B":"Diam saja bila tidak ada luka","C":"Cuci dengan alkohol 70%","D":"Berikan antibiotik profilaksis","E":"Istirahat 1 hari"}'::jsonb, 'A', 'Tertusuk jarum bekas: cuci dengan air sabun, laporkan, dan segera evaluasi PEP HIV dalam 2-72 jam pertama.'),
  (71, 'farmakologi-lab-gd-gizi', 'teknis', 'Rute pemberian obat yang memiliki onset paling cepat adalah...', '{"A":"Sublingual","B":"Intravena","C":"Intramuskular","D":"Subkutan","E":"Oral"}'::jsonb, 'B', 'Pemberian intravena (IV) memiliki onset paling cepat karena langsung masuk sirkulasi sistemik.'),
  (72, 'farmakologi-lab-gd-gizi', 'teknis', 'Obat pilihan pertama untuk tachycardia ventricular dengan destabilisasi hemodinamik adalah...', '{"A":"Amiodaron IV","B":"Adenosine IV","C":"Verapamil IV","D":"Lidokain IV","E":"Atropine IV"}'::jsonb, 'A', 'Amiodaron IV adalah obat pilihan VT dengan destabilisasi hemodinamik (jika tidak perlu synchroniz cardioversion segera).'),
  (73, 'farmakologi-lab-gd-gizi', 'teknis', 'Nilai normal gula darah puasa pada dewasa adalah...', '{"A":"< 70 mg/dL","B":"70-100 mg/dL","C":"100-126 mg/dL","D":"126-200 mg/dL","E":"> 200 mg/dL"}'::jsonb, 'B', 'Gula darah puasa normal dewasa: 70-100 mg/dL (Perkeni). Diabetes jika GDP ≥ 126 mg/dL.'),
  (74, 'farmakologi-lab-gd-gizi', 'teknis', 'HbA1c mencerminkan kadar glukosa darah rata-rata dalam periode...', '{"A":"1 minggu","B":"2-4 minggu","C":"8-12 minggu","D":"6 bulan","E":"1 tahun"}'::jsonb, 'C', 'HbA1c mencerminkan rata-rata glukosa darah 8-12 minggu (2-3 bulan) terakhir karena masa hidup eritrosit.'),
  (75, 'farmakologi-lab-gd-gizi', 'teknis', 'Tanda WHO pada dehidrasi berat pada balita adalah...', '{"A":"Haus, mata cekung","B":"Letargis, mata sangat cekung, cubitan kulit balik sangat lambat","C":"Demam ringan","D":"Mual dan muntah","E":"Tidak buang air 6 jam"}'::jsonb, 'B', 'Dehidrasi berat: letargis, mata sangat cekung, tidak bisa minum, cubitan kulit balik sangat lambat (> 2 detik).')
on conflict (id) do nothing;

insert into public.tryout_questions (id, kategori_id, section, pertanyaan, opsi, jawaban, pembahasan)
values
  (76, 'farmakologi-lab-gd-gizi', 'teknis', 'Pada adult respiratory distress syndrome (ARDS), gambaran X-ray thorax khas berupa...', '{"A":"Infiltrat interstisial difus bilateral","B":"Kavitas berdinding tipis","C":"Pneumothorax","D":"Efusi pleura","E":"Massa bulat soliter"}'::jsonb, 'A', 'ARDS menunjukkan infiltrat interstisial-alveolar difus bilateral (ground-glass opacity) tanpa gagal jantung kongestif.'),
  (77, 'farmakologi-lab-gd-gizi', 'teknis', 'Bila pasien ditemukan henti jantung, urutan BLS (Basic Life Support) yang benar adalah...', '{"A":"Airway-Breathing-Compression","B":"Compression-Airway-Breathing (C-A-B)","C":"Breathing-Compression-Airway","D":"Airway-Compression-Breathing","E":"Compression-Breathing-Airway"}'::jsonb, 'B', 'BLS 2020 menggunakan urutan C-A-B: Compression dulu (30x), lalu Airway, lalu Breathing (2x).'),
  (78, 'farmakologi-lab-gd-gizi', 'teknis', 'Dosis epinefrin standar pada cardiac arrest dewasa adalah...', '{"A":"0.1 mg IV bolus","B":"1 mg IV bolus setiap 3-5 menit","C":"5 mg IV bolus","D":"10 mg IV bolus","E":"0.5 mg subkutan"}'::jsonb, 'B', 'Epinefrin 1 mg IV bolus setiap 3-5 menit selama resusitasi cardiac arrest dewasa (AHA 2020).'),
  (79, 'farmakologi-lab-gd-gizi', 'teknis', 'Indeks massa tubuh (IMT) untuk kategori obesitas pada orang Asia adalah...', '{"A":"> 23 kg/m²","B":"> 25 kg/m²","C":"> 27.5 kg/m²","D":"> 30 kg/m²","E":"> 35 kg/m²"}'::jsonb, 'C', 'Klasifikasi Asia-Pasifik: obesitas IMT ≥ 27.5 kg/m²; overweight 23-24.9; normal 18.5-22.9.'),
  (80, 'farmakologi-lab-gd-gizi', 'teknis', 'Kebutuhan cairan maintenance dewasa per hari menurut rumus Holliday-Segar (4-2-1) untuk 60 kg adalah...', '{"A":"1500 mL/24 jam","B":"2000 mL/24 jam","C":"2400 mL/24 jam","D":"3000 mL/24 jam","E":"3600 mL/24 jam"}'::jsonb, 'C', 'Rumus 4-2-1: 10 kg pertama (40) + 10 kg kedua (20) + 40 kg sisanya @1 = 100 mL/jam → 2400 mL/24 jam.'),
  (81, 'farmakologi-lab-gd-gizi', 'teknis', 'Jenis cairan kristaloid isotonik yang paling seimbang elektrolitnya adalah...', '{"A":"NaCl 0.9%","B":"Ringer Laktat","C":"Dextrose 5%","D":"NaCl 3%","E":"Aminofusin"}'::jsonb, 'B', 'Ringer Laktat lebih seimbang elektrolitnya dibanding NaCl 0.9% (mendekati komposisi cairan ekstraseluler).'),
  (82, 'farmakologi-lab-gd-gizi', 'teknis', 'Interaksi obat yang paling berbahaya pada pasien yang minum warfarin adalah dengan...', '{"A":"Antasida","B":"Eritromisin atau ketokonazol","C":"Vitamin C","D":"Parasetamol dosis rendah","E":"Antihistamin"}'::jsonb, 'B', 'Eritromisin/ketokonazol menghambat CYP3A4 sehingga meningkatkan kadar warfarin dan risiko perdarahan.'),
  (83, 'farmakologi-lab-gd-gizi', 'teknis', 'Pemeriksaan penunjang yang paling spesifik untuk diagnosis infark miokard akut adalah...', '{"A":"CK-MB","B":"Troponin I/T","C":"LDH","D":"AST (SGOT)","E":"Myoglobin"}'::jsonb, 'B', 'Troponin I/T adalah biomarker paling spesifik untuk infark miokard akut, naik dalam 3-4 jam dan bertahan 7-10 hari.'),
  (84, 'farmakologi-lab-gd-gizi', 'teknis', 'Pada keadaan anafilaksis, obat pertama yang diberikan adalah...', '{"A":"Difenhidramin IV","B":"Epinefrin 0.3-0.5 mg IM (anterolateral paha)","C":"Hidrokortison IV","D":"Salbutamol nebulizer","E":"Oksigen 100%"}'::jsonb, 'B', 'Epinefrin IM di paha anterolateral adalah pengobatan first-line anafilaksis (dewasa 0.3-0.5 mg).'),
  (85, 'farmakologi-lab-gd-gizi', 'teknis', 'Pemberian makanan enteral pada pasien kritis dianjurkan dalam waktu...', '{"A":"< 6 jam sejak masuk ICU","B":"24-48 jam sejak masuk ICU","C":"Setelah 72 jam puasa","D":"Setelah ekstubasi saja","E":"Bila pasien sadar penuh"}'::jsonb, 'B', 'Nutrition support therapy merekomendasikan nutrisi enteral dalam 24-48 jam pertama masuk ICU untuk pasien kritis.'),
  (86, 'manajerial-sosio-kultural', 'teknis', 'Akronim BerAKHLAK sebagai core values ASN berarti...', '{"A":"Berorientasi Pelayanan, Akuntabel, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif","B":"Berintegritas, Akuntabel, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif","C":"Berorientasi Hasil, Akuntabel, Kreatif, Harmonis, Loyal, Adaptif, Kolaboratif","D":"Berintegritas, Aktual, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif","E":"Berorientasi Pelayanan, Aktual, Kompeten, Hormat, Loyal, Adaptif, Kolaboratif"}'::jsonb, 'A', 'BerAKHLAK = Berorientasi Pelayanan, Akuntabel, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif (ditetapkan via PermenPANRB).'),
  (87, 'manajerial-sosio-kultural', 'teknis', 'Dalam ASN BerAKHLAK,', '{"A":"Bekerja sesuai standar pelayanan publik","B":"Bertanggung jawab atas kepercayaan publik dan sumber daya negara","C":"Mengutamakan kepentingan bersama di atas individu","D":"Berdedikasi pada negara dan bangsa","E":"Cepat menyesuaikan diri dengan perubahan"}'::jsonb, 'B', 'Akuntabel = bertanggung jawab atas kepercayaan dan sumber daya yang diberikan publik kepada ASN.'),
  (88, 'manajerial-sosio-kultural', 'teknis', 'Pilar Smart ASN mencakup...', '{"A":"Smart PNS, smart PPPK, smart TNI","B":"Smart Kinerja, smart talent, smart digital, smart service","C":"Smart kompetensi, smart promosi, smart mutasi","D":"Smart recruitment, smart training, smart remuneration","E":"Smart leadership, smart culture, smart system"}'::jsonb, 'B', 'Smart ASN: Smart Kinerja, Smart Talent, Smart Digital, Smart Service — pilar transformasi SDM ASN.'),
  (89, 'manajerial-sosio-kultural', 'teknis', 'Tahapan dalam proses manajemen perubahan menurut Kotter yang pertama adalah...', '{"A":"Membentuk visi dan strategi","B":"Menciptakan urgensi","C":"Mengkomunikasikan visi perubahan","D":"Menghapus hambatan","E":"Menciptakan kemenangan jangka pendek"}'::jsonb, 'B', 'Model Kotter: 1) Menciptakan urgensi, 2) Membentuk koalisi pengarah, 3) Mengembangkan visi & strategi, ...'),
  (90, 'manajerial-sosio-kultural', 'teknis', 'Gaya kepemimpinan situasional Hersey-Blanchard menekankan bahwa gaya kepemimpinan harus disesuaikan dengan...', '{"A":"Karakteristik organisasi","B":"Tingkat kematangan (maturity) bawahan","C":"Budaya perusahaan","D":"Lingkungan eksternal","E":"Jumlah karyawan"}'::jsonb, 'B', 'Model Hersey-Blanchard: gaya kepemimpinan (Telling, Selling, Participating, Delegating) disesuaikan dengan tingkat kematangan bawahan.'),
  (91, 'manajerial-sosio-kultural', 'teknis', 'Empat fungsi manajemen klasik menurut Henri Fayol adalah...', '{"A":"Planning, Organizing, Actuating, Controlling (POAC)","B":"Leading, Managing, Directing, Evaluating","C":"Forecasting, Planning, Coordinating, Reporting","D":"Planning, Doing, Checking, Acting","E":"Setting goals, Hiring, Firing, Reporting"}'::jsonb, 'A', 'Fungsi manajemen Fayol: Planning, Organizing, Actuating, Controlling (POAC).'),
  (92, 'manajerial-sosio-kultural', 'teknis', 'Metode SWOT analysis dalam perencanaan strategis terdiri dari...', '{"A":"Strengths, Weaknesses, Opportunities, Threats","B":"Strategy, Wisdom, Operation, Target","C":"Standard, Working, Operation, Time","D":"Strength, Wisdom, Output, Trust","E":"Strategic, Wise, Open, Tactical"}'::jsonb, 'A', 'SWOT = Strengths (kekuatan), Weaknesses (kelemahan) internal; Opportunities (peluang), Threats (ancaman) eksternal.'),
  (93, 'manajerial-sosio-kultural', 'teknis', 'Konsep', '{"A":"Specific, Measurable, Achievable, Relevant, Time-bound","B":"Simple, Meaningful, Attainable, Realistic, Timely","C":"Strategic, Manageable, Actionable, Reliable, Testable","D":"Standard, Modern, Appropriate, Responsible, Trustworthy","E":"Specific, Maintained, Achievable, Repeatable, Trackable"}'::jsonb, 'A', 'SMART goals: Specific, Measurable, Achievable, Relevant, Time-bound — kerangka penyusunan tujuan yang baik.'),
  (94, 'manajerial-sosio-kultural', 'teknis', 'Dalam teori motivasi Maslow, hierarki kebutuhan dari terendah ke tertinggi adalah...', '{"A":"Fisiologis → Aman → Sosial → Penghargaan → Aktualisasi Diri","B":"Aman → Fisiologis → Sosial → Penghargaan → Aktualisasi","C":"Sosial → Aman → Fisiologis → Aktualisasi → Penghargaan","D":"Penghargaan → Sosial → Aman → Fisiologis → Aktualisasi","E":"Aktualisasi → Penghargaan → Sosial → Aman → Fisiologis"}'::jsonb, 'A', 'Hierarki Maslow: fisiologis (basic) → keamanan → sosial → penghargaan → aktualisasi diri (puncak).'),
  (95, 'manajerial-sosio-kultural', 'teknis', 'Komunikasi efektif dalam organisasi tidak ditandai oleh...', '{"A":"Keterbukaan dan transparansi","B":"Mendengarkan aktif","C":"Empati pada penerima pesan","D":"Penggunaan jargon teknis yang rumit","E":"Umpan balik yang konstruktif"}'::jsonb, 'D', 'Penggunaan jargon teknis yang berlebihan justru menghambat komunikasi efektif, terutama kepada audiens non-teknis.'),
  (96, 'manajerial-sosio-kultural', 'teknis', 'Pemberian perilaku yang baik (leading by example) oleh pemimpin tercermin dari nilai...', '{"A":"Integritas","B":"Loyal","C":"Kompeten","D":"Adaptif","E":"Kolaboratif"}'::jsonb, 'A', 'Leading by example paling erat dengan nilai Integritas — pemimpin menjalankan apa yang diucapkan.'),
  (97, 'manajerial-sosio-kultural', 'teknis', 'Sikap kolaboratif dalam tim multidisiplin kesehatan mengharuskan...', '{"A":"Mementingkan profesi sendiri","B":"Saling berbagi informasi, menghargai kontribusi setiap profesi","C":"Menghindari konflik dengan cara menyembunyikan pendapat","D":"Mengikuti pendapat profesi paling senior","E":"Membiarkan dokter memutuskan semua hal"}'::jsonb, 'B', 'Kolaborasi tim multidisiplin: berbagi informasi, menghargai kontribusi tiap profesi untuk pasien.'),
  (98, 'manajerial-sosio-kultural', 'teknis', 'Pemecahan masalah dengan metode', '{"A":"Mencari 5 solusi alternatif","B":"Menemukan akar penyebab masalah dengan bertanya \"mengapa\" 5 kali","C":"Memecah masalah menjadi 5 bagian","D":"Menggali 5 opini stakeholder","E":"Membuat 5 kategori masalah"}'::jsonb, 'B', 'Metode 5 Why (Toyota Production System) bertanya'),
  (99, 'manajerial-sosio-kultural', 'teknis', 'Sikap Adaptif pada ASN BerAKHLAK terutama berhubungan dengan...', '{"A":"Pemenuhan target kuantitatif","B":"Kemampuan menyesuaikan diri dengan perubahan zaman dan teknologi","C":"Kepatuhan pada hierarki","D":"Pengelolaan keuangan daerah","E":"Penghargaan formal dari atasan"}'::jsonb, 'B', 'Adaptif = cepat menyesuaikan diri dengan perubahan lingkungan, teknologi, dan tuntutan masyarakat.'),
  (100, 'manajerial-sosio-kultural', 'teknis', 'Bentuk konflik yang positif dalam organisasi yang dapat memicu inovasi disebut...', '{"A":"Konflik disfungsional","B":"Konflik fungsional (konstruktif)","C":"Konflik afektif","D":"Konflik destruktif","E":"Konflik laten"}'::jsonb, 'B', 'Konflik fungsional/konstruktif memicu inovasi dan perbaikan; konflik disfungsional justru merusak.')
on conflict (id) do nothing;

insert into public.tryout_questions (id, kategori_id, section, pertanyaan, opsi, jawaban, pembahasan)
values
  (101, 'manajerial-sosio-kultural', 'man-soskul', 'Tahapan dalam proses manajemen konflik yang pertama adalah...', '{"A":"Menghindari konflik","B":"Mengidentifikasi dan memahami sumber konflik","C":"Mediasi pihak ketiga","D":"Apersepsi konflik","E":"Komunikasi terbuka"}'::jsonb, 'B', 'Manajemen konflik dimulai dengan mengidentifikasi dan memahami sumber/akar konflik sebelum intervensi.'),
  (102, 'manajerial-sosio-kultural', 'man-soskul', 'Sikap menghargai pendapat orang lain dalam diskusi tim mencerminkan nilai...', '{"A":"Loyalitas","B":"Harmonis","C":"Akuntabel","D":"Kompeten","E":"Adaptif"}'::jsonb, 'B', 'Harmonis = saling menghargai perbedaan dan bekerja sama untuk kepentingan bersama.'),
  (103, 'manajerial-sosio-kultural', 'man-soskul', 'Dalam prinsip Public Service yang dianut ASN,orientasi pelayanan publik menekankan pada...', '{"A":"Kecepatan pelayanan tanpa memperhatikan kualitas","B":"Pemenuhan kebutuhan masyarakat dengan kualitas dan integritas","C":"Penyelesaian administrasi sebelum kebutuhan masyarakat","D":"Volume pelayanan yang tinggi","E":"Penghematan biaya pelayanan"}'::jsonb, 'B', 'Berorientasi Pelayanan = memenuhi kebutuhan masyarakat dengan kualitas terbaik dan integritas.'),
  (104, 'manajerial-sosio-kultural', 'man-soskul', 'Prinsip tahapan pengambilan keputusan berdasarkan data dikenal dengan...', '{"A":"Top-down decision making","B":"Data-driven decision making","C":"Intuitive decision making","D":"Random decision making","E":"Consensus decision making"}'::jsonb, 'B', 'Data-driven decision making: keputusan berbasis data dan analisis bukan asumsi atau intuisi semata.'),
  (105, 'manajerial-sosio-kultural', 'man-soskul', 'Teori motivasi yang membagi faktor motivasi menjadi', '{"A":"Abraham Maslow","B":"Frederick Herzberg","C":"David McClelland","D":"Douglas McGregor","E":"Clayton Alderfer"}'::jsonb, 'B', 'Herzberg Two-Factor Theory: hygiene factors (gaji, lingkungan) mencegah ketidakpuasan; motivators (prestasi, pengakuan) memotivasi.'),
  (106, 'manajerial-sosio-kultural', 'man-soskul', 'Konsep', '{"A":"ASN sebagai warga negara biasa","B":"Kepercayaan publik yang harus dijaga dengan integritas dan akuntabilitas","C":"Hak ASN atas imbalan jasa","D":"Hubungan ASN dengan atasan langsung","E":"Kewajiban ASN membayar pajak"}'::jsonb, 'B', 'Public Trust = kepercayaan masyarakat kepada ASN yang harus dijaga melalui integritas dan akuntabilitas.'),
  (107, 'manajerial-sosio-kultural', 'man-soskul', 'Sikap', '{"A":"Pelaporan pelanggaran etika dan hukum oleh ASN","B":"Penolakan tugas dari atasan","C":"Pengunduran diri ASN","D":"Penonaktifan ASN","E":"Protes atas kebijakan"}'::jsonb, 'A', 'Whistleblowing: melaporkan pelanggaran etika/hukum yang merugikan negara — bagian dari Akuntabilitas.'),
  (108, 'manajerial-sosio-kultural', 'man-soskul', 'Sistem merit dalam pengelolaan ASN mengutamakan...', '{"A":"Senioritas dalam promosi","B":"Kinerja dan kompetensi sebagai dasar promosi dan pengembangan karier","C":"Koneksi politik","D":"Asal daerah pegawai","E":"Jenis kelamin"}'::jsonb, 'B', 'Sistem merit: pengelolaan ASN berdasarkan kualifikasi, kinerja, dan kompetensi, bukan karena suka-relasi.'),
  (109, 'manajerial-sosio-kultural', 'man-soskul', 'Dalam prinsip Good Governance, transparansi berarti...', '{"A":"Membuka seluruh data rahasia negara","B":"Memberikan akses informasi yang relevan kepada publik sesuai ketentuan","C":"Mengumumkan gaji seluruh pegawai","D":"Membuka rapat internal ke publik","E":"Membocorkan dokumen internal"}'::jsonb, 'B', 'Transparansi = memberi akses informasi yang relevan dan tidak rahasia kepada publik sesuai UU KIP.'),
  (110, 'manajerial-sosio-kultural', 'man-soskul', 'Prinsip delegasi wewenang yang efektif mensyaratkan...', '{"A":"Pendelegasian tanpa pengawasan","B":"Pendelegasian disertai kejelasan tugas, wewenang, dan akuntabilitas","C":"Pendelegasian hanya pada tugas yang sulit","D":"Pendelegasian tugas tanpa batas waktu","E":"Tidak boleh mendelegasikan sama sekali"}'::jsonb, 'B', 'Delegasi efektif: tegas pada apa, kepada siapa, wewenang apa, batas waktu, dan mekanisme akuntabilitas.'),
  (111, 'manajerial-sosio-kultural', 'man-soskul', 'Konsep', '{"A":"Memperbanyak jumlah pegawai","B":"Menghilangkan pemborosan (waste) dan meningkatkan value bagi pelanggan","C":"Memotong gaji pegawai","D":"Memperbanyak laporan administratif","E":"Mengurangi jam kerja"}'::jsonb, 'B', 'Lean Management: menghilangkan waste (overproduction, waiting, defects, dll) untuk memberi value maksimal.'),
  (112, 'manajerial-sosio-kultural', 'man-soskul', 'Sikap kolaboratif antar instansi pemerintah terutama diperlukan dalam...', '{"A":"Pengisian absensi harian","B":"Penanganan bencana, kesehatan masyarakat, dan isu lintas-sektor","C":"Pembuatan laporan bulanan","D":"Penataan ruang kantor","E":"Pemilihan panitia internal"}'::jsonb, 'B', 'Isu lintas-sektor seperti bencana, KLB, stunting, dll. memerlukan kolaborasi multi-instansi (BNPB, Kemenkes, dll.).'),
  (113, 'manajerial-sosio-kultural', 'man-soskul', 'Fungsi Control (pengawasan) dalam manajemen klasik dilakukan dengan cara...', '{"A":"Mengatur kembali struktur organisasi","B":"Membandingkan realisasi dengan rencana dan melakukan koreksi","C":"Mempekerjakan lebih banyak pegawai","D":"Memberi pelatihan ulang","E":"Mengganti pemimpin"}'::jsonb, 'B', 'Controlling: membandingkan hasil dengan target/sasaran, menganalisis variansi, dan mengambil tindakan korektif.'),
  (114, 'manajerial-sosio-kultural', 'man-soskul', 'Pemberian pelatihan dan pengembangan kompetensi pegawai merupakan investasi pada...', '{"A":"Modal manusia (human capital)","B":"Teknologi informasi","C":"Fisik bangunan","D":"Perlengkapan kantor","E":"Sarana transportasi"}'::jsonb, 'A', 'Pengembangan SDM = investasi pada human capital untuk meningkatkan kapabilitas jangka panjang.'),
  (115, 'manajerial-sosio-kultural', 'man-soskul', 'Sikap kerja yang mencerminkan nilai Loyalitas pada ASN BerAKHLAK adalah...', '{"A":"Mengikuti perintah walaupun salah","B":"Berdedikasi pada negara, bangsa, dan pemerintahan yang sah","C":"Membela atasan apapun yang terjadi","D":"Tidak pernah mengkritik kebijakan","E":"Mengikuti kebijakan partai"}'::jsonb, 'B', 'Loyalitas ASN = berdedikasi pada NKRI, Pancasila, UUD 1945, dan pemerintahan sah — bukan loyalitas buta pada personel.'),
  (116, 'manajerial-sosio-kultural', 'man-soskul', 'Salah satu pilar Open Government Partnership (OGP) adalah...', '{"A":"Transparansi, partisipasi publik, akuntabilitas, inovasi teknologi","B":"Penertiban birokrasi","C":"Privasi data pejabat","D":"Pengawasan internal","E":"Pemberian bonus pegawai"}'::jsonb, 'A', 'Pilar OGP: transparansi, partisipasi masyarakat, akuntabilitas, dan inovasi teknologi untuk tata kelola yang terbuka.'),
  (117, 'manajerial-sosio-kultural', 'man-soskul', 'Komitmen ASN pada etika publik tercermin dalam tindakan...', '{"A":"Menerima gratifikasi dalam bentuk apapun","B":"Menolak gratifikasi dan melaporkannya ke KPK","C":"Mengikuti kebiasaan setempat","D":"Meminta imbalan informal untuk pelayanan","E":"Memanfaatkan jabatan untuk kepentingan pribadi"}'::jsonb, 'B', 'ASN wajib menolak gratifikasi dan melaporkannya ke KPK atau UU Tipikor berlaku.'),
  (118, 'manajerial-sosio-kultural', 'man-soskul', 'Dalam teori kepemimpinan transformasional, 4 komponen utamanya adalah...', '{"A":"Idealized influence, inspirational motivation, intellectual stimulation, individualized consideration","B":"Command, control, comply, conform","C":"Reward, punishment, supervision, evaluation","D":"Order, dictate, manage, control","E":"Coordinate, delegate, supervise, evaluate"}'::jsonb, 'A', 'Kepemimpinan transformasional (Bass): 4I — Idealized Influence, Inspirational Motivation, Intellectual Stimulation, Individualized Consideration.'),
  (119, 'manajerial-sosio-kultural', 'man-soskul', 'Manajemen risiko di fasilitas kesehatan mencakup tahapan...', '{"A":"Identifikasi → Analisis → Evaluasi → Mitigasi → Monitoring","B":"Perencanaan → Pelaksanaan → Evaluasi","C":"Identifikasi → Pengobatan → Pemulihan","D":"Survei → Pengawasan → Pelaporan","E":"Audit → Investigasi → Tuntutan"}'::jsonb, 'A', 'Siklus manajemen risiko: identifikasi → analisis → evaluasi → mitigasi → monitoring dan review.'),
  (120, 'manajerial-sosio-kultural', 'man-soskul', 'Dalam budaya organisasi yang sehat, dimensi yang menonjol meliputi...', '{"A":"Hierarki kaku, ikut-ikutan, takut salah","B":"Inovasi, perhatian pada detail, orientasi hasil, kerja tim, integritas","C":"Persaingan internal, ego sektoral","D":"Patuh pada senior tanpa pertimbangan","E":"Kesejahteraan individu di atas organisasi"}'::jsonb, 'B', 'Budaya organisasi sehat: inovasi, perhatian detail, orientasi hasil, kerja tim, dan integritas (OCAI framework).'),
  (121, 'manajerial-sosio-kultural', 'man-soskul', 'Konsep ZBB (Zero-Based Budgeting) dalam perencanaan anggaran pemerintah berarti...', '{"A":"Anggaran dimulai dari nol setiap tahun tanpa mengacu tahun sebelumnya","B":"Anggaran ditambah 10% dari tahun lalu","C":"Anggaran dipangkas 50%","D":"Tidak ada anggaran untuk pos baru","E":"Mengikuti inflasi tahunan"}'::jsonb, 'A', 'Zero-Based Budgeting: setiap pos anggaran harus dipertanggungjawabkan dari nol, bukan increment dari tahun lalu.'),
  (122, 'manajerial-sosio-kultural', 'man-soskul', 'Tahapan dalam PDCA (Deming Cycle) untuk peningkatan mutu adalah...', '{"A":"Plan, Do, Check, Act","B":"Predict, Direct, Compare, Achieve","C":"Prepare, Deliver, Coordinate, Audit","D":"Plan, Document, Coordinate, Approve","E":"Project, Do, Calculate, Approve"}'::jsonb, 'A', 'PDCA: Plan (perencanaan), Do (pelaksanaan), Check (verifikasi), Act (tindakan korektif) untuk continuous improvement.'),
  (123, 'manajerial-sosio-kultural', 'man-soskul', 'Konsep Kaizen dalam manajemen mutu berasal dari...', '{"A":"Cina","B":"Jepang","C":"Korea Selatan","D":"Amerika Serikat","E":"Jerman"}'::jsonb, 'B', 'Kaizen (改善) adalah filosofi perbaikan berkelanjutan yang berasal dari Jepang, dipopulerkan Toyota Production System.'),
  (124, 'manajerial-sosio-kultural', 'man-soskul', 'Sikap profesional ASN yang berorientasi pelayanan tercermin dari...', '{"A":"Menunda pelayanan untuk istirahat","B":"Memberikan pelayanan prima tanpa diskriminasi","C":"Membatasi jam pelayanan","D":"Menerima suap untuk mempercepat layanan","E":"Memberikan prioritas pada relasi dekat"}'::jsonb, 'B', 'Berorientasi Pelayanan: memberikan layanan prima tanpa diskriminasi kepada semua warga negara.'),
  (125, 'manajerial-sosio-kultural', 'man-soskul', 'Sistem akuntabilitas kinerja di instansi pemerintah mengacu pada...', '{"A":"LAKIP (Laporan Akuntabilitas Kinerja Instansi Pemerintah)","B":"Laporan keuangan tahunan","C":"Laporan kegiatan bulanan","D":"Absensi pegawai","E":"Notulen rapat"}'::jsonb, 'A', 'LAKIP = laporan akuntabilitas kinerja instansi pemerintah, dasar evaluasi kinerja berbasis Inpres 7/1999.')
on conflict (id) do nothing;

insert into public.tryout_questions (id, kategori_id, section, pertanyaan, opsi, jawaban, pembahasan)
values
  (126, 'manajerial-sosio-kultural', 'man-soskul', 'Untuk menilai kepuasan masyarakat atas pelayanan publik digunakan instrumen...', '{"A":"SKM (Survei Kepuasan Masyarakat)","B":"Audit finansial BPK","C":"Laporan bulanan","D":"Evaluasi internal","E":"Penilaian atasan"}'::jsonb, 'A', 'SKM (Survei Kepuasan Masyarakat) diatur dalam Permenpan-RB untuk mengukur kepuasan atas pelayanan publik.'),
  (127, 'manajerial-sosio-kultural', 'man-soskul', 'Tanda dari', '{"A":"Memegang jabatan tinggi tanpa syarat pendidikan","B":"Meningkatkan dan memelihara kompetensinya secara berkelanjutan","C":"Mengandalkan pengalaman lama","D":"Tidak mengikuti pelatihan","E":"Mengandalkan rekomendasi atasan"}'::jsonb, 'B', 'Kompeten = terus meningkatkan dan memelihara kompetensi melalui pelatihan dan pengembangan diri.'),
  (128, 'manajerial-sosio-kultural', 'man-soskul', 'Prinsip utama dalam penyelenggaraan Public Service Mall (MPP) adalah...', '{"A":"Pemusatan pelayanan publik dari berbagai instansi dalam satu tempat","B":"Pemindahan ASN ke pusat kota","C":"Penambahan birokrasi","D":"Pembuatan gedung baru","E":"Penghapusan pelayanan online"}'::jsonb, 'A', 'MPP = Mal Pelayanan Publik: mengintegrasikan pelayanan berbagai instansi dalam satu lokasi untuk efisiensi.'),
  (129, 'manajerial-sosio-kultural', 'man-soskul', 'Dalam teori ADKAR untuk manajemen perubahan,', '{"A":"Resistance","B":"Reinforcement","C":"Reasoning","D":"Restructuring","E":"Reporting"}'::jsonb, 'B', 'ADKAR (Prosci): Awareness, Desire, Knowledge, Ability, Reinforcement — model perubahan individual.'),
  (130, 'manajerial-sosio-kultural', 'man-soskul', 'Pendekatan', '{"A":"Kebutuhan dan kepuasan masyarakat sebagai pelanggan","B":"Kepuasan pegawai","C":"Volume dokumen yang dihasilkan","D":"Kepuasan atasan","E":"Jumlah anggaran terserap"}'::jsonb, 'A', 'Customer-centric = masyarakat sebagai pelanggan utama; layanan dirancang berbasis kebutuhan mereka.'),
  (131, 'manajerial-sosio-kultural', 'man-soskul', 'Salah satu prinsip dalam Code of Conduct ASN Indonesia adalah...', '{"A":"Mementingkan kelompok/golongan sendiri","B":"Menjunjung tinggi kejujuran, integritas, dan profesionalitas","C":"Mengutamakan kedekatan dengan pejabat","D":"Mengabaikan prosedur bila menguntungkan","E":"Menolak inovasi"}'::jsonb, 'B', 'Code of Conduct ASN menekankan kejujuran, integritas, dan profesionalitas dalam pelayanan publik.'),
  (132, 'manajerial-sosio-kultural', 'man-soskul', 'Sikap', '{"A":"Menolak teknologi baru","B":"Memanfaatkan digital untuk pelayanan yang lebih cepat dan akurat","C":"Mengandalkan kertas sepenuhnya","D":"Membatasi jam online pelayanan","E":"Membiarkan masyarakat antri"}'::jsonb, 'B', 'Era digital: ASN harus memanfaatkan teknologi untuk mempercepat dan meningkatkan akurasi pelayanan publik.'),
  (133, 'manajerial-sosio-kultural', 'man-soskul', 'Tujuan utama reformasi birokrasi di Indonesia adalah...', '{"A":"Memperbanyak jumlah pegawai","B":"Mewujudkan tata kelola pemerintahan yang bersih, efektif, dan responsif","C":"Mengganti seluruh ASN","D":"Memperbanyak aturan administratif","E":"Mengurangi pelayanan publik"}'::jsonb, 'B', 'Reformasi Birokrasi: bersih, efektif, transparan, akuntabel, dan responsif terhadap kebutuhan publik.'),
  (134, 'manajerial-sosio-kultural', 'man-soskul', 'Dalam situasi krisis/kedaruratan, ASN menunjukkan kompetensi kepemimpinan dengan...', '{"A":"Menunggu instruksi atasan","B":"Mengambil keputusan cepat berbasis data untuk keselamatan publik","C":"Menghindari tanggung jawab","D":"Menyerahkan ke pihak swasta","E":"Mengunci diri di kantor"}'::jsonb, 'B', 'Dalam krisis, ASN dengan kompetensi kepemimpinan mengambil keputusan cepat berbasis data demi keselamatan publik.'),
  (135, 'manajerial-sosio-kultural', 'man-soskul', 'Sikap antisipatif terhadap perubahan kebijakan tercermin pada...', '{"A":"Menolak kebijakan baru","B":"Mempelajari, beradaptasi, dan menyesuaikan diri dengan kebijakan baru","C":"Menunda pelaksanaan selama mungkin","D":"Mengabaikan instruksi atasan","E":"Mengkritik tanpa solusi"}'::jsonb, 'B', 'Adaptif: cepat mempelajari, memahami, dan menyesuaikan diri dengan kebijakan baru untuk pelayanan optimal.'),
  (136, 'manajerial-sosio-kultural', 'man-soskul', 'Salah satu pilar menuju Smart ASN adalah Smart Talent. Hal ini berkaitan dengan...', '{"A":"Pengembangan kapasitas pegawai berbasis kompetensi dan kinerja","B":"Pengadaan perangkat IT","C":"Pembangunan gedung baru","D":"Penambahan remunerasi","E":"Penambahan jumlah pegawai"}'::jsonb, 'A', 'Smart Talent: sistem pengembangan SDM berbasis kompetensi, kinerja, dan jenjang karier yang objektif.'),
  (137, 'manajerial-sosio-kultural', 'man-soskul', 'Aspek', '{"A":"Hanya melayani kelompok mayoritas","B":"Melayani semua kelompok termasuk penyandang disabilitas dan kelompok rentan","C":"Mengutamakan pejabat","D":"Mengutamakan warga lokal","E":"Mengutamakan yang mampu membayar"}'::jsonb, 'B', 'Inklusivitas: pelayanan harus dapat diakses semua kelompok termasuk disabilitas, lansia, ibu hamil, dan kelompok rentan.'),
  (138, 'manajerial-sosio-kultural', 'man-soskul', 'Dalam model kompetensi ASN,', '{"A":"Kemampuan komunikasi","B":"Pengetahuan teknis sesuai bidang tugas (mis. klinis, farmakologi)","C":"Kepemimpinan","D":"Kerja tim","E":"Integritas"}'::jsonb, 'B', 'Technical competencies: keterampilan teknis spesifik bidang (mis. kompetensi klinis bagi tenaga kesehatan).'),
  (139, 'manajerial-sosio-kultural', 'man-soskul', 'Komitmen terhadap etika publik ditunjukkan dengan tindakan berikut, KECUALI...', '{"A":"Mengelola konflik kepentingan","B":"Menjaga kerahasiaan informasi rahasia","C":"Menerima hadiah dari rekanan sebagai tanda terima kasih","D":"Menolak gratifikasi","E":"Bertindak adil dan tidak diskriminatif"}'::jsonb, 'C', 'Menerima hadiah dari rekanan = gratifikasi yang dilarang dan harus dilaporkan. Pelanggaran etika publik.'),
  (140, 'manajerial-sosio-kultural', 'man-soskul', 'Dalam model Stakeholder Analysis, kelompok dengan', '{"A":"Dimonitor saja","B":"Dikelola secara ketat (Manage closely)","C":"Diberi informasi secukupnya","D":"Dikejarkan","E":"Ditampilkan secara pasif"}'::jsonb, 'B', 'Pada Power-Interest Grid: high power + high interest = Manage closely (pemangku kepentingan utama).'),
  (141, 'manajerial-sosio-kultural', 'man-soskul', 'Konsep', '{"A":"Pemimpin yang dilayani bawahan","B":"Pemimpin yang melayani dan memberdayakan bawahan","C":"Pemimpin yang otoriter","D":"Pemimpin yang pasif","E":"Pemimpin yang mengejar prestasi pribadi"}'::jsonb, 'B', 'Servant Leadership (Greenleaf): pemimpin ada untuk melayani dan memberdayakan bawahan, bukan sebaliknya.'),
  (142, 'manajerial-sosio-kultural', 'man-soskul', 'Untuk membangun budaya kerja yang adaptif dan inovatif, ASN perlu...', '{"A":"Menjaga status quo","B":"Mendorong eksperimentasi, pembelajaran, dan pemberdayaan tim","C":"Mengabaikan masukan bawahan","D":"Menekan inovasi agar tidak terlalu berisiko","E":"Mengikuti pola lama"}'::jsonb, 'B', 'Budaya adaptif-inovatif: mendorong eksperimen, learning dari kegagalan, dan pemberdayaan tim.'),
  (143, 'manajerial-sosio-kultural', 'man-soskul', 'Sistem penilaian kinerja ASN modern menggunakan...', '{"A":"Daftar hadir harian saja","B":"Sasaran Kinerja Pegawai (SKP) + Perilaku Kerja","C":"Penilaian subjektif atasan","D":"Voting rekan kerja","E":"Tes tertulis tahunan"}'::jsonb, 'B', 'SKP (Sasaran Kinerja Pegawai) + Perilaku Kerja adalah dasar penilaian kinerja ASN sesuai PP 30 Tahun 2019.'),
  (144, 'manajerial-sosio-kultural', 'man-soskul', 'Prinsip etika', '{"A":"Distribusi obat ke pasien","B":"Pembagian beban dan manfaat yang adil di masyarakat","C":"Penyusunan jadwal dinas","D":"Distribusi gaji ASN","E":"Distribusi tugas harian"}'::jsonb, 'B', 'Distributive Justice: pembagian beban, manfaat, dan sumber daya secara adil di masyarakat.'),
  (145, 'manajerial-sosio-kultural', 'man-soskul', 'Tanda ASN yang Adaptif dalam menghadapi era digitalisasi...', '{"A":"Tetap menggunakan kertas dan manual","B":"Aktif belajar teknologi digital dan mengintegrasikannya dalam pelayanan","C":"Menolak sistem online","D":"Membiarkan generasi muda yang menangani IT","E":"Mengganti semua sistem lama dengan drastis"}'::jsonb, 'B', 'ASN adaptif: aktif belajar teknologi digital dan mengintegrasikannya secara bertahap untuk pelayanan yang lebih baik.'),
  (146, 'manajerial-sosio-kultural', 'man-soskul', 'Tujuan utama penerapan standar pelayanan publik (SPP) adalah...', '{"A":"Menyulitkan masyarakat dengan aturan teknis","B":"Menjamin kualitas, ketersediaan, dan kepastian pelayanan kepada masyarakat","C":"Menambah jumlah pegawai","D":"Memperbanyak dokumen administratif","E":"Mengurangi biaya pelayanan"}'::jsonb, 'B', 'SPP menjamin kualitas, ketersediaan, dan kepastian pelayanan publik sesuai standar yang ditetapkan.'),
  (147, 'manajerial-sosio-kultural', 'man-soskul', 'Pengembangan budaya etika di lingkungan ASN diawali oleh...', '{"A":"Atasan sebagai role model dengan menerapkan integritas","B":"Penalti bagi pelanggar berat","C":"Sosialisasi tertulis tanpa contoh","D":"Audit eksternal tahunan","E":"Pembentukan tim khusus"}'::jsonb, 'A', 'Budaya etika dimulai dari'),
  (148, 'manajerial-sosio-kultural', 'man-soskul', 'Untuk mengukur efektivitas suatu program pelayanan publik digunakan indikator...', '{"A":"Output (jumlah kegiatan) saja","B":"Input, output, outcome, dan benefit secara berurutan","C":"Hanya anggaran terserap","D":"Jumlah pegawai yang terlibat","E":"Lama pelaksanaan"}'::jsonb, 'B', 'Indikator kinerja: Input → Output → Outcome → Benefit untuk mengukur efektivitas program.'),
  (149, 'manajerial-sosio-kultural', 'man-soskul', 'Konsep', '{"A":"Produksi bersama antar instansi pemerintah","B":"Keterlibatan aktif masyarakat dalam produksi pelayanan publik","C":"Kerja sama dengan swasta dalam kontrak","D":"Pengalihan layanan ke swasta","E":"Penggabungan beberapa instansi"}'::jsonb, 'B', 'Co-production: keterlibatan aktif masyarakat/sukarelawan dalam merancang dan menyelenggarakan pelayanan publik.'),
  (150, 'manajerial-sosio-kultural', 'man-soskul', 'Tiga aspek utama yang harus dijaga ASN dalam menjalankan tugas di era digital adalah...', '{"A":"Gaji, jabatan, dan fasilitas","B":"Integritas, kompetensi, dan kolaborasi lintas sektor","C":"Senioritas, loyalitas, dan disiplin","D":"Koneksi, pengalaman, dan keberuntungan","E":"Jabatan, kekuasaan, dan pengaruh"}'::jsonb, 'B', 'Era digital menuntut ASN menjaga integritas, terus meningkatkan kompetensi, dan kolaborasi lintas sektor.')
on conflict (id) do nothing;

-- ============================================================================
-- SELESAI. Catatan:
-- 1. Tabel lama TIDAK disentuh sama sekali (additive-only).
-- 2. Halaman tryoutukom.html otomatis memuat soal dari tryout_questions
--    (fallback: soal bawaan HTML bila database kosong / offline).
-- 3. Hasil try out peserta tersimpan otomatis ke tryout_attempts.
-- 4. Monitor cepat: SELECT * FROM public.v_tryout_stats;
-- ============================================================================
