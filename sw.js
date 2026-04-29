// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.11'; // v26.11: ボタン inset 白ハイライト統合（success/danger） + サマリーカード装飾円ホバー強化 + フォーム入力ホバー立体化 + btn-link hover プライマリ glow + ダーク btn-danger inset 補完（btn-primary v26.10 と同パターンで .btn-success に inset 0 1px 0 rgba(255,255,255,0.2) 追加（hover 0.22）+ .btn-danger ライトに inset 0 1px 0 rgba(255,255,255,0.5) 追加（hover 0.55）/ ダークは 0.06 で別宣言（hover 0.08）+ .summary-card:hover::after scale 1.2→1.28 + 白halo 24px + 白透過度 10%→18% / ::before scale 1.15→1.22 + 白halo 28px + 白透過度 6%→14% でカード hover 時に装飾円ペアが躍動的に膨張・発光 + .form-group input/select/textarea:hover に 0 2px 8px black-08 ドロップシャドウ追加で hover lift 立体感 + .btn-link:hover に primary text-shadow glow 追加（ライト mix-sm / ダーク primary-end mix-mid））
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
