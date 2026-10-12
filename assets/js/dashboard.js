/* ============================================================
   MANTAF v2 — DASHBOARD.JS
   Statistik + donut chart + kartu kategori + tren pendaftaran + modal
   ============================================================ */

let dashPesertaCache = null;
let bezettingCache = null;

SectionInit['dashboard'] = function(){
  loadDashboardStats();
  loadDashboardCharts();
};

/* Metadata warna Status UKOM (sinkron badge utils.js: Lulus/Tidak Lulus/Menunggu/-) */
const DASH_UKOM_META = {
  'Lulus':       { color:'#16a34a', label:'Lulus' },
  'Tidak Lulus': { color:'#dc2626', label:'Tidak Lulus' },
  'Menunggu':    { color:'#eab308', label:'Menunggu' },
  '-':           { color:'#94a3b8', label:'Belum Ada Status' }
};

/* Definisi kartu kategori (dinamis dari data peserta) */
const DASH_CAT_DEFS = [
  { field:'jenis_ukom',       mount:'catJenisUkom', icon:'fa-layer-group',    color:'#0f766e', empty:'Belum ada jenis UKOM' },
  { field:'jabfung_saat_ini', mount:'catJabfung',   icon:'fa-id-badge',       color:'#4f46e5', empty:'Belum ada data jabfung' },
  { field:'periode',          mount:'catPeriode',   icon:'fa-calendar-days',  color:'#d97706', empty:'Belum ada periode' },
  { field:'nama_unit_kerja',  mount:'catUnit',      icon:'fa-hospital',       color:'#0284c7', empty:'Belum ada unit kerja' }
];

/* ---------- STAT CARDS ---------- */
async function loadDashboardStats(){
  if(!db){ showDbWarn(); return; }
  try{
    const stats = await API.getDashboardStats();
    document.getElementById('pesertaCount').textContent = stats.totalPeserta.toLocaleString('id-ID');
    document.getElementById('instansiCount').textContent = stats.totalInstansi.toLocaleString('id-ID');
    document.getElementById('lowonganCount').textContent = stats.totalLowongan.toLocaleString('id-ID');
  }catch(err){
    console.error('Gagal memuat statistik:', err);
  }
}

function showDbWarn(){
  const el = document.getElementById('sectionsMount');
  if(!el || el.querySelector('.db-warn')) return;
  const warn = document.createElement('div');
  warn.className = 'db-warn announcement';
  warn.style.background = '#fff7ed';
  warn.style.borderLeftColor = '#f59e0b';
  warn.innerHTML = '<b><i class="fas fa-database"></i> Konfigurasi Supabase belum diisi.</b><br>' +
    'Edit file <code>assets/js/config.js</code> → isi <b>SUPABASE_URL</b> dan <b>SUPABASE_ANON_KEY</b>, ' +
    'lalu jalankan <code>supabase/schema.sql</code> di SQL Editor Supabase.';
  el.prepend(warn);
}

/* ---------- CHARTS ---------- */
async function loadDashboardCharts(){
  if(!db) return;
  try{
    if(!dashPesertaCache){
      dashPesertaCache = await API.getPesertaUkom();
    }
    if(!bezettingCache){
      try{ bezettingCache = await API.getBezetting(); }
      catch(eB){ console.error('Gagal memuat bezetting:', eB); bezettingCache = []; }
    }
    renderStatusDonut();
    renderJabfungDonut();
    renderUkomStatusDonut();
    renderCategoryCards();
    renderTrenChart();
  }catch(err){
    console.error('Gagal memuat chart:', err);
  }
}

