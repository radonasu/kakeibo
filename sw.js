// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.19'; // v26.19: 認証画面リッチ化 + サマリーカード sheen 強化（.auth-overlay 背景 radial-gradient 重ね塗り / .auth-card hover lift + primary glow / .auth-title hover text-shadow / .auth-logo-icon 常時 pulse glow animation / .summary-card::before/::after hover 強化 + scale ぷっくり）— ログイン画面 4 要素（背景・カード・タイトル・ロゴアイコン）が hover/focus に呼応する一体型演出に進化。①.auth-overlay は既存 linear-gradient diagonal の上に subtle radial-gradient（中央放射 white tint）を重ねて画面中央のカードに視線を集める「光のヴィネット」を獲得。②.auth-card に hover/focus-within で translateY(-2px) lift + primary glow box-shadow 追加でログイン直前の持ち上がるフィードバック。③.auth-title は auth-card hover 時に primary tint text-shadow で微発光しタイトル文字に注目を集める。④.auth-logo-icon に常時 pulse glow animation 追加（3.2s/サイクル、ライトは primary mix-2xl→mix-3xl・ダークは primary-end）。auth-card hover 時はさらに pulse 振幅を強化（duration を 2.0s に短縮）。⑤.summary-card::before/::after は既存 sheen 球体（左下大円 + 右上小円）の hover 時の background opacity を mix-base/mix-dim → 0.12/0.18 に強化 + subtle scale(1.06) でぷっくり膨らむ立体感を追加。ライト/ダーク両対応
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
