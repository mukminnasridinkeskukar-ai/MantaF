/* ============================================================
   MANTAF v2 — PETUNJUK.JS
   Halaman "Petunjuk Penggunaan": kartu dokumen PDF dengan
   popup preview. File PDF diambil dari Supabase Storage
   (bucket: petunjuk), metadata dari tabel public.petunjuk.
   ============================================================ */

let petunjukCache = null;
let petunjukLoaded = false;
let _pdfPreviewUrl = '';

SectionInit['petunjuk'] = function(){
  loadPetunjuk();
};

/* ---------- MUAT DATA + RENDER KARTU ---------- */
async function loadPetunjuk(force){
  const grid = document.getElementById('petunjukGrid');
  if(!grid) return;
  if(!db){
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;padding:44px">' +
      '<i class="fas fa-plug-circle-xmark"></i>Belum terhubung ke server' +
      '<p style="font-size:12px;color:#94a3b8;margin-top:6px">Isi konfigurasi Supabase pada assets/js/config.js</p>' +
      '</div>';
    return;
  }
  if(petunjukCache && !force){ renderPetunjukCards(); return; }
  if(force || !petunjukLoaded){
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px"><i class="fas fa-spinner fa-spin"></i>Memuat dokumen petunjuk…</div>';
  }

  try{
    petunjukCache = await API.getPetunjuk(true);
    petunjukLoaded = true;
    renderPetunjukCards();
  }catch(err){
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;padding:40px;color:#dc2626">' +
      '<i class="fas fa-triangle-exclamation"></i>Gagal memuat petunjuk: ' + escapeHtml(err.message) +
      '</div>';
  }
}

function petunjukCacheInvalidate(){
  petunjukCache = null;
  if(document.getElementById('petunjukGrid')) loadPetunjuk(true);
}

function renderPetunjukCards(){
  const grid = document.getElementById('petunjukGrid');
  if(!grid || !petunjukCache) return;

  const q = ((document.getElementById('petunjukSearch') || {}).value || '').trim().toLowerCase();
  const rows = petunjukCache.filter(function(p){
    if(!q) return true;
    return String(p.judul || '').toLowerCase().indexOf(q) !== -1 ||
           String(p.deskripsi || '').toLowerCase().indexOf(q) !== -1;
  });

  if(!rows.length){
    const kosong = petunjukCache.length === 0;
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;padding:48px">' +
      '<i class="fas fa-file-circle-question"></i>' +
      (kosong
        ? 'Belum ada dokumen petunjuk'
        : 'Tidak ada dokumen yang cocok dengan pencarian Anda') +
      (kosong ? '<p style="font-size:12px;color:#94a3b8;margin-top:6px">Dokumen PDF ditambahkan admin melalui Panel Admin — tab Petunjuk.</p>' : '') +
      '</div>';
    return;
  }

  grid.innerHTML = rows.map(function(p, i){
    const desk = String(p.deskripsi || '').trim();
    return '<div class="pet-card" style="animation-delay:' + Math.min(i * 60, 480) + 'ms">' +
      '<div class="pet-card-top">' +
        '<div class="pet-card-icon"><i class="fas fa-file-pdf"></i></div>' +
        (p.aktif ? '' : '<span class="badge-status badge-nonaktif">Nonaktif</span>') +
      '</div>' +
      '<h3 class="pet-card-title" title="' + escAttr(p.judul || '') + '">' + escapeHtml(p.judul || 'Dokumen') + '</h3>' +
      '<p class="pet-card-desc">' + escapeHtml(desk || 'Dokumen petunjuk penggunaan platform MantaF.') + '</p>' +
      '<div class="pet-card-meta"><i class="fas fa-clock"></i> Diunggah ' + escapeHtml(formatDateId(p.created_at)) + '</div>' +
      '<div class="pet-card-actions">' +
        '<button class="btn btn-sm" onclick="openPdfPreview(\'' + escAttr(p.id) + '\')">' +
          '<i class="fas fa-eye"></i> Preview' +
        '</button>' +
        '<button class="btn btn-outline btn-sm" onclick="downloadPetunjuk(\'' + escAttr(p.id) + '\')">' +
          '<i class="fas fa-download"></i> Unduh' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* ---------- CARI BARIS BERDASARKAN ID ---------- */
function petunjukById(id){
  return (petunjukCache || []).find(function(p){ return p.id === id; }) || null;
}

/* ---------- POPUP PREVIEW PDF ---------- */
function openPdfPreview(id){
  const p = petunjukById(id);
  if(!p || !p.file_url){ showToast('File dokumen tidak ditemukan', 'error'); return; }

  _pdfPreviewUrl = p.file_url;
  const judul = p.judul || 'Dokumen Petunjuk';

  document.getElementById('pdfPreviewTitle').textContent = judul;
  document.getElementById('pdfPreviewDownload').href = p.file_url;
  document.getElementById('pdfPreviewFallbackLink').href = p.file_url;

  const frame = document.getElementById('pdfPreviewFrame');
  const fallback = document.getElementById('pdfPreviewFallback');

  /* iOS Safari tidak merender PDF di dalam iframe — tampilkan fallback */
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if(isIOS){
    frame.style.display = 'none';
    fallback.style.display = 'flex';
  }else{
    fallback.style.display = 'none';
    frame.style.display = 'block';
    frame.src = p.file_url + '#view=FitH';
  }

  document.getElementById('lightboxPdf').classList.add('show');
}

function openPdfInNewTab(){
  if(_pdfPreviewUrl) window.open(_pdfPreviewUrl, '_blank', 'noopener');
}

function closePdfPreview(){
  const lb = document.getElementById('lightboxPdf');
  lb.classList.remove('show');
  const frame = document.getElementById('pdfPreviewFrame');
  frame.src = ''; /* hentikan pemuatan */
  frame.style.display = 'block';
  document.getElementById('pdfPreviewFallback').style.display = 'none';
  _pdfPreviewUrl = '';
}

/* Tambahkan parameter download ke URL storage Supabase saat mengunduh */
function downloadPetunjuk(id){
  const p = petunjukById(id);
  if(!p || !p.file_url){ showToast('File dokumen tidak ditemukan', 'error'); return; }
  const sep = p.file_url.indexOf('?') === -1 ? '?' : '&';
  const a = document.createElement('a');
  a.href = p.file_url + sep + 'download=true';
  a.download = (p.judul || 'petunjuk') + '.pdf';
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ a.remove(); }, 400);
  showToast('Mengunduh ' + (p.judul || 'dokumen') + '…', 'info');
}

/* Tutup popup dengan tombol ESC */
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && document.getElementById('lightboxPdf').classList.contains('show')) closePdfPreview();
});
