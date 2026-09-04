/* ============================================================
   MANTAF v2 — DASHBOARD.JS
   Statistik + donut chart status verifikasi & jabfung + modal
   ============================================================ */

let dashPesertaCache = null;

SectionInit['dashboard'] = function(){
  loadDashboardStats();
  loadDashboardCharts();
};

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
    renderStatusDonut();
    renderJabfungDonut();
  }catch(err){
    console.error('Gagal memuat chart:', err);
  }
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
      '<td>' + escapeHtml(p.nik || '') + '</td>' +
      '<td>' + escapeHtml(p.nip || '') + '</td>' +
      '<td>' + escapeHtml(p.nama_unit_kerja || '') + '</td>' +
      '<td>' + escapeHtml(p.jabfung_tujuan || '-') + '</td>' +
      '<td>' + badgeVerifikasi(p.status_verifikasi) + '</td>' +
      '</tr>';
  });

  const color = DASH_STATUS_COLORS[status] || '#64748b';
  const inner =
    '<div class="dash-modal-header"><h3><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + color + '"></span> Data Status: ' + escapeHtml(status) + ' (' + filtered.length + ')</h3>' +
    '<button class="dash-modal-close" onclick="closeDashModal()">&times;</button></div>' +
    '<div class="dash-modal-body"><div class="table-wrap"><table><thead><tr>' +
    '<th>No</th><th>Nama</th><th>NIK</th><th>NIP</th><th>Unit Kerja</th><th>Jabfung Tujuan</th><th>Status</th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" style="text-align:center;padding:24px">Tidak ada data</td></tr>') + '</tbody></table></div></div>';
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
