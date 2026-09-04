/* ============================================================
   MANTAF v2 — PENGUMUMAN.JS
   Daftar pengumuman publik (read)
   ============================================================ */

SectionInit['pengumuman'] = function(){
  loadPengumuman();
};

async function loadPengumuman(force){
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }
  const container = document.getElementById('pengumumanList');
  if(!container) return;
  if(force) container.innerHTML = '<div class="announcement"><i>Memuat pengumuman...</i></div>';

  try{
    const data = await API.getPengumuman(true);
    if(data && data.length > 0){
      let html = '';
      data.forEach(function(item){
        const urgent = item.prioritas && item.prioritas !== 'Normal';
        html += '<div class="announcement' + (urgent ? ' urgent' : '') + '">' +
          '<b>' + escapeHtml(item.judul || 'Pengumuman') + '</b>' +
          (urgent ? ' <span class="badge-status badge-menunggu" style="margin-left:6px">' + escapeHtml(item.prioritas) + '</span>' : '') +
          '<br>' + escapeHtml(item.isi || '') +
          '<div style="font-size:11px;color:#64748b;margin-top:8px"><i class="fas fa-calendar-day"></i> ' + escapeHtml(formatDateId(item.tanggal)) + '</div>' +
          '</div>';
      });
      container.innerHTML = html;
    }else{
      container.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i>Belum ada pengumuman</div>';
    }
  }catch(err){
    container.innerHTML = '<div class="announcement" style="color:#dc2626">Error: ' + escapeHtml(err.message) + '</div>';
  }
}
