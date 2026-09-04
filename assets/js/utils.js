/* ============================================================
   MANTAF v2 — UTILS.JS
   Utilitas bersama: escape, toast, pagination, format, modal
   ============================================================ */

/* ---------- KEAMANAN ---------- */
function escapeHtml(text){
  if(text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function escAttr(s){ return escapeHtml(s); }

function escHtml(s){ return escapeHtml(s); }

function sanitizeInput(input, maxLength){
  if(!input) return '';
  return String(input).trim().slice(0, maxLength || 100);
}

function validateEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function validatePhone(phone){
  return /^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(String(phone || '').replace(/[\s-]/g,''));
}

/* ---------- TOAST ---------- */
function showToast(message, type){
  type = type || 'success';
  var icons = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
  var toast = document.createElement('div');
  toast.className = 'mantaf-toast ' + type;
  toast.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i><span>' + escapeHtml(message) + '</span>';
  document.getElementById('toastContainer').appendChild(toast);
  setTimeout(function(){
    toast.classList.add('hide');
    setTimeout(function(){ toast.remove(); }, 350);
  }, 3400);
}

var showNotifToast = showToast; /* alias kompatibilitas */

/* ---------- FORMAT ---------- */
function formatDateId(value){
  if(!value) return '';
  var d = new Date(value);
  if(isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
}

function formatDateTimeId(value){
  if(!value) return '';
  var d = new Date(value);
  if(isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}

function badgeVerifikasi(status){
  var s = String(status || 'Menunggu').trim();
  var cls = {
    'Disetujui':'badge-disetujui', 'Ditolak':'badge-ditolak', 'Dilimpahkan':'badge-dilimpahkan',
    'Batal':'badge-batal', 'Proses':'badge-proses', 'Menunggu':'badge-menunggu', 'Perbaikan':'badge-perbaikan'
  }[s] || 'badge-menunggu';
  return '<span class="badge-status ' + cls + '">' + escapeHtml(s) + '</span>';
}

function badgeLengkap(status){
  var s = String(status || '-').trim();
  var cls = { 'Aktif':'badge-aktif', 'Lulus':'badge-lulus', 'Hadir':'badge-hadir',
              'Tidak Hadir':'badge-tidakhadir', 'Tidak Lulus':'badge-tidaklulus' }[s]
            || (s === '-' ? 'badge-batal' : 'badge-proses');
  return '<span class="badge-status ' + cls + '">' + escapeHtml(s) + '</span>';
}

/* ---------- PAGINATION BUILDER ---------- */
function buildPagination(containerEl, page, totalPages, infoText, onGo){
  if(!containerEl) return;
  var html = '';
  html += '<span class="pu-pag-info">' + escapeHtml(infoText) + '</span>';
  html += '<div class="pu-pag-btns">';
  html += '<button class="pu-pag-btn" data-p="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
  var start = Math.max(1, page - 2), end = Math.min(totalPages, page + 2);
  if(start > 1){
    html += '<button class="pu-pag-btn" data-p="1">1</button>';
    if(start > 2) html += '<span class="pu-pag-info">…</span>';
  }
  for(var p = start; p <= end; p++){
    html += '<button class="pu-pag-btn' + (p === page ? ' active' : '') + '" data-p="' + p + '">' + p + '</button>';
  }
  if(end < totalPages){
    if(end < totalPages - 1) html += '<span class="pu-pag-info">…</span>';
    html += '<button class="pu-pag-btn" data-p="' + totalPages + '">' + totalPages + '</button>';
  }
  html += '<button class="pu-pag-btn" data-p="' + (page + 1) + '"' + (page >= totalPages ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
  html += '</div>';
  containerEl.innerHTML = html;
  containerEl.querySelectorAll('.pu-pag-btn[data-p]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var p = parseInt(btn.getAttribute('data-p'), 10);
      if(!isNaN(p)) onGo(p);
    });
  });
}

/* ---------- LIGHTBOX ---------- */
function openLightbox(){
  document.getElementById('lightbox').classList.add('show');
}
function closeLightbox(){
  document.getElementById('lightbox').classList.remove('show');
}
function openLightboxImg(src){
  var lb = document.getElementById('lightboxImg');
  document.getElementById('lightboxImgEl').src = src;
  lb.classList.add('show');
}
function closeLightboxImg(){
  var lb = document.getElementById('lightboxImg');
  lb.classList.remove('show');
  document.getElementById('lightboxImgEl').src = '';
}

/* ---------- GENERIC CONFIRM DIALOG ---------- */
function confirmDialog(title, message, onYes, opts){
  opts = opts || {};
  var overlay = document.createElement('div');
  overlay.className = 'crud-overlay';
  overlay.innerHTML =
    '<div class="crud-modal confirm-modal">' +
      '<div class="confirm-icon ' + (opts.iconClass || '') + '"><i class="fas ' + (opts.icon || 'fa-triangle-exclamation') + '"></i></div>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:center">' +
        '<button class="btn btn-ghost" data-act="no"><i class="fas fa-xmark"></i> Batal</button>' +
        '<button class="btn ' + (opts.yesClass || 'btn-danger') + '" data-act="yes"><i class="fas ' + (opts.yesIcon || 'fa-check') + '"></i> ' + escapeHtml(opts.yesText || 'Ya, Lanjutkan') + '</button>' +
      '</div>' +
    '</div>';

  function close(){ overlay.remove(); }
  overlay.addEventListener('click', function(e){
    if(e.target === overlay) close();
    var act = e.target.closest('[data-act]');
    if(!act) return;
    if(act.getAttribute('data-act') === 'yes'){ close(); onYes && onYes(); }
    else close();
  });
  document.body.appendChild(overlay);
}

/* ---------- SESSION ADMIN ---------- */
function setAdminSession(data){
  sessionStorage.setItem('mantafSession', JSON.stringify({
    username: data.username, nama: data.nama, role: data.role,
    loginTime: Date.now()
  }));
}

function getAdminSession(){
  try{
    var s = JSON.parse(sessionStorage.getItem('mantafSession'));
    if(!s) return null;
    /* sesi kedaluwarsa setelah 60 menit */
    if(Date.now() - s.loginTime > 60 * 60 * 1000){ sessionStorage.removeItem('mantafSession'); return null; }
    return s;
  }catch(e){ return null; }
}

function clearAdminSession(){ sessionStorage.removeItem('mantafSession'); }

/* ---------- FILE HELPERS ---------- */
function fileToDataUrl(file){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(){ resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildPublicUrl(bucket, path){
  if(typeof db === 'undefined' || !db) return '';
  var res = db.storage.from(bucket).getPublicUrl(path);
  return res && res.data ? res.data.publicUrl : '';
}

/* ---------- KEY FINDER (kompatibilitas variasi nama kolom) ---------- */
function puKey(row, candidates){
  for(var i = 0; i < candidates.length; i++){
    var k = candidates[i];
    if(row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return '';
}
