/* ============================================================
   MANTAF v2 — CONFIG.JS
   Konfigurasi koneksi Supabase
   ============================================================
   CARA MENGISI:
   1. Buka https://supabase.com/dashboard → pilih project Anda
   2. Menu Settings → API
   3. Copy "Project URL"  → isi ke SUPABASE_URL
   4. Copy "anon public"  → isi ke SUPABASE_ANON_KEY
   ============================================================ */

const SUPABASE_CONFIG = {
  url: 'https://SUPABASE-PROJECT-URL.supabase.co',   // <-- GANTI dengan Project URL Anda
  anonKey: 'SUPABASE_ANON_PUBLIC_KEY',                // <-- GANTI dengan anon public key Anda

  // Bucket storage untuk upload berkas (dibuat oleh supabase/schema.sql)
  buckets: {
    foto: 'foto',
    dokumen: 'dokumen'
  },

  // Batas ukuran file upload (bytes) = 2 MB
  maxFileSize: 2 * 1024 * 1024,

  // Nama aplikasi (tampil pada beberapa tempat)
  appName: 'MantaF',
  appVersion: '2.0'
};
