// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.16'; // v26.16: 二次空状態 4種への primary glow 統合（empty-state-sm / cal-panel-empty / sim-no-data / ev-month-empty）— v26.05/26.10/26.12-26.15 で 10種主要空状態の3層 glow 統合が完了する一方、表示頻度はやや低いが他画面で使われる4種の二次空状態が plain text-muted のみで glow 連携が無く統一感が欠けていた。v26.16 で4種に常時 primary text-shadow glow（ライト mix-nano 6px / ダーク mix-2xs 8px の控えめトーン）を統一適用 + hover 強化。sim-no-data はサーフェス背景持ちなので :hover で translateY(-1px) lift + box-shadow（primary mix-2xs 4px 12px / dark primary-end mix-sm 4px 14px）を追加し触れたら浮き上がる。ev-month-empty はダッシュ枠を持つため :hover で border-color を primary 系（mix-md / dark mix-lg）に切替え + text-shadow 強化。empty-state-sm / cal-panel-empty は背景/枠を持たないため text-shadow 強化のみ。これで全空状態（主要10種＋二次4種＝計14種）が統一された primary glow を持ち、設定モーダル / ローン試算モーダル / 年間予定モーダル / カレンダー詳細パネル の全画面で空状態の統一感が完成
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
