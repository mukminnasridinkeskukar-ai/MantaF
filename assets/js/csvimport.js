/* ============================================================
   MANTAF v2 — CSVIMPORT.JS
   Upload massal (import CSV) untuk SEMUA menu panel admin:
   Pengumuman, Bezetting, dan Peserta UKOM.
   Template CSV disesuaikan dengan kolom tabel Supabase (schema.sql).

   Alur: Unduh template -> isi di Excel / Google Sheets ->
   upload CSV -> pratinjau & validasi otomatis ->
   import massal (per-chunk) ke Supabase.
   ============================================================ */

/* ---------- 1. DEFINISI TEMPLATE (sesuai kolom schema.sql) ----------
   type kolom:
   - text     : teks biasa (opsional subtype: email / phone -> peringatan lunak)
   - nik      : NIK 16 digit (toleran terhadap notasi ilmiah Excel)
   - int      : bilangan bulat >= 0
   - date     : tanggal; terima YYYY-MM-DD / DD/MM/YYYY; output YYYY-MM-DD
   - bool     : Aktif/Nonaktif, true/false, Ya/Tidak
   - enum     : wajib salah satu nilai values (kolom dengan CHECK di Supabase)
   - softenum : dicocokkan otomatis (tanpa peduli huruf besar-kecil);
                bila tidak cocok tetap diterima, hanya diberi peringatan
   - req      : wajib diisi
   - def      : nilai default bila kosong ('today' = tanggal hari ini)
*/
const CSV_TEMPLATES = {

  pengumuman: {
    table: 'pengumuman',
    label: 'Pengumuman',
    icon: 'fa-bullhorn',
    fileName: 'template-pengumuman.csv',
    dupLabel: 'Judul',
    columns: [
      { key:'judul',     header:'judul',     req:true,  type:'text', max:200 },
      { key:'isi',       header:'isi',       req:true,  type:'text' },
      { key:'tanggal',   header:'tanggal',   type:'date', def:'today' },
      { key:'prioritas', header:'prioritas', type:'enum', values:['Normal','Penting','Segera'], def:'Normal' },
      { key:'aktif',     header:'aktif',     type:'bool', def:true }
    ],
    exampleRows: [
      ['CONTOH - hapus baris ini','Isi contoh pengumuman. Hapus baris contoh sebelum import.','2026-01-15','Penting','Aktif'],
      ['CONTOH - hapus baris ini','Isi contoh pengumuman kedua.','15/01/2026','Normal','Nonaktif']
    ],
    previewFields: ['judul','tanggal','prioritas','aktif'],
    cacheGet: function(){ return (typeof admPengCache !== 'undefined') ? admPengCache : null; },
    dupKeyOf: function(obj){ return String(obj.judul || '').trim().toLowerCase(); }
  },

  bezetting: {
    table: 'bezetting',
    label: 'Bezetting',
    icon: 'fa-table-cells-large',
    fileName: 'template-bezetting.csv',
    dupLabel: 'Instansi + Jenis Jabatan + Jenjang',
    columns: [
      { key:'instansi',           header:'instansi',           req:true, type:'text', max:150 },
      { key:'jenis_jabatan',      header:'jenis_jabatan',      req:true, type:'text', max:150 },
      { key:'jenjang',            header:'jenjang',            type:'softenum',
        valuesFn: function(){ return (typeof OPT_JENJANG !== 'undefined') ? OPT_JENJANG : ['Terampil','Penyelia','Mahir','Ahli Pertama','Ahli Muda','Ahli Madya','Ahli Utama']; } },
      { key:'kebutuhan',          header:'kebutuhan',          type:'int', def:0 },
      { key:'pemangku',           header:'pemangku',           type:'int', def:0 },
      { key:'lowongan',           header:'lowongan',           type:'int', def:0 },
      { key:'pemangku_saat_ini',  header:'pemangku_saat_ini',  type:'text' },
      { key:'pemangku_disetujui', header:'pemangku_disetujui', type:'text' }
    ],
    exampleRows: [
      ['CONTOH - hapus baris ini','Administrator Kesehatan','Ahli Pertama','5','4','1','Nama Pemangku A, Nama Pemangku B','Nama Disetujui C'],
      ['CONTOH - hapus baris ini','Perawat','Penyelia','10','7','3','Nama Pemangku D, Nama Pemangku E','']
    ],
    previewFields: ['instansi','jenis_jabatan','jenjang','lowongan'],
    cacheGet: function(){ return (typeof admBezCache !== 'undefined') ? admBezCache : null; },
    dupKeyOf: function(obj){
      return [obj.instansi, obj.jenis_jabatan, obj.jenjang].map(function(v){ return String(v||'').trim().toLowerCase(); }).join('|');
    }
  },

  peserta: {
    table: 'peserta_ukom',
    label: 'Peserta UKOM',
    icon: 'fa-users',
    fileName: 'template-peserta-ukom.csv',
    dupLabel: 'NIK',
    columns: [
      /* --- Data pribadi --- */
      { key:'nik',             header:'nik',             req:true, type:'nik' },
      { key:'nip',             header:'nip',             type:'text', max:30 },
      { key:'nama_tanpa_gelar',header:'nama_tanpa_gelar',req:true, type:'text', max:100 },
      { key:'jenis_kelamin',   header:'jenis_kelamin',   type:'enum', values:['Laki-Laki','Perempuan'] },
      { key:'nama_unit_kerja', header:'nama_unit_kerja', type:'softenum',
        valuesFn: function(){ return (typeof OPT_UNIT_KERJA !== 'undefined') ? OPT_UNIT_KERJA : []; } },
      { key:'pangkat_golongan',header:'pangkat_golongan',type:'text', max:20 },
      { key:'no_sk_jabfung',   header:'no_sk_jabfung',   type:'text', max:50 },
      /* --- Data jabatan --- */
      { key:'jabfung_saat_ini',header:'jabfung_saat_ini',type:'softenum',
        valuesFn: function(){ return (typeof OPT_JABFUNG !== 'undefined') ? OPT_JABFUNG : []; } },
      { key:'jenjang_saat_ini',header:'jenjang_saat_ini',type:'softenum',
        valuesFn: function(){ return (typeof OPT_JENJANG !== 'undefined') ? OPT_JENJANG : []; } },
      { key:'jabfung_tujuan',  header:'jabfung_tujuan',  type:'softenum',
        valuesFn: function(){ return (typeof OPT_JABFUNG !== 'undefined') ? OPT_JABFUNG : []; } },
      { key:'jenjang_tujuan',  header:'jenjang_tujuan',  type:'softenum',
        valuesFn: function(){ return (typeof OPT_JENJANG !== 'undefined') ? OPT_JENJANG : []; } },
      { key:'jenis_ukom',      header:'jenis_ukom',      type:'softenum',
        valuesFn: function(){ return (typeof OPT_JENIS_UKOM !== 'undefined') ? OPT_JENIS_UKOM : ['Naik Jabatan','Pindah Jabatan']; } },
      { key:'nilai_pak_terakhir', header:'nilai_pak_terakhir', type:'text', max:10 },
      /* --- Kontak --- */
      { key:'nomor_whatsapp',  header:'nomor_whatsapp',  type:'text', max:20, subtype:'phone' },
      { key:'email_aktif',     header:'email_aktif',     type:'text', max:100, subtype:'email' },
      /* --- URL berkas (opsional; URL public Supabase Storage / link lain) --- */
      { key:'file_pak',        header:'file_pak',        type:'text', max:500 },
      { key:'file_foto',       header:'file_foto',       type:'text', max:500 },
      { key:'file_drh',        header:'file_drh',        type:'text', max:500 },
      { key:'file_ijazah',     header:'file_ijazah',     type:'text', max:500 },
      { key:'file_str',        header:'file_str',        type:'text', max:500 },
      { key:'file_sk_pangkat', header:'file_sk_pangkat', type:'text', max:500 },
      { key:'file_sk_jabfung', header:'file_sk_jabfung', type:'text', max:500 },
      { key:'file_skp',        header:'file_skp',        type:'text', max:500 },
      { key:'file_skmd',       header:'file_skmd',       type:'text', max:500 },
      /* --- Kelola admin --- */
      { key:'periode',         header:'periode',         type:'text', max:30 },
      { key:'no_peserta',      header:'no_peserta',      type:'text', max:30 },
      { key:'pak_instansi',    header:'pak_instansi',    type:'text', max:50 },
      { key:'pak_siasn',       header:'pak_siasn',       type:'text', max:50 },
      { key:'status_periode',  header:'status_periode',  type:'softenum', values:['Aktif','Tidak Aktif','-'], def:'-' },
      { key:'absen',           header:'absen',           type:'softenum', values:['Hadir','Tidak Hadir','-'], def:'-' },
      { key:'status_ukom',     header:'status_ukom',     type:'softenum', values:['Lulus','Tidak Lulus','Menunggu','-'], def:'-' },
      { key:'sertifikat',      header:'sertifikat',      type:'text', max:500 },
      { key:'status_verifikasi', header:'status_verifikasi', type:'enum',
        values:['Menunggu','Proses','Disetujui','Ditolak','Dilimpahkan','Batal','Perbaikan'], def:'Menunggu' },
      { key:'catatan_admin',   header:'catatan_admin',   type:'text' }
    ],
    exampleRows: [
      ['CONTOH - hapus baris ini','197001012005011001','Nama Contoh Pertama','Laki-Laki','Dinas Kesehatan','III/d','800.1/1234/2025','Administrator Kesehatan','Ahli Pertama','Administrator Kesehatan','Ahli Muda','Naik Jabatan','90','081234567890','contoh.pertama@email.com','','','','','','','','','','2026-1','001','90','85','Aktif','Hadir','Menunggu','','Menunggu',''],
      ['CONTOH - hapus baris ini','198506152010012002','Nama Contoh Kedua','Perempuan','RSUD Aji Muhammad Parikesit','III/c','800.1/5678/2025','Perawat','Penyelia','Perawat','Ahli Pertama','Pindah Jabatan','85','081298765432','contoh.kedua@email.com','','','','','','','','','','2026-1','002','85','80','Aktif','Hadir','Menunggu','','Menunggu','']
    ],
    previewFields: ['nik','nama_tanpa_gelar','nama_unit_kerja','status_verifikasi'],
    cacheGet: function(){ return (typeof admPesCache !== 'undefined') ? admPesCache : null; },
    dupKeyOf: function(obj){ return String(obj.nik || '').replace(/\D/g, ''); }
  }
};

