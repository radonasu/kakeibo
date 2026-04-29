// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.20'; // v26.20: 認証画面セカンダリ要素 glow & lift 強化（v26.19 続編）— v26.19 で auth-overlay/card/title/logo-icon と summary-card sheen を強化済み。今回は周辺 8 要素を hover/focus に呼応させログイン画面全体を一体化。①.auth-tabs（コンテナ）→ auth-card hover 時に subtle inset glow（primary mix-xs / dark primary-end mix-sm）②.auth-tab.active → auth-card hover 時に scale(1.02) + primary glow box-shadow（mix-md / dark mix-lg）③.auth-form .form-group input:focus → primary glow を mix-sm に格上げ + 拡散 18px（dark mix-md / 22px）でログイン入力中の浮上感を最大化④.auth-error → entrance shake animation（0.42s 6回振動）+ 常時 danger-text glow box-shadow（mix-sm / dark mix-md）でエラー出現時の視覚的アラートを強化⑤.auth-submit → auth-card hover 時に extra primary glow box-shadow（btn-primary hover と独立した親 hover 経路で 6px 22px / dark 26px）⑥.auth-subtitle → auth-card hover 時に primary tint text-shadow + opacity 1 でカード hover に呼応⑦.auth-hint（🔒 含む）→ auth-card hover 時に primary tint text-shadow で南京錠アイコンが微発光⑧.auth-offline-mode → auth-card hover 時に color text 化（明度 up）+ primary tint text-shadow。ライト/ダーク両対応
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
