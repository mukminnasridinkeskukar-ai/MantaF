/* ============================================================
   MANTAF v2 — STATUS.JS
   Cek status peserta via NIK / NIP + form perbaikan data
   ============================================================ */

SectionInit['status'] = function(){
  /* form perbaikan disembunyikan sampai dibutuhkan */
};

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
    let html =
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">' +
      '<h3 style="font-size:16px"><i class="fas fa-user-check" style="color:#0f766e"></i> ' + escapeHtml(p.nama_tanpa_gelar || '-') + '</h3>' +
      badgeVerifikasi(p.status_verifikasi) +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:6px 20px;font-size:13.5px">' +
      '<div><span style="color:#94a3b8;font-size:11px;text-transform:uppercase">NIK</span><br>' + escapeHtml(p.nik || '-') + '</div>' +
      '<div><span style="color:#94a3b8;font-size:11px;text-transform:uppercase">NIP</span><br>' + escapeHtml(p.nip || '-') + '</div>' +
      '<div><span style="color:#94a3b8;font-size:11px;text-transform:uppercase">Unit Kerja</span><br>' + escapeHtml(p.nama_unit_kerja || '-') + '</div>' +
      '<div><span style="color:#94a3b8;font-size:11px;text-transform:uppercase">Jabfung Tujuan</span><br>' + escapeHtml(p.jabfung_tujuan || '-') + '</div>' +
      '<div><span style="color:#94a3b8;font-size:11px;text-transform:uppercase">Jenjang Tujuan</span><br>' + escapeHtml(p.jenjang_tujuan || '-') + '</div>' +
      '<div><span style="color:#94a3b8;font-size:11px;text-transform:uppercase">Periode</span><br>' + escapeHtml(p.periode || '-') + '</div>' +
      '</div>';

    if(p.catatan_admin){
      html += '<div class="announcement" style="margin-top:14px"><b>Catatan Admin:</b><br>' + escapeHtml(p.catatan_admin) + '</div>';
    }

    if(p.status_verifikasi === 'Perbaikan'){
      html += '<button class="btn btn-violet" style="margin-top:10px" onclick="showPerbaikanForm()"><i class="fas fa-pen-to-square"></i> Perbaiki Data</button>';
    }

    hasil.innerHTML = html;

    /* simpan data terakhir untuk form perbaikan */
    window._lastCheckedPeserta = p;
  }catch(err){
    hasil.innerHTML = '<span style="color:#dc2626">Gagal memeriksa status: ' + escapeHtml(err.message) + '</span>';
  }
}

/* ---------- FORM PERBAIKAN ---------- */
function showPerbaikanForm(){
  const p = window._lastCheckedPeserta;
  if(!p){ showToast('Cek status terlebih dahulu', 'info'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'crud-overlay';
  overlay.innerHTML =
    '<div class="crud-modal">' +
      '<div class="crud-modal-header"><h3><i class="fas fa-pen-to-square" style="color:#7c3aed"></i> Form Perbaikan Data</h3>' +
      '<button class="close" onclick="this.closest(\'.crud-overlay\').remove()">&times;</button></div>' +
      '<div class="crud-modal-body">' +
        '<div class="crud-hint"><i class="fas fa-circle-info"></i> Perbarui data di bawah bila terdapat kesalahan, lalu unggah ulang dokumen yang perlu diperbaiki.</div>' +
        '<form id="perbaikanFormEl">' +
        '<div class="form-grid">' +
        '<div class="form-group"><label>NIK</label><input type="text" value="' + escAttr(p.nik || '') + '" readonly></div>' +
        '<div class="form-group"><label>NIP</label><input type="text" id="perbaikanNip" value="' + escAttr(p.nip || '') + '"></div>' +
        '<div class="form-group"><label>Nama Tanpa Gelar</label><input type="text" id="perbaikanNama" value="' + escAttr(p.nama_tanpa_gelar || '') + '"></div>' +
        '<div class="form-group"><label>Unit Kerja</label><input type="text" value="' + escAttr(p.nama_unit_kerja || '') + '" readonly></div>' +
        '<div class="form-group"><label>Unggah Ulang PAK (opsional)</label><input type="file" id="perbaikanFilePak" accept=".pdf"></div>' +
        '<div class="form-group"><label>Unggah Ulang Foto (opsional)</label><input type="file" id="perbaikanFileFoto" accept="image/*"></div>' +
        '</div></form>' +
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

      const filePak = overlay.querySelector('#perbaikanFilePak').files[0];
      if(filePak){
        if(filePak.size > SUPABASE_CONFIG.maxFileSize) throw new Error('Ukuran file PAK melebihi 2MB');
        row.file_pak = await API.uploadFile('dokumen', filePak, p.nik);
      }
      const fileFoto = overlay.querySelector('#perbaikanFileFoto').files[0];
      if(fileFoto){
        if(fileFoto.size > SUPABASE_CONFIG.maxFileSize) throw new Error('Ukuran file foto melebihi 2MB');
        row.file_foto = await API.uploadFile('foto', fileFoto, p.nik);
      }

      await API.updatePeserta(p.id, row);
      showToast('Perbaikan data berhasil dikirim. Menunggu verifikasi ulang admin.', 'success');
      overlay.remove();
      pesertaUkomCache = null;
      dashPesertaCache = null;
    }catch(err){
      showToast('Gagal: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Perbaikan';
    }
  });
}
