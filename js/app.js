// ============================================================
// app.js - メインアプリ（ルーティング・ページ描画）
// ============================================================

// ── アプリ状態 ─────────────────────────────────────────────
const appState = {
  page: 'dashboard',
  month: currentYearMonth(),
  txFilter: { category: '', member: '', search: '', type: '' },
  editingTxId: null,
  templateData: null,  // テンプレートからの入力時に使用
  reportYear: new Date().getFullYear(),
};

// ============================================================
// アカウント切替UI
// ============================================================
function renderAccountBar() {
  const bar = document.getElementById('account-bar');
  if (!bar) return;

  const accs = getAllAccounts();
  const cur  = getCurrentAccount();

  const opts = accs.map(a =>
    `<option value="${a.id}" ${a.id === currentAccountId ? 'selected' : ''}>${esc2(a.name)}</option>`
  ).join('');

  bar.innerHTML = `
    <div class="account-switcher">
      <select id="account-select" class="account-select" title="アカウント切替">${opts}</select>
      <button class="btn-account-add" id="btn-add-account" title="アカウント追加">＋</button>
    </div>`;

  document.getElementById('account-select').addEventListener('change', e => {
    switchAccount(e.target.value);
    updateSidebarTitle();
    renderAccountBar();
    navigate('dashboard');
  });

  document.getElementById('btn-add-account').addEventListener('click', () => {
    const name = prompt('新しいアカウント名を入力してください\n（例：田中家、父の事業）', '');
    if (name && name.trim()) {
      createAccount(name.trim());
      switchAccount(getAllAccounts().at(-1).id);
      updateSidebarTitle();
      renderAccountBar();
      navigate('dashboard');
    }
  });
}

function updateSidebarTitle() {
  const el = document.getElementById('sidebar-title');
  if (el) el.textContent = appData.settings.familyName;
  const mob = document.getElementById('mobile-title');
  if (mob) mob.textContent = appData.settings.familyName;
}

