// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.23'; // v26.23: 借金返済シミュレーターチャート（renderDebtSimChart）を charts.js のヘルパー基盤に統合。①ad-hoc な ctx.createLinearGradient(0,0,0,200)（ハードコード高さ200の2-stopグラデ）を makeGradient(ctx, canvas, color, 0.32, 0.02)（v26.21 の canvas.height ベース 3-stop richer fade）に置換。残高ライン下の面塗りが他のラインチャート（renderBalanceLineChart / renderNetWorthChart / renderCategoryTrendChart）と同じ厚みのある濃淡グラデーションで描画される ②自前のシンプル tooltip（borderWidth 1 / cornerRadius 8 / padding 10 / 背景 surface色）を commonTooltip() に置換し v26.22 の高級 tooltip 設定（borderColor 0xcc / borderWidth 1.5 / padding 14,10 / cornerRadius 10 / titleFont 700 + titleMarginBottom 6 + bodySpacing 4 / usePointStyle 円形マーカー / boxWidth/Height 12 + boxPadding 6 / caretSize 7 + caretPadding 8 / 背景 alpha 0.95-0.98）を即時継承 ③borderWidth 2→2.5・tension 0.35→0.4・pointHoverRadius 4→7・pointBackgroundColor / pointBorderColor: surface色 / pointBorderWidth: 2 / pointHoverBorderWidth: 3 を追加し他のライン系チャートと完全対称な hover 演出 ④commonAnimation 定数（duration 600 / easeOutQuart）採用・interaction: { mode: 'index', intersect: false } 追加で複数系列（現在の計画 vs 繰上返済後）の hover 同期 ⑤getThemeColors() / getCSSVar() でコード簡潔化 + tick font を fs2xs（10）に統一。これで全 15 種のラインチャートが同じヘルパー経由で描画され、ライト/ダーク・テーマカラー切替・リサイズで全て自動追従
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
