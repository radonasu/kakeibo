// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.15'; // v26.15: 通知空状態 hover インタラクション統合 + empty-month-btn lift強化 — notif-empty-icon の従来 black-08 drop-shadow を primary 系 glow（ライト 0 4px 14px primary mix-md / ダーク 0 4px 18px primary-end mix-lg）に置換し、:hover で 0 6px 18-22px primary mix-lg/xl + scale(1.06) 強化。notif-empty p（メッセージ）に常時 primary text-shadow glow（mix-2xs/xs 8-10px）+ hover 強化（mix-sm/md 12-14px）追加。notif-empty-sub に常時 primary text-shadow glow（mix-nano/2xs 6-8px）+ hover 強化（mix-2xs/sm 8-10px）追加。empty-month-btn :hover に translateY(-1px) lift + box-shadow を 0 2px 8px→0 4px 14px / dark 0 2px 10px→0 4px 16px に深化。v26.14 で完成した 9種空状態の「常時glow+hover強化」二層構造に通知空状態を追加し、CTA ボタンも触れたら浮き上がる立体感を獲得
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
