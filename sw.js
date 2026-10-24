/* ============================================================
   MANTAF v3 — SERVICE WORKER (ringan & aman)
   - Precache: logo, manifest, halaman utama
   - Strategi: network-first; fallback cache saat offline
   - Tidak meng-cache RPC/API Supabase (selalu jaringan)
   ============================================================ */
const SW_CACHE = 'mantaf-v3-static';
const PRECACHE = [
  'assets/img/logo-512.png',
  'assets/img/logo-192.png',
  'assets/img/maskable-512.png',
  'assets/img/apple-touch-icon.png',
  'manifest.webmanifest'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(SW_CACHE).then(function(c){
      return Promise.all(PRECACHE.map(function(u){
        return c.add(u).catch(function(){ /* abaikan aset yang gagal */ });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== SW_CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  /* Jangan pernah sentuh API Supabase / domain lain */
  if(url.origin !== location.origin) return;
  /* Jangan cache HTML & partial (konten dinamis) */
  if(url.pathname.endsWith('.html') || url.pathname.includes('/partials/')) return;

  e.respondWith(
    fetch(req).then(function(res){
      if(res && res.ok && (url.pathname.startsWith('/assets/'))){
        const clone = res.clone();
        caches.open(SW_CACHE).then(function(c){ c.put(req, clone); }).catch(function(){});
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        return hit || Response.error();
      });
    })
  );
});
