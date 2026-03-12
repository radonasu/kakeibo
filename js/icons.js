// ============================================================
// icons.js - SVGアイコンシステム (v5.63)
// ポップ・ラウンドスタイルのインラインSVGアイコン
// ============================================================

const APP_ICONS = {
  // ── ナビゲーション ─────────────────────────────
  home:     '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor" stroke="none"/>',
  list:     '<rect x="3" y="4" width="18" height="4" rx="2" fill="currentColor" stroke="none"/><rect x="3" y="10" width="18" height="4" rx="2" fill="currentColor" stroke="none" opacity=".6"/><rect x="3" y="16" width="18" height="4" rx="2" fill="currentColor" stroke="none" opacity=".35"/>',
  chart:    '<rect x="2" y="13" width="5" height="9" rx="1.5" fill="currentColor" stroke="none" opacity=".5"/><rect x="9.5" y="6" width="5" height="16" rx="1.5" fill="currentColor" stroke="none" opacity=".75"/><rect x="17" y="2" width="5" height="20" rx="1.5" fill="currentColor" stroke="none"/>',
  tag:      '<path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h5.172a2 2 0 0 1 1.414.586l8.328 8.328a2 2 0 0 1 0 2.828l-4.172 4.172a2 2 0 0 1-2.828 0L4.086 12.586A2 2 0 0 1 3.5 11.172V7.5z" fill="currentColor" stroke="none"/><circle cx="7" cy="9" r="1.5" fill="var(--surface, #fff)"/>',
  bank:     '<path d="M3 21h18v-2H3zm0-4h2v-6H3zm4 0h2v-6H7zm4 0h2v-6h-2zm4 0h2v-6h-2zm4 0h2v-6h-2z" fill="currentColor" stroke="none" opacity=".7"/><path d="M12 1L2 6v2h20V6z" fill="currentColor" stroke="none"/>',
  target:   '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" opacity=".15"/><circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" opacity=".3"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" opacity=".6"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3" fill="currentColor" stroke="none" opacity=".2"/><rect x="3" y="4" width="18" height="7" rx="3" fill="currentColor" stroke="none"/><rect x="7" y="14" width="3" height="3" rx="1" fill="currentColor" stroke="none" opacity=".6"/><rect x="14" y="14" width="3" height="3" rx="1" fill="currentColor" stroke="none" opacity=".35"/><line x1="8" y1="2" x2="8" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="2" x2="16" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  phone:    '<rect x="5" y="1" width="14" height="22" rx="3.5" fill="currentColor" stroke="none" opacity=".2"/><rect x="5" y="1" width="14" height="22" rx="3.5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="18.5" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="4" x2="15" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  ticket:   '<path d="M2 9a3 3 0 0 1 0 6v4a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-4a3 3 0 0 1 0-6V5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z" fill="currentColor" stroke="none" opacity=".2"/><path d="M2 9a3 3 0 0 1 0 6v4a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-4a3 3 0 0 1 0-6V5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/>',
  bag:      '<path d="M6 2l-2 5v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7l-2-5z" fill="currentColor" stroke="none" opacity=".2"/><path d="M6 2l-2 5v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7l-2-5z" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="1.5"/><path d="M9 10a3 3 0 0 0 6 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>',
  settings: '<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="currentColor" stroke="none" opacity=".25"/>',

  // ── UI要素 ─────────────────────────────────────
  moon:     '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" stroke="none"/>',
  sun:      '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></g>',
  menu:     '<line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  plus:     '<line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  share:    '<circle cx="18" cy="5" r="3" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="18" cy="19" r="3" fill="currentColor" stroke="none" opacity=".6"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" stroke-width="1.5"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" stroke-width="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  cloud:    '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" stroke="none" opacity=".3"/><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  bell:     '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="currentColor" stroke="none" opacity=".3"/><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  receipt:  '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z" fill="currentColor" stroke="none" opacity=".15"/><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="16" x2="12" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  camera:   '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="currentColor" stroke="none" opacity=".2"/><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="13" r="4" fill="currentColor" stroke="none" opacity=".4"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/>',

  // ── ブランド ────────────────────────────────────
  piggy:    '<ellipse cx="12" cy="13" rx="8.5" ry="7.5" fill="currentColor" stroke="none"/><ellipse cx="12" cy="13" rx="8.5" ry="7.5" fill="currentColor" stroke="none" opacity=".2"/><circle cx="8.5" cy="11" r="1" fill="var(--surface, #fff)"/><ellipse cx="16" cy="14" rx="2.5" ry="2" fill="currentColor" stroke="none" opacity=".4"/><circle cx="15.5" cy="13.8" r=".6" fill="var(--surface, #fff)"/><circle cx="17" cy="14.2" r=".6" fill="var(--surface, #fff)"/><path d="M5 17 C3 19 3.5 20.5 5 20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M19 17 C21 19 20.5 20.5 19 20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><ellipse cx="7" cy="8" rx="2.5" ry="2" transform="rotate(-20 7 8)" fill="currentColor" stroke="none"/><ellipse cx="17" cy="8" rx="2.5" ry="2" transform="rotate(20 17 8)" fill="currentColor" stroke="none"/><rect x="9.5" y="5" width="5" height="2" rx="1" fill="var(--surface, #fff)" opacity=".7"/>',
};

