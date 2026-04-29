// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.22'; // v26.22: Chart.js tooltip 高級化 — 14種チャート一括強化。commonTooltip() を一箇所変更で全チャートに反映。①borderColor alpha 0x80→0xcc + borderWidth 1→1.5 で primary 枠線の存在感UP②padding {x:12,y:8}→{x:14,y:10} で呼吸感UP + cornerRadius 8→10 でモダンな丸み③titleFont weight '600'→'700' で太字化 + titleMarginBottom 6 でタイトル/本文間の間隔 + bodySpacing 4 で行間④displayColors のスウォッチを正方形→丸（boxWidth/Height 10→12 + usePointStyle:true）+ boxPadding 4→6 で凡例ドット間隔強化⑤caretSize 5→7 + caretPadding 2→8 で吹き出し三角がチャートから浮く演出⑥backgroundColor light 0.92→0.95 / dark 0.97→0.98 でガラス感維持しつつコントラスト微増。renderDonutChart/MonthlyBar/BalanceLine/CategoryBar/MemberExpense/PaymentMethod/PaymentTrend/YoY/NetWorth/CategoryTrend/FixedVariableDonut/FixedVariableTrend/Tag/DayOfWeek の14種が一括で高品質ツールチップに昇格。ライト/ダーク両対応
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
