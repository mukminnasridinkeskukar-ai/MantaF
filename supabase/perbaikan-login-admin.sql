-- ============================================================================
-- MANTAF v2 — PERBAIKAN LOGIN ADMIN (VERSI PASTI BERHASIL)
-- ============================================================================
-- Cara pakai (hanya 2 langkah):
--   1. Buka Supabase Dashboard > SQL Editor, klik New query
--   2. SALIN SEMUA isi file ini sekaligus, lalu RUN.
--      Sebelum RUN, boleh ubah password baru di baris bertanda
--      >>> UBAH DI SINI <<< (default password baru: admin123)
--   3. Selesai. Login di panel admin dengan:
--         username : admin
--         password : admin123   (atau password yang Anda tulis di langkah 2)
--
-- Apa yang dilakukan script ini:
--   A. Mengganti fungsi admin_login menjadi versi yang lebih toleran:
--      - tetap menerima hash bcrypt (cara yang benar), DAN
--      - menerima password teks biasa yang tersisa dari editan Table Editor
--        (inilah penyebab login gagal terus), lalu otomatis meng-upgrade-nya
--        menjadi hash bcrypt yang aman pada login pertama yang berhasil.
--   B. Mereset password akun "admin" sesuai nilai di >>> UBAH DI SINI <<<.
--   C. Memverifikasi: query terakhir HARUS menampilkan 1 baris berisi
--      username "admin". Kalau 1 baris muncul, login di aplikasi pasti berhasil.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- A. FUNGSI LOGIN VERSI TOLERAN (bcrypt ATAU teks biasa + auto-upgrade)
--    Catatan teknis: semua kolom ditulis lengkap (admin_users.xxx) agar tidak
--    bentrok dengan nama variabel keluaran fungsi; crypt() hanya dipanggil
--    untuk hash bcrypt (diawali $2) supaya tidak salah format.
-- ---------------------------------------------------------------------------
create or replace function public.admin_login(p_username text, p_password text)
returns table (id uuid, username text, nama text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row  public.admin_users;
  v_cocok boolean := false;
begin
  select admin_users.id, admin_users.username, admin_users.password_hash,
         admin_users.nama, admin_users.role, admin_users.aktif
    into v_row
  from public.admin_users
  where admin_users.username = p_username
    and admin_users.aktif = true
  limit 1;

  -- Username tidak ditemukan / akun nonaktif -> login gagal (hasil kosong)
  if v_row.id is null then
    return;
  end if;

  -- Tentukan cara mencocokkan sesuai format kolom password yang tersimpan
  if left(v_row.password_hash, 3) = '$2' then
    -- Format bcrypt yang benar
    v_cocok := (v_row.password_hash = crypt(p_password, v_row.password_hash));
  else
    -- Teks biasa (sisa editan Table Editor) -> bandingkan langsung
    v_cocok := (v_row.password_hash = p_password);
  end if;

  if v_cocok then
    -- Upgrade otomatis: teks biasa -> hash bcrypt agar aman ke depan
    if left(v_row.password_hash, 3) <> '$2' then
      update public.admin_users
      set password_hash = crypt(p_password, gen_salt('bf'))
      where admin_users.id = v_row.id;
    end if;

    return query select v_row.id, v_row.username, v_row.nama, v_row.role;
  end if;

  -- Password tidak cocok -> hasil kosong (tanpa error)
  return;
end;
$$;


-- ---------------------------------------------------------------------------
-- B. FUNGSI GANTI PASSWORD — logika perbandingan yang sama dengan di atas
--    agar tombol "Ganti Password" di panel admin juga tidak macet.
-- ---------------------------------------------------------------------------
create or replace function public.admin_change_password(p_username text, p_password_lama text, p_password_baru text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row  public.admin_users;
  v_cocok boolean := false;
begin
  if p_password_baru is null or length(trim(p_password_baru)) < 6 then
    return false;
  end if;

  select admin_users.id, admin_users.username, admin_users.password_hash,
         admin_users.nama, admin_users.role, admin_users.aktif
    into v_row
  from public.admin_users
  where admin_users.username = p_username
    and admin_users.aktif = true
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
    set password_hash = crypt(p_password_baru, gen_salt('bf'))
    where admin_users.id = v_row.id;
    return true;
  end if;

  return false;
end;
$$;

-- Pastikan izin eksekusi tetap ada untuk klien anonim
grant execute on function public.admin_login(p_username text, p_password text) to anon, authenticated;
grant execute on function public.admin_change_password(p_username text, p_password_lama text, p_password_baru text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- C. RESET PASSWORD AKUN ADMIN
-- ---------------------------------------------------------------------------
-- >>> UBAH DI SINI <<<  — ganti 'admin123' (dua kata di baris bawah ini diubah
-- keduanya) dengan password pilihan Anda (minimal 6 karakter, tanpa tanda
-- kutip). Kalau tidak diubah, password menjadi: admin123
-- ---------------------------------------------------------------------------
update public.admin_users
set password_hash = crypt('admin123', gen_salt('bf')),
    aktif = true
where username = 'admin';

-- Bila akun "admin" belum ada sama sekali, buat otomatis:
insert into public.admin_users (username, password_hash, nama)
values ('admin', crypt('admin123', gen_salt('bf')), 'Administrator MantaF')
on conflict (username) do nothing;


-- ---------------------------------------------------------------------------
-- D. VERIFIKASI (dijalankan otomatis bersama script ini)
-- ---------------------------------------------------------------------------
-- WAJIB menghasilkan SATU baris: username = admin.
-- Satu baris muncul  = login di panel admin PASTI berhasil.
-- Kosong             = ulangi script dari atas (biasanya salah tempel).
-- ---------------------------------------------------------------------------
select id, username, nama, role
from public.admin_login('admin', 'admin123') as hasil_verifikasi;


-- ============================================================================
-- CATATAN:
-- 1. Setelah script ini berhasil, login dengan: admin / admin123
--    (atau password yang Anda tulis di bagian >>> UBAH DI SINI <<<).
-- 2. Bila halaman login masih menolak, tekan Ctrl+Shift+R (hard refresh)
--    agar browser memuat file terbaru, bukan versi cache.
-- 3. Setelah berhasil masuk, ganti password lewat tombol "Ganti Password"
--    di kanan atas Panel Admin — tidak perlu buka Supabase lagi.
-- 4. JANGAN mengubah kolom password lewat Table Editor dengan mengetik
--    password biasa. Sekarang login tetap bisa (fungsi baru meng-upgrade-nya
--    otomatis), tapi kebiasaan yang benar tetap lewat SQL / tombol Ganti Password.
-- ============================================================================
