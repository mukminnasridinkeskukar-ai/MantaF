/* ============================================================
   MANTAF v2 — UKOM.JS
   Formulir pendaftaran UKOM → Supabase (Storage + tabel)
   Fitur:
   - Nomor registrasi + waktu otomatis di paling atas formulir
   - Konfirmasi "sudah benar & lengkap?" sebelum kirim
   - Bukti registrasi (receipt) + cetak setelah terkirim
   ============================================================ */

/* ---------- Data opsi select ---------- */
const OPT_UNIT_KERJA = ['Dinas Kesehatan','RSUD Aji Muhammad Parikesit','RSUD Aji Batara Agung Dewa Sakti','RSUD Dayaku Raja','UPTD Puskesmas Samboja','UPTD Puskesmas Sungai Merdeka','UPTD Puskesmas Handil Baru','UPTD Puskesmas Muara Jawa','UPTD Puskesmas Sangasanga','UPTD Puskesmas Loa Janan','UPTD Puskesmas Batuah','UPTD Puskesmas Loa Duri','UPTD Puskesmas Loa Kulu','UPTD Puskesmas Muara Muntai','UPTD Puskesmas Muara Wis','UPTD Puskesmas Kota Bangun','UPTD Puskesmas Rimba Ayu','UPTD Puskesmas Mangkurawang','UPTD Puskesmas Loa Ipuh','UPTD Puskesmas Sebulu I','UPTD Puskesmas Sebulu II','UPTD Puskesmas Separi III','UPTD Puskesmas Teluk Dalam','UPTD Puskesmas Sungai Mariam','UPTD Puskesmas Muara Badak','UPTD Puskesmas Badak Baru','UPTD Puskesmas Marang Kayu','UPTD Puskesmas Perangat','UPTD Puskesmas Muara Kaman','UPTD Puskesmas Kahala','UPTD Puskesmas Kembang Janggut','UPTD Puskesmas Tabang','UPTD Puskesmas Ritan Baru','UPTD Puskesmas Rapak Mahang','UPTD Puskesmas Bunga Jadi','UPTD Puskesmas Jonggon Jaya','Instalasi Farmasi Kabupaten','Labkesda'];

const OPT_PANGKAT = ['Pengatur Muda - II/a','Pengatur Muda Tk. I - II/b','Pengatur - II/c','Pengatur Tk. I - II/d','Penata Muda - III/a','Penata Muda Tk. I - III/b','Penata - III/c','Penata Tk. I - III/d','Pembina - IV/a','Pembina Tk. I - IV/b','Pembina Utama Muda - IV/c','Pembina Utama Madya - IV/d','Pembina Utama - IV/e'];

const OPT_JENJANG = ['Ahli Pertama','Ahli Muda','Mahir','Penyelia','Ahli Madya','Terampil','Ahli Utama'];

const OPT_JENIS_UKOM = ['Naik Jabatan','Pindah Jabatan'];

