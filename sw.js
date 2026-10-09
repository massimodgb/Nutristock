// Service worker: permite abrir la app sin conexión (en el súper sin cobertura, por ejemplo).
// Cambia VERSION cada vez que publiques cambios para que el iPhone descargue lo nuevo.
const VERSION = 'v13';
const CACHE = 'nutristock-' + VERSION;
const LOCAL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/lib.js', 'js/db.js', 'js/nutri.js', 'js/ui.js', 'js/importar.js', 'js/plan-pdf.js', 'js/balance.js', 'js/data/foods.js', 'js/data/restaurantes.js', 'js/data/restaurantes2.js', 'js/entreno/parser.js', 'js/entreno/datos.js', 'js/entreno/rm.js',
  'js/views/hoy.js', 'js/views/despensa.js', 'js/views/biblioteca.js', 'js/views/plan.js', 'js/views/mas.js', 'js/views/progreso.js', 'js/views/perfil.js', 'js/views/entreno.js', 'js/views/reloj.js', 'js/views/stock.js', 'js/views/guia.js',
  'icons/icon-180.png', 'icons/icon-192.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' = descargar SIEMPRE la versión nueva (nunca una copia vieja guardada por el navegador)
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(LOCAL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Las búsquedas de productos siempre van a internet
  if (url.hostname.includes('openfoodfacts')) return;
  // Librerías con versión fija (también el motor del escáner): se guardan para usarlas sin conexión
  const esLib = url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net';
  if (url.origin !== location.origin && !esLib) return;

  // Librerías (versión fija): caché primero. Archivos propios: red primero, caché si no hay conexión.
  e.respondWith(esLib
    ? caches.match(e.request).then(r => r || fetch(e.request).then(res => guardar(e.request, res)))
    // 'no-cache': pregunta siempre a internet si hay versión nueva (si no la hay, es rapidísimo)
    : fetch(e.request, { cache: 'no-cache' }).then(res => guardar(e.request, res)).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

function guardar(req, res) {
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
  return res;
}
