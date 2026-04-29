// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.14'; // v26.14: 9種空状態コンテナ hover インタラクション統合 — empty-month-state/empty-asset-state/empty-goal-state/empty-debt-state/tx-empty-state/wl-empty/ch-empty/sub-empty/pt-empty の9種コンテナに :hover を追加し、子要素のアイコン drop-shadow を mix-md→mix-lg / dark mix-lg→mix-xl + 4px 14-18px→6px 18-22px に強化 + scale(1.06) 拡大、メッセージ text-shadow を mix-2xs/xs→mix-sm/md に強化、サブ text-shadow を mix-nano/2xs→mix-2xs/sm に強化。アイコンに transition: filter+transform、メッセージ/サブに transition: text-shadow を追加し滑らかフェード反応。v26.05 アイコン常時glow + v26.10① メッセージ常時glow + v26.13① サブ常時glow の3層に hover 強化レイヤーが上乗せされ「触れたら3要素が一段強く光る」反応を9種空状態画面全てで獲得
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
