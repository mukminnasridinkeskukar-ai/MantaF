/* ============================================================
   MANTAF v3 — ROLES.JS
   Sistem multi-user 5 role + matriks hak akses
   ============================================================
   Role:
     superadmin         — akses penuh + manajemen semua akun (pengganti "admin")
     operator           — CRUD Peserta UKOM + Import CSV, lainnya lihat saja
     pimpinan_faskes    — dashboard faskes sendiri (monitoring unit_kerja akun)
     observer           — memantau seluruh data (read-only)
     pejabat_fungsional — dashboard pribadi + daftar UKOM + cek status sendiri

   Catatan kompatibilitas: role lama 'admin' tetap diterima & diperlakukan
   identik dengan 'superadmin' (akun lama yang belum dimigrasi tetap jalan).
   ============================================================ */

const MANTAF_ROLES = {
  superadmin: {
    key: 'superadmin',
    label: 'Superadmin',
    short: 'Superadmin',
    icon: 'fa-user-shield',
    cssClass: 'role-superadmin',
    desc: 'Akses penuh seluruh menu, kelola data & seluruh akun pengguna.'
  },
  operator: {
    key: 'operator',
    label: 'Operator',
    short: 'Operator',
    icon: 'fa-keyboard',
    cssClass: 'role-operator',
    desc: 'Mengelola data Peserta UKOM (tambah/ubah/hapus & import CSV). Data lain lihat saja.'
  },
  pimpinan_faskes: {
    key: 'pimpinan_faskes',
    label: 'Pimpinan Faskes',
    short: 'Pimpinan',
    icon: 'fa-user-tie',
    cssClass: 'role-pimpinan',
    desc: 'Memantau peserta UKOM & bezetting faskesnya (berdasar Unit Kerja akun).'
  },
  observer: {
    key: 'observer',
    label: 'Observer',
    short: 'Observer',
    icon: 'fa-binoculars',
    cssClass: 'role-observer',
    desc: 'Memantau seluruh data & statistik platform (hanya lihat, tidak mengubah).'
  },
  pejabat_fungsional: {
    key: 'pejabat_fungsional',
    label: 'Pejabat Fungsional',
    short: 'Pejabat',
    icon: 'fa-user-doctor',
    cssClass: 'role-pejabat',
    desc: 'Mendaftar UKOM, memantau riwayat & status pendaftaran pribadi.'
  }
};

/* Urutan tampil role di dropdown / legenda */
const MANTAF_ROLE_ORDER = ['superadmin', 'operator', 'pimpinan_faskes', 'observer', 'pejabat_fungsional'];

/* ---------- HELPER LABEL ---------- */
function mantafRoleLabel(role){
  const r = MANTAF_ROLES[String(role || '').trim()];
  if(r) return r.label;
  const key = String(role || '').trim().toLowerCase();
  if(key === 'admin') return MANTAF_ROLES.superadmin.label; /* legacy */
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Pengguna';
}
function mantafRoleIcon(role){
  const r = MANTAF_ROLES[String(role || '').trim()] ||
            MANTAF_ROLES[String(role || '').trim().toLowerCase() === 'admin' ? 'superadmin' : ''];
  return r ? r.icon : 'fa-user';
}
function mantafRoleBadge(role){
  const key = (String(role || '').trim().toLowerCase() === 'admin') ? 'superadmin' : String(role || '').trim();
  const r = MANTAF_ROLES[key];
  if(!r) return '<span class="admin-role-badge role-operator">' + escapeHtml(mantafRoleLabel(role)) + '</span>';
  return '<span class="admin-role-badge ' + r.cssClass + '"><i class="fas ' + r.icon + '"></i> ' + r.label + '</span>';
}

/* ---------- HELPER CEK ROLE (dipakai lintas modul) ----------
   getAdminSession() didefinisikan di utils.js (sessionStorage mantafSession). */
function _roleKey(){
  const s = (typeof getAdminSession === 'function') ? getAdminSession() : null;
  if(!s) return '';
  const r = String(s.role || '').trim().toLowerCase();
  return (r === 'admin') ? 'superadmin' : r;
}
function isSuperadmin()      { return _roleKey() === 'superadmin'; }
function isOperator()        { return _roleKey() === 'operator'; }
function isPimpinanFaskes()  { return _roleKey() === 'pimpinan_faskes'; }
function isObserver()        { return _roleKey() === 'observer'; }
function isPejabatFungsional(){ return _roleKey() === 'pejabat_fungsional'; }

/* isAdmin(): KOMPATIBILITAS DENGAN KODE LAMA — artinya "pengelola sistem"
   (superadmin atau legacy admin). Didefinisikan ulang di sini; utils.js versi
   lama sudah tidak memuat definisi duplikat. */
function isAdmin(){
  return isSuperadmin();
}

/* ---------- MATRIKS HAK AKSES ----------
   Kembali TRUE bila sesi login boleh MENGELOLA (CRUD) menu tersebut. */
function _canManage(menu){
  const k = _roleKey();
  if(k === 'superadmin') return true;                       /* superadmin: semua */
  if(k === 'operator' && menu === 'peserta') return true;   /* operator: peserta saja */
  return false;
}
function canManagePengumuman(){ return _canManage('pengumuman'); }
function canManageBezetting(){  return _canManage('bezetting'); }
function canManagePeserta(){    return _canManage('peserta'); }
function canManagePetunjuk(){   return _canManage('petunjuk'); }

