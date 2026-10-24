/* ============================================================
   MANTAF v2 — APP.JS
   Router section, sidebar, topbar, boot aplikasi
   ============================================================ */

const SECTION_PARTIALS = {
  dashboard:   'dashboard',
  dashboardSaya: 'dashboard-saya',
  dashboardFaskes: 'dashboard-faskes',
  petunjuk:    'petunjuk',
  pengumuman:  'pengumuman',
  bezetting:   'bezetting',
  pesertaUkom: 'peserta-ukom',
  ukom:        'ukom',
  status:      'status',
  admin:       'admin'
};

const SECTION_IDS = {
  dashboard:   'secDashboard',
  dashboardSaya: 'secDashboardSaya',
  dashboardFaskes: 'secDashboardFaskes',
  petunjuk:    'secPetunjuk',
  pengumuman:  'secPengumuman',
  bezetting:   'secBezetting',
  pesertaUkom: 'secPesertaUkom',
  ukom:        'secUkom',
  status:      'secStatus',
  admin:       'secAdmin'
};

let _currentSection = null;

/* ---------- PINDAH SECTION ---------- */
async function showSection(id, el){
  const sidebar = document.getElementById('sidebar');

  /* aktifkan tombol menu */
  document.querySelectorAll('.menu button').forEach(function(btn){ btn.classList.remove('active'); });
  if(el) el.classList.add('active');
  else{
    const btn = document.querySelector('.menu button[data-section="' + id + '"]');
    if(btn) btn.classList.add('active');
  }

  /* muat partial bila belum ada */
  const partial = SECTION_PARTIALS[id];
  if(!partial) return;
  await Loader.mount(SECTION_IDS[id] || ('sec' + id), partial);

  /* sembunyikan lainnya, tampilkan ini */
  document.querySelectorAll('#sectionsMount > .section').forEach(function(sec){
    sec.classList.remove('active');
  });
  const target = document.getElementById(SECTION_IDS[id] || ('sec' + id));
  if(target) target.classList.add('active');

  /* update topbar */
  const meta = SECTION_META[id] || { title: id, subtitle: '' };
  document.getElementById('topbarTitle').textContent = meta.title;
  document.getElementById('topbarSubtitle').textContent = meta.subtitle;

  _currentSection = id;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  /* tutup sidebar mobile */
  closeMobileSidebar();
}

/* ---------- SIDEBAR ---------- */
function toggleSidebar(){
  if(window.innerWidth <= 900){
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('mobile-open');
    ensureMobileBackdrop();
  }else{
    const sidebar = document.getElementById('sidebar');
    const profile = document.getElementById('profileSection');
    const collapsed = sidebar.classList.toggle('collapsed');
    if(profile) profile.classList.toggle('collapsed', collapsed);
    localStorage.setItem('mantafSidebarCollapsed', collapsed ? '1' : '0');
  }
}

function closeMobileSidebar(){
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('mobile-open');
  const backdrop = document.getElementById('mobileBackdrop');
  if(backdrop) backdrop.remove();
}

