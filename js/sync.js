// ============================================================
// sync.js - Supabase Auth + リアルタイム同期 v5
// ============================================================

let _supabaseClient = null;
let _syncChannel    = null;
let _authSession    = null;
let _syncStatus     = 'disconnected';
let _pushTimer      = null;

const PUSH_DEBOUNCE = 2500;
const SYNC_TABLE    = 'household_data';

// ── 設定取得 ────────────────────────────────────────────────
function getSyncCfg() {
  return (appData && appData.settings && appData.settings.syncConfig) || {};
}

function isSyncConfigured() {
  const cfg = getSyncCfg();
  return !!(cfg.url && cfg.anonKey);
}

function getCurrentUser() {
  return _authSession ? _authSession.user : null;
}

function isLoggedIn() {
  return !!getCurrentUser();
}

// ── Supabaseクライアント取得（遅延初期化）──────────────────
function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  const cfg = getSyncCfg();
  if (!cfg.url || !cfg.anonKey || !window.supabase) return null;
  try {
    _supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (e) {
    console.error('[sync] クライアント初期化失敗:', e);
    return null;
  }
  return _supabaseClient;
}

// 設定変更時にクライアントをリセット
function resetSupabaseClient() {
  if (_syncChannel && _supabaseClient) {
    try { _supabaseClient.removeChannel(_syncChannel); } catch (_) {}
    _syncChannel = null;
  }
  _supabaseClient = null;
  _authSession    = null;
  setSyncStatus('disconnected');
  if (typeof renderSidebarUser === 'function') renderSidebarUser();
}

// ── ステータス管理 ─────────────────────────────────────────
function setSyncStatus(s) {
  _syncStatus = s;
  const STATUS = {
    disconnected: { bg: '#94a3b8', label: '未接続' },
    connecting:   { bg: '#f59e0b', label: '接続中...' },
    connected:    { bg: '#10b981', label: '同期中' },
    error:        { bg: '#ef4444', label: 'エラー' },
  };
  const m = STATUS[s] || STATUS.disconnected;

  const headerDot = document.getElementById('sync-status-dot-header');
  if (headerDot) {
    headerDot.style.background = m.bg;
    headerDot.title = 'クラウド同期: ' + m.label;
  }
  const dot = document.getElementById('sync-status-dot');
  const txt = document.getElementById('sync-status-text');
  if (dot) dot.style.background = m.bg;
  if (txt) txt.textContent = m.label;
}

function refreshSyncUI() {
  setSyncStatus(_syncStatus);
  const emailEl = document.getElementById('sync-user-email');
  if (emailEl) {
    const user = getCurrentUser();
    emailEl.textContent = user ? user.email : '';
  }
  const avatarEl = document.getElementById('sync-user-avatar');
  if (avatarEl) {
    const user = getCurrentUser();
    avatarEl.textContent = user ? user.email[0].toUpperCase() : '?';
  }
  const loggedInfo  = document.getElementById('sync-logged-info');
  const loginPrompt = document.getElementById('sync-login-prompt');
  if (isLoggedIn()) {
    if (loggedInfo)  loggedInfo.style.display  = '';
    if (loginPrompt) loginPrompt.style.display = 'none';
  } else {
    if (loggedInfo)  loggedInfo.style.display  = 'none';
    if (loginPrompt) loginPrompt.style.display = '';
  }
}

// ── 認証 ───────────────────────────────────────────────────
async function authSignUp(email, password) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase未設定');
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (data.session) {
    _authSession = data.session;
    await onAuthSuccess();
  }
  return data;
}

async function authSignIn(email, password) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase未設定');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  _authSession = data.session;
  await onAuthSuccess();
  return data;
}

async function authSignOut() {
  const client = getSupabaseClient();
  if (client) {
    if (_syncChannel) {
      try { client.removeChannel(_syncChannel); } catch (_) {}
      _syncChannel = null;
    }
    try { await client.auth.signOut(); } catch (_) {}
  }
  _authSession = null;
  setSyncStatus('disconnected');
  if (typeof renderSidebarUser === 'function') renderSidebarUser();
  refreshSyncUI();
}