/* ---------- DONUT STATUS UKOM + LEGEND (klik → pop up) ---------- */
function renderUkomStatusDonut(){
  const counts = { 'Lulus':0, 'Tidak Lulus':0, 'Menunggu':0, '-':0 };
  (dashPesertaCache || []).forEach(function(item){
    const s = String(item.status_ukom === undefined || item.status_ukom === null ? '-' : item.status_ukom).trim() || '-';
    if(counts.hasOwnProperty(s)) counts[s]++;
    else counts[s] = 1; /* nilai tak terduga — tetap dihitung */
  });

  const order = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; });
  let total = 0;
  order.forEach(function(k){ total += counts[k]; });
  const circumference = 283;

  document.getElementById('ukomTotal').textContent = total;

  const fallback = ['#8b5cf6','#0ea5e9','#f97316','#64748b','#14b8a6'];
  let segOffset = 0, segHtml = '', legendHtml = '';
  order.forEach(function(key, i){
    const meta = DASH_UKOM_META[key] || { color: fallback[i % fallback.length], label: key };
    const count = counts[key];
    const d = total > 0 ? (count / total) * circumference : 0;
    segHtml += '<circle cx="50" cy="50" r="45" fill="none" stroke="' + meta.color + '" stroke-width="10" stroke-dasharray="' + d + ' ' + (circumference - d) + '" stroke-dashoffset="' + (-segOffset) + '" stroke-linecap="round"/>';
    segOffset += d;
    legendHtml += '<div class="dash-status-item" data-ukom="' + escAttr(key) + '" title="Klik untuk lihat daftar peserta">' +
      '<span class="dot" style="background:' + meta.color + '"></span>' +
      '<span>' + escapeHtml(meta.label) + '</span>' +
      '<span class="count">' + count + '</span></div>';
  });

  const segEl = document.getElementById('ukomSegments');
  const listEl = document.getElementById('ukomStatusList');
  if(segEl) segEl.innerHTML = segHtml;
  if(listEl){
    listEl.innerHTML = legendHtml;
    listEl.onclick = function(e){
      const item = e.target.closest('.dash-status-item');
      if(item && item.getAttribute('data-ukom') !== null) showDashUkomModal(item.getAttribute('data-ukom'));
    };
  }
}

/* ---------- KARTU KATEGORI (Jenis UKOM / Jabfung / Periode / Unit Kerja) ---------- */
function renderCategoryCards(){
  DASH_CAT_DEFS.forEach(function(def){
    const el = document.getElementById(def.mount);
    if(!el) return;

    const counts = {};
    (dashPesertaCache || []).forEach(function(item){
      const v = String(item[def.field] || '').trim();
      if(!v || v === '-') return; /* kosong / belum diatur tidak dibuatkan kartu */
      counts[v] = (counts[v] || 0) + 1;
    });

    const keys = Object.keys(counts).sort(function(a, b){
      return counts[b] - counts[a] || a.localeCompare(b, 'id');
    });

    if(!keys.length){
      el.innerHTML = '<div class="dash-cat-empty"><i class="fas fa-inbox"></i> ' + escapeHtml(def.empty) + '</div>';
      return;
    }

    el.innerHTML = keys.map(function(k){
      return '<div class="dash-cat-card" data-field="' + def.field + '" data-value="' + escAttr(k) + '" title="Klik untuk lihat ' + counts[k] + ' peserta">' +
          '<div class="dash-cat-icon" style="background:' + def.color + '1a;color:' + def.color + '"><i class="fas ' + def.icon + '"></i></div>' +
          '<div class="dash-cat-name">' + escapeHtml(k) + '</div>' +
          '<div class="dash-cat-foot"><span>' + counts[k] + ' peserta</span><i class="fas fa-arrow-up-right-from-square"></i></div>' +
        '</div>';
    }).join('');

    el.onclick = function(e){
      const card = e.target.closest('.dash-cat-card');
      if(!card) return;
      showDashGroupModal(card.getAttribute('data-field'), card.getAttribute('data-value'));
    };
  });
}

/* ---------- MODAL POP UP KATEGORI (dengan pencarian) ---------- */
let _dashGroupRows = [];

function showDashUkomModal(statusValue){
  const meta = DASH_UKOM_META[statusValue] || { color:'#64748b', label: statusValue };
  showDashGroupModal('status_ukom', statusValue, 'Status UKOM: ' + meta.label);
}

function showDashGroupModal(field, value, titleOverride){
  if(!dashPesertaCache){ showToast('Data belum termuat', 'info'); return; }
  const needle = String(value || '').trim();
  const rows = dashPesertaCache.filter(function(p){
    return String(p[field] === undefined || p[field] === null ? '' : p[field]).trim() === needle;
  });
  openDashTableModal(titleOverride || (needle || 'Data Peserta'), rows);
}

