/* ============================================================
   MANTAF v2 — LOADER.JS
   Pemuat partial HTML (lazy-load per section) + registry init
   ============================================================ */

const SectionInit = {};

const Loader = {
  cache: {},

  async load(name){
    if(!this.cache[name]){
      const res = await fetch('partials/' + name + '.html');
      if(!res.ok) throw new Error('Gagal memuat partial: ' + name + ' (' + res.status + ')');
      this.cache[name] = await res.text();
    }
    return this.cache[name];
  },

  async mount(sectionId, partialName){
    let el = document.getElementById(sectionId);
    if(!el){
      const mount = document.getElementById('sectionsMount');
      /* hapus placeholder awal saat partial pertama dimuat */
      const placeholder = mount.querySelector('.main-loading');
      if(placeholder) placeholder.remove();
      const wrap = document.createElement('div');
      wrap.id = sectionId;
      wrap.className = 'section';
      wrap.innerHTML = '<div class="partial-loading"><i class="fas fa-spinner fa-spin"></i> Memuat halaman…</div>';
      mount.appendChild(wrap);
      try{
        wrap.innerHTML = await this.load(partialName);
        if(typeof SectionInit[partialName] === 'function') SectionInit[partialName]();
      }catch(err){
        wrap.innerHTML =
          '<div class="panel"><div class="empty-state">' +
          '<i class="fas fa-triangle-exclamation"></i>' +
          '<p><b>Gagal memuat halaman:</b> ' + escapeHtml(err.message) + '</p>' +
          '<p style="font-size:12px;margin-top:6px">Pastikan situs dibuka lewat HTTP(S) (mis. GitHub Pages), bukan file://.</p>' +
          '</div></div>';
      }
    }
    return document.getElementById(sectionId);
  },

  isMounted(sectionId){
    return !!document.getElementById(sectionId);
  }
};

/* ---------- Metadata topbar per section ---------- */
const SECTION_META = {
  dashboard:   { title:'Dashboard',                    subtitle:'Ringkasan aktivitas platform MantaF' },
  pengumuman:  { title:'Pengumuman',                   subtitle:'Informasi resmi terbaru seputar UKOM & jabfung' },
  bezetting:   { title:'Bezetting',                    subtitle:'Data kebutuhan jabatan fungsional kesehatan' },
  pesertaUkom: { title:'Data Peserta UKOM',            subtitle:'Rekap peserta uji kompetensi seluruh periode' },
  ukom:        { title:'Pendaftaran UKOM',             subtitle:'Isi formulir & unggah dokumen persyaratan' },
  status:      { title:'Cek Status',                   subtitle:'Pantau status verifikasi berkas Anda' },
  admin:       { title:'Panel Admin',                  subtitle:'Manajemen data Pengumuman, Bezetting & Peserta UKOM' }
};