async function onAuthSuccess() {
  setSyncStatus('connecting');
  subscribeToChanges();
  await pullFromCloud();
  setSyncStatus('connected');
  if (typeof renderSidebarUser === 'function') renderSidebarUser();
  refreshSyncUI();
  showSyncToast('✅ ログインしました');
}

// ── リアルタイム購読 ───────────────────────────────────────
function subscribeToChanges() {
  const client = getSupabaseClient();
  if (!client || !_authSession) return;

  if (_syncChannel) {
    try { client.removeChannel(_syncChannel); } catch (_) {}
  }

  const userId = _authSession.user.id;
  _syncChannel = client
    .channel('user_data_' + userId.slice(0, 8))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: SYNC_TABLE,
      filter: 'user_id=eq.' + userId,
    }, onRemoteChange)
    .subscribe(status => {
      if (status === 'SUBSCRIBED')    setSyncStatus('connected');
      if (status === 'CHANNEL_ERROR') setSyncStatus('error');
      if (status === 'TIMED_OUT')     setSyncStatus('error');
      if (status === 'CLOSED')        setSyncStatus('disconnected');
    });
}

// ── プル（クラウド → ローカル）────────────────────────────
async function pullFromCloud() {
  const client = getSupabaseClient();
  if (!client || !_authSession) return;

  const userId = _authSession.user.id;
  const { data, error } = await client
    .from(SYNC_TABLE)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) { console.warn('[sync] pull error:', error.message); return; }
  if (!data || !data.data) return;
  applyRemoteData(data.data, null);
}

// ── プッシュ（ローカル → クラウド）────────────────────────
function schedulePush() {
  const client = getSupabaseClient();
  if (!client || !_authSession) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(pushToCloud, PUSH_DEBOUNCE);
}

async function pushToCloud() {
  const client = getSupabaseClient();
  if (!client || !_authSession) return;

  const userId = _authSession.user.id;
  const payload = {
    transactions: appData.transactions,
    categories:   appData.categories,
    members:      appData.members,
    budgets:      appData.budgets,
    templates:    appData.templates,
    familyName:   appData.settings.familyName,
  };

  const { error } = await client
    .from(SYNC_TABLE)
    .upsert(
      { user_id: userId, data: payload, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) console.warn('[sync] push error:', error.message);
}

// ── リモート変更ハンドラ ───────────────────────────────────
function onRemoteChange(payload) {
  const row = payload.new;
  if (!row || !row.data) return;
  applyRemoteData(row.data, '🔄 データを同期しました');
}

function applyRemoteData(d, toastMsg) {
  if (!d) return;
  if (d.transactions) appData.transactions = d.transactions;
  if (d.categories)   appData.categories   = d.categories;
  if (d.members)      appData.members      = d.members;
  if (d.budgets)      appData.budgets      = d.budgets;
  if (d.templates)    appData.templates    = d.templates;

  // saveData() を呼ばず直接書き込み（無限ループ防止）
  try { localStorage.setItem(getStorageKey(), JSON.stringify(appData)); } catch (e) {}

  if (toastMsg) showSyncToast(toastMsg);
  if (typeof updateSidebarTitle === 'function') updateSidebarTitle();
  if (typeof renderCurrentPage  === 'function') renderCurrentPage();
}

// ── トースト通知 ───────────────────────────────────────────
function showSyncToast(msg) {
  let el = document.getElementById('sync-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-toast';
    el.className = 'sync-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── 初期化 ────────────────────────────────────────────────
async function initSync() {
  if (!isSyncConfigured()) return;

  const client = getSupabaseClient();
  if (!client) return;

  setSyncStatus('connecting');

  try {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      _authSession = session;
      await onAuthSuccess();
    } else {
      setSyncStatus('disconnected');
      if (typeof showAuthScreen === 'function') showAuthScreen();
    }
  } catch (e) {
    console.error('[sync] session restore failed:', e);
    setSyncStatus('error');
  }
}
