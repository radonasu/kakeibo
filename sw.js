// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.25'; // v26.25: Chart.js クロスヘア拡張 — v26.24 で makeCrosshairPlugin 共通化したライン/エリア系 5 種に加え、月別時系列バーチャート 3 種（renderMonthlyBarChart / renderPaymentTrendChart / renderYoYChart）にも一括適用。①ヘルパー改修: chart.tooltip._active[0].element.x → chart.scales.x.getPixelForValue(_active[0].index) を優先使用、fallback で element.x。grouped bar（2 or 4 dataset/category）でも crosshair が「カテゴリの幾何中央」を貫通（旧 element.x は最初の dataset の bar 中央 = 左寄り）。stacked bar / line では挙動不変②renderMonthlyBarChart（ダッシュボード過去 12 ヶ月収支 grouped bar）③renderPaymentTrendChart（年間 12 ヶ月支払方法別 stacked bar）④renderYoYChart（前年比較 12 ヶ月 grouped bar）に primary alpha 0.42 / glow 0.18（v26.24 と同規格）で適用。月別グラフ全 8 種（line 系 5 + bar 系 3）で「hover 縦線で月を追跡」操作感を完全統一。ライト/ダーク両対応。 // v26.24: Chart.js クロスヘア統一 — renderCategoryTrendChart に閉じていた ctCrosshair を共通ヘルパー makeCrosshairPlugin(strokeColor, glowColor) に切り出し、全ライン/エリア系チャート 5 種（renderBalanceLineChart / renderNetWorthChart / renderCategoryTrendChart / renderFixedVariableTrend / renderDebtSimChart）に一括適用。 // v26.24: Chart.js クロスヘア統一 — renderCategoryTrendChart に閉じていた ctCrosshair を共通ヘルパー makeCrosshairPlugin(strokeColor, glowColor) に切り出し、全ライン/エリア系チャート 5 種（renderBalanceLineChart / renderNetWorthChart / renderCategoryTrendChart / renderFixedVariableTrend / renderDebtSimChart）に一括適用。①strokeStyle: gridColor → primary alpha 0.42 で brand 色のクロスヘアに格上げ（テーマ追従・カテゴリトレンドは primaryClr / その他は dataset カラー or primary）②lineWidth 1 → 1.2 で hairline すぎず認識しやすく③dash [4,4] → [5,4] で破線リズム微強化④shadow（primary alpha 0.18 / blur 6）追加でクロスヘアに微発光⑤renderBalanceLineChart / renderNetWorthChart / renderFixedVariableTrend / renderDebtSimChart は hover 中の縦ガイドラインが新規追加（X軸の同 index 全 dataset を読み取りやすく）。家計簿アプリではレポートタブでカテゴリトレンドのクロスヘアを使い慣れたユーザーが、月別収支・純資産推移・固定費 vs 変動費・ローン返済シミュレーションでも同じ「縦線で月を追跡」操作感を獲得。ライト/ダーク両対応（hexToRgba を経由するため CSS 変数の primary 色がそのまま透過適用される）
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
