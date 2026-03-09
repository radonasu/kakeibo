// ============================================================
// sync.js - Supabase リアルタイム同期
// ============================================================

let _supabaseClient = null;
let _syncChannel    = null;
let _syncStatus     = 'disconnected'; // disconnected | connecting | connected | error
let _pushTimer      = null;

const PUSH_DEBOUNCE = 2500; // ms
const SYNC_TABLE    = 'household_sync';

function getSyncCfg() {
  return (appData && appData.settings && appData.settings.syncConfig) || {};
}

// ── ステータス管理 ─────────────────────────────────────────
function setSyncStatus(s) {
  _syncStatus = s;
  const STATUS = {
    disconnected: { bg: '#94a3b8', label: '未接続'   },
    connecting:   { bg: '#f59e0b', label: '接続中...' },
    connected:    { bg: '#10b981', label: '同期中'    },
    error:        { bg: '#ef4444', label: 'エラー'    },
  };
  const m = STATUS[s] || STATUS.disconnected;

  // ヘッダーのインジケーター（常時表示）
  const headerDot = document.getElementById('sync-status-dot-header');
  if (headerDot) {
    headerDot.style.background = m.bg;
    headerDot.title = 'クラウド同期: ' + m.label;
  }

  // 設定ページのインジケーター（設定ページ表示中のみ存在）
  const dot = document.getElementById('sync-status-dot');
  const txt = document.getElementById('sync-status-text');
  if (dot) dot.style.background = m.bg;
  if (txt) txt.textContent = m.label;

  // 設定ページの接続/切断ボタン切り替え
  const btnConn = document.getElementById('btn-sync-connect');
  const btnDisc = document.getElementById('btn-sync-disconnect');
  if (btnConn) btnConn.style.display = (s === 'disconnected' || s === 'error') ? '' : 'none';
  if (btnDisc) btnDisc.style.display = (s === 'connected' || s === 'connecting') ? '' : 'none';
}

// 設定ページ描画後にUI再適用
function refreshSyncUI() {
  setSyncStatus(_syncStatus);
}

// ── 接続 ──────────────────────────────────────────────────
async function connectSync() {
  const cfg = getSyncCfg();
  if (!cfg.url || !cfg.anonKey || !cfg.roomCode) {
    alert('Supabase URL・Anon Key・ルームコードをすべて入力してください');
    return;
  }
  if (!window.supabase) {
    alert('Supabase SDKの読み込みに失敗しました。\nインターネット接続を確認して再読み込みしてください。');
    return;
  }

  disconnectSync();
  setSyncStatus('connecting');

  try {
    _supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);

    // リアルタイム購読
    _syncChannel = _supabaseClient
      .channel('kakeibo_' + cfg.roomCode)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: SYNC_TABLE,
        filter: 'sync_id=eq.' + cfg.roomCode,
      }, onRemoteChange)
      .subscribe(status => {
        if (status === 'SUBSCRIBED')    setSyncStatus('connected');
        if (status === 'CHANNEL_ERROR') setSyncStatus('error');
        if (status === 'TIMED_OUT')     setSyncStatus('error');
        if (status === 'CLOSED')        setSyncStatus('disconnected');
      });

    // 初期プル（クラウドの最新データを取得）
    await pullFromCloud();
    showSyncToast('☁️ クラウド同期を開始しました');

  } catch (e) {
    console.error('Sync connect error:', e);
    setSyncStatus('error');
    alert('接続に失敗しました: ' + (e.message || String(e)));
  }
}

function disconnectSync() {
  if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
  if (_syncChannel && _supabaseClient) {
    try { _supabaseClient.removeChannel(_syncChannel); } catch (_) {}
    _syncChannel = null;
  }
  _supabaseClient = null;
  setSyncStatus('disconnected');
}

// ── プル（クラウド → ローカル） ───────────────────────────
async function pullFromCloud() {
  if (!_supabaseClient) return;
  const cfg = getSyncCfg();

  const { data, error } = await _supabaseClient
    .from(SYNC_TABLE)
    .select('data, device_id')
    .eq('sync_id', cfg.roomCode)
    .maybeSingle();

  if (error || !data) return;
  if (data.device_id === getDeviceId()) return; // 自分のデータはスキップ

  applyRemoteData(data.data, '☁️ クラウドから最新データを取得しました');
}

// ── プッシュ（ローカル → クラウド）debounced ─────────────
function schedulePush() {
  if (!_supabaseClient) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(pushToCloud, PUSH_DEBOUNCE);
}

async function pushToCloud() {
  if (!_supabaseClient) return;
  const cfg = getSyncCfg();
  if (!cfg.roomCode) return;

  const payload = {
    transactions: appData.transactions,
    categories:   appData.categories,
    members:      appData.members,
    budgets:      appData.budgets,
    templates:    appData.templates,
    familyName:   appData.settings.familyName,
  };

  const { error } = await _supabaseClient
    .from(SYNC_TABLE)
    .upsert(
      { sync_id: cfg.roomCode, data: payload, device_id: getDeviceId() },
      { onConflict: 'sync_id' }
    );

  if (error) console.warn('Cloud push failed:', error.message);
}

// ── リモート変更ハンドラ ───────────────────────────────────
function onRemoteChange(payload) {
  const row = payload.new;
  if (!row) return;
  if (row.device_id === getDeviceId()) return; // 自分の更新は無視
  if (!row.data) return;

  const name = row.data.familyName || '家族';
  applyRemoteData(row.data, '🔄 ' + name + 'から同期しました');
}

function applyRemoteData(d, toastMsg) {
  if (!d) return;
  if (d.transactions) appData.transactions = d.transactions;
  if (d.categories)   appData.categories   = d.categories;
  if (d.members)      appData.members      = d.members;
  if (d.budgets)      appData.budgets      = d.budgets;
  if (d.templates)    appData.templates    = d.templates;

  // localStorageへ直接書き込み（saveData()呼出しによるループを防ぐ）
  localStorage.setItem(getStorageKey(), JSON.stringify(appData));

  if (toastMsg) showSyncToast(toastMsg);
  if (typeof updateSidebarTitle === 'function') updateSidebarTitle();
  if (typeof renderCurrentPage  === 'function') renderCurrentPage();
}

// ── ユーティリティ ────────────────────────────────────────
function getDeviceId() {
  let id = localStorage.getItem('kakeibo_device_id');
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    localStorage.setItem('kakeibo_device_id', id);
  }
  return id;
}

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
function initSync() {
  const cfg = getSyncCfg();
  if (cfg.enabled && cfg.url && cfg.anonKey && cfg.roomCode) {
    connectSync();
  }
}
