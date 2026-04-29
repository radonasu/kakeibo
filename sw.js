// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.29'; // v26.29: モーダル内 scrollbar 4 種 primary tint 統一 + #bottom-nav 上端 primary tint 装飾 + .modal-footer 上方向 subtle lift drop-shadow — ①.dd-list（line 16115-19 付近）/②.md-scroll-body（line 16538-42 付近）の thumb を単色 var(--border) → 縦グラデ（primary mix-xs ティント start → primary mix-sm ティント end）に格上げ＋hover blur 0 0 8px primary mix-md glow 追加。Firefox の scrollbar-color も primary mix-xs ティントに統一③.notif-panel-body（line 14770 付近）に scrollbar primary tint thumb を新規明示的定義（dd-list と同等規格）④ダーク .dd-list / .md-scroll-body / .notif-panel-body は primary-end ベース（lavender #a78bfa）の縦グラデ＋hover 0 0 10px primary-end mix-md glow を末尾 v26.29 ブロックに新規追加（ブランドアクセント色をダークでも統一）⑤#bottom-nav の border-top-color を var(--border) → primary mix-xs ティントに格上げ＋既存 var(--shadow-up-sm) に加えて 0 -2px 12px primary mix-xs glow を上方向に追加（モバイル底部ナビバーが「フロート」した印象を強調）⑥ダーク #bottom-nav は primary-end mix-xs tint border + 0 -2px 14px primary-end mix-sm 上方向 glow⑦.modal-footer に 0 -3px 10px black-08 の上方向 subtle drop-shadow を新規追加（既存 border-top primary tint v22.91#7 と組合せて 13 種モーダルすべての footer が「持ち上がる」立体感を獲得）⑧ダーク .modal-footer は 0 -3px 12px black-12 に強化（ダーク背景上の visibility 確保）。全変更 CSS-only 実装（JS変更なし）・ライト/ダーク両対応・全 script/link タグ ?v=26.29 に更新 — ①.cal-cell:hover:not(.cal-empty) の inset 1px/mix-sm → 1.5px/mix-md に強化＋外側 0 2px 14px primary mix-sm glow 新規追加（hover 時にセルが「指で触れた感」を獲得）②.cal-cell.heat-1〜4:hover に 0 2px 12〜14px expense mix-2xs〜mix-md の外側 glow 新規追加（従来 brightness 1.07 のみ → 赤味でアクションフィードバックが付与）③ダーク .cal-cell.heat-*:hover も同様に外側 glow + filter:brightness(1.10)（ダーク側を少し強めに）④.cal-cell.selected:hover の外側 glow を blur 8→14px / mix-sm→mix-md に強化（リッチ化）⑤ダーク .cal-cell:hover/.cal-cell.selected:hover を primary-end ベースで新規追加（ブランドアクセント色追従）⑥.cal-date-num.today を 2 段重ねリング（focus-ring-w mix-md→mix-lg + 外側 0 0 10px primary mix-sm）に強化＋transition 追加⑦.cal-cell:hover:not(.cal-empty) .cal-date-num.today で today バッジの ring を mix-xl/blur 14px mix-md に脈動拡張（焦点が合った瞬間「今日」のシンボルが強調）⑧ダーク .cal-date-num.today/親セル hover は primary-end ring/glow に切替⑨centerTextPlugin（charts.js）に theme-aware glow 追加：ラベル「合計」に primary alpha 0.16/blur 6 / 金額に primary alpha 0.18/blur 8 の subtle 紫 glow（ダークでは primary-end に差し替え）。getThemeColors().isDark で getCSSVar 切替→hexToRgba で alpha 化→ctx.shadowColor/shadowBlur で fillText 出力に光を載せる。全ドーナツチャートで中央テキストが薄く発光し、v26.27 の hover arc halo（外周）と中心 glow が呼応する完成形演出に。ライト/ダーク両対応。 — クロスヘア（v26.24-26 でライン/バー系 8 種統一）に続き、doughnut/bar 系の hover 演出を新規共通プラグイン2種で統一。①makeArcHoverGlowPlugin(alpha, blur): active arc の startAngle→endAngle を outerRadius+4 でなぞる丸キャップ stroke + 同色 shadowBlur で外周ハロー描画。renderDonutChart（カテゴリ別ドーナツ・α0.46/blur14）/ renderPaymentMethodChart（支払方法ドーナツ・α0.46/blur14）/ renderFixedVariableDonut（固定/変動ドーナツ・α0.5/blur16）/ renderTagChart（タグ別ドーナツ・α0.46/blur14）の4種に適用②makeBarHoverGlowPlugin(alpha, blur): active bar の上辺左右を borderRadius 風 quadraticCurve でなぞるアウトライン stroke + 同色 shadowBlur 14 で発光。renderDayOfWeekChart（曜日別平均支出バー・α0.55/blur14）に適用。色は hoverBackgroundColor / borderColor から自動取得しテーマ追従、ライト/ダーク両対応。 // v26.26: Chart.js クロスヘアプラグインに orientation 引数（'vertical' | 'horizontal'）を追加し、横棒系（indexAxis:'y'）2種（renderCategoryBarChart レポート横棒・renderMemberExpenseChart メンバー別 grouped 横棒）に水平方向クロスヘア適用。yScale.getPixelForValue(idx) 優先で行の幾何中央を貫通、fallback で element.y。primary alpha 0.42 / glow 0.18（v26.24-25 と同規格）。バー系全5種（縦3＋横2）でクロスヘア演出を完全統一。ライト/ダーク両対応。 // v26.25: Chart.js クロスヘア拡張 — v26.24 で makeCrosshairPlugin 共通化したライン/エリア系 5 種に加え、月別時系列バーチャート 3 種（renderMonthlyBarChart / renderPaymentTrendChart / renderYoYChart）にも一括適用。①ヘルパー改修: chart.tooltip._active[0].element.x → chart.scales.x.getPixelForValue(_active[0].index) を優先使用、fallback で element.x。grouped bar（2 or 4 dataset/category）でも crosshair が「カテゴリの幾何中央」を貫通（旧 element.x は最初の dataset の bar 中央 = 左寄り）。stacked bar / line では挙動不変②renderMonthlyBarChart（ダッシュボード過去 12 ヶ月収支 grouped bar）③renderPaymentTrendChart（年間 12 ヶ月支払方法別 stacked bar）④renderYoYChart（前年比較 12 ヶ月 grouped bar）に primary alpha 0.42 / glow 0.18（v26.24 と同規格）で適用。月別グラフ全 8 種（line 系 5 + bar 系 3）で「hover 縦線で月を追跡」操作感を完全統一。ライト/ダーク両対応。 // v26.24: Chart.js クロスヘア統一 — renderCategoryTrendChart に閉じていた ctCrosshair を共通ヘルパー makeCrosshairPlugin(strokeColor, glowColor) に切り出し、全ライン/エリア系チャート 5 種（renderBalanceLineChart / renderNetWorthChart / renderCategoryTrendChart / renderFixedVariableTrend / renderDebtSimChart）に一括適用。 // v26.24: Chart.js クロスヘア統一 — renderCategoryTrendChart に閉じていた ctCrosshair を共通ヘルパー makeCrosshairPlugin(strokeColor, glowColor) に切り出し、全ライン/エリア系チャート 5 種（renderBalanceLineChart / renderNetWorthChart / renderCategoryTrendChart / renderFixedVariableTrend / renderDebtSimChart）に一括適用。①strokeStyle: gridColor → primary alpha 0.42 で brand 色のクロスヘアに格上げ（テーマ追従・カテゴリトレンドは primaryClr / その他は dataset カラー or primary）②lineWidth 1 → 1.2 で hairline すぎず認識しやすく③dash [4,4] → [5,4] で破線リズム微強化④shadow（primary alpha 0.18 / blur 6）追加でクロスヘアに微発光⑤renderBalanceLineChart / renderNetWorthChart / renderFixedVariableTrend / renderDebtSimChart は hover 中の縦ガイドラインが新規追加（X軸の同 index 全 dataset を読み取りやすく）。家計簿アプリではレポートタブでカテゴリトレンドのクロスヘアを使い慣れたユーザーが、月別収支・純資産推移・固定費 vs 変動費・ローン返済シミュレーションでも同じ「縦線で月を追跡」操作感を獲得。ライト/ダーク両対応（hexToRgba を経由するため CSS 変数の primary 色がそのまま透過適用される）
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