// ── ナビゲーション ─────────────────────────────────────────
function navigate(page) {
  appState.page = page;
  // サイドバーナビ同期
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // ボトムナビ同期
  document.querySelectorAll('.bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderCurrentPage();
  // モバイルサイドバーを閉じる
  document.getElementById('sidebar').classList.remove('open');
}

function renderCurrentPage() {
  const main = document.getElementById('main-content');
  switch (appState.page) {
    case 'dashboard':    main.innerHTML = renderDashboard(); bindDashboard(); break;
    case 'transactions': main.innerHTML = renderTransactions(); bindTransactions(); break;
    case 'reports':      main.innerHTML = renderReports(); bindReports(); break;
    case 'categories':   main.innerHTML = renderCategories(); bindCategories(); break;
    case 'settings':     main.innerHTML = renderSettings(); bindSettings(); break;
  }
}

// ============================================================
// ダッシュボード
// ============================================================
function renderDashboard() {
  const txs = getTransactionsByMonth(appState.month);
  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');
  const balance = income - expense;

  // 予算進捗セクション
  const budgets = appData.budgets || {};
  const budgetItems = appData.categories
    .filter(c => c.type === 'expense' && budgets[c.id] > 0)
    .map(c => {
      const budget = budgets[c.id];
      const spent  = txs.filter(t => t.categoryId === c.id && t.type === 'expense')
                        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const pct  = Math.min(Math.round(spent / budget * 100), 100);
      const over = spent > budget;
      const cls  = over ? 'over' : pct >= 80 ? 'warn' : '';
      return `<div class="budget-item">
        <div class="budget-item-hdr">
          <span class="budget-cat-name"><span class="color-dot" style="background:${c.color}"></span>${esc2(c.name)}</span>
          <span class="budget-nums ${over ? 'over' : ''}">${formatMoney(spent)}<span class="budget-sep"> / </span>${formatMoney(budget)}</span>
        </div>
        <div class="budget-track"><div class="budget-fill ${cls}" style="width:${pct}%"></div></div>
        ${over ? `<div class="budget-over-msg">⚠️ ${formatMoney(spent - budget)} 超過</div>` : ''}
      </div>`;
    });
  const budgetSection = budgetItems.length > 0 ? `
<div class="card">
  <div class="card-header-row">
    <h3 class="card-title">📊 今月の予算</h3>
    <button class="btn-link" onclick="navigate('categories')">予算設定 →</button>
  </div>
  <div class="budget-grid">${budgetItems.join('')}</div>
</div>` : '';

  // 先月比
  const [y, m] = appState.month.split('-');
  const prevD = new Date(Number(y), Number(m) - 2, 1);
  const prevMonth = prevD.getFullYear() + '-' + String(prevD.getMonth() + 1).padStart(2, '0');
  const prevTxs = getTransactionsByMonth(prevMonth);
  const prevIncome  = calcTotal(prevTxs, 'income');
  const prevExpense = calcTotal(prevTxs, 'expense');

  const diffSign = (v, prev) => {
    if (prev === 0) return '';
    const pct = Math.round((v - prev) / prev * 100);
    const cls = pct >= 0 ? 'up' : 'down';
    return `<span class="diff ${cls}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
  };

  // 最近10件
  const recent = [...appData.transactions]
    .filter(t => t.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const recentRows = recent.map(t => {
    const cat = getCategoryById(t.categoryId);
    const mem = getMemberById(t.memberId);
    const isIncome = t.type === 'income';
    return `<tr>
      <td>${formatDate(t.date)}</td>
      <td><span class="cat-badge" style="background:${cat ? cat.color : '#6b7280'}20;color:${cat ? cat.color : '#6b7280'}">${cat ? cat.name : '—'}</span></td>
      <td class="memo-cell">${esc2(t.memo || '—')}</td>
      <td>${mem ? mem.name : '—'}</td>
      <td class="amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatMoney(t.amount)}</td>
    </tr>`;
  }).join('');

  // 月セレクター
  const monthSel = monthSelector('dash-month', appState.month);

  return `
<div class="page-header">
  <h1 class="page-title">${esc2(appData.settings.familyName)}</h1>
  ${monthSel}
</div>

<div class="summary-cards">
  <div class="card summary-card income">
    <div class="summary-label">今月の収入</div>
    <div class="summary-amount">${formatMoney(income)}</div>
    ${diffSign(income, prevIncome)}
  </div>
  <div class="card summary-card expense">
    <div class="summary-label">今月の支出</div>
    <div class="summary-amount">${formatMoney(expense)}</div>
    ${diffSign(expense, prevExpense)}
  </div>
  <div class="card summary-card balance ${balance >= 0 ? 'positive' : 'negative'}">
    <div class="summary-label">今月の残高</div>
    <div class="summary-amount">${formatMoney(balance)}</div>
  </div>
</div>

${budgetSection}

<div class="charts-row">
  <div class="card chart-card">
    <h3 class="card-title">支出カテゴリ</h3>
    <div class="chart-wrap" style="height:220px">
      <canvas id="donut-expense"></canvas>
    </div>
  </div>
  <div class="card chart-card">
    <h3 class="card-title">月別収支（12ヶ月）</h3>
    <div class="chart-wrap" style="height:220px">
      <canvas id="monthly-bar"></canvas>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header-row">
    <h3 class="card-title">最近の取引</h3>
    <button class="btn-link" onclick="navigate('transactions')">すべて見る →</button>
  </div>
  <div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>日付</th><th>カテゴリ</th><th>摘要</th><th>担当者</th><th>金額</th></tr></thead>
      <tbody>${recentRows || '<tr><td colspan="5" class="empty">取引がありません</td></tr>'}</tbody>
    </table>
  </div>
</div>`;
}

function bindDashboard() {
  // 月セレクター
  const sel = document.getElementById('dash-month');
  if (sel) sel.addEventListener('change', e => {
    appState.month = e.target.value;
    renderCurrentPage();
  });
  // グラフ描画（少し遅延させてDOMが確定してから）
  setTimeout(() => {
    const txs = getTransactionsByMonth(appState.month);
    renderDonutChart('donut-expense', txs, 'expense');
    renderMonthlyBarChart('monthly-bar');
  }, 50);
}

// ============================================================
// 収支一覧
// ============================================================
function renderTransactions() {
  const f = appState.txFilter;

  let txs = appData.transactions.filter(t => {
    if (!t.date) return false;
    if (!t.date.startsWith(appState.month)) return false;
    if (f.category && t.categoryId !== f.category) return false;
    if (f.member && t.memberId !== f.member) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const cat = getCategoryById(t.categoryId);
      const mem = getMemberById(t.memberId);
      const haystack = [(t.memo || ''), (cat ? cat.name : ''), (mem ? mem.name : '')].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');

  // カテゴリ選択肢
  const catOptions = `<option value="">カテゴリ: 全て</option>` +
    appData.categories.map(c => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${esc2(c.name)}</option>`).join('');

  // メンバー選択肢
  const memOptions = `<option value="">担当者: 全員</option>` +
    appData.members.map(m => `<option value="${m.id}" ${f.member === m.id ? 'selected' : ''}>${esc2(m.name)}</option>`).join('');

  const rows = txs.map(t => {
    const cat = getCategoryById(t.categoryId);
    const mem = getMemberById(t.memberId);
    const isIncome = t.type === 'income';
    return `<tr data-id="${t.id}">
      <td>${formatDate(t.date)}</td>
      <td><span class="cat-badge" style="background:${cat ? cat.color : '#6b7280'}20;color:${cat ? cat.color : '#6b7280'}">${cat ? esc2(cat.name) : '—'}</span></td>
      <td class="memo-cell">${esc2(t.memo || '—')}</td>
      <td>${esc2(t.paymentMethod || '—')}</td>
      <td>${mem ? esc2(mem.name) : '—'}</td>
      <td class="amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatMoney(t.amount)}</td>
      <td class="actions">
        <button class="btn-icon edit-tx" data-id="${t.id}" title="編集">✏️</button>
        <button class="btn-icon delete-tx" data-id="${t.id}" title="削除">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  // テンプレートクイックアクセスバー
  const templates = appData.templates || [];
  const templateBar = templates.length > 0 ? `
<div class="card template-bar">
  <span class="template-bar-label">⚡</span>
  <div class="template-list">
    ${templates.map(tpl => {
      const cat = getCategoryById(tpl.categoryId);
      const col = cat ? cat.color : '#6b7280';
      return `<button class="btn-tpl" data-tid="${tpl.id}" style="border-color:${col};color:${col}">${esc2(tpl.name)}</button>`;
    }).join('')}
  </div>
</div>` : '';

  return `
<div class="page-header">
  <h1 class="page-title">収支一覧</h1>
  <button class="btn btn-primary" id="open-add-modal">＋ 追加</button>
</div>

${templateBar}

<div class="card filter-bar">
  ${monthSelector('tx-month', appState.month)}
  <select id="filter-cat">${catOptions}</select>
  <select id="filter-mem">${memOptions}</select>
  <select id="filter-type">
    <option value="">種別: 全て</option>
    <option value="income" ${f.type === 'income' ? 'selected' : ''}>収入のみ</option>
    <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>支出のみ</option>
  </select>
  <input id="filter-search" type="search" placeholder="検索…" value="${esc2(f.search)}" class="filter-search">
</div>

<div class="card summary-mini">
  <span class="income">収入 ${formatMoney(income)}</span>
  <span class="sep">|</span>
  <span class="expense">支出 ${formatMoney(expense)}</span>
  <span class="sep">|</span>
  <span class="${income - expense >= 0 ? 'income' : 'expense'}">残高 ${formatMoney(income - expense)}</span>
  <span class="count">${txs.length}件</span>
</div>

<div class="card">
  <div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>日付</th><th>カテゴリ</th><th>摘要</th><th>支払方法</th><th>担当者</th><th>金額</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty">取引がありません</td></tr>'}</tbody>
    </table>
  </div>
</div>

${renderTxModal()}`;
}

function bindTransactions() {
  // 月
  on('tx-month', 'change', e => { appState.month = e.target.value; renderCurrentPage(); });
  // フィルター
  on('filter-cat',    'change', e => { appState.txFilter.category = e.target.value; renderCurrentPage(); });
  on('filter-mem',    'change', e => { appState.txFilter.member   = e.target.value; renderCurrentPage(); });
  on('filter-type',   'change', e => { appState.txFilter.type     = e.target.value; renderCurrentPage(); });
  on('filter-search', 'input',  e => { appState.txFilter.search   = e.target.value; renderCurrentPage(); });
  // 追加ボタン
  on('open-add-modal', 'click', () => openTxModal(null));
  // 編集・削除
  document.querySelectorAll('.edit-tx').forEach(btn => {
    btn.addEventListener('click', () => openTxModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-tx').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('この取引を削除しますか？')) {
        deleteTransaction(btn.dataset.id);
        renderCurrentPage();
      }
    });
  });
  // テンプレートクイックアクセス
  document.querySelectorAll('.btn-tpl').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpl = (appData.templates || []).find(t => t.id === btn.dataset.tid);
      if (tpl) openTxModal(null, tpl);
    });
  });
  // モーダルバインド
  bindTxModal();
}

// ── 収支入力モーダル ──────────────────────────────────────
function renderTxModal() {
  const isEdit = !!appState.editingTxId;
  const t   = isEdit ? appData.transactions.find(t => t.id === appState.editingTxId) : null;
  const tpl = !isEdit ? appState.templateData : null;  // テンプレートデータ
  const src = t || tpl;  // 値の取得元（編集中の取引 or テンプレート）
  const type = src ? src.type : 'expense';

  const catOptions = (forType) => appData.categories
    .filter(c => c.type === forType)
    .map(c => `<option value="${c.id}" ${src && src.categoryId === c.id ? 'selected' : ''}>${esc2(c.name)}</option>`)
    .join('');

  const memOptions = appData.members
    .map(m => `<option value="${m.id}" ${src && src.memberId === m.id ? 'selected' : !src && m.id === appData.settings.defaultMemberId ? 'selected' : ''}>${esc2(m.name)}</option>`)
    .join('');

  const modalTitle = isEdit ? '取引を編集' : tpl ? `⚡ ${esc2(tpl.name)}` : '収支を追加';

  return `
<div id="tx-modal" class="modal-overlay" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h2>${modalTitle}</h2>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="receipt-scan-area">
        <button class="btn btn-receipt" id="receipt-scan-btn" type="button">
          📷 レシートから読み込む
        </button>
        <label class="btn btn-receipt-file" id="receipt-file-label" title="ファイルから選択">
          🖼️
          <input type="file" id="receipt-file-input" accept="image/*" style="display:none">
        </label>
        <div id="scan-result" class="scan-result" style="display:none"></div>
      </div>
      <div class="type-toggle">
        <button class="type-btn ${type === 'expense' ? 'active expense-btn' : ''}" data-type="expense">支出</button>
        <button class="type-btn ${type === 'income' ? 'active income-btn' : ''}" data-type="income">収入</button>
      </div>
      <div class="form-group">
        <label>日付</label>
        <input type="date" id="tx-date" value="${t ? t.date : todayStr()}" required>
      </div>
      <div class="form-group">
        <label>金額（円）</label>
        <input type="number" id="tx-amount" value="${src ? src.amount : ''}" placeholder="0" min="1" required>
      </div>
      <div class="form-group">
        <label>カテゴリ
          <button type="button" class="btn-inline-add" id="btn-quick-cat" title="カテゴリを今すぐ追加">＋ 新規追加</button>
        </label>
        <select id="tx-category">
          <option value="">選択してください</option>
          <optgroup label="支出" id="cat-expense-group">${catOptions('expense')}</optgroup>
          <optgroup label="収入" id="cat-income-group">${catOptions('income')}</optgroup>
        </select>
        <div id="quick-cat-form" class="quick-cat-form" style="display:none">
          <input type="text" id="qcat-name" placeholder="カテゴリ名（例: 外食費）">
          <input type="text" id="qcat-yayoi" placeholder="弥生科目（例: 食料品費）">
          <button type="button" class="btn btn-primary btn-sm" id="qcat-save">追加</button>
          <button type="button" class="btn btn-ghost btn-sm" id="qcat-cancel">キャンセル</button>
        </div>
      </div>
      <div class="form-group">
        <label>支払方法</label>
        <select id="tx-payment">
          ${['現金','クレカ','口座振替','銀行振込','電子マネー','その他'].map(p =>
            `<option value="${p}" ${src && src.paymentMethod === p ? 'selected' : !src && p === '現金' ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>担当者</label>
        <select id="tx-member"><option value="">—</option>${memOptions}</select>
      </div>
      <div class="form-group">
        <label>消費税率（青色申告用）</label>
        <select id="tx-tax">
          <option value="0"  ${!src || src.taxRate == 0  ? 'selected' : ''}>対象外（0%）</option>
          <option value="10" ${src && src.taxRate == 10  ? 'selected' : ''}>課税 10%</option>
          <option value="8"  ${src && src.taxRate == 8   ? 'selected' : ''}>課税 8%（軽減）</option>
        </select>
      </div>
      <div class="form-group">
        <label>摘要（メモ）</label>
        <input type="text" id="tx-memo" value="${esc2(src ? src.memo : '')}" placeholder="例: スーパーでの買い物">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="modal-save">保存</button>
    </div>
  </div>
</div>`;
}

function openTxModal(id, template) {
  appState.editingTxId = id || null;
  appState.templateData = template || null;
  // モーダルを再描画
  const existing = document.getElementById('tx-modal');
  if (existing) existing.remove();
  document.getElementById('main-content').insertAdjacentHTML('beforeend', renderTxModal());
  bindTxModal();
  document.getElementById('tx-modal').style.display = 'flex';
  // タイプボタンによるカテゴリ表示切替
  updateCatGroups();
}

function bindTxModal() {
  const modal = document.getElementById('tx-modal');
  if (!modal) return;

  on('modal-close',  'click', closeTxModal);
  on('modal-cancel', 'click', closeTxModal);

  // オーバーレイクリックで閉じる
  modal.addEventListener('click', e => { if (e.target === modal) closeTxModal(); });

  // タイプ切替
  modal.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active','expense-btn','income-btn'));
      btn.classList.add('active', btn.dataset.type === 'expense' ? 'expense-btn' : 'income-btn');
      updateCatGroups();
    });
  });

  // 保存
  on('modal-save', 'click', saveTxFromModal);

  // クイックカテゴリ追加
  on('btn-quick-cat', 'click', () => {
    const form = document.getElementById('quick-cat-form');
    if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
  });
  on('qcat-cancel', 'click', () => {
    const form = document.getElementById('quick-cat-form');
    if (form) form.style.display = 'none';
  });
  on('qcat-save', 'click', () => {
    const modal  = document.getElementById('tx-modal');
    const name   = document.getElementById('qcat-name')?.value.trim();
    const yayoi  = document.getElementById('qcat-yayoi')?.value.trim();
    const activeType = modal?.querySelector('.type-btn.active')?.dataset.type || 'expense';
    if (!name) { alert('カテゴリ名を入力してください'); return; }
    const newCat = addCategory({
      name, yayoiAccount: yayoi || name, type: activeType,
      color: activeType === 'expense' ? '#6b7280' : '#059669',
    });
    // セレクトボックスに追加して選択
    const group  = document.getElementById(activeType === 'expense' ? 'cat-expense-group' : 'cat-income-group');
    const opt    = document.createElement('option');
    opt.value = newCat.id; opt.textContent = name; opt.selected = true;
    if (group) group.appendChild(opt);
    document.getElementById('quick-cat-form').style.display = 'none';
    document.getElementById('qcat-name').value  = '';
    document.getElementById('qcat-yayoi').value = '';
  });

  // レシートスキャン（カメラ）
  on('receipt-scan-btn', 'click', () => {
    if (!checkApiKey()) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment'); // モバイルでカメラ起動
    input.addEventListener('change', e => {
      if (e.target.files[0]) processReceiptImage(e.target.files[0]);
    });
    input.click();
  });

  // レシートスキャン（ファイル選択）
  on('receipt-file-input', 'change', e => {
    if (!checkApiKey()) return;
    if (e.target.files[0]) processReceiptImage(e.target.files[0]);
  });
}

function updateCatGroups() {
  const modal = document.getElementById('tx-modal');
  if (!modal) return;
  const activeType = modal.querySelector('.type-btn.active')?.dataset.type || 'expense';
  const expG = document.getElementById('cat-expense-group');
  const incG = document.getElementById('cat-income-group');
  const catSel = document.getElementById('tx-category');
  if (!expG || !incG || !catSel) return;

  if (activeType === 'expense') {
    expG.style.display = '';
    incG.style.display = 'none';
    // 収入カテゴリが選択されていたらリセット
    const selOpt = catSel.options[catSel.selectedIndex];
    if (selOpt && selOpt.parentElement === incG) catSel.value = '';
  } else {
    expG.style.display = 'none';
    incG.style.display = '';
    const selOpt = catSel.options[catSel.selectedIndex];
    if (selOpt && selOpt.parentElement === expG) catSel.value = '';
  }
}

function closeTxModal() {
  const modal = document.getElementById('tx-modal');
  if (modal) modal.style.display = 'none';
  appState.editingTxId = null;
}

function saveTxFromModal() {
  const modal = document.getElementById('tx-modal');
  const type    = modal.querySelector('.type-btn.active')?.dataset.type || 'expense';
  const date    = document.getElementById('tx-date')?.value;
  const amount  = Number(document.getElementById('tx-amount')?.value);
  const catId   = document.getElementById('tx-category')?.value;
  const payment = document.getElementById('tx-payment')?.value;
  const memId   = document.getElementById('tx-member')?.value;
  const taxRate = Number(document.getElementById('tx-tax')?.value);
  const memo    = document.getElementById('tx-memo')?.value;

  if (!date)   { alert('日付を入力してください'); return; }
  if (!amount || amount <= 0) { alert('金額を入力してください'); return; }
  if (!catId)  { alert('カテゴリを選択してください'); return; }

  const fields = { type, date, amount, categoryId: catId, paymentMethod: payment, memberId: memId, taxRate, memo };

  if (appState.editingTxId) {
    updateTransaction(appState.editingTxId, fields);
  } else {
    addTransaction(fields);
  }

  closeTxModal();
  // 一覧に月が合わせてあることを確認
  appState.month = date.slice(0, 7);
  renderCurrentPage();
}

// ============================================================
// レポート
// ============================================================
function renderReports() {
  const year = appState.reportYear;
  const months12 = [];
  for (let m = 1; m <= 12; m++) {
    months12.push(`${year}-${String(m).padStart(2,'0')}`);
  }

  const rows = months12.map(ym => {
    const txs = getTransactionsByMonth(ym);
    const income  = calcTotal(txs, 'income');
    const expense = calcTotal(txs, 'expense');
    const balance = income - expense;
    const mo = parseInt(ym.split('-')[1]);
    return `<tr>
      <td>${mo}月</td>
      <td class="income">${income ? formatMoney(income) : '—'}</td>
      <td class="expense">${expense ? formatMoney(expense) : '—'}</td>
      <td class="${balance >= 0 ? 'income' : 'expense'}">${formatMoney(balance)}</td>
    </tr>`;
  }).join('');

  const allTxs = appData.transactions.filter(t => t.date && t.date.startsWith(String(year)));
  const totalIncome  = calcTotal(allTxs, 'income');
  const totalExpense = calcTotal(allTxs, 'expense');

  return `
<div class="page-header">
  <h1 class="page-title">レポート</h1>
  <div class="year-nav">
    <button class="btn btn-ghost btn-sm" id="prev-year">＜</button>
    <span class="year-label">${year}年</span>
    <button class="btn btn-ghost btn-sm" id="next-year">＞</button>
  </div>
</div>

<div class="summary-cards">
  <div class="card summary-card income">
    <div class="summary-label">${year}年 年間収入</div>
    <div class="summary-amount">${formatMoney(totalIncome)}</div>
  </div>
  <div class="card summary-card expense">
    <div class="summary-label">${year}年 年間支出</div>
    <div class="summary-amount">${formatMoney(totalExpense)}</div>
  </div>
  <div class="card summary-card balance ${totalIncome - totalExpense >= 0 ? 'positive' : 'negative'}">
    <div class="summary-label">年間残高</div>
    <div class="summary-amount">${formatMoney(totalIncome - totalExpense)}</div>
  </div>
</div>

<div class="charts-row">
  <div class="card chart-card">
    <h3 class="card-title">月別収支</h3>
    <div class="chart-wrap" style="height:240px">
      <canvas id="report-bar"></canvas>
    </div>
  </div>
  <div class="card chart-card">
    <h3 class="card-title">支出カテゴリ（年間）</h3>
    <div class="chart-wrap" style="height:240px">
      <canvas id="report-donut"></canvas>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header-row">
    <h3 class="card-title">月別収支表</h3>
    <button class="btn btn-ghost btn-sm" id="export-year-csv">年間CSVダウンロード</button>
  </div>
  <div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>月</th><th>収入</th><th>支出</th><th>残高</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td>合計</td>
          <td class="income">${formatMoney(totalIncome)}</td>
          <td class="expense">${formatMoney(totalExpense)}</td>
          <td class="${totalIncome - totalExpense >= 0 ? 'income' : 'expense'}">${formatMoney(totalIncome - totalExpense)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>

<div class="charts-row">
  <div class="card" style="flex:1">
    <h3 class="card-title">支出カテゴリ詳細</h3>
    <div class="chart-wrap" style="height:300px">
      <canvas id="report-cat-expense"></canvas>
    </div>
  </div>
</div>`;
}

function bindReports() {
  on('prev-year', 'click', () => { appState.reportYear--; renderCurrentPage(); });
  on('next-year', 'click', () => { appState.reportYear++; renderCurrentPage(); });

  on('export-year-csv', 'click', () => {
    const year = appState.reportYear;
    const txs = appData.transactions.filter(t => t.date && t.date.startsWith(String(year)));
    doExportCSV(txs);
  });

  const year = appState.reportYear;
  const months12 = [];
  for (let m = 1; m <= 12; m++) months12.push(`${year}-${String(m).padStart(2,'0')}`);
  const allTxs = appData.transactions.filter(t => t.date && t.date.startsWith(String(year)));

  setTimeout(() => {
    renderBalanceLineChart('report-bar', months12);
    renderDonutChart('report-donut', allTxs, 'expense');
    renderCategoryBarChart('report-cat-expense', allTxs, 'expense');
  }, 50);
}

// ============================================================
// カテゴリ管理
// ============================================================
function renderCategories() {
  const expCats = appData.categories.filter(c => c.type === 'expense');
  const incCats = appData.categories.filter(c => c.type === 'income');

  const budgets = appData.budgets || {};

  const catRow = (c) => `
    <tr>
      <td><span class="color-dot" style="background:${c.color}"></span>${esc2(c.name)}</td>
      <td>${esc2(c.yayoiAccount)}</td>
      ${c.type === 'expense'
        ? `<td><input class="budget-input" type="number" min="0" step="100" data-id="${c.id}" value="${budgets[c.id] || ''}" placeholder="なし"></td>`
        : '<td class="text-muted">—</td>'}
      <td class="actions">
        <button class="btn-icon edit-cat" data-id="${c.id}" title="編集">✏️</button>
        <button class="btn-icon delete-cat" data-id="${c.id}" title="削除">🗑️</button>
      </td>
    </tr>`;

  return `
<div class="page-header">
  <h1 class="page-title">カテゴリ管理</h1>
  <button class="btn btn-primary" id="open-add-cat">＋ カテゴリ追加</button>
</div>

<div class="card">
  <h3 class="card-title section-label expense">支出カテゴリ</h3>
  <div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>カテゴリ名</th><th>弥生勘定科目</th><th>月次予算 (¥)</th><th></th></tr></thead>
      <tbody>${expCats.map(catRow).join('') || '<tr><td colspan="4" class="empty">なし</td></tr>'}</tbody>
    </table>
  </div>
</div>

<div class="card">
  <h3 class="card-title section-label income">収入カテゴリ</h3>
  <div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>カテゴリ名</th><th>弥生勘定科目</th><th>月次予算</th><th></th></tr></thead>
      <tbody>${incCats.map(catRow).join('') || '<tr><td colspan="4" class="empty">なし</td></tr>'}</tbody>
    </table>
  </div>
</div>

<div id="cat-modal" class="modal-overlay" style="display:none">
  <div class="modal modal-sm">
    <div class="modal-header">
      <h2 id="cat-modal-title">カテゴリ追加</h2>
      <button class="modal-close" id="cat-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>種別</label>
        <select id="cat-type">
          <option value="expense">支出</option>
          <option value="income">収入</option>
        </select>
      </div>
      <div class="form-group">
        <label>カテゴリ名</label>
        <input type="text" id="cat-name" placeholder="例: 食費">
      </div>
      <div class="form-group">
        <label>弥生会計 勘定科目名</label>
        <input type="text" id="cat-yayoi" placeholder="例: 食料品費">
        <small class="hint">弥生会計の仕訳インポートで使われます</small>
      </div>
      <div class="form-group">
        <label>カラー</label>
        <div class="color-palette" id="color-palette">
          ${['#ef4444','#f97316','#f59e0b','#84cc16','#10b981','#059669','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#6b7280','#0d9488','#a855f7','#64748b','#047857'].map(col =>
            `<span class="color-swatch" data-color="${col}" style="background:${col}"></span>`).join('')}
        </div>
        <input type="hidden" id="cat-color" value="#ef4444">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="cat-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="cat-modal-save">保存</button>
    </div>
  </div>
</div>`;
}

function bindCategories() {
  let editingCatId = null;

  function openCatModal(id) {
    editingCatId = id || null;
    const modal = document.getElementById('cat-modal');
    const title = document.getElementById('cat-modal-title');
    if (id) {
      const c = appData.categories.find(c => c.id === id);
      if (c) {
        title.textContent = 'カテゴリ編集';
        document.getElementById('cat-type').value  = c.type;
        document.getElementById('cat-name').value  = c.name;
        document.getElementById('cat-yayoi').value = c.yayoiAccount;
        document.getElementById('cat-color').value = c.color;
        updateSwatchSelection(c.color);
      }
    } else {
      title.textContent = 'カテゴリ追加';
      document.getElementById('cat-name').value  = '';
      document.getElementById('cat-yayoi').value = '';
      document.getElementById('cat-color').value = '#ef4444';
      updateSwatchSelection('#ef4444');
    }
    modal.style.display = 'flex';
  }

  function closeCatModal() {
    document.getElementById('cat-modal').style.display = 'none';
    editingCatId = null;
  }

  function updateSwatchSelection(color) {
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === color);
    });
  }

  // 予算インライン保存
  document.querySelectorAll('.budget-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const val = parseInt(inp.value) || 0;
      setBudget(inp.dataset.id, val);
    });
  });

  on('open-add-cat', 'click', () => openCatModal(null));
  on('cat-modal-close',  'click', closeCatModal);
  on('cat-modal-cancel', 'click', closeCatModal);
  document.getElementById('cat-modal').addEventListener('click', e => {
    if (e.target.id === 'cat-modal') closeCatModal();
  });

  document.querySelectorAll('.color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      document.getElementById('cat-color').value = s.dataset.color;
      updateSwatchSelection(s.dataset.color);
    });
  });

  on('cat-modal-save', 'click', () => {
    const type   = document.getElementById('cat-type').value;
    const name   = document.getElementById('cat-name').value.trim();
    const yayoi  = document.getElementById('cat-yayoi').value.trim();
    const color  = document.getElementById('cat-color').value;
    if (!name)  { alert('カテゴリ名を入力してください'); return; }
    if (!yayoi) { alert('弥生勘定科目名を入力してください'); return; }
    if (editingCatId) updateCategory(editingCatId, { type, name, yayoiAccount: yayoi, color });
    else addCategory({ type, name, yayoiAccount: yayoi, color });
    closeCatModal();
    renderCurrentPage();
  });

  document.querySelectorAll('.edit-cat').forEach(btn => {
    btn.addEventListener('click', () => openCatModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('このカテゴリを削除しますか？（使用中の取引は「その他」カテゴリに変更されます）')) {
        deleteCategory(btn.dataset.id);
        renderCurrentPage();
      }
    });
  });
}