const OPT_JABFUNG = ['Tenaga Sanitasi Lingkungan','Asisten Apoteker','Epidemiolog Kesehatan','Promosi Kesehatan dan Ilmu Perilaku','Pembimbing Kesehatan Kerja','Entomolog kesehatan','Nutrisionis','Teknisi Elektromedis','Administrator Kesehatan','Dokter Sub Spesialis Paru- Infeksi','Dokter Sub Spesialis Penyakit Dalam-Endokrin Metabolik Dan Diabetes','Dokter Sub Spesialis Penyakit Dalam-Ginjal Hipertensi','Dokter Sub Spesialis Penyakit Dalam-Hematologi-Onkologi Medik','Dokter Sub Spesialis Bedah- Bedah Onkologi','Dokter Gigi Spesialis Periodonsia','Dokter Gigi Spesialis Konservasi Gigi','Dokter Gigi Spesialis Bedah Mulut dan Maksilofasial','Dokter Spesialis Gizi Klinik','Dokter Spesialis Kedokteran Nuklir','Dokter Sub Spesialis Paru- Pulmonologi Intervensi Dan Gawat Darurat Napas','Dokter Sub Spesialis Paru- Paru Kerja Dan Lingkungan','Dokter Sub Spesialis Radiologi- Radiologi Intervensional','Dokter Sub Spesialis Radiologi- Neuroradiologi Dan Kepala Leher','Dokter Sub Spesialis Bedah Saraf-Vaskular','Dokter Sub Spesialis Neurologi- Neurovaskular, Neurointervensi, Imaging, Otologi, Oftalmologi','Dokter Sub Spesialis Jantung Dan Pembuluh Darah-Kardiologi Intervensi','Dokter Sub Spesialis Penyakit Dalam-Kardiovaskular','Dokter Sub Spesialis Obgyn- Onkologi Ginekologi Konk','Dokter Spesialis Obstetri dan Ginekologi','Dokter Sub Spesialis Bedah- Bedah Vaskuler Dan Endovaskuler','Dokter Sub Spesialis Anestesi- Intensif Care/ICU','Dokter Spesialis Bedah Toraks Kardiovaskuler','Dokter Spesialis Kedokteran Forensik dan Medikolegal','Dokter Spesialis Mikrobiologi Klinik','Dokter Spesialis Anestesiologi dan Terapi Intensif','DOKTER','DOKTER GIGI','Dokter Spesialis Penyakit Dalam','Dokter Spesialis Bedah','Dokter Spesialis Anak','Dokter Spesialis Mata','Dokter Spesialis Dermatologi dan Venereologi','Dokter Kedokteran Fisik dan Rehabilitasi','Dokter Spesialis Jantung dan Pembuluh Darah','Dokter Spesialis Bedah Plastik Rekonstruksi dan Estetis','Dokter Spesialis Bedah Anak','Dokter Spesialis Patologi Anatomi','Dokter Spesialis Patologi Klinik','Dokter Spesialis Urologi','Dokter Spesialis Kedokteran Jiwa atau Psikiatri','Dokter Spesialis Bedah Saraf','Dokter Spesialis Neurologi','Dokter Spesialis Orthopaedi dan Traumatologi','Dokter Spesialis Telinga Hidung Tenggorok - Bedah Kepala Dan Leher','Dokter Spesialis Pulmonologi dan Kedokteran Respirasi (Paru)','Dokter Spesialis Radiologi','PERAWAT','BIDAN','PENATA ANESTESI','ASISTEN PENATA ANESTESI','TERAPIS GIGI DAN MULUT','PRANATA LABORATORIUM KESEHATAN','TEKNISI TRANSFUSI DARAH','RADIOGRAFER','FISIKAWAN MEDIS','REFRAKSIONIS OPTISIEN/OPTOMETRIS','APOTEKER','PEREKAM MEDIS','FISIOTERAPIS','TERAPIS WICARA','OKUPASI TERAPIS','PSIKOLOGI KLINIS','Dokter Sub Spesialis Tht- Onkologi Kepala Leher','Dokter Sub Spesialis Tht- Bronkoesofagologi','Dokter Sub Spesialis Tht- Alergi Imunologi','Dokter Sub Spesialis Tht- Neurotologi','Dokter Sub Spesialis Tht- Otologi','Dokter Sub Spesialis Tht- Rinologi','Dokter Sub Spesialis Obgyn- Fertilitas-Endokrinologi Reproduksi Kfer','Dokter Sub Spesialis Anak- Kardiologi','Dokter Sub Spesialis Anak- Neonatologi','Dokter Sub Spesialis Anak- Respirologi','Dokter Sub Spesialis Anak- Hematologi Onkologi','Dokter Sub Spesialis Anak- Tumbuh Kembang Ped. Sosial','Dokter Sub Spesialis Bedah Anak-Digestif Anak','Dokter Spesialis Onkologi Radiasi','Dokter Sub Spesialis Kedokteran Nuklir-Onkologi','Dokter Gigi Spesialis Kedokteran Gigi dan Anak (Pedodontik)','Dokter Gigi Spesialis Penyakit Mulut','Dokter Spesialis Emergency Medic (Kedaruratan Medik)','Dokter Sub Spesialis Bedah- Bedah Digestif','Teknisi Gigi','Dokter Spesialis Kedokteran Okupasi','Dokter Gigi Spesialis Ortodonsia'];

/* Map nama input file → (kolom DB, bucket) */
const UKOM_FILE_MAP = {
  upload_pak_konvensional_integrasi_konversi_terakhir: { col:'file_pak',        bucket:'dokumen' },
  upload_foto_4x6_latar_merah:                         { col:'file_foto',       bucket:'foto' },
  upload_daftar_riwayat_hidup:                         { col:'file_drh',        bucket:'dokumen' },
  upload_ijazah_terakhir:                              { col:'file_ijazah',     bucket:'dokumen' },
  upload_str:                                          { col:'file_str',        bucket:'dokumen' },
  upload_sk_pangkat_terakhir:                          { col:'file_sk_pangkat', bucket:'dokumen' },
  upload_sk_jabfung_terakhir:                          { col:'file_sk_jabfung', bucket:'dokumen' },
  upload_skp_2_tahun_terakhir:                         { col:'file_skp',        bucket:'dokumen' },
  upload_surat_keterangan_tidak_sedang_menjalani_hukuman_disiplin: { col:'file_skmd', bucket:'dokumen' }
};

