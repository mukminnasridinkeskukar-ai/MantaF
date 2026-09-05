/* ============================================================
   MANTAF v2 — STATUS.JS
   Cek status peserta via NIK / NIP:
   - kartu hasil + panduan langkah berikutnya per status
   - kotak CATATAN ADMIN (dengan waktu pembaruan)
   - tombol Lihat Sertifikat (bila Disetujui & sertifikat ada)
   - form perbaikan data + unggah ulang berkas (bila Perbaikan)
   ============================================================ */

SectionInit['status'] = function(){
  /* form perbaikan disembunyikan sampai dibutuhkan */
};

/* ---------- PANDUAN PER STATUS (langkah berikutnya untuk peserta) ---------- */
const CEK_GUIDE = {
  'Menunggu':    { icon:'fa-hourglass-half', tone:'neutral', text:'Pendaftaran Anda sudah diterima dan menunggu antrean verifikasi admin. Pantau halaman ini secara berkala.' },
  'Proses':      { icon:'fa-magnifying-glass', tone:'info',    text:'Berkas Anda sedang dalam proses verifikasi oleh admin Dinas Kesehatan.' },
  'Disetujui':   { icon:'fa-circle-check',    tone:'success', text:'Selamat! Berkas Anda dinyatakan lengkap dan disetujui. Ikuti jadwal UKOM sesuai pengumuman resmi.' },
  'Ditolak':     { icon:'fa-circle-xmark',    tone:'danger',  text:'Pendaftaran Anda ditolak. Baca catatan admin di bawah untuk mengetahui alasannya.' },
  'Dilimpahkan': { icon:'fa-share-nodes',     tone:'info',    text:'Berkas Anda telah dilimpahkan ke unit kerja / instansi terkait untuk proses selanjutnya.' },
  'Batal':       { icon:'fa-ban',             tone:'danger',  text:'Pendaftaran Anda berstatus dibatalkan. Hubungi admin bila terdapat kekeliruan.' },
  'Perbaikan':   { icon:'fa-pen-to-square',   tone:'warn',    text:'Terdapat data / berkas yang perlu diperbaiki. Baca catatan admin di bawah, lalu gunakan tombol Perbaiki Data.' }
};

function cekToneClass(tone){
  return { neutral:'cek-tone-neutral', info:'cek-tone-info', success:'cek-tone-success',
           danger:'cek-tone-danger', warn:'cek-tone-warn' }[tone] || 'cek-tone-neutral';
}

function cekItem(label, val){
  return '<div class="cek-item"><span>' + label + '</span><b>' +
         (val ? escapeHtml(val) : '-') + '</b></div>';
}