function ensureMobileBackdrop(){
  if(document.getElementById('mobileBackdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'mobileBackdrop';
  backdrop.className = 'sidebar-backdrop';
  backdrop.onclick = closeMobileSidebar;
  document.body.appendChild(backdrop);
}

/* ---------- JAM TOPBAR ---------- */
function startClock(){
  function tick(){
    const el = document.getElementById('topbarClock');
    if(!el) return;
    const now = new Date();
    const t = now.toLocaleDateString('id-ID', { weekday:'short', day:'2-digit', month:'short' }) +
      ' · ' + now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    el.querySelector('span').textContent = t;
  }
  tick();
  setInterval(tick, 30000);
}

/* ---------- TOMBOL MASUK DI TOPBAR ----------
   - Belum login → label "Masuk" → klik buka halaman login platform
   - Sudah login → avatar/inisial + nama → klik membuka halaman default role:
       superadmin/operator  → Panel Admin
       pimpinan faskes      → Dashboard Faskes
       pejabat fungsional   → Dashboard Saya
       observer             → Dashboard
   - Dipanggil setelah login/logout/upload-avatar agar topbar selalu sinkron. */
function refreshTopbarAdmin(){
  const btn     = document.getElementById('topbarAdminBtn');
  const avatar  = document.getElementById('topbarAdminAvatar');
  const label   = document.getElementById('topbarAdminLabel');
  if(btn && avatar && label){

    const s = (typeof getAdminSession === 'function') ? getAdminSession() : null;
    if(s){
    /* Sudah login — tampilkan avatar atau inisial */
    const initial = (s.nama || s.username || 'A').trim().charAt(0).toUpperCase();
    const url = (typeof _adminAvatarUrl !== 'undefined') ? _adminAvatarUrl : (s.avatar_url || '');
    if(url){
      /* Bangun elemen img dengan addEventListener onerror (lebih aman daripada inline) */
      avatar.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.alt = s.nama || s.username || 'Avatar';
      img.onerror = function(){
        avatar.innerHTML = '<i class="fas fa-user-shield"></i>';
      };
      avatar.appendChild(img);
    }else{
      avatar.innerHTML = '<span class="avatar-initial"></span>';
      avatar.querySelector('.avatar-initial').textContent = initial;
    }
    label.textContent = s.nama || s.username;
    btn.classList.add('is-logged-in');
    btn.title = mantafRoleLabel(s.role) + ' — ' + (s.nama || s.username);
    }else{
    /* Belum login */
    avatar.innerHTML = '<i class="fas fa-user-shield"></i>';
    label.textContent = 'Masuk';
    btn.classList.remove('is-logged-in');
    btn.title = 'Masuk ke Platform';
    }
  }

  /* Sinkronkan profil sidebar + menu dinamis per role */
  refreshSidebarProfile();
  if(typeof renderSidebarMenu === 'function') renderSidebarMenu();
}

/* ---------- PROFIL SIDEBAR ----------
   Bagian profil sidebar mengikuti sesi login:
   - Login (admin/operator) → foto profil akun (avatar_url, fallback inisial
     via ui-avatars), nama lengkap, dan role.
   - Belum login → logo MantaF + teks default.
   Dipanggil dari refreshTopbarAdmin() sehingga otomatis tersinkron setelah
   login, logout, ganti foto, dan hapus foto. */
const MANTAF_LOGO_URL = 'assets/img/logo-512.png';
const MANTAF_LOGO_FALLBACK = 'https://ui-avatars.com/api/?name=MantaF&background=0f766e&color=fff';

function refreshSidebarProfile(){
  const img    = document.getElementById('profileImg');
  const nameEl = document.querySelector('#profileSection .profile-name');
  const roleEl = document.querySelector('#profileSection .profile-role');
  if(!img || !nameEl || !roleEl) return;

  const s = (typeof getAdminSession === 'function') ? getAdminSession() : null;
  if(s){
    const initial = (s.nama || s.username || 'A').trim().charAt(0).toUpperCase();
    const initialUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(initial) + '&background=0f766e&color=fff';
    const url = (typeof _adminAvatarUrl !== 'undefined' && _adminAvatarUrl) ? _adminAvatarUrl : (s.avatar_url || '');
    img.onerror = function(){
      img.onerror = null;
      img.src = initialUrl;
    };
    img.src = url || initialUrl;
    img.alt = s.nama || s.username || 'Avatar';
    nameEl.textContent = s.nama || s.username || 'Pengguna';
    roleEl.textContent = mantafRoleLabel(s.role);
  }else{
    img.onerror = function(){
      img.onerror = null;
      img.src = MANTAF_LOGO_FALLBACK;
    };
    img.src = MANTAF_LOGO_URL;
    img.alt = 'MantaF';
    nameEl.textContent = 'MantaF';
    roleEl.textContent = 'Platform Jabfung Kesehatan';
  }
}

function goAdminFromTopbar(){
  /* v3: arahkan sesuai role saat login; belum login → halaman login platform */
  if(typeof getAdminSession === 'function' && getAdminSession()){
    showSection(defaultSectionForRole());
    return;
  }
  const menuBtn = document.querySelector('.menu button[data-section="admin"]');
  if(menuBtn) showSection('admin', menuBtn);
  else showSection('admin');
}

/* ---------- BOOT ---------- */
(async function boot(){
  /* cek protokol */
  if(location.protocol === 'file:'){
    const w = document.getElementById('fileProtocolWarn');
    if(w) w.style.display = 'flex';
    return;
  }

  startClock();
  refreshTopbarAdmin();

  /* muat landing partial */
  try{
    document.getElementById('landingPage').innerHTML = await Loader.load('landing');
  }catch(err){
    document.getElementById('landingPage').innerHTML =
      '<div style="color:#fff;padding:120px 20px;text-align:center">Gagal memuat halaman landing: ' + escapeHtml(err.message) + '</div>';
  }

  /* splash: animasi judul + timing */
  (function initSplash(){
    const title = 'MantaF';
    const titleEl = document.getElementById('splashTitle');
    if(titleEl){
      for(let i = 0; i < title.length; i++){
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = title[i];
        span.style.animationDelay = (0.8 + i * 0.12) + 's';
        titleEl.appendChild(span);
      }
    }
    setTimeout(function(){
      const splash = document.getElementById('splashScreen');
      if(splash) splash.classList.add('fade-out');
      setTimeout(function(){
        if(splash) splash.style.display = 'none';
        initLandingPage();
      }, 800);
    }, 3200);
  })();

  /* sidebar collapsed dari preferensi tersimpan (desktop) */
  if(localStorage.getItem('mantafSidebarCollapsed') === '1' && window.innerWidth > 900){
    document.getElementById('sidebar').classList.add('collapsed');
    const profile = document.getElementById('profileSection');
    if(profile) profile.classList.add('collapsed');
  }
})();
