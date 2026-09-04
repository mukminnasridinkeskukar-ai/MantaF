/* ============================================================
   MANTAF v2 — BEZETTING.JS
   Tabel bezetting + filter + pagination (read publik)
   ============================================================ */

const ROWS_PER_PAGE = 50;
let bezettingCache = null;
let bezettingFilter = { instansi:'', jenis_jabatan:'', jenjang:'' };
let bezettingPage = 1;

SectionInit['bezetting'] = function(){
  loadBezetting();
};

async function loadBezetting(force){
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }
  const tbody = document.getElementById('bezettingBody');
  if(!tbody) return;
  if(force || !bezettingCache){
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#64748b"><i class="fas fa-spinner fa-spin"></i> Memuat data...</td></tr>';
    try{
      bezettingCache = await API.getBezetting();
      populateBezettingFilters(bezettingCache);
    }catch(err){
      tbody.innerHTML = '<tr><td colspan="9" style="color:#dc2626">Gagal: ' + escapeHtml(err.message) + '</td></tr>';
      return;
    }
  }
  renderBezettingTable();
}

function populateBezettingFilters(data){
  const instansiSet = new Set(), jabatanSet = new Set(), jenjangSet = new Set();
  (data || []).forEach(function(item){
    if(item.instansi) instansiSet.add(item.instansi);
    if(item.jenis_jabatan) jabatanSet.add(item.jenis_jabatan);
    if(item.jenjang) jenjangSet.add(item.jenjang);
  });

  const instansiSelect = document.getElementById('filterInstansi');
  const jabatanSelect = document.getElementById('filterJabatan');
  const jenjangSelect = document.getElementById('filterJenjang');

  [[instansiSelect, instansiSet], [jabatanSelect, jabatanSet], [jenjangSelect, jenjangSet]].forEach(function(pair){
    const sel = pair[0], set = pair[1];
    while(sel.options.length > 1) sel.remove(1);
    [...set].sort().forEach(function(v){
      sel.insertAdjacentHTML('beforeend', '<option value="' + escAttr(v) + '">' + escapeHtml(v) + '</option>');
    });
  });
}

function applyBezettingFilter(){
  bezettingFilter = {
    instansi: document.getElementById('filterInstansi').value,
    jenis_jabatan: document.getElementById('filterJabatan').value,
    jenjang: document.getElementById('filterJenjang').value
  };
  bezettingPage = 1;
  renderBezettingTable();
}

function resetBezettingFilter(){
  document.getElementById('filterInstansi').value = '';
  document.getElementById('filterJabatan').value = '';
  document.getElementById('filterJenjang').value = '';
  bezettingFilter = { instansi:'', jenis_jabatan:'', jenjang:'' };
  bezettingPage = 1;
  renderBezettingTable();
}

function renderBezettingTable(){
  if(!bezettingCache) return;

  const filtered = bezettingCache.filter(function(item){
    const matchInstansi = !bezettingFilter.instansi || item.instansi === bezettingFilter.instansi;
    const matchJabatan = !bezettingFilter.jenis_jabatan || item.jenis_jabatan === bezettingFilter.jenis_jabatan;
    const matchJenjang = !bezettingFilter.jenjang || item.jenjang === bezettingFilter.jenjang;
    return matchInstansi && matchJabatan && matchJenjang;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  if(bezettingPage > totalPages) bezettingPage = totalPages;
  const start = (bezettingPage - 1) * ROWS_PER_PAGE;
  const pageData = filtered.slice(start, start + ROWS_PER_PAGE);

  const tbody = document.getElementById('bezettingBody');
  let html = '';
  pageData.forEach(function(item){
    html += '<tr>' +
      '<td>' + escapeHtml(item.instansi || '') + '</td>' +
      '<td>' + escapeHtml(item.jenis_jabatan || '') + '</td>' +
      '<td>' + escapeHtml(item.jenjang || '') + '</td>' +
      '<td>' + (item.kebutuhan ?? 0) + '</td>' +
      '<td>' + (item.pemangku ?? 0) + '</td>' +
      '<td>' + (item.lowongan ?? 0) + '</td>' +
      '<td style="max-width:260px">' + escapeHtml(item.pemangku_saat_ini || '') + '</td>' +
      '<td style="max-width:260px">' + escapeHtml(item.pemangku_disetujui || '') + '</td>' +
      '<td>' + (item.sisa ?? 0) + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = html || '<tr><td colspan="9" style="text-align:center;padding:30px;color:#94a3b8">Tidak ada data</td></tr>';

  buildPagination(
    document.getElementById('pagination'),
    bezettingPage, totalPages,
    'Menampilkan ' + pageData.length + ' dari ' + filtered.length + ' data',
    function(p){ bezettingPage = p; renderBezettingTable(); }
  );
}