/* ---------- 2. STATE GLOBAL IMPORT ---------- */
let csvImportState = null; /* { tableKey, objects, result, mode, truncate } */

/* ---------- 3. PARSER CSV (tahan tanda kutip & pemisah ; atau ,) ---------- */
function csvDetectDelimiter(text){
  const line = (text.split(/\r?\n/).find(function(l){ return l.trim() !== ''; }) || '');
  let semi = 0, comma = 0, inQ = false;
  for(let i = 0; i < line.length; i++){
    const c = line.charAt(i);
    if(c === '"') inQ = !inQ;
    else if(!inQ){
      if(c === ';') semi++;
      else if(c === ',') comma++;
    }
  }
  return semi >= comma ? ';' : ',';
}

function parseCsvText(text){
  text = String(text || '').replace(/^\uFEFF/, '');
  const delim = csvDetectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQ = false;

  for(let i = 0; i < text.length; i++){
    const c = text.charAt(i);
    if(inQ){
      if(c === '"'){
        if(text.charAt(i + 1) === '"'){ field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if(c === '"') inQ = true;
      else if(c === delim){ row.push(field); field = ''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else if(c !== '\r') field += c;
    }
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }

  /* buang baris yang seluruh selnya kosong */
  return {
    delim: delim,
    rows: rows.filter(function(r){ return r.some(function(c){ return String(c).trim() !== ''; }); })
  };
}

function csvCell(v){
  v = (v === null || v === undefined) ? '' : String(v);
  return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/* Unduh template CSV (BOM UTF-8 + pemisah ';' agar rapi di Excel Indonesia) */
function downloadCsvTemplate(tableKey){
  const T = CSV_TEMPLATES[tableKey];
  if(!T) return;
  const lines = [T.columns.map(function(c){ return c.header; }).join(';')];
  T.exampleRows.forEach(function(r){ lines.push(r.map(csvCell).join(';')); });
  const blob = new Blob(['\uFEFF' + lines.join('\r\n') + '\r\n'], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = T.fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 400);
  showToast('Template ' + T.label + ' diunduh (' + T.fileName + ')', 'success');
}

/* ---------- 4. KONVERSI & VALIDASI NILAI ---------- */
function csvToday(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function csvCoerce(col, raw){
  let s = (raw === null || raw === undefined) ? '' : String(raw).trim();
  if(s.charAt(0) === "'") s = s.slice(1); /* apostrof pengaman Excel */
  const res = { ok:true, v:null, provided:(s !== ''), warn:null, msg:'' };

  if(s === ''){
    if(col.req){ res.ok = false; res.msg = 'wajib diisi'; return res; }
    if(col.def === 'today'){ res.v = csvToday(); }
    else if(col.def !== undefined){ res.v = col.def; }
    return res;
  }

  switch(col.type){

    case 'text':
      if(col.max && s.length > col.max){ res.ok = false; res.msg = 'maksimal ' + col.max + ' karakter'; return res; }
      res.v = s;
      if(col.subtype === 'email' && validateEmail && !validateEmail(s)) res.warn = 'format email tidak biasa';
      if(col.subtype === 'phone' && validatePhone && !validatePhone(s.replace(/[\s.-]/g, ''))) res.warn = 'format nomor WhatsApp tidak biasa';
      return res;

    case 'nik': {
      let t = s.replace(/[\s\-_.]/g, '');
      /* notasi ilmiah Excel (mis. 1.97001012005011E+15) — periksa pada teks ASLI,
         sebelum titik desimal dibuang, agar eksponen tidak rusak */
      if(/^\d+(?:[.,]\d+)?e\+?\d+$/i.test(s)){
        try{
          const expanded = BigInt(Math.round(Number(s.replace(',', '.')))).toString();
          if(expanded.length >= 10){ t = expanded; res.warn = 'NIK terbaca sebagai notasi ilmiah Excel — pastikan 16 digitnya benar'; }
        }catch(e){ /* biarkan diverifikasi di bawah */ }
      }
      if(!/^[0-9]{16}$/.test(t)){ res.ok = false; res.msg = 'NIK harus 16 digit angka (terbaca ' + t.length + ' digit)'; }
      else res.v = t;
      return res;
    }

    case 'int': {
      const n = parseInt(s.replace(/[.\s]/g, '').replace(',', '.'), 10);
      if(isNaN(n) || n < 0){ res.ok = false; res.msg = 'harus angka bulat >= 0'; }
      else res.v = n;
      return res;
    }

    case 'date': {
      let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
      let y, mo, d;
      if(m){ y = +m[1]; mo = +m[2]; d = +m[3]; }
      else{
        m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
        if(m){ d = +m[1]; mo = +m[2]; y = +m[3]; }
      }
      if(!m || mo < 1 || mo > 12 || d < 1 || d > 31){ res.ok = false; res.msg = 'format tanggal tidak dikenali (pakai YYYY-MM-DD atau DD/MM/YYYY)'; }
      else res.v = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      return res;
    }

    case 'bool': {
      const t = s.toLowerCase();
      if(['aktif','true','ya','yes','1','y','t'].indexOf(t) !== -1) res.v = true;
      else if(['nonaktif','false','tidak','no','0','n','f'].indexOf(t) !== -1) res.v = false;
      else{ res.ok = false; res.msg = 'isi salah satu: Aktif / Nonaktif'; }
      return res;
    }

    case 'enum': {
      const vals = col.valuesFn ? col.valuesFn() : (col.values || []);
      const found = vals.find(function(v){ return String(v).toLowerCase() === s.toLowerCase(); });
      if(found !== undefined) res.v = found;
      else{ res.ok = false; res.msg = 'harus salah satu: ' + vals.join(' / '); }
      return res;
    }

    case 'softenum': {
      const vals = col.valuesFn ? col.valuesFn() : (col.values || []);
      const found = vals.find(function(v){ return String(v).toLowerCase() === s.toLowerCase(); });
      res.v = (found !== undefined) ? found : s;
      if(found === undefined && vals.length) res.warn = 'nilai tidak ada di daftar pilihan aplikasi (tetap diimport)';
      return res;
    }
  }
  res.v = s;
  return res;
}

/* Cocokkan header CSV ke kolom template (toleran huruf besar/kecil & spasi) */
function csvMapHeaders(headerCells, T){
  function norm(c){
    return String(c || '').replace(/^\uFEFF/, '').trim().toLowerCase()
      .replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  }
  const used = {};
  const colIndex = {}; /* header kanonik -> index sel */
  T.columns.forEach(function(col){
    const idx = headerCells.findIndex(function(h, i){
      return !used[i] && norm(h) === norm(col.header);
    });
    if(idx !== -1){ colIndex[col.header] = idx; used[idx] = true; }
  });
  const missingReq = T.columns.filter(function(c){ return c.req && colIndex[c.header] === undefined; });
  return { colIndex: colIndex, missingReq: missingReq };
}

/* ---------- 5. VALIDASI SELURUH BARIS ---------- */
function csvValidateTable(tableKey, objects){
  const T = CSV_TEMPLATES[tableKey];
  const cache = T.cacheGet() || [];
  const existing = new Map();
  cache.forEach(function(r){ existing.set(T.dupKeyOf(r), r); });

  const seenInFile = new Set();
  const result = { valid:[], invalid:[], examples:0, dupFile:0 };

  objects.forEach(function(obj, idx){
    const firstCell = String(obj.__first || '').trim();
    if(/^contoh/i.test(firstCell)){ result.examples++; return; }

    const rowNum = idx + 2; /* +1 baris header, +1 nomor mulai 1 */

    /* duplikat di dalam file CSV */
    const dk = T.dupKeyOf(obj);
    if(dk && seenInFile.has(dk)){
      result.dupFile++;
      result.invalid.push({ row: rowNum, reason:'Duplikat dengan baris lain di file CSV (baris lebih awal yang dipakai)', obj: obj });
      return;
    }
    if(dk) seenInFile.add(dk);

    const values = {}, provided = {}, warns = [], errs = [];
    T.columns.forEach(function(col){
      const raw = col.header in obj ? obj[col.header] : '';
      const r = csvCoerce(col, raw);
      if(!r.ok) errs.push(col.header + ': ' + r.msg);
      else{
        values[col.key] = r.v;
        provided[col.key] = r.provided;
        if(r.warn) warns.push(col.header + ': ' + r.warn);
      }
    });

    if(errs.length){ result.invalid.push({ row: rowNum, reason: errs.join('; '), obj: obj, warns: warns }); return; }

    const dupExisting = (dk && existing.has(dk)) ? existing.get(dk) : null;
    result.valid.push({ row: rowNum, values: values, provided: provided, warns: warns, dup: dupExisting, obj: obj });
  });

  return result;
}

/* ---------- 6. MODAL IMPORT ---------- */
function openCsvImport(tableKey){
  const T = CSV_TEMPLATES[tableKey];
  if(!T){ showToast('Menu import tidak dikenal', 'error'); return; }
  if(typeof db === 'undefined' || !db){ showToast('Konfigurasi Supabase belum diisi (config.js)', 'error'); return; }

  csvImportState = { tableKey: tableKey, objects: null, result: null, mode: 'skip', truncate: false, fileName: '' };

  const hints = T.columns.map(function(c){
    let h = '<b>' + escapeHtml(c.header) + '</b>' + (c.req ? ' <span style="color:#dc2626">*</span>' : '');
    if(c.type === 'enum' || c.type === 'softenum'){
      const vals = c.valuesFn ? c.valuesFn() : (c.values || []);
      if(vals.length <= 8) h += ' — ' + escapeHtml(vals.join(' / '));
      else h += ' — harus sesuai daftar pilihan aplikasi';
    }
    if(c.type === 'date') h += ' — YYYY-MM-DD atau DD/MM/YYYY';
    if(c.type === 'bool') h += ' — Aktif / Nonaktif';
    if(c.type === 'int') h += ' — angka >= 0';
    if(c.type === 'nik') h += ' — 16 digit angka';
    if(c.def !== undefined) h += ' (kosong = ' + (c.def === 'today' ? 'hari ini' : escapeHtml(String(c.def))) + ')';
    return '<li>' + h + '</li>';
  }).join('');

  const bodyHtml =
    '<div class="csv-step">' +
      '<div class="csv-step-title"><span class="csv-step-num">1</span> Unduh Template CSV</div>' +
      '<div class="csv-hintbox"><i class="fas fa-file-csv"></i><div>' +
        'Template berisi nama kolom <b>sesuai tabel Supabase <code>' + T.table + '</code></b> beserta 2 baris contoh. ' +
        'Baris contoh otomatis dilewati saat import — atau hapus saja sebelum menyimpan.' +
      '</div></div>' +
      '<button class="btn btn-outline btn-sm" onclick="downloadCsvTemplate(\'' + tableKey + '\')"><i class="fas fa-download"></i> Unduh Template ' + escapeHtml(T.label) + '</button>' +
    '</div>' +

    '<div class="csv-step">' +
      '<div class="csv-step-title"><span class="csv-step-num">2</span> Isi Template &amp; Upload</div>' +
      '<div class="csv-hintbox"><i class="fas fa-lightbulb"></i><div>' +
        'Isi data di Excel / Google Sheets lalu simpan sebagai <b>CSV</b>. ' +
        '<b>Penting:</b> format kolom NIK sebagai <i>Text</i> agar tidak berubah menjadi notasi ilmiah (mis. 3,5E+15). ' +
        'Baris yang seluruh selnya kosong akan diabaikan. Maksimal 5.000 baris per import.' +
      '</div></div>' +
      '<div class="csv-drop" id="csvDrop" onclick="document.getElementById(\'csvFileInput\').click()">' +
        '<i class="fas fa-cloud-arrow-up"></i>' +
        '<div><b>Klik untuk memilih file CSV</b> atau seret &amp; lepas ke sini</div>' +
        '<div class="csv-drop-sub">File .csv hasil isi template</div>' +
      '</div>' +
      '<input type="file" id="csvFileInput" accept=".csv,text/csv,text/plain" style="display:none" onchange="handleCsvFileSelected(this)">' +
    '</div>' +

    '<div id="csvPreviewArea"></div>' +

    '<details class="csv-cols-details"><summary><i class="fas fa-table-list"></i> Lihat aturan kolom template (' + T.columns.length + ' kolom)</summary><ul class="csv-cols-list">' + hints + '</ul></details>';

  const overlay = crudModal('Import CSV — ' + T.label, 'fa-file-csv', bodyHtml,
    '<button class="btn btn-ghost" data-close>Tutup</button>',
    { large: true });

  const drop = overlay.querySelector('#csvDrop');
  ['dragenter','dragover'].forEach(function(ev){
    drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('dragover'); });
  });
  ['dragleave','drop'].forEach(function(ev){
    drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('dragover'); });
  });
  drop.addEventListener('drop', function(e){
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) csvReadFile(f);
  });
}

