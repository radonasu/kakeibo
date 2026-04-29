// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.17'; // v26.17: 三次空状態 3種への primary glow 統合（.empty 汎用 / .dd-empty ドリルダウン / .ct-row-empty カテゴリトレンド行）— v26.05〜v26.16 で 14種空状態（主要10種＋二次4種）への primary glow 統合が完成する一方、テーブル/カード/インラインで使われる汎用テキスト系の3種が plain text-muted のみで glow 連携が無く取り残されていた。.empty はインサイトカード/タグ取引テーブル/メンバーテーブル/カテゴリトレンド/カテゴリ管理空 等の8箇所超で使われる最も汎用的な空状態クラス。.dd-empty はカテゴリドリルダウンモーダル「該当取引なし」表示。.ct-row-empty td はカテゴリトレンドテーブルで全月ゼロ円のカテゴリ行（— 表示）。3種に常時 primary text-shadow glow（ライト mix-nano 6px / ダーク mix-2xs 8px の控えめトーン）+ transition: text-shadow/color 追加。card:hover/dd-modal-box:hover/.empty:hover/.dd-empty:hover で text-shadow を mix-2xs 8px / dark mix-sm 10px に強化。.ct-row-empty は既存の tr:hover lift（v22.70 translateY/box-shadow）と連動して :hover で td text-shadow を mix-2xs 8px / dark mix-sm 10px に強化。これで全空状態（主要10＋二次4＋三次3＝計17種）が統一 primary glow を獲得し、家計簿アプリ上のあらゆる空メッセージが一貫したブランド表現に
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