// NAV_ICON_MAP: data-page値 → アイコン名
const NAV_ICON_MAP = {
  dashboard:     'home',
  transactions:  'list',
  reports:       'chart',
  categories:    'tag',
  assets:        'bank',
  goals:         'target',
  calendar:      'calendar',
  subscriptions: 'phone',
  points:        'ticket',
  wishlist:      'bag',
  settings:      'settings',
};

/**
 * SVGアイコンを生成
 * @param {string} name - アイコン名
 * @param {number} [size=20] - サイズ（px）
 * @param {string} [cls=''] - 追加CSSクラス
 * @returns {string} SVG HTML文字列
 */
function appIcon(name, size, cls) {
  const svg = APP_ICONS[name];
  if (!svg) return '';
  const s = size || 20;
  const c = cls ? ` class="${cls}"` : '';
  return `<svg${c} width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${svg}</svg>`;
}

/**
 * ナビゲーションアイコンを初期化（emoji → SVG置き換え）
 * JS初期化時に呼び出す
 */
function initNavIcons() {
  // サイドバーナビ
  document.querySelectorAll('#sidebar-nav .nav-item').forEach(btn => {
    const page = btn.dataset.page;
    const iconName = NAV_ICON_MAP[page];
    if (!iconName) return;
    const iconEl = btn.querySelector('.nav-icon');
    if (iconEl) iconEl.innerHTML = appIcon(iconName, 20);
  });

  // ボトムナビ
  document.querySelectorAll('#bottom-nav .bottom-nav-item').forEach(btn => {
    const page = btn.dataset.page;
    const iconName = NAV_ICON_MAP[page];
    if (!iconName) return;
    const iconEl = btn.querySelector('.bottom-nav-icon');
    if (iconEl) iconEl.innerHTML = appIcon(iconName, 22);
  });

  // ブランドアイコン
  const brandIcon = document.querySelector('.brand-icon');
  if (brandIcon) brandIcon.innerHTML = appIcon('piggy', 28);

  // ダークモード切替
  document.querySelectorAll('.btn-dark-toggle').forEach(btn => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = appIcon(isDark ? 'sun' : 'moon', 18);
  });

  // ハンバーガー
  const hamburger = document.getElementById('hamburger');
  if (hamburger) hamburger.innerHTML = appIcon('menu', 22);

  // FAB
  const fab = document.getElementById('global-fab');
  if (fab) fab.innerHTML = appIcon('plus', 26);
}
