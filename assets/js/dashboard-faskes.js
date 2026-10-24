/* ============================================================
   MANTAF v3 — DASHBOARD-FASKES.JS
   Dashboard Pimpinan Faskes (read-only monitoring):
   - Statistik peserta UKOM milik unit kerja/faskes akun
   - Donut status verifikasi + distribusi jenis UKOM
   - Tabel peserta faskes dengan pencarian & paginasi
   ============================================================ */

let dfInited = false;
let dfCache = [];
let dfPage = 1;
const DF_PER_PAGE = 12;

SectionInit['dashboard-faskes'] = function(){
  if(dfInited){ loadDashboardFaskes(); return; }
  dfInited = true;
  loadDashboardFaskes();
};

/* Unit kerja akun pimpinan (session) — distandarkan agar pencocokan toleran */
function _dfUnitName(){
  const s = getAdminSession();
  return s ? String(s.unit_kerja || '').trim().toLowerCase() : '';
}

async function loadDashboardFaskes(){
  const s = getAdminSession();
  if(!s){ showToast('Sesi tidak ditemukan, silakan login ulang', 'error'); return; }

  /* --- Kartu profil faskes --- */
  const namaEl = document.getElementById('dfNama');
  const metaEl = document.getElementById('dfMeta');
  if(namaEl) namaEl.textContent = s.nama || s.username || 'Pimpinan Faskes';
  if(metaEl){
    const bits = [mantafRoleLabel(s.role)];
    if(s.unit_kerja) bits.push(s.unit_kerja);
    metaEl.textContent = bits.join(' · ');
  }

  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }

  const body = document.getElementById('dfBody');
  if(!body) return;
  body.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:#64748b"><i class="fas fa-spinner fa-spin"></i> Memuat data faskes…</td></tr>';

  if(!s.unit_kerja){
    body.innerHTML = '<tr><td colspan="7" class="empty-state" style="padding:34px"><i class="fas fa-hospital"></i>' +
      'Unit Kerja / Faskes belum diatur pada akun Anda.<br>' +
      '<span style="font-size:12.5px">Hubungi <b>Superadmin</b> untuk mengisi Unit Kerja melalui menu Manajemen Akun.</span></td></tr>';
    return;
  }

  try{
    const [peserta, bezetting] = await Promise.all([
      API.getPesertaUkom(),
      API.getDashboardStats ? Promise.resolve(null) : Promise.resolve(null)
    ]);
    dfCache = peserta || [];

    /* Lowongan (semua instansi) — konteks global ringan */
    try{
      const bez = await sbQuery(db.from('bezetting').select('lowongan'));
      const lowongan = (bez || []).reduce(function(sum, r){ return sum + (parseInt(r.lowongan, 10) || 0); }, 0);
      const elL = document.getElementById('dfLowongan');
      if(elL) elL.textContent = lowongan;
    }catch(e){ /* abaikan */ }

    renderFaskesStats();
    renderFaskesPeserta();
  }catch(err){
    console.error('[dashboard-faskes] gagal memuat:', err);
    body.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:#dc2626">' +
      '<i class="fas fa-triangle-exclamation"></i> Gagal memuat data: ' + escapeHtml(err.message) + '</td></tr>';
  }
}

/* Peserta milik faskes: cocokkan unit kerja peserta dengan unit kerja akun
   (pencocokan longgar — cukup salah satu memuat yang lain) */
function _faskesRows(){
  const unit = _dfUnitName();
  if(!unit) return [];
  return dfCache.filter(function(p){
    const u = String(p.nama_unit_kerja || '').trim().toLowerCase();
    if(!u) return false;
    return u === unit || u.indexOf(unit) !== -1 || unit.indexOf(u) !== -1;
  });
}

