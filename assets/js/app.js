/* ============================================================
   MANTAF v2 — APP.JS
   Router section, sidebar, topbar, boot aplikasi
   ============================================================ */

const SECTION_PARTIALS = {
  dashboard:   'dashboard',
  pengumuman:  'pengumuman',
  bezetting:   'bezetting',
  pesertaUkom: 'peserta-ukom',
  ukom:        'ukom',
  status:      'status',
  admin:       'admin'
};

const SECTION_IDS = {
  dashboard:   'secDashboard',
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

/* ---------- BOOT ---------- */
(async function boot(){
  /* cek protokol */
  if(location.protocol === 'file:'){
    const w = document.getElementById('fileProtocolWarn');
    if(w) w.style.display = 'flex';
    return;
  }

  startClock();

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
