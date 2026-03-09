// ============================================================
// data.js - データ管理 (localStorage) + マルチアカウント対応
// ============================================================

const ACCOUNTS_META_KEY  = 'kakeibo_accounts_v1';
const ACTIVE_ACCOUNT_KEY = 'kakeibo_active_v1';
const OLD_STORAGE_KEY    = 'kakeibo_v1'; // 旧キー（移行用）

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
  claudeApiKey: '',
  syncConfig: { url: '', anonKey: '', roomCode: '', enabled: false },
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
    if (!data.settings.claudeApiKey) data.settings.claudeApiKey = '';
    if (!data.settings.syncConfig)   data.settings.syncConfig   = { url: '', anonKey: '', roomCode: '', enabled: false };
    if (!data.budgets)   data.budgets = {};
    if (!data.templates) data.templates = [];
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
    budgets: {},     // { categoryId: monthlyLimit }
    templates: [],   // 繰り返し取引テンプレート
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

// ── 初期化（必ず最後に実行）────────────────────────────────
initAccounts();
appData = loadData();