/* ---------- CEK STATUS ---------- */
async function cekStatus(){
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }
  const keyword = sanitizeInput(document.getElementById('cekData').value, 30);
  const hasil = document.getElementById('hasilStatus');

  if(!keyword){ showToast('Masukkan NIK atau NIP terlebih dahulu', 'info'); return; }

  hasil.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mencari data...';

  try{
    const rows = await API.getPesertaByKeyword(keyword);

    if(!rows || rows.length === 0){
      hasil.innerHTML =
        '<div style="text-align:center;padding:14px">' +
        '<i class="fas fa-circle-question" style="font-size:30px;color:#cbd5e1;display:block;margin-bottom:10px"></i>' +
        '<b>Data tidak ditemukan.</b><br>' +
        '<span style="font-size:13px;color:#64748b">Periksa kembali NIK/NIP yang Anda masukkan, atau hubungi admin.</span></div>';
      return;
    }

    const p = rows[0];
    const st = String(p.status_verifikasi || 'Menunggu').trim();
    const g = CEK_GUIDE[st] || CEK_GUIDE['Menunggu'];

    /* --- kepala kartu --- */
    let html =
      '<div class="cek-head">' +
        '<div class="cek-ava"><i class="fas fa-user"></i></div>' +
        '<div class="cek-head-txt">' +
          '<h3>' + escapeHtml(p.nama_tanpa_gelar || '-') + '</h3>' +
          '<span>NIK ' + escapeHtml(p.nik || '-') + (p.nip ? ' &middot; NIP ' + escapeHtml(p.nip) : '') + '</span>' +
        '</div>' +
        badgeVerifikasi(st) +
      '</div>' +

    /* --- strip status + panduan langkah berikutnya --- */
      '<div class="cek-guide ' + cekToneClass(g.tone) + '">' +
        '<i class="fas ' + g.icon + '"></i>' +
        '<div><b>Status: ' + escapeHtml(st) + '</b><br>' + g.text + '</div>' +
      '</div>' +

    /* --- detail data peserta --- */
      '<div class="cek-grid">' +
        cekItem('No. Registrasi', p.no_registrasi) +
        cekItem('Unit Kerja', p.nama_unit_kerja) +
        cekItem('Jenis UKOM', p.jenis_ukom) +
        cekItem('Jabfung Tujuan', p.jabfung_tujuan) +
        cekItem('Jenjang Tujuan', p.jenjang_tujuan) +
        cekItem('Periode', p.periode) +
        cekItem('No. Peserta', p.no_peserta) +
        cekItem('Status UKOM', p.status_ukom) +
        cekItem('Terdaftar', p.created_at ? formatDateId(p.created_at) : '') +
      '</div>';

    /* --- CATATAN ADMIN (selalu tampil agar fitur dikenal peserta) --- */
    const cat = String(p.catatan_admin || '').trim();
    const catTone = ({ 'Perbaikan':'warn', 'Ditolak':'danger', 'Batal':'danger', 'Disetujui':'success' })[st] || 'neutral';
    html +=
      '<div class="cek-catatan ' + cekToneClass(catTone) + '">' +
        '<div class="cek-catatan-head"><i class="fas fa-comment-dots"></i> Catatan Admin</div>' +
        (cat
          ? '<div class="cek-catatan-body">' + escapeHtml(cat) + '</div>'
          : '<div class="cek-catatan-body" style="color:#94a3b8">Belum ada catatan dari admin untuk pendaftaran Anda.</div>') +
        (cat && p.updated_at
          ? '<div class="cek-catatan-time"><i class="fas fa-clock"></i> Diperbarui ' + formatDateTimeId(p.updated_at) + '</div>'
          : '') +
      '</div>';

    /* --- aksi --- */
    const actions = [];
    if(st === 'Disetujui' && p.sertifikat){
      actions.push('<a class="btn" href="' + escAttr(p.sertifikat) + '" target="_blank" rel="noopener" onclick="openFileTab(event, this.href)">' +
        '<i class="fas fa-certificate"></i> Lihat Sertifikat</a>');
    }
    if(st === 'Perbaikan'){
      actions.push('<button class="btn btn-violet" onclick="showPerbaikanForm()">' +
        '<i class="fas fa-pen-to-square"></i> Perbaiki Data</button>');
    }
    if(actions.length) html += '<div class="cek-actions">' + actions.join('') + '</div>';

    hasil.innerHTML = html;

    /* simpan data terakhir untuk form perbaikan */
    window._lastCheckedPeserta = p;
  }catch(err){
    hasil.innerHTML = '<span style="color:#dc2626">Gagal memeriksa status: ' + escapeHtml(err.message) + '</span>';
  }
}

/* ---------- FORM PERBAIKAN ---------- */
const PERBAIKAN_FILES = [
  { id:'FilePak',      label:'Unggah Ulang PAK (PDF)',        col:'file_pak',        accept:'.pdf',  bucket:'dokumen' },
  { id:'FileFoto',     label:'Unggah Ulang Foto (JPG/PNG)',   col:'file_foto',       accept:'image/*', bucket:'foto' },
  { id:'FileIjazah',   label:'Unggah Ulang Ijazah (PDF)',     col:'file_ijazah',     accept:'.pdf',  bucket:'dokumen' },
  { id:'FileStr',      label:'Unggah Ulang STR (PDF)',        col:'file_str',        accept:'.pdf',  bucket:'dokumen' },
  { id:'FileSkPangkat',label:'Unggah Ulang SK Pangkat (PDF)', col:'file_sk_pangkat', accept:'.pdf',  bucket:'dokumen' },
  { id:'FileSkJabfung',label:'Unggah Ulang SK Jabfung (PDF)', col:'file_sk_jabfung', accept:'.pdf',  bucket:'dokumen' }
];