let ukomInited = false;

SectionInit['ukom'] = function(){
  if(ukomInited){ regClockTick(); return; }
  ukomInited = true;

  fillSelect('selUnitKerja', OPT_UNIT_KERJA);
  fillSelect('selPangkat', OPT_PANGKAT);
  fillSelect('selJenisKelamin', ['Laki-Laki','Perempuan']);
  fillSelect('selJenisUkom', OPT_JENIS_UKOM);
  fillSelect('selJabfungSaatIni', OPT_JABFUNG);
  fillSelect('selJabfungTujuan', OPT_JABFUNG);
  fillSelect('selJenjangSaatIni', OPT_JENJANG);
  fillSelect('selJenjangTujuan', OPT_JENJANG);

  document.getElementById('ukomForm').addEventListener('submit', submitUkomForm);

  newRegistrasiIdentity();
};

function fillSelect(id, options){
  const sel = document.getElementById(id);
  if(!sel) return;
  options.forEach(function(v){
    sel.insertAdjacentHTML('beforeend', '<option value="' + escAttr(v) + '">' + escapeHtml(v) + '</option>');
  });
}

/* ============================================================
   IDENTITAS REGISTRASI (nomor + waktu otomatis)
   ============================================================ */
function genNoRegistrasi(){
  const d = new Date();
  const ymd = d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  /* tanpa karakter mudah tertukar (I,O,0,1) */
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rnd = '';
  for(let i = 0; i < 6; i++) rnd += chars[Math.floor(Math.random() * chars.length)];
  return 'REG-' + ymd + '-' + rnd;
}

function regClockTick(){
  const el = document.getElementById('regTime');
  if(!el) return;
  const d = new Date();
  el.textContent =
    d.toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) +
    ' • ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

let regClockTimer = null;

function newRegistrasiIdentity(){
  const n = document.getElementById('regNumber');
  if(n) n.textContent = genNoRegistrasi();
  regClockTick();
  if(!regClockTimer) regClockTimer = setInterval(regClockTick, 1000);
}

/* ============================================================
   SUBMIT — alur: validasi → konfirmasi → unggah+simpan → bukti
   ============================================================ */
let _ukomPending = null;

async function submitUkomForm(e){
  e.preventDefault();
  if(!db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }

  const form = e.target;
  const nik = sanitizeInput(form.querySelector('[name="nik"]').value, 16);
  const nama = sanitizeInput(form.querySelector('[name="nama_tanpa_gelar"]').value, 100);
  const unitKerja = form.querySelector('[name="nama_unit_kerja"]').value;

  /* Validasi */
  if(!/^[0-9]{16}$/.test(nik)){ showToast('NIK harus 16 digit angka', 'error'); return; }
  const email = form.querySelector('[name="email_aktif"]').value;
  if(email && !validateEmail(email)){ showToast('Format email tidak valid', 'error'); return; }
  const wa = form.querySelector('[name="nomor_whatsapp"]').value;
  if(wa && !validatePhone(wa)){ showToast('Format nomor WhatsApp tidak valid (contoh: 081234567890)', 'error'); return; }

  /* Batas ukuran file */
  const fileInputs = form.querySelectorAll('input[type="file"]');
  for(const input of fileInputs){
    if(input.files[0] && input.files[0].size > SUPABASE_CONFIG.maxFileSize){
      showToast('Ukuran file "' + input.files[0].name + '" melebihi 2MB', 'error');
      return;
    }
  }

  /* ringkasan untuk konfirmasi */
  let nFile = 0;
  for(const input of fileInputs){ if(input.files[0]) nFile++; }

  _ukomPending = {
    form: form,
    noRegistrasi: ((document.getElementById('regNumber') || {}).textContent || '').replace(/[^A-Z0-9-]/gi, '') || genNoRegistrasi(),
    nama: nama,
    nik: nik,
    unit: unitKerja,
    jenis: form.querySelector('[name="jenis_ukom"]').value || '-',
    tujuan: form.querySelector('[name="jabfung_tujuan"]').value || '-',
    nFile: nFile
  };

  openUkomConfirm();
}

