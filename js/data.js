// ============================================================
// data.js - データ管理 (localStorage) + マルチアカウント対応
// ============================================================

const ACCOUNTS_META_KEY  = 'kakeibo_accounts_v1';
const ACTIVE_ACCOUNT_KEY = 'kakeibo_active_v1';
const OLD_STORAGE_KEY    = 'kakeibo_v1'; // 旧キー（移行用）
const FX_RATES_KEY         = 'kakeibo_fx_rates_v1'; // 為替レート（グローバル）
const FX_RATES_UPDATED_KEY = 'kakeibo_fx_updated_v1'; // 為替レート最終自動取得日時

// サポート通貨定義
const CURRENCIES = [
  { code: 'JPY', name: '日本円',    symbol: '¥',  flag: '🇯🇵' },
  { code: 'USD', name: '米ドル',    symbol: '$',  flag: '🇺🇸' },
  { code: 'EUR', name: 'ユーロ',    symbol: '€',  flag: '🇪🇺' },
  { code: 'GBP', name: '英ポンド',  symbol: '£',  flag: '🇬🇧' },
  { code: 'CNY', name: '人民元',    symbol: '¥',  flag: '🇨🇳' },
  { code: 'KRW', name: '韓国ウォン',symbol: '₩',  flag: '🇰🇷' },
  { code: 'AUD', name: '豪ドル',    symbol: 'A$', flag: '🇦🇺' },
  { code: 'SGD', name: 'SGドル',    symbol: 'S$', flag: '🇸🇬' },
];

const DEFAULT_FX_RATES = {
  USD: 150.0,
  EUR: 163.0,
  GBP: 190.0,
  CNY: 20.8,
  KRW: 0.11,
  AUD: 97.0,
  SGD: 112.0,
};

function getExchangeRates() {
  try {
    const raw = localStorage.getItem(FX_RATES_KEY);
    if (!raw) return { ...DEFAULT_FX_RATES };
    return { ...DEFAULT_FX_RATES, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_FX_RATES };
  }
}

function saveExchangeRates(rates) {
  localStorage.setItem(FX_RATES_KEY, JSON.stringify(rates));
}

function getFXRatesUpdatedAt() {
  return localStorage.getItem(FX_RATES_UPDATED_KEY) || null;
}

function saveFXRatesUpdatedAt(isoStr) {
  localStorage.setItem(FX_RATES_UPDATED_KEY, isoStr);
}