/* ---------- 7. PEMBACAAN FILE ---------- */
function handleCsvFileSelected(input){
  const f = input.files && input.files[0];
  if(f) csvReadFile(f);
  input.value = ''; /* supaya file yang sama bisa dipilih ulang */
}

function csvReadFile(file){
  if(!/\.csv$/i.test(file.name) && file.type !== 'text/csv' && file.type !== 'text/plain'){
    showToast('Mohon pilih file berformat .csv', 'error'); return;
  }
  if(file.size > 5 * 1024 * 1024){ showToast('Ukuran file maksimal 5 MB', 'error'); return; }

  const reader = new FileReader();
  reader.onload = function(){
    try{
      const parsed = parseCsvText(reader.result);
      if(parsed.rows.length < 2){ showToast('File CSV kosong atau hanya berisi header', 'error'); return; }

      const T = CSV_TEMPLATES[csvImportState.tableKey];
      const headerCells = parsed.rows[0];
      const map = csvMapHeaders(headerCells, T);
      if(map.missingReq.length){
        showToast('Kolom wajib tidak ditemukan di file: ' + map.missingReq.join(', '), 'error');
        return;
      }

      const objects = parsed.rows.slice(1).map(function(cells){
        const obj = { __first: String(cells[0] || '').trim() };
        T.columns.forEach(function(col){
          const idx = map.colIndex[col.header];
          obj[col.header] = (idx !== undefined && idx < cells.length) ? String(cells[idx]) : '';
        });
        return obj;
      }).slice(0, 5000);

      csvImportState.objects = objects;
      csvImportState.fileName = file.name;
      csvImportState.result = csvValidateTable(csvImportState.tableKey, objects);
      renderCsvPreview();
    }catch(err){
      showToast('Gagal membaca CSV: ' + err.message, 'error');
    }
  };
  reader.onerror = function(){ showToast('Gagal membaca file', 'error'); };
  reader.readAsText(file, 'utf-8');
}

