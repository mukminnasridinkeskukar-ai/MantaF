/* ============================================================
   MANTAF v3 — DASHBOARD-SAYA.JS
   Dashboard pribadi Pejabat Fungsional:
   - Profil singkat dari sesi login
   - Riwayat pendaftaran UKOM milik sendiri
     (account_username / NIK akun → tabel peserta_ukom)
   ============================================================ */

let dsInited = false;

SectionInit['dashboard-saya'] = function(){
  if(dsInited){ loadDashboardSaya(); return; }
  dsInited = true;
  loadDashboardSaya();
};

async function loadDashboardSaya(){
  const s = getAdminSession();
  if(!s){ showToast('Sesi tidak ditemukan, silakan login ulang', 'error'); return; }

  /* --- Kartu profil --- */
  const namaEl = document.getElementById('dsNama');
  const metaEl = document.getElementById('dsMeta');
  if(namaEl) namaEl.textContent = s.nama || s.username || 'Pejabat Fungsional';
  if(metaEl){
    const bits = [];
    bits.push(mantafRoleLabel(s.role));
    if(s.unit_kerja) bits.push(s.unit_kerja);
    if(s.nik) bits.push('NIK ' + s.nik);
    metaEl.textContent = bits.join(' · ') || ('@' + s.username);
  }

  /* --- Cek konfigurasi DB --- */
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }

  /* --- Muat riwayat --- */
  const body = document.getElementById('dsBody');
  if(!body) return;
  body.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:#64748b"><i class="fas fa-spinner fa-spin"></i> Memuat riwayat pendaftaran…</td></tr>';

  try{
    const rows = await API.getMyPeserta(s.username, s.nik);
    renderDashboardSaya(rows || []);
  }catch(err){
    console.error('[dashboard-saya] gagal memuat:', err);
    body.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:#dc2626">' +
      '<i class="fas fa-triangle-exclamation"></i> Gagal memuat riwayat: ' + escapeHtml(err.message) +
      '<div style="font-size:12px;color:#64748b;margin-top:6px">Pastikan <code>supabase/multiuser-v3.sql</code> sudah dijalankan di Supabase.</div></td></tr>';
  }
}

function renderDashboardSaya(rows){
  const body = document.getElementById('dsBody');
  if(!body) return;

  /* --- Statistik --- */
  const total = rows.length;
  const proses = rows.filter(function(r){
    const v = String(r.status_verifikasi || '');
    return v === 'Menunggu' || v === 'Proses' || v === 'Perbaikan';
  }).length;
  const disetujui = rows.filter(function(r){ return r.status_verifikasi === 'Disetujui'; }).length;
  const sertifikat = rows.filter(function(r){ return r.sertifikat; }).length;
  const set = function(id, v){ const el = document.getElementById(id); if(el) el.textContent = v; };
  set('dsTotal', total); set('dsProses', proses); set('dsDisetujui', disetujui); set('dsSertifikat', sertifikat);

  /* --- Tabel riwayat --- */
  if(!total){
    body.innerHTML = '<tr><td colspan="7" class="empty-state" style="padding:34px">' +
      '<i class="fas fa-inbox"></i>Belum ada pendaftaran yang tertaut dengan akun Anda.<br>' +
      '<span style="font-size:12.5px">Klik tombol <b>Daftar UKOM</b> di atas untuk membuat pendaftaran pertama Anda.</span></td></tr>';
    return;
  }

  let html = '';
  rows.forEach(function(r, i){
    const tujuan = [r.jabfung_tujuan, r.jenjang_tujuan].filter(Boolean).join(' — ') || '—';
    html += '<tr>' +
      '<td><code style="font-size:11.5px">' + escapeHtml(r.no_registrasi || '—') + '</code></td>' +
      '<td>' + escapeHtml(r.jenis_ukom || '—') + '</td>' +
      '<td>' + escapeHtml(tujuan) + '</td>' +
      '<td>' + escapeHtml(r.periode || '—') + '</td>' +
      '<td>' + badgeVerifikasi(r.status_verifikasi) + '</td>' +
      '<td>' + badgeLengkap(r.status_ukom || '-') + '</td>' +
      '<td><div class="admin-row-actions">' +
        (r.sertifikat
          ? '<a class="act-btn act-edit" href="' + escAttr(r.sertifikat) + '" target="_blank" rel="noopener" title="Lihat Sertifikat"><i class="fas fa-certificate"></i></a>'
          : '') +
        '<button class="act-btn act-edit" title="Cek Status Detail" onclick="goCekStatus(\'' + escAttr(r.nik || r.no_registrasi || '') + '\')"><i class="fas fa-magnifying-glass"></i></button>' +
      '</div></td>' +
      '</tr>';
  });
  body.innerHTML = html;
}

/* Isi keyword di halaman Cek Status lalu buka (jika sudah dimuat) */
function goCekStatus(keyword){
  if(!keyword){ showToast('NIK/no. registrasi belum tersedia', 'info'); return; }
  showSection('status').then(function(){
    setTimeout(function(){
      const el = document.getElementById('cekData');
      if(el){
        el.value = keyword;
        cekStatus();
      }
    }, 350);
  });
}
