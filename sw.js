// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v25.87'; // v25.87: Approach C継続 — adv-month-badge×1・adv-widget-desc×1・adv-widget-hint×1・asset-balance-jpy×1・asset-date-label×1・asset-fx-rate×1・asset-history-title×1・asset-sparkline-label×1・asset-type-badge×1・bottom-nav-label×1・cal-ev-name×1・cal-ev-cat×1 計12箇所
const ASSETS = [
  './index.html',
  './css/style.css',
  './js/icons.js',
  './js/config.js',
  './js/data.js',
  './js/export.js',
  './js/charts.js',
  './js/sync.js',
  './js/app.js',
  './js/pwa.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// インストール時：アセットをキャッシュ & 即座に有効化
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // 古いSWを即座に置き換え（キャッシュ更新を確実にする）
});

// メッセージ：pwa.jsからのSKIP_WAITING指示
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// アクティベート時：古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ：キャッシュ優先（オフライン動作）
self.addEventListener('fetch', event => {
  // APIリクエストはキャッシュしない
  if (event.request.url.includes('workers.dev')) return;   // Gemini proxy
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // 有効なレスポンスのみキャッシュ
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // オフライン時はキャッシュを返す
    })
  );
});
