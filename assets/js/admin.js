/* ============================================================
   MANTAF v2 — ADMIN.JS
   Panel admin: login + CRUD TOTAL data bagian ke-2 sidebar
   (Pengumuman, Bezetting, Peserta UKOM) + Petunjuk Penggunaan
   (upload PDF ke Supabase Storage bucket "petunjuk")
   ============================================================ */

let admPengCache = null;
let admBezCache = null;
let admPesCache = null;
let admPetCache = null;
let admAkunCache = null;
let admPesPage = 1;
const ADM_PES_PER_PAGE = 20;
let adminInited = false;

/* Avatar URL pengguna yang sedang login (di-mirror di memori agar topbar &
   modal Akun Saya bisa menampilkan tanpa fetch ulang). */
let _adminAvatarUrl = '';

/* ---------- HELPER HAK AKSES PER ROLE ----------
   - Admin        → full CRUD di semua tab
   - Operator     → full CRUD HANYA di Peserta UKOM
                    Pengumuman, Bezetting, Petunjuk → view-only (lihat saja) */
function _canManage(menu){
  /* menu: 'pengumuman' | 'bezetting' | 'peserta' | 'petunjuk' */
  if(isAdmin()) return true;
  if(isOperator() && menu === 'peserta') return true;
  return false;
}
function canManagePengumuman(){ return _canManage('pengumuman'); }
function canManageBezetting(){  return _canManage('bezetting'); }
function canManagePeserta(){    return _canManage('peserta'); }
function canManagePetunjuk(){   return _canManage('petunjuk'); }

SectionInit['admin'] = function(){
  if(adminInited) return;
  adminInited = true;
  document.getElementById('adminPass').addEventListener('keydown', function(e){
    if(e.key === 'Enter') loginAdmin();
  });
  const session = getAdminSession();
  if(session){
    /* PULIHKAN password verifikasi RPC dari sessionStorage (v2.2.1).
       Tanpa ini, setelah refresh halaman semua RPC (upload foto profil,
       Manajemen Akun, dll.) terkirim dengan password kosong → gagal. */
    try{ _adminRpcPass = sessionStorage.getItem('mantafRpcPass') || ''; }catch(e){ _adminRpcPass = ''; }
    showAdminPanel(session);
  }
};

/* ================= LOGIN / LOGOUT ================= */
async function loginAdmin(){
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }
  const user = sanitizeInput(document.getElementById('adminUser').value, 50);
  const pass = document.getElementById('adminPass').value;
  const resultEl = document.getElementById('adminResult');

  if(!user || !pass){ showToast('Isi username dan password', 'info'); return; }

  resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memeriksa...';
  try{
    const admin = await API.adminLogin(user, pass);
    if(admin){
      setAdminSession(admin);
      /* Simpan password di memori untuk verifikasi RPC manajemen akun.
         Hanya dipakai selama sesi aktif (hilang saat refresh/logout). */
      setAdminRpcPass(pass);
      resultEl.innerHTML = '';
      showToast('Selamat datang, ' + admin.nama + '!', 'success');
      showAdminPanel(admin);
    }else{
      resultEl.innerHTML = '<span style="color:#dc2626;font-size:13px"><i class="fas fa-circle-xmark"></i> Username atau password salah, atau akun terkunci. Silakan coba lagi.</span>';
      /* Detail teknis HANYA di console (F12), tidak tampil di layar login. */
      console.warn('[admin] Login gagal untuk username:', JSON.stringify(user));
    }
  }catch(err){
    console.error('[admin] Error login:', err);
    resultEl.innerHTML = '<span style="color:#dc2626;font-size:13px"><i class="fas fa-circle-xmark"></i> Username atau password salah, atau akun terkunci. Silakan coba lagi.</span>';
  }
}

function showAdminPanel(admin){
  document.getElementById('adminLoginSection').style.display = 'none';
  document.getElementById('adminDataSection').style.display = 'block';

  /* Atur badge & label sesuai role */
  var badge = document.getElementById('adminRoleBadge');
  if(badge){
    var role = (admin && admin.role) || 'admin';
    badge.textContent = role === 'operator' ? 'Operator' : 'Admin';
    badge.className = 'admin-role-badge ' + (role === 'operator' ? 'role-operator' : 'role-admin');
  }
  var who = document.getElementById('adminWho');
  if(who){
    who.querySelector('span').textContent =
      (admin && admin.nama ? admin.nama : 'Pengguna') +
      ' (' + (admin && admin.username ? admin.username : '') + ')';
  }
  /* Tab Manajemen Akun hanya untuk admin */
  var tabAkun = document.querySelector('.admin-tab-akun');
  if(tabAkun) tabAkun.style.display = (admin && admin.role === 'admin') ? '' : 'none';

  /* Terapkan hak akses per role: tombol Tambah & Import CSV disembunyikan
     untuk operator pada tab Pengumuman/Bezetting/Petunjuk (view-only). */
  applyRolePermissions();

  /* Refresh topbar (avatar/label) */
  if(typeof refreshTopbarAdmin === 'function') refreshTopbarAdmin();

  /* Fetch profil untuk dapat avatar_url terbaru (RPC admin_login tidak
     mengembalikan avatar_url, jadi kita fetch di sini). */
  if(admin && admin.username){
    API.adminGetMyProfile(admin.username).then(function(rows){
      var p = (rows && rows.length) ? rows[0] : null;
      if(p){
        _adminAvatarUrl = p.avatar_url || '';
        updateAdminSession({ avatar_url: _adminAvatarUrl });
        if(typeof refreshTopbarAdmin === 'function') refreshTopbarAdmin();
      }
    }).catch(function(){ /* abaikan — profil mungkin belum punya kolom avatar_url */ });
  }

  adminRefreshAll();
}

/* ---------- TERAPKAN HAK AKSES PER ROLE DI UI ----------
   Sembunyikan tombol "Tambah" & "Import CSV" untuk operator pada tab
   Pengumuman, Bezetting, Petunjuk. Tombol di-render statis di partials/admin.html;
   kita tandai elemen dengan atribut data-requires-manage agar mudah di-toggle. */
function applyRolePermissions(){
  /* 1. Sembunyikan tombol Tambah & Import CSV di toolbar setiap tab */
  var maps = {
    'tabBodyPengumuman': canManagePengumuman(),
    'tabBodyBezetting':  canManageBezetting(),
    'tabBodyPeserta':    canManagePeserta(),
    'tabBodyPetunjuk':   canManagePetunjuk()
  };
  Object.keys(maps).forEach(function(bodyId){
    var body = document.getElementById(bodyId);
    if(!body) return;
    var allowed = maps[bodyId];
    /* Tombol-tombol yang menambah/mengimpor data */
    body.querySelectorAll('[onclick*="openPengumumanForm"],' +
                          '[onclick*="openBezettingForm"],' +
                          '[onclick*="openPesertaForm"],' +
                          '[onclick*="openPetunjukForm"],' +
                          '[onclick*="openCsvImport"]').forEach(function(btn){
      btn.style.display = allowed ? '' : 'none';
    });
  });

  /* 2. Tambah badge "View Only" pada tab view-only untuk operator */
  _toggleViewOnlyBanner('tabBodyPengumuman', canManagePengumuman());
  _toggleViewOnlyBanner('tabBodyBezetting',  canManageBezetting());
  _toggleViewOnlyBanner('tabBodyPetunjuk',   canManagePetunjuk());
}

/* Sisipkan/lepas banner "Mode Lihat" di atas tabel bila operator */
function _toggleViewOnlyBanner(bodyId, canManage){
  var body = document.getElementById(bodyId);
  if(!body) return;
  var existing = body.querySelector('.role-viewonly-banner');
  if(canManage){
    if(existing) existing.remove();
    return;
  }
  if(existing) return;
  var banner = document.createElement('div');
  banner.className = 'role-viewonly-banner';
  banner.innerHTML = '<i class="fas fa-eye"></i> <b>Mode Lihat</b> — Sebagai Operator, Anda hanya dapat melihat data tab ini. Hanya Admin yang dapat menambah, mengubah, atau menghapus. Penuh akses CRUD tersedia di tab <b>Peserta UKOM</b>.';
  body.insertBefore(banner, body.firstChild);
}

function logoutAdmin(){
  confirmDialog('Keluar dari Panel Admin?', 'Sesi Anda akan diakhiri dan kembali ke halaman login.', function(){
    clearAdminSession();
    clearAdminRpcPass();
    _adminAvatarUrl = '';
    /* bersihkan cache data & status tampil password agar tidak tertinggal di memori setelah logout */
    admPengCache = null; admBezCache = null; admPesCache = null; admPetCache = null; admAkunCache = null;
    _admPassVisible = {};
    admPesPage = 1;
    document.getElementById('adminDataSection').style.display = 'none';
    document.getElementById('adminLoginSection').style.display = 'block';
    document.getElementById('adminUser').value = '';
    document.getElementById('adminPass').value = '';
    if(typeof refreshTopbarAdmin === 'function') refreshTopbarAdmin();
    showToast('Anda telah keluar', 'info');
  }, { icon:'fa-right-from-bracket', iconClass:'info', yesText:'Ya, Keluar', yesClass:'btn-danger' });
}

async function adminRefreshAll(){
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }
  /* Muat tiap tabel SECARA TERPISAH: satu tabel gagal (mis. tabel petunjuk
     belum dibuat karena schema belum di-run ulang) tidak membuat seluruh
     panel admin kosong. */
  const jobs = [
    ['pengumuman', API.getPengumuman(false), v => { admPengCache = v; document.getElementById('cntTabPengumuman').textContent = v.length; renderAdmPengumuman(); }],
    ['bezetting',  API.getBezetting(),       v => { admBezCache = v;  document.getElementById('cntTabBezetting').textContent  = v.length; renderAdmBezetting(); }],
    ['peserta',    API.getPesertaUkom(),     v => { admPesCache = v;  document.getElementById('cntTabPeserta').textContent    = v.length; renderAdmPeserta(); }],
    ['petunjuk',   API.getPetunjuk(false),   v => { admPetCache = v;  document.getElementById('cntTabPetunjuk').textContent   = v.length; renderAdmPetunjuk(); }]
  ];

  /* Tab Manajemen Akun hanya dimuat untuk admin (membutuhkan verifikasi password) */
  const session = getAdminSession();
  if(session && session.role === 'admin'){
    jobs.push(['akun',
      API.adminListUsers(session.username, _getAdminPassForRpc()).catch(function(){ return null; }),
      v => {
        if(v === null){ /* verifikasi gagal / RPC belum ada */ admAkunCache = null; }
        else { admAkunCache = v; }
        const el = document.getElementById('cntTabAkun');
        if(el) el.textContent = (admAkunCache || []).length;
        renderAdmAkun();
      }
    ]);
  }

  const results = await Promise.allSettled(jobs.map(j => j[1]));
  const gagal = [];
  results.forEach(function(res, i){
    if(res.status === 'fulfilled') jobs[i][2](res.value);
    else gagal.push(jobs[i][0]);
  });
  populateAdmBezFilter();
  populateAdmPesUnitFilter();
  if(gagal.length){
    showToast('Sebagian data gagal dimuat (' + gagal.join(', ') + '). ' +
      (gagal.includes('petunjuk') ? 'Jalankan ulang supabase/schema.sql terbaru untuk membuat tabel & bucket petunjuk.' : ''), 'error');
  }
}

/* ---------- PENYIMPANAN PASSWORD UNTUK VERIFIKASI RPC (v2.2.1) ----------
   RPC manajemen akun (list/create/update/delete/reset) dan upload foto profil
   (admin_set_my_avatar) memerlukan password requester sebagai verifikasi.

   FIX v2.2.1: password kini disimpan di sessionStorage (mantafRpcPass),
   bukan hanya di variabel memori. Sebelumnya password HILANG saat halaman
   di-refresh (F5) sementara sesi login tetap aktif → semua RPC terkirim
   dengan password kosong → "verifikasi password gagal" (upload foto profil
   & tab Manajemen Akun selalu gagal setelah refresh). Dengan sessionStorage,
   password bertahan selama tab terbuka & otomatis hilang saat tab ditutup,
   logout, atau sesi kedaluwarsa (60 menit). */
