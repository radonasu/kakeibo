// ============================================================
// sw.js - Service Worker（オフライン対応・PWAキャッシュ）
// ============================================================

const CACHE_NAME = 'kakeibo-v26.18'; // v26.18: トースト通知 3要素タイプ別グロー強化（.kk-toast-icon box-shadow / 内部白テキスト光沢 / .kk-toast-body text-shadow）— v22.84/v26.08 で .kk-toast 自体には backdrop-blur ガラスモーフィズム + タイプ別外周 box-shadow glow（success/error/warning × mix-sm 24px）が施されているが、内部の .kk-toast-icon（円形ソリッド色アイコンバッジ）と .kk-toast-body（メッセージテキスト）は plain な状態のままだった。v26.18 で内部 3要素にタイプ別カラーグローを追加：①.kk-toast-icon に常時 box-shadow（success/danger-text/warning カラー mix-md 8px、ダーク mix-lg 10px）+ inset 0 1px 0 rgba(255,255,255,0.3) で上端白光沢。内部チェックマーク文字に黒影 + 白色 text-shadow（rgba 0.35）でバッジ立体感を付与。②.kk-toast-body にタイプ別 subtle text-shadow（success/danger-text/warning カラー mix-2xs 6px、ダーク mix-xs 8px）。これでトースト 3 層（外周 glow / アイコン glow / 本文 glow）が統一カラーで連動し、成功は緑・エラーは赤・警告は黄橙の「色立体感のあるトースト」が完成。ライト/ダーク両対応
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