function showPerbaikanForm(){
  const p = window._lastCheckedPeserta;
  if(!p){ showToast('Cek status terlebih dahulu', 'info'); return; }

  const catatan = String(p.catatan_admin || '').trim();

  const overlay = document.createElement('div');
  overlay.className = 'crud-overlay';
  overlay.innerHTML =
    '<div class="crud-modal">' +
      '<div class="crud-modal-header"><h3><i class="fas fa-pen-to-square" style="color:#7c3aed"></i> Form Perbaikan Data</h3>' +
      '<button class="close" onclick="this.closest(\'.crud-overlay\').remove()">&times;</button></div>' +
      '<div class="crud-modal-body">' +
        (catatan
          ? '<div class="cek-catatan cek-tone-warn" style="margin:0 0 12px">' +
            '<div class="cek-catatan-head"><i class="fas fa-comment-dots"></i> Catatan Admin</div>' +
            '<div class="cek-catatan-body">' + escapeHtml(catatan) + '</div></div>'
          : '<div class="crud-hint"><i class="fas fa-circle-info"></i> Perbarui data di bawah bila terdapat kesalahan, lalu unggah ulang berkas yang perlu diperbaiki.</div>') +
        '<form id="perbaikanFormEl">' +
        '<div class="form-grid">' +
        '<div class="form-group"><label>NIK</label><input type="text" value="' + escAttr(p.nik || '') + '" readonly></div>' +
        '<div class="form-group"><label>NIP</label><input type="text" id="perbaikanNip" value="' + escAttr(p.nip || '') + '"></div>' +
        '<div class="form-group"><label>Nama Tanpa Gelar</label><input type="text" id="perbaikanNama" value="' + escAttr(p.nama_tanpa_gelar || '') + '"></div>' +
        '<div class="form-group"><label>Unit Kerja</label><input type="text" value="' + escAttr(p.nama_unit_kerja || '') + '" readonly></div>' +
        PERBAIKAN_FILES.map(function(f){
          return '<div class="form-group"><label>' + f.label + '</label>' +
                 '<input type="file" id="perbaikan' + f.id + '" accept="' + f.accept + '"></div>';
        }).join('') +
        '</div></form>' +
        '<p style="font-size:12px;color:#94a3b8;margin-top:10px"><i class="fas fa-circle-info"></i> ' +
        'Ukuran berkas maksimal 2MB. Kosongkan berkas yang tidak perlu diganti. ' +
        'Setelah dikirim, status kembali ke <b>Menunggu</b> untuk diverifikasi ulang admin.</p>' +
      '</div>' +
      '<div class="crud-modal-footer">' +
        '<button class="btn btn-ghost" onclick="this.closest(\'.crud-overlay\').remove()">Batal</button>' +
        '<button class="btn btn-violet" id="perbaikanSubmitBtn"><i class="fas fa-paper-plane"></i> Kirim Perbaikan</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  overlay.querySelector('#perbaikanSubmitBtn').addEventListener('click', async function(){
    const btn = this;
    const nip = sanitizeInput(overlay.querySelector('#perbaikanNip').value, 30);
    const nama = sanitizeInput(overlay.querySelector('#perbaikanNama').value, 100);

    if(!nama){ showToast('Nama tidak boleh kosong', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim…';

    try{
      const row = { nip: nip, nama_tanpa_gelar: nama };

      /* unggah ulang berkas yang dipilih peserta */
      for(const f of PERBAIKAN_FILES){
        const file = overlay.querySelector('#perbaikan' + f.id).files[0];
        if(!file) continue;
        if(file.size > SUPABASE_CONFIG.maxFileSize){
          throw new Error('Ukuran berkas ' + f.label.replace('Unggah Ulang ', '') + ' melebihi 2MB');
        }
        row[f.col] = await API.uploadFile(f.bucket, file, p.nik);
      }

      /* status kembali ke antrean verifikasi; catatan lama dipertahankan
         + jejak audit agar admin tahu peserta sudah memperbaiki */
      row.status_verifikasi = 'Menunggu';
      const trail = '[' + formatDateTimeId(new Date().toISOString()) + '] Peserta mengirim perbaikan data — menunggu verifikasi ulang.';
      row.catatan_admin = catatan ? (catatan + '\n' + trail) : trail;

      await API.updatePeserta(p.id, row);
      showToast('Perbaikan data berhasil dikirim. Menunggu verifikasi ulang admin.', 'success');
      overlay.remove();
      pesertaUkomCache = null;
      dashPesertaCache = null;
      cekStatus(); /* segarkan hasil di layar */
    }catch(err){
      showToast('Gagal: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Perbaikan';
    }
  });
}
