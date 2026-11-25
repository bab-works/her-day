// 앱 화면 파일만 캐시 (기록은 localStorage와 계정 서버에 있음, 다른 주소 요청은 건드리지 않음). 파일 수정 후엔 버전을 올리세요.
const CACHE = 'herday-v8';
const FILES = ['./', 'index.html', 'app.js', 'cloud.js', 'cycle.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'logo.svg', 'PretendardVariable.woff2'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // 온라인이면 최신 파일, 오프라인이면 저장해 둔 파일
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' })
    .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