function renderFaskesStats(){
  const rows = _faskesRows();

  /* Kartu angka */
  const cnt = {
    total: rows.length,
    menunggu: rows.filter(function(r){ return ['Menunggu','Perbaikan'].indexOf(r.status_verifikasi) !== -1; }).length,
    disetujui: rows.filter(function(r){ return r.status_verifikasi === 'Disetujui'; }).length
  };
  const set = function(id, v){ const el = document.getElementById(id); if(el) el.textContent = v; };
  set('dfTotal', cnt.total); set('dfMenunggu', cnt.menunggu); set('dfDisetujui', cnt.disetujui);

  /* Donut status */
  const stats = [
    { k:'Disetujui',   id:'dfcDisetujui',   c:'#16a34a' },
    { k:'Ditolak',     id:'dfcDitolak',     c:'#dc2626' },
    { k:'Dilimpahkan', id:'dfcDilimpahkan', c:'#3b82f6' },
    { k:'Perbaikan',   id:'dfcPerbaikan',   c:'#f97316' },
    { k:'Proses',      id:'dfcProses',      c:'#f59e0b' },
    { k:'Menunggu',    id:'dfcMenunggu',    c:'#eab308' }
  ];
  const CIRC = 2 * Math.PI * 45; /* r=45 ≈ 282.74 */
  let offset = 0;
  stats.forEach(function(st){
    const n = rows.filter(function(r){ return r.status_verifikasi === st.k; }).length;
    set('dfCnt' + st.k, n);
    const circle = document.getElementById(st.id);
    if(circle){
      const frac = cnt.total ? (n / cnt.total) : 0;
      const len = frac * CIRC;
      circle.setAttribute('stroke-dasharray', len + ' ' + (CIRC - len));
      circle.setAttribute('stroke-dashoffset', -offset);
      offset += len;
    }
  });
  set('dfChartTotal', cnt.total);

  /* Distribusi jenis UKOM */
  const jenisMap = {};
  rows.forEach(function(r){
    const j = String(r.jenis_ukom || 'Tidak diisi').trim() || 'Tidak diisi';
    jenisMap[j] = (jenisMap[j] || 0) + 1;
  });
  const jenisList = Object.keys(jenisMap).sort(function(a, b){ return jenisMap[b] - jenisMap[a]; });
  const jenisEl = document.getElementById('dfJenisList');
  if(jenisEl){
    if(!jenisList.length){
      jenisEl.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px 0">Belum ada data peserta faskes Anda.</div>';
    }else{
      const colors = ['#0f766e', '#14b8a6', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981'];
      jenisEl.innerHTML = jenisList.map(function(j, i){
        const pct = cnt.total ? Math.round(jenisMap[j] * 100 / cnt.total) : 0;
        return '<div style="margin-bottom:10px">' +
          '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">' +
            '<span style="color:#334155">' + escapeHtml(j) + '</span>' +
            '<span style="color:#64748b;font-weight:600">' + jenisMap[j] + ' (' + pct + '%)</span>' +
          '</div>' +
          '<div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:' + colors[i % colors.length] + ';border-radius:99px"></div>' +
          '</div></div>';
      }).join('');
    }
  }
}

function renderFaskesPeserta(){
  const body = document.getElementById('dfBody');
  if(!body) return;

  const unit = _dfUnitName();
  if(!unit){
    body.innerHTML = '<tr><td colspan="7" class="empty-state" style="padding:34px"><i class="fas fa-hospital"></i>Unit Kerja / Faskes belum diatur pada akun Anda.</td></tr>';
    return;
  }

  const qEl = document.getElementById('dfSearch');
  const q = (qEl && qEl.value ? qEl.value : '').toLowerCase();
  let rows = _faskesRows();
  if(q){
    rows = rows.filter(function(p){
      return String(p.nama_tanpa_gelar || '').toLowerCase().indexOf(q) !== -1 ||
             String(p.nik || '').indexOf(q) !== -1 ||
             String(p.nip || '').indexOf(q) !== -1;
    });
  }

  if(!rows.length){
    body.innerHTML = '<tr><td colspan="7" class="empty-state" style="padding:34px"><i class="fas fa-users-slash"></i>' +
      (q ? 'Tidak ada peserta yang cocok dengan pencarian.' : 'Belum ada peserta terdaftar dari faskes Anda.') + '</td></tr>';
    const pag = document.getElementById('dfPag');
    if(pag) pag.innerHTML = '';
    return;
  }

  /* Paginasi */
  const totalPages = Math.max(1, Math.ceil(rows.length / DF_PER_PAGE));
  if(dfPage > totalPages) dfPage = 1;
  const start = (dfPage - 1) * DF_PER_PAGE;
  const pageRows = rows.slice(start, start + DF_PER_PAGE);

  let html = '';
  pageRows.forEach(function(p){
    const tujuan = [p.jabfung_tujuan, p.jenjang_tujuan].filter(Boolean).join(' — ') || '—';
    html += '<tr>' +
      '<td style="font-weight:600;color:#0f172a">' + escapeHtml(p.nama_tanpa_gelar || '—') + '</td>' +
      '<td style="font-family:monospace;font-size:12px">' + escapeHtml(p.nik || '—') + '</td>' +
      '<td>' + escapeHtml(p.jenis_ukom || '—') + '</td>' +
      '<td>' + escapeHtml(tujuan) + '</td>' +
      '<td>' + escapeHtml(p.periode || '—') + '</td>' +
      '<td>' + badgeVerifikasi(p.status_verifikasi) + '</td>' +
      '<td>' + badgeLengkap(p.status_ukom || '-') + '</td>' +
      '</tr>';
  });
  body.innerHTML = html;

  buildPagination(document.getElementById('dfPag'), dfPage, totalPages,
    'Menampilkan ' + (start + 1) + '–' + Math.min(start + DF_PER_PAGE, rows.length) + ' dari ' + rows.length + ' peserta',
    function(p){ dfPage = p; renderFaskesPeserta(); });
}