// ============================================================
// 設定
// ============================================================
function renderSettings() {
  const s   = appData.settings;
  // APP_CONFIGが設定済みの場合はそちらを優先表示
  const adminCfg = (typeof isAdminConfigured === 'function' && isAdminConfigured());
  const cfg = adminCfg ? (APP_CONFIG.supabase || {}) : (s.syncConfig || {});
  const templates = appData.templates || [];
  const templateRows = templates.map(t => {
    const cat = getCategoryById(t.categoryId);
    const isIncome = t.type === 'income';
    return `<tr>
      <td>${esc2(t.name)}</td>
      <td class="${isIncome ? 'income' : 'expense'}">${isIncome ? '収入' : '支出'}</td>
      <td>${cat ? `<span class="cat-badge" style="background:${cat.color}20;color:${cat.color}">${esc2(cat.name)}</span>` : '—'}</td>
      <td class="amount ${isIncome ? 'income' : 'expense'}">${t.amount ? formatMoney(t.amount) : '—'}</td>
      <td class="actions">
        <button class="btn-icon edit-tpl" data-id="${t.id}" title="編集">✏️</button>
        <button class="btn-icon delete-tpl" data-id="${t.id}" title="削除">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  const memberRows = appData.members.map(m => `
    <tr>
      <td><span class="color-dot" style="background:${m.color}"></span>${esc2(m.name)}</td>
      <td class="actions">
        <button class="btn-icon edit-mem" data-id="${m.id}" title="編集">✏️</button>
        <button class="btn-icon delete-mem" data-id="${m.id}" title="削除">🗑️</button>
      </td>
    </tr>`).join('');

  const monthOptions = Array.from({length:12},(_,i)=>i+1)
    .map(m => `<option value="${m}" ${s.fiscalYearStart == m ? 'selected' : ''}>${m}月</option>`)
    .join('');

  return `
<div class="page-header">
  <h1 class="page-title">設定</h1>
</div>

<div class="card">
  <h3 class="card-title">基本設定</h3>
  <div class="form-group">
    <label>家計簿名</label>
    <input type="text" id="set-family" value="${esc2(s.familyName)}">
  </div>
  <div class="form-group">
    <label>会計年度開始月（青色申告用）</label>
    <select id="set-fiscal">${monthOptions}</select>
  </div>
  <button class="btn btn-primary" id="save-settings">設定を保存</button>
</div>

<div class="card">
  <h3 class="card-title">📷 レシート読み込み設定</h3>
  <div class="form-group">
    <label>Claude API キー</label>
    <div class="api-key-row">
      <input type="password" id="set-api-key" value="${esc2(s.claudeApiKey || '')}" placeholder="sk-ant-api03-..." autocomplete="off">
      <button class="btn btn-ghost btn-sm" id="toggle-api-key">表示</button>
    </div>
    <small class="hint">
      <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>
      で取得できます。このブラウザの localStorage にのみ保存されます。
    </small>
  </div>
  <button class="btn btn-primary" id="save-api-key">APIキーを保存</button>
  ${s.claudeApiKey ? '<span class="api-key-status set">✅ 設定済み</span>' : '<span class="api-key-status unset">未設定</span>'}
</div>

<div class="card">
  <h3 class="card-title">☁️ クラウドアカウント</h3>
  <div class="sync-status-row">
    <span id="sync-status-dot" class="sync-dot"></span>
    <span id="sync-status-text" style="font-size:13px;color:var(--text-muted)">未接続</span>
  </div>

  ${(typeof isLoggedIn === 'function' && isLoggedIn()) ? (() => {
    const user = getCurrentUser();
    return `
  <div id="sync-logged-info" class="sync-user-card">
    <div class="sync-user-avatar" id="sync-user-avatar">${user ? user.email[0].toUpperCase() : '?'}</div>
    <div class="sync-user-info">
      <span id="sync-user-email" style="font-size:13px;font-weight:600">${esc2(user ? user.email : '')}</span>
      <span style="font-size:11px;color:var(--income);font-weight:600">✓ クラウド同期が有効です</span>
    </div>
  </div>
  <div class="sync-btn-row">
    <button class="btn btn-ghost btn-sm" id="btn-sync-pull">↓ 今すぐ同期</button>
    <button class="btn btn-danger btn-sm" id="btn-sync-logout">ログアウト</button>
  </div>`;
  })() : `
  <div id="sync-logged-info" style="display:none">
    <div class="sync-user-card">
      <div class="sync-user-avatar" id="sync-user-avatar">?</div>
      <div class="sync-user-info">
        <span id="sync-user-email" style="font-size:13px;font-weight:600"></span>
        <span style="font-size:11px;color:var(--income);font-weight:600">✓ クラウド同期が有効です</span>
      </div>
    </div>
    <div class="sync-btn-row">
      <button class="btn btn-ghost btn-sm" id="btn-sync-pull">↓ 今すぐ同期</button>
      <button class="btn btn-danger btn-sm" id="btn-sync-logout">ログアウト</button>
    </div>
  </div>
  <div id="sync-login-prompt" style="margin-top:10px">
    ${(cfg.url && cfg.anonKey) ? `
    <button class="btn btn-primary" id="btn-sync-login-show">✉️ ログイン / 新規登録</button>
    ` : `<p class="hint">Supabase接続設定を行うと、メールアドレスでアカウント作成してクラウド同期できます。</p>`}
  </div>`}

  ${adminCfg ? `
  <div style="margin-top:14px;padding:12px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;font-size:13px">
    <span style="font-weight:700;color:#059669">✓ Supabase接続設定済み</span>
    <span style="color:#64748b;margin-left:8px">（管理者によって設定されています）</span>
  </div>` : `
  <details style="margin-top:18px" ${(!cfg.url || !cfg.anonKey) ? 'open' : ''}>
    <summary style="cursor:pointer;font-size:13px;color:var(--primary);font-weight:600;user-select:none;list-style:none;display:flex;align-items:center;gap:6px">
      <span>⚙️ Supabase接続設定</span>
      ${(cfg.url && cfg.anonKey) ? '<span style="font-size:11px;background:#d1fae5;color:#059669;padding:2px 8px;border-radius:20px;font-weight:700">設定済み</span>' : '<span style="font-size:11px;background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:20px;font-weight:700">未設定</span>'}
    </summary>
    <div style="margin-top:14px">
      <div class="form-group">
        <label>Supabase Project URL</label>
        <input type="url" id="set-supabase-url" value="${esc2(cfg.url||'')}" placeholder="https://xxxx.supabase.co">
      </div>
      <div class="form-group">
        <label>Anon（公開）Key</label>
        <div class="api-key-row">
          <input type="password" id="set-supabase-key" value="${esc2(cfg.anonKey||'')}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
          <button class="btn btn-ghost btn-sm" id="toggle-supabase-key">表示</button>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="save-supabase-config">設定を保存</button>
    </div>
  </details>`}

  <details style="margin-top:14px">
    <summary style="cursor:pointer;color:var(--text-muted);font-size:12px;user-select:none;list-style:none">▶ Supabase初期設定手順（クリックで展開）</summary>
    <ol style="font-size:12px;color:var(--text-muted);padding-left:18px;line-height:2.0;margin-top:8px">
      <li><a href="https://supabase.com" target="_blank" rel="noopener" style="color:var(--primary)">supabase.com</a> で無料プロジェクトを作成</li>
      <li>SQL Editorで以下を実行してテーブルを作成：</li>
    </ol>
    <pre class="sql-block">CREATE TABLE household_data (
  user_id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE household_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_data" ON household_data
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);</pre>
    <ol start="3" style="font-size:12px;color:var(--text-muted);padding-left:18px;line-height:2.0;margin-top:8px">
      <li>Settings → API から Project URL と anon key をコピーして上の入力欄に貼り付け</li>
      <li>「設定を保存」→「ログイン / 新規登録」でアカウント作成</li>
    </ol>
  </details>
</div>

<div class="card">
  <div class="card-header-row">
    <h3 class="card-title">家族メンバー</h3>
    <button class="btn btn-primary" id="open-add-mem">＋ メンバー追加</button>
  </div>
  <div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>名前</th><th></th></tr></thead>
      <tbody>${memberRows || '<tr><td colspan="2" class="empty">メンバーがいません</td></tr>'}</tbody>
    </table>
  </div>
</div>

<div class="card">
  <h3 class="card-title">データのエクスポート・バックアップ</h3>
  <div class="export-grid">
    <div class="export-block">
      <h4>弥生会計 仕訳インポートCSV</h4>
      <p class="hint">弥生会計の「仕訳日記帳インポート」機能で読み込めます。<br>BOM付きUTF-8形式。</p>
      <div class="export-range">
        <select id="yayoi-year">
          ${Array.from({length:5},(_,i)=>new Date().getFullYear()-i).map(y=>`<option value="${y}">${y}年</option>`).join('')}
        </select>
        <button class="btn btn-primary" id="btn-export-yayoi">弥生CSVダウンロード</button>
      </div>
    </div>
    <div class="export-block">
      <h4>汎用CSV（全データ）</h4>
      <p class="hint">Excel等で開ける汎用CSVです。</p>
      <button class="btn btn-ghost" id="btn-export-csv">CSVダウンロード</button>
    </div>
    <div class="export-block">
      <h4>JSONバックアップ</h4>
      <p class="hint">全データをJSONで保存します。他のPCに移行する際に使えます。</p>
      <button class="btn btn-ghost" id="btn-export-json">JSONダウンロード</button>
    </div>
    <div class="export-block">
      <h4>JSONインポート</h4>
      <p class="hint">バックアップJSONを読み込みます。<b>現在のデータは上書きされます。</b></p>
      <label class="btn btn-ghost" id="btn-import-label">
        JSONを選択
        <input type="file" id="btn-import-json" accept=".json" style="display:none">
      </label>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header-row">
    <h3 class="card-title">⚡ よく使うテンプレート</h3>
    <button class="btn btn-primary" id="open-add-tpl">＋ テンプレート追加</button>
  </div>
  <p class="hint" style="margin-bottom:10px">固定費や繰り返しの取引を登録。収支一覧画面でワンタップ入力できます。</p>
  ${templateRows ? `<div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>名前</th><th>種別</th><th>カテゴリ</th><th>金額</th><th></th></tr></thead>
      <tbody>${templateRows}</tbody>
    </table>
  </div>` : '<p class="empty" style="text-align:center;padding:12px 0;color:var(--text-muted)">テンプレートがありません</p>'}
</div>

<div id="tpl-modal" class="modal-overlay" style="display:none">
  <div class="modal modal-sm">
    <div class="modal-header">
      <h2 id="tpl-modal-title">テンプレート追加</h2>
      <button class="modal-close" id="tpl-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>テンプレート名</label>
        <input type="text" id="tpl-name" placeholder="例: 家賃、給与">
      </div>
      <div class="form-group">
        <label>種別</label>
        <div class="type-toggle">
          <button class="type-btn active expense-btn" data-type="expense" id="tpl-type-expense">支出</button>
          <button class="type-btn income-btn" data-type="income" id="tpl-type-income">収入</button>
        </div>
        <input type="hidden" id="tpl-type" value="expense">
      </div>
      <div class="form-group">
        <label>カテゴリ</label>
        <select id="tpl-category">
          <option value="">—</option>
          ${appData.categories.map(c => `<option value="${c.id}">${esc2(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>金額（円）</label>
        <input type="number" id="tpl-amount" placeholder="0" min="0">
      </div>
      <div class="form-group">
        <label>支払方法</label>
        <select id="tpl-payment">
          ${['現金','クレカ','口座振替','銀行振込','電子マネー','その他'].map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>消費税率</label>
        <select id="tpl-tax">
          <option value="0">対象外（0%）</option>
          <option value="10">課税 10%</option>
          <option value="8">課税 8%（軽減）</option>
        </select>
      </div>
      <div class="form-group">
        <label>摘要（メモ）</label>
        <input type="text" id="tpl-memo" placeholder="例: ○○不動産">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="tpl-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="tpl-modal-save">保存</button>
    </div>
  </div>
</div>

<div class="card">
  <h3 class="card-title">📂 アカウント管理</h3>
  <p class="hint">アカウントごとに家計データを分けて管理できます（例：自分の家・親の家・事業用）。</p>
  <div class="table-wrap" style="margin-bottom:12px">
    <table class="tx-table">
      <thead><tr><th>アカウント名</th><th>状態</th><th></th></tr></thead>
      <tbody>
        ${getAllAccounts().map(a => `<tr>
          <td>${esc2(a.name)}${a.id === currentAccountId ? ' <span class="badge-active">使用中</span>' : ''}</td>
          <td style="font-size:11px;color:var(--text-muted)">${(()=>{
            try{const d=JSON.parse(localStorage.getItem(getStorageKey(a.id))||'{}');return (d.transactions||[]).length+'件';}catch{return '—';}
          })()}</td>
          <td class="actions">
            <button class="btn-icon rename-acc" data-id="${a.id}" title="名前変更">✏️</button>
            ${getAllAccounts().length > 1 ? `<button class="btn-icon delete-acc" data-id="${a.id}" title="削除">🗑️</button>` : ''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <button class="btn btn-ghost" id="btn-new-account">＋ アカウントを追加</button>
</div>

<div class="card">
  <h3 class="card-title">📱 スマートフォンアプリとしてインストール</h3>
  <p class="hint">このアプリはPWA（プログレッシブWebアプリ）です。ホーム画面に追加するとネイティブアプリのように使えます。</p>
  <div id="pwa-install-area" style="margin-bottom:12px"></div>
  <div class="install-guide-tabs">
    <div class="install-tab">
      <h4>🤖 Android（Chrome）</h4>
      <ol style="font-size:12px;color:var(--text-muted);padding-left:18px;line-height:1.9;margin:8px 0 0">
        <li>Chromeでこのページを開く</li>
        <li>右上の「⋮」メニューをタップ</li>
        <li>「ホーム画面に追加」を選択</li>
        <li>「追加」をタップして完了 🎉</li>
      </ol>
    </div>
    <div class="install-tab">
      <h4>🍎 iPhone / iPad（Safari）</h4>
      <ol style="font-size:12px;color:var(--text-muted);padding-left:18px;line-height:1.9;margin:8px 0 0">
        <li>Safariでこのページを開く（必須）</li>
        <li>画面下部の共有ボタン（□↑）をタップ</li>
        <li>「ホーム画面に追加」を選択</li>
        <li>「追加」をタップして完了 🎉</li>
      </ol>
    </div>
  </div>
  <p style="font-size:12px;color:var(--text-muted);margin-top:10px">💡 インストール後はオフラインでも使用できます。データはこのデバイスに保存されます。</p>
</div>

<div class="card danger-zone">
  <h3 class="card-title">危険ゾーン</h3>
  <p class="hint">現在のアカウントのデータをすべて削除します。この操作は元に戻せません。</p>
  <button class="btn btn-danger" id="btn-reset">データをリセット</button>
</div>

<div id="mem-modal" class="modal-overlay" style="display:none">
  <div class="modal modal-sm">
    <div class="modal-header">
      <h2 id="mem-modal-title">メンバー追加</h2>
      <button class="modal-close" id="mem-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>名前</label>
        <input type="text" id="mem-name" placeholder="例: 父">
      </div>
      <div class="form-group">
        <label>カラー</label>
        <div class="color-palette" id="mem-color-palette">
          ${['#3b82f6','#ec4899','#059669','#f97316','#8b5cf6','#06b6d4','#f59e0b','#10b981','#ef4444','#6b7280'].map(col =>
            `<span class="color-swatch" data-color="${col}" style="background:${col}"></span>`).join('')}
        </div>
        <input type="hidden" id="mem-color" value="#3b82f6">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="mem-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="mem-modal-save">保存</button>
    </div>
  </div>
</div>`;
}

function bindSettings() {
  let editingMemId = null;

  // ── クラウド同期 ──────────────────────────────────────────
  if (typeof refreshSyncUI === 'function') refreshSyncUI();

  on('toggle-supabase-key', 'click', () => {
    const input = document.getElementById('set-supabase-key');
    const btn   = document.getElementById('toggle-supabase-key');
    if (input.type === 'password') { input.type = 'text';     btn.textContent = '隠す'; }
    else                           { input.type = 'password'; btn.textContent = '表示'; }
  });

  on('save-supabase-config', 'click', () => {
    const url     = document.getElementById('set-supabase-url').value.trim();
    const anonKey = document.getElementById('set-supabase-key').value.trim();
    if (!url || !anonKey) {
      alert('Project URLとAnon Keyを入力してください');
      return;
    }
    if (typeof resetSupabaseClient === 'function') resetSupabaseClient();
    const existing = appData.settings.syncConfig || {};
    updateSettings({ syncConfig: { ...existing, url, anonKey } });
    renderCurrentPage();
    alert('設定を保存しました。「ログイン / 新規登録」でアカウントにサインインしてください。');
  });

  on('btn-sync-login-show', 'click', () => {
    if (typeof showAuthScreen === 'function') showAuthScreen();
  });

  on('btn-sync-logout', 'click', async () => {
    if (!confirm('ログアウトしますか？')) return;
    if (typeof authSignOut === 'function') await authSignOut();
    renderCurrentPage();
  });

  on('btn-sync-pull', 'click', async () => {
    if (typeof pullFromCloud === 'function') await pullFromCloud();
  });

  // ── PWA インストール ───────────────────────────────────────
  const pwaArea = document.getElementById('pwa-install-area');
  if (pwaArea) {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true;
    if (isStandalone) {
      pwaArea.innerHTML = '<p style="font-size:13px;color:var(--income)">✅ すでにアプリとしてインストール済みです</p>';
    } else if (window.pwaInstallEvent) {
      pwaArea.innerHTML = '<button class="btn btn-primary" id="btn-pwa-install">📲 ホーム画面に追加（ワンタップ）</button>';
      on('btn-pwa-install', 'click', async () => {
        window.pwaInstallEvent.prompt();
        const { outcome } = await window.pwaInstallEvent.userChoice;
        if (outcome === 'accepted') {
          window.pwaInstallEvent = null;
          pwaArea.innerHTML = '<p style="font-size:13px;color:var(--income)">✅ インストールしました！</p>';
        }
      });
    }
  }

  on('save-settings', 'click', () => {
    updateSettings({
      familyName: document.getElementById('set-family').value.trim() || 'わが家の家計簿',
      fiscalYearStart: Number(document.getElementById('set-fiscal').value),
    });
    document.getElementById('sidebar-title').textContent = appData.settings.familyName;
    alert('設定を保存しました');
  });

  // APIキー保存
  on('save-api-key', 'click', () => {
    const key = document.getElementById('set-api-key').value.trim();
    updateSettings({ claudeApiKey: key });
    renderCurrentPage(); // ステータス表示を更新
    alert(key ? 'APIキーを保存しました' : 'APIキーを削除しました');
  });

  // APIキー表示トグル
  on('toggle-api-key', 'click', () => {
    const input = document.getElementById('set-api-key');
    const btn   = document.getElementById('toggle-api-key');
    if (input.type === 'password') { input.type = 'text';     btn.textContent = '隠す'; }
    else                           { input.type = 'password'; btn.textContent = '表示'; }
  });

  // エクスポート
  on('btn-export-yayoi', 'click', () => {
    const year = document.getElementById('yayoi-year').value;
    const txs = appData.transactions.filter(t => t.date && t.date.startsWith(year));
    if (txs.length === 0) { alert(`${year}年のデータがありません`); return; }
    doExportYayoi(txs);
  });

  on('btn-export-csv', 'click', () => doExportCSV(appData.transactions));
  on('btn-export-json', 'click', doExportJSON);

  on('btn-import-json', 'change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('現在のデータはすべて上書きされます。よろしいですか？')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        importJSON(ev.target.result);
        alert('インポートが完了しました');
        renderCurrentPage();
      } catch (err) {
        alert('インポートに失敗しました: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  });

  on('btn-reset', 'click', () => {
    if (!confirm('本当にすべてのデータを削除しますか？この操作は元に戻せません。')) return;
    if (!confirm('最終確認：データをリセットしてよいですか？')) return;
    appData = createDefaultData();
    saveData();
    renderCurrentPage();
    alert('データをリセットしました');
  });

  // ── テンプレート管理 ──────────────────────────────────────
  let editingTplId = null;

  function openTplModal(id) {
    editingTplId = id || null;
    document.getElementById('tpl-modal-title').textContent = id ? 'テンプレート編集' : 'テンプレート追加';
    if (id) {
      const tpl = (appData.templates || []).find(t => t.id === id);
      if (tpl) {
        document.getElementById('tpl-name').value     = tpl.name || '';
        document.getElementById('tpl-type').value     = tpl.type || 'expense';
        document.getElementById('tpl-category').value = tpl.categoryId || '';
        document.getElementById('tpl-amount').value   = tpl.amount || '';
        document.getElementById('tpl-payment').value  = tpl.paymentMethod || '現金';
        document.getElementById('tpl-tax').value      = tpl.taxRate != null ? String(tpl.taxRate) : '0';
        document.getElementById('tpl-memo').value     = tpl.memo || '';
        setTplTypeBtn(tpl.type || 'expense');
      }
    } else {
      document.getElementById('tpl-name').value     = '';
      document.getElementById('tpl-type').value     = 'expense';
      document.getElementById('tpl-category').value = '';
      document.getElementById('tpl-amount').value   = '';
      document.getElementById('tpl-payment').value  = '現金';
      document.getElementById('tpl-tax').value      = '0';
      document.getElementById('tpl-memo').value     = '';
      setTplTypeBtn('expense');
    }
    document.getElementById('tpl-modal').style.display = 'flex';
  }

  function closeTplModal() {
    document.getElementById('tpl-modal').style.display = 'none';
    editingTplId = null;
  }

  function setTplTypeBtn(type) {
    ['expense','income'].forEach(t => {
      const btn = document.getElementById(`tpl-type-${t}`);
      if (!btn) return;
      btn.classList.toggle('active', t === type);
      btn.classList.toggle('expense-btn', t === 'expense');
      btn.classList.toggle('income-btn',  t === 'income');
    });
  }

  ['expense','income'].forEach(type => {
    on(`tpl-type-${type}`, 'click', () => {
      document.getElementById('tpl-type').value = type;
      setTplTypeBtn(type);
    });
  });

  on('open-add-tpl',    'click', () => openTplModal(null));
  on('tpl-modal-close',  'click', closeTplModal);
  on('tpl-modal-cancel', 'click', closeTplModal);
  document.getElementById('tpl-modal').addEventListener('click', e => {
    if (e.target.id === 'tpl-modal') closeTplModal();
  });

  on('tpl-modal-save', 'click', () => {
    const name = document.getElementById('tpl-name').value.trim();
    if (!name) { alert('テンプレート名を入力してください'); return; }
    const fields = {
      name,
      type:          document.getElementById('tpl-type').value,
      categoryId:    document.getElementById('tpl-category').value,
      amount:        Number(document.getElementById('tpl-amount').value) || 0,
      paymentMethod: document.getElementById('tpl-payment').value,
      taxRate:       Number(document.getElementById('tpl-tax').value),
      memo:          document.getElementById('tpl-memo').value.trim(),
    };
    if (editingTplId) updateTemplate(editingTplId, fields);
    else addTemplate(fields);
    closeTplModal();
    renderCurrentPage();
  });

  document.querySelectorAll('.edit-tpl').forEach(btn => {
    btn.addEventListener('click', () => openTplModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-tpl').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('このテンプレートを削除しますか？')) {
        deleteTemplate(btn.dataset.id);
        renderCurrentPage();
      }
    });
  });

  // アカウント管理
  on('btn-new-account', 'click', () => {
    const name = prompt('新しいアカウント名を入力してください\n（例：田中家、父の事業）', '');
    if (name && name.trim()) {
      createAccount(name.trim());
      renderAccountBar();
      renderCurrentPage();
    }
  });

  document.querySelectorAll('.rename-acc').forEach(btn => {
    btn.addEventListener('click', () => {
      const acc = getAllAccounts().find(a => a.id === btn.dataset.id);
      if (!acc) return;
      const name = prompt('新しいアカウント名を入力してください:', acc.name);
      if (name && name.trim() && name.trim() !== acc.name) {
        renameAccount(btn.dataset.id, name.trim());
        if (btn.dataset.id === currentAccountId) updateSidebarTitle();
        renderAccountBar();
        renderCurrentPage();
      }
    });
  });

  document.querySelectorAll('.delete-acc').forEach(btn => {
    btn.addEventListener('click', () => {
      const acc = getAllAccounts().find(a => a.id === btn.dataset.id);
      if (!acc) return;
      if (!confirm(`「${acc.name}」のすべてのデータを削除しますか？この操作は元に戻せません。`)) return;
      if (deleteAccount(btn.dataset.id)) {
        updateSidebarTitle();
        renderAccountBar();
        renderCurrentPage();
      }
    });
  });

  // メンバー管理
  function openMemModal(id) {
    editingMemId = id || null;
    const modal = document.getElementById('mem-modal');
    document.getElementById('mem-modal-title').textContent = id ? 'メンバー編集' : 'メンバー追加';
    if (id) {
      const m = appData.members.find(m => m.id === id);
      if (m) {
        document.getElementById('mem-name').value  = m.name;
        document.getElementById('mem-color').value = m.color;
        updateMemSwatchSel(m.color);
      }
    } else {
      document.getElementById('mem-name').value  = '';
      document.getElementById('mem-color').value = '#3b82f6';
      updateMemSwatchSel('#3b82f6');
    }
    modal.style.display = 'flex';
  }

  function closeMemModal() {
    document.getElementById('mem-modal').style.display = 'none';
    editingMemId = null;
  }

  function updateMemSwatchSel(color) {
    document.querySelectorAll('#mem-color-palette .color-swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === color);
    });
  }

  on('open-add-mem',    'click', () => openMemModal(null));
  on('mem-modal-close',  'click', closeMemModal);
  on('mem-modal-cancel', 'click', closeMemModal);
  document.getElementById('mem-modal').addEventListener('click', e => {
    if (e.target.id === 'mem-modal') closeMemModal();
  });

  document.querySelectorAll('#mem-color-palette .color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      document.getElementById('mem-color').value = s.dataset.color;
      updateMemSwatchSel(s.dataset.color);
    });
  });

  on('mem-modal-save', 'click', () => {
    const name  = document.getElementById('mem-name').value.trim();
    const color = document.getElementById('mem-color').value;
    if (!name) { alert('名前を入力してください'); return; }
    if (editingMemId) updateMember(editingMemId, { name, color });
    else addMember({ name, color });
    closeMemModal();
    renderCurrentPage();
  });

  document.querySelectorAll('.edit-mem').forEach(btn => {
    btn.addEventListener('click', () => openMemModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-mem').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('このメンバーを削除しますか？（関連する取引の担当者は空欄になります）')) {
        deleteMember(btn.dataset.id);
        renderCurrentPage();
      }
    });
  });
}

// ============================================================
// 共通ユーティリティ
// ============================================================
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function esc2(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function monthSelector(id, value) {
  const months = getAvailableMonths();
  if (!months.includes(value)) months.unshift(value);

  const options = months.map(m => {
    const [y, mo] = m.split('-');
    return `<option value="${m}" ${m === value ? 'selected' : ''}>${y}年${parseInt(mo)}月</option>`;
  }).join('');

  return `<select id="${id}" class="month-sel">${options}</select>`;
}

// ============================================================
// レシートスキャン（Claude Vision API）
// ============================================================

function checkApiKey() {
  if (!appData.settings.claudeApiKey) {
    if (confirm('Claude APIキーが設定されていません。\n設定画面でAPIキーを入力してください。\n\n設定画面を開きますか？')) {
      closeTxModal();
      navigate('settings');
    }
    return false;
  }
  return true;
}

async function processReceiptImage(file) {
  const scanBtn  = document.getElementById('receipt-scan-btn');
  const fileLabel = document.getElementById('receipt-file-label');
  const result   = document.getElementById('scan-result');

  // ローディング状態
  if (scanBtn)   { scanBtn.innerHTML  = '⏳ 解析中...'; scanBtn.disabled  = true; }
  if (fileLabel) { fileLabel.classList.add('disabled'); }
  if (result)    { result.style.display = 'none'; }

  try {
    const base64   = await fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';
    const data     = await callClaudeVision(base64, mimeType);

    // フォームに反映
    if (data.date)   setFormValue('tx-date',   data.date);
    if (data.amount) setFormValue('tx-amount', data.amount);
    if (data.storeName) setFormValue('tx-memo', data.storeName);
    if (data.taxRate !== undefined) setFormValue('tx-tax', String(data.taxRate));

    // 支出モードへ切替
    const expBtn = document.querySelector('#tx-modal [data-type="expense"]');
    if (expBtn && !expBtn.classList.contains('active')) {
      expBtn.click();
    }

    // 成功メッセージ
    if (result) {
      result.innerHTML = `<span class="scan-ok">✅ 読み取り完了</span>
        <span class="scan-detail">${esc2(data.storeName || '店名不明')} ／ ¥${Number(data.amount || 0).toLocaleString('ja-JP')}（税率${data.taxRate || 0}%）</span>
        <span class="scan-note">カテゴリを選択して保存してください</span>`;
      result.style.display = 'flex';
    }

  } catch (err) {
    if (result) {
      result.innerHTML = `<span class="scan-err">❌ 読み取り失敗：${esc2(err.message)}</span>`;
      result.style.display = 'flex';
    }
  } finally {
    if (scanBtn)   { scanBtn.innerHTML  = '📷 レシートから読み込む'; scanBtn.disabled  = false; }
    if (fileLabel) { fileLabel.classList.remove('disabled'); }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function callClaudeVision(base64, mimeType) {
  const apiKey = appData.settings.claudeApiKey;

  const prompt = `このレシート・領収書の画像から情報を抽出し、必ずJSON形式のみで回答してください（前後の説明文は不要です）。

{
  "date": "YYYY-MM-DD（日付が読み取れない場合は今日の日付 ${todayStr()}）",
  "amount": 税込み合計金額（数値のみ、カンマなし）,
  "storeName": "店名または施設名（不明な場合は空文字）",
  "taxRate": 消費税率（10・8・0のいずれか。軽減税率の場合は8）
}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text',  text: prompt },
        ],
      }],
    }),
  });

  if (!resp.ok) {
    let msg = `HTTPエラー ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }

  const body = await resp.json();
  const text = body.content?.[0]?.text || '';

  // JSON部分だけ抽出
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error('レスポンスの解析に失敗しました');

  const parsed = JSON.parse(m[0]);
  if (!parsed.date) parsed.date = todayStr();
  return parsed;
}

function setFormValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ============================================================
// サイドバー ユーザー表示
// ============================================================
function renderSidebarUser() {
  const footer = document.getElementById('sidebar-footer');
  if (!footer) return;

  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    const user = getCurrentUser();
    const email = user ? user.email : '';
    const initial = email ? email[0].toUpperCase() : '?';
    footer.innerHTML = `
      <div class="sidebar-user-card">
        <div class="sidebar-avatar">${initial}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-email" title="${esc2(email)}">${esc2(email)}</div>
          <div class="sidebar-user-status">● 同期中</div>
        </div>
        <button class="btn-sidebar-logout" id="sidebar-logout-btn" title="ログアウト">⏏</button>
      </div>`;
    on('sidebar-logout-btn', 'click', async () => {
      if (!confirm('ログアウトしますか？')) return;
      if (typeof authSignOut === 'function') await authSignOut();
    });
  } else if (typeof isSyncConfigured === 'function' && isSyncConfigured()) {
    footer.innerHTML = `
      <div style="padding:4px 0">
        <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" id="sidebar-login-btn">ログイン / 登録</button>
      </div>`;
    on('sidebar-login-btn', 'click', () => {
      if (typeof showAuthScreen === 'function') showAuthScreen();
    });
  } else {
    footer.innerHTML = '<div class="sidebar-offline-badge">オフラインモード</div>';
  }
}

// ============================================================
// 認証スクリーン
// ============================================================
let _authTab = 'login';

function showAuthScreen() {
  let overlay = document.getElementById('auth-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.className = 'auth-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = renderAuthScreen();
  overlay.style.display = 'flex';
  bindAuthScreen();
}

function hideAuthScreen() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
  renderSidebarUser();
  renderCurrentPage();
}

function renderAuthScreen() {
  const isLogin = _authTab === 'login';
  return `
    <div class="auth-card">
      <div class="auth-logo">
        <div class="auth-logo-icon">💰</div>
        <h1 class="auth-title">家族家計簿</h1>
        <p class="auth-subtitle">家族みんなで使えるクラウド家計簿</p>
      </div>

      <div class="auth-tabs">
        <button class="auth-tab ${isLogin ? 'active' : ''}" data-tab="login">ログイン</button>
        <button class="auth-tab ${!isLogin ? 'active' : ''}" data-tab="signup">新規登録</button>
      </div>

      <form id="auth-form" class="auth-form">
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div class="form-group">
          <label>メールアドレス</label>
          <input type="email" id="auth-email" placeholder="example@email.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>パスワード${!isLogin ? '（8文字以上）' : ''}</label>
          <input type="password" id="auth-password" placeholder="パスワード" required autocomplete="${isLogin ? 'current-password' : 'new-password'}">
        </div>
        ${!isLogin ? `
        <div class="form-group">
          <label>家族名（任意）</label>
          <input type="text" id="auth-family" placeholder="例：山田家の家計簿" maxlength="20">
        </div>` : ''}
        <button type="submit" class="btn btn-primary auth-submit" id="auth-submit">
          ${isLogin ? 'ログイン' : 'アカウントを作成'}
        </button>
      </form>

      <div class="auth-footer">
        <p class="auth-hint">🔒 Supabaseで安全に管理されます</p>
        <button class="auth-offline-mode" id="auth-skip">スキップしてオフラインで使う</button>
      </div>
    </div>`;
}

function bindAuthScreen() {
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _authTab = btn.dataset.tab;
      showAuthScreen();
    });
  });

  on('auth-skip', 'click', () => {
    document.getElementById('auth-overlay').style.display = 'none';
    renderCurrentPage();
  });

  const form = document.getElementById('auth-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const submit   = document.getElementById('auth-submit');
    const errEl    = document.getElementById('auth-error');

    submit.disabled = true;
    submit.textContent = '処理中...';
    errEl.style.display = 'none';

    try {
      if (_authTab === 'login') {
        await authSignIn(email, password);
      } else {
        const familyInput = document.getElementById('auth-family');
        await authSignUp(email, password);
        if (familyInput && familyInput.value.trim()) {
          appData.settings.familyName = familyInput.value.trim();
          saveData();
        }
      }
      hideAuthScreen();
    } catch (err) {
      errEl.textContent = translateAuthError(err.message || String(err));
      errEl.style.display = 'block';
      submit.disabled = false;
      submit.textContent = _authTab === 'login' ? 'ログイン' : 'アカウントを作成';
    }
  });
}

function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials'))      return 'メールアドレスまたはパスワードが違います';
  if (msg.includes('Email not confirmed'))            return 'メール確認が必要です。受信トレイをご確認ください';
  if (msg.includes('User already registered'))        return 'このメールアドレスは既に登録されています';
  if (msg.includes('Password should be at least'))   return 'パスワードは8文字以上にしてください';
  if (msg.includes('Unable to validate'))             return '接続エラー。Supabase設定を確認してください';
  if (msg.includes('Failed to fetch'))                return 'ネットワークエラー。接続を確認してください';
  if (msg.includes('Supabase未設定'))                 return 'Supabase設定が必要です。設定画面で入力してください';
  return msg;
}

// ============================================================
// アプリ初期化
// ============================================================
function initApp() {
  // サイドバータイトルを設定
  const sidebarTitle = document.getElementById('sidebar-title');
  if (sidebarTitle) sidebarTitle.textContent = appData.settings.familyName;

  // ナビゲーションリンク
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // ハンバーガーメニュー（モバイル）
  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }

  // サイドバー外クリックで閉じる
  document.addEventListener('click', e => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target.id !== 'hamburger') {
      sidebar.classList.remove('open');
    }
  });

  // アカウントバー描画
  renderAccountBar();

  // サイドバー下部ユーザー情報
  renderSidebarUser();

  // ボトムナビゲーション（モバイル）
  document.querySelectorAll('.bottom-nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
      // 触覚フィードバック（Android対応、iOSは無視）
      if (navigator.vibrate) navigator.vibrate(10);
    });
  });

  // 初期ページ描画
  navigate('dashboard');

  // クラウド同期初期化（非同期・描画後に実行）
  if (typeof initSync === 'function') initSync();
}

document.addEventListener('DOMContentLoaded', initApp);

// ============================================================
// ダークモード（prefers-color-scheme + 手動トグル）
// ============================================================
(function initDarkMode() {
  const STORAGE_KEY = 'kakeibo-theme';
  const root = document.documentElement;

  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    document.querySelectorAll('.btn-dark-toggle').forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替';
    });
  }

  function toggleTheme() {
    const current = root.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  // 初期テーマを即時適用（FOUC防止）
  applyTheme(getInitialTheme());

  // ボタンイベント（委譲）
  document.addEventListener('click', e => {
    if (e.target.closest('.btn-dark-toggle')) toggleTheme();
  });

  // OS設定変更に追従（手動設定がない場合のみ）
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
})();
