// Service worker: permite abrir a app sem rede e mostrar notificações.
// "Network first": usa sempre a versão mais recente quando há rede, por isso não é preciso mexer aqui ao atualizar.
const CACHE = 'despensa-v2';
const FILES = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.svg',
  'js/main.js', 'js/ui.js', 'js/store.js', 'js/domain.js', 'js/auth.js', 'js/config.js', 'js/demo-data.js',
  'js/scanner.js', 'js/ocr.js', 'js/voice.js', 'js/notify.js',
  'js/views/home.js', 'js/views/stock.js', 'js/views/product.js', 'js/views/shopping.js',
  'js/views/prices.js', 'js/views/recipes.js', 'js/views/more.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Só guarda em cache os ficheiros da própria app e bibliotecas do CDN; nunca pedidos à base de dados.
  if (e.request.method !== 'GET' || !(url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: url.origin === location.origin })),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
