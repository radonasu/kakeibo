// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.12'; // v26.12: 金額入力ラッパー hover lift 統合 + モーダルオーバーレイ blur 強化 + 空状態アイコン/メッセージ glow 統一 + ダーク btn-success:hover inset 補完 + アイコンボタン群 hover ring 強化（amount-input-wrap:hover に 0 2px 8px black-08 lift ドロップシャドウ追加で form-group input hover lift（v26.11）と整合 + modal-overlay backdrop blur-sm(8px)→blur-md(10px) でモーダル背景フォーカスプル深度増 + tx-empty-icon を v22.91 8種 drop-shadow primary glow リストに追加 + tx-empty-msg/wl-empty p/ch-empty p/sub-empty p/pt-empty p を v26.10① 4種 text-shadow primary glow リストに追加で空状態9種ビジュアル統一 + ダーク btn-success:hover に inset 0 1px 0 rgba(255,255,255,0.22) 補完で v24.90③ override に v26.11 ライト inset を統合（btn-primary/ghost/danger ダーク hover inset 統合パターンと完成形に） + btn-icon:hover primary glow 強化 mix-sm→mix-md + edit-tx:hover primary ring 強化 mix-md→mix-lg + delete-tx:hover danger ring 強化 mix-md→mix-lg でアイコンボタン群 hover アクション可能性視認性向上）
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