let _adminRpcPass = '';
function setAdminRpcPass(pass){
  _adminRpcPass = pass || '';
  try{
    if(_adminRpcPass) sessionStorage.setItem('mantafRpcPass', _adminRpcPass);
    else sessionStorage.removeItem('mantafRpcPass');
  }catch(e){ /* sessionStorage tidak tersedia — fallback ke memori saja */ }
}
function _getAdminPassForRpc(){
  if(_adminRpcPass) return _adminRpcPass;
  try{ _adminRpcPass = sessionStorage.getItem('mantafRpcPass') || ''; }
  catch(e){ _adminRpcPass = ''; }
  return _adminRpcPass;
}
function clearAdminRpcPass(){
  _adminRpcPass = '';
  try{ sessionStorage.removeItem('mantafRpcPass'); }catch(e){}
}

/* ================= TABS ================= */
function switchAdminTab(tab, el){
  document.querySelectorAll('.admin-tab').forEach(function(t){ t.classList.remove('active'); });
  el.classList.add('active');
  document.querySelectorAll('.admin-tabbody').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('tabBody' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
}

/* ================= MODAL HELPER ================= */
function crudModal(title, icon, bodyHtml, footerHtml, opts){
  opts = opts || {};
  const overlay = document.createElement('div');
  overlay.className = 'crud-overlay';
  overlay.innerHTML =
    '<div class="crud-modal' + (opts.large ? ' crud-modal-lg' : '') + '">' +
      '<div class="crud-modal-header"><h3><i class="fas ' + icon + '" style="color:#0f766e"></i> ' + title + '</h3>' +
      '<button class="close" data-close>&times;</button></div>' +
      '<div class="crud-modal-body">' + bodyHtml + '</div>' +
      '<div class="crud-modal-footer">' + footerHtml + '</div>' +
    '</div>';
  overlay.addEventListener('click', function(e){
    if(e.target === overlay) overlay.remove();
    if(e.target.closest('[data-close]')) overlay.remove();
  });
  document.body.appendChild(overlay);
  return overlay;
}

/* ============================================================
   TAB 1 : PENGUMUMAN (CRUD)
   ============================================================ */
function renderAdmPengumuman(){
  if(!admPengCache) return;
  const q = (document.getElementById('admPengSearch').value || '').toLowerCase();
  const rows = admPengCache.filter(function(p){
    return !q || String(p.judul || '').toLowerCase().indexOf(q) !== -1;
  });

  const canManage = canManagePengumuman();
  const body = document.getElementById('admPengBody');
  let html = '';
  rows.forEach(function(p){
    html += '<tr>' +
      '<td style="font-weight:600;color:#0f172a">' + escapeHtml(p.judul || '') + '<div style="font-size:11.5px;color:#94a3b8;margin-top:3px;max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(p.isi || '') + '</div></td>' +
      '<td>' + escapeHtml(formatDateId(p.tanggal)) + '</td>' +
      '<td>' + (p.prioritas === 'Normal'
        ? '<span class="badge-status badge-batal">Normal</span>'
        : '<span class="badge-status badge-menunggu">' + escapeHtml(p.prioritas) + '</span>') + '</td>' +
      '<td>' + (p.aktif ? '<span class="badge-status badge-aktif">Aktif</span>' : '<span class="badge-status badge-nonaktif">Nonaktif</span>') + '</td>' +
      '<td>' + (canManage
        ? '<div class="admin-row-actions">' +
            '<button class="act-btn act-edit" title="Edit" onclick="openPengumumanForm(\'' + p.id + '\')"><i class="fas fa-pen"></i></button>' +
            '<button class="act-btn act-del" title="Hapus" onclick="admDeletePengumuman(\'' + p.id + '\')"><i class="fas fa-trash"></i></button>' +
          '</div>'
        : '<span style="color:#94a3b8;font-size:11.5px"><i class="fas fa-lock"></i> Read only</span>') +
      '</td>' +
      '</tr>';
  });
  body.innerHTML = html || '<tr><td colspan="5" class="empty-state" style="padding:34px"><i class="fas fa-bell-slash"></i>Tidak ada pengumuman' + (canManage ? '. Klik "Tambah Pengumuman" untuk membuat.' : '.') + '</td></tr>';
}

function openPengumumanForm(id){
  if(!canManagePengumuman()){ showToast('Akses ditolak: Operator hanya bisa melihat Pengumuman', 'error'); return; }
  const p = id ? admPengCache.find(function(x){ return x.id === id; }) : null;
  const overlay = crudModal(p ? 'Edit Pengumuman' : 'Tambah Pengumuman', 'fa-bullhorn',
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1"><label>Judul <span style="color:#dc2626">*</span></label>' +
      '<input type="text" id="fPengJudul" maxlength="200" value="' + escAttr(p ? p.judul : '') + '"></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Isi Pengumuman <span style="color:#dc2626">*</span></label>' +
      '<textarea id="fPengIsi" rows="5">' + escapeHtml(p ? p.isi : '') + '</textarea></div>' +
      '<div class="form-group"><label>Tanggal</label><input type="date" id="fPengTanggal" value="' + escAttr(p ? p.tanggal : new Date().toISOString().slice(0, 10)) + '"></div>' +
      '<div class="form-group"><label>Prioritas</label><select id="fPengPrioritas">' +
        ['Normal','Penting','Segera'].map(function(v){ return '<option' + (p && p.prioritas === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-group"><label>Status</label><select id="fPengAktif">' +
        '<option value="true"' + (!p || p.aktif ? ' selected' : '') + '>Aktif</option>' +
        '<option value="false"' + (p && !p.aktif ? ' selected' : '') + '>Nonaktif</option>' +
      '</select></div>' +
    '</div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn" id="fPengSave"><i class="fas fa-floppy-disk"></i> Simpan</button>'
  );

  overlay.querySelector('#fPengSave').addEventListener('click', async function(){
    const judul = sanitizeInput(overlay.querySelector('#fPengJudul').value, 200);
    const isi = overlay.querySelector('#fPengIsi').value.trim();
    if(!judul || !isi){ showToast('Judul dan isi wajib diisi', 'error'); return; }
    const row = {
      judul: judul, isi: isi,
      tanggal: overlay.querySelector('#fPengTanggal').value || new Date().toISOString().slice(0, 10),
      prioritas: overlay.querySelector('#fPengPrioritas').value,
      aktif: overlay.querySelector('#fPengAktif').value === 'true'
    };
    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan…';
    try{
      if(p) await API.updatePengumuman(p.id, row);
      else await API.createPengumuman(row);
      showToast(p ? 'Pengumuman diperbarui' : 'Pengumuman ditambahkan', 'success');
      overlay.remove();
      pengumumanCacheInvalidate();
      adminRefreshAll();
    }catch(err){ showToast('Gagal: ' + err.message, 'error'); btn.disabled = false; }
  });
}

function admDeletePengumuman(id){
  if(!canManagePengumuman()){ showToast('Akses ditolak: Operator hanya bisa melihat Pengumuman', 'error'); return; }
  const p = admPengCache.find(function(x){ return x.id === id; });
  confirmDialog('Hapus Pengumuman?', 'Pengumuman "' + (p ? p.judul : '') + '" akan dihapus permanen.', async function(){
    try{
      await API.deletePengumuman(id);
      showToast('Pengumuman dihapus', 'success');
      pengumumanCacheInvalidate();
      adminRefreshAll();
    }catch(err){ showToast('Gagal menghapus: ' + err.message, 'error'); }
  });
}

function pengumumanCacheInvalidate(){
  /* paksa partial pengumuman publik memuat ulang saat dibuka lagi */
  if(typeof loadPengumuman === 'function' && document.getElementById('pengumumanList')) loadPengumuman(true);
}

/* ============================================================
   TAB 2 : BEZETTING (CRUD)
   ============================================================ */
function populateAdmBezFilter(){
  const sel = document.getElementById('admBezFilterInstansi');
  while(sel.options.length > 1) sel.remove(1);
  const set = new Set((admBezCache || []).map(function(r){ return r.instansi; }).filter(Boolean));
  [...set].sort().forEach(function(v){
    sel.insertAdjacentHTML('beforeend', '<option value="' + escAttr(v) + '">' + escapeHtml(v) + '</option>');
  });
}

function renderAdmBezetting(){
  if(!admBezCache) return;
  const q = (document.getElementById('admBezSearch').value || '').toLowerCase();
  const fInstansi = document.getElementById('admBezFilterInstansi').value;

  const rows = admBezCache.filter(function(b){
    const matchQ = !q ||
      String(b.instansi || '').toLowerCase().indexOf(q) !== -1 ||
      String(b.jenis_jabatan || '').toLowerCase().indexOf(q) !== -1 ||
      String(b.jenjang || '').toLowerCase().indexOf(q) !== -1;
    return matchQ && (!fInstansi || b.instansi === fInstansi);
  });

  const canManage = canManageBezetting();
  const body = document.getElementById('admBezBody');
  let html = '';
  rows.forEach(function(b){
    html += '<tr>' +
      '<td style="font-weight:600;color:#0f172a">' + escapeHtml(b.instansi || '') + '</td>' +
      '<td>' + escapeHtml(b.jenis_jabatan || '') + '</td>' +
      '<td>' + escapeHtml(b.jenjang || '') + '</td>' +
      '<td>' + (b.kebutuhan ?? 0) + '</td>' +
      '<td>' + (b.pemangku ?? 0) + '</td>' +
      '<td>' + (b.lowongan ?? 0) + '</td>' +
      '<td><span class="badge-status badge-dilimpahkan">' + (b.sisa ?? 0) + '</span></td>' +
      '<td>' + (canManage
        ? '<div class="admin-row-actions">' +
            '<button class="act-btn act-edit" title="Edit" onclick="openBezettingForm(\'' + b.id + '\')"><i class="fas fa-pen"></i></button>' +
            '<button class="act-btn act-del" title="Hapus" onclick="admDeleteBezetting(\'' + b.id + '\')"><i class="fas fa-trash"></i></button>' +
          '</div>'
        : '<span style="color:#94a3b8;font-size:11.5px"><i class="fas fa-lock"></i> Read only</span>') +
      '</td>' +
      '</tr>';
  });
  body.innerHTML = html || '<tr><td colspan="8" class="empty-state" style="padding:34px"><i class="fas fa-table-cells-large"></i>Tidak ada data' + (canManage ? '. Klik "Tambah Bezetting" untuk membuat.' : '.') + '</td></tr>';
}

function openBezettingForm(id){
  if(!canManageBezetting()){ showToast('Akses ditolak: Operator hanya bisa melihat Bezetting', 'error'); return; }
  const b = id ? admBezCache.find(function(x){ return x.id === id; }) : null;
  const overlay = crudModal(b ? 'Edit Data Bezetting' : 'Tambah Data Bezetting', 'fa-table-cells-large',
    '<div class="crud-hint"><i class="fas fa-circle-info"></i> Kolom <b>Sisa</b> terisi otomatis mengikuti nilai Lowongan Formasi.</div>' +
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1"><label>Instansi / Institusi Pelayanan Kesehatan <span style="color:#dc2626">*</span></label>' +
      '<input type="text" id="fBezInstansi" list="bezInstansiList" value="' + escAttr(b ? b.instansi : '') + '">' +
      '<datalist id="bezInstansiList">' + OPT_UNIT_KERJA.map(function(v){ return '<option value="' + escAttr(v) + '">'; }).join('') + '</datalist></div>' +
      '<div class="form-group"><label>Jenis Jabatan Fungsional <span style="color:#dc2626">*</span></label>' +
      '<input type="text" id="fBezJenis" list="bezJabfungList" value="' + escAttr(b ? b.jenis_jabatan : '') + '">' +
      '<datalist id="bezJabfungList">' + OPT_JABFUNG.map(function(v){ return '<option value="' + escAttr(v) + '">'; }).join('') + '</datalist></div>' +
      '<div class="form-group"><label>Jenjang Jabatan <span style="color:#dc2626">*</span></label>' +
      '<select id="fBezJenjang">' + OPT_JENJANG.map(function(v){ return '<option' + (b && b.jenjang === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>Kebutuhan</label><input type="number" min="0" id="fBezKebutuhan" value="' + (b ? b.kebutuhan : 0) + '"></div>' +
      '<div class="form-group"><label>Pemangku</label><input type="number" min="0" id="fBezPemangku" value="' + (b ? b.pemangku : 0) + '"></div>' +
      '<div class="form-group"><label>Lowongan Formasi</label><input type="number" min="0" id="fBezLowongan" value="' + (b ? b.lowongan : 0) + '"></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Nama-Nama Pemangku Saat Ini</label>' +
      '<textarea id="fBezPemangkuSaatIni" rows="3">' + escapeHtml(b ? b.pemangku_saat_ini : '') + '</textarea></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Nama-Nama Pemangku Yang Telah Disetujui Untuk Mengisi Lowongan</label>' +
      '<textarea id="fBezPemangkuDisetujui" rows="3">' + escapeHtml(b ? b.pemangku_disetujui : '') + '</textarea></div>' +
    '</div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn" id="fBezSave"><i class="fas fa-floppy-disk"></i> Simpan</button>'
  );

  overlay.querySelector('#fBezSave').addEventListener('click', async function(){
    const instansi = sanitizeInput(overlay.querySelector('#fBezInstansi').value, 150);
    const jenis = sanitizeInput(overlay.querySelector('#fBezJenis').value, 150);
    if(!instansi || !jenis){ showToast('Instansi dan Jenis Jabatan wajib diisi', 'error'); return; }
    const row = {
      instansi: instansi, jenis_jabatan: jenis,
      jenjang: overlay.querySelector('#fBezJenjang').value,
      kebutuhan: parseInt(overlay.querySelector('#fBezKebutuhan').value, 10) || 0,
      pemangku: parseInt(overlay.querySelector('#fBezPemangku').value, 10) || 0,
      lowongan: parseInt(overlay.querySelector('#fBezLowongan').value, 10) || 0,
      pemangku_saat_ini: overlay.querySelector('#fBezPemangkuSaatIni').value.trim(),
      pemangku_disetujui: overlay.querySelector('#fBezPemangkuDisetujui').value.trim()
    };
    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan…';
    try{
      if(b) await API.updateBezetting(b.id, row);
      else await API.createBezetting(row);
      showToast(b ? 'Data bezetting diperbarui' : 'Data bezetting ditambahkan', 'success');
      overlay.remove();
      if(document.getElementById('bezettingBody') && bezettingCache && typeof loadBezetting === 'function') loadBezetting(true);
      adminRefreshAll();
    }catch(err){ showToast('Gagal: ' + err.message, 'error'); btn.disabled = false; }
  });
}

function admDeleteBezetting(id){
  if(!canManageBezetting()){ showToast('Akses ditolak: Operator hanya bisa melihat Bezetting', 'error'); return; }
  const b = admBezCache.find(function(x){ return x.id === id; });
  confirmDialog('Hapus Data Bezetting?', 'Data "' + (b ? b.instansi + ' — ' + b.jenis_jabatan : '') + '" akan dihapus permanen.', async function(){
    try{
      await API.deleteBezetting(id);
      showToast('Data bezetting dihapus', 'success');
      if(document.getElementById('bezettingBody') && bezettingCache && typeof loadBezetting === 'function') loadBezetting(true);
      adminRefreshAll();
    }catch(err){ showToast('Gagal menghapus: ' + err.message, 'error'); }
  });
}

/* ============================================================
   TAB 3 : PESERTA UKOM (CRUD + verifikasi)
   ============================================================ */
function populateAdmPesUnitFilter(){
  const sel = document.getElementById('filterUnitKerja');
  while(sel.options.length > 1) sel.remove(1);
  const set = new Set((admPesCache || []).map(function(r){ return r.nama_unit_kerja; }).filter(Boolean));
  [...set].sort().forEach(function(v){
    sel.insertAdjacentHTML('beforeend', '<option value="' + escAttr(v) + '">' + escapeHtml(v) + '</option>');
  });
}

function filteredAdmPeserta(){
  if(!admPesCache) return [];
  const q = (document.getElementById('admPesSearch').value || '').toLowerCase();
  const unit = document.getElementById('filterUnitKerja').value;
  const status = document.getElementById('filterStatus').value;
  return admPesCache.filter(function(p){
    const matchQ = !q ||
      String(p.nama_tanpa_gelar || '').toLowerCase().indexOf(q) !== -1 ||
      String(p.nik || '').toLowerCase().indexOf(q) !== -1 ||
      String(p.nip || '').toLowerCase().indexOf(q) !== -1;
    return matchQ && (!unit || p.nama_unit_kerja === unit) && (!status || p.status_verifikasi === status);
  });
}

function renderAdmPeserta(){
  if(!admPesCache) return;
  const rows = filteredAdmPeserta();
  const totalPages = Math.max(1, Math.ceil(rows.length / ADM_PES_PER_PAGE));
  if(admPesPage > totalPages) admPesPage = totalPages;
  const start = (admPesPage - 1) * ADM_PES_PER_PAGE;
  const pageData = rows.slice(start, start + ADM_PES_PER_PAGE);

  const body = document.getElementById('admPesBody');
  let html = '';
  pageData.forEach(function(p){
    html += '<tr>' +
      '<td>' + (p.file_foto
        ? '<img src="' + escAttr(p.file_foto) + '" class="peserta-foto" style="width:42px;height:52px" loading="lazy" onclick="admShowDetail(\'' + p.id + '\')" onerror="this.outerHTML=\'<span style=color:#cbd5e1>-</span>\'">'
        : '<span style="color:#cbd5e1">-</span>') + '</td>' +
      '<td>' + escapeHtml(p.nik || '') + '</td>' +
      '<td>' + escapeHtml(p.nip || '') + '</td>' +
      '<td style="font-weight:600;color:#0f172a">' + escapeHtml(p.nama_tanpa_gelar || '') + '</td>' +
      '<td>' + escapeHtml(p.nama_unit_kerja || '') + '</td>' +
      '<td>' + badgeVerifikasi(p.status_verifikasi) + '</td>' +
      '<td style="max-width:200px;font-size:12px">' + escapeHtml(p.catatan_admin || '') + '</td>' +
      '<td><div class="admin-row-actions">' +
        '<button class="act-btn act-view" title="Detail & Verifikasi" onclick="admShowDetail(\'' + p.id + '\')"><i class="fas fa-eye"></i></button>' +
        '<button class="act-btn act-edit" title="Edit" onclick="openPesertaForm(\'' + p.id + '\')"><i class="fas fa-pen"></i></button>' +
        '<button class="act-btn act-del" title="Hapus" onclick="admDeletePeserta(\'' + p.id + '\')"><i class="fas fa-trash"></i></button>' +
      '</div></td>' +
      '</tr>';
  });
  body.innerHTML = html || '<tr><td colspan="8" class="empty-state" style="padding:34px"><i class="fas fa-users"></i>Tidak ada data peserta yang cocok.</td></tr>';

  buildPagination(
    document.getElementById('admPesPagination'),
    admPesPage, totalPages,
    'Menampilkan ' + pageData.length + ' dari ' + rows.length + ' peserta',
    function(p){ admPesPage = p; renderAdmPeserta(); }
  );
}

/* ---------- DETAIL PESERTA + VERIFIKASI STATUS ---------- */
const ADM_FILE_LABELS = {
  file_pak:'PAK Terakhir', file_foto:'Foto 4x6', file_drh:'Daftar Riwayat Hidup',
  file_ijazah:'Ijazah', file_str:'STR', file_sk_pangkat:'SK Pangkat',
  file_sk_jabfung:'SK Jabfung', file_skp:'SKP 2 Tahun', file_skmd:'SK Tidak Hukuman Disiplin',
  sertifikat:'Sertifikat'
};

function admShowDetail(id){
  const p = admPesCache.find(function(x){ return x.id === id; });
  if(!p) return;

  function dg(label, val){
    return '<div class="dg-item"><div class="dg-label">' + label + '</div><div class="dg-value">' + escapeHtml(val || '-') + '</div></div>';
  }
  function fileLink(url, label){
    return '<div class="af-item"><div class="af-label">' + label + '</div>' +
      (url ? '<a class="btn-file btn-file-view" href="' + escAttr(url) + '" target="_blank" rel="noopener" title="Buka berkas di tab baru" onclick="openFileTab(event, this.href)"><i class="fas fa-up-right-from-square"></i> Lihat Berkas</a>' : '<span style="color:#cbd5e1">Belum ada</span>') +
      '</div>';
  }

  let filesHtml = '';
  Object.keys(ADM_FILE_LABELS).forEach(function(col){
    if(col === 'file_foto') return; /* foto sudah di kanan */
    filesHtml += fileLink(p[col], ADM_FILE_LABELS[col]);
  });

  const statuses = ['Menunggu','Proses','Disetujui','Ditolak','Dilimpahkan','Batal','Perbaikan'];
  const statusColors = { 'Disetujui':'#16a34a','Ditolak':'#dc2626','Dilimpahkan':'#3b82f6','Batal':'#64748b','Proses':'#f59e0b','Menunggu':'#eab308','Perbaikan':'#7c3aed' };
  let statusBtns = '';
  statuses.forEach(function(s){
    statusBtns += '<button class="btn" style="padding:7px 13px;font-size:12px;background:' + (statusColors[s] || '#64748b') + ';' +
      (p.status_verifikasi === s ? 'outline:2.5px solid #0f172a;outline-offset:1.5px' : '') + '" ' +
      'onclick="admApplyStatus(\'' + p.id + '\',\'' + s + '\')">' + s + '</button>';
  });

  const overlay = document.getElementById('adminLightbox');
  document.getElementById('adminLightboxBody').innerHTML =
    '<div class="admin-lb-header"><h3><i class="fas fa-id-card" style="color:#0f766e"></i> Detail Peserta' +
      '<span class="badge-status ' + (p.status_verifikasi === 'Disetujui' ? 'badge-disetujui' : p.status_verifikasi === 'Ditolak' ? 'badge-ditolak' : 'badge-menunggu') + '">' + escapeHtml(p.status_verifikasi) + '</span></h3></div>' +
    '<div class="admin-lb-body">' +
      '<div class="admin-detail-wrap">' +
        '<div class="admin-detail-data"><div class="admin-data-grid">' +
          dg('No. Registrasi', p.no_registrasi) + dg('NIK', p.nik) + dg('NIP', p.nip) + dg('Nama Tanpa Gelar', p.nama_tanpa_gelar) + dg('Jenis Kelamin', p.jenis_kelamin) +
          dg('Unit Kerja', p.nama_unit_kerja) + dg('Pangkat / Golongan', p.pangkat_golongan) +
          dg('No. SK Jabfung', p.no_sk_jabfung) + dg('Jenis UKOM', p.jenis_ukom) +
          dg('Jabfung Saat Ini', p.jabfung_saat_ini) + dg('Jenjang Saat Ini', p.jenjang_saat_ini) +
          dg('Jabfung Tujuan', p.jabfung_tujuan) + dg('Jenjang Tujuan', p.jenjang_tujuan) +
          dg('Nilai PAK Terakhir', p.nilai_pak_terakhir) + dg('No. Peserta', p.no_peserta) +
          dg('Periode', p.periode) + dg('PAK Instansi', p.pak_instansi) +
          dg('PAK SI ASN', p.pak_siasn) + dg('Status Periode', p.status_periode) +
          dg('Absen', p.absen) + dg('Status UKOM', p.status_ukom) +
          dg('WhatsApp', p.nomor_whatsapp) + dg('Email', p.email_aktif) +
        '</div>' +
        '<div class="admin-file-grid">' + filesHtml + '</div>' +
        '</div>' +
        '<div class="admin-detail-foto">' +
          (p.file_foto ? '<img src="' + escAttr(p.file_foto) + '" onclick="openLightboxImg(this.src)" alt="Foto">' : '') +
          '<div class="foto-label">Foto 4x6 Latar Merah</div>' +
        '</div>' +
      '</div>' +
      '<div class="admin-status-section">' +
        '<div class="ss-title"><i class="fas fa-clipboard-check"></i> Status Verifikasi — klik untuk mengubah</div>' +
        '<div class="admin-status-btns">' + statusBtns + '</div>' +
        '<div class="form-group" style="margin-top:12px"><label>Catatan Admin (tampil di hasil Cek Status peserta)</label>' +
        '<textarea id="admCatatanAdmin" rows="2">' + escapeHtml(p.catatan_admin || '') + '</textarea></div>' +
        '<button class="btn btn-sm" style="margin-top:8px" onclick="admSaveCatatan(\'' + p.id + '\')"><i class="fas fa-floppy-disk"></i> Simpan Catatan</button>' +
      '</div>' +
    '</div>' +
    '<div class="admin-lb-footer">' +
      '<button class="btn btn-ghost" onclick="openPesertaForm(\'' + p.id + '\')"><i class="fas fa-pen"></i> Edit Data</button>' +
      '<button class="btn btn-ghost" onclick="document.getElementById(\'adminLightbox\').style.display=\'none\'"><i class="fas fa-xmark"></i> Tutup</button>' +
    '</div>';

  overlay.style.display = 'flex';
}

async function admApplyStatus(id, status){
  try{
    const current = admPesCache.find(function(x){ return x.id === id; });
    await API.updateStatusVerifikasi(id, status, current ? current.catatan_admin : '');
    showToast('Status diubah menjadi: ' + status, 'success');
    await adminRefreshAll();
    admShowDetail(id);
  }catch(err){ showToast('Gagal: ' + err.message, 'error'); }
}

async function admSaveCatatan(id){
  const catatan = document.getElementById('admCatatanAdmin').value.trim();
  try{
    const current = admPesCache.find(function(x){ return x.id === id; });
    await API.updateStatusVerifikasi(id, current ? current.status_verifikasi : 'Menunggu', catatan);
    showToast('Catatan admin disimpan', 'success');
    await adminRefreshAll();
    admShowDetail(id);
  }catch(err){ showToast('Gagal: ' + err.message, 'error'); }
}

/* ---------- FORM TAMBAH / EDIT PESERTA (LENGKAP, sesuai seluruh kolom tabel peserta_ukom) ---------- */

/* Konfigurasi 10 kolom berkas: label tampilan, bucket storage, tipe file diterima */
const PES_FILE_FIELDS = [
  { col:'file_pak',        label:'PAK Terakhir',                     bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   },
  { col:'file_foto',       label:'Foto 4x6 Latar Merah',             bucket:'foto',    accept:'image/*',      icon:'fa-file-image' },
  { col:'file_drh',        label:'Daftar Riwayat Hidup (DRH)',       bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   },
  { col:'file_ijazah',     label:'Ijazah Terakhir',                  bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   },
  { col:'file_str',        label:'STR (Surat Tanda Registrasi)',     bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   },
  { col:'file_sk_pangkat', label:'SK Pangkat Terakhir',              bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   },
  { col:'file_sk_jabfung', label:'SK Jabfung Terakhir',              bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   },
  { col:'file_skp',        label:'SKP 2 Tahun Terakhir',             bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   },
  { col:'file_skmd',       label:'SK Tidak Sedang Hukuman Disiplin', bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   },
  { col:'sertifikat',      label:'Sertifikat',                       bucket:'dokumen', accept:'.pdf,image/*', icon:'fa-file-pdf'   }
];

/* nama berkas yang rapi dari URL storage */
function pesFileName(url){
  if(!url) return '';
  const raw = String(url).split('/').pop().split('?')[0] || '-';
  try{ return decodeURIComponent(raw); }catch(e){ return raw; }
}

/* Buka berkas di tab baru dengan aman: hanya URL http/https yang diizinkan.
   Dipakai semua tombol "Lihat" berkas peserta & dokumen petunjuk. */
function openFileTab(ev, url){
  if(ev) ev.preventDefault();
  const u = String(url || '').trim();
  if(!u || !/^https?:\/\//i.test(u)){
    showToast('URL berkas tidak valid atau belum tersedia', 'error');
    return;
  }
  window.open(u, '_blank', 'noopener');
}

function openPesertaForm(id){
  const p = id ? admPesCache.find(function(x){ return x.id === id; }) : null;
  /* state tiap kolom berkas: { file: File|null, clear: bool } */
  const pesFileState = {};

  function optHtml(opts, cur){
    /* Rapikan: nilai tersimpan yang tidak ada di daftar (mis. hasil import CSV)
       TETAP ditampilkan agar tidak hilang / tidak ikut terhapus saat Simpan. */
    const list = (cur && opts.indexOf(cur) === -1) ? opts.concat([cur]) : opts;
    return list.map(function(v){
      return '<option value="' + escAttr(v) + '"' + (cur === v ? ' selected' : '') + '>' + escapeHtml(v) + '</option>';
    }).join('');
  }

  function fileRowHtml(f){
    pesFileState[f.col] = { file:null, clear:false };
    const cur = p ? (p[f.col] || '') : '';
    return '<div class="pf-row" id="pfRow_' + f.col + '">' +
      '<div class="pf-info">' +
        '<span class="pf-icon"><i class="fas ' + f.icon + '"></i></span>' +
        '<div class="pf-meta">' +
          '<div class="pf-label">' + f.label + '</div>' +
          '<div class="pf-name" id="pfName_' + f.col + '" title="' + escAttr(cur) + '">' + (cur ? escapeHtml(pesFileName(cur)) : '<span style="color:#94a3b8">Belum ada berkas</span>') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pf-actions">' +
        (cur ? '<a class="btn-file btn-file-view" href="' + escAttr(cur) + '" target="_blank" rel="noopener" id="pfView_' + f.col + '" title="Buka berkas di tab baru" onclick="openFileTab(event, this.href)"><i class="fas fa-up-right-from-square"></i> Lihat</a>' : '') +
        '<label class="btn-file btn-file-ganti" for="pfInput_' + f.col + '" title="Pilih berkas dari komputer"><i class="fas fa-' + (cur ? 'rotate' : 'upload') + '"></i> ' + (cur ? 'Ganti' : 'Unggah') + '</label>' +
        '<input type="file" id="pfInput_' + f.col + '" accept="' + f.accept + '" hidden>' +
        '<button type="button" class="btn-file btn-file-del" id="pfDel_' + f.col + '" style="' + (cur ? '' : 'display:none') + '" title="Hapus berkas"><i class="fas fa-xmark"></i></button>' +
      '</div>' +
    '</div>';
  }

  const overlay = crudModal(p ? 'Edit Data Peserta' : 'Tambah Data Peserta', 'fa-users',
    /* ==== 1. DATA PRIBADI ==== */
    '<div class="form-section-title"><i class="fas fa-id-card"></i> Data Pribadi</div>' +
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1"><label>No. Registrasi (otomatis dari pendaftaran)</label><input type="text" value="' + escAttr(p ? (p.no_registrasi || '') : '') + '" readonly placeholder="Diterbitkan sistem saat peserta mendaftar"></div>' +
      '<div class="form-group"><label>NIK <span style="color:#dc2626">*</span></label><input type="text" id="fPesNik" maxlength="16" inputmode="numeric" placeholder="16 digit angka" value="' + escAttr(p ? p.nik : '') + '"></div>' +
      '<div class="form-group"><label>NIP <span style="color:#dc2626">*</span></label><input type="text" id="fPesNip" value="' + escAttr(p ? p.nip : '') + '"></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Nama Tanpa Gelar <span style="color:#dc2626">*</span></label><input type="text" id="fPesNama" value="' + escAttr(p ? p.nama_tanpa_gelar : '') + '"></div>' +
      '<div class="form-group"><label>Jenis Kelamin</label><select id="fPesKelamin"><option value="">Pilih</option>' + optHtml(['Laki-Laki','Perempuan'], p ? p.jenis_kelamin : '') + '</select></div>' +
      '<div class="form-group"><label>Unit Kerja <span style="color:#dc2626">*</span></label><select id="fPesUnit"><option value="">Pilih Instansi</option>' + optHtml(OPT_UNIT_KERJA, p ? p.nama_unit_kerja : '') + '</select></div>' +
      '<div class="form-group"><label>Pangkat / Golongan</label><select id="fPesPangkat"><option value="">Pilih</option>' + optHtml(OPT_PANGKAT, p ? p.pangkat_golongan : '') + '</select></div>' +
      '<div class="form-group"><label>No. SK Jabfung Terakhir</label><input type="text" id="fPesNoSkJabfung" value="' + escAttr(p ? p.no_sk_jabfung : '') + '"></div>' +
    '</div>' +

    /* ==== 2. DATA JABATAN & UKOM ==== */
    '<div class="form-section-title"><i class="fas fa-briefcase"></i> Data Jabatan &amp; UKOM</div>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Jabfung Saat Ini</label><select id="fPesJabfungSaatIni"><option value="">Pilih</option>' + optHtml(OPT_JABFUNG, p ? p.jabfung_saat_ini : '') + '</select></div>' +
      '<div class="form-group"><label>Jenjang Saat Ini</label><select id="fPesJenjangSaatIni"><option value="">Pilih</option>' + optHtml(OPT_JENJANG, p ? p.jenjang_saat_ini : '') + '</select></div>' +
      '<div class="form-group"><label>Jabfung Tujuan</label><select id="fPesJabfungTujuan"><option value="">Pilih</option>' + optHtml(OPT_JABFUNG, p ? p.jabfung_tujuan : '') + '</select></div>' +
      '<div class="form-group"><label>Jenjang Tujuan</label><select id="fPesJenjangTujuan"><option value="">Pilih</option>' + optHtml(OPT_JENJANG, p ? p.jenjang_tujuan : '') + '</select></div>' +
      '<div class="form-group"><label>Jenis UKOM</label><select id="fPesJenisUkom"><option value="">Pilih</option>' + optHtml(OPT_JENIS_UKOM, p ? p.jenis_ukom : '') + '</select></div>' +
      '<div class="form-group"><label>Nilai PAK Terakhir</label><input type="text" id="fPesNilaiPak" placeholder="cth: 85.50" value="' + escAttr(p ? p.nilai_pak_terakhir : '') + '"></div>' +
    '</div>' +

    /* ==== 3. KONTAK ==== */
    '<div class="form-section-title"><i class="fas fa-address-book"></i> Kontak</div>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Nomor WhatsApp</label><input type="text" id="fPesWa" inputmode="tel" placeholder="08xxxxxxxxxx" value="' + escAttr(p ? p.nomor_whatsapp : '') + '"></div>' +
      '<div class="form-group"><label>Email Aktif</label><input type="email" id="fPesEmail" placeholder="nama@email.com" value="' + escAttr(p ? p.email_aktif : '') + '"></div>' +
    '</div>' +

    /* ==== 4. DATA KELOLA ADMIN ==== */
    '<div class="form-section-title"><i class="fas fa-sliders"></i> Data Kelola Admin</div>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>Periode</label><input type="text" id="fPesPeriode" value="' + escAttr(p ? p.periode : '') + '" placeholder="cth: 2026-1"></div>' +
      '<div class="form-group"><label>No. Peserta</label><input type="text" id="fPesNoPeserta" value="' + escAttr(p ? p.no_peserta : '') + '"></div>' +
      '<div class="form-group"><label>PAK Instansi</label><input type="text" id="fPesPakInstansi" value="' + escAttr(p ? p.pak_instansi : '') + '"></div>' +
      '<div class="form-group"><label>PAK SI ASN</label><input type="text" id="fPesPakSiasn" value="' + escAttr(p ? p.pak_siasn : '') + '"></div>' +
      '<div class="form-group"><label>Status Periode</label><select id="fPesStatusPeriode">' + optHtml(['Aktif','Tidak Aktif','-'], p ? (p.status_periode || '-') : '-') + '</select></div>' +
      '<div class="form-group"><label>Absen</label><select id="fPesAbsen">' + optHtml(['Hadir','Tidak Hadir','-'], p ? (p.absen || '-') : '-') + '</select></div>' +
      '<div class="form-group"><label>Status UKOM</label><select id="fPesStatusUkom">' + optHtml(['Lulus','Tidak Lulus','Menunggu','-'], p ? (p.status_ukom || '-') : '-') + '</select></div>' +
      '<div class="form-group"><label>Status Verifikasi</label><select id="fPesStatusVerifikasi">' + optHtml(['Menunggu','Proses','Disetujui','Ditolak','Dilimpahkan','Batal','Perbaikan'], p ? p.status_verifikasi : '') + '</select></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Catatan Admin (tampil di hasil Cek Status peserta)</label><textarea id="fPesCatatan" rows="2">' + escapeHtml(p ? p.catatan_admin : '') + '</textarea></div>' +
    '</div>' +

    /* ==== 5. BERKAS PENDUKUNG (10 kolom file) ==== */
    '<div class="form-section-title"><i class="fas fa-paperclip"></i> Berkas Pendukung' +
      '<span class="fst-note"><i class="fas fa-up-right-from-square"></i> tombol Lihat membuka berkas di tab baru</span></div>' +
    '<div class="pf-list">' + PES_FILE_FIELDS.map(fileRowHtml).join('') + '</div>' +
    '<div class="csv-hintbox" style="margin-top:12px"><i class="fas fa-lightbulb"></i><div>' +
      'Form ini mencakup <b>seluruh kolom</b> tabel <code>peserta_ukom</code> di Supabase. Berkas maksimal ' + Math.round(SUPABASE_CONFIG.maxFileSize / 1024 / 1024) +
      ' MB; tanda <span style="color:#dc2626">*</span> wajib diisi. Perubahan berkas tersimpan saat tombol <b>Simpan</b> ditekan.' +
    '</div></div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn" id="fPesSave"><i class="fas fa-floppy-disk"></i> Simpan</button>',
    { large: true }
  );

  /* ---- interaksi tiap baris berkas: pilih / batalkan / tandai hapus ---- */
  PES_FILE_FIELDS.forEach(function(f){
    const input = overlay.querySelector('#pfInput_' + f.col);
    const delBtn = overlay.querySelector('#pfDel_' + f.col);
    const viewA  = overlay.querySelector('#pfView_' + f.col);
    const nameEl = overlay.querySelector('#pfName_' + f.col);
    const cur = p ? (p[f.col] || '') : '';
    const noFileTxt = '<span style="color:#94a3b8">Belum ada berkas</span>';

    input.addEventListener('change', function(){
      const file = input.files[0];
      if(!file) return;
      if(file.size > SUPABASE_CONFIG.maxFileSize){
        showToast('Ukuran "' + file.name + '" melebihi ' + Math.round(SUPABASE_CONFIG.maxFileSize / 1024 / 1024) + ' MB', 'error');
        input.value = '';
        return;
      }
      pesFileState[f.col] = { file: file, clear: false };
      nameEl.innerHTML = '<span style="color:#0d9488"><i class="fas fa-file-circle-check"></i></span> ' + escapeHtml(file.name);
      delBtn.style.display = '';
      delBtn.innerHTML = '<i class="fas fa-xmark"></i>';
      delBtn.title = 'Batalkan berkas yang dipilih';
      if(cur && viewA) viewA.style.display = '';
    });

    delBtn.addEventListener('click', function(){
      const st = pesFileState[f.col];
      if(st && st.file){
        /* buang pilihan berkas baru → kembali ke kondisi sebelumnya */
        st.file = null;
        input.value = '';
        nameEl.innerHTML = cur ? escapeHtml(pesFileName(cur)) : noFileTxt;
        if(!cur){ delBtn.style.display = 'none'; }
        else{ delBtn.innerHTML = '<i class="fas fa-xmark"></i>'; delBtn.title = 'Hapus berkas saat disimpan'; }
        return;
      }
      if(cur){
        /* tandai hapus / urungkan penandaan */
        const cleared = !(st && st.clear);
        pesFileState[f.col] = { file: null, clear: cleared };
        nameEl.innerHTML = cleared
          ? '<span style="color:#dc2626"><i class="fas fa-trash-can"></i> Berkas dihapus saat disimpan</span>'
          : escapeHtml(pesFileName(cur));
        if(viewA) viewA.style.display = cleared ? 'none' : '';
        delBtn.innerHTML = cleared ? '<i class="fas fa-rotate-left"></i>' : '<i class="fas fa-xmark"></i>';
        delBtn.title = cleared ? 'Urungkan penghapusan' : 'Hapus berkas saat disimpan';
      }
    });
  });

  /* ---- SIMPAN ---- */
  overlay.querySelector('#fPesSave').addEventListener('click', async function(){
    const nik  = sanitizeInput(overlay.querySelector('#fPesNik').value, 16);
    const nip  = sanitizeInput(overlay.querySelector('#fPesNip').value, 30);
    const nama = sanitizeInput(overlay.querySelector('#fPesNama').value, 100);
    const unit = overlay.querySelector('#fPesUnit').value;
    const email = overlay.querySelector('#fPesEmail').value.trim();
    const wa    = overlay.querySelector('#fPesWa').value.trim();

    if(!/^[0-9]{16}$/.test(nik)){ showToast('NIK harus 16 digit angka', 'error'); return; }
    if(!nip){ showToast('NIP wajib diisi', 'error'); return; }
    if(!nama){ showToast('Nama wajib diisi', 'error'); return; }
    if(!unit){ showToast('Unit kerja wajib dipilih', 'error'); return; }
    if(email && !validateEmail(email)){ showToast('Format email tidak valid', 'error'); return; }
    if(wa && !validatePhone(wa)){ showToast('Format nomor WhatsApp tidak valid (contoh: 081234567890)', 'error'); return; }

    const row = {
      nik: nik,
      nip: nip,
      nama_tanpa_gelar: nama,
      jenis_kelamin: overlay.querySelector('#fPesKelamin').value || null,
      nama_unit_kerja: unit,
      pangkat_golongan: overlay.querySelector('#fPesPangkat').value || null,
      no_sk_jabfung: sanitizeInput(overlay.querySelector('#fPesNoSkJabfung').value, 100) || null,
      jabfung_saat_ini: overlay.querySelector('#fPesJabfungSaatIni').value || null,
      jenjang_saat_ini: overlay.querySelector('#fPesJenjangSaatIni').value || null,
      jabfung_tujuan: overlay.querySelector('#fPesJabfungTujuan').value || null,
      jenjang_tujuan: overlay.querySelector('#fPesJenjangTujuan').value || null,
      jenis_ukom: overlay.querySelector('#fPesJenisUkom').value || null,
      nilai_pak_terakhir: sanitizeInput(overlay.querySelector('#fPesNilaiPak').value, 50) || null,
      nomor_whatsapp: sanitizeInput(wa, 20) || null,
      email_aktif: sanitizeInput(email, 100) || null,
      periode: sanitizeInput(overlay.querySelector('#fPesPeriode').value, 30) || null,
      no_peserta: sanitizeInput(overlay.querySelector('#fPesNoPeserta').value, 30) || null,
      pak_instansi: sanitizeInput(overlay.querySelector('#fPesPakInstansi').value, 50) || null,
      pak_siasn: sanitizeInput(overlay.querySelector('#fPesPakSiasn').value, 50) || null,
      status_periode: overlay.querySelector('#fPesStatusPeriode').value,
      absen: overlay.querySelector('#fPesAbsen').value,
      status_ukom: overlay.querySelector('#fPesStatusUkom').value,
      status_verifikasi: overlay.querySelector('#fPesStatusVerifikasi').value,
      catatan_admin: overlay.querySelector('#fPesCatatan').value.trim()
    };

    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan…';
    try{
      /* unggah berkas baru & terapkan penghapusan (berkas lama dibuang dari storage SETELAH data tersimpan) */
      const oldUrls = [];
      for(const f of PES_FILE_FIELDS){
        const st = pesFileState[f.col] || {};
        const curUrl = p ? (p[f.col] || '') : '';
        if(st.file){
          row[f.col] = await API.uploadFile(f.bucket, st.file, nik);
          if(curUrl) oldUrls.push(curUrl);
        }else if(st.clear && curUrl){
          row[f.col] = null;
          oldUrls.push(curUrl);
        }
      }

      if(p) await API.updatePeserta(p.id, row);
      else await API.createPeserta(row);

      oldUrls.forEach(function(u){ API.deleteStorageFile(u); });

      showToast(p ? 'Data peserta diperbarui' : 'Peserta ditambahkan', 'success');
      overlay.remove();
      pesertaUkomCache = null; dashPesertaCache = null;
      adminRefreshAll();
    }catch(err){
      showToast('Gagal: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan';
    }
  });
}

function admDeletePeserta(id){
  const p = admPesCache.find(function(x){ return x.id === id; });
  confirmDialog('Hapus Data Peserta?', 'Data peserta "' + (p ? p.nama_tanpa_gelar : '') + '" beserta seluruh berkasnya akan dihapus permanen.', async function(){
    try{
      await API.deletePeserta(id);
      showToast('Data peserta dihapus', 'success');
      pesertaUkomCache = null; dashPesertaCache = null;
      adminRefreshAll();
    }catch(err){ showToast('Gagal menghapus: ' + err.message, 'error'); }
  });
}

/* ============================================================
   TAB 4 : PETUNJUK PENGGUNAAN (CRUD + upload PDF ke storage)
   ============================================================ */
function renderAdmPetunjuk(){
  if(!admPetCache) return;
  const q = ((document.getElementById('admPetSearch') || {}).value || '').toLowerCase();
  const rows = admPetCache.filter(function(p){
    return !q ||
      String(p.judul || '').toLowerCase().indexOf(q) !== -1 ||
      String(p.deskripsi || '').toLowerCase().indexOf(q) !== -1;
  });

  const canManage = canManagePetunjuk();
  const body = document.getElementById('admPetBody');
  let html = '';
  rows.forEach(function(p){
    const namaFile = String(p.file_url || '').split('/').pop().split('?')[0] || '-';
    var actions = '<button class="act-btn act-view" title="Preview PDF" onclick="openPetunjukPreview(\'' + p.id + '\')"><i class="fas fa-eye"></i></button>';
    if(canManage){
      actions += '<button class="act-btn act-edit" title="Edit" onclick="openPetunjukForm(\'' + p.id + '\')"><i class="fas fa-pen"></i></button>' +
                 '<button class="act-btn act-del" title="Hapus" onclick="admDeletePetunjuk(\'' + p.id + '\')"><i class="fas fa-trash"></i></button>';
    }
    html += '<tr>' +
      '<td style="font-weight:600;color:#0f172a">' + escapeHtml(p.judul || '') +
        '<div style="font-size:11.5px;color:#94a3b8;margin-top:3px;max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(p.deskripsi || '') + '</div></td>' +
      '<td><span style="font-size:11.5px;color:#64748b;display:inline-flex;align-items:center;gap:6px;max-width:180px">' +
        '<i class="fas fa-file-pdf" style="color:#dc2626"></i>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(p.file_url || '') + '">' + escapeHtml(namaFile) + '</span></span></td>' +
      '<td>' + escapeHtml(String(p.urutan ?? 0)) + '</td>' +
      '<td>' + (p.aktif ? '<span class="badge-status badge-aktif">Aktif</span>' : '<span class="badge-status badge-nonaktif">Nonaktif</span>') + '</td>' +
      '<td><div class="admin-row-actions">' + actions + '</div>' +
        (canManage ? '' : '<div style="font-size:10.5px;color:#94a3b8;margin-top:4px"><i class="fas fa-lock"></i> Read only</div>') +
      '</td>' +
      '</tr>';
  });
  body.innerHTML = html || '<tr><td colspan="5" class="empty-state" style="padding:34px"><i class="fas fa-book-open-reader"></i>Tidak ada dokumen' + (canManage ? '. Klik "Tambah Dokumen" untuk mengunggah PDF petunjuk.' : '.') + '</td></tr>';
}

/* Preview PDF dari panel admin (pakai popup publik di petunjuk.js) */
function openPetunjukPreview(id){
  const p = admPetCache && admPetCache.find(function(x){ return x.id === id; });
  if(!p || !p.file_url){ showToast('File dokumen tidak ditemukan', 'error'); return; }
  _pdfPreviewUrl = p.file_url;
  document.getElementById('pdfPreviewTitle').textContent = p.judul || 'Dokumen';
  document.getElementById('pdfPreviewFallbackLink').href = p.file_url;
  const frame = document.getElementById('pdfPreviewFrame');
  const fallback = document.getElementById('pdfPreviewFallback');
  fallback.style.display = 'none';
  frame.style.display = 'block';
  /* toolbar=0 & navpanes=0: viewer hanya untuk membaca (tanpa tombol unduh browser) */
  frame.src = p.file_url + '#view=FitH&toolbar=0&navpanes=0';
  document.getElementById('lightboxPdf').classList.add('show');
}

function openPetunjukForm(id){
  if(!canManagePetunjuk()){ showToast('Akses ditolak: Operator hanya bisa melihat Petunjuk', 'error'); return; }
  /* aman saat data petunjuk gagal dimuat (admPetCache masih null) */
  const p = (id && admPetCache) ? admPetCache.find(function(x){ return x.id === id; }) : null;
  const overlay = crudModal(p ? 'Edit Dokumen Petunjuk' : 'Tambah Dokumen Petunjuk', 'fa-book-open-reader',
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1"><label>Judul Dokumen <span style="color:#dc2626">*</span></label>' +
      '<input type="text" id="fPetJudul" maxlength="200" placeholder="cth: Petunjuk Pendaftaran UKOM" value="' + escAttr(p ? p.judul : '') + '"></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Deskripsi Singkat</label>' +
      '<textarea id="fPetDesk" rows="3" placeholder="Jelaskan isi dokumen dalam 1–3 kalimat...">' + escapeHtml(p ? p.deskripsi : '') + '</textarea></div>' +
      '<div class="form-group"><label>' + (p ? 'Ganti File PDF (opsional)' : 'File PDF <span style="color:#dc2626">*</span>') + '</label>' +
      '<input type="file" id="fPetFile" accept="application/pdf,.pdf">' +
      (p ? '<div style="font-size:11.5px;color:#64748b;margin-top:6px"><i class="fas fa-link"></i> File saat ini: ' +
        '<a href="' + escAttr(p.file_url) + '" target="_blank" rel="noopener" title="Buka di tab baru" onclick="openFileTab(event, this.href)" style="color:#0d9488">' + escapeHtml(String(p.file_url).split('/').pop().split('?')[0]) + '</a></div>' : '') +
      '</div>' +
      '<div class="form-group"><label>Urutan Tampil</label><input type="number" id="fPetUrutan" min="0" max="9999" value="' + (p ? (p.urutan ?? 0) : ((admPetCache ? admPetCache.length : 0) + 1)) + '"></div>' +
      '<div class="form-group"><label>Status</label><select id="fPetAktif">' +
        '<option value="true"' + (!p || p.aktif ? ' selected' : '') + '>Aktif (tampil di menu publik)</option>' +
        '<option value="false"' + (p && !p.aktif ? ' selected' : '') + '>Nonaktif (disembunyikan)</option>' +
      '</select></div>' +
    '</div>' +
    '<div class="csv-hintbox" style="margin-top:6px"><i class="fas fa-lightbulb"></i><div>' +
      'Gunakan file <b>PDF</b> ukuran maksimal ' + Math.round(SUPABASE_CONFIG.maxFileSize / 1024 / 1024) + ' MB. ' +
      'Dokumen dengan urutan terkecil tampil paling atas. Semua pengunjung dapat membaca lewat popup preview.' +
    '</div></div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn" id="fPetSave"><i class="fas fa-floppy-disk"></i> Simpan</button>'
  );

  overlay.querySelector('#fPetSave').addEventListener('click', async function(){
    const judul = sanitizeInput(overlay.querySelector('#fPetJudul').value, 200);
    if(!judul){ showToast('Judul dokumen wajib diisi', 'error'); return; }

    const fFile = overlay.querySelector('#fPetFile').files[0];
    if(!p && !fFile){ showToast('Pilih file PDF terlebih dahulu', 'error'); return; }
    if(fFile){
      if(!/\.pdf$/i.test(fFile.name) && fFile.type !== 'application/pdf'){
        showToast('File harus berformat PDF', 'error'); return;
      }
      if(fFile.size > SUPABASE_CONFIG.maxFileSize){
        showToast('Ukuran PDF melebihi ' + Math.round(SUPABASE_CONFIG.maxFileSize / 1024 / 1024) + ' MB', 'error'); return;
      }
    }

    const row = {
      judul: judul,
      deskripsi: overlay.querySelector('#fPetDesk').value.trim().slice(0, 1000),
      urutan: parseInt(overlay.querySelector('#fPetUrutan').value, 10) || 0,
      aktif: overlay.querySelector('#fPetAktif').value === 'true'
    };

    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan…';
    try{
      if(fFile){
        const urlBaru = await API.uploadFile(SUPABASE_CONFIG.buckets.petunjuk, fFile, 'dokumen');
        row.file_url = urlBaru;
        /* file lama dihapus agar storage tidak menumpuk */
        if(p && p.file_url) await API.deletePetunjukFile(p.file_url);
      }
      if(p) await API.updatePetunjuk(p.id, row);
      else await API.createPetunjuk(row);

      showToast(p ? 'Dokumen diperbarui' : 'Dokumen petunjuk ditambahkan', 'success');
      overlay.remove();
      if(typeof petunjukCacheInvalidate === 'function') petunjukCacheInvalidate();
      adminRefreshAll();
    }catch(err){ showToast('Gagal: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan'; }
  });
}

function admDeletePetunjuk(id){
  if(!canManagePetunjuk()){ showToast('Akses ditolak: Operator hanya bisa melihat Petunjuk', 'error'); return; }
  const p = admPetCache && admPetCache.find(function(x){ return x.id === id; });
  confirmDialog('Hapus Dokumen Petunjuk?',
    'Dokumen "' + (p ? p.judul : '') + '" beserta file PDF-nya akan dihapus permanen dari storage.',
    async function(){
      try{
        if(p && p.file_url) await API.deletePetunjukFile(p.file_url);
        await API.deletePetunjuk(id);
        showToast('Dokumen dihapus', 'success');
        if(typeof petunjukCacheInvalidate === 'function') petunjukCacheInvalidate();
        adminRefreshAll();
      }catch(err){ showToast('Gagal menghapus: ' + err.message, 'error'); }
    },
    { icon:'fa-file-pdf', yesText:'Ya, Hapus Dokumen', yesClass:'btn-danger' });
}

/* ============================================================
   KEAMANAN AKUN — AKUN SAYA & MANAJEMEN AKUN
   ============================================================
   - openMyAccount()           : modal profil sendiri (lihat info + 2 tombol aksi)
   - openChangeUsername()      : ubah username sendiri (verifikasi password)
   - openChangePassword()      : ganti password sendiri (versi baru dgn info keamanan)
   - renderAdmAkun()           : render tabel di tab Manajemen Akun (admin only,
                                 termasuk kolom Username & Password — v2.2)
   - admToggleAkunPass()       : tampilkan/sembunyikan password di tabel (admin only)
   - admCopyAkunPass()         : salin password ke clipboard (admin only)
   - openAkunForm()            : tambah/edit akun (admin only)
   - admDeleteAkun()           : hapus akun (admin only)
   - admResetAkunPassword()    : reset password akun lain (admin only)
   - admUnlockAkun()           : buka kunci akun yang terkunci (admin only)
   ============================================================ */

/* Status tampil/sembunyi password per baris (id akun → boolean).
   Default: SEMUA password ter-masker. Hanya dipakai di tab Manajemen Akun
   yang sudah guard admin-only (tab disembunyikan untuk operator + RPC
   admin_list_users menolak non-admin di sisi database). */
let _admPassVisible = {};

/* ---------- AKUN SAYA: lihat profil sendiri ---------- */
async function openMyAccount(){
  const session = getAdminSession();
  if(!session){ showToast('Sesi tidak ditemukan, silakan login ulang', 'error'); return; }

  const overlay = crudModal('Akun Saya', 'fa-id-card',
    '<div id="myAcctBody"><div style="padding:30px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Memuat profil…</div></div>',
    '<button class="btn btn-ghost" data-close>Tutup</button>' +
    '<button class="btn" id="myAcctChangeAvatar"><i class="fas fa-camera"></i> Ganti Foto</button>' +
    '<button class="btn" id="myAcctChangeUname"><i class="fas fa-user-pen"></i> Ubah Username</button>' +
    '<button class="btn" id="myAcctChangePass"><i class="fas fa-key"></i> Ganti Password</button>'
  );

  /* Tombol aksi */
  overlay.querySelector('#myAcctChangeAvatar').addEventListener('click', function(){
    openChangeAvatar(function(){ /* setelah upload sukses, refresh modal */
      overlay.remove();
      openMyAccount();
    });
  });
  overlay.querySelector('#myAcctChangeUname').addEventListener('click', function(){
    overlay.remove();
    openChangeUsername();
  });
  overlay.querySelector('#myAcctChangePass').addEventListener('click', function(){
    overlay.remove();
    openChangePassword();
  });

  /* Muat profil terbaru dari server */
  try{
    const rows = await API.adminGetMyProfile(session.username);
    const p = (rows && rows.length) ? rows[0] : null;
    if(!p){
      overlay.querySelector('#myAcctBody').innerHTML =
        '<div style="padding:24px;color:#dc2626"><i class="fas fa-circle-xmark"></i> Profil tidak ditemukan. Silakan login ulang.</div>';
      return;
    }
    /* Sinkronkan avatar di memori & session */
    _adminAvatarUrl = p.avatar_url || '';
    updateAdminSession({ avatar_url: _adminAvatarUrl });
    if(typeof refreshTopbarAdmin === 'function') refreshTopbarAdmin();

    const lastLogin = p.last_login_at ? formatDateTimeId(p.last_login_at) : 'Belum pernah';
    const lastPass  = p.last_password_change_at ? formatDateTimeId(p.last_password_change_at) : 'Belum pernah';
    const roleBadge = p.role === 'operator'
      ? '<span class="admin-role-badge role-operator">Operator</span>'
      : '<span class="admin-role-badge role-admin">Admin</span>';
    const statusBadge = p.aktif
      ? '<span class="badge-status badge-aktif">Aktif</span>'
      : '<span class="badge-status badge-nonaktif">Nonaktif</span>';

    /* Blok avatar — bangun tanpa inline onerror (lebih aman & bersih) */
    const initial = (p.nama || p.username || 'A').trim().charAt(0).toUpperCase();
    const avatarCircleHtml = '<div class="my-acct-avatar-circle" id="myAcctAvatarCircle"></div>';

    overlay.querySelector('#myAcctBody').innerHTML =
      '<div class="my-acct-avatar-block">' +
        avatarCircleHtml +
        '<div class="my-acct-avatar-actions">' +
          '<button class="btn btn-sm" id="myAcctAvatarChange"><i class="fas fa-camera"></i> Ganti Foto</button>' +
          (p.avatar_url
            ? '<button class="btn btn-sm btn-ghost" id="myAcctAvatarClear"><i class="fas fa-trash"></i> Hapus Foto</button>'
            : '') +
        '</div>' +
        '<div class="my-acct-avatar-hint">JPG/PNG, maks 2 MB. Foto akan tampil di topbar &amp; header Panel Admin.</div>' +
      '</div>' +
      '<div class="my-acct-grid">' +
        '<div class="my-acct-row"><label>Username</label><div class="my-acct-value"><code>' + escapeHtml(p.username) + '</code></div></div>' +
        '<div class="my-acct-row"><label>Nama Lengkap</label><div class="my-acct-value">' + escapeHtml(p.nama) + '</div></div>' +
        '<div class="my-acct-row"><label>Role</label><div class="my-acct-value">' + roleBadge + '</div></div>' +
        '<div class="my-acct-row"><label>Status Akun</label><div class="my-acct-value">' + statusBadge + '</div></div>' +
        '<div class="my-acct-row"><label>Login Terakhir</label><div class="my-acct-value">' + escapeHtml(lastLogin) + '</div></div>' +
        '<div class="my-acct-row"><label>Password Terakhir Diubah</label><div class="my-acct-value">' + escapeHtml(lastPass) + '</div></div>' +
        '<div class="my-acct-row"><label>Akun Dibuat</label><div class="my-acct-value">' + escapeHtml(formatDateTimeId(p.created_at)) + '</div></div>' +
      '</div>' +
      '<div class="csv-hintbox" style="margin-top:18px"><i class="fas fa-shield-halved"></i><div>' +
        'Anda dapat mengubah <b>foto profil</b>, <b>username</b>, dan <b>password</b> sendiri kapan saja. ' +
        'Perubahan username &amp; password memerlukan konfirmasi password saat ini sebagai verifikasi keamanan. ' +
        'Password baru minimal <b>6 karakter</b>; username baru 3–50 karakter (huruf, angka, titik, underscore, strip).' +
      '</div></div>';

    /* Isi lingkaran avatar (dengan fallback onerror yang aman) */
    const circle = overlay.querySelector('#myAcctAvatarCircle');
    if(p.avatar_url){
      const img = document.createElement('img');
      img.src = p.avatar_url;
      img.alt = 'Avatar';
      img.className = 'my-acct-avatar-img';
      img.onerror = function(){
        circle.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'my-acct-avatar-initial';
        span.textContent = initial;
        circle.appendChild(span);
      };
      circle.appendChild(img);
    }else{
      const span = document.createElement('span');
      span.className = 'my-acct-avatar-initial';
      span.textContent = initial;
      circle.appendChild(span);
    }

    /* Wire tombol di blok avatar */
    overlay.querySelector('#myAcctAvatarChange').addEventListener('click', function(){
      openChangeAvatar(function(){
        overlay.remove();
        openMyAccount();
      });
    });
    if(p.avatar_url){
      overlay.querySelector('#myAcctAvatarClear').addEventListener('click', function(){
        confirmDialog('Hapus Foto Profil?',
          'Foto profil Anda akan dihapus dan diganti dengan inisial nama.',
          async function(){
            try{
              /* Hapus file lama dari storage (best-effort) */
              if(p.avatar_url) await API.deleteStorageFile(p.avatar_url);
              const ok = await API.adminSetMyAvatar(session.username, _getAdminPassForRpc(), '');
              if(ok){
                _adminAvatarUrl = '';
                updateAdminSession({ avatar_url: '' });
                if(typeof refreshTopbarAdmin === 'function') refreshTopbarAdmin();
                showToast('Foto profil dihapus', 'success');
                overlay.remove();
                openMyAccount();
              }else{
                showToast('Gagal menghapus foto', 'error');
              }
            }catch(err){ showToast('Gagal: ' + err.message, 'error'); }
          },
          { icon:'fa-trash', yesText:'Ya, Hapus', yesClass:'btn-danger' });
      });
    }
  }catch(err){
    console.error('[admin] getMyProfile error:', err);
    overlay.querySelector('#myAcctBody').innerHTML =
      '<div style="padding:24px;color:#dc2626"><i class="fas fa-circle-xmark"></i> Gagal memuat profil: ' + escapeHtml(err.message) + '<br>' +
      '<span style="font-size:12px;color:#64748b">Pastikan <code>supabase/akun-security.sql</code> sudah dijalankan.</span></div>';
  }
}

/* ---------- GANTI FOTO PROFIL (upload ke bucket "foto" subfolder avatar) ---------- */
function openChangeAvatar(onSuccess){
  const session = getAdminSession();
  if(!session){ showToast('Sesi tidak ditemukan, silakan login ulang', 'error'); return; }

  const overlay = crudModal('Ganti Foto Profil', 'fa-camera',
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1">' +
        '<label>Pilih Foto Baru <span style="color:#dc2626">*</span></label>' +
        '<input type="file" id="fAvatarFile" accept="image/jpeg,image/png,image/webp,image/jpg">' +
        '<div style="font-size:11.5px;color:#64748b;margin-top:4px">Format: JPG/PNG/WEBP. Maksimal 2 MB. Disarankan foto persegi (mis. 400×400).</div>' +
      '</div>' +
      '<div class="form-group" style="grid-column:1/-1">' +
        '<label>Pratinjau</label>' +
        '<div id="fAvatarPreview" class="avatar-preview-box"><i class="fas fa-image"></i><span>Belum ada file dipilih</span></div>' +
      '</div>' +
    '</div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn" id="fAvatarSave"><i class="fas fa-upload"></i> Unggah</button>'
  );

  /* Preview saat file dipilih */
  const fileInput = overlay.querySelector('#fAvatarFile');
  const previewBox = overlay.querySelector('#fAvatarPreview');
  let selectedFile = null;

  fileInput.addEventListener('change', function(){
    const file = fileInput.files && fileInput.files[0];
    selectedFile = null;
    if(!file){
      previewBox.innerHTML = '<i class="fas fa-image"></i><span>Belum ada file dipilih</span>';
      return;
    }
    /* Validasi */
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if(allowedTypes.indexOf(file.type) === -1){
      showToast('Format file harus JPG/PNG/WEBP', 'error');
      fileInput.value = '';
      previewBox.innerHTML = '<i class="fas fa-triangle-exclamation"></i><span style="color:#dc2626">Format tidak didukung</span>';
      return;
    }
    if(file.size > (SUPABASE_CONFIG.maxFileSize || 2 * 1024 * 1024)){
      showToast('Ukuran file maksimal 2 MB', 'error');
      fileInput.value = '';
      previewBox.innerHTML = '<i class="fas fa-triangle-exclamation"></i><span style="color:#dc2626">File terlalu besar (maks 2 MB)</span>';
      return;
    }
    selectedFile = file;
    /* Tampilkan preview */
    const reader = new FileReader();
    reader.onload = function(){
      previewBox.innerHTML = '<img src="' + reader.result + '" alt="Preview">';
    };
    reader.readAsDataURL(file);
  });

  /* Tombol Unggah */
  overlay.querySelector('#fAvatarSave').addEventListener('click', async function(){
    if(!selectedFile){ showToast('Pilih file foto terlebih dahulu', 'error'); return; }
    /* v2.2.1: cek password verifikasi SEBELUM upload — bila kosong (sesi
       kedaluwarsa / data hilang), jangan buang waktu & jangan buat file
       yatim di storage. Minta login ulang lebih dulu. */
    const rpcPass = _getAdminPassForRpc();
    if(!rpcPass){
      showToast('Verifikasi sesi tidak tersedia. Silakan logout & login ulang, lalu coba lagi.', 'error');
      return;
    }
    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengunggah…';
    try{
      /* 1. Upload file ke bucket "foto" subfolder "avatar" */
      const folder = 'avatar_' + (session.username || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');
      const newUrl = await API.uploadFile(SUPABASE_CONFIG.buckets.foto, selectedFile, folder);
      if(!newUrl){ throw new Error('URL upload tidak dikembalikan'); }

      /* 2. Update avatar_url via RPC (verifikasi password) */
      const ok = await API.adminSetMyAvatar(session.username, rpcPass, newUrl);
      if(!ok){
        /* Rollback: hapus file yang baru saja terupload */
        try{ await API.deleteStorageFile(newUrl); }catch(e){}
        showToast('Gagal: verifikasi password gagal. Logout & login ulang, lalu coba lagi.', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> Unggah';
        return;
      }

      /* 3. Hapus avatar lama dari storage (best-effort) */
      if(_adminAvatarUrl && _adminAvatarUrl !== newUrl){
        try{ await API.deleteStorageFile(_adminAvatarUrl); }catch(e){}
      }

      /* 4. Update memori & session */
      _adminAvatarUrl = newUrl;
      updateAdminSession({ avatar_url: newUrl });
      if(typeof refreshTopbarAdmin === 'function') refreshTopbarAdmin();

      showToast('Foto profil diperbarui', 'success');
      overlay.remove();
      if(typeof onSuccess === 'function') onSuccess();
    }catch(err){
      showToast('Gagal upload: ' + err.message, 'error');
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> Unggah';
    }
  });
}

/* ---------- UBAH USERNAME SENDIRI ---------- */
function openChangeUsername(){
  const session = getAdminSession();
  if(!session){ showToast('Sesi tidak ditemukan, silakan login ulang', 'error'); return; }

  const overlay = crudModal('Ubah Username', 'fa-user-pen',
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1"><label>Username Saat Ini</label><input type="text" value="' + escAttr(session.username) + '" disabled></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Username Baru <span style="color:#dc2626">*</span></label>' +
      '<input type="text" id="fUnameBaru" maxlength="50" autocomplete="off" placeholder="3-50 karakter (huruf/angka/._-)"></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Password Saat Ini (verifikasi) <span style="color:#dc2626">*</span></label>' +
      '<input type="password" id="fUnamePass" autocomplete="current-password"></div>' +
    '</div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn" id="fUnameSave"><i class="fas fa-check"></i> Simpan Username</button>'
  );

  overlay.querySelector('#fUnameSave').addEventListener('click', async function(){
    const baru = sanitizeInput(overlay.querySelector('#fUnameBaru').value, 50);
    const pass = overlay.querySelector('#fUnamePass').value;
    if(!baru){ showToast('Username baru wajib diisi', 'error'); return; }
    if(baru.length < 3){ showToast('Username baru minimal 3 karakter', 'error'); return; }
    if(!/^[a-zA-Z0-9._-]+$/.test(baru)){ showToast('Username hanya boleh huruf, angka, titik, underscore, strip', 'error'); return; }
    if(baru.toLowerCase() === String(session.username).toLowerCase()){ showToast('Username baru sama dengan yang lama', 'error'); return; }
    if(!pass){ showToast('Password wajib diisi untuk verifikasi', 'error'); return; }
    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan…';
    try{
      const ok = await API.adminChangeMyUsername(session.username, baru, pass);
      if(ok){
        /* Update session & memori RPC */
        updateAdminSession({ username: baru });
        setAdminRpcPass(pass); /* password tetap sama, simpan ulang utk RPC */
        /* Update label "siapa login" */
        var who = document.getElementById('adminWho');
        if(who) who.querySelector('span').textContent = (session.nama || 'Pengguna') + ' (' + baru + ')';
        showToast('Username berhasil diubah menjadi "' + baru + '"', 'success');
        overlay.remove();
      }else{
        showToast('Gagal: password salah, username sudah dipakai, atau format tidak valid', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Simpan Username';
      }
    }catch(err){ showToast('Gagal: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Simpan Username'; }
  });
}

/* ---------- GANTI PASSWORD SENDIRI (versi baru) ---------- */
function openChangePassword(){
  const session = getAdminSession();
  if(!session){ showToast('Sesi tidak ditemukan, silakan login ulang', 'error'); return; }

  const overlay = crudModal('Ganti Password', 'fa-key',
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1"><label>Password Saat Ini <span style="color:#dc2626">*</span></label><input type="password" id="fPassLama" autocomplete="current-password"></div>' +
      '<div class="form-group"><label>Password Baru <span style="color:#dc2626">*</span></label><input type="password" id="fPassBaru" autocomplete="new-password">' +
      '<div style="font-size:11.5px;color:#64748b;margin-top:4px">Minimal 6 karakter.</div></div>' +
      '<div class="form-group"><label>Ulangi Password Baru <span style="color:#dc2626">*</span></label><input type="password" id="fPassBaru2" autocomplete="new-password"></div>' +
    '</div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn" id="fPassSave"><i class="fas fa-check"></i> Simpan Password</button>'
  );

  overlay.querySelector('#fPassSave').addEventListener('click', async function(){
    const lama = overlay.querySelector('#fPassLama').value;
    const baru = overlay.querySelector('#fPassBaru').value;
    const baru2 = overlay.querySelector('#fPassBaru2').value;
    if(!lama){ showToast('Password saat ini wajib diisi', 'error'); return; }
    if(baru.length < 6){ showToast('Password baru minimal 6 karakter', 'error'); return; }
    if(baru !== baru2){ showToast('Konfirmasi password tidak sama', 'error'); return; }
    if(baru === lama){ showToast('Password baru harus berbeda dari yang lama', 'error'); return; }
    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan…';
    try{
      const ok = await API.adminChangePassword(session.username, lama, baru);
      if(ok){
        /* Update password di memori untuk RPC manajemen akun */
        setAdminRpcPass(baru);
        showToast('Password berhasil diubah', 'success');
        overlay.remove();
      }else{
        showToast('Password saat ini salah', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Simpan Password';
      }
    }catch(err){ showToast('Gagal: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Simpan Password'; }
  });
}

/* ============================================================
   MANAJEMEN AKUN (admin only) — CRUD semua akun
   ============================================================ */

/* ---------- RENDER TABEL AKUN ---------- */
function renderAdmAkun(){
  const body = document.getElementById('admAkunBody');
  if(!body) return;

  /* GUARD ADMIN-ONLY: username & password hanya boleh tampil untuk admin.
     Operator/pengunjung tidak pernah mendapatkan data ini (RPC admin_list_users
     juga menolak non-admin di sisi database — lapis kedua). */
  if(!isAdmin()){
    admAkunCache = null;
    body.innerHTML = '<tr><td colspan="8" class="empty-state" style="padding:34px"><i class="fas fa-lock"></i>Username &amp; password hanya dapat dilihat oleh <b>Admin</b>.</td></tr>';
    return;
  }

  if(!admAkunCache){
    body.innerHTML = '<tr><td colspan="8" class="empty-state" style="padding:34px"><i class="fas fa-circle-exclamation"></i>Belum bisa memuat daftar akun. Pastikan <code>supabase/akun-security.sql</code> versi terbaru sudah dijalankan.</td></tr>';
    return;
  }
  const session = getAdminSession();
  const q = (document.getElementById('admAkunSearch').value || '').toLowerCase();
  const roleFilter = document.getElementById('admAkunFilterRole').value;
  const rows = admAkunCache.filter(function(u){
    if(roleFilter && u.role !== roleFilter) return false;
    if(!q) return true;
    return String(u.username || '').toLowerCase().indexOf(q) !== -1
        || String(u.nama || '').toLowerCase().indexOf(q) !== -1;
  });

  let html = '';
  rows.forEach(function(u){
    const isSelf = session && u.username === session.username;
    const roleBadge = u.role === 'operator'
      ? '<span class="admin-role-badge role-operator">Operator</span>'
      : '<span class="admin-role-badge role-admin">Admin</span>';
    const statusBadge = u.aktif
      ? '<span class="badge-status badge-aktif">Aktif</span>'
      : '<span class="badge-status badge-nonaktif">Nonaktif</span>';
    const locked = u.locked_until && new Date(u.locked_until) > new Date();
    const lockBadge = locked
      ? ' <span class="badge-status badge-ditolak" title="Terkunci sampai ' + escapeHtml(formatDateTimeId(u.locked_until)) + '"><i class="fas fa-lock"></i> Terkunci</span>'
      : '';
    const lastLogin = u.last_login_at ? formatDateTimeId(u.last_login_at) : '<span style="color:#94a3b8">Belum pernah</span>';
    const lastPass  = u.last_password_change_at ? formatDateTimeId(u.last_password_change_at) : '<span style="color:#94a3b8">Belum pernah</span>';

    /* ----- KOLOM PASSWORD (v2.2 — khusus admin) -----
       Password asli diambil dari password_plain (arsip tampilan yang disinkronkan
       RPC saat buat akun / ganti password / reset password / login sukses).
       Nilai TIDAK diletakkan di atribut DOM — dibaca dari admAkunCache saat toggle. */
    const shown = !!(_admPassVisible[u.id] && u.password_plain);
    const passCell = u.password_plain
      ? '<div class="adm-pass-wrap">' +
          '<code class="adm-pass-value' + (shown ? ' is-shown' : '') + '">' + (shown ? escapeHtml(u.password_plain) : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') + '</code>' +
          '<button class="act-btn act-edit adm-pass-btn" title="' + (shown ? 'Sembunyikan password' : 'Tampilkan password') + '" onclick="admToggleAkunPass(\'' + u.id + '\')"><i class="fas fa-' + (shown ? 'eye-slash' : 'eye') + '"></i></button>' +
          '<button class="act-btn act-edit adm-pass-btn" title="Salin password" onclick="admCopyAkunPass(\'' + u.id + '\')"><i class="fas fa-copy"></i></button>' +
        '</div>'
      : '<span class="adm-pass-unknown" title="Password akan tercatat otomatis begitu akun ini login, mengganti password, atau di-reset oleh admin"><i>Belum tercatat</i></span>';

    html += '<tr>' +
      '<td><code style="font-weight:600">' + escapeHtml(u.username) + '</code>' + (isSelf ? ' <span style="color:#0f766e;font-size:11px">(Anda)</span>' : '') + '</td>' +
      '<td>' + passCell + '</td>' +
      '<td>' + escapeHtml(u.nama) + '</td>' +
      '<td>' + roleBadge + '</td>' +
      '<td>' + statusBadge + lockBadge + '</td>' +
      '<td>' + lastLogin + '</td>' +
      '<td>' + lastPass + '</td>' +
      '<td><div class="admin-row-actions">' +
        '<button class="act-btn act-edit" title="Edit Akun" onclick="openAkunForm(\'' + u.id + '\')"><i class="fas fa-pen"></i></button>' +
        '<button class="act-btn act-edit" title="Reset Password" onclick="admResetAkunPassword(\'' + u.id + '\')"><i class="fas fa-key"></i></button>' +
        (locked ? '<button class="act-btn act-edit" title="Buka Kunci" onclick="admUnlockAkun(\'' + u.id + '\')"><i class="fas fa-lock-open"></i></button>' : '') +
        (isSelf
          ? '<button class="act-btn act-del" title="Tidak bisa hapus diri sendiri" disabled style="opacity:.4;cursor:not-allowed"><i class="fas fa-trash"></i></button>'
          : '<button class="act-btn act-del" title="Hapus Akun" onclick="admDeleteAkun(\'' + u.id + '\')"><i class="fas fa-trash"></i></button>') +
      '</div></td>' +
      '</tr>';
  });
  body.innerHTML = html || '<tr><td colspan="8" class="empty-state" style="padding:34px"><i class="fas fa-users-slash"></i>Tidak ada akun yang cocok. Klik "Tambah Akun" untuk membuat baru.</td></tr>';
}

/* ---------- TOGGLE TAMPIL/SEMBUNYI PASSWORD (admin only) ---------- */
function admToggleAkunPass(id){
  if(!isAdmin()){ showToast('Akses ditolak: hanya Admin dapat melihat password', 'error'); return; }
  const u = (admAkunCache || []).find(function(x){ return x.id === id; });
  if(!u || !u.password_plain){ return; }
  _admPassVisible[id] = !_admPassVisible[id];
  renderAdmAkun();
}

/* ---------- SALIN PASSWORD KE CLIPBOARD (admin only) ---------- */
function admCopyAkunPass(id){
  if(!isAdmin()){ showToast('Akses ditolak: hanya Admin dapat menyalin password', 'error'); return; }
  const u = (admAkunCache || []).find(function(x){ return x.id === id; });
  if(!u || !u.password_plain){ showToast('Password belum tercatat', 'info'); return; }
  const done = function(){ showToast('Password ' + u.username + ' disalin ke clipboard', 'success'); };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(u.password_plain).then(done).catch(function(){ _copyFallback(u.password_plain, done); });
  }else{
    _copyFallback(u.password_plain, done);
  }
}
function _copyFallback(text, cb){
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    ta.remove();
    cb && cb();
  }catch(e){ showToast('Gagal menyalin password', 'error'); }
}

/* ---------- FORM TAMBAH / EDIT AKUN ---------- */
function openAkunForm(id){
  const u = id ? (admAkunCache || []).find(function(x){ return x.id === id; }) : null;
  const isEdit = !!u;
  const session = getAdminSession();
  if(!session){ showToast('Sesi tidak ditemukan', 'error'); return; }

  const overlay = crudModal(isEdit ? 'Edit Akun' : 'Tambah Akun', isEdit ? 'fa-user-pen' : 'fa-user-plus',
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1"><label>Username ' + (isEdit ? '<span style="color:#64748b">(tidak dapat diubah)</span>' : '<span style="color:#dc2626">*</span>') + '</label>' +
      (isEdit
        ? '<input type="text" value="' + escAttr(u.username) + '" disabled>'
        : '<input type="text" id="fAkunUname" maxlength="50" autocomplete="off" placeholder="3-50 karakter (huruf/angka/._-)">') +
      '</div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Nama Lengkap <span style="color:#dc2626">*</span></label>' +
      '<input type="text" id="fAkunNama" maxlength="100" value="' + escAttr(u ? u.nama : '') + '"></div>' +
      '<div class="form-group"><label>Role</label><select id="fAkunRole">' +
        '<option value="admin"' + (u && u.role === 'admin' ? ' selected' : '') + '>Admin (akses penuh + kelola akun)</option>' +
        '<option value="operator"' + (u && u.role === 'operator' ? ' selected' : (!u ? ' selected' : '')) + '>Operator (akses data saja)</option>' +
      '</select></div>' +
      '<div class="form-group"><label>Status</label><select id="fAkunAktif">' +
        '<option value="true"' + (!u || u.aktif ? ' selected' : '') + '>Aktif</option>' +
        '<option value="false"' + (u && !u.aktif ? ' selected' : '') + '>Nonaktif</option>' +
      '</select></div>' +
      (isEdit
        ? ''
        : '<div class="form-group" style="grid-column:1/-1"><label>Password Awal <span style="color:#dc2626">*</span></label>' +
          '<input type="password" id="fAkunPass" autocomplete="new-password" placeholder="Minimal 6 karakter">' +
          '<div style="font-size:11.5px;color:#64748b;margin-top:4px">Password bisa diubah oleh pengguna sendiri atau di-reset oleh admin lain.</div></div>') +
    '</div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn" id="fAkunSave"><i class="fas fa-floppy-disk"></i> Simpan</button>'
  );

  overlay.querySelector('#fAkunSave').addEventListener('click', async function(){
    const nama = sanitizeInput(overlay.querySelector('#fAkunNama').value, 100);
    const role = overlay.querySelector('#fAkunRole').value;
    const aktif = overlay.querySelector('#fAkunAktif').value === 'true';
    if(!nama){ showToast('Nama lengkap wajib diisi', 'error'); return; }

    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan…';
    try{
      if(isEdit){
        const ok = await API.adminUpdateUser(session.username, _getAdminPassForRpc(), u.id, nama, role, aktif);
        if(!ok){ showToast('Gagal: tidak bisa mengubah akun. Mungkin menonaktifkan admin terakhir.', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan'; return; }
        showToast('Akun diperbarui', 'success');
      }else{
        const uname = sanitizeInput(overlay.querySelector('#fAkunUname').value, 50);
        const pass  = overlay.querySelector('#fAkunPass').value;
        if(!uname){ showToast('Username wajib diisi', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan'; return; }
        if(uname.length < 3 || !/^[a-zA-Z0-9._-]+$/.test(uname)){ showToast('Username min 3 karakter, hanya huruf/angka/._-', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan'; return; }
        if(pass.length < 6){ showToast('Password minimal 6 karakter', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan'; return; }
        const result = await API.adminCreateUser(session.username, _getAdminPassForRpc(), uname, pass, nama, role);
        if(!result || !result.length){ showToast('Gagal: username sudah dipakai atau input tidak valid', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan'; return; }
        showToast('Akun "' + uname + '" ditambahkan', 'success');
      }
      overlay.remove();
      adminRefreshAll();
    }catch(err){ showToast('Gagal: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan'; }
  });
}

/* ---------- RESET PASSWORD AKUN LAIN ---------- */
function admResetAkunPassword(id){
  const u = (admAkunCache || []).find(function(x){ return x.id === id; });
  if(!u){ return; }
  const session = getAdminSession();

  const overlay = crudModal('Reset Password — ' + u.username, 'fa-key',
    '<div class="form-grid">' +
      '<div class="form-group" style="grid-column:1/-1"><label>Password Baru untuk <b>' + escapeHtml(u.username) + '</b> <span style="color:#dc2626">*</span></label>' +
      '<input type="password" id="fResetPass" autocomplete="new-password" placeholder="Minimal 6 karakter"></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Ulangi Password <span style="color:#dc2626">*</span></label>' +
      '<input type="password" id="fResetPass2" autocomplete="new-password"></div>' +
      '<div class="csv-hintbox" style="grid-column:1/-1"><i class="fas fa-circle-info"></i><div>' +
        'Password lama akun ini tidak perlu diketahui. Setelah di-reset, akun langsung bisa login dengan password baru. ' +
        'Counter gagal login juga ikut direset.' +
      '</div></div>' +
    '</div>',
    '<button class="btn btn-ghost" data-close>Batal</button>' +
    '<button class="btn btn-danger" id="fResetSave"><i class="fas fa-check"></i> Reset Password</button>'
  );

  overlay.querySelector('#fResetSave').addEventListener('click', async function(){
    const baru = overlay.querySelector('#fResetPass').value;
    const baru2 = overlay.querySelector('#fResetPass2').value;
    if(baru.length < 6){ showToast('Password baru minimal 6 karakter', 'error'); return; }
    if(baru !== baru2){ showToast('Konfirmasi password tidak sama', 'error'); return; }
    const btn = this;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mereset…';
    try{
      const ok = await API.adminResetUserPassword(session.username, _getAdminPassForRpc(), u.id, baru);
      if(ok){ showToast('Password "' + u.username + '" berhasil di-reset', 'success'); overlay.remove(); adminRefreshAll(); }
      else{ showToast('Gagal mereset password', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Reset Password'; }
    }catch(err){ showToast('Gagal: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Reset Password'; }
  });
}

/* ---------- UNLOCK AKUN ---------- */
function admUnlockAkun(id){
  const u = (admAkunCache || []).find(function(x){ return x.id === id; });
  if(!u){ return; }
  const session = getAdminSession();
  confirmDialog('Buka Kunci Akun?',
    'Akun <b>' + escapeHtml(u.username) + '</b> akan dibuka dari status terkunci. Counter gagal login juga direset.',
    async function(){
      try{
        const ok = await API.adminUnlockUser(session.username, _getAdminPassForRpc(), u.id);
        if(ok){ showToast('Akun "' + u.username + '" dibuka', 'success'); adminRefreshAll(); }
        else showToast('Gagal membuka kunci', 'error');
      }catch(err){ showToast('Gagal: ' + err.message, 'error'); }
    },
    { icon:'fa-lock-open', yesText:'Ya, Buka Kunci', yesClass:'btn' });
}

/* ---------- HAPUS AKUN ---------- */
function admDeleteAkun(id){
  const u = (admAkunCache || []).find(function(x){ return x.id === id; });
  if(!u){ return; }
  const session = getAdminSession();
  if(u.username === session.username){ showToast('Tidak bisa menghapus akun sendiri', 'error'); return; }

  confirmDialog('Hapus Akun?',
    'Akun <b>' + escapeHtml(u.username) + '</b> (' + escapeHtml(u.nama) + ') akan dihapus permanen. ' +
    'Tindakan ini tidak dapat dibatalkan.',
    async function(){
      try{
        const ok = await API.adminDeleteUser(session.username, _getAdminPassForRpc(), u.id);
        if(ok){ showToast('Akun dihapus', 'success'); adminRefreshAll(); }
        else showToast('Gagal: tidak bisa menghapus (admin terakhir tidak boleh dihapus)', 'error');
      }catch(err){ showToast('Gagal: ' + err.message, 'error'); }
    },
    { icon:'fa-trash', yesText:'Ya, Hapus Akun', yesClass:'btn-danger' });
}