/* Boleh membuka Panel Admin (manajemen data)? — hanya superadmin & operator */
function canOpenAdminPanel(){
  const k = _roleKey();
  return k === 'superadmin' || k === 'operator';
}

/* Section dashboard default sesuai role (dipakai saat login & klik tombol topbar) */
function defaultSectionForRole(){
  const k = _roleKey();
  switch(k){
    case 'superadmin':
    case 'operator':        return 'admin';
    case 'pimpinan_faskes': return 'dashboardFaskes';
    case 'pejabat_fungsional': return 'dashboardSaya';
    case 'observer':        return 'dashboard';
    default:                return 'dashboard';
  }
}

/* ---------- MENU SIDEBAR DINAMIS PER ROLE ----------
   Struktur menu dideklarasikan di satu tempat; index.html dirender ulang
   oleh renderSidebarMenu() saat boot & setelah login/logout. */
const MANTAF_MENU = [
  {
    group: 'Menu Utama', icon: 'fa-house-flag',
    items: [
      { id:'dashboard',   icon:'fa-gauge-high',       label:'Dashboard',            roles:['guest','superadmin','operator','pimpinan_faskes','observer','pejabat_fungsional'] },
      { id:'dashboardSaya', icon:'fa-user-check',     label:'Dashboard Saya',       roles:['pejabat_fungsional'] },
      { id:'dashboardFaskes', icon:'fa-hospital',     label:'Dashboard Faskes',     roles:['pimpinan_faskes'] },
      { id:'petunjuk',    icon:'fa-book-open-reader', label:'Petunjuk Penggunaan',  roles:['guest','superadmin','operator','pimpinan_faskes','observer','pejabat_fungsional'] }
    ]
  },
  {
    group: 'Data & Informasi', icon: 'fa-database',
    items: [
      { id:'pengumuman',  icon:'fa-bullhorn',          label:'Pengumuman',          roles:['guest','superadmin','operator','pimpinan_faskes','observer','pejabat_fungsional'] },
      { id:'bezetting',   icon:'fa-table-cells-large', label:'Bezetting',           roles:['guest','superadmin','operator','pimpinan_faskes','observer','pejabat_fungsional'] },
      { id:'pesertaUkom', icon:'fa-users',             label:'Data Peserta UKOM',   roles:['guest','superadmin','operator','pimpinan_faskes','observer','pejabat_fungsional'] }
    ]
  },
  {
    group: 'Layanan', icon: 'fa-hands-holding-circle',
    items: [
      { id:'ukom',   icon:'fa-file-pen',             label:'Daftar UKOM',         roles:['guest','superadmin','operator','pejabat_fungsional'] },
      { id:'status', icon:'fa-magnifying-glass-chart', label:'Cek Status',        roles:['guest','superadmin','operator','pimpinan_faskes','observer','pejabat_fungsional'] },
      { id:'tryout', icon:'fa-graduation-cap',       label:'Try Out',             roles:['guest','superadmin','operator','pimpinan_faskes','observer','pejabat_fungsional'], href:'tryoutukom.html' },
      { id:'admin',  icon:'fa-sliders',              label:'Panel Admin',         roles:['superadmin','operator'] }
    ]
  }
];

/* Render ulang <nav> sidebar sesuai role sesi aktif.
   Dipanggil dari boot() & refreshTopbarAdmin(). */
function renderSidebarMenu(){
  const mount = document.getElementById('sidebarMenuMount');
  if(!mount) return;
  const s = (typeof getAdminSession === 'function') ? getAdminSession() : null;
  const roleKey = s ? ((String(s.role).toLowerCase() === 'admin') ? 'superadmin' : String(s.role)) : 'guest';

  let html = '';
  MANTAF_MENU.forEach(function(group){
    const items = group.items.filter(function(it){ return it.roles.indexOf(roleKey) !== -1; });
    if(!items.length) return;
    html += '<div class="menu-group">' +
      '<div class="menu-group-label"><i class="fas ' + group.icon + '"></i> ' + group.group + '</div>' +
      '<nav class="menu">';
    items.forEach(function(it){
      const active = (typeof _currentSection !== 'undefined' && _currentSection === it.id) ? ' active' : '';
      if(it.href){
        html += '<button' + active + ' onclick="location.href=\'' + it.href + '\'" title="' + escapeHtml(it.label) + '">' +
                '<i class="fas ' + it.icon + '"></i><span>' + escapeHtml(it.label) + '</span></button>';
      }else{
        html += '<button' + active + ' data-section="' + it.id + '" onclick="showSection(\'' + it.id + '\',this)" title="' + escapeHtml(it.label) + '">' +
                '<i class="fas ' + it.icon + '"></i><span>' + escapeHtml(it.label) + '</span></button>';
      }
    });
    html += '</nav></div>';
  });

  /* Blok akun: Akun Saya + Logout (hanya saat login) */
  if(s){
    html += '<div class="menu-group">' +
      '<div class="menu-group-label"><i class="fas fa-circle-user"></i> Akun</div>' +
      '<nav class="menu">' +
        '<button onclick="openMyAccount()" title="Akun Saya"><i class="fas fa-id-card"></i><span>Akun Saya</span></button>' +
        '<button onclick="logoutAdmin()" title="Keluar"><i class="fas fa-right-from-bracket"></i><span>Keluar</span></button>' +
      '</nav></div>';
  }

  mount.innerHTML = html;
}