/* ---------- MODAL KONFIRMASI ---------- */
function openUkomConfirm(){
  const d = _ukomPending;
  if(!d) return;

  const old = document.getElementById('ukomConfirmOverlay');
  if(old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'crud-overlay';
  overlay.id = 'ukomConfirmOverlay';
  overlay.innerHTML =
    '<div class="crud-modal" style="max-width:480px">' +
      '<div class="crud-modal-header"><h3><i class="fas fa-clipboard-question" style="color:#0f766e"></i> Konfirmasi Pengiriman</h3>' +
      '<button class="close" onclick="closeUkomConfirm()">&times;</button></div>' +
      '<div class="crud-modal-body">' +
        '<div class="ukom-confirm-q"><i class="fas fa-circle-question"></i> Apakah data yang Anda isi sudah benar dan lengkap?</div>' +
        '<div class="ukom-confirm-summary">' +
          ucsRow('Nomor Registrasi', d.noRegistrasi) +
          ucsRow('Nama', d.nama) +
          ucsRow('NIK', d.nik) +
          ucsRow('Unit Kerja', d.unit) +
          ucsRow('Jenis UKOM', d.jenis) +
          ucsRow('Jabfung Tujuan', d.tujuan) +
          ucsRow('Dokumen Diunggah', d.nFile + ' dari ' + Object.keys(UKOM_FILE_MAP).length + ' berkas') +
        '</div>' +
        '<div class="crud-hint" style="margin-top:12px"><i class="fas fa-triangle-exclamation"></i> ' +
        'Pastikan seluruh data dan berkas sudah sesuai sebelum dikirim. Pendaftaran yang sudah terkirim ' +
        'akan diverifikasi oleh admin dan tidak dapat diubah dari sisi peserta.</div>' +
      '</div>' +
      '<div class="crud-modal-footer">' +
        '<button class="btn btn-ghost" onclick="closeUkomConfirm()"><i class="fas fa-rotate-left"></i> Periksa Lagi</button>' +
        '<button class="btn" id="ukomConfirmYes"><i class="fas fa-paper-plane"></i> Ya, Kirim Pendaftaran</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector('#ukomConfirmYes').addEventListener('click', function(){
    closeUkomConfirm();
    doSubmitUkom();
  });
}

function ucsRow(label, val){
  return '<div class="ucs-row"><span>' + label + '</span><b>' + escapeHtml(String(val || '-')) + '</b></div>';
}

function closeUkomConfirm(){
  const o = document.getElementById('ukomConfirmOverlay');
  if(o) o.remove();
}