/* ---------- 8. PRATINJAU HASIL VALIDASI ---------- */
function renderCsvPreview(){
  const st = csvImportState;
  const T = CSV_TEMPLATES[st.tableKey];
  const R = st.result;
  const area = document.getElementById('csvPreviewArea');
  if(!area || !R) return;

  const validNew     = R.valid.filter(function(v){ return !v.dup; });
  const validDup     = R.valid.filter(function(v){ return v.dup; });
  const importable   = st.mode === 'update' ? R.valid.length : validNew.length;

  function statCard(icon, label, num, cls){
    return '<div class="csv-stat ' + cls + '"><i class="fas ' + icon + '"></i><div><div class="csv-stat-num">' + num + '</div><div class="csv-stat-label">' + label + '</div></div></div>';
  }

  /* tabel pratinjau (maks 100 baris tampil) */
  const items = [];
  R.valid.forEach(function(v){ items.push({ row:v.row, obj:v.obj, status: v.dup ? 'dup' : 'ok', note: v.dup ? 'Sudah ada di database → ' + (st.mode === 'update' ? 'akan diperbarui' : 'akan dilewati') : (v.warns && v.warns.length ? v.warns.join('; ') : 'Siap import'), warns: v.warns }); });
  R.invalid.forEach(function(v){ items.push({ row:v.row, obj:v.obj, status:'err', note: v.reason, warns: v.warns }); });

  items.sort(function(a, b){ return a.row - b.row; });
  const shown = items.slice(0, 100);

  let rowsHtml = '';
  shown.forEach(function(it){
    const cls = it.status === 'ok' ? 'csv-row-ok' : it.status === 'dup' ? 'csv-row-dup' : 'csv-row-err';
    const badge = it.status === 'ok'
      ? '<span class="csv-badge csv-badge-ok"><i class="fas fa-check"></i> Baru</span>'
      : it.status === 'dup'
        ? '<span class="csv-badge csv-badge-dup"><i class="fas fa-clone"></i> Duplikat</span>'
        : '<span class="csv-badge csv-badge-err"><i class="fas fa-xmark"></i> Error</span>';
    const cells = T.previewFields.map(function(f){
      const col = T.columns.find(function(c){ return c.key === f; });
      return '<td>' + escapeHtml((col && it.obj[col.header]) || '') + '</td>';
    }).join('');
    rowsHtml += '<tr class="' + cls + '"><td style="color:#94a3b8">' + it.row + '</td>' + cells +
      '<td style="font-size:11.5px">' + badge + ' <span style="color:#64748b" title="' + escAttr(it.note || '') + '">' + escapeHtml(it.note || '') + '</span></td></tr>';
  });

  const headerCells = ['#'].concat(T.previewFields.map(function(f){
    const col = T.columns.find(function(c){ return c.key === f; });
    return col ? col.header : f;
  })).concat(['Status']);

  area.innerHTML =
    '<div class="csv-step">' +
      '<div class="csv-step-title"><span class="csv-step-num">3</span> Pratinjau &amp; Import</div>' +
      '<div class="csv-file-chip"><i class="fas fa-file-csv"></i> ' + escapeHtml(st.fileName) +
        ' <button class="csv-recheck" onclick="document.getElementById(\'csvFileInput\').click()"><i class="fas fa-rotate"></i> ganti file</button></div>' +

      '<div class="csv-stats">' +
        statCard('fa-file-lines', 'Total baris', R.valid.length + R.invalid.length + R.examples, 'st-total') +
        statCard('fa-circle-check', 'Valid', R.valid.length, 'st-ok') +
        statCard('fa-circle-xmark', 'Error', R.invalid.length, 'st-err') +
        statCard('fa-clone', 'Duplikat terdeteksi', validDup.length, 'st-dup') +
      '</div>' +

      (validDup.length ?
        '<div class="csv-options">' +
          '<div class="csv-opt-title"><i class="fas fa-clone"></i> Baris dengan ' + escapeHtml(T.dupLabel) + ' yang sudah ada di database:</div>' +
          '<label class="csv-radio"><input type="radio" name="csvDupMode" value="skip"' + (st.mode === 'skip' ? ' checked' : '') + ' onchange="csvImportState.mode=\'skip\';renderCsvPreview()"> <b>Lewati</b> — hanya tambah data yang benar-benar baru</label>' +
          '<label class="csv-radio"><input type="radio" name="csvDupMode" value="update"' + (st.mode === 'update' ? ' checked' : '') + ' onchange="csvImportState.mode=\'update\';renderCsvPreview()"> <b>Perbarui</b> — timpa data lama dengan nilai dari CSV (kolom kosong di CSV tidak diubah)</label>' +
        '</div>' : '') +

      '<label class="csv-radio csv-radio-danger"><input type="checkbox" id="csvTruncate"' + (st.truncate ? ' checked' : '') + ' onchange="csvImportState.truncate=this.checked"> <i class="fas fa-triangle-exclamation"></i> Hapus <u>semua</u> data lama di tabel ' + escapeHtml(T.table) + ' sebelum import (mode ganti total)</label>' +

      '<div class="csv-preview-wrap"><table><thead><tr>' +
        headerCells.map(function(h){ return '<th>' + escapeHtml(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
      (items.length > 100 ? '<div class="csv-more">… dan ' + (items.length - 100) + ' baris lainnya (semua tetap diproses)</div>' : '') +
      '</div>' +

      (R.examples ? '<div class="csv-note-info"><i class="fas fa-circle-info"></i> ' + R.examples + ' baris contoh otomatis dilewati.</div>' : '') +

      '<div id="csvProgress" style="display:none"><div class="csv-progress"><div class="csv-progress-bar" id="csvProgressBar"></div></div><div class="csv-progress-text" id="csvProgressText">Memproses…</div></div>' +
      '<div id="csvResult"></div>' +
    '</div>';

  const footer = overlayFooter('csvImportFooter');
  if(footer){
    footer.innerHTML =
      '<button class="btn btn-ghost" data-close>Batal</button>' +
      '<button class="btn" id="csvRunBtn"' + (importable === 0 ? ' disabled' : '') + '><i class="fas fa-file-arrow-up"></i> Import ' + importable + ' Baris</button>';
    const runBtn = footer.querySelector('#csvRunBtn');
    if(runBtn) runBtn.addEventListener('click', runCsvImport);
  }
}

function overlayFooter(id){
  const footers = document.querySelectorAll('.crud-overlay:last-child .crud-modal-footer');
  return footers.length ? footers[footers.length - 1] : null;
}

/* ---------- 9. PROSES IMPORT MASSAL ---------- */
async function runCsvImport(){
  const st = csvImportState;
  if(!st || !st.result) return;
  const T = CSV_TEMPLATES[st.tableKey];
  const R = st.result;

  const toInsert = R.valid.filter(function(v){ return st.mode === 'update' || !v.dup; });
  const toUpdate = st.mode === 'update' ? R.valid.filter(function(v){ return v.dup; }) : [];

  if(toInsert.length === 0 && toUpdate.length === 0){
    showToast('Tidak ada baris valid untuk diimport', 'info'); return;
  }

  const proceed = function(){ doCsvBulk(T, st, toInsert, toUpdate); };

  if(st.truncate){
    confirmDialog('Ganti Total Data ' + T.label + '?',
      'Semua data lama pada tabel ' + T.table + ' akan DIHAPUS PERMANEN (' + ((T.cacheGet() || []).length) + ' baris) sebelum data CSV diimport. Tindakan ini tidak dapat dibatalkan.',
      proceed,
      { icon:'fa-triangle-exclamation', iconClass:'', yesText:'Ya, Hapus & Import', yesClass:'btn-danger' });
  } else proceed();
}

async function doCsvBulk(T, st, toInsert, toUpdate){
  const progWrap = document.getElementById('csvProgress');
  const progBar  = document.getElementById('csvProgressBar');
  const progText = document.getElementById('csvProgressText');
  const runBtn   = document.getElementById('csvRunBtn');
  if(runBtn) runBtn.disabled = true;
  if(progWrap) progWrap.style.display = 'block';

  const CH = 100;
  let imported = 0, updated = 0, failed = 0;
  const errMsgs = [];

  function setProg(pct, text){
    if(progBar) progBar.style.width = pct + '%';
    if(progText) progText.textContent = text;
  }

  try{
    if(st.truncate){
      setProg(3, 'Menghapus data lama di tabel ' + T.table + '…');
      await API.truncateTable(T.table);
    }

    /* --- insert massal per-chunk --- */
    for(let i = 0; i < toInsert.length; i += CH){
      const chunk = toInsert.slice(i, i + CH).map(function(v){
        const row = {};
        T.columns.forEach(function(col){
          if(v.values[col.key] !== undefined && v.values[col.key] !== null) row[col.key] = v.values[col.key];
          else if(col.def !== undefined) row[col.key] = (col.def === 'today' ? csvToday() : col.def);
        });
        return row;
      });
      try{
        await API.bulkInsert(T.table, chunk);
        imported += chunk.length;
      }catch(err){
        /* coba per-baris supaya baris yang baik tetap masuk */
        for(let j = 0; j < chunk.length; j++){
          try{ await API.bulkInsert(T.table, [chunk[j]]); imported++; }
          catch(e2){ failed++; errMsgs.push('Baris ' + toInsert[i + j].row + ': ' + e2.message); }
        }
      }
      setProg(Math.round(((i + CH) / Math.max(toInsert.length, 1)) * 70), 'Mengunggah ' + Math.min(i + CH, toInsert.length) + ' / ' + toInsert.length + ' baris baru…');
    }

    /* --- update duplikat (mode perbarui) --- */
    for(let i = 0; i < toUpdate.length; i++){
      const v = toUpdate[i];
      const payload = {};
      T.columns.forEach(function(col){
        if(v.provided[col.key] && v.values[col.key] !== undefined && v.values[col.key] !== null) payload[col.key] = v.values[col.key];
      });
      try{
        await API.bulkUpdate(T.table, v.dup.id, payload);
        updated++;
      }catch(err){ failed++; errMsgs.push('Baris ' + v.row + ' (update): ' + err.message); }
      if(i % 10 === 0 || i === toUpdate.length - 1)
        setProg(70 + Math.round(((i + 1) / Math.max(toUpdate.length, 1)) * 28), 'Memperbarui ' + (i + 1) + ' / ' + toUpdate.length + ' data lama…');
    }

    setProg(100, 'Selesai');

    const resEl = document.getElementById('csvResult');
    if(resEl){
      let html = '<div class="csv-result">' +
        '<div class="csv-result-title"><i class="fas ' + (failed ? 'fa-circle-exclamation' : 'fa-circle-check') + '"></i> Import Selesai</div>' +
        '<div class="csv-stats">' +
          '<div class="csv-stat st-ok"><i class="fas fa-plus"></i><div><div class="csv-stat-num">' + imported + '</div><div class="csv-stat-label">Baris baru</div></div></div>' +
          '<div class="csv-stat st-dup"><i class="fas fa-pen"></i><div><div class="csv-stat-num">' + updated + '</div><div class="csv-stat-label">Diperbarui</div></div></div>' +
          '<div class="csv-stat st-err"><i class="fas fa-xmark"></i><div><div class="csv-stat-num">' + failed + '</div><div class="csv-stat-label">Gagal</div></div></div>' +
        '</div>';
      if(errMsgs.length){
        html += '<div class="csv-err-list"><b>Detail gagal:</b><ul>' +
          errMsgs.slice(0, 6).map(function(m){ return '<li>' + escapeHtml(m) + '</li>'; }).join('') +
          (errMsgs.length > 6 ? '<li>… dan ' + (errMsgs.length - 6) + ' lainnya</li>' : '') + '</ul></div>';
      }
      html += '<div class="csv-note-info"><i class="fas fa-rotate"></i> Data di seluruh halaman telah disegarkan otomatis.</div></div>';
      resEl.innerHTML = html;
    }

    showToast(imported + ' baris ditambah, ' + updated + ' diperbarui' + (failed ? ', ' + failed + ' gagal' : ''), failed ? 'info' : 'success');
    csvAfterImport(st.tableKey);

  }catch(err){
    showToast('Import gagal: ' + err.message, 'error');
    if(progText) progText.textContent = 'Import gagal: ' + err.message;
    if(runBtn) runBtn.disabled = false;
  }
}

/* ---------- 10. SEGARKAN CACHE SETELAH IMPORT ---------- */
function csvAfterImport(tableKey){
  try{
    if(tableKey === 'pengumuman'){
      if(typeof pengumumanCacheInvalidate === 'function') pengumumanCacheInvalidate();
    }else if(tableKey === 'bezetting'){
      if(typeof loadBezetting === 'function' && typeof bezettingCache !== 'undefined' && bezettingCache) loadBezetting(true);
    }else if(tableKey === 'peserta'){
      if(typeof pesertaUkomCache !== 'undefined') pesertaUkomCache = null;
      if(typeof dashPesertaCache !== 'undefined') dashPesertaCache = null;
    }
    if(typeof adminRefreshAll === 'function') adminRefreshAll();
  }catch(e){ /* abaikan */ }
}