/* Kerangka modal tabel peserta + pencarian (dipakai pop up kategori & tren) */
function openDashTableModal(title, rows){
  _dashGroupRows = rows || [];
  const inner =
    '<div class="dash-modal-header"><h3><i class="fas fa-table-list" style="color:#0f766e"></i> ' + escapeHtml(title) +
      ' <span style="font-weight:600;color:#64748b">(' + _dashGroupRows.length + ' peserta)</span></h3>' +
      '<button class="dash-modal-close" onclick="closeDashModal()">&times;</button></div>' +
    '<div class="dash-modal-body">' +
      '<input type="text" class="dash-search" id="dashGroupSearch" placeholder="Cari nama / unit kerja…" oninput="renderDashGroupBody(this.value)">' +
      '<div id="dashGroupInfo" class="dash-modal-info">Menampilkan data tanpa informasi sensitif (NIK, NIP, kontak).</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>No</th><th>Nama</th><th>Unit Kerja</th>' +
        '<th>Jenis UKOM</th><th>Jabfung Saat Ini</th><th>Periode</th><th>Status UKOM</th><th>Verifikasi</th>' +
      '</tr></thead><tbody id="dashGroupBody"></tbody></table></div>' +
    '</div>';
  openDashModal(inner);
  renderDashGroupBody('');
}

function renderDashGroupBody(query){
  const tbody = document.getElementById('dashGroupBody');
  if(!tbody) return;
  const q = String(query || '').toLowerCase().trim();
  const filtered = !q ? _dashGroupRows : _dashGroupRows.filter(function(p){
    return ['nama_tanpa_gelar', 'nama_unit_kerja'].some(function(f){
      return String(p[f] || '').toLowerCase().indexOf(q) !== -1;
    });
  });

  const info = document.getElementById('dashGroupInfo');
  if(info){
    const countText = filtered.length === _dashGroupRows.length
      ? 'Menampilkan ' + filtered.length + ' peserta'
      : 'Menampilkan ' + filtered.length + ' dari ' + _dashGroupRows.length + ' peserta';
    info.textContent = countText + ' — data sensitif (NIK, NIP, kontak) disembunyikan.';
  }

  const CAP = 300;
  let rows = '';
  filtered.slice(0, CAP).forEach(function(p, i){
    rows += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td style="font-weight:600;color:#0f172a">' + escapeHtml(p.nama_tanpa_gelar || '') + '</td>' +
      '<td>' + escapeHtml(p.nama_unit_kerja || '') + '</td>' +
      '<td>' + escapeHtml(p.jenis_ukom || '-') + '</td>' +
      '<td>' + escapeHtml(p.jabfung_saat_ini || '-') + '</td>' +
      '<td>' + escapeHtml(p.periode || '-') + '</td>' +
      '<td>' + badgeLengkap(p.status_ukom) + '</td>' +
      '<td>' + badgeVerifikasi(p.status_verifikasi) + '</td>' +
      '</tr>';
  });

  tbody.innerHTML = (rows || '<tr><td colspan="8" style="text-align:center;padding:24px">Tidak ada data</td></tr>') +
    (filtered.length > CAP ? '<tr><td colspan="8" style="text-align:center;padding:12px;color:#64748b;font-size:12px">Menampilkan ' + CAP + ' data pertama — gunakan pencarian untuk mempersempit.</td></tr>' : '');
}