/* ---------- KIRIM KE SUPABASE ---------- */
async function doSubmitUkom(){
  const d = _ukomPending;
  if(!d) return;

  const form = d.form;
  const btn = document.getElementById('ukomSubmitBtn');
  const fileInputs = form.querySelectorAll('input[type="file"]');

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengunggah & Mengirim…';

  try{
    /* 1) Susun baris data (termasuk nomor registrasi) */
    const row = {
      no_registrasi: d.noRegistrasi,
      nik: d.nik,
      nip: sanitizeInput(form.querySelector('[name="nip"]').value, 30),
      nama_tanpa_gelar: d.nama,
      jenis_kelamin: form.querySelector('[name="jenis_kelamin"]').value || null,
      nama_unit_kerja: d.unit,
      pangkat_golongan: form.querySelector('[name="pangkat_dan_golongan"]').value || null,
      no_sk_jabfung: sanitizeInput(form.querySelector('[name="nomor_sk_jabfungs_terakhir"]').value, 100) || null,
      jabfung_saat_ini: form.querySelector('[name="jabfung_saat_ini"]').value || null,
      jenjang_saat_ini: form.querySelector('[name="jenjang_saat_ini"]').value || null,
      jabfung_tujuan: form.querySelector('[name="jabfung_tujuan"]').value || null,
      jenjang_tujuan: form.querySelector('[name="jenjang_tujuan"]').value || null,
      jenis_ukom: form.querySelector('[name="jenis_ukom"]').value || null,
      nilai_pak_terakhir: sanitizeInput(form.querySelector('[name="nilai_pak_terakhir"]').value, 50) || null,
      nomor_whatsapp: sanitizeInput(form.querySelector('[name="nomor_whatsapp"]').value, 20) || null,
      email_aktif: sanitizeInput(form.querySelector('[name="email_aktif"]').value, 100) || null,
      status_verifikasi: 'Menunggu'
    };

    /* 2) Upload file ke Supabase Storage */
    for(const input of fileInputs){
      const file = input.files[0];
      if(!file) continue;
      const conf = UKOM_FILE_MAP[input.name];
      if(!conf) continue;
      const url = await API.uploadFile(conf.bucket, file, d.nik);
      if(url) row[conf.col] = url;
    }

    /* 3) Insert ke tabel peserta_ukom.
       Tahan banting: bila kolom no_registrasi belum ada (schema lama belum
       di-update), kirim ulang tanpa kolom tersebut agar pendaftaran tetap masuk. */
    try{
      await API.createPeserta(row);
    }catch(err){
      if(/no[_-]?registrasi|PGRST204|42703/i.test(err.message || '')){
        delete row.no_registrasi;
        await API.createPeserta(row);
      }else{
        throw err;
      }
    }

    /* 4) Terbitkan BUKTI REGISTRASI */
    const waktuDaftar = new Date().toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) +
      ' • ' + new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    showBuktiRegistrasi({
      noRegistrasi: d.noRegistrasi,
      nama: d.nama,
      nik: d.nik,
      unit: d.unit,
      jenis: d.jenis,
      tujuan: d.tujuan,
      nFile: d.nFile,
      waktu: waktuDaftar
    });

    showToast('Pendaftaran berhasil dikirim! Bukti registrasi diterbitkan.', 'success');

    /* 5) Formulir segar untuk pendaftar berikutnya */
    form.reset();
    newRegistrasiIdentity();
  }catch(err){
    console.error(err);
    showToast('Gagal mengirim: ' + err.message, 'error');
  }finally{
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

/* ============================================================
   BUKTI REGISTRASI (receipt + cetak)
   ============================================================ */
function buktiRow(label, val){
  return '<div class="bukti-row"><span>' + label + '</span><b>' +
    (val ? escapeHtml(String(val)) : '-') + '</b></div>';
}

function showBuktiRegistrasi(d){
  const old = document.getElementById('buktiOverlay');
  if(old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'crud-overlay';
  overlay.id = 'buktiOverlay';
  overlay.innerHTML =
    '<div class="crud-modal" style="max-width:520px">' +
      '<div class="crud-modal-header"><h3><i class="fas fa-circle-check" style="color:#16a34a"></i> Pendaftaran Terkirim</h3>' +
      '<button class="close" onclick="closeBuktiRegistrasi()">&times;</button></div>' +
      '<div class="crud-modal-body">' +
        '<div class="bukti-card" id="buktiCard">' +
          '<div class="bukti-brand"><i class="fas fa-hospital"></i> MantaF &mdash; Dinas Kesehatan Kutai Kartanegara</div>' +
          '<div class="bukti-title">BUKTI REGISTRASI UKOM</div>' +
          '<div class="bukti-no">' + escapeHtml(d.noRegistrasi) + '</div>' +
          '<div class="bukti-rows">' +
            buktiRow('Nama', d.nama) +
            buktiRow('NIK', d.nik) +
            buktiRow('Unit Kerja', d.unit) +
            buktiRow('Jenis UKOM', d.jenis) +
            buktiRow('Jabfung Tujuan', d.tujuan) +
            buktiRow('Dokumen Terunggah', d.nFile + ' berkas') +
            buktiRow('Waktu Daftar', d.waktu) +
          '</div>' +
          '<div class="bukti-status"><span class="badge-status badge-menunggu">Menunggu Verifikasi</span></div>' +
          '<div class="bukti-foot">Simpan / cetak bukti ini. Pantau pendaftaran melalui menu ' +
          '<b>Cek Status</b> dengan memasukkan NIK, NIP, atau nomor registrasi Anda.</div>' +
        '</div>' +
      '</div>' +
      '<div class="crud-modal-footer bukti-actions">' +
        '<button class="btn btn-ghost" onclick="closeBuktiRegistrasi()">Tutup</button>' +
        '<button class="btn" onclick="printBuktiRegistrasi()"><i class="fas fa-print"></i> Cetak Bukti</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
}

function closeBuktiRegistrasi(){
  const o = document.getElementById('buktiOverlay');
  if(o) o.remove();
}

function printBuktiRegistrasi(){
  document.body.classList.add('printing-receipt');
  const done = function(){
    document.body.classList.remove('printing-receipt');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 2000); /* fallback bila afterprint tidak terpanggil */
}
