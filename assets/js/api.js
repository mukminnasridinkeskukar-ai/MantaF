/* ============================================================
   MANTAF v2 — API.JS
   Lapisan akses data Supabase (pengganti Google Apps Script)
   ============================================================ */

let db = null;

(function initSupabase(){
  try{
    if(typeof supabase === 'undefined'){
      console.error('Supabase JS belum termuat (CDN diblokir?)');
      return;
    }
    if(SUPABASE_CONFIG.url.includes('SUPABASE-PROJECT-URL') || SUPABASE_CONFIG.anonKey.includes('SUPABASE_ANON')){
      console.warn('⚠️ Konfigurasi Supabase belum diisi! Edit assets/js/config.js');
      return;
    }
    db = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }catch(e){
    console.error('Gagal inisialisasi Supabase:', e);
  }
})();

/* Helper pembungkus error supaya pesan konsisten */
async function sbQuery(promise){
  const { data, error } = await promise;
  if(error) throw new Error(error.message);
  return data;
}

const API = {

  /* ================= PENGUMUMAN ================= */
  getPengumuman: (onlyActive = true) => {
    let q = db.from('pengumuman').select('*').order('tanggal', { ascending:false }).order('created_at', { ascending:false });
    if(onlyActive) q = q.eq('aktif', true);
    return sbQuery(q);
  },

  createPengumuman: (row) => sbQuery(db.from('pengumuman').insert(row).select()),
  updatePengumuman: (id, row) => sbQuery(db.from('pengumuman').update(row).eq('id', id).select()),
  deletePengumuman: (id) => sbQuery(db.from('pengumuman').delete().eq('id', id)),

  /* ================= BEZETTING ================= */
  getBezetting: () => sbQuery(
    db.from('bezetting').select('*')
      .order('instansi', { ascending:true })
      .order('jenis_jabatan', { ascending:true })
  ),

  createBezetting: (row) => sbQuery(db.from('bezetting').insert(row).select()),
  updateBezetting: (id, row) => sbQuery(db.from('bezetting').update(row).eq('id', id).select()),
  deleteBezetting: (id) => sbQuery(db.from('bezetting').delete().eq('id', id)),

  /* ================= PESERTA UKOM ================= */
  getPesertaUkom: () => sbQuery(
    db.from('peserta_ukom').select('*').order('created_at', { ascending:false })
  ),

  getPesertaByKeyword: (keyword) => sbQuery(
    db.from('peserta_ukom').select('*').or('nik.eq.' + keyword + ',nip.eq.' + keyword).limit(1)
  ),

  createPeserta: (row) => sbQuery(db.from('peserta_ukom').insert(row).select()),
  updatePeserta: (id, row) => sbQuery(db.from('peserta_ukom').update(row).eq('id', id).select()),
  deletePeserta: (id) => sbQuery(db.from('peserta_ukom').delete().eq('id', id)),

  updateStatusVerifikasi: (id, status, catatan) => sbQuery(
    db.from('peserta_ukom')
      .update({ status_verifikasi: status, catatan_admin: catatan || '' })
      .eq('id', id)
      .select()
  ),

  /* ================= PETUNJUK PENGGUNAAN (kartu PDF) ================= */
  getPetunjuk: (onlyActive = true) => {
    let q = db.from('petunjuk').select('*')
      .order('urutan', { ascending:true })
      .order('created_at', { ascending:false });
    if(onlyActive) q = q.eq('aktif', true);
    return sbQuery(q);
  },

  createPetunjuk: (row) => sbQuery(db.from('petunjuk').insert(row).select()),
  updatePetunjuk: (id, row) => sbQuery(db.from('petunjuk').update(row).eq('id', id).select()),
  deletePetunjuk: (id) => sbQuery(db.from('petunjuk').delete().eq('id', id)),
  /* hapus file PDF dari bucket storage petunjuk berdasarkan URL public */
  async deletePetunjukFile(fileUrl){
    if(!fileUrl) return;
    try{
      const marker = '/storage/v1/object/public/' + SUPABASE_CONFIG.buckets.petunjuk + '/';
      const idx = fileUrl.indexOf(marker);
      if(idx === -1) return; /* URL bukan dari bucket petunjuk — biarkan */
      const path = fileUrl.substring(idx + marker.length).split('?')[0];
      if(path) await db.storage.from(SUPABASE_CONFIG.buckets.petunjuk).remove([path]);
    }catch(e){ /* penghapusan file gagal — abaikan, baris tetap terhapus */ }
  },

  /* ================= STATISTIK DASHBOARD ================= */
  async getDashboardStats(){
    const [peserta, bezetting] = await Promise.all([
      sbQuery(db.from('peserta_ukom').select('nama_unit_kerja')),
      sbQuery(db.from('bezetting').select('lowongan'))
    ]);
    const instansi = new Set(peserta.map(r => r.nama_unit_kerja).filter(Boolean));
    const lowongan = bezetting.reduce((s, r) => s + (parseInt(r.lowongan, 10) || 0), 0);
    return { totalPeserta: peserta.length, totalInstansi: instansi.size, totalLowongan: lowongan };
  },

  /* ================= AUTH ADMIN ================= */
  async adminLogin(username, password){
    const data = await sbQuery(db.rpc('admin_login', { p_username: username, p_password: password }));
    return (data && data.length) ? data[0] : null;
  },

  adminChangePassword: (username, oldPass, newPass) => sbQuery(
    db.rpc('admin_change_password', { p_username: username, p_password_lama: oldPass, p_password_baru: newPass })
  ),

  /* ================= BULK (IMPORT CSV MASSAL) ================= */
  bulkInsert: (table, rows) => sbQuery(db.from(table).insert(rows).select()),
  bulkUpdate: (table, id, row) => sbQuery(db.from(table).update(row).eq('id', id).select()),
  /* hapus semua baris: neq id yang mustahil ada = delete all */
  truncateTable: (table) => sbQuery(db.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')),

  /* ================= STORAGE ================= */
  async uploadFile(bucket, file, folder){
    if(!file) return null;
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const safe = folder ? String(folder).replace(/[^0-9a-zA-Z_-]/g, '') : 'anon';
    const path = safe + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await db.storage.from(bucket).upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream'
    });
    if(error) throw new Error('Upload gagal (' + file.name + '): ' + error.message);
    return buildPublicUrl(bucket, path);
  }
};
