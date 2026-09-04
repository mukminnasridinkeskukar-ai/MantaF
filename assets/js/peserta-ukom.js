/* ============================================================
   MANTAF v2 — PESERTA-UKOM.JS
   Tabel publik data peserta UKOM (search, filter, pagination)
   ============================================================ */

let pesertaUkomCache = null;
let pesertaUkomPage = 1;
let pesertaUkomFiltered = [];
const PU_PER_PAGE = 20;

SectionInit['pesertaUkom'] = function(){
  loadPesertaUkom();
};

async function loadPesertaUkom(force){
  const tbody = document.getElementById('pesertaUkomBody');
  if(!tbody) return;
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }

  if(force || !pesertaUkomCache){
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:40px;color:#64748b"><i class="fas fa-spinner fa-spin"></i> Memuat data peserta UKOM...</td></tr>';
    try{
      pesertaUkomCache = await API.getPesertaUkom();
      populatePeriodeFilter(pesertaUkomCache);
      populateStatusUkomFilter(pesertaUkomCache);
    }catch(err){
      tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:40px;color:#dc2626">Gagal memuat data: ' + escapeHtml(err.message) + '</td></tr>';
      return;
    }
  }
  filterPesertaUkom();
}

function populatePeriodeFilter(data){
  const sel = document.getElementById('pesertaUkomPeriode');
  while(sel.options.length > 1) sel.remove(1);
  const periods = [];
  (data || []).forEach(function(row){
    const p = puKey(row, ['periode']);
    if(p && periods.indexOf(p) === -1) periods.push(p);
  });
  periods.sort().reverse();
  periods.forEach(function(p){
    sel.insertAdjacentHTML('beforeend', '<option value="' + escAttr(p) + '">' + escapeHtml(p) + '</option>');
  });
}

function populateStatusUkomFilter(data){
  const sel = document.getElementById('pesertaUkomStatus');
  while(sel.options.length > 1) sel.remove(1);
  const statuses = [];
  (data || []).forEach(function(row){
    const v = puKey(row, ['status_ukom']);
    if(v && v !== '-' && statuses.indexOf(v) === -1) statuses.push(v);
  });
  statuses.sort();
  statuses.forEach(function(v){
    sel.insertAdjacentHTML('beforeend', '<option value="' + escAttr(v) + '">' + escapeHtml(v) + '</option>');
  });
}

function filterPesertaUkom(){
  if(!pesertaUkomCache) return;
  const q = (document.getElementById('pesertaUkomSearch').value || '').toLowerCase();
  const periode = document.getElementById('pesertaUkomPeriode').value;
  const status = document.getElementById('pesertaUkomStatus').value;

  pesertaUkomFiltered = pesertaUkomCache.filter(function(row){
    if(periode && puKey(row, ['periode']) !== periode) return false;
    if(status && String(puKey(row, ['status_ukom'])).toLowerCase() !== status.toLowerCase()) return false;
    if(q){
      const nama = String(row.nama_tanpa_gelar || '').toLowerCase();
      const no = String(row.no_peserta || '').toLowerCase();
      if(nama.indexOf(q) === -1 && no.indexOf(q) === -1) return false;
    }
    return true;
  });

  pesertaUkomPage = 1;
  renderPesertaUkomPage();
}

function renderPesertaUkomPage(){
  const tbody = document.getElementById('pesertaUkomBody');
  const total = pesertaUkomFiltered.length;
  const totalPages = Math.max(1, Math.ceil(total / PU_PER_PAGE));
  if(pesertaUkomPage > totalPages) pesertaUkomPage = totalPages;
  const start = (pesertaUkomPage - 1) * PU_PER_PAGE;
  const pageData = pesertaUkomFiltered.slice(start, start + PU_PER_PAGE);

  let html = '';
  pageData.forEach(function(row, i){
    const fotoUrl = row.file_foto || '';
    const sertUrl = row.sertifikat || '';
    html += '<tr>' +
      '<td>' + (start + i + 1) + '</td>' +
      '<td>' + (fotoUrl
        ? '<img src="' + escAttr(fotoUrl) + '" class="peserta-foto" loading="lazy" referrerpolicy="no-referrer" onclick="openLightboxImg(this.src)" onerror="this.outerHTML=\'<span style=color:#cbd5e1>-</span>\'">'
        : '<span style="color:#cbd5e1">-</span>') + '</td>' +
      '<td>' + escapeHtml(row.periode || '-') + '</td>' +
      '<td>' + escapeHtml(row.no_peserta || '-') + '</td>' +
      '<td style="font-weight:600;color:#0f172a">' + escapeHtml(row.nama_tanpa_gelar || '') + '</td>' +
      '<td>' + escapeHtml(row.nama_unit_kerja || '') + '</td>' +
      '<td>' + escapeHtml(row.jenis_ukom || '-') + '</td>' +
      '<td>' + escapeHtml(row.pak_instansi || '-') + '</td>' +
      '<td>' + escapeHtml(row.pak_siasn || '-') + '</td>' +
      '<td>' + badgeLengkap(row.status_periode) + '</td>' +
      '<td>' + badgeLengkap(row.absen) + '</td>' +
      '<td>' + badgeLengkap(row.status_ukom) + '</td>' +
      '<td>' + (sertUrl
        ? '<img src="' + escAttr(sertUrl) + '" class="sertifikat-thumb" loading="lazy" referrerpolicy="no-referrer" onclick="openLightboxImg(this.src)" onerror="this.outerHTML=\'<span style=color:#cbd5e1>-</span>\'">'
        : '<span style="color:#cbd5e1">-</span>') + '</td>' +
      '</tr>';
  });

  tbody.innerHTML = html || '<tr><td colspan="13" style="text-align:center;padding:40px;color:#94a3b8"><i class="fas fa-inbox" style="font-size:22px;display:block;margin-bottom:8px;opacity:.4"></i>Tidak ada data yang cocok</td></tr>';

  buildPagination(
    document.getElementById('pesertaUkomPagination'),
    pesertaUkomPage, totalPages,
    'Menampilkan ' + pageData.length + ' dari ' + total + ' peserta',
    function(p){ pesertaUkomPage = p; renderPesertaUkomPage(); }
  );
}