// Frankfurter.app から最新レートを取得して保存（USDベース→JPY換算）
async function fetchAndSaveExchangeRates() {
  const codes = CURRENCIES.filter(c => c.code !== 'JPY').map(c => c.code);
  const url = `https://api.frankfurter.app/latest?base=USD&symbols=JPY,${codes.filter(c => c !== 'USD').join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const usdToJpy = json.rates.JPY;
  const newRates = {};
  newRates['USD'] = usdToJpy;
  codes.filter(c => c !== 'USD').forEach(code => {
    const usdToX = json.rates[code];
    if (usdToX) newRates[code] = Math.round((usdToJpy / usdToX) * 100) / 100;
  });
  saveExchangeRates(newRates);
  const now = new Date().toISOString();
  saveFXRatesUpdatedAt(now);
  return newRates;
}

function toJPY(amount, currency) {
  if (!currency || currency === 'JPY') return amount;
  const rates = getExchangeRates();
  return Math.round(amount * (rates[currency] || 1));
}

function getCurrencyInfo(code) {
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

function formatCurrencyAmount(amount, currency) {
  const info = getCurrencyInfo(currency || 'JPY');
  if (!currency || currency === 'JPY') {
    return '¥' + Number(amount).toLocaleString('ja-JP');
  }
  return info.symbol + Number(amount).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
}

const DEFAULT_CATEGORIES = [
  // 支出
  { id: 'c1',  name: '食費',       type: 'expense', yayoiAccount: '食料品費',   color: '#ef4444' },
  { id: 'c2',  name: '光熱費',     type: 'expense', yayoiAccount: '水道光熱費', color: '#f97316' },
  { id: 'c3',  name: '通信費',     type: 'expense', yayoiAccount: '通信費',     color: '#3b82f6' },
  { id: 'c4',  name: '交通費',     type: 'expense', yayoiAccount: '旅費交通費', color: '#8b5cf6' },
  { id: 'c5',  name: '医療費',     type: 'expense', yayoiAccount: '医療費',     color: '#06b6d4' },
  { id: 'c6',  name: '教育費',     type: 'expense', yayoiAccount: '教育費',     color: '#10b981' },
  { id: 'c7',  name: '住居費',     type: 'expense', yayoiAccount: '地代家賃',   color: '#84cc16' },
  { id: 'c8',  name: '娯楽費',     type: 'expense', yayoiAccount: '雑費',       color: '#ec4899' },
  { id: 'c9',  name: '消耗品',     type: 'expense', yayoiAccount: '消耗品費',   color: '#f59e0b' },
  { id: 'c10', name: '保険料',     type: 'expense', yayoiAccount: '保険料',     color: '#64748b' },
  { id: 'c11', name: '衣服費',     type: 'expense', yayoiAccount: '雑費',       color: '#a855f7' },
  { id: 'c12', name: 'その他支出', type: 'expense', yayoiAccount: '雑費',       color: '#6b7280' },
  // 収入
  { id: 'c13', name: '給与',       type: 'income',  yayoiAccount: '給料賃金',   color: '#059669' },
  { id: 'c14', name: '賞与',       type: 'income',  yayoiAccount: '賞与',       color: '#047857' },
  { id: 'c15', name: '副業収入',   type: 'income',  yayoiAccount: '売上高',     color: '#0d9488' },
  { id: 'c16', name: 'その他収入', type: 'income',  yayoiAccount: '雑収入',     color: '#6ee7b7' },
];

const DEFAULT_MEMBERS = [
  { id: 'm1', name: '父', color: '#3b82f6' },
  { id: 'm2', name: '母', color: '#ec4899' },
];

const DEFAULT_SETTINGS = {
  familyName: 'わが家の家計簿',
  fiscalYearStart: 1,
  defaultMemberId: 'm1',
  geminiApiKey: '',
  syncConfig: { url: '', anonKey: '' },
};

// ── マルチアカウント管理 ───────────────────────────────────
var accounts = [];
var currentAccountId = 'default';

function initAccounts() {
  // 旧データ移行（kakeibo_v1 → kakeibo_data_default）
  const oldData = localStorage.getItem(OLD_STORAGE_KEY);
  if (oldData && !localStorage.getItem('kakeibo_data_default')) {
    localStorage.setItem('kakeibo_data_default', oldData);
  }

  const raw = localStorage.getItem(ACCOUNTS_META_KEY);
  if (raw) {
    accounts = JSON.parse(raw);
  } else {
    accounts = [{ id: 'default', name: 'わが家' }];
    localStorage.setItem(ACCOUNTS_META_KEY, JSON.stringify(accounts));
  }

  const savedId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  if (savedId && accounts.find(a => a.id === savedId)) {
    currentAccountId = savedId;
  } else {
    currentAccountId = accounts[0].id;
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, currentAccountId);
  }
}

function saveAccountsMeta() {
  localStorage.setItem(ACCOUNTS_META_KEY, JSON.stringify(accounts));
}

function getStorageKey(id) {
  return `kakeibo_data_${id || currentAccountId}`;
}

function getAllAccounts() { return accounts; }
function getCurrentAccount() { return accounts.find(a => a.id === currentAccountId) || accounts[0]; }

function switchAccount(id) {
  if (!accounts.find(a => a.id === id)) return false;
  currentAccountId = id;
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
  appData = loadData();
  return true;
}

function createAccount(name) {
  const id = 'acc_' + genId();
  const acc = { id, name };
  accounts.push(acc);
  saveAccountsMeta();
  // 新アカウントのデフォルトデータを作成
  const newData = createDefaultData();
  newData.settings.familyName = name;
  localStorage.setItem(getStorageKey(id), JSON.stringify(newData));
  return acc;
}

function renameAccount(id, name) {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return false;
  acc.name = name;
  saveAccountsMeta();
  // アカウント内のfamilyNameも更新
  const key = getStorageKey(id);
  const raw = localStorage.getItem(key);
  if (raw) {
    const data = JSON.parse(raw);
    data.settings = data.settings || {};
    data.settings.familyName = name;
    localStorage.setItem(key, JSON.stringify(data));
    if (id === currentAccountId) appData.settings.familyName = name;
  }
  return true;
}

function deleteAccount(id) {
  if (accounts.length <= 1) return false;
  accounts = accounts.filter(a => a.id !== id);
  localStorage.removeItem(getStorageKey(id));
  saveAccountsMeta();
  if (currentAccountId === id) {
    currentAccountId = accounts[0].id;
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, currentAccountId);
    appData = loadData();
  }
  return true;
}

// ── ローカルストレージ ────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return createDefaultData();
    const data = JSON.parse(raw);
    if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
    // 旧Claude APIキー → Gemini APIキーへマイグレーション
    if (data.settings.claudeApiKey !== undefined) delete data.settings.claudeApiKey;
    if (!data.settings.geminiApiKey) data.settings.geminiApiKey = '';
    if (!data.settings.syncConfig)   data.settings.syncConfig   = { url: '', anonKey: '' };
    // 旧形式マイグレーション（roomCode/enabled削除）
    if (data.settings.syncConfig.roomCode !== undefined) delete data.settings.syncConfig.roomCode;
    if (data.settings.syncConfig.enabled  !== undefined) delete data.settings.syncConfig.enabled;
    if (!data.budgets)        data.budgets = {};
    if (!data.templates)      data.templates = [];
    if (!data.assets)         data.assets = [];
    if (!data.goals)          data.goals = [];
    if (!data.subscriptions)  data.subscriptions = [];
    if (!data.points)         data.points = [];       // ポイント残高（v5.47）
    if (!data.wishlist)       data.wishlist = [];     // ほしいものリスト（v5.51）
    if (!data.challenges)     data.challenges = [];   // 節約チャレンジ（v5.64）
    // 旧アセットにcurrencyフィールドを追加（マイグレーション）
    data.assets.forEach(a => { if (!a.currency) a.currency = 'JPY'; });
    return data;
  } catch (e) {
    console.error('データ読み込みエラー:', e);
    return createDefaultData();
  }
}

function createDefaultData() {
  return {
    transactions: [],
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    members: JSON.parse(JSON.stringify(DEFAULT_MEMBERS)),
    settings: { ...DEFAULT_SETTINGS },
    budgets: {},        // { categoryId: monthlyLimit }
    templates: [],      // 繰り返し取引テンプレート
    assets: [],         // 資産口座（貯蓄・投資）
    goals: [],          // 貯蓄目標（v5.31）
    subscriptions: [],  // サブスクリプション（v5.43）
    points: [],         // ポイント残高（v5.47）
    wishlist: [],       // ほしいものリスト（v5.51）
    challenges: [],     // 節約チャレンジ（v5.64）
  };
}

function saveData() {
  localStorage.setItem(getStorageKey(), JSON.stringify(appData));
  if (typeof schedulePush === 'function') schedulePush();
}

// グローバルデータ（initAccounts後に設定）
var appData = null;

// ── トランザクション CRUD ─────────────────────────────────
function addTransaction(fields) {
  const t = { ...fields, id: genId() };
  appData.transactions.push(t);
  saveData();
  return t;
}

function updateTransaction(id, fields) {
  const idx = appData.transactions.findIndex(t => t.id === id);
  if (idx >= 0) {
    appData.transactions[idx] = { ...appData.transactions[idx], ...fields };
    saveData();
  }
}

function deleteTransaction(id) {
  appData.transactions = appData.transactions.filter(t => t.id !== id);
  saveData();
}

// ── カテゴリ CRUD ─────────────────────────────────────────
function addCategory(fields) {
  const c = { ...fields, id: genId() };
  appData.categories.push(c);
  saveData();
  return c;
}

function updateCategory(id, fields) {
  const idx = appData.categories.findIndex(c => c.id === id);
  if (idx >= 0) {
    appData.categories[idx] = { ...appData.categories[idx], ...fields };
    saveData();
  }
}

function deleteCategory(id) {
  const fallback = appData.categories.find(c => c.name === 'その他支出') ||
                   appData.categories.find(c => c.name === 'その他収入') ||
                   appData.categories[0];
  appData.transactions.forEach(t => {
    if (t.categoryId === id) t.categoryId = fallback ? fallback.id : '';
  });
  appData.categories = appData.categories.filter(c => c.id !== id);
  saveData();
}

// ── メンバー CRUD ─────────────────────────────────────────
function addMember(fields) {
  const m = { ...fields, id: genId() };
  appData.members.push(m);
  saveData();
  return m;
}

function updateMember(id, fields) {
  const idx = appData.members.findIndex(m => m.id === id);
  if (idx >= 0) {
    appData.members[idx] = { ...appData.members[idx], ...fields };
    saveData();
  }
}

function deleteMember(id) {
  appData.transactions.forEach(t => {
    if (t.memberId === id) t.memberId = '';
  });
  appData.members = appData.members.filter(m => m.id !== id);
  saveData();
}

// ── 設定 ──────────────────────────────────────────────────
function updateSettings(fields) {
  appData.settings = { ...appData.settings, ...fields };
  saveData();
}

// ── 予算管理 ──────────────────────────────────────────────
function getBudget(categoryId) {
  return (appData.budgets || {})[categoryId] || 0;
}

function setBudget(categoryId, amount) {
  if (!appData.budgets) appData.budgets = {};
  if (amount > 0) appData.budgets[categoryId] = amount;
  else delete appData.budgets[categoryId];
  saveData();
}

// ── テンプレート CRUD ──────────────────────────────────────
function addTemplate(fields) {
  if (!appData.templates) appData.templates = [];
  const t = { ...fields, id: genId() };
  appData.templates.push(t);
  saveData();
  return t;
}

function updateTemplate(id, fields) {
  if (!appData.templates) appData.templates = [];
  const idx = appData.templates.findIndex(t => t.id === id);
  if (idx >= 0) {
    appData.templates[idx] = { ...appData.templates[idx], ...fields };
    saveData();
  }
}

function deleteTemplate(id) {
  if (!appData.templates) { appData.templates = []; return; }
  appData.templates = appData.templates.filter(t => t.id !== id);
  saveData();
}

// ── サブスクリプション CRUD（v5.43）──────────────────────────
const SUB_EMOJIS = ['📺','🎵','📱','🎮','📰','☁️','🛒','🏥','🏋️','📚','🎬','🎤','🎧','📡','🎯','💊','🍿','🔧'];
const SUB_COLORS = ['#6366f1','#e50914','#1db954','#0073e6','#f97316','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b','#64748b','#ef4444'];

function getSubscriptions() {
  if (!appData.subscriptions) appData.subscriptions = [];
  return appData.subscriptions;
}

function addSubscription(fields) {
  if (!appData.subscriptions) appData.subscriptions = [];
  const s = { ...fields, id: genId(), createdAt: todayStr() };
  appData.subscriptions.push(s);
  saveData();
  return s;
}

function updateSubscription(id, fields) {
  if (!appData.subscriptions) appData.subscriptions = [];
  const idx = appData.subscriptions.findIndex(s => s.id === id);
  if (idx >= 0) {
    appData.subscriptions[idx] = { ...appData.subscriptions[idx], ...fields };
    saveData();
  }
}

function deleteSubscription(id) {
  if (!appData.subscriptions) { appData.subscriptions = []; return; }
  appData.subscriptions = appData.subscriptions.filter(s => s.id !== id);
  saveData();
}

// 月次換算金額（yearly は÷12）
function subMonthlyAmount(sub) {
  const amt = Number(sub.amount) || 0;
  return sub.cycle === 'yearly' ? Math.round(amt / 12) : amt;
}

// 次回請求日（文字列 YYYY-MM-DD）
function subNextBillingDate(sub) {
  const today = new Date();
  const day = parseInt(sub.billingDay) || 1;
  // 今月の請求日を作成
  let candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate <= today) {
    // 来月へ
    candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
  }
  return candidate.getFullYear() + '-' +
    String(candidate.getMonth() + 1).padStart(2, '0') + '-' +
    String(candidate.getDate()).padStart(2, '0');
}

// 次回請求まで何日
function subDaysUntilBilling(sub) {
  const next = new Date(subNextBillingDate(sub));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((next - today) / 86400000);
}

// 月間サブスク合計（アクティブのみ）
function calcMonthlySubTotal() {
  return getSubscriptions()
    .filter(s => s.isActive !== false)
    .reduce((sum, s) => sum + subMonthlyAmount(s), 0);
}

// ── 貯蓄目標 CRUD（v5.31）─────────────────────────────────
const GOAL_COLORS = ['#6366f1','#059669','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
const GOAL_EMOJIS = ['🎯','✈️','🏠','🚗','💍','🎓','👶','🏖️','💻','🎉','⛰️','🎪'];

function addGoal(fields) {
  if (!appData.goals) appData.goals = [];
  const g = { ...fields, id: genId(), createdAt: todayStr() };
  appData.goals.push(g);
  saveData();
  return g;
}

function updateGoal(id, fields) {
  if (!appData.goals) appData.goals = [];
  const idx = appData.goals.findIndex(g => g.id === id);
  if (idx >= 0) {
    appData.goals[idx] = { ...appData.goals[idx], ...fields };
    saveData();
  }
}

function deleteGoal(id) {
  if (!appData.goals) { appData.goals = []; return; }
  appData.goals = appData.goals.filter(g => g.id !== id);
  saveData();
}

// ── ポイント残高管理 CRUD（v5.47）──────────────────────────
const POINT_EMOJIS = ['🎫','🛒','🚃','💳','🏪','☕','🎮','📱','🛍️','✈️','🏥','⛽','🎬','🍔','🎯','🌸'];
const POINT_COLORS = ['#e50914','#0073e6','#1db954','#f97316','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b','#6366f1','#64748b','#ef4444'];
const POINT_PRESETS = [
  { name: '楽天ポイント',    emoji: '🛒', color: '#e50914', pointValue: 1 },
  { name: 'Tポイント',       emoji: '🏪', color: '#0073e6', pointValue: 1 },
  { name: 'Pontaポイント',   emoji: '🎫', color: '#ef4444', pointValue: 1 },
  { name: 'dポイント',       emoji: '📱', color: '#e50914', pointValue: 1 },
  { name: 'PayPayポイント',  emoji: '💳', color: '#e50914', pointValue: 1 },
  { name: 'nanacoポイント',  emoji: '🏪', color: '#f59e0b', pointValue: 1 },
  { name: 'WAONポイント',    emoji: '🐾', color: '#0073e6', pointValue: 1 },
  { name: 'Suicaポイント',   emoji: '🚃', color: '#10b981', pointValue: 1 },
];

function getPoints() {
  if (!appData.points) appData.points = [];
  return appData.points;
}

function addPoint(fields) {
  if (!appData.points) appData.points = [];
  const p = { ...fields, id: genId(), createdAt: todayStr() };
  appData.points.push(p);
  saveData();
  return p;
}

function updatePoint(id, fields) {
  if (!appData.points) appData.points = [];
  const idx = appData.points.findIndex(p => p.id === id);
  if (idx >= 0) {
    appData.points[idx] = { ...appData.points[idx], ...fields };
    saveData();
  }
}

function deletePoint(id) {
  if (!appData.points) { appData.points = []; return; }
  appData.points = appData.points.filter(p => p.id !== id);
  saveData();
}

// ポイント残高の合計円価値
function calcTotalPointsValue() {
  return getPoints().reduce((sum, p) => sum + Math.round((Number(p.balance) || 0) * (Number(p.pointValue) || 1)), 0);
}

// ポイント期限切れまでの日数
function pointDaysUntilExpiry(p) {
  if (!p.expiryDate) return null;
  const exp = new Date(p.expiryDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / 86400000);
}

// ── 資産管理 CRUD ──────────────────────────────────────────
function addAsset(fields) {
  if (!appData.assets) appData.assets = [];
  const a = { ...fields, id: genId(), entries: fields.entries || [] };
  appData.assets.push(a);
  saveData();
  return a;
}

function updateAsset(id, fields) {
  if (!appData.assets) appData.assets = [];
  const idx = appData.assets.findIndex(a => a.id === id);
  if (idx >= 0) {
    appData.assets[idx] = { ...appData.assets[idx], ...fields };
    saveData();
  }
}

function deleteAsset(id) {
  if (!appData.assets) { appData.assets = []; return; }
  appData.assets = appData.assets.filter(a => a.id !== id);
  saveData();
}

function addAssetEntry(assetId, entry) {
  if (!appData.assets) appData.assets = [];
  const asset = appData.assets.find(a => a.id === assetId);
  if (!asset) return;
  if (!asset.entries) asset.entries = [];
  asset.entries.push({ ...entry, id: genId() });
  saveData();
}

function deleteAssetEntry(assetId, entryId) {
  if (!appData.assets) return;
  const asset = appData.assets.find(a => a.id === assetId);
  if (!asset || !asset.entries) return;
  asset.entries = asset.entries.filter(e => e.id !== entryId);
  saveData();
}

// ── ユーティリティ ────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatMoney(n) {
  return '¥' + Number(n).toLocaleString('ja-JP');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function currentYearMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function getTransactionsByMonth(yearMonth) {
  return appData.transactions.filter(t => t.date && t.date.startsWith(yearMonth));
}

function getCategoryById(id) {
  return appData.categories.find(c => c.id === id) || null;
}

function getMemberById(id) {
  return appData.members.find(m => m.id === id) || null;
}

function calcTotal(transactions, type) {
  return transactions.filter(t => t.type === type).reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

function getAvailableMonths() {
  const months = new Set(appData.transactions.map(t => t.date ? t.date.slice(0, 7) : ''));
  months.delete('');
  const now = currentYearMonth();
  months.add(now);
  return Array.from(months).sort().reverse();
}

function getLast12Months() {
  const result = [];
  const d = new Date();
  for (let i = 11; i >= 0; i--) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
    result.push(dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0'));
  }
  return result;
}

// ── ほしいものリスト CRUD (v5.51) ─────────────────────────
function getWishlistItems(includePurchased = false) {
  const list = appData.wishlist || [];
  return includePurchased ? list : list.filter(w => !w.purchased);
}

function addWishlistItem(fields) {
  const item = { ...fields, id: 'wl_' + genId(), addedDate: todayStr(), purchased: false, purchasedDate: null, purchasedTxId: null };
  if (!appData.wishlist) appData.wishlist = [];
  appData.wishlist.push(item);
  saveData();
  return item;
}

function updateWishlistItem(id, fields) {
  const idx = (appData.wishlist || []).findIndex(w => w.id === id);
  if (idx >= 0) {
    appData.wishlist[idx] = { ...appData.wishlist[idx], ...fields };
    saveData();
  }
}

function deleteWishlistItem(id) {
  appData.wishlist = (appData.wishlist || []).filter(w => w.id !== id);
  saveData();
}

function markWishlistPurchased(id) {
  const item = (appData.wishlist || []).find(w => w.id === id);
  if (!item || item.purchased) return null;
  const tx = addTransaction({
    date: todayStr(),
    type: 'expense',
    categoryId: item.categoryId || '',
    memberId: appData.settings.defaultMemberId || '',
    paymentMethod: '現金',
    amount: item.price || 0,
    taxRate: 0,
    memo: item.name,
  });
  updateWishlistItem(id, { purchased: true, purchasedDate: today(), purchasedTxId: tx.id });
  return tx;
}

// ── 節約チャレンジ CRUD (v5.64) ─────────────────────────────
const CHALLENGE_EMOJIS = ['🏆','💪','🎯','🔥','⚡','🌟','🚀','💰','🍃','🥗','☕','🛒','✂️','🎪','🎲','🎨','🏅','🌈'];
const CHALLENGE_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#64748b','#0d9488'];

function getChallenges() {
  if (!appData.challenges) appData.challenges = [];
  return appData.challenges;
}

function addChallenge(fields) {
  if (!appData.challenges) appData.challenges = [];
  const c = { ...fields, id: 'ch_' + genId(), createdAt: todayStr() };
  appData.challenges.push(c);
  saveData();
  return c;
}

function updateChallenge(id, fields) {
  if (!appData.challenges) appData.challenges = [];
  const idx = appData.challenges.findIndex(c => c.id === id);
  if (idx >= 0) {
    appData.challenges[idx] = { ...appData.challenges[idx], ...fields };
    saveData();
  }
}

function deleteChallenge(id) {
  if (!appData.challenges) { appData.challenges = []; return; }
  appData.challenges = appData.challenges.filter(c => c.id !== id);
  saveData();
}

// チャレンジ進捗を計算して返す
// returns: { actual, target, pct, isOnTrack, label }
function calcChallengeProgress(ch) {
  const txs = appData.transactions.filter(t => t.date && t.date.startsWith(ch.period));
  if (ch.type === 'budget') {
    const filtered = ch.categoryId
      ? txs.filter(t => t.type === 'expense' && t.categoryId === ch.categoryId)
      : txs.filter(t => t.type === 'expense');
    const actual = filtered.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const target = Number(ch.targetAmount) || 1;
    const pct = Math.min(100, Math.round(actual / target * 100));
    return { actual, target, pct, isOnTrack: actual <= target, label: formatMoney(actual) + ' / ' + formatMoney(target) };
  } else { // noSpend
    const [y, m] = ch.period.split('-').map(Number);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && (today.getMonth() + 1) === m;
    const lastDay = isCurrentMonth ? today.getDate() : new Date(y, m, 0).getDate();
    const spendDays = new Set(
      txs
        .filter(t => t.type === 'expense' && (!ch.categoryId || t.categoryId === ch.categoryId))
        .map(t => t.date)
    );
    const noSpendCount = lastDay - spendDays.size;
    const target = Number(ch.targetDays) || 1;
    const pct = Math.min(100, Math.round(noSpendCount / target * 100));
    return { actual: noSpendCount, target, pct, isOnTrack: noSpendCount >= Math.round(target * (today.getDate() / lastDay)), label: `${noSpendCount}日 / ${target}日` };
  }
}

// ── 初期化（必ず最後に実行）────────────────────────────────
initAccounts();
appData = loadData();
