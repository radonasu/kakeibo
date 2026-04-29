// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.21'; // v26.21: Chart.js カラーパレット強化 — 棒グラフに縦/横方向グラデーション、ドーナツのホバー鮮やかさ、ラインチャート3-stop richer fade で深み追加。10種のチャートを一括で視覚的に強化。①makeGradient (line area 用) を 3-stop midpoint 化（top alpha / mid alpha*0.45 / bottom alpha2）で色帯の伸びを強化②makeBarVertGrad ヘルパー追加 (canvas 全体縦方向 alpha 高→低)③barFillScript ヘルパー追加 (per-bar scriptable: indexAxis 'y' は base→x、'x' は y→base 方向に勾配・色配列対応)④hexToRgba を module 化 (renderDayOfWeekChart の inline 版を撤去)⑤renderDonutChart / renderPaymentMethodChart / renderTagChart ドーナツに hoverBackgroundColor (alpha 0.98) + hoverOffset 6→10 + hoverBorderWidth 3→4 で浮上感を強化⑥renderFixedVariableDonut も hoverBackgroundColor + hoverOffset 10→12 + hoverBorderWidth 4 統一⑦renderMonthlyBarChart 収入/支出バー → 縦グラデ + hover 時さらに濃く⑧renderCategoryBarChart (横棒) → barFillScript で per-bar 横方向 (左 alpha 0.45 → 右 alpha 0.92) のグロス⑨renderMemberExpenseChart → 支出/収入両方 per-bar 横方向グラデ⑩renderPaymentTrendChart スタック棒 → 各支払方法バーに縦グラデ⑪renderYoYChart 4 系列バー (今期/前期×支出/収入) すべて縦グラデ・前期は薄め固定⑫renderDayOfWeekChart 7曜日バー → per-bar 縦グラデ・最大値は alpha 引き上げで強調⑬renderFixedVariableTrend 固定費/変動費バー → 縦グラデ + hover 強調⑭renderBalanceLineChart area 0.22→0.32 / renderNetWorthChart 0.20→0.30 / renderCategoryTrendChart 0.30→0.36 でラインチャート area の色厚みを底上げ。ライト/ダーク両対応
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