/* ---------- POP UP KARTU STATISTIK: INSTANSI ---------- */
function showInstansiModal(){
  if(!dashPesertaCache){ showToast('Data belum termuat', 'info'); return; }
  const counts = {};
  (dashPesertaCache || []).forEach(function(p){
    const v = String(p.nama_unit_kerja || '').trim();
    if(!v) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  const keys = Object.keys(counts).sort(function(a, b){
    return counts[b] - counts[a] || a.localeCompare(b, 'id');
  });

  const listHtml = keys.map(function(k){
    return '<div class="dash-status-item" data-inst="' + escAttr(k) + '" title="Klik untuk lihat daftar peserta">' +
      '<span class="dot" style="background:#0284c7"></span>' +
      '<span>' + escapeHtml(k) + '</span>' +
      '<span class="count">' + counts[k] + '</span></div>';
  }).join('') || '<div class="dash-status-item"><span style="color:#94a3b8;font-size:12px">Belum ada data instansi</span></div>';

  const inner =
    '<div class="dash-modal-header"><h3><i class="fas fa-hospital" style="color:#0284c7"></i> Daftar Instansi / Unit Kerja (' + keys.length + ')</h3>' +
      '<button class="dash-modal-close" onclick="closeDashModal()">&times;</button></div>' +
    '<div class="dash-modal-body">' +
      '<div class="dash-modal-info">Klik nama instansi untuk melihat pop up daftar pesertanya.</div>' +
      '<div class="dash-status-list" id="dashInstList" style="margin-top:0">' + listHtml + '</div>' +
    '</div>';
  openDashModal(inner);

  const list = document.getElementById('dashInstList');
  if(list){
    list.onclick = function(e){
      const item = e.target.closest('.dash-status-item');
      if(item && item.getAttribute('data-inst')) showDashGroupModal('nama_unit_kerja', item.getAttribute('data-inst'));
    };
  }
}

/* ---------- POP UP KARTU STATISTIK: LOWONGAN (BEZETTING) ---------- */
let _dashLowonganRows = [];

function showLowonganModal(){
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }
  if(!bezettingCache){
    API.getBezetting().then(function(data){
      bezettingCache = data || [];
      showLowonganModal();
    }).catch(function(err){ showToast('Gagal memuat bezetting: ' + err.message, 'error'); });
    return;
  }

  _dashLowonganRows = bezettingCache.slice().sort(function(a, b){
    return (parseInt(b.lowongan, 10) || 0) - (parseInt(a.lowongan, 10) || 0) ||
           String(a.instansi || '').localeCompare(String(b.instansi || ''), 'id');
  });
  const totalLowongan = _dashLowonganRows.reduce(function(s, r){ return s + (parseInt(r.lowongan, 10) || 0); }, 0);

  const inner =
    '<div class="dash-modal-header"><h3><i class="fas fa-briefcase" style="color:#d97706"></i> Rincian Lowongan — Total ' + totalLowongan + ' lowongan</h3>' +
      '<button class="dash-modal-close" onclick="closeDashModal()">&times;</button></div>' +
    '<div class="dash-modal-body">' +
      '<input type="text" class="dash-search" placeholder="Cari instansi / jenis jabatan…" oninput="renderLowonganBody(this.value)">' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>No</th><th>Instansi</th><th>Jenis Jabatan</th><th>Jenjang</th><th>Kebutuhan</th><th>Pemangku</th><th>Lowongan</th>' +
      '</tr></thead><tbody id="dashLowonganBody"></tbody></table></div>' +
    '</div>';
  openDashModal(inner);
  renderLowonganBody('');
}

function renderLowonganBody(query){
  const tbody = document.getElementById('dashLowonganBody');
  if(!tbody) return;
  const q = String(query || '').toLowerCase().trim();
  const filtered = !q ? _dashLowonganRows : _dashLowonganRows.filter(function(r){
    return String(r.instansi || '').toLowerCase().indexOf(q) !== -1 ||
           String(r.jenis_jabatan || '').toLowerCase().indexOf(q) !== -1;
  });

  let html = '';
  filtered.forEach(function(r, i){
    html += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td style="font-weight:600;color:#0f172a">' + escapeHtml(r.instansi || '') + '</td>' +
      '<td>' + escapeHtml(r.jenis_jabatan || '-') + '</td>' +
      '<td>' + escapeHtml(r.jenjang || '-') + '</td>' +
      '<td>' + (parseInt(r.kebutuhan, 10) || 0) + '</td>' +
      '<td>' + (parseInt(r.pemangku, 10) || 0) + '</td>' +
      '<td style="font-weight:700;color:#d97706">' + (parseInt(r.lowongan, 10) || 0) + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;padding:24px">Tidak ada data bezetting</td></tr>';
}

/* ---------- TREN PENDAFTARAN PER BULAN ---------- */
const DASH_TREND_MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

function renderTrenChart(){
  const wrap = document.getElementById('trenChartWrap');
  if(!wrap) return;

  /* agregasi jumlah pendaftar per bulan (dari created_at) */
  const counts = {};
  (dashPesertaCache || []).forEach(function(p){
    const d = p.created_at ? new Date(p.created_at) : null;
    if(!d || isNaN(d.getTime())) return;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    counts[key] = (counts[key] || 0) + 1;
  });

  const keys = Object.keys(counts).sort();
  if(!keys.length){
    wrap.innerHTML = '<div class="dash-cat-empty"><i class="fas fa-chart-line"></i> Belum ada data pendaftaran</div>';
    const info0 = document.getElementById('trenChartInfo');
    if(info0) info0.textContent = '';
    return;
  }

  /* 12 bulan terakhir — bulan tanpa pendaftar tetap digambar (nilai 0) */
  const range = keys.slice(-12);
  const filled = [];
  let cur = range[0].split('-').map(Number);
  const end = range[range.length - 1].split('-').map(Number);
  while(true){
    const key = cur[0] + '-' + String(cur[1]).padStart(2, '0');
    filled.push({ key: key, count: counts[key] || 0 });
    if(cur[0] === end[0] && cur[1] === end[1]) break;
    cur[1]++;
    if(cur[1] > 12){ cur[1] = 1; cur[0]++; }
  }

  const maxCount = Math.max.apply(null, filled.map(function(m){ return m.count; }));
  const step = Math.max(1, Math.ceil(maxCount / 4));
  const gridMax = step * 4;

  const W = 640, H = 240, padL = 38, padR = 14, padT = 16, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = filled.length;
  const xAt = function(i){ return n === 1 ? padL + plotW / 2 : padL + (i * plotW / (n - 1)); };
  const yAt = function(c){ return padT + plotH - (c / gridMax) * plotH; };
  const monthLabel = function(key){
    const parts = key.split('-');
    return DASH_TREND_MONTHS[parseInt(parts[1], 10) - 1] + ' ' + parts[0].slice(2);
  };

  let svg = '<svg class="dash-trend-svg" viewBox="0 0 ' + W + ' ' + H + '">';

  /* garis bantu + label sumbu Y */
  for(let g = 0; g <= 4; g++){
    const val = step * g;
    const y = yAt(val);
    svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1"/>';
    svg += '<text x="' + (padL - 7) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="10" fill="#94a3b8">' + val + '</text>';
  }

  /* area + garis tren */
  let linePath = '';
  filled.forEach(function(m, i){ linePath += (i === 0 ? 'M' : 'L') + xAt(i) + ',' + yAt(m.count); });
  const areaPath = linePath + 'L' + xAt(n - 1) + ',' + (padT + plotH) + 'L' + xAt(0) + ',' + (padT + plotH) + 'Z';
  svg += '<defs><linearGradient id="trenGrad" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#14b8a6" stop-opacity=".28"/>' +
         '<stop offset="100%" stop-color="#14b8a6" stop-opacity=".02"/></linearGradient></defs>';
  svg += '<path d="' + areaPath + '" fill="url(#trenGrad)"/>';
  svg += '<path d="' + linePath + '" fill="none" stroke="#0f766e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';

  /* titik klikabel + label sumbu X */
  const labelEvery = n > 8 ? 2 : 1;
  filled.forEach(function(m, i){
    const x = xAt(i), y = yAt(m.count);
    svg += '<circle class="dash-trend-dot" data-month="' + m.key + '" cx="' + x + '" cy="' + y + '" r="4.5" fill="#fff" stroke="#0f766e" stroke-width="2.5">' +
           '<title>' + monthLabel(m.key) + ': ' + m.count + ' pendaftar — klik untuk lihat daftar</title></circle>';
    if(i % labelEvery === 0 || i === n - 1){
      svg += '<text x="' + x + '" y="' + (H - 9) + '" text-anchor="middle" font-size="10" fill="#64748b">' + monthLabel(m.key) + '</text>';
    }
  });

  svg += '</svg>';
  wrap.innerHTML = svg;

  const info = document.getElementById('trenChartInfo');
  if(info){
    info.textContent = 'Total ' + filled.reduce(function(s, m){ return s + m.count; }, 0) +
      ' pendaftar dalam ' + n + ' bulan terakhir. Arahkan kursor ke titik untuk detail, klik untuk pop up daftar peserta.';
  }

  wrap.onclick = function(e){
    const dot = e.target.closest('[data-month]');
    if(dot) showTrenMonthModal(dot.getAttribute('data-month'));
  };
}

function showTrenMonthModal(monthKey){
  if(!dashPesertaCache){ showToast('Data belum termuat', 'info'); return; }
  const rows = (dashPesertaCache || []).filter(function(p){
    return String(p.created_at || '').indexOf(monthKey) === 0;
  });
  const parts = monthKey.split('-');
  const label = DASH_TREND_MONTHS[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  openDashTableModal('Pendaftar Bulan ' + label, rows);
}

function renderStatusDonut(){
  const statusCounts = { Disetujui:0, Ditolak:0, Dilimpahkan:0, Batal:0, Proses:0, Menunggu:0 };
  (dashPesertaCache || []).forEach(function(item){
    const s = String(item.status_verifikasi || 'Menunggu').trim();
    if(statusCounts.hasOwnProperty(s)) statusCounts[s]++;
    else statusCounts.Menunggu++;
  });

  let total = 0;
  for(const k in statusCounts) total += statusCounts[k];
  const circumference = 283;

  document.getElementById('statusTotal').textContent = total;
  document.getElementById('cntDisetujui').textContent = statusCounts.Disetujui;
  document.getElementById('cntDitolak').textContent = statusCounts.Ditolak;
  document.getElementById('cntDilimpahkan').textContent = statusCounts.Dilimpahkan;
  document.getElementById('cntBatal').textContent = statusCounts.Batal;
  document.getElementById('cntProses').textContent = statusCounts.Proses;
  document.getElementById('cntMenunggu').textContent = statusCounts.Menunggu;

  setTimeout(function(){
    const order  = ['Disetujui','Ditolak','Dilimpahkan','Batal','Proses','Menunggu'];
    const ids    = ['statusDisetujui','statusDitolak','statusDilimpahkan','statusBatal','statusProses','statusMenunggu'];
    let offset = 0;
    order.forEach(function(key, i){
      const count = statusCounts[key];
      const dash = total > 0 ? (count / total) * circumference : 0;
      const el = document.getElementById(ids[i]);
      if(el){
        el.style.strokeDasharray = dash + ' ' + (circumference - dash);
        el.style.strokeDashoffset = '-' + offset;
      }
      offset += dash;
    });
  }, 100);
}

function renderJabfungDonut(){
  const counts = {};
  (dashPesertaCache || []).forEach(function(item){
    const j = String(item.jabfung_tujuan || '').trim();
    if(j) counts[j] = (counts[j] || 0) + 1;
  });
  const jabfungData = Object.keys(counts).map(function(name){
    return { name: name, count: counts[name] };
  }).sort(function(a, b){ return b.count - a.count; });

  const jabfungTotal = jabfungData.reduce(function(sum, item){ return sum + item.count; }, 0);
  document.getElementById('jabfungTotal').textContent = jabfungTotal;
  const circumference = 283;

  const jColors = ['#0f766e','#14b8a6','#0d9488','#0891b2','#0284c7','#2563eb','#4f46e5','#7c3aed','#8b5cf6','#a855f7'];
  let segOffset = 0, segHtml = '';
  jabfungData.slice(0, 10).forEach(function(item, i){
    const d = jabfungTotal > 0 ? (item.count / jabfungTotal) * circumference : 0;
    const color = jColors[i % jColors.length];
    segHtml += '<circle cx="50" cy="50" r="45" fill="none" stroke="' + color + '" stroke-width="10" stroke-dasharray="' + d + ' ' + (circumference - d) + '" stroke-dashoffset="' + (-segOffset) + '" stroke-linecap="round"/>';
    segOffset += d;
  });
  document.getElementById('jabfungSegments').innerHTML = segHtml;

  let legendHtml = '';
  jabfungData.slice(0, 10).forEach(function(item, i){
    const color = jColors[i % jColors.length];
    legendHtml += '<div style="display:flex;align-items:center;gap:6px;margin:4px 0">' +
      '<span style="width:12px;height:12px;background:' + color + ';border-radius:3px;flex-shrink:0"></span>' +
      '<span>' + escapeHtml(item.name.substring(0, 25)) + (item.name.length > 25 ? '…' : '') + '</span>' +
      '<span style="margin-left:auto;font-weight:600">' + item.count + '</span></div>';
  });
  document.getElementById('jabfungLegend').innerHTML = legendHtml || '<span style="color:#94a3b8">Belum ada data</span>';
}

/* ---------- MODAL DETAIL ---------- */
const DASH_STATUS_COLORS = {
  'Disetujui':'#16a34a','Ditolak':'#dc2626','Dilimpahkan':'#3b82f6',
  'Batal':'#94a3b8','Proses':'#f59e0b','Menunggu':'#eab308'
};

function showDashStatusModal(status){
  if(!dashPesertaCache) return;
  const filtered = dashPesertaCache.filter(function(p){
    return String(p.status_verifikasi || 'Menunggu').trim() === status;
  });

  let rows = '';
  filtered.slice(0, 200).forEach(function(p, i){
    rows += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(p.nama_tanpa_gelar || '') + '</td>' +
      '<td>' + escapeHtml(p.nama_unit_kerja || '') + '</td>' +
      '<td>' + escapeHtml(p.jabfung_tujuan || '-') + '</td>' +
      '<td>' + badgeVerifikasi(p.status_verifikasi) + '</td>' +
      '</tr>';
  });

  const color = DASH_STATUS_COLORS[status] || '#64748b';
  const inner =
    '<div class="dash-modal-header"><h3><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + color + '"></span> Data Status: ' + escapeHtml(status) + ' (' + filtered.length + ')</h3>' +
    '<button class="dash-modal-close" onclick="closeDashModal()">&times;</button></div>' +
    '<div class="dash-modal-body"><div class="dash-modal-info">Menampilkan data tanpa informasi sensitif (NIK, NIP, kontak).</div>' +
    '<div class="table-wrap"><table><thead><tr>' +
    '<th>No</th><th>Nama</th><th>Unit Kerja</th><th>Jabfung Tujuan</th><th>Status</th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;padding:24px">Tidak ada data</td></tr>') + '</tbody></table></div></div>';
  openDashModal(inner);
}

function showDashPesertaModal(){
  if(!dashPesertaCache){ showToast('Data belum termuat', 'info'); return; }
  let rows = '';
  dashPesertaCache.slice(0, 300).forEach(function(p, i){
    rows += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(p.nama_tanpa_gelar || '') + '</td>' +
      '<td>' + escapeHtml(p.nama_unit_kerja || '') + '</td>' +
      '<td>' + escapeHtml(p.jabfung_saat_ini || '-') + '</td>' +
      '<td>' + escapeHtml(p.jabfung_tujuan || '-') + '</td>' +
      '<td>' + escapeHtml(p.periode || '-') + '</td>' +
      '<td>' + badgeVerifikasi(p.status_verifikasi) + '</td>' +
      '</tr>';
  });
  const inner =
    '<div class="dash-modal-header"><h3>Seluruh Data Peserta UKOM (' + dashPesertaCache.length + ')</h3>' +
    '<button class="dash-modal-close" onclick="closeDashModal()">&times;</button></div>' +
    '<div class="dash-modal-body"><div class="table-wrap"><table><thead><tr>' +
    '<th>No</th><th>Nama</th><th>Unit Kerja</th><th>Jabfung Saat Ini</th><th>Jabfung Tujuan</th><th>Periode</th><th>Status</th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" style="text-align:center;padding:24px">Tidak ada data</td></tr>') + '</tbody></table></div></div>';
  openDashModal(inner);
}

function openDashModal(innerHtml){
  closeDashModal();
  const overlay = document.createElement('div');
  overlay.id = 'dashModalOverlay';
  overlay.className = 'dash-modal-overlay';
  overlay.innerHTML = '<div class="dash-modal">' + innerHtml + '</div>';
  overlay.addEventListener('click', function(e){ if(e.target === overlay) closeDashModal(); });
  document.body.appendChild(overlay);
}

function closeDashModal(){
  const el = document.getElementById('dashModalOverlay');
  if(el) el.remove();
}
