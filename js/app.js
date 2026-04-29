// ============================================================
// app.js - メインアプリ（ルーティング・ページ描画）
// ============================================================

// ── アプリ状態 ─────────────────────────────────────────────
const appState = {
  page: 'dashboard',
  month: currentYearMonth(),
  txFilter: { category: '', member: '', search: '', type: '', tag: '', amountMin: '', amountMax: '', dateFrom: '', dateTo: '' },
  advFilterOpen: false,  // v5.94: 詳細フィルターパネル開閉
  editingTxId: null,
  templateData: null,  // テンプレートからの入力時に使用
  reportYear: new Date().getFullYear(),
  calendarMonth: currentYearMonth(),  // v5.38: カレンダービュー
  calendarDay: null,                  // v5.38: 選択中の日付
  bulkMode: false,                    // v5.55: 一括操作モード
  selectedTxIds: new Set(),           // v5.55: 選択中の取引ID
  catTrendSelected: [],               // v5.68: カテゴリ推移 選択中カテゴリID配列
  quickAddOpen: false,                // v5.74: クイック入力パネル開閉状態
  quickAddType: 'expense',            // v5.74: クイック入力タイプ
  txSort: { key: 'date', dir: 'desc' }, // v5.78: 取引ソート
  _sortChanged: false,                  // v5.79: ソートアニメーション用フラグ
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

// ── モーダルアニメーションヘルパー ─────────────────────────
function showModal(el) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  // transformを持つ親の中にあるとposition:fixedが壊れるためbody直下に移動
  if (el.parentElement !== document.body) document.body.appendChild(el);
  el.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('modal-is-open')));
}
function hideModal(el) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.classList.remove('modal-is-open');
  el.style.display = 'none';
}

// ── 数値カウントアップ ──────────────────────────────────────
function animateCountUp(el, target) {
  const duration = 550;
  const start = performance.now();
  const isNeg = target < 0;
  const abs = Math.abs(target);
  const update = now => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(abs * eased);
    el.textContent = '¥' + (isNeg ? '-' : '') + val.toLocaleString('ja-JP');
    if (t < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
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
  // ページ遷移フェードイン
  const main = document.getElementById('main-content');
  main.classList.remove('page-enter');
  requestAnimationFrame(() => requestAnimationFrame(() => main.classList.add('page-enter')));
  // モバイルサイドバーを閉じる（オーバーレイ含む）
  closeSidebar();
}

function renderCurrentPage() {
  const main = document.getElementById('main-content');
  switch (appState.page) {
    case 'dashboard':    main.innerHTML = renderDashboard(); bindDashboard(); break;
    case 'transactions': main.innerHTML = renderTransactions(); bindTransactions(); break;
    case 'reports':      main.innerHTML = renderReports(); bindReports(); break;
    case 'categories':   main.innerHTML = renderCategories(); bindCategories(); break;
    case 'settings':     main.innerHTML = renderSettings(); bindSettings(); break;
    case 'assets':       main.innerHTML = renderAssets(); bindAssets(); break;
    case 'goals':        main.innerHTML = renderGoals(); bindGoals(); break;
    case 'calendar':       main.innerHTML = renderCalendar(); bindCalendar(); break;  // v5.38
    case 'subscriptions':  main.innerHTML = renderSubscriptions(); bindSubscriptions(); break;  // v5.43
    case 'points':         main.innerHTML = renderPoints(); bindPoints(); break;                 // v5.47
    case 'wishlist':       main.innerHTML = renderWishlist(); bindWishlist(); break;             // v5.51
    case 'challenges':     main.innerHTML = renderChallenges(); bindChallenges(); break;          // v5.64
    case 'debts':          main.innerHTML = renderDebts(); bindDebts(); break;                   // v5.84
    case 'events':         main.innerHTML = renderEvents(); bindEvents(); break;                // v5.90
  }
  updateNavBadges(); // v6.7: サイドバーアラートバッジ更新
}

// ============================================================
// ダッシュボード
// ============================================================

// 初回ユーザー向けオンボーディング画面
function renderOnboarding() {
  return `
<div class="onboarding-hero">
  <span class="onboarding-icon">💰</span>
  <div class="onboarding-title">家計簿をはじめましょう！</div>
  <div class="onboarding-subtitle">家族みんなの収支を一元管理。<br>3ステップで今すぐスタートできます。</div>
  <button class="onboarding-cta" id="onboarding-add-btn">
    ＋ 最初の収支を入力する
  </button>
</div>

<div class="onboarding-steps">
  <div class="step-card" id="step-categories">
    <div class="step-num">1</div>
    <div class="step-icon">🏷️</div>
    <div>
      <div class="step-title">カテゴリを確認</div>
      <div class="step-desc">食費・光熱費など、よく使うカテゴリが最初から用意されています。</div>
    </div>
    <div class="step-action">カテゴリを見る →</div>
  </div>
  <div class="step-card" id="step-budget">
    <div class="step-num">2</div>
    <div class="step-icon">🎯</div>
    <div>
      <div class="step-title">予算を設定</div>
      <div class="step-desc">カテゴリごとに月の予算を決めると、使いすぎを防げます。</div>
    </div>
    <div class="step-action">予算を設定する →</div>
  </div>
  <div class="step-card" id="step-add-tx">
    <div class="step-num">3</div>
    <div class="step-icon">📝</div>
    <div>
      <div class="step-title">収支を入力</div>
      <div class="step-desc">右下の「＋」ボタンからいつでも収支を追加できます。</div>
    </div>
    <div class="step-action">今すぐ追加する →</div>
  </div>
</div>`;
}

function bindOnboarding() {
  const addBtn = document.getElementById('onboarding-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => document.getElementById('global-fab').click());

  const stepCat = document.getElementById('step-categories');
  if (stepCat) stepCat.addEventListener('click', () => navigate('categories'));

  const stepBudget = document.getElementById('step-budget');
  if (stepBudget) stepBudget.addEventListener('click', () => navigate('categories'));

  const stepAdd = document.getElementById('step-add-tx');
  if (stepAdd) stepAdd.addEventListener('click', () => document.getElementById('global-fab').click());
}

// ============================================================
// クイック収支入力ウィジェット (v5.74)
// ============================================================
function renderQuickAddWidget() {
  const type = appState.quickAddType || 'expense';
  const isOpen = appState.quickAddOpen;
  const cats = appData.categories.filter(c => c.type === type);
  const catOpts = cats.map(c => `<option value="${c.id}">${esc2(c.name)}</option>`).join('');

  return `
<div class="card qa-card" data-qa-type="${type}" id="qa-card">
  <button class="qa-toggle-btn" id="qa-toggle" aria-expanded="${isOpen}" aria-controls="qa-body">
    <span class="qa-toggle-left">
      <span class="card-title qa-card-title">⚡ クイック入力</span>
      <span class="qa-subtext">モーダルなしでサッと記録</span>
    </span>
    <span class="qa-chevron${isOpen ? ' qa-chevron-open' : ''}" aria-hidden="true">▾</span>
  </button>
  <div class="qa-body" id="qa-body"${isOpen ? '' : ' style="display:none"'}>
    <div class="qa-inner">
      <div class="qa-type-row">
        <button class="qa-type-btn${type === 'expense' ? ' qa-type-active' : ''}" data-qa-type="expense">支出</button>
        <button class="qa-type-btn${type === 'income' ? ' qa-type-active' : ''}" data-qa-type="income">収入</button>
      </div>
      <div class="qa-fields-row">
        <div class="qa-amount-wrap">
          <span class="qa-yen" aria-hidden="true">¥</span>
          <input type="number" id="qa-amount" class="qa-input qa-amount-input" placeholder="金額" min="1" inputmode="decimal">
        </div>
        <select id="qa-category" class="qa-input qa-cat-select">${catOpts}</select>
      </div>
      <div class="qa-memo-row">
        <input type="text" id="qa-memo" class="qa-input qa-memo-input" placeholder="メモ（任意）" maxlength="100">
        <button class="btn btn-primary qa-submit-btn" id="qa-submit">追加</button>
      </div>
    </div>
  </div>
</div>`;
}

// ============================================================
// 家計インサイト生成 (v5.40)
// ============================================================
function generateInsights(ym) {
  const insights = [];
  const txs = getTransactionsByMonth(ym);
  if (txs.length === 0) return insights;

  const today = new Date();
  const [y, m] = ym.split('-').map(Number);
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;

  const expense = calcTotal(txs, 'expense');
  const income  = calcTotal(txs, 'income');

  // 1. 残り日数の使える金額 / 赤字警告（今月 5日以降）
  if (isCurrentMonth && dayOfMonth >= 5) {
    const remaining = income - expense;
    const remainingDays = daysInMonth - dayOfMonth;
    if (remainingDays > 0) {
      if (remaining > 0) {
        const daily = Math.round(remaining / remainingDays);
        insights.push({
          type: 'info',
          icon: '💡',
          title: `残り${remainingDays}日間で使える目安`,
          desc: `1日あたり ${formatMoney(daily)} が目安です（残高 ${formatMoney(remaining)}）`,
        });
      } else {
        insights.push({
          type: 'alert',
          icon: '⚠️',
          title: '今月の収支がマイナスです',
          desc: `現在 ${formatMoney(Math.abs(remaining))} 赤字。支出を見直しましょう`,
        });
      }
    }
  }

  // 先月データを取得
  const prevDate = new Date(y, m - 2, 1);
  const prevYm   = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevTxs  = getTransactionsByMonth(prevYm);

  const catThis = {};
  const catPrev = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    catThis[t.categoryId] = (catThis[t.categoryId] || 0) + (Number(t.amount) || 0);
  });
  prevTxs.filter(t => t.type === 'expense').forEach(t => {
    catPrev[t.categoryId] = (catPrev[t.categoryId] || 0) + (Number(t.amount) || 0);
  });

  // 2. 支出スパイク（先月比 +30% かつ +¥3,000 以上）
  let maxSpike = null;
  Object.entries(catThis).forEach(([id, sum]) => {
    const prev = catPrev[id] || 0;
    if (prev > 0 && sum > prev * 1.3 && (sum - prev) >= 3000) {
      const pct = Math.round((sum - prev) / prev * 100);
      if (!maxSpike || pct > maxSpike.pct) maxSpike = { id, sum, prev, pct };
    }
  });
  if (maxSpike) {
    const cat = getCategoryById(maxSpike.id);
    if (cat) {
      insights.push({
        type: 'alert',
        icon: '📈',
        title: `${cat.name}が先月比 +${maxSpike.pct}%`,
        desc: `先月 ${formatMoney(maxSpike.prev)} → 今月 ${formatMoney(maxSpike.sum)}`,
      });
    }
  }

  // 3. 節約達成（先月比 -20% かつ ¥2,000 以上削減）
  let maxSaving = null;
  Object.entries(catPrev).forEach(([id, prev]) => {
    const sum = catThis[id] || 0;
    if (sum > 0 && prev > sum * 1.2 && (prev - sum) >= 2000) {
      const saved = prev - sum;
      if (!maxSaving || saved > maxSaving.saved) maxSaving = { id, sum, prev, saved };
    }
  });
  if (maxSaving) {
    const cat = getCategoryById(maxSaving.id);
    if (cat) {
      insights.push({
        type: 'success',
        icon: '✨',
        title: `${cat.name}で ${formatMoney(maxSaving.saved)} 節約`,
        desc: `先月 ${formatMoney(maxSaving.prev)} → 今月 ${formatMoney(maxSaving.sum)}`,
      });
    }
  }

  // 4. 無支出日のカウント（今月・3日以降）
  if (isCurrentMonth && dayOfMonth >= 3) {
    const spendDates = new Set(txs.filter(t => t.type === 'expense').map(t => t.date));
    let zeroCount = 0;
    for (let d = 1; d <= dayOfMonth; d++) {
      const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (!spendDates.has(ds)) zeroCount++;
    }
    if (zeroCount >= 3) {
      insights.push({
        type: 'success',
        icon: '🏆',
        title: `無支出日が ${zeroCount} 日あります`,
        desc: `今日まで ${dayOfMonth} 日中 ${zeroCount} 日は支出ゼロです`,
      });
    }
  }

  return insights.slice(0, 4);
}

// ============================================================
// 節約機会スキャン (v8.4)
// ============================================================
function detectSavingsOpportunities(ym) {
  const opps = [];
  const txs = getTransactionsByMonth(ym);
  if (txs.length === 0) return opps;

  const [y, m] = ym.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const prevYm   = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevTxs  = getTransactionsByMonth(prevYm);

  const catThis = {};
  const catPrev = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    catThis[t.categoryId] = (catThis[t.categoryId] || 0) + (Number(t.amount) || 0);
  });
  prevTxs.filter(t => t.type === 'expense').forEach(t => {
    catPrev[t.categoryId] = (catPrev[t.categoryId] || 0) + (Number(t.amount) || 0);
  });

  // 1. 予算超過カテゴリ
  const budgets = appData.budgets || {};
  appData.categories.filter(c => c.type === 'expense' && budgets[c.id] > 0).forEach(c => {
    const spent  = catThis[c.id] || 0;
    const budget = budgets[c.id];
    if (spent > budget) {
      const over = spent - budget;
      opps.push({
        severity: 'high',
        icon: '⚠️',
        title: `${c.name}が予算超過`,
        desc: `予算 ${formatMoney(budget)} に対して ${formatMoney(spent)} 使用（${formatMoney(over)} オーバー）`,
        saving: over,
        categoryId: c.id,
        categoryName: c.name,
        categoryColor: c.color,
        challengeType: 'budget',
        challengeTarget: budget,
        emoji: '🎯',
      });
    }
  });

  // 2. 先月比30%以上・¥3,000以上増加カテゴリ（未予算含む）
  Object.entries(catThis).forEach(([id, sum]) => {
    const prev = catPrev[id] || 0;
    if (prev > 0 && sum > prev * 1.3 && (sum - prev) >= 3000) {
      const pct  = Math.round((sum - prev) / prev * 100);
      const cat  = getCategoryById(id);
      if (!cat) return;
      // 予算超過ですでに追加済みなら重複しない
      if (opps.find(o => o.categoryId === id)) return;
      const suggested = Math.round(sum * 0.9 / 1000) * 1000; // 10%削減目標
      opps.push({
        severity: 'medium',
        icon: '📈',
        title: `${cat.name}が先月比 ${pct}% 増`,
        desc: `先月 ${formatMoney(prev)} → 今月 ${formatMoney(sum)}。10%削減なら ${formatMoney(sum - suggested)} 節約`,
        saving: sum - suggested,
        categoryId: id,
        categoryName: cat.name,
        categoryColor: cat.color,
        challengeType: 'budget',
        challengeTarget: suggested,
        emoji: '📉',
      });
    }
  });

  // 3. サブスク合計が月支出の20%超
  const activeSubs = (appData.subscriptions || []).filter(s => !s.paused);
  if (activeSubs.length >= 3) {
    const totalExpense = calcTotal(txs, 'expense');
    const monthlySubTotal = activeSubs.reduce((sum, s) => {
      const amt = Number(s.amount) || 0;
      return sum + (s.cycle === 'yearly' ? Math.round(amt / 12) : amt);
    }, 0);
    if (totalExpense > 0 && monthlySubTotal > totalExpense * 0.2) {
      opps.push({
        severity: 'medium',
        icon: '📱',
        title: `サブスク合計が支出の ${Math.round(monthlySubTotal / totalExpense * 100)}%`,
        desc: `月 ${formatMoney(monthlySubTotal)} のサブスク費。1〜2件見直すと年間 ${formatMoney(monthlySubTotal * 2)} 以上節約できる可能性があります`,
        saving: monthlySubTotal * 0.2,
        categoryId: null,
        challengeType: null,
        emoji: '✂️',
        actionLabel: 'サブスクを確認 →',
        actionPage: 'subscriptions',
      });
    }
  }

  // 4. 支出上位カテゴリで先月と比べて削減余地あり（先月より10%以上減らせた実績がある）
  const sorted = Object.entries(catThis).sort((a, b) => b[1] - a[1]).slice(0, 3);
  sorted.forEach(([id, sum]) => {
    const prev = catPrev[id] || 0;
    // 先月より高い かつ 予算超過でもスパイクでもない場合
    if (prev > 0 && sum > prev && !opps.find(o => o.categoryId === id)) {
      // 3ヶ月前のデータも確認して平均と比較
      const prev2Date = new Date(y, m - 3, 1);
      const prev2Ym   = `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, '0')}`;
      const prev2Txs  = getTransactionsByMonth(prev2Ym);
      const prev2Sum  = prev2Txs.filter(t => t.type === 'expense' && t.categoryId === id)
                                 .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      if (prev2Sum > 0 && prev > prev2Sum * 1.2 && sum > prev2Sum * 1.2) {
        const cat = getCategoryById(id);
        if (!cat) return;
        const suggested = Math.round(prev2Sum / 1000) * 1000 || Math.round(sum * 0.85 / 1000) * 1000;
        opps.push({
          severity: 'low',
          icon: '💡',
          title: `${cat.name}の支出が高止まり`,
          desc: `2ヶ月前 ${formatMoney(prev2Sum)} → 先月 ${formatMoney(prev)} → 今月 ${formatMoney(sum)}。目標 ${formatMoney(suggested)} に設定してみましょう`,
          saving: sum - suggested,
          categoryId: id,
          categoryName: cat.name,
          categoryColor: cat.color,
          challengeType: 'budget',
          challengeTarget: suggested,
          emoji: '🏆',
        });
      }
    }
  });

  return opps.slice(0, 5);
}

function renderSavingsOppsWidget(ym) {
  const opps = detectSavingsOpportunities(ym);
  if (opps.length === 0) return '';

  const totalSaving = opps.reduce((s, o) => s + (o.saving || 0), 0);
  const cards = opps.map((o, i) => {
    const clr = o.severity === 'high' ? 'var(--danger-text)' : o.severity === 'medium' ? 'var(--warning)' : 'var(--primary)';
    const actionBtn = o.challengeType
      ? `<button class="btn btn-sm opp-challenge-btn"
           data-cat="${o.categoryId || ''}"
           data-type="${o.challengeType}"
           data-target="${o.challengeTarget || ''}"
           data-name="${esc2(o.categoryName ? `${o.categoryName}節約チャレンジ` : 'サブスク節約')}"
           data-emoji="${o.emoji || '🏆'}"
           data-color="${clr}">
           🏆 チャレンジを作成
         </button>`
      : o.actionPage
        ? `<button class="btn btn-sm btn-ghost" onclick="navigate('${o.actionPage}')">
             ${esc2(o.actionLabel || '確認する')}
           </button>`
        : '';
    return `<div class="opp-card opp-sev-${o.severity}" style="--opp-accent:${clr};--opp-i:${i}">
      <div class="opp-card-left">
        <div class="opp-icon" style="background:${clr}22;color:${clr}">${o.icon}</div>
      </div>
      <div class="opp-card-body">
        <div class="opp-title">${esc2(o.title)}</div>
        <div class="opp-desc">${esc2(o.desc)}</div>
        ${o.saving > 0 ? `<div class="opp-saving">節約可能額 <strong>${formatMoney(Math.round(o.saving))}</strong></div>` : ''}
      </div>
      ${actionBtn ? `<div class="opp-card-action">${actionBtn}</div>` : ''}
    </div>`;
  }).join('');

  return makeCollapsibleCard('savingsOpps',
    `<h3 class="card-title">🔍 節約機会スキャン</h3>
     <span class="opp-header-badge">${opps.length}件 / 合計 ${formatMoney(Math.round(totalSaving))} 節約できる可能性</span>`,
    `<div class="opp-list">${cards}</div>`,
    'opp-widget-card'
  );
}

// ============================================================
// 家計スコアカード (v5.49)
// ============================================================
function calculateHealthScore(ym) {
  const txs    = getTransactionsByMonth(ym);
  if (txs.length === 0) return null;

  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');
  const items   = [];
  let   total   = 0;

  // 1. 収支バランス (max 40pt) — 貯蓄率に応じて点数化
  let balScore = 0;
  if (income > 0) {
    const rate = (income - expense) / income;
    if      (rate >= 0.30) balScore = 40;
    else if (rate >= 0.20) balScore = 34;
    else if (rate >= 0.10) balScore = 26;
    else if (rate >= 0.05) balScore = 18;
    else if (rate >= 0)    balScore = 8;
    else                   balScore = 0; // 赤字
  } else if (expense === 0) {
    balScore = 40;
  }
  items.push({ label: '収支バランス', icon: '💰', score: balScore, max: 40 });
  total += balScore;

  // 2. 予算管理 (max 30pt) — 設定済み予算の遵守率
  const budgets    = appData.budgets || {};
  const budgetCats = appData.categories.filter(c => c.type === 'expense' && (budgets[c.id] || 0) > 0);
  let   budgetScore = 15; // 予算未設定は中間点
  if (budgetCats.length > 0) {
    const spentMap = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
      spentMap[t.categoryId] = (spentMap[t.categoryId] || 0) + (Number(t.amount) || 0);
    });
    const overCount = budgetCats.filter(c => (spentMap[c.id] || 0) > (budgets[c.id] || 0)).length;
    budgetScore = Math.round(30 * (1 - overCount / budgetCats.length));
  }
  items.push({ label: '予算管理', icon: '📊', score: budgetScore, max: 30 });
  total += budgetScore;

  // 3. 記録習慣 (max 15pt) — 経過日数の25%以上の日に記録があれば満点
  const today          = new Date();
  const [y, m]         = ym.split('-').map(Number);
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
  const daysElapsed    = isCurrentMonth ? today.getDate() : new Date(y, m, 0).getDate();
  const txDays         = new Set(txs.map(t => t.date)).size;
  const density        = Math.min(txDays / Math.max(1, daysElapsed * 0.25), 1);
  const recordScore    = Math.round(density * 15);
  items.push({ label: '記録習慣', icon: '📝', score: recordScore, max: 15 });
  total += recordScore;

  // 4. 支出バランス (max 15pt) — 特定1カテゴリへの集中度
  const expTxs = txs.filter(t => t.type === 'expense');
  let diversityScore = 15;
  if (expTxs.length > 0 && expense > 0) {
    const catTotals = {};
    expTxs.forEach(t => {
      catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + (Number(t.amount) || 0);
    });
    const maxShare = Math.max(...Object.values(catTotals)) / expense;
    if      (maxShare <= 0.35) diversityScore = 15;
    else if (maxShare <= 0.50) diversityScore = 11;
    else if (maxShare <= 0.65) diversityScore = 7;
    else if (maxShare <= 0.80) diversityScore = 3;
    else                       diversityScore = 1;
  }
  items.push({ label: '支出バランス', icon: '⚖️', score: diversityScore, max: 15 });
  total += diversityScore;

  // グレード判定
  let grade, gradeClass, msg;
  if      (total >= 90) { grade = 'S'; gradeClass = 'hs-grade-s'; msg = '完璧！理想的な家計管理です'; }
  else if (total >= 75) { grade = 'A'; gradeClass = 'hs-grade-a'; msg = 'とても良い！継続して改善しましょう'; }
  else if (total >= 60) { grade = 'B'; gradeClass = 'hs-grade-b'; msg = '良好です。予算管理を意識しましょう'; }
  else if (total >= 45) { grade = 'C'; gradeClass = 'hs-grade-c'; msg = '改善の余地あり。支出を見直しましょう'; }
  else                  { grade = 'D'; gradeClass = 'hs-grade-d'; msg = '要注意。家計の見直しが必要です'; }

  return { total, items, grade, gradeClass, msg };
}

function renderHealthScoreCard(ym) {
  const hs = calculateHealthScore(ym);
  if (!hs) return '';

  const gradeColors = { S: 'var(--primary)', A: 'var(--success)', B: 'var(--info-text)', C: 'var(--warning)', D: 'var(--danger-text)' };
  const gradeColor  = gradeColors[hs.grade] || 'var(--primary)';
  const gaugeOffset = (163.36 * (1 - hs.total / 100)).toFixed(2);

  // v7.1: 過去6ヶ月スコア推移スパークライン
  const trendMonths = [];
  for (let i = 5; i >= 0; i--) trendMonths.push(adjMonth(ym, -i));
  const trendScores = trendMonths.map(m => {
    const s = calculateHealthScore(m);
    return s ? s.total : null;
  });
  const validScores = trendScores.filter(s => s !== null);
  let trendHtml = '';
  let trendBadgeHtml = '';
  if (validScores.length >= 2) {
    // 先月比バッジ
    const prevScore = trendScores[trendScores.length - 2];
    const currScore = trendScores[trendScores.length - 1];
    if (prevScore !== null && currScore !== null) {
      const diff = currScore - prevScore;
      const diffAbs = Math.abs(diff);
      const diffCls = diff > 0 ? 'hs-trend-up' : diff < 0 ? 'hs-trend-down' : 'hs-trend-flat';
      const diffIcon = diff > 0 ? '▲' : diff < 0 ? '▼' : '─';
      trendBadgeHtml = `<span class="hs-prev-badge ${diffCls}">${diffIcon} ${diffAbs > 0 ? diffAbs + 'pt' : '変動なし'}</span>`;
    }
    // SVGスパークライン生成
    const W = 200, H = 40, PAD = 6;
    const minS = Math.max(0, Math.min(...validScores) - 5);
    const maxS = Math.min(100, Math.max(...validScores) + 5);
    const range = maxS - minS || 1;
    const step = (W - PAD * 2) / (trendMonths.length - 1);
    const points = trendScores.map((s, i) => {
      if (s === null) return null;
      const x = PAD + i * step;
      const y = H - PAD - ((s - minS) / range) * (H - PAD * 2);
      return { x, y, s, m: trendMonths[i] };
    }).filter(Boolean);
    // グラデーション塗りのパスを生成
    const linePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaPath = points.length >= 2
      ? `M${points[0].x},${H} ` + points.map(p => `L${p.x},${p.y}`).join(' ') + ` L${points[points.length-1].x},${H} Z`
      : '';
    // 点とラベル
    const dots = points.map((p, i) => {
      const isLast = i === points.length - 1;
      const labelY = p.y > H / 2 ? p.y - 5 : p.y + 12;
      const labelX = Math.max(PAD + 8, Math.min(W - PAD - 8, p.x));
      const monthLabel = Number(p.m.slice(5)) + '月'; // M月
      return `<circle class="hs-spark-dot${isLast ? ' hs-spark-dot-last' : ''}" cx="${p.x}" cy="${p.y}" r="${isLast ? 4 : 2.5}" fill="${isLast ? gradeColor : 'var(--text-muted)'}"/>
      ${isLast ? `<text class="hs-spark-label hs-spark-label-now" x="${labelX}" y="${labelY}" text-anchor="middle" fill="${gradeColor}">${p.s}</text>` : ''}`;
    }).join('');
    trendHtml = `<div class="hs-trend-wrap">
      <div class="hs-trend-header">
        <span class="hs-trend-label">過去6ヶ月の推移</span>
        ${trendBadgeHtml}
      </div>
      <svg class="hs-spark-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hs-spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${gradeColor}" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="${gradeColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${areaPath ? `<path d="${areaPath}" fill="url(#hs-spark-grad)"/>` : ''}
        ${points.length >= 2 ? `<polyline class="hs-spark-line" points="${linePoints}" stroke="${gradeColor}" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        ${dots}
      </svg>
      <div class="hs-spark-months">
        ${trendMonths.map(m => `<span>${Number(m.slice(5))}月</span>`).join('')}
      </div>
    </div>`;
  }

  const itemsHtml = hs.items.map((item, i) => {
    const ratio    = item.score / item.max;
    const pctW     = Math.round(ratio * 100);
    const barColor = ratio >= 0.8 ? gradeColor : ratio >= 0.5 ? 'var(--warning)' : 'var(--danger-text)';
    return `<div class="hs-item hs-d${i}">
      <div class="hs-item-header">
        <span class="hs-item-label">${item.icon} ${item.label}</span>
        <span class="hs-item-score">${item.score}<span class="hs-item-max">/${item.max}</span></span>
      </div>
      <div class="hs-bar-track">
        <div class="hs-bar-fill" style="width:${pctW}%;--hs-bar-color:${barColor}"></div>
      </div>
    </div>`;
  }).join('');

  return `<div class="card health-score-card" style="--hs-grade-color:${gradeColor}">
  <div class="card-header-row">
    <h3 class="card-title">🏅 家計スコア</h3>
    <div class="hs-grade-badge ${hs.gradeClass}">${hs.grade}</div>
  </div>
  <div class="hs-main">
    <div class="hs-gauge-wrap">
      <svg class="hs-gauge-svg" viewBox="0 0 120 74" aria-hidden="true">
        <circle class="hs-gauge-track" cx="60" cy="68" r="52"
          transform="rotate(180 60 68)" stroke-dasharray="163.36 163.36"/>
        <circle class="hs-gauge-fill" cx="60" cy="68" r="52"
          transform="rotate(180 60 68)"
          style="stroke-dashoffset:${gaugeOffset};stroke:${gradeColor}"/>
      </svg>
      <div class="hs-gauge-text">
        <span class="hs-score-num js-hs-countup" data-value="${hs.total}">0</span>
        <span class="hs-score-unit">点</span>
      </div>
    </div>
    <div class="hs-msg">${hs.msg}</div>
  </div>
  <div class="hs-items">${itemsHtml}</div>
  ${trendHtml}
</div>`;
}

// ============================================================
// 今月末収支予測 (v5.57 / v5.58 デザイン強化)
// ============================================================
function calculateForecast(ym) {
  const today = new Date();
  const [y, m] = ym.split('-').map(Number);
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
  if (!isCurrentMonth) return null; // 当月のみ対象

  const dayOfMonth  = today.getDate();
  const daysInMonth = new Date(y, m, 0).getDate();
  if (dayOfMonth < 3) return null;  // 月初3日未満はデータ不足で非表示

  const txs    = getTransactionsByMonth(ym);
  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');

  // 日別累積支出（スパークライン用）
  const dailyMap = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    const d = parseInt(t.date.slice(8), 10);
    dailyMap[d] = (dailyMap[d] || 0) + (Number(t.amount) || 0);
  });
  const cumulativeExpense = []; // index 0 = day1
  let cum = 0;
  for (let d = 1; d <= dayOfMonth; d++) {
    cum += dailyMap[d] || 0;
    cumulativeExpense.push(cum);
  }

  // 日割り外挿
  const dailyExpense = expense / dayOfMonth;
  const dailyIncome  = income  / dayOfMonth;
  const fcastExpense = Math.round(dailyExpense * daysInMonth);
  const fcastIncome  = Math.round(dailyIncome  * daysInMonth);
  const fcastBalance = fcastIncome - fcastExpense;

  // 過去3ヶ月平均支出
  let avg3Expense = 0;
  let avg3Count   = 0;
  for (let i = 1; i <= 3; i++) {
    const d  = new Date(y, m - 1 - i, 1);
    const pm = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const ptxs = getTransactionsByMonth(pm);
    if (ptxs.length > 0) { avg3Expense += calcTotal(ptxs, 'expense'); avg3Count++; }
  }
  const avg3 = avg3Count > 0 ? Math.round(avg3Expense / avg3Count) : null;

  // ステータス判定
  let status, statusLabel;
  if (fcastBalance >= 0 && (avg3 === null || fcastExpense <= avg3)) {
    status = 'good';   statusLabel = '黒字見込み ✓';
  } else if (fcastBalance >= 0) {
    status = 'caution'; statusLabel = '黒字見込み';
  } else {
    status = 'alert';  statusLabel = '赤字見込み';
  }

  const lowConfidence = dayOfMonth < 8; // 月初7日以内は低信頼度

  return {
    dayOfMonth, daysInMonth,
    fcastExpense, fcastIncome, fcastBalance,
    avg3,
    status, statusLabel,
    lowConfidence,
    cumulativeExpense,
  };
}

// SVGスパークライン生成 (v5.58)
function buildForecastSparkline(fc) {
  const W = 280, H = 48, PAD = 4;
  const daysInMonth = fc.daysInMonth;
  const dayOfMonth  = fc.dayOfMonth;
  const maxVal = Math.max(fc.fcastExpense, fc.avg3 || 0, 1);

  const xOf = d => PAD + (d - 1) / (daysInMonth - 1) * (W - PAD * 2);
  const yOf = v => H - PAD - (v / maxVal) * (H - PAD * 2);

  // 実績パス（day1〜today）
  let actualD = '';
  fc.cumulativeExpense.forEach((v, i) => {
    const x = xOf(i + 1);
    const y = yOf(v);
    actualD += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  });

  // 予測パス（today〜month-end）
  const todayX = xOf(dayOfMonth);
  const todayY = yOf(fc.cumulativeExpense[dayOfMonth - 1] || 0);
  const endX   = xOf(daysInMonth);
  const endY   = yOf(fc.fcastExpense);
  const forecastD = `M${todayX},${todayY} L${endX},${endY}`;

  // 3ヶ月平均ライン
  let avgLine = '';
  if (fc.avg3) {
    const ay = yOf(fc.avg3);
    avgLine = `<line class="fc-spark-avg" x1="${PAD}" y1="${ay}" x2="${W - PAD}" y2="${ay}"/>`;
  }

  // 実績エリア（グラデーション塗り）
  const areaD = actualD + ` L${xOf(dayOfMonth)},${H - PAD} L${xOf(1)},${H - PAD} Z`;

  return `<svg class="fc-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
  <defs>
    <linearGradient id="fc-spark-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--fc-spark-color, var(--expense))" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="var(--fc-spark-color, var(--expense))" stop-opacity="0.03"/>
    </linearGradient>
  </defs>
  ${avgLine}
  <path class="fc-spark-area" d="${areaD}" fill="url(#fc-spark-grad)"/>
  <path class="fc-spark-actual" d="${actualD}"/>
  <path class="fc-spark-forecast" d="${forecastD}"/>
  <circle class="fc-spark-today-dot" cx="${todayX}" cy="${todayY}" r="3"/>
</svg>`;
}

// ── 年次累計サマリーウィジェット (v6.4) ───────────────────
// 月別支出スパークライン SVG 生成（v6.5）
function makeYrSparkline(values) {
  const nonZero = values.filter(v => v > 0);
  if (nonZero.length < 2) return '';
  const W = 280, H = 44;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [
    Math.round((i / 11) * (W - 10) + 5),
    Math.round(H - 5 - (v / max) * (H - 12))
  ]);
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const fillPath = `M${pts[0][0]},${H} ${pts.map(p => `L${p[0]},${p[1]}`).join(' ')} L${pts[11][0]},${H} Z`;
  const curM = new Date().getMonth();
  const [dx, dy] = pts[curM];
  return `<svg class="yr-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="yr-sg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--danger-text)" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="var(--danger-text)" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <path d="${fillPath}" fill="url(#yr-sg)"/>
    <path d="${linePath}" fill="none" stroke="var(--danger-text)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${dx}" cy="${dy}" r="3" fill="var(--danger-text)" stroke="white" stroke-width="1.5"/>
  </svg>`;
}

function renderYearSummaryWidget() {
  const year = new Date().getFullYear();
  const s = getYearStats(year);
  if (s.income === 0 && s.expense === 0) return '';

  const savingsColor = s.savingsRate >= 20 ? 'success' : s.savingsRate >= 10 ? 'warn' : 'danger';
  const savingsIcon  = s.savingsRate >= 20 ? '✓' : s.savingsRate >= 10 ? '△' : '↓';
  const yearPct = Math.round(s.elapsedMonths / 12 * 100);

  let prevBadge = '';
  if (s.hasPrevYear && s.prevExpense > 0) {
    const diff = Math.round((s.expense - s.prevExpense) / s.prevExpense * 100);
    const cls  = diff <= 0 ? 'yr-prev-down' : 'yr-prev-up';
    prevBadge = `<span class="yr-prev-badge ${cls}">${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}% 前年比</span>`;
  }

  let topCatHtml = '';
  if (s.topCatId) {
    const cat = getCategoryById(s.topCatId);
    if (cat) {
      topCatHtml = `<div class="yr-topcat">
        <span class="yr-topcat-label">最多支出</span>
        <span class="cat-badge" style="background:${cat.color}20;color:${cat.color}">${cat.name}</span>
        <span class="yr-topcat-amt">${formatMoney(s.topCatAmount)}</span>
      </div>`;
    }
  }

  const prevIncomeDiff = (s.hasPrevYear && s.prevIncome > 0)
    ? (() => { const d = Math.round((s.income - s.prevIncome) / s.prevIncome * 100); return `<div class="yr-cell-sub ${d >= 0 ? 'yr-up' : 'yr-down'}">${d >= 0 ? '▲' : '▼'}${Math.abs(d)}% 前年比</div>`; })()
    : '';

  const sparkline = makeYrSparkline(s.monthlyExpenses);

  return `<div class="card yr-widget-card">
  <div class="card-header-row">
    <h3 class="card-title">📆 ${year}年の家計</h3>
    <span class="yr-elapsed-badge">${s.elapsedMonths}ヶ月経過</span>
  </div>
  <div class="yr-cells">
    <div class="yr-cell yr-cell-income" style="--yr-i:0">
      <div class="yr-cell-label">年間収入</div>
      <div class="yr-cell-value js-countup" data-value="${s.income}">${formatMoney(s.income)}</div>
      ${prevIncomeDiff}
    </div>
    <div class="yr-cell yr-cell-expense" style="--yr-i:1">
      <div class="yr-cell-label">年間支出</div>
      <div class="yr-cell-value js-countup" data-value="${s.expense}">${formatMoney(s.expense)}</div>
      ${prevBadge}
    </div>
    <div class="yr-cell yr-cell-savings yr-cell-savings-${savingsColor}" style="--yr-i:2">
      <div class="yr-cell-label">貯蓄率</div>
      <div class="yr-cell-value">${savingsIcon} ${s.savingsRate}<span class="yr-unit">%</span></div>
      <div class="yr-cell-sub">${formatMoney(s.savings)} 貯蓄</div>
    </div>
  </div>
  ${sparkline ? `<div class="yr-spark-wrap">${sparkline}</div>` : ''}
  <div class="yr-progress-wrap">
    <div class="yr-progress-label">
      <span>年間進捗</span><span>${yearPct}%（${s.elapsedMonths}/12ヶ月）</span>
    </div>
    <div class="yr-progress-track">
      <div class="yr-progress-fill" style="width:${yearPct}%" data-yr-animate="1"></div>
    </div>
  </div>
  <div class="yr-footer">
    <div class="yr-avg yr-avg-expense">
      <span class="yr-avg-label">月平均支出</span>
      <span class="yr-avg-val js-countup" data-value="${s.avgMonthlyExpense}">${formatMoney(s.avgMonthlyExpense)}</span>
    </div>
    <div class="yr-avg yr-avg-income-card">
      <span class="yr-avg-label">月平均収入</span>
      <span class="yr-avg-val yr-avg-income js-countup" data-value="${s.avgMonthlyIncome}">${formatMoney(s.avgMonthlyIncome)}</span>
    </div>
    ${topCatHtml}
  </div>
</div>`;
}

function renderForecastCard(ym) {
  const fc = calculateForecast(ym);
  if (!fc) return '';

  const statusColors = { good: 'var(--success)', caution: 'var(--primary)', alert: 'var(--danger-text)' };
  const statusBg     = { good: 'var(--success-bg)', caution: 'var(--primary-light)', alert: 'var(--danger-bg)' };
  const sparkColors  = { good: 'var(--success)', caution: 'var(--primary)', alert: 'var(--danger-text)' };
  const color    = statusColors[fc.status];
  const bgColor  = statusBg[fc.status];
  const sparkCol = sparkColors[fc.status];
  const balSign  = fc.fcastBalance >= 0 ? '+' : '-';
  const pct      = Math.round(fc.dayOfMonth / fc.daysInMonth * 100);

  // 平均比較バッジ（支出予測 vs 3ヶ月平均）
  let avgBadge = '';
  if (fc.avg3 !== null) {
    const diff    = fc.fcastExpense - fc.avg3;
    const diffPct = Math.round(Math.abs(diff) / fc.avg3 * 100);
    if (diff > 0) {
      avgBadge = `<span class="fc-avg-badge fc-avg-up">↑${diffPct}%</span>`;
    } else if (diff < 0) {
      avgBadge = `<span class="fc-avg-badge fc-avg-down">↓${diffPct}%</span>`;
    }
  }

  const sparklineSvg = buildForecastSparkline(fc);

  return `<div class="card forecast-card fc-status-${fc.status}" style="--fc-color:${color};--fc-bg:${bgColor};--fc-spark-color:${sparkCol}">
  <div class="card-header-row">
    <h3 class="card-title">📈 今月末の見込み</h3>
    <span class="fc-status-badge fc-${fc.status}">${fc.statusLabel}</span>
  </div>
  ${fc.lowConfidence ? `<div class="fc-low-conf">⚡ 経過${fc.dayOfMonth}日のため参考値です</div>` : ''}
  <div class="fc-progress-wrap">
    <div class="fc-progress-track">
      <div class="fc-progress-fill" style="width:${pct}%"></div>
      <div class="fc-progress-today" style="left:${pct}%"></div>
    </div>
    <span class="fc-progress-label">${fc.dayOfMonth}日 / ${fc.daysInMonth}日</span>
  </div>
  ${sparklineSvg}
  <div class="fc-grid">
    <div class="fc-cell" style="--fc-i:0">
      <div class="fc-cell-label">予測支出</div>
      <div class="fc-cell-amount expense js-fc-countup" data-value="${fc.fcastExpense}">¥0</div>
      ${fc.avg3 !== null ? `<div class="fc-cell-hint">3ヶ月平均 ${formatMoney(fc.avg3)} ${avgBadge}</div>` : ''}
    </div>
    <div class="fc-cell" style="--fc-i:1">
      <div class="fc-cell-label">予測収入</div>
      <div class="fc-cell-amount income js-fc-countup" data-value="${fc.fcastIncome}">¥0</div>
    </div>
    <div class="fc-cell fc-cell-balance" style="--fc-i:2">
      <div class="fc-cell-label">予測残高</div>
      <div class="fc-cell-amount js-fc-countup" data-value="${fc.fcastBalance}" style="color:${color}">${balSign}¥0</div>
    </div>
  </div>
</div>`;
}

// ── 月次ノートカード（v5.76）──────────────────────────────
function renderNotesCard(month) {
  const notes = appData.notes || {};
  const note = notes[month] || {};
  const text = note.text || '';
  const updatedAt = note.updatedAt || '';

  let savedAtHtml = '';
  if (updatedAt) {
    const d = new Date(updatedAt);
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    const hh = d.getHours();
    const mn = String(d.getMinutes()).padStart(2, '0');
    savedAtHtml = `<span class="nt-saved-at">${mm}/${dd} ${hh}:${mn} 更新</span>`;
  }

  const initPct = Math.round(text.length / 500 * 100);
  const initProgCls = initPct >= 96 ? 'nt-prog-danger' : initPct >= 80 ? 'nt-prog-warn' : '';
  const initCntCls  = initPct >= 96 ? 'nt-cnt-danger'  : initPct >= 80 ? 'nt-cnt-warn'  : '';

  return `<div class="card nt-card">
  <div class="card-header-row">
    <h3 class="card-title">📝 今月のメモ</h3>
    ${savedAtHtml}
  </div>
  <textarea id="nt-textarea" class="nt-textarea"
    placeholder="今月の家計目標や振り返りをメモしましょう&#10;例）食費を2万円以内に！ / 旅行代を貯める月"
    maxlength="500">${esc2(text)}</textarea>
  <div class="nt-progress-bar"><div class="nt-progress-fill ${initProgCls}" id="nt-prog-fill" style="width:${initPct}%"></div></div>
  <div class="nt-footer">
    <span class="nt-char-count ${initCntCls}" id="nt-char-wrap"><span id="nt-chars">${text.length}</span>/500</span>
    <span class="nt-status" id="nt-status"></span>
  </div>
</div>`;
}

// ============================================================
// カテゴリ別前月比ウィジェット (v6.3)
// ============================================================
function renderCategoryCompareWidget(ym) {
  const [y, m] = ym.split('-').map(Number);
  const prevYm = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`;
  const thisTxs = getTransactionsByMonth(ym).filter(t => t.type === 'expense');
  const prevTxs = getTransactionsByMonth(prevYm).filter(t => t.type === 'expense');
  const thisMap = {}, prevMap = {};
  thisTxs.forEach(t => { thisMap[t.categoryId] = (thisMap[t.categoryId] || 0) + (Number(t.amount) || 0); });
  prevTxs.forEach(t => { prevMap[t.categoryId] = (prevMap[t.categoryId] || 0) + (Number(t.amount) || 0); });
  const allCids = [...new Set([...Object.keys(thisMap), ...Object.keys(prevMap)])];
  const diffs = allCids.filter(cid => prevMap[cid] > 0 && thisMap[cid] > 0).map(cid => {
    const cat = getCategoryById(cid);
    if (!cat) return null;
    const prev = prevMap[cid], curr = thisMap[cid], diff = curr - prev;
    const pct = Math.round(diff / prev * 100);
    return { cat, curr, prev, diff, pct };
  }).filter(Boolean);
  const increased = diffs.filter(d => d.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const decreased = diffs.filter(d => d.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 3);
  if (increased.length === 0 && decreased.length === 0) return '';
  const row = ({ cat, pct, curr }, idx) => `<div class="cc-item" style="--cci:${idx}">
  <span class="cc-dot" style="background:${cat.color}"></span>
  <span class="cc-name">${esc2(cat.name)}</span>
  <span class="cc-amount">${formatMoney(curr)}</span>
  <span class="cc-badge ${pct > 0 ? 'cc-up' : 'cc-down'}">${pct > 0 ? '▲' : '▼'}${Math.abs(pct)}%</span>
</div>`;
  const ccBody = `<div class="cc-cols">
    ${increased.length > 0 ? `<div class="cc-col">
      <div class="cc-col-header cc-col-up">⬆ 増加カテゴリ</div>
      ${increased.map(row).join('')}
    </div>` : ''}
    ${decreased.length > 0 ? `<div class="cc-col">
      <div class="cc-col-header cc-col-down">⬇ 節約カテゴリ</div>
      ${decreased.map(row).join('')}
    </div>` : ''}
  </div>`;
  return makeCollapsibleCard('categoryCompare',
    `<h3 class="card-title">📊 先月との比較</h3><button class="btn-link" onclick="navigate('reports')">レポート →</button>`,
    ccBody, 'cc-widget-card');
}

// ============================================================
// 月間支出ペースウィジェット (v9.1)
// ============================================================
function renderPaceWidget(ym) {
  const today = new Date();
  const [y, m] = ym.split('-').map(Number);
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
  const daysInMonth = new Date(y, m, 0).getDate();
  const daysPassed = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysPct = Math.round(daysPassed / daysInMonth * 100);

  const txs = getTransactionsByMonth(ym);
  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');

  // 予算合計または収入を基準値に使用
  const budgets = appData.budgets || {};
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);
  const reference = totalBudget > 0 ? totalBudget : income;
  if (reference === 0) return '';

  const expensePct = Math.round(expense / reference * 100);
  const cappedPct  = Math.min(expensePct, 100);
  const diff = expensePct - daysPct;

  let statusCls, statusText;
  if (diff <= -10) {
    statusCls  = 'pace-good';
    statusText = '👍 ペース良好';
  } else if (diff <= 10) {
    statusCls  = 'pace-warn';
    statusText = '⚠️ 概ね順調';
  } else {
    statusCls  = 'pace-over';
    statusText = '🚨 ペース速め';
  }

  const refLabel = totalBudget > 0 ? '予算' : '収入';
  const msg = diff <= -10
    ? `月の${daysPct}%経過・${refLabel}の${expensePct}%消化 — 余裕があります`
    : diff <= 10
    ? `月の${daysPct}%経過・${refLabel}の${expensePct}%消化 — 概ね順調です`
    : `月の${daysPct}%経過・${refLabel}の${expensePct}%消化 — 支出ペースが速めです`;

  // 1日あたり残り予算 (v9.2)
  const remaining = reference - expense;
  const daysLeft  = isCurrentMonth ? daysInMonth - daysPassed + 1 : 1; // +1: 今日含む
  const dailyLeft = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0;
  const dailyCls  = dailyLeft >= 0 ? (diff <= -10 ? 'pace-good' : diff <= 10 ? 'pace-warn' : 'pace-over') : 'pace-over';
  const dailySection = isCurrentMonth ? `
  <div class="pace-daily-grid">
    <div class="pace-daily-cell">
      <div class="pace-daily-label">残り${refLabel}</div>
      <div class="pace-daily-val ${remaining < 0 ? 'pace-over' : ''}">${formatMoney(Math.abs(remaining))}${remaining < 0 ? '<span class="pace-daily-over">超過</span>' : ''}</div>
    </div>
    <div class="pace-daily-cell">
      <div class="pace-daily-label">残り日数</div>
      <div class="pace-daily-val">${daysLeft}<span class="pace-unit">日</span></div>
    </div>
    <div class="pace-daily-cell pace-daily-highlight">
      <div class="pace-daily-label">今日使える目安</div>
      <div class="pace-daily-val ${dailyCls}">${dailyLeft >= 0 ? formatMoney(dailyLeft) : '−'}<span class="pace-unit">/日</span></div>
    </div>
  </div>` : '';

  return makeCollapsibleCard('pace',
    `<h3 class="card-title">⏱️ 支出ペース</h3><span class="pace-status-badge ${statusCls}">${statusText}</span>`,
    `<div class="pace-widget-body pace-status-${statusCls.replace('pace-','')}">
  <div class="pace-bars">
    <div class="pace-bar-row" style="--pbr-i:0">
      <div class="pace-bar-label">月の経過</div>
      <div class="pace-bar-track"><div class="pace-bar-fill pace-bar-days" style="width:${daysPct}%"></div></div>
      <div class="pace-bar-value">${daysPassed}<span class="pace-unit">/${daysInMonth}日</span> <span class="pace-pct">${daysPct}%</span></div>
    </div>
    <div class="pace-bar-row pace-bar-row-expense" style="--pbr-i:1">
      <div class="pace-bar-label">${refLabel}消化</div>
      <div class="pace-bar-track pace-bar-track-main">
        <div class="pace-bar-fill pace-bar-days pace-bar-ghost" style="width:${daysPct}%"></div>
        <div class="pace-bar-fill pace-bar-expense ${statusCls}" style="width:${cappedPct}%"></div>
      </div>
      <div class="pace-bar-value">${formatMoney(expense)} <span class="pace-pct ${statusCls}">${expensePct}%</span></div>
    </div>
  </div>
  <div class="pace-diff-row">
    <span class="pace-diff-label">経過との差</span>
    <span class="pace-diff-val ${statusCls}">${diff > 0 ? '+' : ''}${diff}pt</span>
  </div>${dailySection}
  <div class="pace-msg ${statusCls}">${msg}</div>
</div>`,
    'pace-widget-card');
}

// ── ウィジェット折りたたみ (v7.0) ─────────────────────────────
const KK_COLLAPSED_KEY = 'kk_card_collapsed';

function getCollapsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(KK_COLLAPSED_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveCollapsedSet(s) {
  localStorage.setItem(KK_COLLAPSED_KEY, JSON.stringify([...s]));
}
// ウィジェットHTMLをcollapse可能なラッパーに変換するヘルパー
// id: ウィジェットの一意キー、headerHtml: ヘッダー行HTML、bodyHtml: ボディHTML
// fullWidth: 2カラムグリッドで全幅表示するか
function makeCollapsibleCard(id, headerHtml, bodyHtml, extraClasses = '', fullWidth = false) {
  const collapsed = getCollapsedSet().has(id);
  const collapseChevron = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
  const wrapClass = fullWidth ? 'dash-full' : '';
  return `<div class="card ${extraClasses} ${wrapClass}" data-collapse-id="${id}">
  <div class="card-header-row">
    ${headerHtml}
    <button class="card-collapse-btn" aria-label="${collapsed ? '展開' : '折りたたむ'}" aria-expanded="${!collapsed}" data-collapse-target="${id}" title="${collapsed ? '展開' : '折りたたむ'}">
      ${collapseChevron}
    </button>
  </div>
  <div class="card-collapse-body${collapsed ? ' collapsed' : ''}" id="ccb-${id}">
    ${bodyHtml}
  </div>
</div>`;
}

function renderDashboard() {
  // 初回ユーザー（データなし）→ オンボーディング画面
  if (appData.transactions.length === 0) return renderOnboarding();

  // v5.59: ウィジェット表示設定（デフォルトON）
  const dw = appData.settings.dashWidgets || {};
  const showWidget = key => dw[key] !== false;

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
      const pctLabel = over ? '超過' : pct + '%';
      const pctCls   = over ? 'over' : pct >= 80 ? 'warn' : '';
      return `<div class="budget-item">
        <div class="budget-item-hdr">
          <span class="budget-cat-name"><span class="color-dot" style="background:${c.color}"></span>${esc2(c.name)}</span>
          <span class="budget-nums ${over ? 'over' : ''}">${formatMoney(spent)}<span class="budget-sep"> / </span>${formatMoney(budget)}</span>
          <span class="budget-pct-badge ${pctCls}">${pctLabel}</span>
        </div>
        <div class="budget-track"><div class="budget-fill ${cls}" style="width:${pct}%"></div></div>
        ${over ? `<div class="budget-over-msg">⚠️ ${formatMoney(spent - budget)} 超過</div>` : ''}
      </div>`;
    });
  const budgetSection = showWidget('budget') && budgetItems.length > 0
    ? makeCollapsibleCard('budget',
        `<h3 class="card-title">📊 今月の予算</h3><button class="btn-link" onclick="navigate('categories')">予算設定 →</button>`,
        `<div class="budget-grid">${budgetItems.join('')}</div>`)
    : '';

  // 目標ウィジェット（v5.31）
  const activeGoals = (appData.goals || []).filter(g => !g.achievedAt);
  const goalDashBody = `<div class="goal-dash-list">
    ${activeGoals.slice(0, 3).map(g => {
      const tgt = Number(g.targetAmount) || 0;
      const svd = Number(g.savedAmount) || 0;
      const pct = tgt > 0 ? Math.min(Math.round(svd / tgt * 100), 100) : 0;
      const clr = g.color || 'var(--primary)';
      const MINI_C = 81.68;
      const miniOff = (MINI_C * (1 - pct / 100)).toFixed(2);
      return `<div class="goal-dash-item" style="--goal-accent:${clr}">
        <div class="goal-dash-ring-wrap">
          <svg class="goal-dash-ring-svg" viewBox="0 0 36 36" aria-hidden="true">
            <circle class="goal-dash-ring-bg" cx="18" cy="18" r="13"/>
            <circle class="goal-dash-ring-fill" cx="18" cy="18" r="13" data-ring-offset="${miniOff}" style="stroke:var(--goal-accent)"/>
          </svg>
          <span class="goal-dash-emoji">${g.emoji || '🎯'}</span>
        </div>
        <div class="goal-dash-info">
          <div class="goal-dash-name">${esc2(g.name)}</div>
          <div class="goal-dash-bar-wrap">
            <div class="goal-dash-bar-bg"><div class="goal-dash-bar-fill" style="width:${pct}%"></div></div>
            <span class="goal-dash-pct">${pct}%</span>
          </div>
        </div>
        <span class="goal-dash-amount">${formatMoney(svd)}</span>
      </div>`;
    }).join('')}
  </div>`;
  const goalSection = showWidget('goals') && activeGoals.length > 0
    ? makeCollapsibleCard('goals',
        `<h3 class="card-title">🎯 貯蓄目標</h3><button class="btn-link" onclick="navigate('goals')">すべて見る →</button>`,
        goalDashBody)
    : '';

  // サブスクウィジェット（v5.43）
  const activeSubs = getSubscriptions().filter(s => s.isActive !== false);
  const subTotal = calcMonthlySubTotal();
  const upcomingSubs = [...activeSubs]
    .sort((a, b) => subDaysUntilBilling(a) - subDaysUntilBilling(b))
    .slice(0, 3);
  const subBody = `<div class="sub-widget-header">
    <div class="sub-widget-total-label">月間合計</div>
    <div class="sub-widget-total-amount js-countup" data-value="${subTotal}">${formatMoney(subTotal)}</div>
  </div>
  <div class="sub-widget-list">
    ${upcomingSubs.map((s, idx) => {
      const days = subDaysUntilBilling(s);
      const urgentCls = days <= 3 ? 'sub-urgent' : days <= 7 ? 'sub-soon' : '';
      return `<div class="sub-widget-item ${urgentCls}" style="--sw-i:${idx}">
        <div class="sub-widget-icon" style="background:color-mix(in srgb,${s.color||'var(--primary)'} 13%,transparent);color:${s.color||'var(--primary)'}">${s.emoji || '📱'}</div>
        <div class="sub-widget-info">
          <div class="sub-widget-name">${esc2(s.name)}</div>
          <div class="sub-widget-next">${days === 0 ? '今日請求' : `${days}日後に請求`}</div>
        </div>
        <div class="sub-widget-amount">${formatMoney(s.cycle === 'yearly' ? s.amount : s.amount)}<span class="sub-cycle-badge">${s.cycle === 'yearly' ? '/年' : '/月'}</span></div>
      </div>`;
    }).join('')}
  </div>`;
  const subSection = showWidget('subscriptions') && activeSubs.length > 0
    ? makeCollapsibleCard('subscriptions',
        `<h3 class="card-title">📱 サブスク管理</h3><button class="btn-link" onclick="navigate('subscriptions')">すべて見る →</button>`,
        subBody, 'sub-widget-card')
    : '';

  // ポイントウィジェット（v5.47）
  const allPoints = getPoints();
  const totalPointsValue = calcTotalPointsValue();
  const expiringPoints = allPoints.filter(p => {
    const d = pointDaysUntilExpiry(p);
    return d !== null && d <= 30 && (Number(p.balance) || 0) > 0;
  }).sort((a, b) => pointDaysUntilExpiry(a) - pointDaysUntilExpiry(b));
  const ptBody = `<div class="pt-widget-header">
    <div class="pt-widget-total-label">合計ポイント価値</div>
    <div class="pt-widget-total-amount js-countup" data-value="${totalPointsValue}">${formatMoney(totalPointsValue)}</div>
  </div>
  ${expiringPoints.length > 0 ? `
  <div class="pt-widget-expiry-header">⚠️ 期限切れ間近</div>
  <div class="pt-widget-list">
    ${expiringPoints.slice(0, 3).map(p => {
      const d = pointDaysUntilExpiry(p);
      const urgCls = d <= 7 ? 'pt-urgent' : 'pt-soon';
      return `<div class="pt-widget-item ${urgCls}">
        <div class="pt-widget-icon" style="background:color-mix(in srgb,${p.color||'var(--primary)'} 13%,transparent);color:${p.color||'var(--primary)'}">${p.emoji||'🎫'}</div>
        <div class="pt-widget-info">
          <div class="pt-widget-name">${esc2(p.name)}</div>
          <div class="pt-widget-exp">${d === 0 ? '今日期限' : `${d}日後に期限`}</div>
        </div>
        <div class="pt-widget-balance">${Number(p.balance).toLocaleString('ja-JP')}<span class="pt-unit">pt</span></div>
      </div>`;
    }).join('')}
  </div>` : `
  <div class="pt-widget-list">
    ${allPoints.slice(0, 3).map(p => `<div class="pt-widget-item">
      <div class="pt-widget-icon" style="background:color-mix(in srgb,${p.color||'var(--primary)'} 13%,transparent);color:${p.color||'var(--primary)'}">${p.emoji||'🎫'}</div>
      <div class="pt-widget-info">
        <div class="pt-widget-name">${esc2(p.name)}</div>
        <div class="pt-widget-exp">${formatMoney(Math.round((Number(p.balance)||0)*(Number(p.pointValue)||1)))}</div>
      </div>
      <div class="pt-widget-balance">${Number(p.balance).toLocaleString('ja-JP')}<span class="pt-unit">pt</span></div>
    </div>`).join('')}
  </div>`}`;
  const pointSection = showWidget('points') && allPoints.length > 0
    ? makeCollapsibleCard('points',
        `<h3 class="card-title">🎫 ポイント残高</h3><button class="btn-link" onclick="navigate('points')">すべて見る →</button>`,
        ptBody, 'pt-widget-card')
    : '';

  // ほしいものリストウィジェット（v5.51）
  const wishItems = getWishlistItems(false).sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 };
    return (p[a.priority] ?? 1) - (p[b.priority] ?? 1);
  });
  const wishTotal = wishItems.reduce((s, w) => s + (Number(w.price) || 0), 0);
  const wishBody = `<div class="wish-widget-header">
    <div class="wish-widget-total-label">合計予算</div>
    <div class="wish-widget-total-amount js-countup" data-value="${wishTotal}">${formatMoney(wishTotal)}</div>
  </div>
  <div class="wish-widget-list">
    ${wishItems.slice(0, 3).map((w, idx) => {
      const priLabel = { high: '高', medium: '中', low: '低' }[w.priority] || '中';
      const priCls   = { high: 'wl-pri-high', medium: 'wl-pri-medium', low: 'wl-pri-low' }[w.priority] || 'wl-pri-medium';
      const highCls  = w.priority === 'high' ? ' wl-high' : '';
      return `<div class="wish-widget-item${highCls}" style="--ww-i:${idx}">
        <div class="wish-widget-icon">${w.emoji || '🛍️'}</div>
        <div class="wish-widget-info">
          <div class="wish-widget-name">${esc2(w.name)}</div>
          <span class="wl-priority-badge ${priCls}">${priLabel}</span>
        </div>
        <div class="wish-widget-price">${formatMoney(w.price || 0)}</div>
      </div>`;
    }).join('')}
  </div>`;
  const wishSection = showWidget('wishlist') && wishItems.length > 0
    ? makeCollapsibleCard('wishlist',
        `<h3 class="card-title">🛍️ ほしいものリスト</h3><button class="btn-link" onclick="navigate('wishlist')">すべて見る →</button>`,
        wishBody, 'wish-widget-card')
    : '';

  // 今月末収支予測カード（v5.57）
  const forecastSection = showWidget('forecast') ? renderForecastCard(appState.month) : '';

  // 家計スコアカード（v5.49）
  const healthScoreSection = showWidget('healthScore') ? renderHealthScoreCard(appState.month) : '';

  // インサイトセクション（v5.40）
  const insights = generateInsights(appState.month);
  const insightSection = showWidget('insight') && insights.length > 0
    ? makeCollapsibleCard('insight',
        `<h3 class="card-title">💡 今月のインサイト</h3>`,
        `<div class="insight-list">
    ${insights.map(ins => `
    <div class="insight-item insight-${ins.type}">
      <span class="insight-icon">${ins.icon}</span>
      <div class="insight-body">
        <div class="insight-title">${ins.title}</div>
        <div class="insight-desc">${ins.desc}</div>
      </div>
    </div>`).join('')}
  </div>`, 'insight-card')
    : '';

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

  // 月次ノートウィジェット（v5.76）
  const notesSection = showWidget('notes') ? renderNotesCard(appState.month) : '';

  // クイック収支入力ウィジェット（v5.74）
  const quickAddSection = showWidget('quickAdd') ? renderQuickAddWidget() : '';

  // カテゴリ別前月比ウィジェット（v6.3）
  const categoryCompareSection = showWidget('categoryCompare') ? renderCategoryCompareWidget(appState.month) : '';

  // 年次累計サマリーウィジェット（v6.4）
  const yearSummarySection = showWidget('yearSummary') ? renderYearSummaryWidget() : '';

  // 節約機会スキャンウィジェット（v8.4）
  const savingsOppsSection = showWidget('savingsOpps') ? renderSavingsOppsWidget(appState.month) : '';

  // 月間支出ペースウィジェット（v9.1）
  const paceSection = showWidget('pace') ? renderPaceWidget(appState.month) : '';

  // 今週の家計ウィジェット（v5.72）
  const wk = getWeeklyStats();
  const wkMaxExpense = Math.max(...wk.daily.map(d => d.expense), 1);
  const wkDiffPct = wk.lastWeekExpense > 0
    ? Math.round((wk.thisWeekExpense - wk.lastWeekExpense) / wk.lastWeekExpense * 100)
    : null;
  const wkDiffBadge = wkDiffPct !== null
    ? `<span class="wk-diff ${wkDiffPct > 0 ? 'wk-diff-up' : 'wk-diff-down'}">${wkDiffPct > 0 ? '▲' : '▼'}${Math.abs(wkDiffPct)}% 先週比</span>`
    : '';
  const weeklySection = showWidget('weekly') ? `
<div class="card wk-widget-card">
  <div class="card-header-row">
    <h3 class="card-title">📅 今週の家計</h3>
    <span class="wk-week-range">${wk.weekRangeLabel}</span>
  </div>
  <div class="wk-summary-row">
    <div class="wk-cell">
      <div class="wk-cell-label">今日の支出</div>
      <div class="wk-cell-value wk-today-exp js-countup" data-value="${wk.todayExpense}">${formatMoney(wk.todayExpense)}</div>
      ${wk.todayIncome > 0 ? `<div class="wk-cell-sub">収入 ${formatMoney(wk.todayIncome)}</div>` : ''}
    </div>
    <div class="wk-cell">
      <div class="wk-cell-label">今週の支出</div>
      <div class="wk-cell-value js-countup" data-value="${wk.thisWeekExpense}">${formatMoney(wk.thisWeekExpense)}</div>
      ${wkDiffBadge}
    </div>
    <div class="wk-cell">
      <div class="wk-cell-label">無支出日</div>
      <div class="wk-cell-value wk-nospend">${wk.noSpendDays} <span class="wk-unit">日</span></div>
      <div class="wk-cell-sub">今週の実績</div>
    </div>
  </div>
  <div class="wk-bars" aria-label="今週の日別支出バー">
    ${wk.daily.map((d, i) => {
      const pct = Math.round(d.expense / wkMaxExpense * 100);
      const isCls = d.isToday ? 'wk-bar-today' : d.isFuture ? 'wk-bar-future' : '';
      const isWeekend = i >= 5;
      return `<div class="wk-bar-col ${isCls}${isWeekend ? ' wk-weekend' : ''}" style="--wk-i:${i}">
        <div class="wk-bar-wrap">
          <div class="wk-bar-fill" style="height:${d.isFuture ? 0 : pct}%;--wk-bar-pct:${pct}%" ${!d.isFuture ? 'data-wk-animate="1"' : ''}></div>
        </div>
        <div class="wk-bar-amount">${d.expense > 0 && !d.isFuture ? formatMoney(d.expense).replace('¥','') : ''}</div>
        <div class="wk-bar-label ${d.isToday ? 'wk-today-label' : ''}">${d.label}</div>
      </div>`;
    }).join('')}
  </div>
</div>` : '';

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
      <td><span class="cat-badge" style="background:color-mix(in srgb,${cat ? cat.color : 'var(--text-muted)'} 12%,transparent);color:${cat ? cat.color : 'var(--text-muted)'}">${cat ? cat.name : '—'}</span></td>
      <td class="memo-cell">${esc2(t.memo || '—')}</td>
      <td>${mem ? mem.name : '—'}</td>
      <td class="amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatMoney(t.amount)}</td>
    </tr>`;
  }).join('');

  // 月セレクター
  const monthSel = monthSelector('dash-month', appState.month);

  // 各セクションの折りたたみ対応（インラインウィジェット）
  const aiAdviceSection = showWidget('aiAdvice') ? (() => {
    const hasKey = !!(appData.settings?.geminiApiKey);
    return makeCollapsibleCard('aiAdvice',
      `<h3 class="card-title">🤖 AI家計アドバイス</h3>`,
      `<p class="adv-widget-desc">今月の収支データをAIが分析して、節約のヒントや改善点をお伝えします。</p>
  ${hasKey
    ? `<button class="btn btn-primary adv-widget-btn" id="btn-ai-advice" data-month="${appState.month}">✨ AIにアドバイスをもらう</button>`
    : `<div class="adv-widget-hint">⚙️ 設定 → 連携タブで <strong>Gemini APIキー</strong> を設定するとご利用いただけます</div>`
  }`, 'adv-widget-card');
  })() : '';

  const challengeSection = showWidget('challenges') ? (() => {
    const now = currentYearMonth();
    const activeChallenges = getChallenges().filter(c => c.period === now);
    if (!activeChallenges.length) return '';
    return makeCollapsibleCard('challenges',
      `<h3 class="card-title">🏆 節約チャレンジ</h3><button class="btn-link" onclick="navigate('challenges')">すべて見る →</button>`,
      `<div class="ch-widget-list">
    ${activeChallenges.slice(0, 3).map((ch, idx) => {
      const prog = calcChallengeProgress(ch);
      const pct = prog.pct;
      const isOver = ch.type === 'budget' && prog.actual > prog.target;
      const barCls = isOver ? 'ch-bar-over' : prog.isOnTrack ? 'ch-bar-ok' : 'ch-bar-warn';
      return `<div class="ch-widget-item" style="--ch-accent:${ch.color || 'var(--primary)'};--cw-i:${idx}">
        <div class="ch-widget-icon">${ch.emoji || '🏆'}</div>
        <div class="ch-widget-body">
          <div class="ch-widget-name">${esc2(ch.name)}</div>
          <div class="ch-widget-progress">
            <div class="ch-bar-bg"><div class="ch-bar-fill ${barCls}" style="width:${pct}%"></div></div>
            <span class="ch-widget-label">${prog.label}</span>
          </div>
        </div>
        <span class="ch-widget-pct ${isOver ? 'ch-pct-over' : prog.isOnTrack ? 'ch-pct-ok' : ''}">${pct}%</span>
      </div>`;
    }).join('')}
  </div>`, 'ch-widget-card');
  })() : '';

  const debtSection = showWidget('debts') ? (() => {
    const activeDebts = (appData.debts || []).filter(d => !d.paidOff);
    if (!activeDebts.length) return '';
    const totalDebt = getTotalDebt();
    const totalMonthly = activeDebts.reduce((s, d) => s + (Number(d.monthlyPayment) || 0), 0);
    return makeCollapsibleCard('debts',
      `<h3 class="card-title">💳 ローン管理</h3><button class="btn-link" onclick="navigate('debts')">すべて見る →</button>`,
      `<div class="debt-widget-summary">
    <div class="debt-widget-cell">
      <div class="debt-widget-cell-label">総残高</div>
      <div class="debt-widget-cell-value js-countup" data-value="${totalDebt}">${formatMoney(totalDebt)}</div>
    </div>
    <div class="debt-widget-divider"></div>
    <div class="debt-widget-cell">
      <div class="debt-widget-cell-label">月次返済</div>
      <div class="debt-widget-cell-value">${formatMoney(totalMonthly)}</div>
    </div>
    <div class="debt-widget-divider"></div>
    <div class="debt-widget-cell">
      <div class="debt-widget-cell-label">件数</div>
      <div class="debt-widget-cell-value">${activeDebts.length}<small>件</small></div>
    </div>
  </div>
  <div class="debt-widget-list">
    ${activeDebts.slice(0, 3).map((d, idx) => {
      const typeInfo = DEBT_TYPES[d.type] || DEBT_TYPES.other;
      const e = getDebtCurrentBalance(d);
      const cur = e ? Number(e.balance) : Number(d.principal);
      const prin = Number(d.principal) || 1;
      const paidPct = Math.min(Math.round((1 - cur / prin) * 100), 100);
      return `<div class="debt-widget-item" style="--debt-accent:${typeInfo.color};--dw-i:${idx}">
        <div class="debt-widget-icon" style="background:${typeInfo.color}22;color:${typeInfo.color}">${d.emoji || typeInfo.icon}</div>
        <div class="debt-widget-info">
          <div class="debt-widget-name">${esc2(d.name)}</div>
          <div class="debt-widget-bar-row">
            <div class="debt-widget-bar-bg"><div class="debt-widget-bar-fill" style="width:${paidPct}%"></div></div>
            <span class="debt-widget-pct">${paidPct}%返済済</span>
          </div>
        </div>
        <div class="debt-widget-balance">${formatMoney(cur)}</div>
      </div>`;
    }).join('')}
  </div>`, 'debt-widget-card');
  })() : '';

  const eventsSection = showWidget('events') ? (() => {
    const upcoming = getUpcomingEvents(1);
    if (!upcoming.length) return '';
    const todayDate = new Date();
    const ym = todayDate.getFullYear() + '-' + String(todayDate.getMonth()+1).padStart(2,'0');
    return makeCollapsibleCard('events',
      `<h3 class="card-title">📌 直近の収支予定</h3><button class="btn-link" onclick="navigate('events')">すべて見る →</button>`,
      `<div class="ev-widget-list">
    ${upcoming.slice(0,4).map((ev, wi) => {
      const cat = (appData.categories||[]).find(c=>c.id===ev.categoryId);
      const isIncome = ev.type === 'income';
      const monthLabel = ev.month === ym ? '今月' : '来月';
      return `<div class="ev-widget-item" style="--ev-accent:${ev.color||'var(--primary)'};--ev-wi:${wi}">
        <div class="ev-widget-icon" style="background:color-mix(in srgb,${ev.color||'var(--primary)'} 13%,transparent);color:${ev.color||'var(--primary)'}">${ev.emoji||'📅'}</div>
        <div class="ev-widget-info">
          <div class="ev-widget-name">${esc2(ev.name)}</div>
          <div class="ev-widget-meta">
            <span class="ev-widget-month">${monthLabel}</span>
            ${cat ? `<span class="ev-widget-cat" style="color:${cat.color}">${esc2(cat.name)}</span>` : ''}
          </div>
        </div>
        <div class="ev-widget-amount ${isIncome?'ev-income':'ev-expense'}">${isIncome?'+':'-'}${formatMoney(ev.plannedAmount||0)}</div>
      </div>`;
    }).join('')}
  </div>`, 'ev-widget-card');
  })() : '';

  const recentTxSection = makeCollapsibleCard('recentTx',
    `<h3 class="card-title">最近の取引</h3><button class="btn-link" onclick="navigate('transactions')">すべて見る →</button>`,
    `<div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>日付</th><th>カテゴリ</th><th>摘要</th><th>担当者</th><th>金額</th></tr></thead>
      <tbody>${recentRows || `<tr><td colspan="5"><div class="empty-month-state"><span class="empty-month-icon">📭</span><span class="empty-month-msg">今月の取引はまだありません</span><button class="empty-month-btn" onclick="document.getElementById('global-fab').click()">＋ 収支を追加する</button></div></td></tr>`}</tbody>
    </table>
  </div>`, '', true);

  return `
<div class="page-header">
  <h1 class="page-title">${esc2(appData.settings.familyName)}</h1>
  <div class="page-header-right">
    ${monthSel}
    <button class="btn btn-share" id="btn-share-summary" title="月次サマリーをシェア">📤 シェア</button>
  </div>
</div>

<div class="summary-cards">
  <div class="card summary-card income dash-sum-clickable" role="button" tabindex="0" title="タップで詳細を表示" data-drill="${appState.month}">
    <div class="summary-label">今月の収入</div>
    <div class="summary-amount js-countup" data-value="${income}">${formatMoney(income)}</div>
    ${diffSign(income, prevIncome)}
  </div>
  <div class="card summary-card expense dash-sum-clickable" role="button" tabindex="0" title="タップで詳細を表示" data-drill="${appState.month}">
    <div class="summary-label">今月の支出</div>
    <div class="summary-amount js-countup" data-value="${expense}">${formatMoney(expense)}</div>
    ${diffSign(expense, prevExpense)}
  </div>
  <div class="card summary-card balance ${balance >= 0 ? 'positive' : 'negative'} dash-sum-clickable" role="button" tabindex="0" title="タップで詳細を表示" data-drill="${appState.month}">
    <div class="summary-label">今月の残高</div>
    <div class="summary-amount js-countup" data-value="${balance}">${formatMoney(balance)}</div>
    ${(() => { const prev = prevIncome - prevExpense; return prev !== 0 ? diffSign(balance, prev) : ''; })()}
  </div>
</div>

${quickAddSection}

<div class="dash-grid">
${weeklySection ? `<div class="dash-full">${weeklySection}</div>` : ''}
${yearSummarySection ? `<div class="dash-full">${yearSummarySection}</div>` : ''}
${categoryCompareSection ? `<div>${categoryCompareSection}</div>` : ''}
${paceSection ? `<div>${paceSection}</div>` : ''}
${forecastSection ? `<div>${forecastSection}</div>` : ''}
${healthScoreSection ? `<div class="dash-full">${healthScoreSection}</div>` : ''}
${insightSection ? `<div>${insightSection}</div>` : ''}
${savingsOppsSection ? `<div>${savingsOppsSection}</div>` : ''}
${aiAdviceSection ? `<div>${aiAdviceSection}</div>` : ''}
${notesSection ? `<div>${notesSection}</div>` : ''}
${pointSection ? `<div>${pointSection}</div>` : ''}
${wishSection ? `<div>${wishSection}</div>` : ''}
${subSection ? `<div>${subSection}</div>` : ''}
${budgetSection ? `<div class="dash-full">${budgetSection}</div>` : ''}
${goalSection ? `<div>${goalSection}</div>` : ''}
${challengeSection ? `<div>${challengeSection}</div>` : ''}
${debtSection ? `<div>${debtSection}</div>` : ''}
${eventsSection ? `<div>${eventsSection}</div>` : ''}
${showWidget('chart') ? `<div class="dash-full"><div class="charts-row">
  <div class="card chart-card">
    <h3 class="card-title">支出カテゴリ</h3>
    <div class="chart-wrap chart-clickable-wrap chart-h-sm">
      <canvas id="donut-expense"></canvas>
      <span class="chart-clickable-hint">タップで詳細</span>
    </div>
  </div>
  <div class="card chart-card">
    <h3 class="card-title">月別収支（12ヶ月）</h3>
    <div class="chart-wrap chart-clickable-wrap chart-h-sm">
      <canvas id="monthly-bar"></canvas>
      <span class="chart-clickable-hint">タップで詳細</span>
    </div>
  </div>
</div></div>` : ''}
<div class="dash-full">${recentTxSection}</div>
</div>

<!-- AI家計アドバイスモーダル (v6.1) -->
<div id="advice-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="advice-modal-title">
  <div class="modal">
    <div class="modal-header">
      <h2 id="advice-modal-title">🤖 AI家計アドバイス</h2>
      <button class="modal-close" id="advice-modal-close" aria-label="閉じる">✕</button>
    </div>
    <div class="modal-body">
      <span class="adv-month-badge" id="adv-month-badge">📅</span>
      <div id="adv-body"></div>
      <div class="adv-footer">
        <button class="btn btn-ghost" id="adv-copy-btn" style="display:none">📋 コピー</button>
        <button class="btn btn-ghost" id="adv-regen-btn" style="display:none">🔄 再生成</button>
        <button class="btn btn-primary" id="advice-modal-close2">閉じる</button>
      </div>
    </div>
  </div>
</div>`;
}

function bindDashboard() {
  // オンボーディング（データなし）
  if (appData.transactions.length === 0) { bindOnboarding(); return; }

  // 月セレクター
  const sel = document.getElementById('dash-month');
  if (sel) sel.addEventListener('change', e => {
    appState.month = e.target.value;
    renderCurrentPage();
  });
  // 月ナビボタン (v5.99)
  const mnPrev = document.getElementById('dash-month-prev');
  const mnNext = document.getElementById('dash-month-next');
  if (mnPrev) mnPrev.addEventListener('click', () => {
    appState.month = adjMonth(appState.month, -1);
    renderCurrentPage();
  });
  if (mnNext) mnNext.addEventListener('click', () => {
    const today = todayStr().substring(0, 7);
    if (appState.month < today) {
      appState.month = adjMonth(appState.month, 1);
      renderCurrentPage();
    }
  });

  // サマリーカード タップで月ドリルダウン起動
  document.querySelectorAll('.dash-sum-clickable').forEach(card => {
    const drill = card.dataset.drill;
    if (!drill) return;
    const open = () => openMonthDrilldown(drill);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  // シェアボタン
  on('btn-share-summary', 'click', () => openShareModal(appState.month));
  // サマリーカード数値カウントアップ
  document.querySelectorAll('.js-countup').forEach(el => {
    animateCountUp(el, Number(el.dataset.value));
  });
  // 家計スコア数値カウントアップ（v5.49）
  const hsEl = document.querySelector('.js-hs-countup');
  if (hsEl) {
    const target = Number(hsEl.dataset.value);
    const dur = 700;
    const start = performance.now();
    const tick = now => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      hsEl.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // 今月末収支予測カウントアップ（v5.57）
  document.querySelectorAll('.js-fc-countup').forEach(el => {
    const target = Number(el.dataset.value);
    const absTarget = Math.abs(target);
    const isNeg = target < 0;
    const prefix = isNeg ? '-¥' : '¥';
    const dur = 600;
    const start = performance.now();
    const tick = now => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + Math.round(absTarget * eased).toLocaleString('ja-JP');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  animateGoalRings(); // v5.32

  // 年次累計プログレスバーアニメーション（v6.4）
  const yrFill = document.querySelector('.yr-progress-fill[data-yr-animate]');
  if (yrFill) {
    const target = parseFloat(yrFill.style.width);
    yrFill.style.width = '0%';
    requestAnimationFrame(() => {
      yrFill.style.transition = 'width 0.9s cubic-bezier(0.25,0.46,0.45,0.94)';
      yrFill.style.width = target + '%';
    });
  }

  // ── クイック入力ウィジェット バインド (v5.74) ──────────────
  const qaToggle = document.getElementById('qa-toggle');
  const qaBody   = document.getElementById('qa-body');
  if (qaToggle && qaBody) {
    // 開閉トグル
    qaToggle.addEventListener('click', () => {
      const isNowOpen = qaToggle.getAttribute('aria-expanded') === 'true';
      appState.quickAddOpen = !isNowOpen;
      qaToggle.setAttribute('aria-expanded', String(!isNowOpen));
      qaBody.style.display = isNowOpen ? 'none' : 'block';
      qaToggle.querySelector('.qa-chevron')?.classList.toggle('qa-chevron-open', !isNowOpen);
      if (!isNowOpen) setTimeout(() => document.getElementById('qa-amount')?.focus(), 60);
    });

    // タイプ切替
    qaBody.querySelectorAll('.qa-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        qaBody.querySelectorAll('.qa-type-btn').forEach(b => b.classList.remove('qa-type-active'));
        btn.classList.add('qa-type-active');
        appState.quickAddType = btn.dataset.qaType;
        // v5.75: data-qa-type属性を更新してアクセントカラーを連動
        document.getElementById('qa-card')?.setAttribute('data-qa-type', btn.dataset.qaType);
        const sel = document.getElementById('qa-category');
        if (!sel) return;
        const cats = appData.categories.filter(c => c.type === btn.dataset.qaType);
        sel.innerHTML = cats.map(c => `<option value="${c.id}">${esc2(c.name)}</option>`).join('');
      });
    });

    // Enterキーで次フィールドへ
    document.getElementById('qa-amount')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('qa-category')?.focus();
    });
    document.getElementById('qa-memo')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('qa-submit')?.click();
    });

    // 追加
    document.getElementById('qa-submit')?.addEventListener('click', () => {
      const amount = Number(document.getElementById('qa-amount')?.value);
      const catId  = document.getElementById('qa-category')?.value;
      const memo   = document.getElementById('qa-memo')?.value?.trim() || '';
      const type   = qaBody.querySelector('.qa-type-btn.qa-type-active')?.dataset.qaType || 'expense';

      if (!amount || amount <= 0) {
        document.getElementById('qa-amount')?.focus();
        showToast('金額を入力してください', 'warning');
        return;
      }
      if (!catId) { showToast('カテゴリを選択してください', 'warning'); return; }

      addTransaction({ type, date: todayStr(), amount, categoryId: catId, memo,
        paymentMethod: '', memberId: '', taxRate: 0, tags: [] });

      // v5.75: 追加成功バウンスアニメーション
      const submitBtn = document.getElementById('qa-submit');
      if (submitBtn) {
        submitBtn.classList.add('qa-sent');
        submitBtn.addEventListener('animationend', () => submitBtn.classList.remove('qa-sent'), { once: true });
      }

      // 入力欄をリセット（パネルは開いたまま）
      const amtEl = document.getElementById('qa-amount');
      const memoEl = document.getElementById('qa-memo');
      if (amtEl)  amtEl.value  = '';
      if (memoEl) memoEl.value = '';
      // 連続入力のためにamountへフォーカスを戻す
      if (amtEl) setTimeout(() => amtEl.focus(), 50);

      const typeLabel = type === 'expense' ? '支出' : '収入';
      showToast(`${typeLabel} ${formatMoney(amount)} を追加しました`, 'success');

      // appState.month を今日の月に合わせてダッシュボード再描画（アニメーション後）
      appState.month = todayStr().slice(0, 7);
      appState.quickAddOpen = true; // 再描画後もパネルを開いたまま
      setTimeout(() => renderCurrentPage(), 350);
      // 予算アラートトースト（v5.98）
      if (type === 'expense' && catId) {
        setTimeout(() => checkBudgetToast(catId, appState.month), 3500);
      }
    });
  }

  // 月次ノートウィジェット バインド（v5.76）
  (() => {
    const ta = document.getElementById('nt-textarea');
    if (!ta) return;
    let ntTimer = null;
    const autoResize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', () => {
      const cEl = document.getElementById('nt-chars');
      const len = ta.value.length;
      if (cEl) cEl.textContent = len;
      // プログレスバー更新
      const progFill = document.getElementById('nt-prog-fill');
      const charWrap = document.getElementById('nt-char-wrap');
      if (progFill) {
        const pct = Math.round(len / 500 * 100);
        progFill.style.width = pct + '%';
        progFill.classList.toggle('nt-prog-danger', pct >= 96);
        progFill.classList.toggle('nt-prog-warn',   pct >= 80 && pct < 96);
      }
      if (charWrap) {
        const pct = Math.round(len / 500 * 100);
        charWrap.classList.toggle('nt-cnt-danger', pct >= 96);
        charWrap.classList.toggle('nt-cnt-warn',   pct >= 80 && pct < 96);
      }
      autoResize();
      clearTimeout(ntTimer);
      ntTimer = setTimeout(() => {
        const month = appState.month;
        if (!appData.notes) appData.notes = {};
        const text = ta.value.trim();
        if (text) {
          appData.notes[month] = { text, updatedAt: new Date().toISOString() };
        } else {
          delete appData.notes[month];
        }
        saveData();
        const statusEl = document.getElementById('nt-status');
        if (statusEl) {
          statusEl.classList.remove('nt-saved');
          void statusEl.offsetWidth; // アニメーションリセット
          statusEl.textContent = '保存済み ✓';
          statusEl.classList.add('nt-saved');
          setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('nt-saved'); }, 2200);
        }
      }, 800);
    });
    autoResize();
  })();

  // 節約機会スキャン：チャレンジ作成ボタン（v8.4）
  document.querySelectorAll('.opp-challenge-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.challengePrefill = {
        categoryId: btn.dataset.cat || '',
        type: btn.dataset.type || 'budget',
        targetAmount: btn.dataset.target || '',
        name: btn.dataset.name || '',
        emoji: btn.dataset.emoji || '🏆',
        color: btn.dataset.color || 'var(--primary)',
      };
      navigate('challenges');
    });
  });

  // 今週ウィジェット バーアニメーション（v5.72）
  document.querySelectorAll('.wk-bar-fill[data-wk-animate]').forEach((el, idx) => {
    const targetH = el.style.height;
    el.style.height = '0%';
    setTimeout(() => {
      el.style.transition = 'height 0.55s cubic-bezier(0.34,1.56,0.64,1)';
      el.style.height = targetH;
    }, 80 + idx * 55);
  });
  // js-fv-countup 対応（固変ウィジェット等）
  document.querySelectorAll('.js-fv-countup').forEach(el => {
    animateCountUp(el, Number(el.dataset.value));
  });
  // グラフ描画（少し遅延させてDOMが確定してから）
  setTimeout(() => {
    if (document.getElementById('donut-expense')) {
      const txs = getTransactionsByMonth(appState.month);
      renderDonutChart('donut-expense', txs, 'expense',
        (catName, catColor) => openCategoryDrilldown(catName, catColor, appState.month, 'expense')
      );
    }
    if (document.getElementById('monthly-bar')) {
      renderMonthlyBarChart('monthly-bar', month => openMonthDrilldown(month));
    }
  }, 50);

  // AI家計アドバイス (v6.1)
  const advBtn = document.getElementById('btn-ai-advice');
  if (advBtn) {
    advBtn.addEventListener('click', () => openAdviceModal(advBtn.dataset.month || appState.month));
  }
  const advClose  = document.getElementById('advice-modal-close');
  const advClose2 = document.getElementById('advice-modal-close2');
  const advModal  = document.getElementById('advice-modal');
  if (advClose  && advModal) advClose.addEventListener('click',  () => { hideModal(advModal); });
  if (advClose2 && advModal) advClose2.addEventListener('click', () => { hideModal(advModal); });
  if (advModal) advModal.addEventListener('click', e => { if (e.target === advModal) hideModal(advModal); });

  // ── ウィジェット折りたたみ バインド (v7.0) ─────────────────
  document.querySelectorAll('.card-collapse-btn[data-collapse-target]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.collapseTarget;
      const body = document.getElementById('ccb-' + id);
      if (!body) return;
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      const cs = getCollapsedSet();
      if (isExpanded) {
        // 折りたたむ
        cs.add(id);
        btn.setAttribute('aria-expanded', 'false');
        btn.title = '展開';
        btn.setAttribute('aria-label', '展開');
        body.classList.add('collapsed');
      } else {
        // 展開
        cs.delete(id);
        btn.setAttribute('aria-expanded', 'true');
        btn.title = '折りたたむ';
        btn.setAttribute('aria-label', '折りたたむ');
        body.classList.remove('collapsed');
      }
      saveCollapsedSet(cs);
    });
  });
}

// ============================================================
// v5.97: フィルター保存プリセット
// ============================================================

function getSavedFilters() {
  try { return JSON.parse(localStorage.getItem('kk_saved_filters') || '[]'); }
  catch { return []; }
}
function saveTxFilter(name) {
  const saved = getSavedFilters();
  if (saved.length >= 5) {
    showToast('保存上限（5件）に達しています。不要なフィルターを削除してください。', 'warning');
    return false;
  }
  const entry = { id: Date.now().toString(36), name, filter: { ...appState.txFilter } };
  saved.push(entry);
  localStorage.setItem('kk_saved_filters', JSON.stringify(saved));
  return true;
}
function deleteSavedFilter(id) {
  const saved = getSavedFilters().filter(s => s.id !== id);
  localStorage.setItem('kk_saved_filters', JSON.stringify(saved));
}
function applySavedFilter(entry) {
  appState.txFilter = { ...appState.txFilter, ...entry.filter };
  const { dateFrom, dateTo } = entry.filter;
  if (dateFrom && dateTo) {
    const fromM = dateFrom.substring(0, 7);
    const toM   = dateTo.substring(0, 7);
    if (fromM !== toM || fromM !== appState.month) appState.month = 'all';
  }
}

// ============================================================
// 収支一覧
// ============================================================

// 取引一行HTML生成ヘルパー
// ── v5.95: 検索テキストハイライト ────────────────────────
function highlightText(text, query) {
  if (!query || !text) return esc2(text || '');
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const qLen = query.length;
  let result = '';
  let pos = 0;
  let idx;
  while ((idx = lower.indexOf(q, pos)) !== -1) {
    result += esc2(text.slice(pos, idx));
    result += `<mark class="tx-hl">${esc2(text.slice(idx, idx + qLen))}</mark>`;
    pos = idx + qLen;
  }
  result += esc2(text.slice(pos));
  return result;
}

function renderTxRow(t, query = '') {
  const cat = getCategoryById(t.categoryId);
  const mem = getMemberById(t.memberId);
  const isIncome = t.type === 'income';
  const icon = cat ? (CAT_ICONS[cat.name] || '📌') : '';
  const badgeIcon = icon ? `<span class="cat-badge-icon">${icon}</span>` : '';
  const isSel = appState.selectedTxIds.has(t.id);
  const cbCol = appState.bulkMode
    ? `<td class="tx-cb-cell"><input type="checkbox" class="tx-cb" data-id="${t.id}" ${isSel ? 'checked' : ''}></td>`
    : '';
  // タグチップ (v5.62: マルチカラー)
  const tagChips = (t.tags && t.tags.length > 0)
    ? `<div class="tx-tag-chips">${t.tags.map(tag => {
        const col = getTagColor(tag);
        return `<span class="tx-tag-chip" style="--tc:${col}">#${esc2(tag)}</span>`;
      }).join('')}</div>`
    : '';
  // v5.95: 検索ハイライト
  const catName = cat ? highlightText(cat.name, query) : '—';
  const memoText = t.memo ? highlightText(t.memo, query) : '—';
  return `<tr data-id="${t.id}" data-type="${t.type}"${isSel ? ' class="tx-selected"' : ''}>
      ${cbCol}
      <td>${formatDate(t.date)}</td>
      <td><span class="cat-badge" style="background:color-mix(in srgb,${cat ? cat.color : 'var(--text-muted)'} 12%,transparent);color:${cat ? cat.color : 'var(--text-muted)'}">${badgeIcon}${catName}</span></td>
      <td class="memo-cell"><span class="tx-memo-text">${memoText}</span>${tagChips}</td>
      <td class="tx-col-pay">${esc2(t.paymentMethod || '—')}</td>
      <td class="tx-col-mem">${mem ? esc2(mem.name) : '—'}</td>
      <td class="amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatMoney(t.amount)}</td>
      <td class="actions">
        <button class="btn-icon edit-tx" data-id="${t.id}" title="編集">✏️</button>
        <button class="btn-icon dup-tx" data-id="${t.id}" title="複製して追加"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        <button class="btn-icon delete-tx" data-id="${t.id}" title="削除">🗑️</button>
      </td>
    </tr>`;
}

// ── タグカラーパレット (v5.62) ────────────────────────────
const TAG_COLORS = [
  '#6366f1', // indigo
  '#0891b2', // cyan
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#db2777', // pink
  '#ea580c', // orange
  '#0d9488', // teal
  '#e11d48', // rose
  '#64748b', // slate
];
function getTagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xFFFF;
  return TAG_COLORS[h % TAG_COLORS.length];
}

// ── タグ管理 (v5.61) ─────────────────────────────────────
function getAllTags() {
  const tagSet = new Set();
  appData.transactions.forEach(t => {
    if (t.tags && Array.isArray(t.tags)) {
      t.tags.forEach(tag => { if (tag) tagSet.add(tag); });
    }
  });
  return Array.from(tagSet).sort();
}

// 全期間対応月セレクター
function txMonthSelector(value) {
  const months = getAvailableMonths();
  if (value !== 'all' && !months.includes(value)) months.unshift(value);
  const allOpt = `<option value="all" ${value === 'all' ? 'selected' : ''}>📋 全期間</option>`;
  const opts = months.map(m => {
    const [y, mo] = m.split('-');
    return `<option value="${m}" ${m === value ? 'selected' : ''}>${y}年${parseInt(mo)}月</option>`;
  }).join('');

  const isAll = value === 'all';
  const today = todayStr().substring(0, 7);
  const disNext = (isAll || value >= today) ? ' disabled' : '';
  const disOldest = (isAll || (months.length > 0 && value === months[months.length - 1])) ? ' disabled' : '';

  return `<div class="month-nav" id="tx-month-wrap">
    <button class="month-nav-btn" id="tx-month-prev" title="前の月" aria-label="前の月"${disOldest}>&#8249;</button>
    <select id="tx-month" class="month-sel">${allOpt}${opts}</select>
    <button class="month-nav-btn" id="tx-month-next" title="次の月" aria-label="次の月"${disNext}>&#8250;</button>
  </div>`;
}

function resetTxFilters() {
  appState.txFilter = { category: '', member: '', search: '', type: '', tag: '', amountMin: '', amountMax: '', dateFrom: '', dateTo: '' };
  renderCurrentPage();
}

function renderTransactions() {
  const f = appState.txFilter;
  const isAll = appState.month === 'all';

  let txs = appData.transactions.filter(t => {
    if (!t.date) return false;
    if (!isAll && !t.date.startsWith(appState.month)) return false;
    if (f.category && t.categoryId !== f.category) return false;
    if (f.member && t.memberId !== f.member) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.tag && (!t.tags || !t.tags.includes(f.tag))) return false;  // v5.61: タグフィルター
    // v5.94: 金額範囲フィルター
    if (f.amountMin !== '' && t.amount < Number(f.amountMin)) return false;
    if (f.amountMax !== '' && t.amount > Number(f.amountMax)) return false;
    // v5.94: 日付範囲フィルター
    if (f.dateFrom && t.date < f.dateFrom) return false;
    if (f.dateTo   && t.date > f.dateTo)   return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const cat = getCategoryById(t.categoryId);
      const mem = getMemberById(t.memberId);
      const tagsStr = (t.tags || []).join(' ');  // v5.61: タグも検索対象
      const haystack = [(t.memo || ''), (cat ? cat.name : ''), (mem ? mem.name : ''), tagsStr].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const { key, dir } = appState.txSort;
    let va, vb;
    if (key === 'amount') {
      va = a.amount; vb = b.amount;
    } else if (key === 'category') {
      const ca = getCategoryById(a.categoryId); const cb = getCategoryById(b.categoryId);
      va = ca ? ca.name : ''; vb = cb ? cb.name : '';
    } else {
      va = a.date; vb = b.date;
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');

  // カテゴリ選択肢
  const catOptions = `<option value="">カテゴリ: 全て</option>` +
    appData.categories.map(c => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${esc2(c.name)}</option>`).join('');

  // メンバー選択肢
  const memOptions = `<option value="">担当者: 全員</option>` +
    appData.members.map(m => `<option value="${m.id}" ${f.member === m.id ? 'selected' : ''}>${esc2(m.name)}</option>`).join('');

  // タグフィルターチップ行 (v5.62: selectから横スクロールチップ行へ刷新)
  const allTags = getAllTags();
  const tagFilterHtml = allTags.length > 0
    ? `<div class="tx-tag-filter-row" id="tag-filter-row">
        <span class="tx-tag-filter-label">🏷️</span>
        <button class="tx-tag-filter-all ${!f.tag ? 'active' : ''}" data-tag="">全タグ</button>
        ${allTags.map(tag => {
          const col = getTagColor(tag);
          return `<button class="tx-tag-filter-chip ${f.tag === tag ? 'active' : ''}" data-tag="${esc2(tag)}" style="--tc:${col}">#${esc2(tag)}</button>`;
        }).join('')}
      </div>`
    : '';

  // 行生成（全期間は月グループ分け）
  let rows;
  if (isAll && txs.length > 0) {
    const groups = {};
    txs.forEach(t => {
      const ym = t.date.slice(0, 7);
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(t);
    });
    rows = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(ym => {
      const [y, m] = ym.split('-');
      const gi = calcTotal(groups[ym], 'income');
      const ge = calcTotal(groups[ym], 'expense');
      const grpCols = appState.bulkMode ? 8 : 7;
      return `<tr class="tx-month-group-row">
        <td colspan="${grpCols}"><div class="tx-month-group-inner">
          <span class="tx-month-group-label">${y}年${parseInt(m)}月</span>
          <span class="tx-month-group-summary">
            <span class="income">+${formatMoney(gi)}</span>
            <span class="expense">-${formatMoney(ge)}</span>
            <span class="tx-month-group-count">${groups[ym].length}件</span>
          </span>
        </div></td>
      </tr>${groups[ym].map(t => renderTxRow(t, f.search)).join('')}`;
    }).join('');
  } else {
    rows = txs.map(t => renderTxRow(t, f.search)).join('');
  }

  // テンプレートクイックアクセスバー
  const templates = appData.templates || [];
  const templateBar = templates.length > 0 ? `
<div class="card template-bar">
  <span class="template-bar-label">⚡</span>
  <div class="template-list">
    ${templates.map(tpl => {
      const cat = getCategoryById(tpl.categoryId);
      const col = cat ? cat.color : 'var(--text-muted)';
      return `<button class="btn-tpl" data-tid="${tpl.id}" style="border-color:${col};color:${col}">${esc2(tpl.name)}</button>`;
    }).join('')}
  </div>
</div>` : '';

  const searchAllBtn = (!isAll && f.search)
    ? `<button id="search-all-btn" class="btn btn-ghost tx-search-all-btn">全期間</button>`
    : '';

  // v5.95: アクティブフィルター判定
  const anyFilterActive = !!(f.search || f.category || f.member || f.type || f.tag || f.amountMin !== '' || f.amountMax !== '' || f.dateFrom !== '' || f.dateTo !== '');
  // v5.94: 詳細フィルター（金額・日付範囲）
  const advActive = f.amountMin !== '' || f.amountMax !== '' || f.dateFrom !== '' || f.dateTo !== '';
  const advCount = [f.amountMin, f.amountMax, f.dateFrom, f.dateTo].filter(v => v !== '').length;
  const SVG_FILTER = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 2.5h12M3 7h8M5.5 11.5h3"/></svg>';
  const SVG_STAR   = '<svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><path d="M6.5 1l1.39 2.82 3.11.45-2.19 2.13.52 3.1L6.5 10.08l-2.83 1.42.52-3.1L2 6.27l3.11-.45z"/></svg>';
  // v5.97: 保存済みフィルター行
  const _savedFilters = getSavedFilters();
  const sfRowHtml = _savedFilters.length > 0 ? `<div class="sf-row" id="sf-row">
  <span class="sf-row-label">${SVG_STAR}</span>
  ${_savedFilters.map((s, i) => `<button class="sf-chip" data-sfid="${s.id}" title="${esc2(s.name)}" style="--sfi:${i}">${esc2(s.name)}<span class="sf-chip-del" data-sfid="${s.id}" title="削除">✕</span></button>`).join('')}
</div>` : '';
  // v5.97: 保存ボタン（フィルターアクティブ時のみ表示、5件未満時）
  const sfSaveBtn = anyFilterActive && _savedFilters.length < 5
    ? `<button class="btn btn-ghost btn-sm sf-save-btn" id="sf-save-btn" title="現在のフィルターを保存">${SVG_STAR} 保存</button>`
    : '';
  const advToggleBtn = `<button class="btn btn-ghost btn-sm adv-filter-toggle${advActive ? ' adv-filter-on' : ''}" id="adv-filter-toggle" title="詳細フィルター">${SVG_FILTER} 詳細${advActive ? `<span class="adv-filter-count">${advCount}</span>` : ''}</button>`;
  // v5.96: 期間クイックプリセット
  const _d96 = new Date(), _y96 = _d96.getFullYear(), _m96 = _d96.getMonth();
  const _fmt96 = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  const _dow96 = _d96.getDay();
  const _mon96 = new Date(_d96); _mon96.setDate(_d96.getDate() - (_dow96 === 0 ? 6 : _dow96 - 1));
  const _sun96 = new Date(_mon96); _sun96.setDate(_mon96.getDate() + 6);
  const _qs96 = Math.floor(_m96 / 3) * 3;
  const DATE_PRESETS96 = [
    { key: 'week',  label: '今週',    from: _fmt96(_mon96),                        to: _fmt96(_sun96),                          wide: 0 },
    { key: 'month', label: '今月',    from: _fmt96(new Date(_y96, _m96, 1)),        to: _fmt96(new Date(_y96, _m96+1, 0)),       wide: 0 },
    { key: 'lmon',  label: '先月',    from: _fmt96(new Date(_y96, _m96-1, 1)),      to: _fmt96(new Date(_y96, _m96, 0)),         wide: 0 },
    { key: 'qtr',   label: '今四半期', from: _fmt96(new Date(_y96, _qs96, 1)),      to: _fmt96(new Date(_y96, _qs96+3, 0)),      wide: 1 },
    { key: 'year',  label: '今年',    from: `${_y96}-01-01`,                        to: `${_y96}-12-31`,                         wide: 1 },
  ];
  const _ap96 = DATE_PRESETS96.find(p => p.from === f.dateFrom && p.to === f.dateTo);
  const presetsHtml96 = DATE_PRESETS96.map((p, i) =>
    `<button class="adv-preset-chip${_ap96?.key === p.key ? ' active' : ''}" data-from="${p.from}" data-to="${p.to}" data-wide="${p.wide}" style="--pi:${i}">${p.label}</button>`
  ).join('');
  const advPanel = `<div class="adv-filter-panel${appState.advFilterOpen ? ' open' : ''}" id="adv-filter-panel">
  <div class="adv-filter-inner">
    <div class="adv-filter-group">
      <span class="adv-filter-label">💰 金額範囲</span>
      <div class="adv-filter-row">
        <input type="number" id="filter-amt-min" class="adv-filter-input" placeholder="下限 ¥" value="${esc2(f.amountMin)}" min="0" step="100">
        <span class="adv-filter-sep">〜</span>
        <input type="number" id="filter-amt-max" class="adv-filter-input" placeholder="上限 ¥" value="${esc2(f.amountMax)}" min="0" step="100">
      </div>
    </div>
    <div class="adv-filter-group adv-filter-group-date">
      <span class="adv-filter-label">📅 日付範囲</span>
      <div class="adv-preset-row">${presetsHtml96}</div>
      <div class="adv-filter-row">
        <input type="date" id="filter-date-from" class="adv-filter-input" value="${esc2(f.dateFrom)}">
        <span class="adv-filter-sep">〜</span>
        <input type="date" id="filter-date-to" class="adv-filter-input" value="${esc2(f.dateTo)}">
      </div>
    </div>
    <div class="adv-filter-actions">
      ${advActive ? `<button class="btn btn-ghost btn-sm adv-filter-clear" id="adv-filter-clear">✕ クリア</button>` : ''}
      ${sfSaveBtn}
    </div>
  </div>
</div>`;

  const bulkCols = appState.bulkMode ? 8 : 7;
  const cbTh = appState.bulkMode
    ? `<th class="tx-cb-th"><input type="checkbox" id="tx-select-all" class="tx-cb" title="全て選択"></th>`
    : '';

  // v5.79: ソートヘルパー（SVGアイコン）
  const sort = appState.txSort;
  const SVG_SORT_NONE = '<svg viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5L5 2.5L8 5"/><path d="M2 7L5 9.5L8 7"/></svg>';
  const SVG_ASC       = '<svg viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"><path d="M2 8L5 4L8 8"/></svg>';
  const SVG_DESC      = '<svg viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"><path d="M2 4L5 8L8 4"/></svg>';
  const sIcon = key => {
    if (sort.key !== key) return `<span class="tx-sort-icon tx-sort-none">${SVG_SORT_NONE}</span>`;
    const cls = sort.dir === 'asc' ? 'tx-asc' : 'tx-desc';
    return `<span class="tx-sort-icon ${cls}">${sort.dir === 'asc' ? SVG_ASC : SVG_DESC}</span>`;
  };
  const sTh = (key, label, cls='') =>
    `<th class="tx-th-sort${sort.key===key?' tx-th-active':''}${cls?' '+cls:''}" data-sort="${key}">${label}${sIcon(key)}</th>`;
  // ソートリセットバッジ（デフォルト以外の時に表示）
  const isDefaultSort = sort.key === 'date' && sort.dir === 'desc';
  const sortLabel = sort.key === 'date' ? '日付' : sort.key === 'category' ? 'カテゴリ' : '金額';
  const sortBadgeHtml = !isDefaultSort
    ? `<button class="tx-sort-badge" id="tx-sort-reset" title="ソートをリセット">
        ${sort.dir === 'asc' ? SVG_ASC : SVG_DESC}
        ${sortLabel}
        <span class="tx-sort-badge-x">✕</span>
      </button>`
    : '';

  return `
<div class="page-header">
  <h1 class="page-title">収支一覧</h1>
  <div class="page-header-right">
    <button class="btn btn-ghost btn-sm" id="btn-monthly-pdf" title="今月の収支をPDFで出力">📄 PDF</button>
    <button class="btn ${appState.bulkMode ? 'btn-primary' : 'btn-ghost'} btn-sm" id="bulk-toggle">☑ ${appState.bulkMode ? '選択中' : '一括選択'}</button>
    <button class="btn btn-primary" id="open-add-modal">＋ 追加</button>
  </div>
</div>

${templateBar}

<div class="card filter-bar">
  ${txMonthSelector(appState.month)}
  <select id="filter-cat">${catOptions}</select>
  <select id="filter-mem">${memOptions}</select>
  <select id="filter-type">
    <option value="">種別: 全て</option>
    <option value="income" ${f.type === 'income' ? 'selected' : ''}>収入のみ</option>
    <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>支出のみ</option>
  </select>
  <input id="filter-search" type="search" placeholder="検索…" value="${esc2(f.search)}" class="filter-search">
  ${searchAllBtn}
  ${advToggleBtn}
</div>

${advPanel}
${sfRowHtml}
${tagFilterHtml}

<div class="card summary-mini">
  <div class="smi-item smi-income">
    <span class="smi-label">収入</span>
    <span class="smi-amount income">+${formatMoney(income)}</span>
  </div>
  <div class="smi-divider"></div>
  <div class="smi-item smi-expense">
    <span class="smi-label">支出</span>
    <span class="smi-amount expense">-${formatMoney(expense)}</span>
  </div>
  <div class="smi-divider"></div>
  <div class="smi-item smi-balance">
    <span class="smi-label">収支</span>
    <span class="smi-amount ${income - expense >= 0 ? 'income' : 'expense'}">${income - expense >= 0 ? '+' : ''}${formatMoney(income - expense)}</span>
  </div>
  <span class="smi-count">${txs.length}件</span>
  ${anyFilterActive ? `<span class="smi-filter-badge tx-hl-badge-in">絞込中</span>` : ''}
  ${sortBadgeHtml}
</div>

<div class="card">
  <div class="table-wrap">
    <table class="tx-table${appState._sortChanged ? ' tx-sorting' : ''}">
      <thead><tr>${cbTh}${sTh('date','日付')}${sTh('category','カテゴリ')}<th>摘要</th><th class="tx-col-pay">支払方法</th><th class="tx-col-mem">担当者</th>${sTh('amount','金額')}<th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${bulkCols}"><div class="tx-empty-state">
        <span class="tx-empty-icon">📭</span>
        <p class="tx-empty-msg">${anyFilterActive ? '条件に一致する取引がありません' : 'この月の取引はありません'}</p>
        ${anyFilterActive
          ? `<button class="btn btn-ghost btn-sm" onclick="resetTxFilters()">🔄 フィルターをリセット</button>`
          : `<button class="btn btn-primary btn-sm" onclick="document.getElementById('global-fab').click()">＋ 収支を追加する</button>`
        }
      </div></td></tr>`}</tbody>
    </table>
  </div>
</div>

${renderTxModal()}`;
}

function bindTransactions() {
  // 月
  on('tx-month', 'change', e => { appState.month = e.target.value; renderCurrentPage(); });
  // 月ナビボタン (v5.99)
  on('tx-month-prev', 'click', () => {
    if (appState.month !== 'all') { appState.month = adjMonth(appState.month, -1); renderCurrentPage(); }
  });
  on('tx-month-next', 'click', () => {
    const today = todayStr().substring(0, 7);
    if (appState.month !== 'all' && appState.month < today) { appState.month = adjMonth(appState.month, 1); renderCurrentPage(); }
  });
  // 全期間で検索ボタン
  on('search-all-btn', 'click', () => { appState.month = 'all'; renderCurrentPage(); });
  // フィルター
  on('filter-cat',    'change', e => { appState.txFilter.category = e.target.value; renderCurrentPage(); });
  on('filter-mem',    'change', e => { appState.txFilter.member   = e.target.value; renderCurrentPage(); });
  on('filter-type',   'change', e => { appState.txFilter.type     = e.target.value; renderCurrentPage(); });
  // v5.94: 詳細フィルタートグル
  on('adv-filter-toggle', 'click', () => {
    appState.advFilterOpen = !appState.advFilterOpen;
    const panel = document.getElementById('adv-filter-panel');
    if (panel) panel.classList.toggle('open', appState.advFilterOpen);
    document.getElementById('adv-filter-toggle')?.classList.toggle('adv-filter-toggle-open', appState.advFilterOpen);
  });
  // v5.94: 詳細フィルター入力（デバウンス）
  let _advTimer = null;
  const onAdvInput = () => {
    clearTimeout(_advTimer);
    _advTimer = setTimeout(() => {
      appState.txFilter.amountMin = document.getElementById('filter-amt-min')?.value || '';
      appState.txFilter.amountMax = document.getElementById('filter-amt-max')?.value || '';
      appState.txFilter.dateFrom  = document.getElementById('filter-date-from')?.value || '';
      appState.txFilter.dateTo    = document.getElementById('filter-date-to')?.value || '';
      renderCurrentPage();
    }, 350);
  };
  on('filter-amt-min',   'input', onAdvInput);
  on('filter-amt-max',   'input', onAdvInput);
  on('filter-date-from', 'change', onAdvInput);
  on('filter-date-to',   'change', onAdvInput);
  // v5.94: 詳細フィルタークリア
  on('adv-filter-clear', 'click', () => {
    appState.txFilter.amountMin = '';
    appState.txFilter.amountMax = '';
    appState.txFilter.dateFrom  = '';
    appState.txFilter.dateTo    = '';
    renderCurrentPage();
  });
  // v5.97: フィルター保存ボタン
  on('sf-save-btn', 'click', () => {
    const name = prompt('フィルター名を入力してください（例：食費だけ・山田さんの支出）', '');
    if (!name?.trim()) return;
    if (saveTxFilter(name.trim())) {
      showToast(`「${name.trim()}」を保存しました`, 'success');
      renderCurrentPage();
    }
  });
  // v5.97: 保存済みフィルターチップ（適用・削除）
  const sfRow = document.getElementById('sf-row');
  if (sfRow) {
    sfRow.addEventListener('click', e => {
      const delBtn = e.target.closest('.sf-chip-del');
      if (delBtn) {
        e.stopPropagation();
        deleteSavedFilter(delBtn.dataset.sfid);
        renderCurrentPage();
        return;
      }
      const chip = e.target.closest('.sf-chip');
      if (chip) {
        const saved = getSavedFilters().find(s => s.id === chip.dataset.sfid);
        if (saved) { applySavedFilter(saved); renderCurrentPage(); }
      }
    });
  }
  // v5.96: 期間クイックプリセット
  document.querySelectorAll('.adv-preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const { from, to, wide } = btn.dataset;
      if (appState.txFilter.dateFrom === from && appState.txFilter.dateTo === to) {
        appState.txFilter.dateFrom = '';
        appState.txFilter.dateTo   = '';
      } else {
        appState.txFilter.dateFrom = from;
        appState.txFilter.dateTo   = to;
        if (wide === '1') appState.month = 'all';
      }
      renderCurrentPage();
    });
  });
  // v5.78: ソートヘッダークリック
  document.querySelectorAll('.tx-th-sort').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (appState.txSort.key === key) {
        appState.txSort.dir = appState.txSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        appState.txSort = { key, dir: key === 'amount' ? 'desc' : 'asc' };
      }
      appState._sortChanged = true;
      renderCurrentPage();
      appState._sortChanged = false;
    });
  });
  // v5.79: ソートリセットバッジ
  on('tx-sort-reset', 'click', () => {
    appState.txSort = { key: 'date', dir: 'desc' };
    appState._sortChanged = true;
    renderCurrentPage();
    appState._sortChanged = false;
  });
  // タグフィルターチップ行 (v5.62: クリックイベント委任)
  const tagFilterRow = document.getElementById('tag-filter-row');
  if (tagFilterRow) {
    tagFilterRow.addEventListener('click', e => {
      const chip = e.target.closest('[data-tag]');
      if (!chip) return;
      appState.txFilter.tag = chip.dataset.tag || '';
      renderCurrentPage();
    });
  }
  let _searchTimer = null;
  on('filter-search', 'input', e => {
    appState.txFilter.search = e.target.value;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const searchEl = document.getElementById('filter-search');
      const pos = searchEl ? searchEl.selectionStart : null;
      renderCurrentPage();
      const newSearchEl = document.getElementById('filter-search');
      if (newSearchEl && appState.txFilter.search) {
        newSearchEl.focus();
        if (pos !== null) try { newSearchEl.setSelectionRange(pos, pos); } catch(e) {}
      }
    }, 300);
  });
  // 月次PDFボタン (v7.6)
  on('btn-monthly-pdf', 'click', () => doMonthlyExportPDF(appState.month));
  // 追加ボタン
  on('open-add-modal', 'click', () => openTxModal(null));
  // 編集・削除
  document.querySelectorAll('.edit-tx').forEach(btn => {
    btn.addEventListener('click', () => openTxModal(btn.dataset.id));
  });
  document.querySelectorAll('.dup-tx').forEach(btn => {
    btn.addEventListener('click', () => {
      const tx = appData.transactions.find(t => t.id === btn.dataset.id);
      if (!tx) return;
      // dup-pop アニメーション
      btn.classList.remove('dup-popping');
      void btn.offsetWidth;
      btn.classList.add('dup-popping');
      btn.addEventListener('animationend', () => btn.classList.remove('dup-popping'), { once: true });
      // 複製元行フラッシュ
      const row = btn.closest('tr');
      if (row) {
        row.classList.remove('tx-dup-flash');
        void row.offsetWidth;
        row.classList.add('tx-dup-flash');
        row.addEventListener('animationend', () => row.classList.remove('tx-dup-flash'), { once: true });
      }
      openTxModal(null, { ...tx, date: todayStr(), isDuplicate: true, name: tx.memo || '複製' });
    });
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
  // ── 一括操作 (v5.55) ────────────────────────────────────────
  on('bulk-toggle', 'click', () => {
    appState.bulkMode = !appState.bulkMode;
    if (!appState.bulkMode) appState.selectedTxIds.clear();
    renderCurrentPage();
  });
  if (appState.bulkMode) {
    // 全選択チェックボックス
    const allCb = document.getElementById('tx-select-all');
    if (allCb) {
      const totalRows = document.querySelectorAll('.tx-cb[data-id]').length;
      allCb.checked = appState.selectedTxIds.size > 0 && appState.selectedTxIds.size === totalRows;
      allCb.indeterminate = appState.selectedTxIds.size > 0 && appState.selectedTxIds.size < totalRows;
      allCb.addEventListener('change', e => {
        document.querySelectorAll('.tx-cb[data-id]').forEach(cb => {
          if (e.target.checked) appState.selectedTxIds.add(cb.dataset.id);
          else appState.selectedTxIds.delete(cb.dataset.id);
        });
        syncBulkCheckboxes();
        updateBulkBar();
      });
    }
    // 個別チェックボックス
    document.querySelectorAll('.tx-cb[data-id]').forEach(cb => {
      cb.addEventListener('change', e => {
        if (e.target.checked) appState.selectedTxIds.add(e.target.dataset.id);
        else appState.selectedTxIds.delete(e.target.dataset.id);
        document.querySelectorAll('.tx-table tbody tr[data-id]').forEach(row => {
          row.classList.toggle('tx-selected', appState.selectedTxIds.has(row.dataset.id));
        });
        const all = document.getElementById('tx-select-all');
        if (all) {
          const total = document.querySelectorAll('.tx-cb[data-id]').length;
          all.checked = appState.selectedTxIds.size === total && total > 0;
          all.indeterminate = appState.selectedTxIds.size > 0 && appState.selectedTxIds.size < total;
        }
        updateBulkBar();
      });
    });
    updateBulkBar();
  }
  // モーダルバインド
  bindTxModal();
}

// ── 一括操作ヘルパー (v5.55) ────────────────────────────────
function syncBulkCheckboxes() {
  document.querySelectorAll('.tx-cb[data-id]').forEach(cb => {
    cb.checked = appState.selectedTxIds.has(cb.dataset.id);
  });
  document.querySelectorAll('.tx-table tbody tr[data-id]').forEach(row => {
    row.classList.toggle('tx-selected', appState.selectedTxIds.has(row.dataset.id));
  });
  const all = document.getElementById('tx-select-all');
  if (all) {
    const total = document.querySelectorAll('.tx-cb[data-id]').length;
    all.checked = appState.selectedTxIds.size === total && total > 0;
    all.indeterminate = appState.selectedTxIds.size > 0 && appState.selectedTxIds.size < total;
  }
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (!bar) return;
  const ids = [...appState.selectedTxIds];
  const count = ids.length;
  if (!appState.bulkMode || count === 0) { bar.innerHTML = ''; return; }

  const txs = ids.map(id => appData.transactions.find(t => t.id === id)).filter(Boolean);
  const expTotal = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const incTotal = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalLabel = expTotal > 0 && incTotal > 0
    ? `支出 -${formatMoney(expTotal)} / 収入 +${formatMoney(incTotal)}`
    : expTotal > 0 ? `-${formatMoney(expTotal)}` : `+${formatMoney(incTotal)}`;

  const catOpts = appData.categories.map(c =>
    `<option value="${c.id}">${esc2(c.name)}</option>`).join('');
  const memOpts = appData.members.length > 0
    ? `<div class="bulk-action-item">
        <select id="bulk-mem-sel" class="bulk-sel">
          <option value="">担当者変更…</option>
          ${appData.members.map(m => `<option value="${m.id}">${esc2(m.name)}</option>`).join('')}
        </select>
       </div>` : '';

  bar.innerHTML = `
<div class="bulk-bar">
  <div class="bulk-bar-info">
    <span class="bulk-count">${count}件選択中</span>
    <span class="bulk-total">${totalLabel}</span>
  </div>
  <div class="bulk-bar-sep"></div>
  <div class="bulk-bar-actions">
    <div class="bulk-action-item">
      <select id="bulk-cat-sel" class="bulk-sel">
        <option value="">カテゴリ変更…</option>
        ${catOpts}
      </select>
    </div>
    ${memOpts}
    <button id="bulk-delete-btn" class="btn btn-danger btn-sm">🗑 削除</button>
    <button id="bulk-cancel-btn" class="btn btn-ghost btn-sm">✕ 解除</button>
  </div>
</div>`;

  document.getElementById('bulk-cat-sel').addEventListener('change', e => {
    if (!e.target.value) return;
    bulkChangeCategory(e.target.value);
  });
  if (appData.members.length > 0) {
    document.getElementById('bulk-mem-sel').addEventListener('change', e => {
      if (!e.target.value) return;
      bulkChangeMember(e.target.value);
    });
  }
  document.getElementById('bulk-delete-btn').addEventListener('click', bulkDelete);
  document.getElementById('bulk-cancel-btn').addEventListener('click', () => {
    appState.selectedTxIds.clear();
    syncBulkCheckboxes();
    updateBulkBar();
  });
}

function bulkDelete() {
  const ids = [...appState.selectedTxIds];
  if (!ids.length) return;
  if (!confirm(`${ids.length}件の取引を削除しますか？`)) return;
  ids.forEach(id => deleteTransaction(id));
  appState.selectedTxIds.clear();
  appState.bulkMode = false;
  showToast(`${ids.length}件を削除しました`, 'success');
  renderCurrentPage();
}

function bulkChangeCategory(catId) {
  const ids = [...appState.selectedTxIds];
  ids.forEach(id => {
    const tx = appData.transactions.find(t => t.id === id);
    if (tx) tx.categoryId = catId;
  });
  saveData();
  const cat = getCategoryById(catId);
  showToast(`${ids.length}件のカテゴリを「${cat ? cat.name : ''}」に変更しました`, 'success');
  renderCurrentPage();
}

function bulkChangeMember(memId) {
  const ids = [...appState.selectedTxIds];
  ids.forEach(id => {
    const tx = appData.transactions.find(t => t.id === id);
    if (tx) tx.memberId = memId;
  });
  saveData();
  const mem = getMemberById(memId);
  showToast(`${ids.length}件の担当者を「${mem ? mem.name : ''}」に変更しました`, 'success');
  renderCurrentPage();
}

// ── 収支入力モーダル ──────────────────────────────────────
function renderTxModal() {
  const isEdit = !!appState.editingTxId;
  const t   = isEdit ? appData.transactions.find(t => t.id === appState.editingTxId) : null;
  const tpl = !isEdit ? appState.templateData : null;  // テンプレートデータ
  const src = t || tpl;  // 値の取得元（編集中の取引 or テンプレート）
  const type = src ? src.type : 'expense';

  const memOptions = appData.members
    .map(m => `<option value="${m.id}" ${src && src.memberId === m.id ? 'selected' : !src && m.id === appData.settings.defaultMemberId ? 'selected' : ''}>${esc2(m.name)}</option>`)
    .join('');

  const isDup = !isEdit && tpl && tpl.isDuplicate;
  const modalTitle = isEdit ? '取引を編集' : tpl ? (isDup ? '複製して追加' : `⚡ ${esc2(tpl.name)}`) : '収支を追加';
  const dupBanner = isDup ? `<div class="dup-modal-banner"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>元の取引を複製 — 日付は今日に変更されました</div>` : '';

  return `
<div id="tx-modal" class="modal-overlay" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h2>${isDup ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="dup-modal-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' : ''}${modalTitle}</h2>
      <button class="modal-close" id="modal-close">✕</button>
    </div>${dupBanner}
    <div id="tx-added-banner" class="tx-added-banner" style="display:none">
      ✓ <span class="tx-added-count-badge" id="tx-added-count">0</span>件追加済み — 続けて入力してください
    </div>
    <div class="modal-body tx-modal-anim">
      <div class="type-toggle">
        <button class="type-btn ${type === 'expense' ? 'active expense-btn' : ''}" data-type="expense">支出</button>
        <button class="type-btn ${type === 'income' ? 'active income-btn' : ''}" data-type="income">収入</button>
      </div>
      <div class="receipt-scan-area">
        <button class="btn btn-receipt" id="receipt-scan-btn" type="button">
          📷 レシートから読み込む
        </button>
        <label class="btn btn-receipt-file" id="receipt-file-label" title="画像・PDFから選択">
          📄
          <input type="file" id="receipt-file-input" accept="image/*,application/pdf" style="display:none">
        </label>
        <div id="scan-result" class="scan-result" style="display:none"></div>
        <div id="multi-receipt-list" class="multi-receipt-list" style="display:none"></div>
      </div>
      <div class="form-group">
        <label>日付</label>
        <input type="date" id="tx-date" value="${t ? t.date : todayStr()}" required>
        <div class="date-quick-btns">
          <button type="button" class="date-quick-btn" data-offset="-2">一昨日</button>
          <button type="button" class="date-quick-btn" data-offset="-1">昨日</button>
          <button type="button" class="date-quick-btn date-quick-today" data-offset="0">今日</button>
        </div>
      </div>
      <div class="form-group">
        <label>金額（円）</label>
        <input type="text" id="tx-amount" inputmode="decimal" value="${src ? src.amount : ''}" placeholder="例: 1500+300" autocomplete="off">
        <div id="amt-calc-preview" class="amt-calc-preview"></div>
        <div class="amount-presets">
          <button type="button" class="btn-preset" data-amount="500">¥500</button>
          <button type="button" class="btn-preset" data-amount="1000">¥1,000</button>
          <button type="button" class="btn-preset" data-amount="3000">¥3,000</button>
          <button type="button" class="btn-preset" data-amount="5000">¥5,000</button>
          <button type="button" class="btn-preset" data-amount="10000">¥10,000</button>
        </div>
        <div id="amount-hist-chips" class="amount-hist-chips" style="display:none"></div>
      </div>
      <div class="form-group">
        <label>カテゴリ
          <button type="button" class="btn-inline-add" id="btn-quick-cat" title="カテゴリを今すぐ追加">＋ 新規追加</button>
        </label>
        <input type="hidden" id="tx-category" value="${src ? src.categoryId || '' : ''}">
        <div id="cat-chip-grid" class="cat-chip-grid"></div>
        <div id="quick-cat-form" class="quick-cat-form" style="display:none">
          <input type="text" id="qcat-name" placeholder="カテゴリ名（例: 外食費）">
          <input type="text" id="qcat-yayoi" placeholder="弥生科目（例: 食料品費）">
          <button type="button" class="btn btn-primary btn-sm" id="qcat-save">追加</button>
          <button type="button" class="btn btn-ghost btn-sm" id="qcat-cancel">キャンセル</button>
        </div>
      </div>
      <div class="form-group">
        <label>摘要（メモ）</label>
        <input type="text" id="tx-memo" value="${esc2(src ? src.memo : '')}" placeholder="例: スーパーでの買い物"
               list="memo-suggestions" autocomplete="off">
        <datalist id="memo-suggestions"></datalist>
        <div id="memo-hist-chips" class="memo-hist-chips" style="display:none"></div>
        <div id="memo-cat-hint" class="memo-cat-hint" style="display:none"></div>
      </div>
      <div class="form-group">
        <label>タグ <span class="tx-tag-label-hint">カンマ区切りで複数指定</span></label>
        <input type="text" id="tx-tags" class="form-input"
          placeholder="例: 旅行, 外食, まとめ買い"
          value="${src && src.tags && src.tags.length > 0 ? src.tags.join(', ') : ''}"
          list="tx-tag-suggestions" autocomplete="off">
        <datalist id="tx-tag-suggestions"></datalist>
        <div id="tx-tag-preview" class="tx-tag-preview"></div>
      </div>

      <div class="form-group">
        <label>支払方法</label>
        <select id="tx-payment">
          ${['現金','クレカ','口座振替','銀行振込','電子マネー','その他'].map(p =>
            `<option value="${p}" ${src && src.paymentMethod === p ? 'selected' : !src && p === 'クレカ' ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <!-- 詳細設定（折りたたみ） -->
      <details class="modal-details" ${src ? 'open' : ''}>
        <summary>詳細設定</summary>
        <div class="modal-details-body">
          <div class="form-group">
            <label>担当者</label>
            <select id="tx-member"><option value="">—</option>${memOptions}</select>
          </div>
          <div class="form-group">
            <label>消費税率（青色申告用）</label>
            <select id="tx-tax">
              <option value="0"  ${src && src.taxRate == 0  ? 'selected' : ''}>対象外（0%）</option>
              <option value="10" ${!src || src.taxRate == 10  ? 'selected' : ''}>課税 10%</option>
              <option value="8"  ${src && src.taxRate == 8   ? 'selected' : ''}>課税 8%（軽減）</option>
            </select>
          </div>
        </div>
      </details>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="modal-cancel">キャンセル</button>
      ${!isEdit ? '<button class="btn btn-continue" id="modal-save-more">続けて追加</button>' : ''}
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
  document.body.insertAdjacentHTML('beforeend', renderTxModal());
  bindTxModal();
  showModal('tx-modal');
  // タイプボタンによるカテゴリ表示切替
  updateCatGroups();
  // 初期サジェスト（編集・テンプレート時はカテゴリが選択済みなので即反映）
  updateMemoSuggestions();
  updateAmountSuggestions(); // v7.3: よく使う金額
  updateMemoChips(); // v7.4: 最近のメモ
  // 金額フィールドにオートフォーカス
  setTimeout(() => {
    const amountInput = document.getElementById('tx-amount');
    if (amountInput) amountInput.focus();
  }, 80);
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
      updateMemoSuggestions();
    });
  });

  // カテゴリ変更でメモサジェスト更新（chip クリック時は renderCatChips 内で呼ぶので不要だが念のため）

  // 保存
  on('modal-save', 'click', () => saveTxFromModal(false));
  // 続けて追加 (v7.8)
  on('modal-save-more', 'click', () => saveTxFromModal(true));

  // Enterキーで保存 / Escapeで閉じる
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeTxModal();
    } else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      // 金額フィールドで計算式が入力中ならまず計算する
      if (e.target.id === 'tx-amount' && isCalcExpr(e.target.value.trim())) {
        const amtInput2 = e.target;
        const result = evalCalcExpr(amtInput2.value.trim());
        if (!isNaN(result)) {
          amtInput2.value = result;
          amtInput2.classList.remove('calc-mode');
          const cp = document.getElementById('amt-calc-preview');
          if (cp) cp.style.display = 'none';
        }
        return;
      }
      saveTxFromModal(false);
    }
  });

  // 金額プリセットボタン
  modal.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('tx-amount');
      if (el) { el.value = btn.dataset.amount; el.focus(); }
    });
  });

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
      color: activeType === 'expense' ? getCSSVar('--text-muted') : getCSSVar('--income'),
    });
    // チップグリッドを更新して新しいカテゴリを選択状態にする
    const hi = document.getElementById('tx-category');
    if (hi) hi.value = newCat.id;
    renderCatChips(activeType, newCat.id);
    document.getElementById('quick-cat-form').style.display = 'none';
    document.getElementById('qcat-name').value  = '';
    document.getElementById('qcat-yayoi').value = '';
  });

  // タグdatalist初期化 + リアルタイムプレビュー (v5.61/v5.62)
  const tagDl = document.getElementById('tx-tag-suggestions');
  if (tagDl) {
    getAllTags().forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      tagDl.appendChild(opt);
    });
  }
  // タグ入力 → リアルタイムチッププレビュー (v5.62)
  const tagsInput = document.getElementById('tx-tags');
  const tagPreview = document.getElementById('tx-tag-preview');
  function updateTagPreview() {
    if (!tagsInput || !tagPreview) return;
    const tags = tagsInput.value.split(/[,、，]+/).map(s => s.trim()).filter(s => s.length > 0);
    if (tags.length > 0) {
      tagPreview.innerHTML = tags.map(tag => {
        const col = getTagColor(tag);
        return `<span class="tx-tag-chip" style="--tc:${col}">#${esc2(tag)}</span>`;
      }).join('');
      tagPreview.style.display = 'flex';
    } else {
      tagPreview.innerHTML = '';
      tagPreview.style.display = 'none';
    }
  }
  if (tagsInput) {
    tagsInput.addEventListener('input', updateTagPreview);
    updateTagPreview(); // 初期値があれば即時表示
  }

  // メモ入力 → カテゴリ自動提案 (v5.53)
  const memoInput = document.getElementById('tx-memo');
  if (memoInput) {
    memoInput.addEventListener('input', () => {
      suggestCatFromMemo(memoInput.value.trim());
    });
    // 初期値があれば起動時に提案
    if (memoInput.value.trim().length >= 2) suggestCatFromMemo(memoInput.value.trim());
  }

  // レシートスキャン（カメラ）
  on('receipt-scan-btn', 'click', () => {
    if (!checkApiKey()) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment'); // モバイルでカメラ起動
    input.addEventListener('change', e => {
      if (e.target.files[0]) processReceiptFile(e.target.files[0]);
    });
    input.click();
  });

  // レシートスキャン（ファイル選択）
  on('receipt-file-input', 'change', e => {
    if (!checkApiKey()) return;
    if (e.target.files[0]) processReceiptFile(e.target.files[0]);
  });

  // 日付クイックピッカーボタン (v7.2)
  const dateInput = document.getElementById('tx-date');
  const dateQuickBtns = document.querySelectorAll('.date-quick-btn');

  function syncDateQuickBtns() {
    if (!dateInput) return;
    dateQuickBtns.forEach(b => {
      const off = parseInt(b.dataset.offset, 10);
      const d2 = new Date();
      d2.setDate(d2.getDate() + off);
      b.classList.toggle('active', dateInput.value === d2.toISOString().slice(0, 10));
    });
  }
  syncDateQuickBtns();

  dateQuickBtns.forEach(btn => {
    const offset = parseInt(btn.dataset.offset, 10);
    btn.addEventListener('click', () => {
      if (!dateInput) return;
      const d = new Date();
      d.setDate(d.getDate() + offset);
      dateInput.value = d.toISOString().slice(0, 10);
      // バウンスアニメーション
      btn.classList.add('date-quick-pop');
      btn.addEventListener('animationend', () => btn.classList.remove('date-quick-pop'), { once: true });
      syncDateQuickBtns();
    });
  });

  if (dateInput) {
    dateInput.addEventListener('change', syncDateQuickBtns);
  }

  // 金額フィールド インライン電卓 (v7.5)
  const amtInput = document.getElementById('tx-amount');
  const calcPreview = document.getElementById('amt-calc-preview');

  function updateCalcPreview() {
    if (!amtInput || !calcPreview) return;
    const val = amtInput.value.trim();
    if (isCalcExpr(val)) {
      const result = evalCalcExpr(val);
      amtInput.classList.add('calc-mode');
      if (!isNaN(result)) {
        calcPreview.innerHTML = `<span class="calc-arrow">＝</span><span class="calc-result">¥${result.toLocaleString()}</span><span class="calc-hint">Enterで確定</span>`;
        calcPreview.style.display = 'flex';
      } else {
        calcPreview.innerHTML = `<span class="calc-arrow">＝</span><span class="calc-err">計算できません</span>`;
        calcPreview.style.display = 'flex';
      }
    } else {
      amtInput.classList.remove('calc-mode');
      calcPreview.style.display = 'none';
    }
  }

  function resolveAmtExpr() {
    if (!amtInput) return false;
    const val = amtInput.value.trim();
    if (!isCalcExpr(val)) return false;
    const result = evalCalcExpr(val);
    if (!isNaN(result)) {
      amtInput.value = result;
      amtInput.classList.remove('calc-mode');
      if (calcPreview) calcPreview.style.display = 'none';
      return true;
    }
    return false;
  }

  if (amtInput) {
    amtInput.addEventListener('input', updateCalcPreview);
    amtInput.addEventListener('blur', () => {
      resolveAmtExpr();
    });
    updateCalcPreview();
  }
}

// ── カテゴリアイコンマップ (v5.30) ────────────────────────────────
const CAT_ICONS = {
  '食費':'🍽️','光熱費':'💡','通信費':'📱','交通費':'🚃',
  '医療費':'🏥','教育費':'📚','住居費':'🏠','娯楽費':'🎮',
  '消耗品':'🛒','保険料':'🛡️','衣服費':'👗','その他支出':'📦',
  '給与':'💰','賞与':'🎁','副業収入':'💼','その他収入':'💴',
};

// カテゴリチップグリッドを描画する (v5.30)
function renderCatChips(type, selectedId) {
  const grid = document.getElementById('cat-chip-grid');
  if (!grid) return;
  const cats = appData.categories.filter(c => c.type === type);
  grid.innerHTML = cats.map(c => {
    const icon = CAT_ICONS[c.name] || '📌';
    const isSel = c.id === selectedId;
    return `<button type="button" class="cat-chip${isSel ? ' selected' : ''}" data-cat-id="${c.id}" style="--cat-color:${c.color}">
      <span class="cat-chip-icon">${icon}</span>
      <span class="cat-chip-name">${esc2(c.name)}</span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const hi = document.getElementById('tx-category');
      if (hi) hi.value = btn.dataset.catId;
      updateMemoSuggestions();
      updateAmountSuggestions(); // v7.3: よく使う金額を更新
      updateMemoChips(); // v7.4: 最近のメモを更新
      // 手動選択したらヒントを閉じる
      const hint = document.getElementById('memo-cat-hint');
      if (hint) hint.style.display = 'none';
    });
  });
}

function updateCatGroups() {
  const modal = document.getElementById('tx-modal');
  if (!modal) return;
  const activeType = modal.querySelector('.type-btn.active')?.dataset.type || 'expense';
  const hi = document.getElementById('tx-category');
  // タイプが変わったとき選択が外れていたらリセット
  if (hi && hi.value) {
    const cat = appData.categories.find(c => c.id === hi.value);
    if (cat && cat.type !== activeType) hi.value = '';
  }
  renderCatChips(activeType, hi ? hi.value : '');
}

// メモサジェスト：選択カテゴリの直近ユニークメモを datalist に反映
function updateMemoSuggestions() {
  const catSel = document.getElementById('tx-category');
  const dl = document.getElementById('memo-suggestions');
  if (!catSel || !dl) return;
  const catId = catSel.value;
  if (!catId) { dl.innerHTML = ''; return; }
  const seen = new Set();
  const opts = appData.transactions
    .filter(t => t.categoryId === catId && t.memo && t.memo.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .reduce((arr, t) => {
      const m = t.memo.trim();
      if (!seen.has(m)) { seen.add(m); arr.push(m); }
      return arr;
    }, [])
    .slice(0, 8)
    .map(m => `<option value="${esc2(m)}">`)
    .join('');
  dl.innerHTML = opts;
}

// ── カテゴリ別「最近のメモ」サジェストチップ (v7.4) ────────────────────
function getRecentMemos(categoryId, limit = 4) {
  if (!categoryId) return [];
  const seen = new Set();
  const result = [];
  appData.transactions
    .filter(t => t.categoryId === categoryId && t.memo && t.memo.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach(t => {
      const m = t.memo.trim();
      if (!seen.has(m)) { seen.add(m); result.push(m); }
    });
  return result.slice(0, limit);
}

function updateMemoChips() {
  const wrap = document.getElementById('memo-hist-chips');
  if (!wrap) return;
  const catSel = document.getElementById('tx-category');
  const catId = catSel ? catSel.value : '';
  const memos = getRecentMemos(catId);
  if (memos.length === 0) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  const cat = getCategoryById(catId);
  const color = cat ? cat.color : 'var(--primary)';
  wrap.style.display = 'flex';
  wrap.innerHTML = `<span class="memo-hist-label">最近：</span>` +
    memos.map((m, i) =>
      `<button type="button" class="memo-hist-chip" data-memo="${esc2(m)}"
               style="--memo-chip-color:${color};animation-delay:${i * 45}ms"
               title="${esc2(m)}">${esc2(m)}</button>`
    ).join('');
  wrap.querySelectorAll('.memo-hist-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('tx-memo');
      if (el) {
        el.value = btn.dataset.memo;
        el.focus();
        btn.classList.remove('memo-chip-pop');
        void btn.offsetWidth;
        btn.classList.add('memo-chip-pop');
        btn.addEventListener('animationend', () => btn.classList.remove('memo-chip-pop'), { once: true });
        suggestCatFromMemo(el.value.trim());
      }
    });
  });
}

// ── カテゴリ別「よく使う金額」サジェスト (v7.3) ─────────────────────
// ============================================================
// インライン電卓ヘルパー (v7.5)
// ============================================================
function evalCalcExpr(str) {
  // 全角数字・演算子を半角に変換
  let s = str
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[＋]/g, '+').replace(/[－]/g, '-').replace(/[×＊]/g, '*').replace(/[÷／]/g, '/')
    .replace(/[,，、]/g, '').replace(/¥/g, '').replace(/\s+/g, '');
  // 数字と四則演算子・括弧・小数点のみ許可
  if (!/^[\d+\-*/.()]+$/.test(s) || s.length === 0) return NaN;
  // 安全に評価
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + s + ')')();
    if (!Number.isFinite(result) || result <= 0) return NaN;
    return Math.round(result);
  } catch { return NaN; }
}

function isCalcExpr(str) {
  const s = str.replace(/[,，、¥\s]/g, '');
  return /[+\-*\/×÷＋－×÷]/.test(s) && /\d/.test(s);
}

function getFrequentAmounts(categoryId, limit = 4) {
  if (!categoryId) return [];
  const counts = {};
  appData.transactions
    .filter(t => t.categoryId === categoryId)
    .forEach(t => {
      const key = String(t.amount);
      counts[key] = (counts[key] || 0) + 1;
    });
  return Object.entries(counts)
    .filter(([, cnt]) => cnt >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([amt]) => Number(amt));
}

function updateAmountSuggestions() {
  const wrap = document.getElementById('amount-hist-chips');
  if (!wrap) return;
  const catSel = document.getElementById('tx-category');
  const catId = catSel ? catSel.value : '';
  const amounts = getFrequentAmounts(catId);
  if (amounts.length === 0) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  const cat = getCategoryById(catId);
  const color = cat ? cat.color : 'var(--primary)';
  wrap.style.display = 'flex';
  wrap.innerHTML = `<span class="amt-hist-label">よく使う：</span>` +
    amounts.map((amt, i) =>
      `<button type="button" class="amt-hist-chip" data-amount="${amt}"
               style="--amt-chip-color:${color};animation-delay:${i * 45}ms">
         ¥${formatMoney(amt)}
       </button>`
    ).join('');
  wrap.querySelectorAll('.amt-hist-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('tx-amount');
      if (el) {
        el.value = btn.dataset.amount;
        el.focus();
        btn.classList.remove('amt-chip-pop');
        void btn.offsetWidth;
        btn.classList.add('amt-chip-pop');
        btn.addEventListener('animationend', () => btn.classList.remove('amt-chip-pop'), { once: true });
      }
    });
  });
}

// メモ文字列から最頻出カテゴリを提案するヒントを表示 (v5.53)
function suggestCatFromMemo(memo) {
  const hint = document.getElementById('memo-cat-hint');
  const catSel = document.getElementById('tx-category');
  if (!hint || !catSel) return;

  if (memo.length < 2) { hint.style.display = 'none'; return; }

  const lower = memo.toLowerCase();
  const catCounts = {};
  appData.transactions
    .filter(t => t.memo && t.memo.toLowerCase().includes(lower) && t.categoryId)
    .forEach(t => { catCounts[t.categoryId] = (catCounts[t.categoryId] || 0) + 1; });

  const entries = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) { hint.style.display = 'none'; return; }

  const [topCatId, count] = entries[0];
  if (catSel.value === topCatId) { hint.style.display = 'none'; return; }

  const cat = getCategoryById(topCatId);
  if (!cat) { hint.style.display = 'none'; return; }

  const icon = CAT_ICONS[cat.name] || '📌';
  hint.style.display = 'flex';
  hint.innerHTML = `
    <span class="memo-cat-hint-icon" style="color:${cat.color}">${icon}</span>
    <span class="memo-cat-hint-text">「<strong>${esc2(cat.name)}</strong>」で${count}回使用</span>
    <button type="button" class="memo-cat-hint-btn" data-cat-id="${topCatId}" data-cat-type="${cat.type}">適用</button>
  `;

  hint.querySelector('.memo-cat-hint-btn').addEventListener('click', () => {
    const modal = document.getElementById('tx-modal');
    const currentType = modal?.querySelector('.type-btn.active')?.dataset.type;
    if (cat.type !== currentType) {
      modal.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active', 'expense-btn', 'income-btn'));
      const typeBtn = modal.querySelector(`.type-btn[data-type="${cat.type}"]`);
      if (typeBtn) typeBtn.classList.add('active', cat.type === 'expense' ? 'expense-btn' : 'income-btn');
    }
    catSel.value = topCatId;
    renderCatChips(cat.type, topCatId);
    updateMemoSuggestions();
    updateAmountSuggestions(); // v7.3
    updateMemoChips(); // v7.4
    hint.style.display = 'none';
  });
}

function closeTxModal() {
  const modal = document.getElementById('tx-modal');
  // 連続入力で1件以上追加済みの場合は閉じるときにページ再描画
  const addedCount = parseInt(document.getElementById('tx-added-count')?.textContent, 10) || 0;
  if (modal) { hideModal(modal); modal.remove(); } // DOMから完全削除して前回データの残留を防止
  appState.editingTxId = null;
  appState.templateData = null; // テンプレートデータもクリア
  if (addedCount > 0) {
    renderCurrentPage();
    checkBudgetAlerts(appState.month);
  }
}

function saveTxFromModal(keepOpen = false) {
  const modal = document.getElementById('tx-modal');
  const type    = modal.querySelector('.type-btn.active')?.dataset.type || 'expense';
  const date    = document.getElementById('tx-date')?.value;
  const amtRaw  = document.getElementById('tx-amount')?.value?.trim() || '';
  const amount  = isCalcExpr(amtRaw) ? (evalCalcExpr(amtRaw) || 0) : Number(amtRaw);
  const catId   = document.getElementById('tx-category')?.value;
  const payment = document.getElementById('tx-payment')?.value;
  const memId   = document.getElementById('tx-member')?.value;
  const taxRate = Number(document.getElementById('tx-tax')?.value);
  const memo    = document.getElementById('tx-memo')?.value;

  if (!date)   { alert('日付を入力してください'); return; }
  if (!amount || amount <= 0) { alert('金額を入力してください'); return; }
  if (!catId)  { alert('カテゴリを選択してください'); return; }

  // タグをパース (v5.61): カンマ・読点・全角カンマで区切り、空白トリム・重複除去
  const tagsRaw = document.getElementById('tx-tags')?.value || '';
  const tags = [...new Set(
    tagsRaw.split(/[,、，]+/).map(s => s.trim()).filter(s => s.length > 0)
  )];

  const fields = { type, date, amount, categoryId: catId, paymentMethod: payment, memberId: memId, taxRate, memo, tags };

  if (appState.editingTxId) {
    updateTransaction(appState.editingTxId, fields);
  } else {
    addTransaction(fields);
  }

  if (keepOpen) {
    // ── 連続入力モード (v7.8): モーダルを閉じずに金額・摘要・タグをクリア ──
    appState.month = date.slice(0, 7);
    // バナー更新
    const banner = document.getElementById('tx-added-banner');
    const countEl = document.getElementById('tx-added-count');
    if (banner && countEl) {
      const prev = parseInt(countEl.textContent, 10) || 0;
      countEl.textContent = prev + 1;
      banner.style.display = '';
      // 再アニメーション
      banner.style.animation = 'none';
      requestAnimationFrame(() => { banner.style.animation = ''; });
    }
    // 金額・摘要・タグをクリア
    const amtEl = document.getElementById('tx-amount');
    const memoEl = document.getElementById('tx-memo');
    const tagsEl = document.getElementById('tx-tags');
    const calcPrev = document.getElementById('amt-calc-preview');
    const tagPrev = document.getElementById('tx-tag-preview');
    const memoHint = document.getElementById('memo-cat-hint');
    if (amtEl)  { amtEl.value = ''; amtEl.classList.remove('calc-mode'); }
    if (memoEl) memoEl.value = '';
    if (tagsEl) tagsEl.value = '';
    if (calcPrev) calcPrev.style.display = 'none';
    if (tagPrev)  tagPrev.innerHTML = '';
    if (memoHint) memoHint.style.display = 'none';
    // 金額フィールドにフォーカス
    setTimeout(() => amtEl?.focus(), 50);
    // 予算アラートトースト（即時 in-app 通知）
    if (type === 'expense' && catId) {
      setTimeout(() => checkBudgetToast(catId, appState.month), 500);
    }
    return;
  }

  closeTxModal();
  // 一覧に月が合わせてあることを確認
  appState.month = date.slice(0, 7);
  renderCurrentPage();
  // 予算アラートチェック（ブラウザ通知）
  checkBudgetAlerts(appState.month);
  // 予算アラートトースト（即時 in-app 通知）
  if (type === 'expense' && catId) {
    setTimeout(() => checkBudgetToast(catId, appState.month), 300);
  }
}

// ============================================================
// レポート
// ============================================================
// ============================================================
// 年間支出ヒートマップ (v5.82)
// ============================================================
// ============================================================
// 年次インサイトセクション (v8.2)
// ============================================================
function renderInsightsSection(year, allTxs, months12) {
  const monthData = months12.map(ym => {
    const txs = getTransactionsByMonth(ym);
    const income  = calcTotal(txs, 'income');
    const expense = calcTotal(txs, 'expense');
    const balance = income - expense;
    const savingsRate = income > 0 ? Math.round((balance / income) * 100) : null;
    const mo = parseInt(ym.split('-')[1]);
    return { ym, mo, income, expense, balance, savingsRate };
  });

  const activeMonths = monthData.filter(m => m.income > 0 || m.expense > 0);
  if (activeMonths.length === 0) {
    return `<div id="sec-insights" class="card"><p class="empty">データがまだありません。取引を追加するとインサイトが表示されます。</p></div>`;
  }

  // 最高/最低 貯蓄率月
  const moWithSavings = activeMonths.filter(m => m.savingsRate !== null);
  const bestMonth  = moWithSavings.length ? moWithSavings.reduce((a,b) => a.savingsRate > b.savingsRate ? a : b) : null;
  const worstMonth = moWithSavings.length > 1 ? moWithSavings.reduce((a,b) => a.savingsRate < b.savingsRate ? a : b) : null;

  // 前半/後半比較
  const h1Expense = monthData.filter(m => m.mo <= 6).reduce((s,m) => s + m.expense, 0);
  const h2Expense = monthData.filter(m => m.mo >= 7).reduce((s,m) => s + m.expense, 0);

  // 最長黒字連続
  let maxStreak = 0, curStreak = 0;
  for (const m of monthData) {
    if (m.balance >= 0 && (m.income > 0 || m.expense > 0)) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else curStreak = 0;
  }

  // 最大支出カテゴリ
  const catMap = {};
  allTxs.filter(t => t.type === 'expense').forEach(t => {
    const cat   = appData.categories.find(c => c.id === t.categoryId);
    const name  = cat ? cat.name  : 'その他';
    const color = cat ? cat.color : 'var(--text-muted)';
    if (!catMap[name]) catMap[name] = { amount: 0, color };
    catMap[name].amount += Number(t.amount) || 0;
  });
  const catEntries = Object.entries(catMap).sort((a,b) => b[1].amount - a[1].amount);
  const topCat = catEntries[0] || null;

  // 年間貯蓄率
  const yearIncome  = calcTotal(allTxs, 'income');
  const yearExpense = calcTotal(allTxs, 'expense');
  const yearSavingsRate = yearIncome > 0 ? Math.round(((yearIncome - yearExpense) / yearIncome) * 100) : 0;
  const savingsGrade = yearSavingsRate >= 20 ? { label:'S', color:'var(--primary)' }
    : yearSavingsRate >= 15 ? { label:'A', color:'var(--success)' }
    : yearSavingsRate >= 10 ? { label:'B', color:'var(--info-text)' }
    : yearSavingsRate >=  5 ? { label:'C', color:'var(--warning)' }
    : { label:'D', color:'var(--danger-text)' };

  // 月平均支出 前年比
  const prevYear      = year - 1;
  const prevAllTxs    = appData.transactions.filter(t => t.date && t.date.startsWith(String(prevYear)));
  const prevYearExp   = calcTotal(prevAllTxs, 'expense');
  const currMonthCnt  = new Set(allTxs.filter(t=>t.type==='expense').map(t=>t.date.substring(0,7))).size;
  const prevMonthCnt  = new Set(prevAllTxs.filter(t=>t.type==='expense').map(t=>t.date.substring(0,7))).size;
  const currAvgMo     = currMonthCnt > 0 ? Math.round(yearExpense / currMonthCnt) : 0;
  const prevAvgMo     = prevMonthCnt > 0 ? Math.round(prevYearExp  / prevMonthCnt) : 0;
  const avgDiff       = prevAvgMo > 0 ? Math.round((currAvgMo - prevAvgMo) / prevAvgMo * 100) : null;

  // 取引なし日
  const noSpendDays = activeMonths.reduce((s, m) => {
    const txsInMonth = getTransactionsByMonth(m.ym);
    const daysInMonth = new Date(year, m.mo, 0).getDate();
    const expDays = new Set(txsInMonth.filter(t=>t.type==='expense').map(t=>t.date)).size;
    return s + (daysInMonth - expDays);
  }, 0);

  return `<div id="sec-insights">
  <div class="yi-grid">

    <div class="yi-card" style="--yi-si:0">
      <div class="yi-card-icon" aria-hidden="true">💰</div>
      <div class="yi-card-label">年間貯蓄率</div>
      <div class="yi-card-value" style="color:${savingsGrade.color}">${yearSavingsRate}<span class="yi-card-unit">%</span></div>
      <div class="yi-card-sub"><span class="yi-grade-badge" style="background:${savingsGrade.color}">${savingsGrade.label}</span> ${yearSavingsRate >= 20 ? '優秀な節約' : yearSavingsRate >= 10 ? '良好な貯蓄' : yearSavingsRate >= 0 ? '改善の余地あり' : '支出超過'}</div>
    </div>

    ${bestMonth ? `<div class="yi-card" style="--yi-si:1">
      <div class="yi-card-icon" aria-hidden="true">🏆</div>
      <div class="yi-card-label">最高貯蓄月（${bestMonth.mo}月）</div>
      <div class="yi-card-value income">${bestMonth.savingsRate}<span class="yi-card-unit">%</span></div>
      <div class="yi-card-sub yi-sub-muted">収入 ${formatMoney(bestMonth.income)} / 支出 ${formatMoney(bestMonth.expense)}</div>
    </div>` : ''}

    ${worstMonth ? `<div class="yi-card" style="--yi-si:2">
      <div class="yi-card-icon" aria-hidden="true">📉</div>
      <div class="yi-card-label">最低月（${worstMonth.mo}月）</div>
      <div class="yi-card-value expense">${worstMonth.savingsRate}<span class="yi-card-unit">%</span></div>
      <div class="yi-card-sub yi-sub-muted">${worstMonth.balance < 0 ? `支出超過 ${formatMoney(Math.abs(worstMonth.balance))}` : `残高 ${formatMoney(worstMonth.balance)}`}</div>
    </div>` : ''}

    <div class="yi-card" style="--yi-si:3">
      <div class="yi-card-icon" aria-hidden="true">🔥</div>
      <div class="yi-card-label">黒字継続最長記録</div>
      <div class="yi-card-value" style="color:var(--warning)">${maxStreak}<span class="yi-card-unit">ヶ月</span></div>
      <div class="yi-card-sub yi-sub-muted">今年の連続黒字</div>
    </div>

    <div class="yi-card" style="--yi-si:4">
      <div class="yi-card-icon" aria-hidden="true">📊</div>
      <div class="yi-card-label">月平均支出</div>
      <div class="yi-card-value">${formatMoney(currAvgMo)}</div>
      ${avgDiff !== null
        ? `<div class="yi-card-sub">${avgDiff > 0 ? `<span class="yi-diff-up">▲${Math.abs(avgDiff)}% 前年比増</span>` : avgDiff < 0 ? `<span class="yi-diff-down">▼${Math.abs(avgDiff)}% 前年比減</span>` : '<span class="yi-sub-muted">前年比 ±0%</span>'}</div>`
        : '<div class="yi-card-sub yi-sub-muted">前年比較データなし</div>'}
    </div>

    <div class="yi-card" style="--yi-si:5">
      <div class="yi-card-icon" aria-hidden="true">↔️</div>
      <div class="yi-card-label">上半期 vs 下半期</div>
      <div class="yi-half-row">
        <div class="yi-half-cell">
          <div class="yi-half-label">1〜6月</div>
          <div class="yi-half-val expense">${formatMoney(h1Expense)}</div>
        </div>
        <div class="yi-half-sep"></div>
        <div class="yi-half-cell">
          <div class="yi-half-label">7〜12月</div>
          <div class="yi-half-val expense">${formatMoney(h2Expense)}</div>
        </div>
      </div>
      <div class="yi-card-sub yi-sub-muted">${h1Expense > h2Expense ? '上半期の支出が多い' : h2Expense > h1Expense ? '下半期の支出が多い' : '前後半ほぼ均等'}</div>
    </div>

    ${topCat ? `<div class="yi-card" style="--yi-si:6;--yi-cat-color:${topCat[1].color}">
      <div class="yi-card-icon" aria-hidden="true">🏷️</div>
      <div class="yi-card-label">最大支出カテゴリ</div>
      <div class="yi-card-value yi-card-value-cat">${esc2(topCat[0])}</div>
      <div class="yi-card-sub yi-sub-muted">${formatMoney(topCat[1].amount)}（${yearExpense > 0 ? Math.round(topCat[1].amount/yearExpense*100) : 0}%）</div>
    </div>` : ''}

    <div class="yi-card" style="--yi-si:7">
      <div class="yi-card-icon" aria-hidden="true">🌿</div>
      <div class="yi-card-label">無支出日数（合計）</div>
      <div class="yi-card-value income">${noSpendDays}<span class="yi-card-unit">日</span></div>
      <div class="yi-card-sub yi-sub-muted">${activeMonths.length}ヶ月分の集計</div>
    </div>

  </div>
</div>`;
}

function renderHeatmapSection(year, yearTxs) {
  // 日別支出マップ構築
  const dayMap = {};
  yearTxs.filter(t => t.type === 'expense' && t.date).forEach(t => {
    dayMap[t.date] = (dayMap[t.date] || 0) + (Number(t.amount) || 0);
  });

  // サマリー統計
  const expEntries = Object.entries(dayMap).filter(([, v]) => v > 0);
  const expDays = expEntries.length;
  const maxDay = expDays ? [...expEntries].sort((a, b) => b[1] - a[1])[0] : null;
  const yearTotalExp = expEntries.reduce((s, [, v]) => s + v, 0);
  const avgDailyExp = expDays > 0 ? Math.round(yearTotalExp / expDays) : 0;

  // 最長無支出連続期間
  let maxStreak = 0, curStreak = 0;
  for (let m = 0; m < 12; m++) {
    const dim = new Date(year, m + 1, 0).getDate();
    for (let d2 = 1; d2 <= dim; d2++) {
      const ds = `${year}-${String(m + 1).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
      if (!dayMap[ds]) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
      else curStreak = 0;
    }
  }

  // 四分位でレベル分け（1〜4）
  const sortedVals = expEntries.map(([, v]) => v).sort((a, b) => a - b);
  const q1 = sortedVals[Math.floor(sortedVals.length * 0.25)] || 0;
  const q2 = sortedVals[Math.floor(sortedVals.length * 0.5)] || 0;
  const q3 = sortedVals[Math.floor(sortedVals.length * 0.75)] || 0;
  const getLevel = v => {
    if (!v) return 0;
    if (v <= q1) return 1;
    if (v <= q2) return 2;
    if (v <= q3) return 3;
    return 4;
  };

  // グリッド開始日: 1月1日を含む週の日曜日
  const jan1 = new Date(year, 0, 1);
  const gridStart = new Date(year, 0, 1 - jan1.getDay());
  const todayIso = todayStr();

  // 各月の最初の週インデックスを記録
  const monthFirstWeek = {};
  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart);
      date.setDate(date.getDate() + w * 7 + d);
      if (date.getFullYear() === year) {
        const mo = date.getMonth();
        if (monthFirstWeek[mo] === undefined) monthFirstWeek[mo] = w;
      }
    }
  }

  // セルHTML生成（grid-auto-flow:column → (w,d)順で正しく配置）
  const cellsHtml = [];
  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart);
      date.setDate(date.getDate() + w * 7 + d);
      if (date.getFullYear() !== year) {
        cellsHtml.push(`<div class="hm-cell hm-out" style="--hm-wi:${w}" aria-hidden="true"></div>`);
        continue;
      }
      const dateStr = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const amount = dayMap[dateStr] || 0;
      const level = getLevel(amount);
      const mo = date.getMonth() + 1;
      const tooltip = amount > 0 ? `${dateStr}  ${formatMoney(amount)}` : dateStr;
      const isToday = dateStr === todayIso;
      cellsHtml.push(`<div class="hm-cell hm-lv${level}${isToday ? ' hm-today' : ''}" style="--hm-wi:${w}" title="${esc2(tooltip)}" data-hm-date="${dateStr}" data-hm-month="${mo}" role="gridcell" aria-label="${esc2(tooltip)}${isToday ? ' (今日)' : ''}"></div>`);
    }
  }

  // 月ラベルHTML
  const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const monthLabelsHtml = MONTH_LABELS.map((label, m) => {
    const wi = monthFirstWeek[m];
    if (wi === undefined) return '';
    return `<span class="hm-month-label" style="--hm-week-col:${wi}">${label}</span>`;
  }).join('');

  return `<div id="sec-heatmap" class="card">
  <h3 class="card-title">🗓️ 年間支出ヒートマップ（${year}年）</h3>
  <div class="hm-summary-row">
    <div class="hm-stat-card" style="--hm-si:0">
      <div class="hm-stat-label">支出日数</div>
      <div class="hm-stat-value">${expDays}<span class="hm-stat-unit">日</span></div>
    </div>
    <div class="hm-stat-card" style="--hm-si:1">
      <div class="hm-stat-label">最大支出日</div>
      <div class="hm-stat-value">${maxDay ? maxDay[0].slice(5).replace('-', '/') : '—'}</div>
      ${maxDay ? `<div class="hm-stat-sub expense">${formatMoney(maxDay[1])}</div>` : ''}
    </div>
    <div class="hm-stat-card" style="--hm-si:2">
      <div class="hm-stat-label">支出日平均</div>
      <div class="hm-stat-value">${expDays ? formatMoney(avgDailyExp) : '—'}</div>
    </div>
    <div class="hm-stat-card" style="--hm-si:3">
      <div class="hm-stat-label">最長無支出期間</div>
      <div class="hm-stat-value">${maxStreak}<span class="hm-stat-unit">日</span></div>
    </div>
  </div>
  <div class="hm-outer-wrap">
    <div class="hm-dow-col" aria-hidden="true">
      <span></span><span>月</span><span></span><span>水</span><span></span><span>金</span><span></span>
    </div>
    <div class="hm-grid-wrap">
      <div class="hm-month-row">${monthLabelsHtml}</div>
      <div class="hm-grid" role="grid" aria-label="${year}年 支出ヒートマップ">${cellsHtml.join('')}</div>
    </div>
  </div>
  <div class="hm-legend" aria-hidden="true">
    <span class="hm-legend-text">少</span>
    <div class="hm-cell hm-lv0 hm-legend-cell"></div>
    <div class="hm-cell hm-lv1 hm-legend-cell"></div>
    <div class="hm-cell hm-lv2 hm-legend-cell"></div>
    <div class="hm-cell hm-lv3 hm-legend-cell"></div>
    <div class="hm-cell hm-lv4 hm-legend-cell"></div>
    <span class="hm-legend-text">多</span>
  </div>
</div>`;
}

// ============================================================
// タグ別支出集計セクション (v6.0)
// ============================================================
function renderTagSection(year, yearTxs) {
  const expTxs = yearTxs.filter(t => t.type === 'expense');

  // タグ別集計
  const tagMap = {};
  let noTagTotal = 0;
  let noTagCount = 0;
  expTxs.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (!t.tags || t.tags.length === 0) {
      noTagTotal += amt;
      noTagCount++;
    } else {
      t.tags.forEach(tag => {
        if (!tag) return;
        if (!tagMap[tag]) tagMap[tag] = { amount: 0, count: 0 };
        tagMap[tag].amount += amt;
        tagMap[tag].count++;
      });
    }
  });

  if (noTagTotal > 0) {
    tagMap['タグなし'] = { amount: noTagTotal, count: noTagCount };
  }

  function tagColor(tag) {
    if (tag === 'タグなし') return getCSSVar('--text-faint');
    const palette = TAG_COLORS;
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xFFFF;
    return palette[h % palette.length];
  }

  const total = Object.values(tagMap).reduce((s, v) => s + v.amount, 0);
  const tagEntries = Object.entries(tagMap).sort((a, b) => b[1].amount - a[1].amount);

  const tableRows = tagEntries.length === 0
    ? '<tr><td colspan="4" class="empty">タグ付き取引がありません</td></tr>'
    : tagEntries.map(([tag, v], i) => {
        const color = tagColor(tag);
        const pct   = total > 0 ? Math.round(v.amount / total * 100) : 0;
        return `<tr style="--tg-i:${i}">
          <td><span class="tx-tag-chip" style="--tc:${color}">#${esc2(tag)}</span></td>
          <td class="text-muted">${v.count}件</td>
          <td class="expense">${formatMoney(v.amount)}</td>
          <td class="text-muted">${pct}%</td>
        </tr>`;
      }).join('');

  const tagCount  = Object.keys(tagMap).filter(k => k !== 'タグなし').length;
  const taggedPct = expTxs.length > 0
    ? Math.round((expTxs.filter(t => t.tags && t.tags.length > 0).length / expTxs.length) * 100)
    : 0;

  return `<div id="sec-tags">
  <div class="tg-stat-row">
    <div class="tg-stat-card" style="--tg-si:0">
      <div class="tg-stat-icon" aria-hidden="true">🔖</div>
      <div class="tg-stat-label">使用タグ数</div>
      <div class="tg-stat-value">${tagCount}<span class="tg-stat-unit">種類</span></div>
    </div>
    <div class="tg-stat-card" style="--tg-si:1">
      <div class="tg-stat-icon" aria-hidden="true">🏷️</div>
      <div class="tg-stat-label">タグ付き支出</div>
      <div class="tg-stat-value">${taggedPct}<span class="tg-stat-unit">%</span></div>
    </div>
    <div class="tg-stat-card" style="--tg-si:2">
      <div class="tg-stat-icon" aria-hidden="true">💰</div>
      <div class="tg-stat-label">タグ付き支出合計</div>
      <div class="tg-stat-value">${formatMoney(total - (tagMap['タグなし'] ? tagMap['タグなし'].amount : 0))}</div>
    </div>
  </div>
  <div class="charts-row">
    <div class="card chart-card">
      <h3 class="card-title">🔖 タグ別支出</h3>
      <div class="chart-wrap chart-h-lg">
        <canvas id="report-tag-donut"></canvas>
      </div>
    </div>
    <div class="card">
      <h3 class="card-title">🔖 タグ別集計（${year}年）</h3>
      <div class="table-wrap">
        <table class="tx-table tg-table">
          <thead><tr><th>タグ</th><th>件数</th><th>金額</th><th>割合</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  </div>
</div>`;
}

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
    const hasData = txs.length > 0;
    return `<tr class="rpt-month-row${hasData ? ' is-clickable' : ''}" data-month="${ym}" role="${hasData ? 'button' : ''}" tabindex="${hasData ? '0' : '-1'}" title="${hasData ? mo + '月の詳細を表示' : ''}">
      <td><span class="rpt-month-label">${mo}月</span>${hasData ? '<svg class="rpt-row-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>' : ''}</td>
      <td class="income">${income ? formatMoney(income) : '—'}</td>
      <td class="expense">${expense ? formatMoney(expense) : '—'}</td>
      <td class="${balance >= 0 ? 'income' : 'expense'}">${formatMoney(balance)}</td>
    </tr>`;
  }).join('');

  const allTxs = appData.transactions.filter(t => t.date && t.date.startsWith(String(year)));
  const totalIncome  = calcTotal(allTxs, 'income');
  const totalExpense = calcTotal(allTxs, 'expense');

  // 前年比較データ
  const prevYear = year - 1;
  const prevAllTxs     = appData.transactions.filter(t => t.date && t.date.startsWith(String(prevYear)));
  const prevTotalIncome  = calcTotal(prevAllTxs, 'income');
  const prevTotalExpense = calcTotal(prevAllTxs, 'expense');
  const expDiff    = totalExpense - prevTotalExpense;
  const incomeDiff = totalIncome  - prevTotalIncome;
  const yoyPct = (cur, prev) => {
    if (prev === 0) return cur > 0 ? '新規' : '—';
    const p = Math.round((cur - prev) / prev * 100);
    return (p >= 0 ? '+' : '') + p + '%';
  };

  // 前年比較テーブル行（月別 支出比較）
  const yoyRows = months12.map(ym => {
    const txs     = getTransactionsByMonth(ym);
    const exp     = calcTotal(txs, 'expense');
    const mo      = parseInt(ym.split('-')[1]);
    const prevYm  = `${prevYear}-${String(mo).padStart(2,'0')}`;
    const prevTxs = getTransactionsByMonth(prevYm);
    const prevExp = calcTotal(prevTxs, 'expense');
    const diff    = exp - prevExp;
    const pct     = prevExp ? Math.round(diff / prevExp * 100) : null;
    const cls     = diff > 0 ? 'expense' : diff < 0 ? 'income' : '';
    const pctCls  = pct !== null ? (pct > 0 ? 'yoy-up' : pct < 0 ? 'yoy-down' : '') : '';
    const pctStr  = pct !== null ? (pct > 0 ? '▲' : pct < 0 ? '▼' : '') + Math.abs(pct) + '%' : '—';
    const diffStr = (prevExp || exp) ? ((diff > 0 ? '+' : '') + formatMoney(diff)) : '—';
    return `<tr>
      <td>${mo}月</td>
      <td class="expense">${exp ? formatMoney(exp) : '—'}</td>
      <td class="text-muted">${prevExp ? formatMoney(prevExp) : '—'}</td>
      <td class="${cls}">${diffStr}</td>
      <td class="text-muted ${pctCls}">${pctStr}</td>
    </tr>`;
  }).join('');

  return `
<div class="page-header">
  <h1 class="page-title">レポート</h1>
  <div class="page-header-right">
    <div class="year-nav">
      <button class="btn btn-ghost btn-sm" id="prev-year">＜</button>
      <span class="year-label">${year}年</span>
      <button class="btn btn-ghost btn-sm" id="next-year">＞</button>
    </div>
    <button class="btn btn-primary btn-sm" id="btn-export-pdf" title="${year}年の年間収支をPDFで出力">📄 PDF出力</button>
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

<div class="section-tabs" id="section-tabs">
  <button class="section-tab is-active" data-target="sec-monthly-charts"><span class="tab-icon">📊</span> 月別収支</button>
  <button class="section-tab" data-target="sec-monthly-table"><span class="tab-icon">📋</span> 月別表</button>
  <button class="section-tab" data-target="sec-category"><span class="tab-icon">🏷️</span> カテゴリ</button>
  <button class="section-tab" data-target="sec-payment"><span class="tab-icon">💳</span> 支払方法</button>
  ${appData.members && appData.members.length > 0 ? '<button class="section-tab" data-target="sec-member"><span class="tab-icon">👥</span> メンバー</button>' : ''}
  <button class="section-tab" data-target="sec-yoy"><span class="tab-icon">📅</span> 前年比較</button>
  <button class="section-tab" data-target="sec-dow"><span class="tab-icon">📆</span> 曜日別</button>
  <button class="section-tab" data-target="sec-cat-trend"><span class="tab-icon">📈</span> カテゴリ推移</button>
  <button class="section-tab" data-target="sec-fixed"><span class="tab-icon">🔒</span> 固変分析</button>
  <button class="section-tab" data-target="sec-heatmap"><span class="tab-icon">🗓️</span> ヒートマップ</button>
  <button class="section-tab" data-target="sec-tags"><span class="tab-icon">🔖</span> タグ別</button>
  <button class="section-tab" data-target="sec-insights"><span class="tab-icon">💡</span> 年次インサイト</button>
</div>

<div id="sec-monthly-charts" class="charts-row">
  <div class="card chart-card">
    <h3 class="card-title">月別収支</h3>
    <div class="chart-wrap chart-clickable-wrap chart-h-md">
      <canvas id="report-bar"></canvas>
      <span class="chart-clickable-hint">ポイントで詳細</span>
    </div>
  </div>
  <div class="card chart-card">
    <h3 class="card-title">支出カテゴリ（年間）</h3>
    <div class="chart-wrap chart-clickable-wrap chart-h-md">
      <canvas id="report-donut"></canvas>
      <span class="chart-clickable-hint">タップで詳細</span>
    </div>
  </div>
</div>

<div id="sec-monthly-table" class="card">
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

<div id="sec-category" class="charts-row">
  <div class="card">
    <h3 class="card-title">支出カテゴリ詳細</h3>
    <div class="chart-wrap chart-h-xl">
      <canvas id="report-cat-expense"></canvas>
    </div>
  </div>
</div>

<div id="sec-payment">
  <div class="charts-row">
    <div class="card chart-card">
      <h3 class="card-title">💳 支払方法別支出</h3>
      <div class="chart-wrap chart-h-lg">
        <canvas id="report-payment-donut"></canvas>
      </div>
    </div>
    <div class="card">
      <h3 class="card-title">💳 支払方法別集計（${year}年）</h3>
      <div class="table-wrap">
        <table class="tx-table">
          <thead><tr><th>支払方法</th><th>件数</th><th>金額</th><th>割合</th></tr></thead>
          <tbody>
            ${(() => {
              const pmMap = {};
              allTxs.filter(t => t.type === 'expense').forEach(t => {
                const pm = t.paymentMethod || 'その他';
                if (!pmMap[pm]) pmMap[pm] = { amount: 0, count: 0 };
                pmMap[pm].amount += Number(t.amount) || 0;
                pmMap[pm].count++;
              });
              const total = Object.values(pmMap).reduce((s, v) => s + v.amount, 0);
              if (!total) return '<tr><td colspan="4" class="empty">データがありません</td></tr>';
              return Object.entries(pmMap)
                .sort((a, b) => b[1].amount - a[1].amount)
                .map(([pm, v], idx) => {
                  const color = PAYMENT_METHOD_COLORS[pm] || getCSSVar('--text-muted');
                  const pct = total > 0 ? Math.round(v.amount / total * 100) : 0;
                  return `<tr class="pm-table-row" style="--pm-row-color:${color};--pm-ri:${idx}">
                    <td><span class="color-dot" style="background:${color}"></span>${esc2(pm)}</td>
                    <td class="text-muted">${v.count}件</td>
                    <td class="expense">${formatMoney(v.amount)}</td>
                    <td class="text-muted">${pct}%</td>
                  </tr>`;
                }).join('');
            })()}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  ${(() => {
    const expTxsAll = allTxs.filter(t => t.type === 'expense');
    const totalAll  = expTxsAll.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    if (!totalAll) return '';
    const pmMapAll = {};
    expTxsAll.forEach(t => {
      const pm = t.paymentMethod || 'その他';
      if (!pmMapAll[pm]) pmMapAll[pm] = { amount: 0, count: 0 };
      pmMapAll[pm].amount += Number(t.amount) || 0;
      pmMapAll[pm].count++;
    });
    const sortedAll = Object.entries(pmMapAll).sort((a, b) => b[1].amount - a[1].amount);
    const topPm     = sortedAll[0];
    const topColor  = topPm ? (PAYMENT_METHOD_COLORS[topPm[0]] || getCSSVar('--text-muted')) : getCSSVar('--primary');
    const digitalAmt = (pmMapAll['クレカ']?.amount || 0) + (pmMapAll['電子マネー']?.amount || 0);
    const digitalPct = totalAll > 0 ? Math.round(digitalAmt / totalAll * 100) : 0;
    const monthlyAll = Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, '0')}`;
      const amt = getTransactionsByMonth(m).filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      return { label: `${i + 1}月`, amount: amt };
    }).filter(m => m.amount > 0);
    const maxM = monthlyAll.length > 0 ? monthlyAll.reduce((a, b) => a.amount > b.amount ? a : b) : null;
    const minM = monthlyAll.length > 1 ? monthlyAll.reduce((a, b) => a.amount < b.amount ? a : b) : null;
    return `<div class="pm-summary-grid">
      <div class="pm-sum-card" style="--pm-sum-color:${topColor}">
        <div class="pm-sum-icon" aria-hidden="true">🏆</div>
        <div class="pm-sum-label">年間最多利用</div>
        <div class="pm-sum-value">${esc2(topPm[0])}</div>
        <div class="pm-sum-sub">${formatMoney(topPm[1].amount)} · ${topPm[1].count}件</div>
      </div>
      <div class="pm-sum-card" style="--pm-sum-color:var(--teal-end)">
        <div class="pm-sum-icon" aria-hidden="true">📱</div>
        <div class="pm-sum-label">デジタル決済率</div>
        <div class="pm-sum-value">${digitalPct}%</div>
        <div class="pm-sum-sub">クレカ+電子マネー ${formatMoney(digitalAmt)}</div>
      </div>
      <div class="pm-sum-card" style="--pm-sum-color:var(--warning)">
        <div class="pm-sum-icon" aria-hidden="true">📊</div>
        <div class="pm-sum-label">月別変動</div>
        <div class="pm-sum-value">${maxM ? maxM.label + ' 最多' : '—'}</div>
        <div class="pm-sum-sub">${maxM ? formatMoney(maxM.amount) : '—'}${minM && minM.label !== maxM.label ? ' / ' + minM.label + ' 最少 ' + formatMoney(minM.amount) : ''}</div>
      </div>
    </div>`;
  })()}
  <div class="card pm-trend-card">
    <h3 class="card-title">📈 支払方法別 月次推移（${year}年）</h3>
    <p class="pm-trend-hint">毎月の支払方法ごとの支出を積み上げで表示します</p>
    <div class="chart-wrap chart-h-md">
      <canvas id="report-payment-trend"></canvas>
    </div>
  </div>
</div>

${(appData.members && appData.members.length > 0) ? `
<div id="sec-member" class="card">
  <h3 class="card-title">👥 メンバー別収支分析</h3>
  <div class="chart-wrap" style="height:${Math.max(140, appData.members.length * 60)}px;margin-bottom:var(--sp-4)">
    <canvas id="report-member-bar"></canvas>
  </div>
  <div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>メンバー</th><th>収入</th><th>支出</th><th>差額</th><th>比率</th></tr></thead>
      <tbody>
        ${(() => {
          const totalExpense = calcTotal(allTxs.filter(t => t.type === 'expense'), 'expense') || 1;
          return appData.members.map(m => {
            const mTxs = allTxs.filter(t => t.memberId === m.id);
            const inc  = calcTotal(mTxs.filter(t => t.type === 'income'),  'income');
            const exp  = calcTotal(mTxs.filter(t => t.type === 'expense'), 'expense');
            const net  = inc - exp;
            const pct  = allTxs.filter(t => t.type === 'expense').length > 0
              ? Math.round(exp / calcTotal(allTxs.filter(t => t.type === 'expense'), 'expense') * 100)
              : 0;
            return `<tr>
              <td><span class="color-dot" style="background:${m.color || 'var(--text-muted)'}"></span>${esc2(m.name)}</td>
              <td class="income">${inc ? formatMoney(inc) : '—'}</td>
              <td class="expense">${exp ? formatMoney(exp) : '—'}</td>
              <td class="${net >= 0 ? 'income' : 'expense'}">${formatMoney(net)}</td>
              <td class="text-muted">${exp ? pct + '%' : '—'}</td>
            </tr>`;
          }).join('');
        })()}
        ${(() => {
          const noMemTxs = allTxs.filter(t => !t.memberId);
          const inc = calcTotal(noMemTxs.filter(t => t.type === 'income'),  'income');
          const exp = calcTotal(noMemTxs.filter(t => t.type === 'expense'), 'expense');
          if (!inc && !exp) return '';
          const net = inc - exp;
          const totalExp = calcTotal(allTxs.filter(t => t.type === 'expense'), 'expense');
          const pct = totalExp ? Math.round(exp / totalExp * 100) : 0;
          return `<tr>
            <td><span class="color-dot" style="background:var(--text-faint)"></span>担当者なし</td>
            <td class="income">${inc ? formatMoney(inc) : '—'}</td>
            <td class="expense">${exp ? formatMoney(exp) : '—'}</td>
            <td class="${net >= 0 ? 'income' : 'expense'}">${formatMoney(net)}</td>
            <td class="text-muted">${exp ? pct + '%' : '—'}</td>
          </tr>`;
        })()}
      </tbody>
    </table>
  </div>
</div>` : ''}

<div id="sec-yoy" class="card">
  <h3 class="card-title">📅 前年比較（${year}年 vs ${prevYear}年）</h3>
  <div class="yoy-summary">
    <div class="yoy-summary-item">
      <div class="yoy-summary-label">年間支出</div>
      <div class="yoy-summary-value expense">${formatMoney(totalExpense)}</div>
      ${prevTotalExpense ? `<div class="yoy-diff ${expDiff > 0 ? 'yoy-up' : expDiff < 0 ? 'yoy-down' : ''}">
        ${expDiff > 0 ? '▲' : expDiff < 0 ? '▼' : ''}${formatMoney(Math.abs(expDiff))}（${yoyPct(totalExpense, prevTotalExpense)}）vs 前年
      </div>` : `<div class="yoy-diff">前年データなし</div>`}
    </div>
    <div class="yoy-summary-item">
      <div class="yoy-summary-label">年間収入</div>
      <div class="yoy-summary-value income">${formatMoney(totalIncome)}</div>
      ${prevTotalIncome ? `<div class="yoy-diff ${incomeDiff >= 0 ? 'yoy-down' : 'yoy-up'}">
        ${incomeDiff >= 0 ? '▲' : '▼'}${formatMoney(Math.abs(incomeDiff))}（${yoyPct(totalIncome, prevTotalIncome)}）vs 前年
      </div>` : `<div class="yoy-diff">前年データなし</div>`}
    </div>
  </div>
  <div class="chart-wrap chart-h-2xl">
    <canvas id="report-yoy"></canvas>
  </div>
  <div class="table-wrap">
    <table class="tx-table">
      <thead>
        <tr>
          <th>月</th>
          <th>今年支出</th>
          <th>前年支出</th>
          <th>増減</th>
          <th>増減率</th>
        </tr>
      </thead>
      <tbody>${yoyRows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td>合計</td>
          <td class="expense">${formatMoney(totalExpense)}</td>
          <td class="text-muted">${prevTotalExpense ? formatMoney(prevTotalExpense) : '—'}</td>
          <td class="${expDiff > 0 ? 'expense' : expDiff < 0 ? 'income' : ''}">${prevTotalExpense || totalExpense ? (expDiff > 0 ? '+' : '') + formatMoney(expDiff) : '—'}</td>
          <td class="text-muted ${expDiff > 0 ? 'yoy-up' : expDiff < 0 ? 'yoy-down' : ''}">${yoyPct(totalExpense, prevTotalExpense)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>

${(() => {
  // ── 曜日別支出分析 (v5.67 ビジュアル洗練) ──────────────────────────────────
  const DOW_LABELS  = ['日','月','火','水','木','金','土'];
  // DOW_COLORS_HEX はグローバル定数（charts.js で定義・app.js/charts.js 共用）
  const dowTotals   = new Array(7).fill(0);
  const dowCounts   = new Array(7).fill(0);
  const dowDateSets = Array.from({ length: 7 }, () => new Set());

  allTxs.filter(t => t.type === 'expense' && t.date).forEach(t => {
    const dow = new Date(t.date + 'T00:00:00').getDay();
    dowTotals[dow]  += Number(t.amount) || 0;
    dowCounts[dow]++;
    dowDateSets[dow].add(t.date);
  });

  const dowAvgs = dowTotals.map((total, i) => {
    const days = dowDateSets[i].size;
    return days > 0 ? Math.round(total / days) : 0;
  });

  const validDows = DOW_LABELS.map((_, i) => ({ i, avg: dowAvgs[i], total: dowTotals[i], count: dowCounts[i] }))
                               .filter(d => d.count > 0);
  const maxDow = validDows.length ? validDows.reduce((a, b) => a.avg >= b.avg ? a : b) : null;
  const minDow = validDows.length > 1 ? validDows.reduce((a, b) => a.avg <= b.avg ? a : b) : null;
  const totalDowExpense = dowTotals.reduce((s, v) => s + v, 0);
  const maxTotal = Math.max(...dowTotals);

  // サマリーカード（グラデーション背景＋スタッガーアニメーション）
  const summaryCards = [maxDow, minDow].filter(Boolean).map((d, idx) => `
    <div class="dow-stat-card ${idx === 0 ? 'dow-stat-max' : 'dow-stat-min'}" style="--dow-i:${idx}">
      <div class="dow-stat-icon" aria-hidden="true">${idx === 0 ? '📈' : '📉'}</div>
      <div class="dow-stat-info">
        <div class="dow-stat-day">${DOW_LABELS[d.i]}曜日</div>
        <div class="dow-stat-label">${idx === 0 ? '最多支出曜日' : '最少支出曜日'}</div>
        <div class="dow-stat-amount">${formatMoney(d.avg)}<span class="dow-stat-unit">/取引日</span></div>
      </div>
    </div>`).join('');

  // テーブル行（曜日カラー左ボーダー＋ミニバーグラフ＋色分けバッジ）
  let barDelay = 0;
  const tableRows = DOW_LABELS.map((label, i) => {
    if (!dowCounts[i]) return '';
    const pct    = totalDowExpense > 0 ? Math.round(dowTotals[i] / totalDowExpense * 100) : 0;
    const barW   = maxTotal > 0 ? Math.round(dowTotals[i] / maxTotal * 100) : 0;
    const isMax  = maxDow && i === maxDow.i;
    const pctCls = pct >= 20 ? 'dow-pct-high' : pct >= 10 ? 'dow-pct-mid' : 'dow-pct-low';
    const row = `<tr class="dow-table-row${isMax ? ' dow-row-max' : ''}" style="--dow-row-color:${DOW_COLORS_HEX[i]};--dow-ri:${barDelay}">
      <td><span class="dow-label-cell" style="color:${DOW_COLORS_HEX[i]}">${label}曜日</span></td>
      <td class="text-muted">${dowCounts[i]}件 / ${dowDateSets[i].size}日</td>
      <td class="expense">
        ${formatMoney(dowTotals[i])}<span class="dow-pct-badge ${pctCls}">${pct}%</span>
        <div class="dow-mini-bar-track"><div class="dow-mini-bar-fill" style="--dow-bar-w:${barW}%;--dow-bar-delay:${barDelay}"></div></div>
      </td>
      <td>${formatMoney(dowAvgs[i])}</td>
    </tr>`;
    barDelay++;
    return row;
  }).join('');

  const emptyContent = `<div class="empty">${year}年の支出データがありません</div>`;

  return `<div id="sec-dow" class="card">
  <h3 class="card-title">📆 曜日別支出パターン（${year}年）</h3>
  ${validDows.length === 0 ? emptyContent : `
  <div class="dow-stat-row">${summaryCards}</div>
  <div class="chart-wrap chart-h-sm">
    <canvas id="report-dow"></canvas>
  </div>
  <div class="table-wrap">
    <table class="tx-table">
      <thead>
        <tr>
          <th>曜日</th>
          <th>件数 / 取引日数</th>
          <th>合計支出</th>
          <th>平均支出/日</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`}
</div>`;
})()}

${(() => {
  // ── カテゴリ別支出トレンド (v5.68) ──────────────────────────────────
  const expCats = appData.categories.filter(c => c.type === 'expense');
  if (!expCats.length) return `<div id="sec-cat-trend" class="card"><div class="empty">支出カテゴリがありません</div></div>`;

  // デフォルト選択: 支出上位3カテゴリ
  if (!appState.catTrendSelected.length) {
    const totals = expCats.map(c => ({
      id: c.id,
      total: appData.transactions
        .filter(t => t.type === 'expense' && t.categoryId === c.id && t.date && t.date.startsWith(String(year)))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0),
    })).sort((a, b) => b.total - a.total);
    appState.catTrendSelected = totals.slice(0, 3).map(x => x.id);
  }

  const chipHtml = expCats.map((c, ci) => {
    const isSel = appState.catTrendSelected.includes(c.id);
    const icon  = (typeof CAT_ICONS !== 'undefined' && CAT_ICONS[c.name]) || '📌';
    return `<button type="button" class="ct-chip${isSel ? ' is-selected' : ''}" data-cat-trend-id="${c.id}" style="--ct-color:${c.color};--ct-i:${ci}" aria-pressed="${isSel}">
      <span class="ct-chip-icon" aria-hidden="true">${icon}</span>
      <span class="ct-chip-name">${esc2(c.name)}</span>
    </button>`;
  }).join('');

  // サマリーテーブル（選択カテゴリ × 月別）
  const selCats = expCats.filter(c => appState.catTrendSelected.includes(c.id));
  const months12 = [];
  for (let m = 1; m <= 12; m++) months12.push(`${year}-${String(m).padStart(2,'0')}`);

  // サマリー統計（最多支出月・年間合計）
  const monthTotals = months12.map((ym, mi) => {
    const txs = getTransactionsByMonth(ym);
    const tot = selCats.reduce((s, c) => s + txs.filter(t => t.categoryId === c.id && t.type === 'expense').reduce((ss, t) => ss + (Number(t.amount) || 0), 0), 0);
    return { label: `${mi + 1}月`, total: tot };
  });
  const yearTotal = monthTotals.reduce((s, r) => s + r.total, 0);
  const maxMonth  = monthTotals.reduce((a, b) => b.total > a.total ? b : a, { label: '—', total: 0 });
  const avgMonth  = monthTotals.filter(r => r.total > 0);
  const avgVal    = avgMonth.length ? Math.round(yearTotal / avgMonth.length) : 0;
  const statAccent = selCats.length === 1 ? selCats[0].color : 'var(--primary)';

  const statCardsHtml = selCats.length > 0 ? `<div class="ct-stat-row">
    <div class="ct-stat-card" style="--ct-stat-color:${statAccent}">
      <div class="ct-stat-label">選択カテゴリ</div>
      <div class="ct-stat-value">${selCats.length}<span class="ct-stat-value-sub"> / ${expCats.length}件</span></div>
    </div>
    <div class="ct-stat-card" style="--ct-stat-color:${statAccent}">
      <div class="ct-stat-label">年間合計</div>
      <div class="ct-stat-value">${formatMoney(yearTotal)}</div>
      <div class="ct-stat-sub">平均 ${formatMoney(avgVal)}/月</div>
    </div>
    <div class="ct-stat-card" style="--ct-stat-color:${statAccent}">
      <div class="ct-stat-label">最多支出月</div>
      <div class="ct-stat-value">${maxMonth.label}</div>
      <div class="ct-stat-sub">${maxMonth.total > 0 ? formatMoney(maxMonth.total) : '—'}</div>
    </div>
  </div>` : '';

  const tableHead = `<tr><th>月</th>${selCats.map(c => `<th><span class="ct-tbl-dot" style="background:${c.color}"></span>${esc2(c.name)}</th>`).join('')}<th>合計</th></tr>`;
  const tableBody = months12.map((ym, mi) => {
    const label = `${mi + 1}月`;
    const txs = getTransactionsByMonth(ym);
    const vals = selCats.map(c => txs.filter(t => t.categoryId === c.id && t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0));
    const rowTotal = vals.reduce((s, v) => s + v, 0);
    if (rowTotal === 0 && vals.every(v => v === 0)) return `<tr class="ct-row-empty" style="--ct-ri:${mi}"><td>${label}</td>${vals.map(() => '<td class="text-muted">—</td>').join('')}<td class="text-muted">—</td></tr>`;
    return `<tr style="--ct-ri:${mi}"><td class="ct-month-cell">${label}</td>${vals.map(v => `<td class="${v > 0 ? 'ct-cell-val' : 'text-muted'}">${v > 0 ? formatMoney(v) : '—'}</td>`).join('')}<td class="ct-row-total">${formatMoney(rowTotal)}</td></tr>`;
  }).join('');

  return `<div id="sec-cat-trend" class="card">
  <h3 class="card-title">📈 カテゴリ別支出トレンド（${year}年）</h3>
  <p class="ct-hint">カテゴリを選択してトレンドを比較できます（複数選択可）</p>
  <div class="ct-chips" role="group" aria-label="カテゴリ選択">${chipHtml}</div>
  ${statCardsHtml}
  <div class="chart-wrap chart-h-2xl">
    <canvas id="report-cat-trend"></canvas>
  </div>
  ${selCats.length > 0 ? `<div class="table-wrap ct-table-wrap">
    <table class="tx-table ct-table">
      <thead>${tableHead}</thead>
      <tbody>${tableBody}</tbody>
    </table>
  </div>` : `<div class="empty">カテゴリを選択してください</div>`}
</div>`;
})()}

${(() => {
  // ── 固定費 vs 変動費 分析 (v5.70) ───────────────────────────────────
  const months12 = [];
  for (let m = 1; m <= 12; m++) months12.push(`${year}-${String(m).padStart(2,'0')}`);

  const fixedCats = appData.categories.filter(c => c.type === 'expense' && c.isFixed);
  const varCats   = appData.categories.filter(c => c.type === 'expense' && !c.isFixed);

  const fixedIds = new Set(fixedCats.map(c => c.id));
  const expTxs   = allTxs.filter(t => t.type === 'expense');
  const fixedTotal = expTxs.filter(t => fixedIds.has(t.categoryId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const varTotal   = expTxs.filter(t => !fixedIds.has(t.categoryId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const grandTotal = fixedTotal + varTotal;
  const fixedRate  = grandTotal > 0 ? Math.round(fixedTotal / grandTotal * 100) : 0;

  // 月別集計（テーブル用）
  const monthRows = months12.map((ym, mi) => {
    const mTxs = getTransactionsByMonth(ym).filter(t => t.type === 'expense');
    const mFixed = mTxs.filter(t => fixedIds.has(t.categoryId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const mVar   = mTxs.filter(t => !fixedIds.has(t.categoryId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const mTotal = mFixed + mVar;
    const mRate  = mTotal > 0 ? Math.round(mFixed / mTotal * 100) : 0;
    return `<tr style="--fv-ri:${mi}">
      <td class="fv-month-cell">${mi + 1}月</td>
      <td class="${mFixed > 0 ? 'fv-fixed-val' : 'text-muted'}">${mFixed > 0 ? formatMoney(mFixed) : '—'}</td>
      <td class="${mVar > 0 ? 'fv-var-val' : 'text-muted'}">${mVar > 0 ? formatMoney(mVar) : '—'}</td>
      <td class="${mTotal > 0 ? '' : 'text-muted'}">${mTotal > 0 ? formatMoney(mTotal) : '—'}</td>
      <td>${mTotal > 0 ? `<span class="fv-seg-wrap"><span class="fv-seg-bar" style="--fv-fi:${mRate}"><span class="fv-seg-fixed"></span><span class="fv-seg-var"></span></span><span class="fv-rate-badge ${mRate >= 60 ? 'high' : mRate >= 40 ? 'mid' : 'low'}">${mRate}%</span></span>` : '—'}</td>
    </tr>`;
  }).join('');

  // カテゴリ別テーブル（固定費・変動費）
  const catTableRows = (cats) => cats.map((c, ci) => {
    const amt = expTxs.filter(t => t.categoryId === c.id).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const pct = grandTotal > 0 ? Math.round(amt / grandTotal * 100) : 0;
    return `<tr style="--fv-cat-color:${c.color};--fv-ci:${ci}">
      <td><span class="color-dot" style="background:${c.color}"></span>${esc2(c.name)}</td>
      <td class="fv-cat-amt">${formatMoney(amt)}</td>
      <td><span class="fv-mini-bar"><span class="fv-mini-fill" style="width:${pct}%;background:${c.color}"></span></span><span class="fv-pct-txt">${pct}%</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="3" class="empty">—</td></tr>';

  return `<div id="sec-fixed" class="card">
  <h3 class="card-title">🔒 固定費 vs 変動費 分析（${year}年）</h3>

  <div class="fv-stat-grid">
    <div class="fv-stat-card fv-stat-fixed" style="--fv-si:0">
      <div class="fv-stat-icon" aria-hidden="true">🔒</div>
      <div class="fv-stat-label">固定費合計</div>
      <div class="fv-stat-value js-fv-countup" data-value="${fixedTotal}">¥0</div>
      <div class="fv-stat-sub">${fixedCats.length}カテゴリ</div>
    </div>
    <div class="fv-stat-card fv-stat-var" style="--fv-si:1">
      <div class="fv-stat-icon" aria-hidden="true">🔓</div>
      <div class="fv-stat-label">変動費合計</div>
      <div class="fv-stat-value js-fv-countup" data-value="${varTotal}">¥0</div>
      <div class="fv-stat-sub">${varCats.length}カテゴリ</div>
    </div>
    <div class="fv-stat-card fv-stat-rate" style="--fv-si:2">
      <div class="fv-stat-icon" aria-hidden="true">📊</div>
      <div class="fv-stat-label">固定費率</div>
      <div class="fv-stat-value">${fixedRate}%</div>
      <div class="fv-stat-sub">${fixedRate >= 60 ? '固定費が高め' : fixedRate >= 40 ? 'バランス型' : '変動費中心'}</div>
    </div>
  </div>

  <div class="charts-row">
    <div class="card chart-card">
      <h3 class="card-title">支出の内訳</h3>
      <div class="chart-wrap chart-h-md">
        <canvas id="report-fv-donut"></canvas>
      </div>
    </div>
    <div class="card chart-card">
      <h3 class="card-title">月次 固定費率推移</h3>
      <div class="chart-wrap chart-h-md">
        <canvas id="report-fv-trend"></canvas>
      </div>
    </div>
  </div>

  <div class="charts-row">
    <div class="card">
      <h3 class="card-title">🔒 固定費カテゴリ</h3>
      <div class="table-wrap">
        <table class="tx-table fv-cat-table">
          <thead><tr><th>カテゴリ</th><th>金額</th><th>支出比</th></tr></thead>
          <tbody>${catTableRows(fixedCats)}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h3 class="card-title">🔓 変動費カテゴリ</h3>
      <div class="table-wrap">
        <table class="tx-table fv-cat-table">
          <thead><tr><th>カテゴリ</th><th>金額</th><th>支出比</th></tr></thead>
          <tbody>${catTableRows(varCats)}</tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="card">
    <h3 class="card-title">月別 固定費 vs 変動費</h3>
    <div class="table-wrap">
      <table class="tx-table fv-month-table">
        <thead><tr><th>月</th><th>固定費</th><th>変動費</th><th>合計</th><th>固定費率</th></tr></thead>
        <tbody>${monthRows}</tbody>
      </table>
    </div>
  </div>
</div>`;
})()}
${renderHeatmapSection(year, allTxs)}
${renderTagSection(year, allTxs)}
${renderInsightsSection(year, allTxs, months12)}`;
}

function bindReports() {
  on('prev-year', 'click', () => { appState.reportYear--; renderCurrentPage(); });
  on('next-year', 'click', () => { appState.reportYear++; renderCurrentPage(); });

  on('btn-export-pdf', 'click', () => { doExportPDF(appState.reportYear); });

  on('export-year-csv', 'click', () => {
    const year = appState.reportYear;
    const txs = appData.transactions.filter(t => t.date && t.date.startsWith(String(year)));
    doExportCSV(txs);
  });

  const year = appState.reportYear;
  const months12 = [];
  for (let m = 1; m <= 12; m++) months12.push(`${year}-${String(m).padStart(2,'0')}`);
  const allTxs = appData.transactions.filter(t => t.date && t.date.startsWith(String(year)));

  const renderCatTrend = () => {
    const selCats = appData.categories.filter(c => c.type === 'expense' && appState.catTrendSelected.includes(c.id));
    renderCategoryTrendChart('report-cat-trend', selCats, year);
  };

  setTimeout(() => {
    renderBalanceLineChart('report-bar', months12, month => openMonthDrilldown(month));
    renderDonutChart('report-donut', allTxs, 'expense',
      (catName, catColor) => openCategoryDrilldown(catName, catColor, null, 'expense', allTxs, `${year}年`)
    );
    renderCategoryBarChart('report-cat-expense', allTxs, 'expense');
    renderPaymentMethodChart('report-payment-donut', allTxs);
    renderPaymentTrendChart('report-payment-trend', year);
    renderMemberExpenseChart('report-member-bar', allTxs);
    renderYoYChart('report-yoy', year);
    renderDayOfWeekChart('report-dow', allTxs);
    renderCatTrend();
    renderFixedVariableDonut('report-fv-donut', allTxs);
    renderFixedVariableTrend('report-fv-trend', year);
    renderTagChart('report-tag-donut', allTxs);
    // 固変カードカウントアップ (v5.71)
    document.querySelectorAll('.js-fv-countup').forEach(el => animateCountUp(el, Number(el.dataset.value)));
  }, 50);

  // カテゴリ推移チップ操作 (v5.68)
  document.addEventListener('click', function catTrendHandler(e) {
    const chip = e.target.closest('[data-cat-trend-id]');
    if (!chip) return;
    const id = chip.dataset.catTrendId;
    const idx = appState.catTrendSelected.indexOf(id);
    if (idx >= 0) {
      appState.catTrendSelected.splice(idx, 1);
    } else {
      appState.catTrendSelected.push(id);
    }
    chip.classList.toggle('is-selected', idx < 0);
    chip.setAttribute('aria-pressed', String(idx < 0));
    renderCatTrend();
    // テーブルを再描画（ページ再描画せずに）
    const selCats = appData.categories.filter(c => c.type === 'expense' && appState.catTrendSelected.includes(c.id));
    const tableWrap = document.querySelector('.ct-table-wrap');
    if (tableWrap) {
      const months12local = [];
      for (let m2 = 1; m2 <= 12; m2++) months12local.push(`${year}-${String(m2).padStart(2,'0')}`);
      const newHead = `<tr><th>月</th>${selCats.map(c => `<th><span class="ct-tbl-dot" style="background:${c.color}"></span>${esc2(c.name)}</th>`).join('')}<th>合計</th></tr>`;
      const newBody = months12local.map((ym, mi) => {
        const label = `${mi + 1}月`;
        const txs2 = getTransactionsByMonth(ym);
        const vals = selCats.map(c => txs2.filter(t => t.categoryId === c.id && t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0));
        const rowTotal = vals.reduce((s, v) => s + v, 0);
        if (rowTotal === 0 && vals.every(v => v === 0)) return `<tr class="ct-row-empty" style="--ct-ri:${mi}"><td>${label}</td>${vals.map(() => '<td class="text-muted">—</td>').join('')}<td class="text-muted">—</td></tr>`;
        return `<tr style="--ct-ri:${mi}"><td class="ct-month-cell">${label}</td>${vals.map(v => `<td class="${v > 0 ? 'ct-cell-val' : 'text-muted'}">${v > 0 ? formatMoney(v) : '—'}</td>`).join('')}<td class="ct-row-total">${formatMoney(rowTotal)}</td></tr>`;
      }).join('');
      tableWrap.innerHTML = `<table class="tx-table ct-table"><thead>${newHead}</thead><tbody>${newBody}</tbody></table>`;
    }
    // サマリーカードを更新
    const statRow = document.querySelector('.ct-stat-row');
    if (statRow) {
      const expCats2 = appData.categories.filter(c => c.type === 'expense');
      const selCats2 = expCats2.filter(c => appState.catTrendSelected.includes(c.id));
      const months12s = [];
      for (let ms = 1; ms <= 12; ms++) months12s.push(`${year}-${String(ms).padStart(2,'0')}`);
      const mTotals = months12s.map((ym, mi) => {
        const txs3 = getTransactionsByMonth(ym);
        const tot = selCats2.reduce((s, c) => s + txs3.filter(t => t.categoryId === c.id && t.type === 'expense').reduce((ss, t) => ss + (Number(t.amount) || 0), 0), 0);
        return { label: `${mi + 1}月`, total: tot };
      });
      const yTotal = mTotals.reduce((s, r) => s + r.total, 0);
      const mMax   = mTotals.reduce((a, b) => b.total > a.total ? b : a, { label: '—', total: 0 });
      const filled = mTotals.filter(r => r.total > 0);
      const avg    = filled.length ? Math.round(yTotal / filled.length) : 0;
      const sa2    = selCats2.length === 1 ? selCats2[0].color : 'var(--primary)';
      statRow.outerHTML = `<div class="ct-stat-row">
        <div class="ct-stat-card" style="--ct-stat-color:${sa2}">
          <div class="ct-stat-label">選択カテゴリ</div>
          <div class="ct-stat-value">${selCats2.length}<span class="ct-stat-value-sub"> / ${expCats2.length}件</span></div>
        </div>
        <div class="ct-stat-card" style="--ct-stat-color:${sa2}">
          <div class="ct-stat-label">年間合計</div>
          <div class="ct-stat-value">${formatMoney(yTotal)}</div>
          <div class="ct-stat-sub">平均 ${formatMoney(avg)}/月</div>
        </div>
        <div class="ct-stat-card" style="--ct-stat-color:${sa2}">
          <div class="ct-stat-label">最多支出月</div>
          <div class="ct-stat-value">${mMax.label}</div>
          <div class="ct-stat-sub">${mMax.total > 0 ? formatMoney(mMax.total) : '—'}</div>
        </div>
      </div>`;
    }
    // クリーンアップ: ページ離脱時にリスナー削除
    if (!document.getElementById('sec-cat-trend')) {
      document.removeEventListener('click', catTrendHandler);
    }
  });


  // 月別表: 行クリックで月ドリルダウンモーダル (v8.7)
  document.getElementById('sec-monthly-table')?.addEventListener('click', e => {
    const row = e.target.closest('.rpt-month-row.is-clickable');
    if (!row || !row.dataset.month) return;
    openMonthDrilldown(row.dataset.month);
  });
  document.getElementById('sec-monthly-table')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.rpt-month-row.is-clickable');
    if (!row || !row.dataset.month) return;
    e.preventDefault();
    openMonthDrilldown(row.dataset.month);
  });

  // ヒートマップ: 日付セルクリックで月カレンダーへ遷移 (v5.82)
  document.getElementById('sec-heatmap')?.addEventListener('click', e => {
    const cell = e.target.closest('[data-hm-date]');
    if (!cell) return;
    const mo = parseInt(cell.dataset.hmMonth);
    if (!mo) return;
    appState.calendarMonth = `${appState.reportYear}-${String(mo).padStart(2, '0')}`;
    navigate('calendar');
  });

  // セクションタブナビ (v5.28)
  const tabsEl = document.getElementById('section-tabs');
  if (tabsEl) {
    const setActiveTab = id => {
      tabsEl.querySelectorAll('.section-tab').forEach(tab =>
        tab.classList.toggle('is-active', tab.dataset.target === id)
      );
      const active = tabsEl.querySelector(`.section-tab[data-target="${id}"]`);
      if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    };

    tabsEl.querySelectorAll('.section-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const sec = document.getElementById(tab.dataset.target);
        if (!sec) return;
        const mhH = document.getElementById('mobile-header')?.offsetHeight || 0;
        const y = sec.getBoundingClientRect().top + window.scrollY - mhH - tabsEl.offsetHeight - 8;
        window.scrollTo({ top: y, behavior: 'smooth' });
        setActiveTab(tab.dataset.target);
      });
    });

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActiveTab(e.target.id); });
    }, { rootMargin: '0px 0px -60% 0px', threshold: 0 });
    document.querySelectorAll('[id^="sec-"]').forEach(s => io.observe(s));
  }
}

// ============================================================
// カテゴリ管理
// ============================================================
function renderCategories() {
  const expCats = appData.categories.filter(c => c.type === 'expense');
  const incCats = appData.categories.filter(c => c.type === 'income');

  const budgets = appData.budgets || {};

  // 今月の支出を集計 (v9.5)
  const ym = appState.month;
  const monthTxs = getTransactionsByMonth(ym);
  const spentMap = {};
  monthTxs.filter(t => t.type === 'expense').forEach(t => {
    spentMap[t.categoryId] = (spentMap[t.categoryId] || 0) + (Number(t.amount) || 0);
  });

  const catCard = (c, idx) => {
    const icon = CAT_ICONS[c.name] || '📌';
    const spent = spentMap[c.id] || 0;
    const budget = budgets[c.id] || 0;
    const pct = budget > 0 ? Math.min(Math.round(spent / budget * 100), 999) : 0;
    const overBudget = budget > 0 && spent > budget;
    const warnBudget = budget > 0 && pct >= 80;
    const barState = overBudget ? 'over' : warnBudget ? 'warn' : 'ok';
    const barColor = overBudget ? 'var(--expense)' : warnBudget ? 'var(--warning)' : c.color;

    const statsSection = c.type === 'expense' ? `
      <div class="cat-card-stats">
        <div class="cat-stat-row">
          <span class="cat-stat-lbl">今月の支出</span>
          <span class="cat-stat-val ${overBudget ? 'over' : ''}" style="color:${spent > 0 ? c.color : 'var(--text-muted)'}">
            ${spent > 0 ? '¥' + spent.toLocaleString('ja-JP') : '—'}
          </span>
        </div>
        <div class="cat-stat-row cat-budget-row">
          <label class="cat-stat-lbl" for="budget-${c.id}">月次予算</label>
          <input class="budget-input cat-budget-input" id="budget-${c.id}" type="number" min="0" step="100" data-id="${c.id}" value="${budget || ''}" placeholder="未設定">
        </div>
        ${budget > 0 ? `
        <div class="cat-budget-bar-wrap">
          <div class="cat-budget-bar-fill" style="--cat-bar-pct:${Math.min(pct,100)}%; --cat-bar-clr:${barColor}; --cc-i:${idx}"></div>
        </div>
        <div class="cat-budget-pct ${barState}">${pct}% 使用${overBudget ? ' ⚠️' : ''}</div>
        ` : ''}
      </div>` : '';

    return `
<div class="cat-card" style="--cat-clr:${c.color}; --cc-i:${idx}">
  <div class="cat-card-accent"></div>
  <div class="cat-card-header">
    <div class="cat-card-icon"><span aria-hidden="true">${icon}</span></div>
    <div class="cat-card-info">
      <div class="cat-card-name">${esc2(c.name)}</div>
      <div class="cat-card-meta">
        <span class="cat-fixed-badge ${c.isFixed ? 'is-fixed' : 'is-var'}">${c.isFixed ? '固定費' : '変動費'}</span>
        ${c.yayoiAccount ? `<span class="cat-yayoi-tag">${esc2(c.yayoiAccount)}</span>` : ''}
      </div>
    </div>
    <div class="cat-card-actions">
      <button class="btn-icon edit-cat" data-id="${c.id}" title="編集" aria-label="${esc2(c.name)}を編集">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2a1.5 1.5 0 0 1 2.1 2.1L4.7 12.5l-2.7.6.6-2.7L11 2z"/></svg>
      </button>
      <button class="btn-icon delete-cat" data-id="${c.id}" title="削除" aria-label="${esc2(c.name)}を削除">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2M6 7v5M10 7v5"/><path d="M3 4l1 9h8l1-9"/></svg>
      </button>
    </div>
  </div>
  ${statsSection}
</div>`;
  };

  return `
<div class="page-header">
  <h1 class="page-title">カテゴリ管理</h1>
  <div class="page-header-right">
    <button class="btn btn-ghost" id="open-smart-budget">📊 スマート提案</button>
    <button class="btn btn-primary" id="open-add-cat">＋ カテゴリ追加</button>
  </div>
</div>

<div class="card">
  <h3 class="card-title section-label expense">支出カテゴリ <span class="cat-month-label">${ym.replace('-', '年')}月</span></h3>
  <div class="cat-card-grid">
    ${expCats.map((c, i) => catCard(c, i)).join('') || '<p class="empty" style="padding:var(--sp-4)">カテゴリがありません</p>'}
  </div>
</div>

<div class="card">
  <h3 class="card-title section-label income">収入カテゴリ</h3>
  <div class="cat-card-grid cat-card-grid--income">
    ${incCats.map((c, i) => catCard(c, i)).join('') || '<p class="empty" style="padding:var(--sp-4)">カテゴリがありません</p>'}
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
      <div class="form-group">
        <label>費用タイプ</label>
        <div class="type-toggle" id="cat-fixed-toggle">
          <button type="button" class="type-btn active" data-fixed="false">変動費</button>
          <button type="button" class="type-btn" data-fixed="true">固定費</button>
        </div>
        <input type="hidden" id="cat-is-fixed" value="false">
        <small class="hint">家賃・光熱費など毎月ほぼ一定の費用は「固定費」に設定</small>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="cat-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="cat-modal-save">保存</button>
    </div>
  </div>
</div>

<div id="smart-budget-modal" class="modal-overlay" style="display:none">
  <div class="modal modal-lg">
    <div class="modal-header">
      <h2>📊 スマート予算提案</h2>
      <button class="modal-close" id="sb-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <p class="hint" id="sb-period-hint"></p>
      <div id="sb-banner" class="sb-banner" style="display:none">
        <div class="sb-banner-cell">
          <div class="sb-banner-num" id="sb-bn-total">0</div>
          <div class="sb-banner-lbl">提案件数</div>
        </div>
        <div class="sb-banner-div"></div>
        <div class="sb-banner-cell">
          <div class="sb-banner-num sb-bn-up" id="sb-bn-up">0</div>
          <div class="sb-banner-lbl">増額カテゴリ</div>
        </div>
        <div class="sb-banner-div"></div>
        <div class="sb-banner-cell">
          <div class="sb-banner-num sb-bn-down" id="sb-bn-down">0</div>
          <div class="sb-banner-lbl">削減カテゴリ</div>
        </div>
      </div>
      <div id="sb-no-data" style="display:none" class="empty-state-sm">
        <p>過去3ヶ月の支出データが見つかりませんでした。<br>取引を記録してから再度お試しください。</p>
      </div>
      <div id="sb-table-wrap">
        <div class="sb-actions-top">
          <label class="sb-select-all-wrap">
            <input type="checkbox" id="sb-select-all" checked> 全て選択
          </label>
        </div>
        <div class="table-wrap">
          <table class="tx-table">
            <thead>
              <tr>
                <th class="sb-th-check"></th>
                <th>カテゴリ</th>
                <th class="text-right">実績平均/月</th>
                <th class="text-right">現在の予算</th>
                <th class="text-right sb-col-suggest">提案予算</th>
                <th class="text-right">変化</th>
              </tr>
            </thead>
            <tbody id="sb-tbody"></tbody>
          </table>
        </div>
        <p class="hint">※ 提案額 = 過去3ヶ月の平均支出 × 110% を1,000円単位で切り上げ</p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="sb-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="sb-apply-btn">選択した予算を適用 <span class="sb-apply-count" id="sb-apply-count">0</span></button>
    </div>
  </div>
</div>`;
}

// スマート予算提案 (v5.88)
function calcSmartBudget() {
  const now = new Date();
  const months = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  const expCats = appData.categories.filter(c => c.type === 'expense');
  const budgets = appData.budgets || {};
  const suggestions = [];
  expCats.forEach(c => {
    const monthlyAmounts = months.map(m => {
      const txs = appData.transactions.filter(t =>
        t.type === 'expense' && t.categoryId === c.id && t.date && t.date.startsWith(m)
      );
      return txs.reduce((s, t) => s + t.amount, 0);
    });
    const nonZeroMonths = monthlyAmounts.filter(a => a > 0).length;
    if (nonZeroMonths === 0) return;
    const avg = monthlyAmounts.reduce((s, a) => s + a, 0) / months.length;
    const suggested = Math.max(Math.ceil(avg * 1.1 / 1000) * 1000, 1000);
    suggestions.push({ cat: c, avg: Math.round(avg), suggested, current: budgets[c.id] || 0, dataMonths: nonZeroMonths });
  });
  return { suggestions, months };
}

function bindCategories() {
  let editingCatId = null;

  function setFixedToggle(val) {
    const isFixed = !!val;
    document.getElementById('cat-is-fixed').value = String(isFixed);
    document.querySelectorAll('#cat-fixed-toggle .type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.fixed === String(isFixed));
    });
  }

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
        setFixedToggle(c.isFixed);
      }
    } else {
      title.textContent = 'カテゴリ追加';
      document.getElementById('cat-name').value  = '';
      document.getElementById('cat-yayoi').value = '';
      document.getElementById('cat-color').value = '#ef4444';
      updateSwatchSelection('#ef4444');
      setFixedToggle(false);
    }
    showModal(modal);
  }

  function closeCatModal() {
    hideModal('cat-modal');
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

  document.getElementById('cat-fixed-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    setFixedToggle(btn.dataset.fixed === 'true');
  });

  on('cat-modal-save', 'click', () => {
    const type    = document.getElementById('cat-type').value;
    const name    = document.getElementById('cat-name').value.trim();
    const yayoi   = document.getElementById('cat-yayoi').value.trim();
    const color   = document.getElementById('cat-color').value;
    const isFixed = document.getElementById('cat-is-fixed').value === 'true';
    if (!name)  { alert('カテゴリ名を入力してください'); return; }
    if (!yayoi) { alert('弥生勘定科目名を入力してください'); return; }
    if (editingCatId) updateCategory(editingCatId, { type, name, yayoiAccount: yayoi, color, isFixed });
    else addCategory({ type, name, yayoiAccount: yayoi, color, isFixed });
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

  // スマート予算提案モーダル
  on('open-smart-budget', 'click', () => {
    const { suggestions, months } = calcSmartBudget();
    const periodEl  = document.getElementById('sb-period-hint');
    const noDataEl  = document.getElementById('sb-no-data');
    const tableWrap = document.getElementById('sb-table-wrap');
    const tbody     = document.getElementById('sb-tbody');
    const selectAll = document.getElementById('sb-select-all');
    const bannerEl  = document.getElementById('sb-banner');
    const countBadge = document.getElementById('sb-apply-count');

    function updateSbCount() {
      const checks = [...tbody.querySelectorAll('.sb-check')];
      const cnt = checks.filter(c => c.checked).length;
      selectAll.indeterminate = cnt > 0 && cnt < checks.length;
      selectAll.checked = cnt === checks.length;
      if (countBadge) {
        countBadge.textContent = cnt;
        countBadge.classList.remove('sb-count-pop');
        void countBadge.offsetWidth;
        countBadge.classList.add('sb-count-pop');
      }
    }

    const fmt = m => { const [y, mo] = m.split('-'); return `${y}年${parseInt(mo)}月`; };
    periodEl.textContent = `分析期間: ${fmt(months[months.length - 1])} 〜 ${fmt(months[0])}`;

    if (suggestions.length === 0) {
      bannerEl.style.display  = 'none';
      noDataEl.style.display  = '';
      tableWrap.style.display = 'none';
    } else {
      // バナー更新
      const upCnt   = suggestions.filter(s => s.suggested > s.current).length;
      const downCnt = suggestions.filter(s => s.suggested < s.current).length;
      document.getElementById('sb-bn-total').textContent = suggestions.length;
      document.getElementById('sb-bn-up').textContent    = upCnt;
      document.getElementById('sb-bn-down').textContent  = downCnt;
      bannerEl.style.display  = '';

      noDataEl.style.display  = 'none';
      tableWrap.style.display = '';
      selectAll.checked = true;
      tbody.innerHTML = suggestions.map((s, i) => {
        const diff    = s.suggested - s.current;
        const diffCls = diff > 0 ? 'sb-diff-up' : (diff < 0 ? 'sb-diff-down' : 'sb-diff-same');
        const diffIcon = diff > 0 ? '↑' : (diff < 0 ? '↓' : '–');
        const diffAmt  = diff === 0 ? '変わらず' : `${diffIcon} ${formatMoney(Math.abs(diff))}`;
        const lowData = s.dataMonths < 3;
        return `<tr class="sb-row" style="--sb-i:${i};--sb-cat-color:${s.cat.color}">
          <td><input type="checkbox" class="sb-check" data-id="${s.cat.id}" data-val="${s.suggested}" checked></td>
          <td>
            <span class="color-dot" style="background:${s.cat.color}"></span>${esc2(s.cat.name)}
            ${lowData ? `<span class="sb-low-data" title="${s.dataMonths}ヶ月分のデータ">データ少</span>` : ''}
          </td>
          <td class="text-right text-muted">${formatMoney(s.avg)}</td>
          <td class="text-right">${s.current ? formatMoney(s.current) : '<span class="text-muted">未設定</span>'}</td>
          <td class="text-right sb-suggested">${formatMoney(s.suggested)}</td>
          <td class="text-right"><span class="sb-diff-pill ${diffCls}">${diffAmt}</span></td>
        </tr>`;
      }).join('');

      if (countBadge) countBadge.textContent = suggestions.length;

      tbody.addEventListener('change', updateSbCount);
      selectAll.addEventListener('change', () => {
        tbody.querySelectorAll('.sb-check').forEach(c => c.checked = selectAll.checked);
        updateSbCount();
      });
    }
    showModal(document.getElementById('smart-budget-modal'));
  });

  on('sb-modal-close',  'click', () => hideModal('smart-budget-modal'));
  on('sb-modal-cancel', 'click', () => hideModal('smart-budget-modal'));
  document.getElementById('smart-budget-modal').addEventListener('click', e => {
    if (e.target.id === 'smart-budget-modal') hideModal('smart-budget-modal');
  });

  on('sb-apply-btn', 'click', () => {
    const checks = [...document.querySelectorAll('.sb-check:checked')];
    if (checks.length === 0) { showToast('適用する予算を選択してください', 'warning'); return; }
    checks.forEach(c => setBudget(c.dataset.id, parseInt(c.dataset.val)));
    hideModal('smart-budget-modal');
    renderCurrentPage();
    showToast(`${checks.length}件の予算を更新しました`, 'success');
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
    const recurBadge = t.isRecurring ? `<span class="badge-recurring">🔁 ${t.recurringDay}日</span>` : '';
    return `<tr>
      <td>${esc2(t.name)}${recurBadge}</td>
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

<div class="section-tabs" id="settings-tabs">
  <button class="section-tab is-active" data-panel="stp-general"><span class="tab-icon">⚙️</span> 一般</button>
  <button class="section-tab" data-panel="stp-sync"><span class="tab-icon">☁️</span> 連携</button>
  <button class="section-tab" data-panel="stp-data"><span class="tab-icon">📊</span> データ</button>
  <button class="section-tab" data-panel="stp-other"><span class="tab-icon">🔔</span> その他</button>
</div>

<!-- ── パネル1: 一般 ── -->
<div class="settings-panel is-active" id="stp-general">
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
    <div class="card-header-row">
      <h3 class="card-title">⚡ よく使うテンプレート</h3>
      <button class="btn btn-primary" id="open-add-tpl">＋ テンプレート追加</button>
    </div>
    <p class="hint">固定費や繰り返しの取引を登録。収支一覧画面でワンタップ入力できます。</p>
    ${templateRows ? `<div class="table-wrap">
      <table class="tx-table">
        <thead><tr><th>名前</th><th>種別</th><th>カテゴリ</th><th>金額</th><th></th></tr></thead>
        <tbody>${templateRows}</tbody>
      </table>
    </div>` : '<p class="empty">テンプレートがありません</p>'}
  </div>

  ${(() => {
    const dw = s.dashWidgets || {};
    const widgets = [
      { key: 'aiAdvice',        label: 'AIアドバイス',    icon: '🤖' },
      { key: 'quickAdd',        label: 'クイック入力',    icon: '⚡' },
      { key: 'weekly',          label: '今週の家計',      icon: '📅' },
      { key: 'yearSummary',     label: '年次累計',        icon: '📆' },
      { key: 'categoryCompare', label: '前月比カテゴリ',  icon: '📊' },
      { key: 'pace',            label: '支出ペース',      icon: '⏱️' },
      { key: 'forecast',        label: '今月末収支予測',  icon: '📈' },
      { key: 'healthScore',   label: '家計スコア',      icon: '🏅' },
      { key: 'insight',       label: '今月のインサイト',icon: '💡' },
      { key: 'savingsOpps',   label: '節約機会スキャン', icon: '🔍' },
      { key: 'notes',         label: '今月のメモ',      icon: '📝' },
      { key: 'budget',        label: '予算進捗',        icon: '📊' },
      { key: 'goals',         label: '貯蓄目標',        icon: '🎯' },
      { key: 'subscriptions', label: 'サブスク管理',    icon: '📱' },
      { key: 'points',        label: 'ポイント残高',    icon: '🎫' },
      { key: 'wishlist',      label: 'ほしいものリスト',icon: '🛍️' },
      { key: 'challenges',    label: '節約チャレンジ',  icon: '🏆' },
      { key: 'debts',         label: 'ローン管理',      icon: '💳' },
      { key: 'events',        label: '収支予定',        icon: '📌' },
      { key: 'chart',         label: '収支グラフ',      icon: '📉' },
    ];
    const rows = widgets.map(w => {
      const checked = dw[w.key] !== false ? 'checked' : '';
      return `<label class="dw-item">
        <span class="dw-item-label"><span class="dw-item-icon">${w.icon}</span>${w.label}</span>
        <input type="checkbox" class="dw-toggle" data-key="${w.key}" ${checked}>
        <span class="dw-slider"></span>
      </label>`;
    }).join('');
    return `<div class="card">
    <div class="card-header-row">
      <h3 class="card-title">📐 ダッシュボード カスタマイズ</h3>
    </div>
    <p class="hint">ダッシュボードに表示するウィジェットを選択できます</p>
    <div class="dw-grid">${rows}</div>
    <button class="btn btn-primary" id="save-dash-widgets">保存</button>
  </div>`;
  })()}
</div>

<!-- ── パネル2: 連携 ── -->
<div class="settings-panel" id="stp-sync">
  <div class="card">
    <h3 class="card-title">📷 レシート読み込み設定</h3>
    <div class="form-group">
      <label>Gemini API キー</label>
      <div class="api-key-row">
        <input type="password" id="set-api-key" value="${esc2(s.geminiApiKey || '')}" placeholder="AIza..." autocomplete="off">
        <button class="btn btn-ghost btn-sm" id="toggle-api-key">表示</button>
      </div>
      <small class="hint">
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a>
        で無料で取得できます（1日1,000回まで無料）。このブラウザの localStorage にのみ保存されます。
      </small>
    </div>
    <button class="btn btn-primary" id="save-api-key">APIキーを保存</button>
    ${s.geminiApiKey ? '<span class="api-key-status set">✅ 設定済み</span>' : '<span class="api-key-status unset">未設定</span>'}
  </div>

  <div class="card">
    <h3 class="card-title">☁️ クラウドアカウント</h3>
    <div class="sync-status-row">
      <span id="sync-status-dot" class="sync-dot"></span>
      <span id="sync-status-text">未接続</span>
    </div>

    ${(typeof isLoggedIn === 'function' && isLoggedIn()) ? (() => {
      const user = getCurrentUser();
      return `
    <div id="sync-logged-info" class="sync-user-card">
      <div class="sync-user-avatar" id="sync-user-avatar">${user ? user.email[0].toUpperCase() : '?'}</div>
      <div class="sync-user-info">
        <span id="sync-user-email" class="sync-user-email-text">${esc2(user ? user.email : '')}</span>
        <span class="sync-cloud-status-ok">✓ クラウド同期が有効です</span>
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
          <span id="sync-user-email" class="sync-user-email-text"></span>
          <span class="sync-cloud-status-ok">✓ クラウド同期が有効です</span>
        </div>
      </div>
      <div class="sync-btn-row">
        <button class="btn btn-ghost btn-sm" id="btn-sync-pull">↓ 今すぐ同期</button>
        <button class="btn btn-danger btn-sm" id="btn-sync-logout">ログアウト</button>
      </div>
    </div>
    <div id="sync-login-prompt">
      ${(cfg.url && cfg.anonKey) ? `
      <button class="btn btn-primary" id="btn-sync-login-show">✉️ ログイン / 新規登録</button>
      ` : `<p class="hint">Supabase接続設定を行うと、メールアドレスでアカウント作成してクラウド同期できます。</p>`}
    </div>`}

    ${adminCfg ? `
    <div class="supabase-admin-notice">
      <span class="supabase-admin-notice-label">✓ Supabase接続設定済み</span>
      <span class="supabase-admin-notice-sub">（管理者によって設定されています）</span>
    </div>` : `
    <details class="stp-config-details" ${(!cfg.url || !cfg.anonKey) ? 'open' : ''}>
      <summary class="stp-config-summary">
        <span>⚙️ Supabase接続設定</span>
        ${(cfg.url && cfg.anonKey) ? '<span class="supabase-status-pill ok">設定済み</span>' : '<span class="supabase-status-pill ng">未設定</span>'}
      </summary>
      <div class="stp-detail-body">
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

    <details class="stp-help-details">
      <summary class="stp-help-summary">Supabase初期設定手順（クリックで展開）</summary>
      <ol class="stp-help-list">
        <li><a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> で無料プロジェクトを作成</li>
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
      <ol start="3" class="stp-help-list">
        <li>Settings → API から Project URL と anon key をコピーして上の入力欄に貼り付け</li>
        <li>「設定を保存」→「ログイン / 新規登録」でアカウント作成</li>
      </ol>
    </details>
  </div>

  <div class="card">
    <h3 class="card-title">💱 為替レート設定</h3>
    <p class="hint">外貨建て資産を日本円に換算するレートです（1外貨 = X円）。自動取得ボタンで最新レートを即時反映できます。</p>
    <div class="fx-rate-grid" id="fx-rate-grid">
      ${CURRENCIES.filter(c => c.code !== 'JPY').map(c => {
        const currentRate = getExchangeRates()[c.code] || DEFAULT_FX_RATES[c.code];
        return `
        <div class="fx-rate-row">
          <span class="fx-currency-label">${c.flag} ${c.code}<small>${c.name}</small></span>
          <div class="fx-input-wrap">
            <input type="number" class="form-input fx-rate-input" data-currency="${c.code}" value="${currentRate}" min="0" step="0.01" placeholder="0.00">
            <span class="fx-unit">円</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="fx-rate-actions">
      <button class="btn btn-secondary" id="fetch-fx-rates">🔄 自動取得</button>
      <button class="btn btn-primary" id="save-fx-rates">💾 保存</button>
    </div>
    <div class="fx-update-status" id="fx-update-status">${(() => {
      const ts = getFXRatesUpdatedAt();
      if (!ts) return '<span class="fx-update-none">未取得（デフォルト値を使用中）</span>';
      const d = new Date(ts);
      const label = d.toLocaleDateString('ja-JP') + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      return `<span class="fx-update-ok">✅ 最終自動取得: ${label}</span>`;
    })()}</div>
  </div>
</div>

<!-- ── パネル3: データ ── -->
<div class="settings-panel" id="stp-data">
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
      <div class="export-block">
        <h4>📥 CSVインポート</h4>
        <p class="hint">アプリの汎用CSVまたは銀行明細CSVを取り込みます。重複取引は自動スキップ。</p>
        <button class="btn btn-ghost" id="btn-csv-import-open">CSVをインポート</button>
      </div>
    </div>
  </div>

  <div class="card">
    <h3 class="card-title">📂 アカウント管理</h3>
    <p class="hint">アカウントごとに家計データを分けて管理できます（例：自分の家・親の家・事業用）。</p>
    <div class="table-wrap">
      <table class="tx-table">
        <thead><tr><th>アカウント名</th><th>状態</th><th></th></tr></thead>
        <tbody>
          ${getAllAccounts().map(a => `<tr>
            <td>${esc2(a.name)}${a.id === currentAccountId ? ' <span class="badge-active">使用中</span>' : ''}</td>
            <td class="acc-tx-count">${(()=>{
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
</div>

<!-- ── パネル4: その他 ── -->
<div class="settings-panel" id="stp-other">
  <div class="card">
    <h3 class="card-title">🔔 予算アラート通知</h3>
    <p class="hint">予算の80%到達・超過時にブラウザ通知でお知らせします。</p>
    <div id="notif-status-area"></div>
  </div>

  <div class="card">
    <h3 class="card-title">📱 スマートフォンアプリとしてインストール</h3>
    <p class="hint">このアプリはPWA（プログレッシブWebアプリ）です。ホーム画面に追加するとネイティブアプリのように使えます。</p>
    <div id="pwa-install-area"></div>
    <div class="install-guide-tabs">
      <div class="install-tab">
        <h4>🤖 Android（Chrome）</h4>
        <ol>
          <li>Chromeでこのページを開く</li>
          <li>右上の「⋮」メニューをタップ</li>
          <li>「ホーム画面に追加」を選択</li>
          <li>「追加」をタップして完了 🎉</li>
        </ol>
      </div>
      <div class="install-tab">
        <h4>🍎 iPhone / iPad（Safari）</h4>
        <ol>
          <li>Safariでこのページを開く（必須）</li>
          <li>画面下部の共有ボタン（□↑）をタップ</li>
          <li>「ホーム画面に追加」を選択</li>
          <li>「追加」をタップして完了 🎉</li>
        </ol>
      </div>
    </div>
    <p class="hint">💡 インストール後はオフラインでも使用できます。データはこのデバイスに保存されます。</p>
  </div>

  <div class="card danger-zone">
    <h3 class="card-title">危険ゾーン</h3>
    <p class="hint">現在のアカウントのデータをすべて削除します。この操作は元に戻せません。</p>
    <button class="btn btn-danger" id="btn-reset">データをリセット</button>
  </div>
</div>

<!-- ── モーダル（パネル外に配置：display:none時でも呼び出し可能） ── -->
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
      <div class="form-group">
        <label class="recurring-toggle-label">
          <input type="checkbox" id="tpl-recurring">
          <span>毎月自動追加する（繰り返し取引）</span>
        </label>
      </div>
      <div id="tpl-recurring-day-group" class="form-group recurring-day-group" style="display:none">
        <label>追加日</label>
        <div class="recurring-day-row">
          <span class="recurring-day-prefix">毎月</span>
          <input type="number" id="tpl-recurring-day" min="1" max="31" value="27" class="recurring-day-input">
          <span class="recurring-day-suffix">日に追加</span>
        </div>
        <small class="hint">月末より大きい日付は月末日に自動調整されます</small>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="tpl-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="tpl-modal-save">保存</button>
    </div>
  </div>
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

  // ── 設定タブ切替 (v5.46) ──────────────────────────────────
  const SETTINGS_TAB_KEY = 'kk_settings_tab';
  function switchSettingsTab(panelId) {
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('is-active'));
    document.querySelectorAll('#settings-tabs .section-tab').forEach(t => t.classList.remove('is-active'));
    const panel = document.getElementById(panelId);
    const tab   = document.querySelector(`#settings-tabs [data-panel="${panelId}"]`);
    if (panel) panel.classList.add('is-active');
    if (tab)   tab.classList.add('is-active');
    localStorage.setItem(SETTINGS_TAB_KEY, panelId);
  }
  const savedTab = localStorage.getItem(SETTINGS_TAB_KEY) || 'stp-general';
  switchSettingsTab(savedTab);
  document.querySelectorAll('#settings-tabs .section-tab').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset.panel));
  });

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
      pwaArea.innerHTML = '<p class="pwa-result-msg">✅ すでにアプリとしてインストール済みです</p>';
    } else if (window.pwaInstallEvent) {
      pwaArea.innerHTML = '<button class="btn btn-primary" id="btn-pwa-install">📲 ホーム画面に追加（ワンタップ）</button>';
      on('btn-pwa-install', 'click', async () => {
        window.pwaInstallEvent.prompt();
        const { outcome } = await window.pwaInstallEvent.userChoice;
        if (outcome === 'accepted') {
          window.pwaInstallEvent = null;
          pwaArea.innerHTML = '<p class="pwa-result-msg">✅ インストールしました！</p>';
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

  // ダッシュボードウィジェット保存（v5.59）
  on('save-dash-widgets', 'click', () => {
    const dw = {};
    document.querySelectorAll('.dw-toggle').forEach(cb => {
      dw[cb.dataset.key] = cb.checked;
    });
    updateSettings({ dashWidgets: dw });
    showToast('ウィジェット設定を保存しました', 'success');
  });

  // APIキー保存
  on('save-api-key', 'click', () => {
    const key = document.getElementById('set-api-key').value.trim();
    updateSettings({ geminiApiKey: key });
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

  on('btn-csv-import-open', 'click', openCSVImportModal);

  on('btn-reset', 'click', () => {
    if (!confirm('本当にすべてのデータを削除しますか？この操作は元に戻せません。')) return;
    if (!confirm('最終確認：データをリセットしてよいですか？')) return;
    appData = createDefaultData();
    saveData();
    renderCurrentPage();
    alert('データをリセットしました');
  });

  // ── 為替レート保存 ────────────────────────────────────────
  on('save-fx-rates', 'click', () => {
    const newRates = {};
    document.querySelectorAll('.fx-rate-input').forEach(input => {
      const code = input.dataset.currency;
      const val  = parseFloat(input.value);
      if (code && !isNaN(val) && val > 0) newRates[code] = val;
    });
    saveExchangeRates(newRates);
    showToast('為替レートを保存しました', 'success');
  });

  // ── 為替レート自動取得 ────────────────────────────────────
  on('fetch-fx-rates', 'click', async () => {
    const btn = document.getElementById('fetch-fx-rates');
    const statusEl = document.getElementById('fx-update-status');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '⏳ 取得中...';
    try {
      const rates = await fetchAndSaveExchangeRates();
      // 入力フィールドを更新
      document.querySelectorAll('.fx-rate-input').forEach(input => {
        const code = input.dataset.currency;
        if (rates[code] != null) input.value = rates[code];
      });
      // ステータス更新
      const d = new Date();
      const label = d.toLocaleDateString('ja-JP') + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      if (statusEl) statusEl.innerHTML = `<span class="fx-update-ok">✅ 最終自動取得: ${label}</span>`;
      showToast('為替レートを自動取得しました', 'success');
    } catch (e) {
      showToast('取得失敗：ネットワーク接続を確認してください', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 自動取得';
    }
  });

  // ── テンプレート管理 ──────────────────────────────────────
  let editingTplId = null;

  function openTplModal(id) {
    editingTplId = id || null;
    document.getElementById('tpl-modal-title').textContent = id ? 'テンプレート編集' : 'テンプレート追加';
    if (id) {
      const tpl = (appData.templates || []).find(t => t.id === id);
      if (tpl) {
        document.getElementById('tpl-name').value         = tpl.name || '';
        document.getElementById('tpl-type').value         = tpl.type || 'expense';
        document.getElementById('tpl-category').value     = tpl.categoryId || '';
        document.getElementById('tpl-amount').value       = tpl.amount || '';
        document.getElementById('tpl-payment').value      = tpl.paymentMethod || '現金';
        document.getElementById('tpl-tax').value          = tpl.taxRate != null ? String(tpl.taxRate) : '0';
        document.getElementById('tpl-memo').value         = tpl.memo || '';
        document.getElementById('tpl-recurring').checked  = !!tpl.isRecurring;
        document.getElementById('tpl-recurring-day').value = tpl.recurringDay || 27;
        document.getElementById('tpl-recurring-day-group').style.display = tpl.isRecurring ? '' : 'none';
        setTplTypeBtn(tpl.type || 'expense');
      }
    } else {
      document.getElementById('tpl-name').value         = '';
      document.getElementById('tpl-type').value         = 'expense';
      document.getElementById('tpl-category').value     = '';
      document.getElementById('tpl-amount').value       = '';
      document.getElementById('tpl-payment').value      = '現金';
      document.getElementById('tpl-tax').value          = '0';
      document.getElementById('tpl-memo').value         = '';
      document.getElementById('tpl-recurring').checked  = false;
      document.getElementById('tpl-recurring-day').value = 27;
      document.getElementById('tpl-recurring-day-group').style.display = 'none';
      setTplTypeBtn('expense');
    }
    showModal('tpl-modal');
    // チェックボックスの連動
    const recurCb = document.getElementById('tpl-recurring');
    if (recurCb) {
      recurCb.addEventListener('change', () => {
        document.getElementById('tpl-recurring-day-group').style.display = recurCb.checked ? '' : 'none';
      });
    }
  }

  function closeTplModal() {
    hideModal('tpl-modal');
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
    const isRecurring = document.getElementById('tpl-recurring').checked;
    const recurringDay = Number(document.getElementById('tpl-recurring-day').value) || 27;
    const fields = {
      name,
      type:          document.getElementById('tpl-type').value,
      categoryId:    document.getElementById('tpl-category').value,
      amount:        Number(document.getElementById('tpl-amount').value) || 0,
      paymentMethod: document.getElementById('tpl-payment').value,
      taxRate:       Number(document.getElementById('tpl-tax').value),
      memo:          document.getElementById('tpl-memo').value.trim(),
      isRecurring,
      recurringDay:  isRecurring ? recurringDay : null,
      // 繰り返し設定が外れた場合はlastAppliedをリセット
      lastApplied:   isRecurring ? ((appData.templates || []).find(t => t.id === editingTplId)?.lastApplied || null) : null,
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
    showModal(modal);
  }

  function closeMemModal() {
    hideModal('mem-modal');
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

  // ── 予算アラート通知 ─────────────────────────────────────
  const notifArea = document.getElementById('notif-status-area');
  if (notifArea) {
    function renderNotifStatus() {
      if (!('Notification' in window)) {
        notifArea.innerHTML = '<p class="hint">このブラウザは通知に対応していません</p>';
        return;
      }
      const perm    = Notification.permission;
      const enabled = isNotifEnabled();
      let html = '';
      if (perm === 'granted') {
        html = `<div class="notif-row">
          <span class="notif-badge notif-granted">✅ 通知が許可されています</span>
          <label class="notif-toggle-label">
            <input type="checkbox" id="notif-toggle" ${enabled ? 'checked' : ''}>
            <span>予算アラートを有効にする</span>
          </label>
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-test-notif">テスト通知を送る</button>`;
      } else if (perm === 'denied') {
        html = '<p class="hint" style="color:var(--expense)">❌ 通知がブロックされています。ブラウザの設定から通知を許可してください。</p>';
      } else {
        html = `<p class="hint">通知を許可すると、予算超過時に自動でお知らせします。</p>
          <button class="btn btn-primary btn-sm" id="btn-request-notif">🔔 通知を許可する</button>`;
      }
      notifArea.innerHTML = html;

      const toggle = document.getElementById('notif-toggle');
      if (toggle) toggle.addEventListener('change', () => setNotifEnabled(toggle.checked));

      const reqBtn = document.getElementById('btn-request-notif');
      if (reqBtn) reqBtn.addEventListener('click', async () => {
        await requestNotifPermission();
        renderNotifStatus();
      });

      const testBtn = document.getElementById('btn-test-notif');
      if (testBtn) testBtn.addEventListener('click', () => {
        sendBudgetNotif('🔔 テスト通知', '予算アラートが正常に動作しています！');
      });
    }
    renderNotifStatus();
  }
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

// ============================================================
// グラフ ドリルダウンモーダル (v8.0)
// ============================================================
function openCategoryDrilldown(catName, catColor, month, type, txsPool, periodLabel) {
  const allTxs = txsPool || (month
    ? getTransactionsByMonth(month)
    : appData.transactions);

  const txs = allTxs
    .filter(t => t.type === type)
    .filter(t => {
      const cat = getCategoryById(t.categoryId);
      const name = cat ? cat.name : 'その他';
      return name === catName;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // カテゴリドット・タイトル
  const dotEl = document.getElementById('dd-cat-dot');
  const titleEl = document.getElementById('dd-modal-title');
  if (dotEl) dotEl.style.background = catColor || getCSSVar('--text-muted');
  if (titleEl) titleEl.textContent = catName;

  // サマリー
  const total = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const summaryEl = document.getElementById('dd-summary');
  if (summaryEl) {
    const monthLabel = periodLabel ||
      (month
        ? (() => { const [y, m] = month.split('-'); return `${y}年${parseInt(m, 10)}月`; })()
        : '全期間');
    summaryEl.innerHTML = `
      <div class="dd-summary-item">
        <span class="dd-summary-label">合計</span>
        <span class="dd-summary-value" style="color:${catColor || 'var(--primary)'}">${formatMoney(total)}</span>
      </div>
      <div class="dd-summary-item">
        <span class="dd-summary-label">件数</span>
        <span class="dd-summary-value">${txs.length}件</span>
      </div>
      <div class="dd-summary-item">
        <span class="dd-summary-label">対象期間</span>
        <span class="dd-summary-value">${monthLabel}</span>
      </div>
    `;
  }

  // 取引一覧
  const listEl = document.getElementById('dd-list');
  if (listEl) {
    if (txs.length === 0) {
      listEl.innerHTML = '<div class="dd-empty">取引データがありません</div>';
    } else {
      listEl.innerHTML = txs.map((t, i) => {
        const dateStr = t.date ? t.date.slice(5).replace('-', '/') : '–';
        const memo = t.memo || '（メモなし）';
        return `<div class="dd-tx-row" data-id="${t.id}" style="--dd-i:${i}" role="button" tabindex="0">
          <span class="dd-tx-date">${dateStr}</span>
          <span class="dd-tx-memo" title="${esc2(memo)}">${esc2(memo)}</span>
          <span class="dd-tx-amount ${type}">${type === 'expense' ? '−' : '+'}${formatMoney(t.amount)}</span>
        </div>`;
      }).join('');

      // クリックで取引編集モーダルを開く
      listEl.querySelectorAll('.dd-tx-row').forEach(row => {
        const open = () => { hideModal('dd-modal'); setTimeout(() => openTxModal(row.dataset.id), 120); };
        row.addEventListener('click', open);
        row.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
      });
    }
  }

  // 「このカテゴリで追加」ボタン
  const addBtn = document.getElementById('dd-add-btn');
  if (addBtn) {
    const matchCat = appData.categories.find(c => c.name === catName && c.type === type);
    addBtn.onclick = () => {
      hideModal('dd-modal');
      setTimeout(() => openTxModal(null, matchCat ? { categoryId: matchCat.id, type } : { type }), 120);
    };
  }

  showModal('dd-modal');
}

// ドリルダウンモーダル 閉じるハンドラー（即時登録：script は body 末尾なので DOM 確定済み）
{
  const close = () => hideModal('dd-modal');
  document.getElementById('dd-modal-close')?.addEventListener('click', close);
  document.getElementById('dd-modal-close2')?.addEventListener('click', close);
  const ddModal = document.getElementById('dd-modal');
  if (ddModal) ddModal.addEventListener('click', e => { if (e.target === ddModal) close(); });
}

// ─── 月ドリルダウンモーダル (v8.6) ────────────────────────────────────
function openMonthDrilldown(month, direction) {
  appState.mdCurrentMonth = month;
  const [y, mo] = month.split('-');
  const monthLabel = `${y}年${parseInt(mo, 10)}月`;
  const txs = getTransactionsByMonth(month);
  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');
  const balance = income - expense;

  // スライドアニメーション (v9.0)
  const _mdBox = document.querySelector('.md-modal-box');
  if (_mdBox && direction) {
    const _sc = direction === 'prev' ? 'md-slide-prev' : 'md-slide-next';
    _mdBox.classList.remove('md-slide-prev', 'md-slide-next');
    void _mdBox.offsetWidth;
    _mdBox.classList.add(_sc);
  }

  // タイトル + 貯蓄率バッジ (v9.0)
  const infoEl = document.querySelector('.md-month-info');
  if (infoEl) {
    const sRate = income > 0 ? Math.round((income - expense) / income * 100) : null;
    const sCls = sRate === null ? 'warn' : sRate >= 20 ? 'good' : sRate >= 0 ? 'warn' : 'bad';
    const sLabel = sRate !== null ? `${sRate >= 0 ? '+' : ''}${sRate}%` : '—';
    infoEl.innerHTML = `<span class="md-calendar-icon" aria-hidden="true">📅</span><h2 class="modal-title" id="md-modal-title">${esc2(monthLabel)}</h2><span class="md-savings-badge ${sCls}" title="貯蓄率">${sLabel}</span>`;
  }

  // 前月/翌月ナビ ボタン状態更新
  const today = todayStr().substring(0, 7);
  const allMonths = getAvailableMonths();
  const prevMonth = adjMonth(month, -1);
  const nextMonth = adjMonth(month, 1);
  const prevBtn = document.getElementById('md-prev-btn');
  const nextBtn = document.getElementById('md-next-btn');
  if (prevBtn) {
    const hasPrev = allMonths.includes(prevMonth);
    prevBtn.disabled = !hasPrev;
    prevBtn.style.opacity = hasPrev ? '' : '0.3';
    prevBtn.onclick = hasPrev ? () => openMonthDrilldown(prevMonth, 'prev') : null;
  }
  if (nextBtn) {
    const hasNext = nextMonth <= today;
    nextBtn.disabled = !hasNext;
    nextBtn.style.opacity = hasNext ? '' : '0.3';
    nextBtn.onclick = hasNext ? () => openMonthDrilldown(nextMonth, 'next') : null;
  }

  // サマリー（グラデーションセルカード）
  const summaryEl = document.getElementById('md-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="md-cell md-cell-income" style="--md-si:0">
        <span class="md-cell-label">収入</span>
        <span class="md-cell-value">${formatMoney(income)}</span>
      </div>
      <div class="md-cell md-cell-expense" style="--md-si:1">
        <span class="md-cell-label">支出</span>
        <span class="md-cell-value">${formatMoney(expense)}</span>
      </div>
      <div class="md-cell ${balance >= 0 ? 'md-cell-balance-pos' : 'md-cell-balance-neg'}" style="--md-si:2">
        <span class="md-cell-label">残高</span>
        <span class="md-cell-value">${formatMoney(balance)}</span>
      </div>
      <div class="md-cell md-cell-count" style="--md-si:3">
        <span class="md-cell-label">件数</span>
        <span class="md-cell-value">${txs.length}<small>件</small></span>
      </div>
    `;
  }

  // カテゴリ別内訳を構築するヘルパー
  function buildCatList(catTxs) {
    const catMap = {};
    catTxs.forEach(t => {
      const cat = getCategoryById(t.categoryId);
      const name  = cat ? cat.name  : 'その他';
      const color = cat ? cat.color : 'var(--text-muted)';
      if (!catMap[name]) catMap[name] = { total: 0, color };
      catMap[name].total += Number(t.amount) || 0;
    });
    return Object.entries(catMap).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  }

  // カテゴリ別支出内訳（上位5件）
  const expList = buildCatList(txs.filter(t => t.type === 'expense'));
  const maxExp = expList[0]?.[1].total || 1;
  const catsEl = document.getElementById('md-cats');
  if (catsEl) {
    if (expList.length === 0) {
      catsEl.innerHTML = '<div class="dd-empty">支出データがありません</div>';
    } else {
      catsEl.innerHTML = expList.map(([name, { total, color }], i) => {
        const barPct   = Math.round(total / maxExp * 100);
        const sharePct = expense > 0 ? Math.round(total / expense * 100) : 0;
        return `<div class="md-cat-row" style="--md-i:${i};--md-cat-color:${color}">
          <div class="md-cat-name" title="${esc2(name)}"><span class="md-cat-dot" aria-hidden="true"></span><span class="md-cat-text">${esc2(name)}</span></div>
          <div class="md-cat-bar-wrap"><div class="md-cat-bar" style="width:${barPct}%"></div></div>
          <div class="md-cat-amount">${formatMoney(total)}</div>
          <div class="md-cat-pct">${sharePct}%</div>
        </div>`;
      }).join('');
    }
  }

  // 収入カテゴリ内訳（上位5件）
  const incList = buildCatList(txs.filter(t => t.type === 'income'));
  const maxInc = incList[0]?.[1].total || 1;
  const incomeCatsEl = document.getElementById('md-income-cats');
  const incomeTitleEl = document.querySelector('.md-income-title');
  if (incomeCatsEl) {
    if (incList.length === 0) {
      incomeCatsEl.style.display = 'none';
      if (incomeTitleEl) incomeTitleEl.style.display = 'none';
    } else {
      incomeCatsEl.style.display = '';
      if (incomeTitleEl) incomeTitleEl.style.display = '';
      incomeCatsEl.innerHTML = incList.map(([name, { total, color }], i) => {
        const barPct   = Math.round(total / maxInc * 100);
        const sharePct = income > 0 ? Math.round(total / income * 100) : 0;
        return `<div class="md-cat-row md-cat-row-income" style="--md-i:${i};--md-cat-color:${color}">
          <div class="md-cat-name" title="${esc2(name)}"><span class="md-cat-dot" aria-hidden="true"></span><span class="md-cat-text">${esc2(name)}</span></div>
          <div class="md-cat-bar-wrap"><div class="md-cat-bar md-cat-bar-income" style="width:${barPct}%"></div></div>
          <div class="md-cat-amount md-cat-amount-income">${formatMoney(total)}</div>
          <div class="md-cat-pct">${sharePct}%</div>
        </div>`;
      }).join('');
    }
  }

  // 最近の取引（最大8件、日付降順）
  const recentTxs = [...txs]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 8);

  const listEl = document.getElementById('md-list');
  if (listEl) {
    if (recentTxs.length === 0) {
      listEl.innerHTML = '<div class="dd-empty">取引データがありません</div>';
    } else {
      listEl.innerHTML = recentTxs.map((t, i) => {
        const cat     = getCategoryById(t.categoryId);
        const catName = cat ? cat.name : 'その他';
        const dateStr = t.date ? t.date.slice(5).replace('-', '/') : '–';
        const memo    = t.memo || catName;
        return `<div class="dd-tx-row" data-id="${t.id}" style="--dd-i:${i}" role="button" tabindex="0">
          <span class="dd-tx-date">${dateStr}</span>
          <span class="dd-tx-memo" title="${esc2(memo)}">${esc2(memo)}</span>
          <span class="dd-tx-amount ${t.type}">${t.type === 'expense' ? '−' : '+'}${formatMoney(t.amount)}</span>
        </div>`;
      }).join('');

      listEl.querySelectorAll('.dd-tx-row').forEach(row => {
        const open = () => { hideModal('md-modal'); setTimeout(() => openTxModal(row.dataset.id), 120); };
        row.addEventListener('click', open);
        row.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
      });
    }
  }

  // 「この月を見る」ボタン (v9.0: 月名付き)
  const viewBtn = document.getElementById('md-view-btn');
  if (viewBtn) {
    viewBtn.textContent = `${parseInt(mo, 10)}月を見る →`;
    viewBtn.onclick = () => {
      hideModal('md-modal');
      appState.month = month;
      navigate('transactions');
    };
  }

  showModal('md-modal');
}

// 月ドリルダウンモーダル 閉じるハンドラー
{
  const close = () => hideModal('md-modal');
  document.getElementById('md-modal-close')?.addEventListener('click', close);
  document.getElementById('md-modal-close2')?.addEventListener('click', close);
  const mdModal = document.getElementById('md-modal');
  if (mdModal) mdModal.addEventListener('click', e => { if (e.target === mdModal) close(); });
}

function monthSelector(id, value) {
  const months = getAvailableMonths();
  if (!months.includes(value)) months.unshift(value);

  const options = months.map(m => {
    const [y, mo] = m.split('-');
    return `<option value="${m}" ${m === value ? 'selected' : ''}>${y}年${parseInt(mo)}月</option>`;
  }).join('');

  const today = todayStr().substring(0, 7);
  const disNext = value >= today ? ' disabled' : '';
  const disOldest = months.length > 0 && value === months[months.length - 1] ? ' disabled' : '';

  return `<div class="month-nav" id="${id}-wrap">
    <button class="month-nav-btn" id="${id}-prev" title="前の月" aria-label="前の月"${disOldest}>&#8249;</button>
    <select id="${id}" class="month-sel">${options}</select>
    <button class="month-nav-btn" id="${id}-next" title="次の月" aria-label="次の月"${disNext}>&#8250;</button>
  </div>`;
}

// v5.99: 月を前後に移動するヘルパー
function adjMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ============================================================
// レシートスキャン（Gemini Vision API via Cloudflare Proxy）
// ============================================================

function checkApiKey() {
  if (!appData.settings.geminiApiKey) {
    if (confirm('Gemini APIキーが設定されていません。\n設定画面でAPIキーを入力してください。\n\n設定画面を開きますか？')) {
      closeTxModal();
      navigate('settings');
    }
    return false;
  }
  return true;
}

async function processReceiptFile(file) {
  const scanBtn   = document.getElementById('receipt-scan-btn');
  const fileLabel = document.getElementById('receipt-file-label');
  const result    = document.getElementById('scan-result');
  const multiList = document.getElementById('multi-receipt-list');

  // ローディング状態
  if (scanBtn)   { scanBtn.innerHTML = '⏳ 解析中...'; scanBtn.disabled = true; }
  if (fileLabel) { fileLabel.classList.add('disabled'); }
  if (result)    { result.style.display = 'none'; }
  if (multiList) { multiList.innerHTML = ''; multiList.style.display = 'none'; }

  try {
    const base64   = await fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';

    // 支出カテゴリ名リストを渡す
    const categoryNames = appData.categories
      .filter(c => c.type === 'expense')
      .map(c => c.name);

    const receipts = await callGeminiVision(base64, mimeType, categoryNames);

    if (receipts.length === 1) {
      applySingleReceipt(receipts[0]);
    } else {
      showMultiReceiptList(receipts);
    }

  } catch (err) {
    if (result) {
      result.innerHTML = `<span class="scan-err">❌ 読み取り失敗：${esc2(err.message)}</span>`;
      result.style.display = 'flex';
    }
  } finally {
    if (scanBtn)   { scanBtn.innerHTML = '📷 レシートから読み込む'; scanBtn.disabled = false; }
    if (fileLabel) { fileLabel.classList.remove('disabled'); }
  }
}

function applySingleReceipt(data) {
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

  // カテゴリ自動選択
  if (data.category) {
    const cat = appData.categories.find(c => c.name === data.category && c.type === 'expense');
    if (cat) {
      renderCatChips('expense', cat.id);
      const hi = document.getElementById('tx-category');
      if (hi) hi.value = cat.id;
      updateMemoSuggestions();
    }
  }

  // 成功メッセージ
  const result = document.getElementById('scan-result');
  if (result) {
    const catLabel = data.category ? ` → ${esc2(data.category)}` : '';
    result.innerHTML = `<span class="scan-ok">✅ 読み取り完了</span>
      <span class="scan-detail">${esc2(data.storeName || '店名不明')} ／ ¥${Number(data.amount || 0).toLocaleString('ja-JP')}（税率${data.taxRate || 0}%）${catLabel}</span>`;
    result.style.display = 'flex';
  }
}

function showMultiReceiptList(receipts) {
  const result    = document.getElementById('scan-result');
  const multiList = document.getElementById('multi-receipt-list');

  if (result) {
    result.innerHTML = `<span class="scan-ok">📋 ${receipts.length}件のレシートを検出</span>`;
    result.style.display = 'flex';
  }

  if (!multiList) return;

  // 編集用データを保持（元のreceiptsを変更しない）
  const editData = receipts.map(r => ({ ...r }));

  const expenseCats = appData.categories.filter(c => c.type === 'expense');

  const cards = editData.map((r, i) => {
    const catOptions = expenseCats.map(c => {
      const sel = c.name === r.category ? ' selected' : '';
      const icon = CAT_ICONS[c.name] || '📌';
      return `<option value="${esc2(c.name)}"${sel}>${icon} ${esc2(c.name)}</option>`;
    }).join('');

    return `<div class="multi-receipt-item" data-idx="${i}">
      <div class="mr-edit-form">
        <div class="mr-edit-row">
          <input type="text" class="mr-store" data-idx="${i}" value="${esc2(r.storeName || '')}" placeholder="店名">
          <input type="number" class="mr-amount" data-idx="${i}" value="${r.amount || 0}" placeholder="金額" min="0">
        </div>
        <div class="mr-edit-row">
          <input type="date" class="mr-date" data-idx="${i}" value="${esc2(r.date || todayStr())}">
          <select class="mr-cat" data-idx="${i}">${catOptions}</select>
        </div>
      </div>
      <div class="multi-receipt-actions">
        <button type="button" class="btn-mr-fill" data-idx="${i}">入力</button>
        <button type="button" class="btn-mr-add" data-idx="${i}">保存</button>
      </div>
    </div>`;
  }).join('');

  multiList.innerHTML = `
    <button type="button" class="btn-mr-all">全て保存</button>
    ${cards}`;
  multiList.style.display = 'flex';

  // フォーム変更を editData に同期
  multiList.querySelectorAll('.mr-store').forEach(el => {
    el.addEventListener('input', () => { editData[Number(el.dataset.idx)].storeName = el.value; });
  });
  multiList.querySelectorAll('.mr-amount').forEach(el => {
    el.addEventListener('input', () => { editData[Number(el.dataset.idx)].amount = Number(el.value); });
  });
  multiList.querySelectorAll('.mr-date').forEach(el => {
    el.addEventListener('input', () => { editData[Number(el.dataset.idx)].date = el.value; });
  });
  multiList.querySelectorAll('.mr-cat').forEach(el => {
    el.addEventListener('change', () => { editData[Number(el.dataset.idx)].category = el.value; });
  });

  // 「入力」→ モーダルフォームに反映
  multiList.querySelectorAll('.btn-mr-fill').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = Number(btn.dataset.idx);
      const item = btn.closest('.multi-receipt-item');
      applySingleReceipt(editData[idx]);
      // このアイテムだけ「入力済」にし、リストは残す
      if (item) item.classList.add('added');
      btn.disabled = true;
      btn.textContent = '済';
    });
  });

  // 「保存」→ 即座に取引追加
  multiList.querySelectorAll('.btn-mr-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = Number(btn.dataset.idx);
      const item = btn.closest('.multi-receipt-item');
      addReceiptAsTransaction(editData[idx]);
      if (item) item.classList.add('added');
      btn.disabled = true;
      btn.textContent = '済';
    });
  });

  // 「全て保存」
  multiList.querySelector('.btn-mr-all')?.addEventListener('click', () => {
    let count = 0;
    editData.forEach((r, i) => {
      const item = multiList.querySelector(`.multi-receipt-item[data-idx="${i}"]`);
      if (item && !item.classList.contains('added')) {
        addReceiptAsTransaction(r);
        item.classList.add('added');
        const btn = item.querySelector('.btn-mr-add');
        if (btn) { btn.disabled = true; btn.textContent = '済'; }
        count++;
      }
    });
    if (count) showToast(`${count}件の取引を追加しました`);
  });
}

function addReceiptAsTransaction(data) {
  // カテゴリマッチ
  let catId = '';
  if (data.category) {
    const cat = appData.categories.find(c => c.name === data.category && c.type === 'expense');
    if (cat) catId = cat.id;
  }
  if (!catId) {
    const fallback = appData.categories.find(c => c.type === 'expense');
    if (fallback) catId = fallback.id;
  }

  addTransaction({
    type:          'expense',
    date:          data.date || todayStr(),
    amount:        data.amount || 0,
    categoryId:    catId,
    paymentMethod: 'クレカ',
    memberId:      appData.settings.defaultMemberId || '',
    taxRate:       data.taxRate ?? 10,
    memo:          data.storeName || '',
  });

  showToast(`${esc2(data.storeName || 'レシート')} ¥${Number(data.amount || 0).toLocaleString('ja-JP')} を追加`);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// AI家計アドバイス (v6.1)
// ============================================================
async function callGeminiAdvice(month) {
  const apiKey  = appData.settings?.geminiApiKey;
  const proxyUrl = APP_CONFIG.geminiProxy?.url;
  if (!apiKey)   throw new Error('Gemini APIキーが設定されていません。設定 → 連携タブで入力してください。');
  if (!proxyUrl) throw new Error('Geminiプロキシが未設定です。');

  const txs     = getTransactionsByMonth(month);
  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');
  const balance = income - expense;
  const savingRate = income > 0 ? Math.round(balance / income * 100) : 0;

  // カテゴリ別支出（上位8件）
  const catMap = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
  });
  const catEntries = Object.entries(catMap)
    .map(([id, amt]) => {
      const cat = (appData.categories || []).find(c => c.id === id);
      return { name: cat?.name || id, amount: amt };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // 先月比
  const [y, m] = month.split('-');
  const prevD = new Date(Number(y), Number(m) - 2, 1);
  const prevMonth = prevD.getFullYear() + '-' + String(prevD.getMonth() + 1).padStart(2, '0');
  const prevTxs    = getTransactionsByMonth(prevMonth);
  const prevIncome  = calcTotal(prevTxs, 'income');
  const prevExpense = calcTotal(prevTxs, 'expense');

  const pctDiff = (cur, prev) => prev > 0
    ? (cur >= prev ? '+' : '') + Math.round((cur - prev) / prev * 100) + '%'
    : 'データなし';

  // 予算達成状況
  const budgets = appData.budgets || {};
  const budgetLines = catEntries.map(ce => {
    const cat = (appData.categories || []).find(c => c.name === ce.name);
    if (!cat || !budgets[cat.id]) return null;
    const pct = Math.round(ce.amount / budgets[cat.id] * 100);
    return `  - ${ce.name}: ${ce.amount.toLocaleString()}円 / 予算${budgets[cat.id].toLocaleString()}円 (${pct}%)`;
  }).filter(Boolean);

  const yearMonthLabel = `${y}年${Number(m)}月`;

  const prompt = `あなたは家計管理のエキスパートです。以下の${yearMonthLabel}の家計データを分析して、具体的でわかりやすいアドバイスを日本語で提供してください。

## ${yearMonthLabel}の家計データ

### 収支サマリー
- 収入合計: ${income.toLocaleString()}円
- 支出合計: ${expense.toLocaleString()}円
- 収支バランス: ${balance >= 0 ? '+' : ''}${balance.toLocaleString()}円
- 貯蓄率: ${savingRate}%
- 取引件数: ${txs.length}件

### 先月との比較
- 収入: ${prevIncome.toLocaleString()}円 → ${income.toLocaleString()}円 (${pctDiff(income, prevIncome)})
- 支出: ${prevExpense.toLocaleString()}円 → ${expense.toLocaleString()}円 (${pctDiff(expense, prevExpense)})

### カテゴリ別支出（上位）
${catEntries.map(ce => `  - ${ce.name}: ${ce.amount.toLocaleString()}円`).join('\n') || '  データなし'}

${budgetLines.length > 0 ? `### 予算達成状況\n${budgetLines.join('\n')}` : ''}

## 回答形式
以下の構成でアドバイスをください（合計300〜450文字程度）：
1. **今月の総評**（1〜2文で簡潔に）
2. **良かった点**（箇条書き1〜2点）
3. **改善できそうな点**（箇条書き1〜2点）
4. **来月に向けてのアクション**（具体的な1つの提案）

親しみやすく前向きなトーンでお願いします。`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
  };

  const resp = await fetch(proxyUrl + '/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, payload }),
  });

  if (!resp.ok) {
    let msg = `HTTPエラー ${resp.status}`;
    try { const e = await resp.json(); msg = e.error?.message || e.error || msg; } catch (_) {}
    throw new Error(msg);
  }

  const body = await resp.json();
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('レスポンスが空です。');
  return text;
}

function openAdviceModal(month) {
  const modal = document.getElementById('advice-modal');
  if (!modal) return;

  const apiKey = appData.settings?.geminiApiKey;
  const [y, m] = month.split('-');
  const badge = document.getElementById('adv-month-badge');
  if (badge) badge.textContent = `📅 ${y}年${Number(m)}月`;

  showModal(modal);

  const bodyEl   = document.getElementById('adv-body');
  const copyBtn  = document.getElementById('adv-copy-btn');
  const regenBtn = document.getElementById('adv-regen-btn');

  if (!apiKey) {
    bodyEl.innerHTML = `<div class="adv-error">⚠️ Gemini APIキーが設定されていません。<br>設定 → 連携タブでAPIキーを入力してください。</div>`;
    if (copyBtn)  copyBtn.style.display  = 'none';
    if (regenBtn) regenBtn.style.display = 'none';
    return;
  }

  // ローディング
  bodyEl.innerHTML = `<div class="adv-loading">
    <div class="adv-sk-line"></div>
    <div class="adv-sk-line"></div>
    <div class="adv-sk-line"></div>
    <div class="adv-sk-line"></div>
    <div class="adv-sk-line"></div>
    <div class="adv-sk-line"></div>
  </div>`;
  if (copyBtn)  copyBtn.style.display  = 'none';
  if (regenBtn) regenBtn.style.display = 'none';

  callGeminiAdvice(month).then(text => {
    // 簡易マークダウンレンダリング
    const html = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^#{1,3}\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^[-•・]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]+?<\/li>)(?:\n|$)/g, (m) => m)
      .replace(/(<li>[^<]*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
      .replace(/\n{2,}/g, '\n')
      .split('\n').map(line => {
        if (/^<[hul]/.test(line)) return line;
        if (line.trim() === '') return '';
        return `<p>${line}</p>`;
      }).join('');

    // h3を区切りにセクション分割してラッパーを付与
    const sectionParts = html.split(/(?=<h3>)/);
    const wrappedHtml = sectionParts.map((s, i) =>
      s.trim() ? `<div class="adv-section" style="--adv-si:${i}">${s}</div>` : ''
    ).join('');
    bodyEl.innerHTML = `<div class="adv-text">${wrappedHtml || html}</div>`;
    if (copyBtn) {
      copyBtn.style.display = 'inline-flex';
      copyBtn.onclick = () => {
        navigator.clipboard?.writeText(text).then(() => {
          showToast('コピーしました', 'success');
          copyBtn.classList.add('adv-copy-done');
          setTimeout(() => copyBtn.classList.remove('adv-copy-done'), 600);
        });
      };
    }
    if (regenBtn) { regenBtn.style.display = 'inline-flex'; regenBtn.onclick = () => openAdviceModal(month); }
  }).catch(err => {
    bodyEl.innerHTML = `<div class="adv-error">⚠️ ${esc2(err.message)}</div>`;
    if (copyBtn)  copyBtn.style.display  = 'none';
    if (regenBtn) { regenBtn.style.display = 'inline-flex'; regenBtn.onclick = () => openAdviceModal(month); }
  });
}

async function callGeminiVision(base64, mimeType, categoryNames) {
  const apiKey  = appData.settings.geminiApiKey;
  const proxyUrl = APP_CONFIG.geminiProxy?.url;

  if (!proxyUrl) {
    throw new Error('Geminiプロキシが未設定です。管理者に連絡してください。');
  }

  const categoryListStr = (categoryNames || []).join('、');

  const prompt = `この画像/PDFから購入・支出の情報を抽出してください。
以下のすべてのタイプに対応してください：
- 紙のレシート・領収書
- ネットショッピングの注文確認画面（Amazon、楽天市場、Yahoo!ショッピングなど）
- クレジットカードアプリの利用明細画面
- メールの購入確認・領収書
- 請求書・納品書
画像が横向き・逆さま・斜めに回転している場合でも、正しく向きを判断して読み取ってください。
複数の購入情報が含まれる場合は、すべてを個別に抽出してください。
各項目についてJSON形式で回答してください。

[
  {
    "date": "YYYY-MM-DD（日付が読み取れない場合は今日の日付 ${todayStr()}）",
    "amount": 税込み合計金額（数値のみ、カンマなし）,
    "storeName": "店名・サイト名・サービス名（不明な場合は空文字）",
    "taxRate": 消費税率（10・8・0のいずれか。軽減税率の場合は8）,
    "category": "以下のカテゴリから最も適切なもの1つを選択: ${categoryListStr}"
  }
]

必ずJSON配列として回答してください。1件でも配列に入れてください。`;

  // Gemini API ペイロード
  const payload = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: mimeType,
            data: base64,
          },
        },
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date:      { type: 'string',  description: 'YYYY-MM-DD形式の日付' },
            amount:    { type: 'number',  description: '税込み合計金額' },
            storeName: { type: 'string',  description: '店名' },
            taxRate:   { type: 'number',  description: '消費税率（10, 8, 0）' },
            category:  { type: 'string',  description: 'カテゴリ名' },
          },
          required: ['date', 'amount', 'storeName', 'taxRate', 'category'],
        },
      },
    },
  };

  // Cloudflare Proxy 経由で送信
  const resp = await fetch(proxyUrl + '/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, payload }),
  });

  if (!resp.ok) {
    let msg = `HTTPエラー ${resp.status}`;
    try {
      const e = await resp.json();
      msg = e.error?.message || e.error || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const body = await resp.json();

  // Gemini レスポンス解析
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    throw new Error('レスポンスが空です。画像を確認してください。');
  }

  // responseMimeType: application/json を指定しているためテキスト全体がJSON
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    // フォールバック：配列またはオブジェクトを正規表現で抽出
    const mArr = text.match(/\[[\s\S]*\]/);
    if (mArr) {
      parsed = JSON.parse(mArr[0]);
    } else {
      const mObj = text.match(/\{[\s\S]*?\}/);
      if (!mObj) throw new Error('レスポンスの解析に失敗しました');
      parsed = [JSON.parse(mObj[0])];
    }
  }

  // 常に配列として返す
  if (!Array.isArray(parsed)) parsed = [parsed];

  // 各レシートを正規化
  parsed.forEach(r => {
    if (!r.date) r.date = todayStr();
    if (typeof r.amount === 'string') r.amount = Number(r.amount.replace(/,/g, ''));
  });

  return parsed;
}

function setFormValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ============================================================
// 資産管理ページ
// ============================================================

const ASSET_TYPES = {
  savings:    { label: '貯蓄',   icon: '🏦', color: '#3b82f6' },
  investment: { label: '投資',   icon: '📈', color: '#8b5cf6' },
  other:      { label: 'その他', icon: '💼', color: '#6b7280' },
};

// v5.84: 負債タイプ定義
const DEBT_TYPES = {
  mortgage: { label: '住宅ローン',      icon: '🏠', color: '#6366f1' },
  car:      { label: 'カーローン',      icon: '🚗', color: '#8b5cf6' },
  card:     { label: 'クレジットカード', icon: '💳', color: '#ef4444' },
  student:  { label: '奨学金',          icon: '🎓', color: '#f59e0b' },
  personal: { label: '個人ローン',      icon: '🏦', color: '#06b6d4' },
  other:    { label: 'その他',          icon: '💴', color: '#6b7280' },
};

function getAssetCurrentBalance(asset) {
  if (!asset.entries || asset.entries.length === 0) return null;
  return [...asset.entries].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function getTotalAssets() {
  return (appData.assets || []).reduce((sum, a) => {
    const e = getAssetCurrentBalance(a);
    if (!e) return sum;
    return sum + toJPY(Number(e.balance) || 0, a.currency);
  }, 0);
}

function getTotalNetWorth() {
  return getTotalAssets() - getTotalDebt();  // v5.84: 純資産 = 資産 - 負債
}

function getNetWorthAsOf(dateStr) {
  return (appData.assets || []).reduce((sum, asset) => {
    if (!asset.entries || asset.entries.length === 0) return sum;
    const valid = asset.entries.filter(e => e.date <= dateStr);
    if (valid.length === 0) return sum;
    const sorted = [...valid].sort((a, b) => b.date.localeCompare(a.date));
    return sum + toJPY(Number(sorted[0].balance) || 0, asset.currency);
  }, 0);
}

function getForeignAssetsTotalJPY() {
  return (appData.assets || []).filter(a => a.currency && a.currency !== 'JPY').reduce((sum, a) => {
    const e = getAssetCurrentBalance(a);
    if (!e) return sum;
    return sum + toJPY(Number(e.balance) || 0, a.currency);
  }, 0);
}

function renderAssets() {
  const assets = appData.assets || [];
  const totalNetWorth = getTotalNetWorth();

  // 先月末の純資産（比較用）
  const today = new Date();
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const lastMonthEndStr = lastMonthEnd.getFullYear() + '-' +
    String(lastMonthEnd.getMonth() + 1).padStart(2, '0') + '-' +
    String(lastMonthEnd.getDate()).padStart(2, '0');
  const prevNetWorth = getNetWorthAsOf(lastMonthEndStr);
  const diff = totalNetWorth - prevNetWorth;
  const diffHtml = prevNetWorth > 0 ? (() => {
    const pct = Math.round(diff / prevNetWorth * 100);
    const cls = diff >= 0 ? 'up' : 'down';
    return `<span class="diff ${cls}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% 先月比</span>`;
  })() : '';

  // 口座カード
  const fxRates = getExchangeRates();
  const assetCards = assets.map((asset, idx) => {
    const typeInfo = ASSET_TYPES[asset.type] || ASSET_TYPES.other;
    const currency = asset.currency || 'JPY';
    const isForeign = currency !== 'JPY';
    const currInfo = getCurrencyInfo(currency);
    const latest = getAssetCurrentBalance(asset);
    const balance = latest ? Number(latest.balance) : null;
    const balanceJPY = balance !== null ? toJPY(balance, currency) : null;
    const dateLabel = latest ? `${formatDate(latest.date)} 時点` : '残高未登録';
    const entries = [...(asset.entries || [])].sort((a, b) => b.date.localeCompare(a.date));

    // 残高変動デルタバッジ
    let deltaHtml = '';
    if (entries.length >= 2) {
      const cur = Number(entries[0].balance);
      const prev = Number(entries[1].balance);
      if (prev !== 0 && cur !== prev) {
        const pct = Math.round((cur - prev) / Math.abs(prev) * 100);
        const dir = cur > prev ? 'up' : 'down';
        const arrow = cur > prev ? '▲' : '▼';
        deltaHtml = `<span class="asset-balance-delta ${dir}">${arrow} ${Math.abs(pct)}%</span>`;
      }
    }

    // ミニスパークラインSVG
    let sparkHtml = '';
    if (entries.length >= 2) {
      const pts = entries.slice(0, 6).reverse().map(e => Number(e.balance));
      const min = Math.min(...pts), max = Math.max(...pts);
      const range = max - min || 1;
      const W = 100, H = 36, pad = 3;
      const coords = pts.map((v, i) => {
        const x = pad + (i / (pts.length - 1)) * (W - pad * 2);
        const y = pad + (1 - (v - min) / range) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      const areaBottom = pts.map((v, i) => {
        const x = pad + (i / (pts.length - 1)) * (W - pad * 2);
        const y = pad + (1 - (v - min) / range) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const areaPath = `M ${areaBottom[0]} L ${areaBottom.slice(1).join(' L ')} L ${(pad + (pts.length - 1) / (pts.length - 1) * (W - pad * 2)).toFixed(1)},${H} L ${pad},${H} Z`;
      sparkHtml = `
      <div class="asset-sparkline-wrap">
        <div class="asset-sparkline-label">残高推移</div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="spark-grad-${asset.id}" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="${typeInfo.color}" stop-opacity=".25"/>
              <stop offset="100%" stop-color="${typeInfo.color}" stop-opacity=".02"/>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#spark-grad-${asset.id})"/>
          <polyline points="${coords}" fill="none" stroke="${typeInfo.color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
      </div>`;
    }

    const historyRows = entries.slice(0, 3).map(e => {
      const entryJPY = isForeign ? toJPY(Number(e.balance), currency) : null;
      return `
      <div class="asset-entry-row">
        <span class="asset-entry-date">${formatDate(e.date)}</span>
        <span class="asset-entry-note">${esc2(e.note || '—')}</span>
        <span class="asset-entry-balance">
          ${isForeign ? `${formatCurrencyAmount(e.balance, currency)}<small class="fx-jpy-sub">≈${formatMoney(entryJPY)}</small>` : formatMoney(e.balance)}
        </span>
        <button class="btn-icon asset-del-entry" data-asset="${asset.id}" data-entry="${e.id}" title="削除">🗑️</button>
      </div>`;
    }).join('');

    const currencyBadge = isForeign
      ? `<span class="asset-currency-badge">${currInfo.flag} ${currInfo.code}</span>`
      : '';
    const rateHint = isForeign && balance !== null
      ? `<div class="asset-fx-rate">1 ${currInfo.code} = ¥${fxRates[currency]?.toFixed(2) || '—'}</div>`
      : '';
    const balanceDisplay = balance !== null
      ? (isForeign
          ? `<div class="asset-balance js-countup" data-value="${balanceJPY}">${formatCurrencyAmount(balance, currency)}</div>
             <div class="asset-balance-jpy">${formatMoney(balanceJPY)}</div>`
          : `<div class="asset-balance js-countup" data-value="${balance}">${formatMoney(balance)}</div>`)
      : `<div class="asset-balance no-balance">—</div>`;

    return `
<div class="card asset-card" style="--asset-accent:${typeInfo.color};--ac-i:${idx}">
  <div class="asset-card-header">
    <div class="asset-info">
      <span class="asset-type-icon">${typeInfo.icon}</span>
      <span class="asset-type-badge" style="background:${typeInfo.color}20;color:${typeInfo.color}">${typeInfo.label}</span>
      ${currencyBadge}
      <span class="asset-name">${esc2(asset.name)}</span>
    </div>
    <div class="asset-card-actions">
      <button class="btn-icon asset-edit" data-id="${asset.id}" title="編集">✏️</button>
      <button class="btn-icon asset-delete" data-id="${asset.id}" title="削除">🗑️</button>
    </div>
  </div>
  <div class="asset-balance-row">
    <div>
      <div class="asset-balance-main">
        ${balanceDisplay}
        ${deltaHtml}
      </div>
      <div class="asset-date-label">${dateLabel}</div>
      ${rateHint}
    </div>
    <button class="btn btn-primary btn-sm asset-add-entry" data-id="${asset.id}">＋ 残高を更新</button>
  </div>
  ${sparkHtml}
  ${entries.length > 0 ? `
  <div class="asset-history">
    <div class="asset-history-title">履歴</div>
    ${historyRows}
    ${entries.length > 3 ? `<div class="asset-history-more">他 ${entries.length - 3} 件</div>` : ''}
  </div>` : ''}
</div>`;
  }).join('');

  const emptyState = assets.length === 0 ? `
<div class="empty-asset-state">
  <div class="empty-asset-icon">🏦</div>
  <div class="empty-asset-msg">資産口座をまだ登録していません</div>
  <div class="empty-asset-sub">貯蓄・投資口座の残高を記録して<br>純資産の推移を把握しましょう</div>
</div>` : '';

  return `
<div class="page-header">
  <h1 class="page-title">🏦 資産管理</h1>
  <button class="btn btn-primary" id="btn-add-asset">＋ 口座を追加</button>
</div>

<div class="summary-cards">
  <div class="card summary-card net-worth-card ${totalNetWorth >= 0 ? 'positive' : 'negative'}">
    <div class="summary-label">💎 純資産合計（円換算）</div>
    <div class="summary-amount js-countup" data-value="${totalNetWorth}">${formatMoney(totalNetWorth)}</div>
    <div class="asset-neworth-diff">
      ${diffHtml}
      ${(() => {
        const totalAss = getTotalAssets();
        const totalDbt = getTotalDebt();
        const foreignTotal = getForeignAssetsTotalJPY();
        let html = '';
        if (totalDbt > 0) {
          html += `<div class="asset-net-breakdown">
            <span class="asset-breakdown-item asset-total">資産 ${formatMoney(totalAss)}</span>
            <span class="asset-breakdown-sep">−</span>
            <span class="asset-breakdown-item debt-total">負債 ${formatMoney(totalDbt)}</span>
          </div>`;
        }
        if (foreignTotal > 0) html += `<div class="asset-foreign-hint">うち外貨資産 ${formatMoney(foreignTotal)}</div>`;
        return html;
      })()}
    </div>
  </div>
</div>

${assets.length > 0 ? `
<div class="card chart-card">
  <h3 class="card-title">純資産推移（12ヶ月）</h3>
  <div class="chart-wrap chart-h-sm">
    <canvas id="net-worth-chart"></canvas>
  </div>
</div>` : ''}

<div class="asset-list-header">
  <h3 class="card-title">口座一覧 <span class="asset-count-badge">${assets.length}</span></h3>
</div>

${emptyState}
${assetCards}

<!-- 口座追加/編集モーダル -->
<div class="modal-overlay" id="asset-modal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3 class="modal-title" id="asset-modal-title">口座を追加</h3>
      <button class="modal-close" id="asset-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">口座名</label>
        <input type="text" id="asset-name" class="form-input" placeholder="例：銀行A普通預金">
      </div>
      <div class="form-group">
        <label class="form-label">種別</label>
        <select id="asset-type" class="form-input">
          <option value="savings">🏦 貯蓄（銀行・現金）</option>
          <option value="investment">📈 投資（株式・投資信託・iDeCo）</option>
          <option value="other">💼 その他</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">通貨</label>
        <select id="asset-currency" class="form-input">
          ${CURRENCIES.map(c => `<option value="${c.code}">${c.flag} ${c.code} — ${c.name}</option>`).join('')}
        </select>
        <small class="hint" id="asset-currency-hint" style="display:none">為替レートは設定ページで管理できます</small>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="asset-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="asset-modal-save">保存</button>
    </div>
  </div>
</div>

<!-- 残高更新モーダル -->
<div class="modal-overlay" id="asset-entry-modal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3 class="modal-title" id="asset-entry-modal-title">残高を更新</h3>
      <button class="modal-close" id="asset-entry-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">日付</label>
        <input type="date" id="asset-entry-date" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label" id="asset-entry-balance-label">残高（円）</label>
        <input type="number" id="asset-entry-balance" class="form-input" placeholder="0" min="0" step="any">
      </div>
      <div class="form-group">
        <label class="form-label">メモ（任意）</label>
        <input type="text" id="asset-entry-note" class="form-input" placeholder="例：3月末残高確認">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="asset-entry-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="asset-entry-modal-save">保存</button>
    </div>
  </div>
</div>`;
}

let _editingAssetId = null;
let _entryTargetAssetId = null;

function openAssetModal(assetId) {
  _editingAssetId = assetId || null;
  const asset = assetId ? (appData.assets || []).find(a => a.id === assetId) : null;
  document.getElementById('asset-modal-title').textContent = asset ? '口座を編集' : '口座を追加';
  document.getElementById('asset-name').value = asset ? asset.name : '';
  document.getElementById('asset-type').value = asset ? (asset.type || 'savings') : 'savings';
  const currencySelect = document.getElementById('asset-currency');
  currencySelect.value = asset ? (asset.currency || 'JPY') : 'JPY';
  const hint = document.getElementById('asset-currency-hint');
  hint.style.display = (currencySelect.value !== 'JPY') ? '' : 'none';
  currencySelect.onchange = () => {
    hint.style.display = (currencySelect.value !== 'JPY') ? '' : 'none';
  };
  showModal('asset-modal');
}

function openAssetEntryModal(assetId) {
  _entryTargetAssetId = assetId;
  const asset = (appData.assets || []).find(a => a.id === assetId);
  document.getElementById('asset-entry-modal-title').textContent =
    asset ? `「${asset.name}」残高を更新` : '残高を更新';
  document.getElementById('asset-entry-date').value = todayStr();
  document.getElementById('asset-entry-balance').value = '';
  document.getElementById('asset-entry-note').value = '';
  // 通貨ラベル更新
  const currency = (asset && asset.currency) || 'JPY';
  const currInfo = getCurrencyInfo(currency);
  const balLabel = document.getElementById('asset-entry-balance-label');
  if (balLabel) {
    balLabel.textContent = currency === 'JPY'
      ? '残高（円）'
      : `残高（${currInfo.code} / ${currInfo.name}）`;
  }
  showModal('asset-entry-modal');
}

function bindAssets() {
  // 数値カウントアップ
  document.querySelectorAll('.js-countup').forEach(el => {
    animateCountUp(el, Number(el.dataset.value));
  });

  // 純資産グラフ
  if ((appData.assets || []).length > 0) {
    setTimeout(() => renderNetWorthChart('net-worth-chart'), 50);
  }

  // 口座追加
  on('btn-add-asset', 'click', () => openAssetModal(null));

  // 口座編集
  document.querySelectorAll('.asset-edit').forEach(btn => {
    btn.addEventListener('click', () => openAssetModal(btn.dataset.id));
  });

  // 口座削除
  document.querySelectorAll('.asset-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = (appData.assets || []).find(a => a.id === btn.dataset.id);
      if (!asset) return;
      if (!confirm(`「${asset.name}」を削除しますか？\n残高履歴も含めてすべて削除されます。`)) return;
      deleteAsset(btn.dataset.id);
      navigate('assets');
    });
  });

  // 残高更新
  document.querySelectorAll('.asset-add-entry').forEach(btn => {
    btn.addEventListener('click', () => openAssetEntryModal(btn.dataset.id));
  });

  // 残高エントリ削除
  document.querySelectorAll('.asset-del-entry').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('この残高記録を削除しますか？')) return;
      deleteAssetEntry(btn.dataset.asset, btn.dataset.entry);
      navigate('assets');
    });
  });

  // 口座モーダル
  on('asset-modal-close',  'click', () => hideModal('asset-modal'));
  on('asset-modal-cancel', 'click', () => hideModal('asset-modal'));
  on('asset-modal-save',   'click', () => {
    const name = (document.getElementById('asset-name').value || '').trim();
    if (!name) { alert('口座名を入力してください'); return; }
    const type     = document.getElementById('asset-type').value;
    const currency = document.getElementById('asset-currency').value || 'JPY';
    if (_editingAssetId) {
      updateAsset(_editingAssetId, { name, type, currency });
    } else {
      addAsset({ name, type, currency });
    }
    hideModal('asset-modal');
    navigate('assets');
  });

  // 残高エントリモーダル
  on('asset-entry-modal-close',  'click', () => hideModal('asset-entry-modal'));
  on('asset-entry-modal-cancel', 'click', () => hideModal('asset-entry-modal'));
  on('asset-entry-modal-save',   'click', () => {
    const date    = document.getElementById('asset-entry-date').value;
    const balance = Number(document.getElementById('asset-entry-balance').value);
    const note    = (document.getElementById('asset-entry-note').value || '').trim();
    if (!date)           { alert('日付を入力してください'); return; }
    if (isNaN(balance) || balance < 0) { alert('残高を正しく入力してください'); return; }
    addAssetEntry(_entryTargetAssetId, { date, balance, note });
    hideModal('asset-entry-modal');
    navigate('assets');
  });
}

// ============================================================
// 貯蓄目標管理（v5.31）
// ============================================================
let _editingGoalId = null;
let _depositTargetGoalId = null;

function renderGoals() {
  const goals = appData.goals || [];
  const active = goals.filter(g => !g.achievedAt);
  const achieved = goals.filter(g => g.achievedAt);
  const totalTarget = active.reduce((s, g) => s + (Number(g.targetAmount) || 0), 0);
  const totalSaved  = active.reduce((s, g) => s + (Number(g.savedAmount)  || 0), 0);
  const overallPct  = totalTarget > 0 ? Math.min(Math.round(totalSaved / totalTarget * 100), 100) : 0;

  // v5.32: SVGリング用定数
  const RING_C = 125.66; // 2π×20（メインリング r=20）

  function goalRingHtml(pct, isAchieved) {
    const dashOffset = RING_C * (1 - pct / 100);
    return `<svg class="goal-ring-svg" viewBox="0 0 52 52" aria-hidden="true">
      <circle class="goal-ring-bg" cx="26" cy="26" r="20"/>
      <circle class="goal-ring-fill" cx="26" cy="26" r="20"
        data-ring-offset="${dashOffset.toFixed(2)}"
        style="stroke:${isAchieved ? 'var(--success)' : 'var(--goal-accent)'}"/>
    </svg>`;
  }

  function goalCard(g, isDone, goalIdx = 0) {
    const target    = Number(g.targetAmount) || 0;
    const saved     = Number(g.savedAmount)  || 0;
    const pct       = target > 0 ? Math.min(Math.round(saved / target * 100), 100) : 0;
    const remaining = Math.max(target - saved, 0);
    const color     = g.color || 'var(--primary)';
    const emoji     = g.emoji || '🎯';
    const accentStyle = isDone
      ? `style="--goal-accent:var(--success)"`
      : `style="--goal-accent:${color};--goal-i:${goalIdx}"`;

    // マイルストーンマーカー（25/50/75%）
    const milestones = `<div class="goal-milestone" style="left:25%"></div><div class="goal-milestone" style="left:50%"></div><div class="goal-milestone" style="left:75%"></div>`;

    let deadlineHtml = '';
    if (g.deadline && !isDone) {
      const [dy, dm] = g.deadline.split('-');
      const now = new Date();
      const dlDate = new Date(Number(dy), Number(dm) - 1, 1);
      const monthsLeft = (dlDate.getFullYear() - now.getFullYear()) * 12 + (dlDate.getMonth() - now.getMonth());
      if (monthsLeft > 0 && remaining > 0) {
        const monthly = Math.ceil(remaining / monthsLeft);
        deadlineHtml = `<div class="goal-deadline">
          <span class="goal-deadline-label">📅 ${dy}年${Number(dm)}月まで (残り${monthsLeft}ヶ月)</span>
          <span class="goal-monthly-target">月々 ${formatMoney(monthly)} で達成！</span>
        </div>`;
      } else if (monthsLeft <= 0) {
        deadlineHtml = `<div class="goal-deadline over">⚠️ 期限の ${dy}年${Number(dm)}月 を過ぎています</div>`;
      } else {
        deadlineHtml = `<div class="goal-deadline"><span class="goal-deadline-label">📅 ${dy}年${Number(dm)}月まで (残り${monthsLeft}ヶ月)</span></div>`;
      }
    }

    if (isDone) {
      return `<div class="card goal-card goal-achieved" ${accentStyle}>
  <div class="goal-card-header">
    <div class="goal-info">
      <div class="goal-ring-wrap">${goalRingHtml(100, true)}<span class="goal-emoji">${emoji}</span></div>
      <span class="goal-name">${esc2(g.name)}</span>
      <span class="goal-achieved-badge">✅ 達成</span>
    </div>
    <div class="goal-actions">
      <button class="btn-icon goal-reopen" data-id="${g.id}" title="再開">🔄</button>
      <button class="btn-icon goal-delete" data-id="${g.id}" title="削除">🗑️</button>
    </div>
  </div>
  <div class="goal-progress-wrap">
    <div class="goal-progress-bar-bg"><div class="goal-progress-bar-fill" style="width:100%;background:var(--success)"></div>${milestones}</div>
    <span class="goal-pct" style="color:var(--success)">100%</span>
  </div>
  <div class="goal-amounts">
    <span class="goal-saved">${formatMoney(saved)}</span><span class="goal-sep"> 達成 / </span><span class="goal-target">${formatMoney(target)}</span><span class="goal-sep"> 目標</span>
  </div>
  <div class="goal-achieved-date">🎉 達成日: ${formatDateLong(g.achievedAt)}</div>
  ${g.note ? `<div class="goal-note">${esc2(g.note)}</div>` : ''}
</div>`;
    }
    return `<div class="card goal-card" ${accentStyle}>
  <div class="goal-card-header">
    <div class="goal-info">
      <div class="goal-ring-wrap">${goalRingHtml(pct, false)}<span class="goal-emoji">${emoji}</span></div>
      <span class="goal-name">${esc2(g.name)}</span>
    </div>
    <div class="goal-actions">
      <button class="btn-icon goal-edit" data-id="${g.id}" title="編集">✏️</button>
      <button class="btn-icon goal-delete" data-id="${g.id}" title="削除">🗑️</button>
    </div>
  </div>
  <div class="goal-progress-wrap">
    <div class="goal-progress-bar-bg"><div class="goal-progress-bar-fill" style="width:${pct}%"></div>${milestones}</div>
    <span class="goal-pct">${pct}%</span>
  </div>
  <div class="goal-amounts">
    <span class="goal-saved">${formatMoney(saved)}</span><span class="goal-sep"> 貯まった / </span><span class="goal-target">${formatMoney(target)}</span><span class="goal-sep"> 目標</span>
  </div>
  <div class="goal-remaining${remaining === 0 ? ' goal-done-hint' : ''}">
    ${remaining === 0 ? '🎉 目標額に達しました！達成済みにしましょう' : `残り ${formatMoney(remaining)}`}
  </div>
  ${deadlineHtml}
  ${g.note ? `<div class="goal-note">${esc2(g.note)}</div>` : ''}
  <div class="goal-card-footer">
    <button class="btn btn-sm goal-deposit" data-id="${g.id}">💰 積立を追加</button>
    <button class="btn btn-sm goal-achieve" data-id="${g.id}">✅ 達成済みにする</button>
  </div>
</div>`;
  }

  const activeCards   = active.map((g, i) => goalCard(g, false, i)).join('');
  const achievedCards = achieved.length > 0 ? `
<details class="goal-achieved-section">
  <summary class="goal-achieved-summary">🏆 達成済み（${achieved.length}件）</summary>
  <div class="goal-achieved-list">${achieved.map(g => goalCard(g, true)).join('')}</div>
</details>` : '';

  const emptyState = goals.length === 0 ? `
<div class="empty-goal-state">
  <div class="empty-goal-icon">🎯</div>
  <div class="empty-goal-msg">貯蓄目標がまだありません</div>
  <div class="empty-goal-sub">旅行・車・家電など、目標を設定して<br>モチベーションを高めましょう！</div>
</div>` : '';

  const summarySection = active.length > 0 ? `
<div class="summary-cards">
  <div class="card summary-card">
    <div class="summary-label">🎯 進行中の目標</div>
    <div class="summary-amount">${active.length}件</div>
  </div>
  <div class="card summary-card income">
    <div class="summary-label">合計積立額</div>
    <div class="summary-amount js-countup" data-value="${totalSaved}">${formatMoney(totalSaved)}</div>
  </div>
  <div class="card summary-card ${overallPct >= 100 ? 'positive' : 'balance'}">
    <div class="summary-label">総合達成率</div>
    <div class="summary-amount">${overallPct}%</div>
  </div>
</div>` : '';

  return `
<div class="page-header">
  <h1 class="page-title">🎯 貯蓄目標</h1>
  <button class="btn btn-primary" id="btn-add-goal">＋ 目標を追加</button>
</div>

${summarySection}
${emptyState}
${activeCards}
${achievedCards}

<!-- 目標追加/編集モーダル -->
<div class="modal-overlay" id="goal-modal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3 class="modal-title" id="goal-modal-title">目標を追加</h3>
      <button class="modal-close" id="goal-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">絵文字</label>
        <div class="goal-emoji-picker" id="goal-emoji-picker">
          ${GOAL_EMOJIS.map(e => `<button type="button" class="goal-emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
        </div>
        <input type="hidden" id="goal-emoji-val" value="🎯">
      </div>
      <div class="form-group">
        <label class="form-label">目標名 <span class="required">*</span></label>
        <input type="text" id="goal-name" class="form-input" placeholder="例：夏の家族旅行" maxlength="30">
      </div>
      <div class="form-group">
        <label class="form-label">目標金額 <span class="required">*</span></label>
        <input type="number" id="goal-target" class="form-input" placeholder="200000" min="1" step="1">
      </div>
      <div class="form-group">
        <label class="form-label">現在の積立額</label>
        <input type="number" id="goal-saved" class="form-input" placeholder="0" min="0" step="1">
      </div>
      <div class="form-group">
        <label class="form-label">期限（任意）</label>
        <input type="month" id="goal-deadline" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">カラー</label>
        <div class="goal-color-picker" id="goal-color-picker">
          ${GOAL_COLORS.map(c => `<button type="button" class="goal-color-btn" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div>
        <input type="hidden" id="goal-color-val" value="#6366f1">
      </div>
      <div class="form-group">
        <label class="form-label">メモ（任意）</label>
        <input type="text" id="goal-note" class="form-input" placeholder="例：ハワイ旅行の費用" maxlength="50">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="goal-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="goal-modal-save">保存</button>
    </div>
  </div>
</div>

<!-- 積立追加モーダル -->
<div class="modal-overlay" id="goal-deposit-modal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3 class="modal-title" id="goal-deposit-title">積立を追加</h3>
      <button class="modal-close" id="goal-deposit-close">✕</button>
    </div>
    <div class="modal-body">
      <p class="goal-deposit-current" id="goal-deposit-current"></p>
      <div class="form-group">
        <label class="form-label">追加する金額</label>
        <input type="number" id="goal-deposit-amount" class="form-input" placeholder="0" min="1" step="1">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="goal-deposit-cancel">キャンセル</button>
      <button class="btn btn-primary" id="goal-deposit-save">追加</button>
    </div>
  </div>
</div>`;
}

function openGoalModal(goalId) {
  _editingGoalId = goalId || null;
  const goal = goalId ? (appData.goals || []).find(g => g.id === goalId) : null;
  document.getElementById('goal-modal-title').textContent = goal ? '目標を編集' : '目標を追加';
  document.getElementById('goal-name').value     = goal ? goal.name : '';
  document.getElementById('goal-target').value   = goal ? goal.targetAmount : '';
  document.getElementById('goal-saved').value    = goal ? (goal.savedAmount || '') : '';
  document.getElementById('goal-deadline').value = goal ? (goal.deadline || '') : '';
  document.getElementById('goal-note').value     = goal ? (goal.note || '') : '';
  const emojiVal = goal ? (goal.emoji || '🎯') : '🎯';
  const colorVal = goal ? (goal.color || GOAL_COLORS[0]) : GOAL_COLORS[0];
  document.getElementById('goal-emoji-val').value = emojiVal;
  document.getElementById('goal-color-val').value = colorVal;

  document.querySelectorAll('.goal-emoji-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.emoji === emojiVal);
    btn.onclick = () => {
      document.querySelectorAll('.goal-emoji-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('goal-emoji-val').value = btn.dataset.emoji;
    };
  });
  document.querySelectorAll('.goal-color-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === colorVal);
    btn.onclick = () => {
      document.querySelectorAll('.goal-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('goal-color-val').value = btn.dataset.color;
    };
  });

  const close = () => hideModal('goal-modal');
  on('goal-modal-close',  'click', close);
  on('goal-modal-cancel', 'click', close);
  on('goal-modal-save',   'click', () => {
    const name        = document.getElementById('goal-name').value.trim();
    const targetAmount = Number(document.getElementById('goal-target').value);
    const savedAmount  = Number(document.getElementById('goal-saved').value) || 0;
    const deadline    = document.getElementById('goal-deadline').value;
    const note        = document.getElementById('goal-note').value.trim();
    const emoji       = document.getElementById('goal-emoji-val').value;
    const color       = document.getElementById('goal-color-val').value;
    if (!name)                { showToast('目標名を入力してください', 'error'); return; }
    if (!targetAmount || targetAmount <= 0) { showToast('目標金額を入力してください', 'error'); return; }
    const fields = { name, targetAmount, savedAmount, deadline, note, emoji, color };
    if (_editingGoalId) {
      updateGoal(_editingGoalId, fields);
      showToast('目標を更新しました', 'success');
    } else {
      addGoal(fields);
      showToast('目標を追加しました', 'success');
    }
    hideModal('goal-modal');
    renderCurrentPage();
  });
  showModal('goal-modal');
}

function openGoalDepositModal(goalId) {
  _depositTargetGoalId = goalId;
  const goal = (appData.goals || []).find(g => g.id === goalId);
  if (!goal) return;
  const current = Number(goal.savedAmount) || 0;
  const target  = Number(goal.targetAmount) || 0;
  document.getElementById('goal-deposit-title').textContent = `「${goal.name}」に積立`;
  document.getElementById('goal-deposit-current').textContent =
    `現在の積立額: ${formatMoney(current)} / ${formatMoney(target)}`;
  document.getElementById('goal-deposit-amount').value = '';

  const close = () => hideModal('goal-deposit-modal');
  on('goal-deposit-close',  'click', close);
  on('goal-deposit-cancel', 'click', close);
  on('goal-deposit-save',   'click', () => {
    const amount = Number(document.getElementById('goal-deposit-amount').value);
    if (!amount || amount <= 0) { showToast('金額を入力してください', 'error'); return; }
    const newSaved = current + amount;
    updateGoal(_depositTargetGoalId, { savedAmount: newSaved });
    hideModal('goal-deposit-modal');
    renderCurrentPage();
    if (newSaved >= target) {
      showToast(`🎉 目標「${goal.name}」達成！おめでとうございます！`, 'success', 5000);
    } else {
      showToast(`${formatMoney(amount)} 積立しました！`, 'success');
    }
  });
  showModal('goal-deposit-modal');
}

// v5.32: SVGリングプログレスアニメーション
function animateGoalRings() {
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-ring-offset]').forEach(el => {
      requestAnimationFrame(() => { el.style.strokeDashoffset = el.dataset.ringOffset; });
    });
  });
}

function bindGoals() {
  document.querySelectorAll('.js-countup').forEach(el => animateCountUp(el, Number(el.dataset.value)));
  animateGoalRings();

  on('btn-add-goal', 'click', () => openGoalModal(null));

  document.querySelectorAll('.goal-edit').forEach(btn =>
    btn.addEventListener('click', () => openGoalModal(btn.dataset.id)));

  document.querySelectorAll('.goal-delete').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!confirm('この目標を削除しますか？')) return;
      deleteGoal(btn.dataset.id);
      renderCurrentPage();
      showToast('目標を削除しました');
    }));

  document.querySelectorAll('.goal-deposit').forEach(btn =>
    btn.addEventListener('click', () => openGoalDepositModal(btn.dataset.id)));

  document.querySelectorAll('.goal-achieve').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!confirm('この目標を達成済みにしますか？')) return;
      updateGoal(btn.dataset.id, { achievedAt: todayStr() });
      renderCurrentPage();
      showToast('🎉 目標達成おめでとうございます！', 'success');
      triggerConfetti();
    }));

  document.querySelectorAll('.goal-reopen').forEach(btn =>
    btn.addEventListener('click', () => {
      updateGoal(btn.dataset.id, { achievedAt: null });
      renderCurrentPage();
      showToast('目標を再開しました');
    }));
}

// ============================================================
// カレンダービュー (v5.38)
// ============================================================
function renderCalendar() {
  const ym = appState.calendarMonth;
  const [year, month] = ym.split('-').map(Number);

  // その月の全取引
  const txs = getTransactionsByMonth(ym);
  const totalIncome  = calcTotal(txs, 'income');
  const totalExpense = calcTotal(txs, 'expense');
  const totalBalance = totalIncome - totalExpense;

  // v5.92: その月の収支予定イベントを取得
  const monthEvents = (appData.events || []).filter(e => e.month === ym);
  const plannedIncome  = monthEvents.filter(e => e.type==='income' ).reduce((s,e) => s + (Number(e.plannedAmount)||0), 0);
  const plannedExpense = monthEvents.filter(e => e.type==='expense').reduce((s,e) => s + (Number(e.plannedAmount)||0), 0);

  // 日別集計マップ
  const dayMap = {};
  txs.forEach(t => {
    if (!t.date) return;
    if (!dayMap[t.date]) dayMap[t.date] = { income: 0, expense: 0, txs: [] };
    dayMap[t.date][t.type] = (dayMap[t.date][t.type] || 0) + (Number(t.amount) || 0);
    dayMap[t.date].txs.push(t);
  });

  // ヒートマップ: 最大支出
  const maxExpense = Math.max(1, ...Object.values(dayMap).map(d => d.expense || 0));

  // カレンダーグリッド
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);
  const startDow = firstDay.getDay(); // 0=日
  const totalDays = lastDay.getDate();
  const today = todayStr();

  const DOW = ['日', '月', '火', '水', '木', '金', '土'];

  let cells = '';
  let colIdx = 0;
  let weekInc = 0;
  let weekExp = 0;

  // 週次サマリー行を追加
  function flushWeekRow() {
    const hasData = weekInc > 0 || weekExp > 0;
    cells += '<div class="cal-week-summary">' +
      (weekInc  > 0 ? `<span class="cal-ws-pill inc" style="--ws-i:0">+${formatMoney(weekInc)}</span>`  : '') +
      (weekExp  > 0 ? `<span class="cal-ws-pill exp" style="--ws-i:${weekInc > 0 ? 1 : 0}">-${formatMoney(weekExp)}</span>` : '') +
      (!hasData     ? '<span class="cal-ws-pill empty">—</span>' : '') +
      '</div>';
    colIdx = 0; weekInc = 0; weekExp = 0;
  }

  // 前月の空セル
  for (let i = 0; i < startDow; i++) {
    cells += '<div class="cal-cell cal-empty"></div>';
    colIdx++;
    if (colIdx === 7) flushWeekRow();
  }
  // 日付セル
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const data = dayMap[dateStr];
    const isToday = dateStr === today;
    const isSelected = appState.calendarDay === dateStr;
    const heat = data ? Math.min(4, Math.ceil((data.expense / maxExpense) * 4)) : 0;
    const dow = new Date(year, month - 1, d).getDay();
    const dowCls = dow === 0 ? 'sun' : dow === 6 ? 'sat' : '';

    let inner = `<div class="cal-date-num ${isToday ? 'today' : ''} ${dowCls}">${d}</div>`;
    if (data) {
      if (data.income  > 0) inner += `<div class="cal-amount inc">+${formatMoney(data.income)}</div>`;
      if (data.expense > 0) inner += `<div class="cal-amount exp">-${formatMoney(data.expense)}</div>`;
    }
    cells += `<div class="cal-cell${isSelected ? ' selected' : ''} heat-${heat}${dow === 6 ? ' cal-sat' : ''}" data-date="${dateStr}">${inner}</div>`;

    if (data) { weekInc += (data.income || 0); weekExp += (data.expense || 0); }
    colIdx++;

    if (colIdx === 7) {
      flushWeekRow();
    } else if (d === totalDays) {
      // 最終週の残りを空セルで埋める
      for (let p = colIdx; p < 7; p++) {
        cells += `<div class="cal-cell cal-empty${p === 6 ? ' cal-sat' : ''}"></div>`;
      }
      flushWeekRow();
    }
  }

  const monthName = `${year}年${month}月`;
  const balSign = totalBalance >= 0 ? '+' : '';
  const balCls  = totalBalance >= 0 ? 'income' : 'expense';

  // v5.92: 収支予定セクション
  const eventsSection = monthEvents.length > 0 ? `
    <div class="cal-events-section">
      <div class="cal-events-header">
        <span class="cal-events-title">📌 今月の収支予定 <span class="cal-ev-count">${monthEvents.length}</span></span>
        <button class="btn-link cal-ev-nav" onclick="navigate('events')">管理 →</button>
      </div>
      <div class="cal-events-list">
        ${monthEvents.map((ev, i) => {
          const cat = (appData.categories||[]).find(c => c.id === ev.categoryId);
          const isIncome = ev.type === 'income';
          return `<div class="cal-ev-item${ev.done ? ' cal-ev-done' : ''}" style="--cal-ev-color:${ev.color||'var(--primary)'};--cal-ev-i:${i}">
            <div class="cal-ev-icon" style="background:color-mix(in srgb,${ev.color||'var(--primary)'} 9%,transparent);color:${ev.color||'var(--primary)'}" aria-hidden="true">${ev.emoji||'📅'}</div>
            <div class="cal-ev-info">
              <div class="cal-ev-name">${esc2(ev.name)}</div>
              ${cat ? `<div class="cal-ev-cat" style="color:${cat.color}">${esc2(cat.name)}</div>` : ''}
            </div>
            <div class="cal-ev-right">
              <div class="cal-ev-amount ${isIncome ? 'inc' : 'exp'}">${isIncome ? '+' : '-'}${formatMoney(ev.plannedAmount||0)}</div>
              <div class="cal-ev-badge ${ev.done ? 'done' : 'pending'}">${ev.done ? '完了' : '未完了'}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      ${(plannedIncome > 0 || plannedExpense > 0) ? `
      <div class="cal-events-totals">
        ${plannedIncome  > 0 ? `<span class="cal-ev-total inc">計画収入 +${formatMoney(plannedIncome)}</span>` : ''}
        ${plannedExpense > 0 ? `<span class="cal-ev-total exp">計画支出 -${formatMoney(plannedExpense)}</span>` : ''}
      </div>` : ''}
    </div>` : '';

  return `
    <div class="cal-page">
      <div class="cal-header-row">
        <h1 class="page-title cal-title">${monthName}</h1>
        <div class="cal-nav-btns">
          <button class="btn btn-ghost cal-nav-btn" id="cal-prev" title="前月">&#8249;</button>
          <button class="btn btn-ghost cal-nav-btn" id="cal-today-btn">今月</button>
          <button class="btn btn-ghost cal-nav-btn" id="cal-next" title="翌月">&#8250;</button>
        </div>
      </div>

      <div class="cal-summary-row">
        <div class="cal-sum-item">
          <span class="cal-sum-label">収入</span>
          <span class="cal-sum-value income">+${formatMoney(totalIncome)}</span>
        </div>
        <div class="cal-sum-item">
          <span class="cal-sum-label">支出</span>
          <span class="cal-sum-value expense">-${formatMoney(totalExpense)}</span>
        </div>
        <div class="cal-sum-item">
          <span class="cal-sum-label">収支</span>
          <span class="cal-sum-value ${balCls}">${balSign}${formatMoney(totalBalance)}</span>
        </div>
      </div>

      <div class="cal-grid-wrap">
        <div class="cal-dow-row">
          ${DOW.map((d, i) => `<div class="cal-dow ${i===0?'sun':i===6?'sat':''}">${d}</div>`).join('')}
        </div>
        <div class="cal-grid" id="cal-grid">${cells}</div>
      </div>

      ${eventsSection}

      <div class="cal-day-panel" id="cal-day-panel"${appState.calendarDay ? '' : ' style="display:none"'}>
        <div class="cal-day-panel-header">
          <span class="cal-day-panel-title" id="cal-panel-title"></span>
          <button class="btn-icon cal-panel-close" id="cal-panel-close">✕</button>
        </div>
        <div class="cal-day-panel-body" id="cal-panel-body"></div>
        <div class="cal-day-panel-footer">
          <button class="btn btn-primary btn-sm" id="cal-add-tx">＋ この日に追加</button>
        </div>
      </div>
    </div>`;
}

function renderDayPanel(dateStr) {
  const panel = document.getElementById('cal-day-panel');
  const title = document.getElementById('cal-panel-title');
  const body  = document.getElementById('cal-panel-body');
  if (!panel || !dateStr) return;

  const [, m, d] = dateStr.split('-');
  title.textContent = `${parseInt(m)}月${parseInt(d)}日`;

  const txs = appData.transactions.filter(t => t.date === dateStr);

  if (txs.length === 0) {
    body.innerHTML = '<div class="cal-panel-empty">この日の取引はありません</div>';
  } else {
    body.innerHTML = txs.map((t, i) => {
      const cat = getCategoryById(t.categoryId);
      const mem = getMemberById(t.memberId);
      const isIncome = t.type === 'income';
      const dotColor = (cat && cat.color) ? cat.color : (isIncome ? 'var(--income)' : 'var(--expense)');
      return `
        <div class="cal-panel-tx" style="--cal-tx-i:${i}">
          <div class="cal-panel-dot" style="background:${dotColor}"></div>
          <div class="cal-panel-tx-info">
            <span class="cal-panel-cat">${cat ? esc2(cat.name) : '—'}</span>
            ${t.memo ? `<span class="cal-panel-memo">${esc2(t.memo)}</span>` : ''}
            ${mem  ? `<span class="cal-panel-mem">${esc2(mem.name)}</span>` : ''}
          </div>
          <span class="cal-panel-amt ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatMoney(t.amount)}</span>
        </div>`;
    }).join('');
  }

  panel.style.display = 'block';
  panel.classList.remove('cal-panel-animate');
  void panel.offsetWidth; // reflow to re-trigger animation
  panel.classList.add('cal-panel-animate');
  panel.addEventListener('animationend', () => panel.classList.remove('cal-panel-animate'), { once: true });
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function bindCalendar() {
  // 月ナビ
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    const [y, m] = appState.calendarMonth.split('-').map(Number);
    const nd = new Date(y, m - 2, 1);
    appState.calendarMonth = nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0');
    appState.calendarDay = null;
    navigate('calendar');
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    const [y, m] = appState.calendarMonth.split('-').map(Number);
    const nd = new Date(y, m, 1);
    appState.calendarMonth = nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0');
    appState.calendarDay = null;
    navigate('calendar');
  });
  document.getElementById('cal-today-btn')?.addEventListener('click', () => {
    appState.calendarMonth = currentYearMonth();
    appState.calendarDay = null;
    navigate('calendar');
  });

  // 日付セルクリック
  document.getElementById('cal-grid')?.addEventListener('click', e => {
    const cell = e.target.closest('.cal-cell[data-date]');
    if (!cell) return;
    const dateStr = cell.dataset.date;

    // 同じ日を再クリックで閉じる
    if (appState.calendarDay === dateStr) {
      appState.calendarDay = null;
      cell.classList.remove('selected');
      document.getElementById('cal-day-panel').style.display = 'none';
      return;
    }

    document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    appState.calendarDay = dateStr;
    renderDayPanel(dateStr);
  });

  // パネルを閉じる
  document.getElementById('cal-panel-close')?.addEventListener('click', () => {
    appState.calendarDay = null;
    document.getElementById('cal-day-panel').style.display = 'none';
    document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
  });

  // 選択日に追加
  document.getElementById('cal-add-tx')?.addEventListener('click', () => {
    const dateStr = appState.calendarDay;
    if (!dateStr) return;
    openTxModal(null, null);
    // モーダルが描画された後に日付を上書き
    setTimeout(() => {
      const di = document.getElementById('tx-date');
      if (di) di.value = dateStr;
    }, 30);
  });

  // 初期パネル表示
  if (appState.calendarDay) renderDayPanel(appState.calendarDay);
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
      <div id="sidebar-login-wrap">
        <button class="btn btn-primary btn-sm btn-full" id="sidebar-login-btn">ログイン / 登録</button>
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
// トースト通知
// ============================================================
function showToast(message, type, duration) {
  if (typeof type === 'number') { duration = type; type = null; }
  duration = duration || 3000;

  const existing = document.getElementById('kk-toast');
  if (existing) existing.remove();

  const typeMap = {
    success: { cls: 'kk-toast-success', icon: '✓' },
    error:   { cls: 'kk-toast-error',   icon: '✕' },
    warning: { cls: 'kk-toast-warning', icon: '!' },
  };
  const cfg = typeMap[type] || null;

  const toast = document.createElement('div');
  toast.id = 'kk-toast';
  toast.className = 'kk-toast' + (cfg ? ' ' + cfg.cls : '');
  toast.style.setProperty('--toast-dur', duration + 'ms');

  const iconEl = document.createElement('i');
  iconEl.className = 'kk-toast-icon';
  iconEl.textContent = cfg ? cfg.icon : '✦';

  const bodyEl = document.createElement('span');
  bodyEl.className = 'kk-toast-body';
  bodyEl.textContent = message;

  const progressEl = document.createElement('div');
  progressEl.className = 'kk-toast-progress';

  toast.appendChild(iconEl);
  toast.appendChild(bodyEl);
  toast.appendChild(progressEl);

  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('kk-toast-show')));
  setTimeout(() => {
    toast.classList.remove('kk-toast-show');
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
  }, duration);
}

// ============================================================
// 繰り返し取引の自動適用
// ============================================================
function applyRecurringTransactions(templateIds) {
  // templateIds が指定された場合はその IDs のみ、未指定は全未適用テンプレート
  const ym = currentYearMonth();
  const templates = (appData.templates || []).filter(tpl => {
    if (!tpl.isRecurring || !tpl.recurringDay) return false;
    if (tpl.lastApplied === ym) return false;
    if (templateIds && !templateIds.includes(tpl.id)) return false;
    return true;
  });
  let count = 0;

  templates.forEach(tpl => {
    const [year, month] = ym.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.min(tpl.recurringDay, lastDay);
    const date = `${ym}-${String(day).padStart(2, '0')}`;

    addTransaction({
      type:              tpl.type,
      date,
      amount:            tpl.amount,
      categoryId:        tpl.categoryId,
      paymentMethod:     tpl.paymentMethod,
      memberId:          tpl.memberId || appData.settings.defaultMemberId || '',
      taxRate:           tpl.taxRate || 0,
      memo:              tpl.memo || '',
      recurringTemplateId: tpl.id,
    });

    updateTemplate(tpl.id, { lastApplied: ym });
    count++;
  });

  if (count > 0) {
    setTimeout(() => showToast(`🔁 ${count}件の繰り返し取引を追加しました`), 400);
  }
  return count;
}

// 当月未適用の繰り返しテンプレートを返す
function getPendingRecurringTemplates() {
  const ym = currentYearMonth();
  const skipKey = `kk_rc_skip_${ym}`;
  const skipped = JSON.parse(localStorage.getItem(skipKey) || '[]');
  return (appData.templates || []).filter(tpl => {
    if (!tpl.isRecurring || !tpl.recurringDay) return false;
    if (tpl.lastApplied === ym) return false;
    if (skipped.includes(tpl.id)) return false;
    return true;
  });
}

// 繰り返し取引 確認モーダルの表示判定
function showRecurringConfirmIfNeeded() {
  if (!appData.transactions) return;
  const pending = getPendingRecurringTemplates();
  if (pending.length === 0) return;

  // チェックインモーダルが表示される場合はそれより後に表示
  const checkinDelay = (appData.transactions.length > 0) ? 3500 : 800;
  setTimeout(() => openRecurringConfirmModal(pending), checkinDelay);
}

function openRecurringConfirmModal(templates) {
  const modal = document.getElementById('rc-modal');
  if (!modal) return;

  const ym = currentYearMonth();
  const [y, m] = ym.split('-').map(Number);
  const monthLabel = `${y}年${m}月`;

  document.getElementById('rc-title').textContent = `${monthLabel}の繰り返し取引`;

  const body = document.getElementById('rc-body');
  body.innerHTML = templates.map((tpl, i) => {
    const cat = getCategoryById(tpl.categoryId);
    const catName = cat ? esc2(cat.name) : '不明';
    const catColor = cat ? cat.color : 'var(--text-muted)';
    const typeLabel = tpl.type === 'income' ? '収入' : '支出';
    const typeClass = tpl.type === 'income' ? 'rc-type-inc' : 'rc-type-exp';
    const day = tpl.recurringDay;
    return `<label class="rc-item" style="--rc-i:${i}">
  <input type="checkbox" class="rc-check" value="${tpl.id}" checked>
  <span class="rc-item-main">
    <span class="rc-cat-dot" style="background:${catColor}"></span>
    <span class="rc-item-info">
      <span class="rc-item-name">${esc2(tpl.name)}</span>
      <span class="rc-item-meta">${catName} · 毎月${day}日</span>
    </span>
  </span>
  <span class="rc-item-right">
    <span class="rc-type-badge ${typeClass}">${typeLabel}</span>
    <span class="rc-item-amount">${tpl.type === 'expense' ? '-' : '+'}${formatMoney(tpl.amount)}</span>
  </span>
</label>`;
  }).join('');

  // フッターボタン
  const okBtn = document.getElementById('rc-ok-btn');
  const skipBtn = document.getElementById('rc-skip-btn');
  const closeBtn = document.getElementById('rc-close-btn');

  const getCheckedIds = () =>
    [...body.querySelectorAll('.rc-check:checked')].map(el => el.value);

  // チェック状態に合わせてボタンラベル更新
  body.querySelectorAll('.rc-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = getCheckedIds().length;
      okBtn.textContent = n > 0 ? `${n}件を追加する` : '追加する（0件選択）';
      okBtn.disabled = n === 0;
    });
  });
  okBtn.textContent = `${templates.length}件を追加する`;
  okBtn.disabled = false;

  okBtn.onclick = () => {
    const ids = getCheckedIds();
    // 未チェックのものは「今月スキップ」扱い
    const allIds = templates.map(t => t.id);
    const unchecked = allIds.filter(id => !ids.includes(id));
    if (unchecked.length > 0) _markRecurringSkipped(unchecked);
    // チェック分を追加
    if (ids.length > 0) applyRecurringTransactions(ids);
    // 未選択もapplied扱いにして再表示防止
    allIds.forEach(id => {
      const tpl = (appData.templates || []).find(t => t.id === id);
      if (tpl && tpl.lastApplied !== ym) updateTemplate(id, { lastApplied: ym });
    });
    closeRecurringConfirmModal();
    if (appState.page === 'dashboard') { renderCurrentPage(); }
  };

  skipBtn.onclick = () => {
    _markRecurringSkipped(templates.map(t => t.id));
    closeRecurringConfirmModal();
  };

  closeBtn.onclick = skipBtn.onclick;

  showModal(modal);
  requestAnimationFrame(() => modal.classList.add('rc-modal-open'));
}

function closeRecurringConfirmModal() {
  const modal = document.getElementById('rc-modal');
  if (!modal) return;
  modal.classList.remove('rc-modal-open');
  hideModal(modal);
}

function _markRecurringSkipped(ids) {
  const ym = currentYearMonth();
  const skipKey = `kk_rc_skip_${ym}`;
  const existing = JSON.parse(localStorage.getItem(skipKey) || '[]');
  localStorage.setItem(skipKey, JSON.stringify([...new Set([...existing, ...ids])]));
}

// ============================================================
// 予算アラート（Notification API）
// ============================================================
const NOTIF_ENABLED_KEY = 'kakeibo_notif_enabled';
const NOTIF_SENT_PREFIX = 'kakeibo_notif_';

function isNotifEnabled() {
  return localStorage.getItem(NOTIF_ENABLED_KEY) !== 'false';
}
function setNotifEnabled(val) {
  localStorage.setItem(NOTIF_ENABLED_KEY, val ? 'true' : 'false');
}
function _notifSentKey(month, catId, level) {
  return `${NOTIF_SENT_PREFIX}${month}_${catId}_${level}`;
}
function _wasNotifSent(month, catId, level) {
  return !!localStorage.getItem(_notifSentKey(month, catId, level));
}
function _markNotifSent(month, catId, level) {
  localStorage.setItem(_notifSentKey(month, catId, level), '1');
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

function sendBudgetNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'kakeibo-budget-alert',
    });
  } catch (e) {
    /* notification send failed – silent */
  }
}

function checkBudgetAlerts(month) {
  if (!isNotifEnabled()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const targetMonth = month || appState.month;
  const txs     = getTransactionsByMonth(targetMonth);
  const budgets = appData.budgets || {};
  appData.categories
    .filter(c => c.type === 'expense' && budgets[c.id] > 0)
    .forEach(c => {
      const budget = budgets[c.id];
      const spent  = txs
        .filter(t => t.categoryId === c.id && t.type === 'expense')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const pct = spent / budget * 100;
      if (spent > budget) {
        if (!_wasNotifSent(targetMonth, c.id, 'over')) {
          _markNotifSent(targetMonth, c.id, 'over');
          sendBudgetNotif(
            `⚠️ 予算超過: ${c.name}`,
            `今月の${c.name}が予算を超えました\n支出: ${formatMoney(spent)} / 予算: ${formatMoney(budget)}`
          );
        }
      } else if (pct >= 80) {
        if (!_wasNotifSent(targetMonth, c.id, 'warn')) {
          _markNotifSent(targetMonth, c.id, 'warn');
          sendBudgetNotif(
            `📊 予算注意: ${c.name}`,
            `今月の${c.name}が予算の${Math.round(pct)}%に達しました\n支出: ${formatMoney(spent)} / 予算: ${formatMoney(budget)}`
          );
        }
      }
    });
}

// v5.98: 予算アラートトースト（in-app、通知権限不要）
function checkBudgetToast(categoryId, month) {
  const budgets = appData.budgets || {};
  const budget = budgets[categoryId] || 0;
  if (!budget) return;
  const targetMonth = month || appState.month;
  const cat = (appData.categories || []).find(c => c.id === categoryId);
  if (!cat || cat.type !== 'expense') return;
  const txs = getTransactionsByMonth(targetMonth);
  const spent = txs
    .filter(t => t.categoryId === categoryId && t.type === 'expense')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const pct = spent / budget * 100;
  if (spent > budget) {
    const over = spent - budget;
    showToast(`⚠️ ${cat.name} 予算超過 +${formatMoney(over)}`, 'error', 5000);
  } else if (pct >= 80) {
    showToast(`📊 ${cat.name} 予算の${Math.round(pct)}%に達しました`, 'warning', 4000);
  }
}

// ============================================================
// コンフェッティアニメーション (v8.3)
// ============================================================
function triggerConfetti() {
  const existing = document.getElementById('confetti-canvas');
  if (existing) existing.remove();

  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:100%', 'height:100%',
    'pointer-events:none', 'z-index:9999',
  ].join(';');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx    = canvas.getContext('2d');
  const colors = ['#7c3aed','#059669','#f59e0b','#e11d48','#3b82f6','#ec4899','#10b981','#f97316','#fbbf24','#a78bfa'];
  const shapes = ['rect', 'circle', 'strip'];

  const particles = Array.from({ length: 140 }, () => ({
    x:             Math.random() * canvas.width,
    y:             -10 - Math.random() * canvas.height * 0.4,
    w:             5 + Math.random() * 9,
    h:             8 + Math.random() * 8,
    color:         colors[Math.floor(Math.random() * colors.length)],
    shape:         shapes[Math.floor(Math.random() * shapes.length)],
    rotation:      Math.random() * Math.PI * 2,
    rotSpeed:      (Math.random() - 0.5) * 0.25,
    vx:            (Math.random() - 0.5) * 4,
    vy:            1.5 + Math.random() * 3.5,
    alpha:         1,
    wobble:        Math.random() * Math.PI * 2,
    wobbleSpeed:   0.05 + Math.random() * 0.05,
  }));

  let startTime = null;
  const duration = 3200;

  function draw(now) {
    if (!startTime) startTime = now;
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = false;
    for (const p of particles) {
      p.vy       += 0.07;
      p.wobble   += p.wobbleSpeed;
      p.x        += p.vx + Math.sin(p.wobble) * 0.8;
      p.y        += p.vy;
      p.rotation += p.rotSpeed;
      if (elapsed > duration * 0.55) p.alpha -= 0.018;

      if (p.y < canvas.height + 30 && p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'strip') {
          ctx.fillRect(-p.w * 0.25, -p.h * 0.5, p.w * 0.5, p.h);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
    }

    if (alive && elapsed < duration + 1500) {
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(draw);
}

// ============================================================
// アプリ初期化
// ============================================================
// サイドバーアラートバッジ (v6.7)
// ============================================================
function calcNavBadges() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ym = currentYearMonth();
  const [y, m] = ym.split('-').map(Number);
  const nextYm = m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, '0')}`;

  const badges = {};

  // サブスク管理：アクティブで7日以内に請求
  const subs = getSubscriptions().filter(s => s.isActive !== false);
  badges.subscriptions = subs.filter(s => subDaysUntilBilling(s) <= 7).length;

  // ポイント管理：30日以内に期限切れ
  badges.points = (appData.points || []).filter(p => {
    if (!p.expiryDate) return false;
    const diff = Math.round((new Date(p.expiryDate) - today) / 86400000);
    return diff >= 0 && diff <= 30;
  }).length;

  // カテゴリ：今月予算超過
  const budgets = appData.budgets || {};
  const txs = getTransactionsByMonth(ym);
  badges.categories = appData.categories.filter(c => {
    const budget = budgets[c.id];
    if (!budget || budget <= 0 || c.type !== 'expense') return false;
    const spent = txs.filter(t => t.categoryId === c.id && t.type === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return spent > budget;
  }).length;

  // 収支予定：今月・来月の未完了
  badges.events = (appData.events || []).filter(e =>
    !e.done && (e.month === ym || e.month === nextYm)
  ).length;

  // 貯蓄目標：達成間近（90%以上・未達成）
  badges.goals = (appData.goals || []).filter(g => {
    if (g.achievedAt) return false;
    const tgt = Number(g.targetAmount) || 0;
    const svd = Number(g.savedAmount) || 0;
    return tgt > 0 && svd / tgt >= 0.9;
  }).length;

  return badges;
}

function updateNavBadges() {
  const badges = calcNavBadges();

  // サイドバー nav-item バッジ更新（既存）
  function applyBadge(el, count, badgeClass) {
    let badge = el.querySelector('.' + badgeClass);
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = badgeClass;
        el.appendChild(badge);
      }
      const prev = badge.textContent;
      const next = count > 99 ? '99+' : String(count);
      if (prev !== next) {
        badge.textContent = next;
        badge.classList.remove('nav-badge-pop');
        requestAnimationFrame(() => badge.classList.add('nav-badge-pop'));
        badge.addEventListener('animationend', () => badge.classList.remove('nav-badge-pop'), { once: true });
      }
    } else if (badge) {
      badge.remove();
    }
  }

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    applyBadge(el, badges[el.dataset.page] || 0, 'nav-badge');
  });

  // v8.5: ボトムナビ bottom-nav-item バッジ更新（バグ修正）
  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(el => {
    applyBadge(el, badges[el.dataset.page] || 0, 'bottom-nav-badge');
  });

  // ベルバッジ更新 (v6.8)
  updateBellBadge();
}

// ============================================================
// 通知センター (v6.8)
// ============================================================
const NOTIF_READ_KEY = 'kk_notif_read_v1';

function getNotifReadSet() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || '[]')); }
  catch(e) { return new Set(); }
}

function saveNotifReadSet(set) {
  localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...set]));
}

// 通知アイテム一覧を生成
function buildNotifications() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ym = currentYearMonth();
  const [y, m] = ym.split('-').map(Number);
  const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const items = [];

  // ── 予算超過 ──
  const budgets = appData.budgets || {};
  const txs = getTransactionsByMonth(ym);
  appData.categories.filter(c => c.type === 'expense').forEach(c => {
    const budget = budgets[c.id];
    if (!budget || budget <= 0) return;
    const spent = txs.filter(t => t.categoryId === c.id && t.type === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    if (spent <= budget) return;
    const over = spent - budget;
    items.push({
      id: `budget-over-${c.id}-${ym}`,
      type: 'danger',
      icon: '⚠️',
      title: `予算超過: ${c.name}`,
      body: `¥${over.toLocaleString('ja-JP')} オーバー（今月）`,
      page: 'categories',
    });
  });

  // ── 予算80%警告 ──
  appData.categories.filter(c => c.type === 'expense').forEach(c => {
    const budget = budgets[c.id];
    if (!budget || budget <= 0) return;
    const spent = txs.filter(t => t.categoryId === c.id && t.type === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const pct = spent / budget;
    if (pct < 0.8 || spent > budget) return;
    items.push({
      id: `budget-warn-${c.id}-${ym}`,
      type: 'warning',
      icon: '📊',
      title: `予算${Math.round(pct * 100)}%: ${c.name}`,
      body: `¥${spent.toLocaleString('ja-JP')} / ¥${budget.toLocaleString('ja-JP')}`,
      page: 'categories',
    });
  });

  // ── サブスク請求間近 ──
  const subs = getSubscriptions().filter(s => s.isActive !== false);
  subs.forEach(s => {
    const days = subDaysUntilBilling(s);
    if (days < 0 || days > 7) return;
    const urgency = days <= 2 ? 'danger' : days <= 4 ? 'warning' : 'info';
    const daysLabel = days === 0 ? '今日' : days === 1 ? '明日' : `${days}日後`;
    items.push({
      id: `sub-billing-${s.id}-${today.toISOString().slice(0,7)}`,
      type: urgency,
      icon: s.emoji || '📱',
      title: `${s.name} 請求 ${daysLabel}`,
      body: `¥${Number(s.amount || 0).toLocaleString('ja-JP')} ${s.cycle === 'yearly' ? '(年払)' : '(月払)'}`,
      page: 'subscriptions',
    });
  });

  // ── ポイント期限 ──
  (appData.points || []).forEach(p => {
    if (!p.expiryDate) return;
    const diff = Math.round((new Date(p.expiryDate) - today) / 86400000);
    if (diff < 0 || diff > 30) return;
    const urgency = diff <= 7 ? 'danger' : 'warning';
    const daysLabel = diff === 0 ? '今日期限' : diff === 1 ? '明日期限' : `${diff}日後期限`;
    items.push({
      id: `point-expire-${p.id}-${today.toISOString().slice(0,7)}`,
      type: urgency,
      icon: p.emoji || '🎫',
      title: `${p.name} ${daysLabel}`,
      body: `残${Number(p.balance || 0).toLocaleString('ja-JP')}pt（¥${Math.round(Number(p.balance||0) * Number(p.rateJpy||1)).toLocaleString('ja-JP')}相当）`,
      page: 'points',
    });
  });

  // ── 収支予定（今月・来月の未完了） ──
  (appData.events || []).filter(e => !e.done && (e.month === ym || e.month === nextYm)).forEach(e => {
    const isThisMonth = e.month === ym;
    items.push({
      id: `event-${e.id}-${e.month}`,
      type: isThisMonth ? 'warning' : 'info',
      icon: e.emoji || '📌',
      title: `${e.name}（${isThisMonth ? '今月' : '来月'}）`,
      body: `${e.type === 'income' ? '収入' : '支出'} ¥${Number(e.amount || 0).toLocaleString('ja-JP')}`,
      page: 'events',
    });
  });

  // ── 貯蓄目標 達成間近 ──
  (appData.goals || []).filter(g => !g.achievedAt).forEach(g => {
    const tgt = Number(g.targetAmount) || 0;
    const svd = Number(g.savedAmount) || 0;
    if (tgt <= 0 || svd / tgt < 0.9) return;
    items.push({
      id: `goal-near-${g.id}`,
      type: 'success',
      icon: g.emoji || '🎯',
      title: `目標達成間近: ${g.name}`,
      body: `${Math.round(svd / tgt * 100)}% 達成 (¥${svd.toLocaleString('ja-JP')} / ¥${tgt.toLocaleString('ja-JP')})`,
      page: 'goals',
    });
  });

  return items;
}

function renderNotifPanel() {
  const items = buildNotifications();
  const readSet = getNotifReadSet();
  const body = document.getElementById('notif-panel-body');
  if (!body) return;

  // フッターに最終チェック時刻を表示
  const footer = document.getElementById('notif-panel-footer');
  if (footer) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    footer.textContent = `最終確認: ${timeStr}`;
  }

  if (items.length === 0) {
    body.innerHTML = `
      <div class="notif-empty">
        <span class="notif-empty-icon" aria-hidden="true">✅</span>
        <p>新しい通知はありません</p>
        <span class="notif-empty-sub">すべての項目が問題ありません</span>
      </div>`;
    return;
  }

  // グループ別ラベル
  const typeOrder = ['danger', 'warning', 'success', 'info'];
  const typeLabel = { danger: '要注意', warning: '注意', success: '達成間近', info: 'お知らせ' };
  const grouped = {};
  items.forEach(it => {
    if (!grouped[it.type]) grouped[it.type] = [];
    grouped[it.type].push(it);
  });

  let html = '';
  typeOrder.forEach(t => {
    const group = grouped[t];
    if (!group || group.length === 0) return;
    html += `<div class="notif-group-label notif-type-${t}">${typeLabel[t]}</div>`;
    group.forEach((it, i) => {
      const isRead = readSet.has(it.id);
      html += `
        <button class="notif-item notif-type-${it.type}${isRead ? ' notif-read' : ''}" data-notif-id="${esc2(it.id)}" data-notif-page="${esc2(it.page)}" style="--ni:${i}" aria-label="${esc2(it.title)}">
          <span class="notif-item-icon" aria-hidden="true">${it.icon}</span>
          <span class="notif-item-text">
            <span class="notif-item-title">${esc2(it.title)}</span>
            <span class="notif-item-body">${esc2(it.body)}</span>
          </span>
          ${!isRead ? '<span class="notif-unread-dot" aria-hidden="true"></span>' : ''}
        </button>`;
    });
  });
  body.innerHTML = html;

  // クリックイベント
  body.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.notifId;
      const page = el.dataset.notifPage;
      const rs = getNotifReadSet();
      rs.add(id);
      saveNotifReadSet(rs);
      closeNotifPanel();
      navigate(page);
    });
  });
}

function updateBellBadge() {
  const items = buildNotifications();
  const readSet = getNotifReadSet();
  const unread = items.filter(it => !readSet.has(it.id)).length;
  const badge = document.getElementById('notif-bell-badge');
  const bellBtn = document.getElementById('notif-bell-btn');
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = '';
    badge.classList.remove('notif-badge-pop');
    requestAnimationFrame(() => badge.classList.add('notif-badge-pop'));
    badge.addEventListener('animationend', () => badge.classList.remove('notif-badge-pop'), { once: true });
    if (bellBtn && !bellBtn.classList.contains('has-unread')) {
      bellBtn.classList.add('has-unread', 'notif-bell-ringing');
      bellBtn.addEventListener('animationend', () => bellBtn.classList.remove('notif-bell-ringing'), { once: true });
    } else if (bellBtn) {
      bellBtn.classList.add('has-unread');
    }
  } else {
    badge.style.display = 'none';
    if (bellBtn) bellBtn.classList.remove('has-unread', 'notif-bell-ringing');
  }
}

function openNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const overlay = document.getElementById('notif-overlay');
  const btn = document.getElementById('notif-bell-btn');
  if (!panel) return;
  renderNotifPanel();
  panel.style.display = 'block';
  overlay.style.display = 'block';
  if (btn) btn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => panel.classList.add('notif-panel-open'));
}

function closeNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const overlay = document.getElementById('notif-overlay');
  const btn = document.getElementById('notif-bell-btn');
  if (!panel) return;
  panel.classList.remove('notif-panel-open');
  setTimeout(() => {
    panel.style.display = 'none';
    overlay.style.display = 'none';
  }, 220);
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function initNotifCenter() {
  const bell = document.getElementById('notif-bell-btn');
  const markRead = document.getElementById('notif-mark-read-btn');
  const overlay = document.getElementById('notif-overlay');

  if (bell) {
    bell.addEventListener('click', e => {
      e.stopPropagation();
      const panel = document.getElementById('notif-panel');
      if (panel && panel.classList.contains('notif-panel-open')) {
        closeNotifPanel();
      } else {
        openNotifPanel();
      }
    });
  }

  if (markRead) {
    markRead.addEventListener('click', () => {
      const items = buildNotifications();
      const rs = getNotifReadSet();
      items.forEach(it => rs.add(it.id));
      saveNotifReadSet(rs);
      renderNotifPanel();
      updateBellBadge();
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeNotifPanel);
  }

  // パネル外クリックで閉じる
  document.addEventListener('click', e => {
    const panel = document.getElementById('notif-panel');
    if (panel && panel.classList.contains('notif-panel-open')) {
      if (!panel.contains(e.target) && e.target.id !== 'notif-bell-btn' && !e.target.closest('#notif-bell-btn')) {
        closeNotifPanel();
      }
    }
  });
}

// ============================================================
// ── キーボードショートカット (v7.9) ──────────────────────────
function initKeyboardShortcuts() {
  let gPending = false;
  let gTimer = null;
  const gHint = document.getElementById('kb-g-hint');

  function clearG() {
    gPending = false;
    clearTimeout(gTimer);
    if (gHint) gHint.classList.remove('visible');
  }

  function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function openModal() {
    return document.querySelector('.modal-overlay.modal-is-open');
  }

  document.addEventListener('keydown', e => {
    // テキスト入力中は ESC のみ受け付ける
    if (isTyping()) {
      if (e.key === 'Escape') {
        clearG();
        const m = openModal();
        if (m) { hideModal(m); e.preventDefault(); }
      }
      return;
    }

    // Gシーケンス中の2文字目
    if (gPending) {
      clearG();
      const map = { d:'dashboard', t:'transactions', r:'reports', c:'calendar', s:'settings', a:'assets' };
      const page = map[e.key.toLowerCase()];
      if (page) { navigate(page); e.preventDefault(); }
      return;
    }

    switch (e.key) {
      case 'g':
      case 'G':
        if (openModal()) return;
        gPending = true;
        if (gHint) gHint.classList.add('visible');
        gTimer = setTimeout(clearG, 1500);
        e.preventDefault();
        break;

      case 'n':
      case 'N':
        if (openModal()) return;
        openTxModal(null);
        e.preventDefault();
        break;

      case '/':
        if (openModal()) return;
        e.preventDefault();
        if (appState.page !== 'transactions') {
          navigate('transactions');
          setTimeout(() => {
            const el = document.getElementById('filter-search');
            if (el) { el.focus(); el.select(); }
          }, 120);
        } else {
          const el = document.getElementById('filter-search');
          if (el) { el.focus(); el.select(); }
        }
        break;

      case '?':
        if (openModal()) return;
        showKbHelp();
        e.preventDefault();
        break;

      case 'Escape':
        clearG();
        const m = openModal();
        if (m) { hideModal(m); e.preventDefault(); }
        break;
    }
  });

  document.getElementById('kb-help-close')?.addEventListener('click', hideKbHelp);
  document.getElementById('kb-help-modal')?.addEventListener('click', e => {
    if (e.target.id === 'kb-help-modal') hideKbHelp();
  });
}

function showKbHelp() { showModal('kb-help-modal'); }
function hideKbHelp()  { hideModal('kb-help-modal'); }

function initApp() {
  // SVGアイコン初期化（emoji → SVG差し替え）
  if (typeof initNavIcons === 'function') initNavIcons();

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
    hamburger.addEventListener('click', e => {
      e.stopPropagation(); // documentのクリックハンドラが即座に閉じるのを防止
      const sidebar = document.getElementById('sidebar');
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  // サイドバー外クリックで閉じる（オーバーレイ含む）
  document.addEventListener('click', e => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !e.target.closest('#hamburger')) {
      closeSidebar();
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

  // グローバルFAB（どのページからでも取引追加）v8.5: パルスアニメーション追加
  const fab = document.getElementById('global-fab');
  if (fab) {
    fab.addEventListener('click', () => {
      fab.classList.remove('fab-pulsing');
      openTxModal(null);
    });
    // 初回起動時のみパルスで視線誘導（クリック or 3サイクル後に停止）
    const fabPulseKey = 'kk_fab_pulse_v1';
    if (!localStorage.getItem(fabPulseKey)) {
      fab.classList.add('fab-pulsing');
      setTimeout(() => {
        fab.classList.remove('fab-pulsing');
        localStorage.setItem(fabPulseKey, '1');
      }, 7000);
      fab.addEventListener('click', () => localStorage.setItem(fabPulseKey, '1'), { once: true });
    }
  }

  // リップルエフェクト（ボタン・ナビ）
  document.addEventListener('click', e => {
    const target = e.target.closest('.btn, .nav-item, .bottom-nav-item');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const wave = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    target.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove());
  });

  // 初期ページ描画
  navigate('dashboard');

  // クラウド同期初期化（非同期・描画後に実行）
  if (typeof initSync === 'function') initSync();

  // 繰り返し取引 確認モーダル（v7.7: 自動追加→確認モーダルへ変更）
  showRecurringConfirmIfNeeded();

  // 起動時予算アラートチェック（1秒後、描画安定後）
  setTimeout(() => checkBudgetAlerts(appState.month), 1000);

  // 月初チェックインモーダル（v6.6）
  showCheckinIfNeeded();

  // サイドバーアラートバッジ初期表示（v6.7）
  updateNavBadges();

  // 通知センター初期化（v6.8）
  initNotifCenter();

  // キーボードショートカット（v7.9）
  initKeyboardShortcuts();

  // 為替レート バックグラウンド自動更新（v8.1）
  autoRefreshFXRatesIfStale();

  // スワイプジェスチャー（v5.22）
  initSwipeGestures();

  // ピンチズーム無効化（PWAアプリ固定表示）
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
}

// ── 為替レート バックグラウンド自動更新（v8.1） ──────────
// 最終自動取得から24時間以上経過していたら静かにバックグラウンドで更新
async function autoRefreshFXRatesIfStale() {
  const STALE_MS = 24 * 60 * 60 * 1000; // 24時間
  const lastUpdated = getFXRatesUpdatedAt();
  const isStale = !lastUpdated || (Date.now() - new Date(lastUpdated).getTime() > STALE_MS);
  if (!isStale) return;
  try {
    await fetchAndSaveExchangeRates();
    // 資産ページが開いていれば再描画
    if (appState.page === 'assets') renderCurrentPage();
  } catch (_) {
    // サイレント失敗（設定ページで手動取得可能）
  }
}

// ── サイドバー開閉（オーバーレイ管理込み） ──────────────
function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  sidebar.classList.add('open');
  if (overlay) {
    overlay.classList.add('active');
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  sidebar.classList.remove('open');
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.remove('active'), 250);
  }
}

// ── スワイプジェスチャー（モバイルUX v5.22） ─────────────
function initSwipeGestures() {
  // サイドバーオーバーレイのタップで閉じる
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  let touchStartX = 0, touchStartY = 0, touchTarget = null;

  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchTarget = null;

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // 左端30px以内の右スワイプ → サイドバーを開く
    if (touchStartX <= 30 && !sidebar.classList.contains('open')) {
      touchTarget = 'open-sidebar';
    }
    // サイドバー内またはオーバーレイ上の左スワイプ → 閉じる
    else if (sidebar.classList.contains('open') &&
             (sidebar.contains(e.target) || e.target.id === 'sidebar-overlay')) {
      touchTarget = 'close-sidebar';
    }
    // モーダルのボトムシート（480px以下）を下スワイプ → 閉じる
    else {
      const modalOverlay = e.target.closest('.modal-overlay');
      if (modalOverlay && modalOverlay.classList.contains('modal-is-open')) {
        const modal = modalOverlay.querySelector('.modal');
        const modalTop = modal ? modal.getBoundingClientRect().top : Infinity;
        // ドラッグハンドルまたはモーダルの上端付近タッチ
        if (touchStartY <= modalTop + 40) {
          touchTarget = 'close-modal';
        }
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!touchTarget) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStartX;
    const dy = endY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // 水平スワイプ（横方向が縦の1.5倍以上、かつ40px以上）
    const isHSwipe = absDx >= 40 && absDx >= absDy * 1.5;
    // 下スワイプ（縦方向が横の1.5倍以上、かつ60px以上）
    const isDownSwipe = dy >= 60 && absDy >= absDx * 1.5;

    if (touchTarget === 'open-sidebar' && isHSwipe && dx > 0) {
      openSidebar();
      if (navigator.vibrate) navigator.vibrate(8);
    } else if (touchTarget === 'close-sidebar' && isHSwipe && dx < 0) {
      closeSidebar();
      if (navigator.vibrate) navigator.vibrate(8);
    } else if (touchTarget === 'close-modal' && isDownSwipe && window.innerWidth <= 480) {
      const openModal = document.querySelector('.modal-overlay.modal-is-open');
      if (openModal) hideModal(openModal);
    }

    touchTarget = null;
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', initApp);

// ============================================================
// サブスクリプション管理ページ (v5.43)
// ============================================================

function renderSubscriptions() {
  const subs = getSubscriptions();
  const active = subs.filter(s => s.isActive !== false);
  const inactive = subs.filter(s => s.isActive === false);
  const monthlyTotal = calcMonthlySubTotal();
  const yearlyTotal = monthlyTotal * 12;

  // カード生成 (v5.44: idx・プログレスバー追加)
  function subCard(s, idx) {
    const days = subDaysUntilBilling(s);
    const nextDate = subNextBillingDate(s);
    const urgentCls = s.isActive !== false && days <= 3 ? 'sub-urgent' :
                      s.isActive !== false && days <= 7 ? 'sub-soon' : '';
    const inactiveCls = s.isActive === false ? 'sub-inactive' : '';
    const monthlyAmt = subMonthlyAmount(s);
    // 請求サイクルプログレス計算
    const cycleDays = s.cycle === 'yearly' ? 365 : 30;
    const progress = s.isActive !== false
      ? Math.round(Math.max(0, Math.min(100, (cycleDays - days) / cycleDays * 100)))
      : 0;
    const progCls = days <= 3 ? 'prog-urgent' : days <= 7 ? 'prog-soon' : 'prog-normal';
    return `
<div class="sub-card ${urgentCls} ${inactiveCls}" data-id="${s.id}" style="--sub-i:${idx || 0};--sub-progress:${progress}%;--sub-accent:${s.color || 'var(--primary)'}">
  <div class="sub-card-color-bar" style="background:${s.color || 'var(--primary)'}"></div>
  <div class="sub-card-icon" style="background:color-mix(in srgb,${s.color||'var(--primary)'} 13%,transparent);color:${s.color||'var(--primary)'}">${s.emoji || '📱'}</div>
  <div class="sub-card-body">
    <div class="sub-card-name">${esc2(s.name)}</div>
    <div class="sub-card-meta">
      <span class="sub-cycle-tag">${s.cycle === 'yearly' ? '年払い' : '月払い'}</span>
      ${s.isActive !== false ? `<span class="sub-next-billing">${days === 0 ? '🔴 今日請求' : days <= 3 ? `🟠 ${days}日後` : `📅 ${days}日後（${nextDate.slice(5).replace('-','/')}）`}</span>` : '<span class="sub-paused-badge">⏸ 休止中</span>'}
    </div>
    ${s.memo ? `<div class="sub-card-memo">${esc2(s.memo)}</div>` : ''}
  </div>
  <div class="sub-card-right">
    <div class="sub-card-amount">${formatMoney(s.amount)}<span class="sub-cycle-unit">${s.cycle === 'yearly' ? '/年' : '/月'}</span></div>
    ${s.cycle === 'yearly' ? `<div class="sub-monthly-equiv">月換算 ${formatMoney(monthlyAmt)}</div>` : ''}
    <div class="sub-card-actions">
      <button class="btn-icon sub-toggle-btn" data-id="${s.id}" title="${s.isActive !== false ? '休止' : '再開'}">${s.isActive !== false ? '⏸' : '▶'}</button>
      <button class="btn-icon sub-edit-btn" data-id="${s.id}" title="編集">✏️</button>
      <button class="btn-icon sub-delete-btn" data-id="${s.id}" title="削除">🗑</button>
    </div>
  </div>
  ${s.isActive !== false ? `<div class="sub-card-progress"><div class="sub-card-progress-fill ${progCls}"></div></div>` : ''}
</div>`;
  }

  const activeCards = active.length > 0
    ? active.sort((a, b) => subDaysUntilBilling(a) - subDaysUntilBilling(b)).map((s, i) => subCard(s, i)).join('')
    : `<div class="sub-empty"><span class="sub-empty-icon">📱</span><p>サブスクリプションが登録されていません</p><button class="btn btn-primary" id="sub-empty-add-btn">＋ 追加する</button></div>`;

  const inactiveSection = inactive.length > 0 ? `
<details class="sub-inactive-section">
  <summary>休止中のサブスク（${inactive.length}件）</summary>
  <div class="sub-cards-list">${inactive.map((s, i) => subCard(s, i)).join('')}</div>
</details>` : '';

  return `
<div class="page-header">
  <h1 class="page-title">📱 サブスク管理</h1>
  <button class="btn btn-primary btn-sm" id="sub-add-btn">＋ 追加</button>
</div>

<div class="sub-summary-row">
  <div class="card sub-summary-card sub-monthly">
    <div class="sub-summary-label">月間合計</div>
    <div class="sub-summary-amount js-countup" data-value="${monthlyTotal}">${formatMoney(monthlyTotal)}</div>
    <div class="sub-summary-sub">${active.length}件のサブスク</div>
  </div>
  <div class="card sub-summary-card sub-yearly">
    <div class="sub-summary-label">年間換算</div>
    <div class="sub-summary-amount js-countup" data-value="${yearlyTotal}">${formatMoney(yearlyTotal)}</div>
    <div class="sub-summary-sub">月間 × 12ヶ月</div>
  </div>
</div>

<div class="sub-cards-list">${activeCards}</div>
${inactiveSection}

<!-- サブスク追加/編集モーダル -->
<div class="modal-overlay" id="sub-modal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h2 id="sub-modal-title">サブスクを追加</h2>
      <button class="modal-close" id="sub-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>サービス名 <span class="required">*</span></label>
        <input type="text" id="sub-name" class="form-input" placeholder="Netflix, Spotify など" maxlength="40">
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>絵文字アイコン</label>
          <div class="sub-emoji-grid" id="sub-emoji-grid">
            ${SUB_EMOJIS.map(e => `<button class="sub-emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
          </div>
          <input type="hidden" id="sub-emoji" value="📱">
        </div>
        <div class="form-group">
          <label>カラー</label>
          <div class="sub-color-grid" id="sub-color-grid">
            ${SUB_COLORS.map(c => `<button class="sub-color-btn" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          </div>
          <input type="hidden" id="sub-color" value="#6366f1">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>金額 <span class="required">*</span></label>
          <input type="number" id="sub-amount" class="form-input" placeholder="1490" min="1">
        </div>
        <div class="form-group">
          <label>支払いサイクル</label>
          <select id="sub-cycle" class="form-input">
            <option value="monthly">毎月</option>
            <option value="yearly">毎年</option>
          </select>
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>請求日（月の何日）</label>
          <select id="sub-billing-day" class="form-input">
            ${Array.from({length: 28}, (_, i) => `<option value="${i+1}">${i+1}日</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>カテゴリ</label>
          <select id="sub-category" class="form-input">
            <option value="">— 未設定 —</option>
            ${(appData.categories || []).filter(c => c.type === 'expense').map(c =>
              `<option value="${c.id}">${c.name}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>メモ</label>
        <input type="text" id="sub-memo" class="form-input" placeholder="プレミアムプラン など" maxlength="60">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="sub-modal-cancel">キャンセル</button>
        <button class="btn btn-primary" id="sub-modal-save">保存</button>
      </div>
    </div>
  </div>
</div>`;
}

function bindSubscriptions() {
  // 数値カウントアップ
  document.querySelectorAll('.js-countup').forEach(el => {
    animateCountUp(el, Number(el.dataset.value));
  });

  let editingSubId = null;

  const modal = document.getElementById('sub-modal');
  const modalTitle = document.getElementById('sub-modal-title');

  function openModal(sub) {
    editingSubId = sub ? sub.id : null;
    modalTitle.textContent = sub ? 'サブスクを編集' : 'サブスクを追加';
    document.getElementById('sub-name').value = sub ? sub.name : '';
    document.getElementById('sub-emoji').value = sub ? (sub.emoji || '📱') : '📱';
    document.getElementById('sub-color').value = sub ? (sub.color || '#6366f1') : '#6366f1';
    document.getElementById('sub-amount').value = sub ? sub.amount : '';
    document.getElementById('sub-cycle').value = sub ? (sub.cycle || 'monthly') : 'monthly';
    document.getElementById('sub-billing-day').value = sub ? (sub.billingDay || 1) : 1;
    document.getElementById('sub-category').value = sub ? (sub.categoryId || '') : '';
    document.getElementById('sub-memo').value = sub ? (sub.memo || '') : '';
    // emoji選択
    document.querySelectorAll('.sub-emoji-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.emoji === (sub ? (sub.emoji || '📱') : '📱'));
    });
    // color選択
    document.querySelectorAll('.sub-color-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.color === (sub ? (sub.color || '#6366f1') : '#6366f1'));
    });
    modal.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('modal-is-open')));
  }

  function closeModal() {
    modal.classList.remove('modal-is-open');
    setTimeout(() => { modal.style.display = 'none'; }, 250);
  }

  // 開く
  on('sub-add-btn', 'click', () => openModal(null));
  on('sub-empty-add-btn', 'click', () => openModal(null));
  on('sub-modal-close', 'click', closeModal);
  on('sub-modal-cancel', 'click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // 絵文字・カラー選択
  document.getElementById('sub-emoji-grid').addEventListener('click', e => {
    const btn = e.target.closest('.sub-emoji-btn');
    if (!btn) return;
    document.querySelectorAll('.sub-emoji-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('sub-emoji').value = btn.dataset.emoji;
  });
  document.getElementById('sub-color-grid').addEventListener('click', e => {
    const btn = e.target.closest('.sub-color-btn');
    if (!btn) return;
    document.querySelectorAll('.sub-color-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('sub-color').value = btn.dataset.color;
  });

  // 保存
  on('sub-modal-save', 'click', () => {
    const name = document.getElementById('sub-name').value.trim();
    const amount = parseInt(document.getElementById('sub-amount').value);
    if (!name) { showToast('サービス名を入力してください', 'warning'); return; }
    if (!amount || amount <= 0) { showToast('金額を正しく入力してください', 'warning'); return; }
    const fields = {
      name,
      emoji: document.getElementById('sub-emoji').value,
      color: document.getElementById('sub-color').value,
      amount,
      cycle: document.getElementById('sub-cycle').value,
      billingDay: parseInt(document.getElementById('sub-billing-day').value) || 1,
      categoryId: document.getElementById('sub-category').value,
      memo: document.getElementById('sub-memo').value.trim(),
      isActive: true,
    };
    if (editingSubId) {
      updateSubscription(editingSubId, fields);
      showToast('サブスクを更新しました', 'success');
    } else {
      addSubscription(fields);
      showToast('サブスクを追加しました', 'success');
    }
    closeModal();
    setTimeout(() => renderCurrentPage(), 280);
  });

  // 編集・削除・休止ボタン（イベント委譲）
  document.querySelector('.sub-cards-list') && document.querySelector('.sub-cards-list').addEventListener('click', e => {
    const editBtn = e.target.closest('.sub-edit-btn');
    const deleteBtn = e.target.closest('.sub-delete-btn');
    const toggleBtn = e.target.closest('.sub-toggle-btn');
    if (editBtn) {
      const sub = getSubscriptions().find(s => s.id === editBtn.dataset.id);
      if (sub) openModal(sub);
    } else if (deleteBtn) {
      if (!confirm('このサブスクを削除しますか？')) return;
      deleteSubscription(deleteBtn.dataset.id);
      showToast('削除しました');
      renderCurrentPage();
    } else if (toggleBtn) {
      const sub = getSubscriptions().find(s => s.id === toggleBtn.dataset.id);
      if (sub) {
        updateSubscription(sub.id, { isActive: sub.isActive === false ? true : false });
        showToast(sub.isActive === false ? 'サブスクを再開しました' : '休止しました', 'success');
        renderCurrentPage();
      }
    }
  });

  // 休止中セクションのボタンも同様に処理
  const inactiveSection = document.querySelector('.sub-inactive-section .sub-cards-list');
  if (inactiveSection) {
    inactiveSection.addEventListener('click', e => {
      const editBtn = e.target.closest('.sub-edit-btn');
      const deleteBtn = e.target.closest('.sub-delete-btn');
      const toggleBtn = e.target.closest('.sub-toggle-btn');
      if (editBtn) {
        const sub = getSubscriptions().find(s => s.id === editBtn.dataset.id);
        if (sub) openModal(sub);
      } else if (deleteBtn) {
        if (!confirm('このサブスクを削除しますか？')) return;
        deleteSubscription(deleteBtn.dataset.id);
        showToast('削除しました');
        renderCurrentPage();
      } else if (toggleBtn) {
        const sub = getSubscriptions().find(s => s.id === toggleBtn.dataset.id);
        if (sub) {
          updateSubscription(sub.id, { isActive: true });
          showToast('サブスクを再開しました', 'success');
          renderCurrentPage();
        }
      }
    });
  }
}

// ============================================================
// CSVインポートモーダル (v5.45)
// ============================================================
function openCSVImportModal() {
  let overlay = document.getElementById('csv-import-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'csv-import-modal';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="modal csv-imp-modal">
      <div class="modal-header">
        <h2>📥 CSVインポート</h2>
        <button class="modal-close" id="csv-imp-close">✕</button>
      </div>
      <div class="modal-body">
        <div id="csv-step1">
          <p class="hint">
            CSVファイルを選択してください。以下の形式を自動認識します。
          </p>
          <div class="csv-format-list">
            <div class="csv-format-item">
              <span class="csv-badge csv-badge-auto">自動</span>
              <span>アプリ独自形式（CSVダウンロードで出力したファイル）</span>
            </div>
            <div class="csv-format-item">
              <span class="csv-badge csv-badge-auto">自動</span>
              <span>カード明細（楽天・AMEX・JCB・三井住友など）</span>
            </div>
            <div class="csv-format-item">
              <span class="csv-badge csv-badge-manual">手動</span>
              <span>その他（銀行明細・他アプリ等、列マッピング指定）</span>
            </div>
          </div>
          <label class="btn btn-primary csv-file-label">
            📂 CSVファイルを選択
            <input type="file" id="csv-imp-file" accept=".csv,.tsv" style="display:none">
          </label>
        </div>
        <div id="csv-step2" style="display:none"></div>
      </div>
    </div>`;

  showModal(overlay);
  document.getElementById('csv-imp-close').addEventListener('click', () => hideModal(overlay));
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(overlay); });

  document.getElementById('csv-imp-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try { handleCSVFileContent(ev.target.result, overlay); }
      catch (err) { showToast('CSVの読み込みに失敗しました: ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'utf-8');
  });
}

function handleCSVFileContent(text, overlay) {
  const rows = parseCSVText(text);
  if (rows.length < 2) { showToast('データが見つかりません', 'warning'); return; }

  const step1 = document.getElementById('csv-step1');
  const step2 = document.getElementById('csv-step2');
  step1.style.display = 'none';
  step2.style.display = 'block';

  const headers  = rows[0];
  const dataRows = rows.slice(1);
  const total    = dataRows.length;

  function goBack() {
    step1.style.display = 'block';
    step2.style.display = 'none';
    step2.innerHTML = '';
  }

  if (isAppCSVFormat(headers)) {
    // --- アプリ独自形式 ---
    step2.innerHTML = `
      <div class="csv-detect-row">
        <span class="csv-badge csv-badge-auto">✓ アプリ独自形式を検出</span>
        <span class="hint">${total}件のデータが見つかりました</span>
      </div>
      ${buildCSVPreviewTable(headers, dataRows.slice(0, 5))}
      <div class="csv-actions">
        <button class="btn btn-ghost btn-sm" id="csv-back">← 戻る</button>
        <button class="btn btn-primary" id="csv-exec-app">📥 ${total}件をインポート</button>
      </div>`;

    document.getElementById('csv-back').addEventListener('click', goBack);
    document.getElementById('csv-exec-app').addEventListener('click', () => {
      const res = importFromAppCSV(rows);
      hideModal(overlay);
      showToast(`インポート完了：${res.added}件追加、${res.skipped}件スキップ`, res.added > 0 ? 'success' : 'warning');
      if (res.added > 0) renderCurrentPage();
    });

  } else if (typeof detectCardFormat === 'function' && detectCardFormat(headers)) {
    // --- カード明細形式 ---
    const card = detectCardFormat(headers);
    step2.innerHTML = `
      <div class="csv-detect-row">
        <span class="csv-badge csv-badge-auto">✓ ${esc2(card.name)}の明細を検出</span>
        <span class="hint">${total}件のデータが見つかりました</span>
      </div>
      <p class="hint">支払方法「クレカ」・消費税率10%で取り込みます。重複データは自動スキップされます。</p>
      ${buildCSVPreviewTable(headers, dataRows.slice(0, 5))}
      <div class="csv-actions">
        <button class="btn btn-ghost btn-sm" id="csv-back">← 戻る</button>
        <button class="btn btn-primary" id="csv-exec-card">💳 ${total}件をインポート</button>
      </div>`;

    document.getElementById('csv-back').addEventListener('click', goBack);
    document.getElementById('csv-exec-card').addEventListener('click', () => {
      const res = importFromCardCSV(rows, card);
      hideModal(overlay);
      showToast(`${card.name}インポート完了：${res.added}件追加、${res.skipped}件スキップ`, res.added > 0 ? 'success' : 'warning');
      if (res.added > 0) renderCurrentPage();
    });

  } else {
    // --- 列マッピング形式 ---
    const colOpts     = headers.map((h, i) => `<option value="${i}">${esc2(h) || `列${i + 1}`}</option>`).join('');
    const colOptsNone = `<option value="-1">（なし）</option>` + colOpts;

    step2.innerHTML = `
      <div class="csv-detect-row">
        <span class="csv-badge csv-badge-manual">⚙ 列マッピングを設定</span>
        <span class="hint">${total}件のデータが見つかりました</span>
      </div>
      <div class="csv-map-grid">
        <div class="csv-map-row">
          <label class="csv-map-label">日付列 <span class="req">*</span></label>
          <select id="cmap-date" class="csv-map-select">${colOpts}</select>
        </div>
        <div class="csv-map-row">
          <label class="csv-map-label">金額列 <span class="req">*</span></label>
          <select id="cmap-amount" class="csv-map-select">${colOpts}</select>
        </div>
        <div class="csv-map-row">
          <label class="csv-map-label">摘要列</label>
          <select id="cmap-memo" class="csv-map-select">${colOptsNone}</select>
        </div>
        <div class="csv-map-row">
          <label class="csv-map-label">種別</label>
          <select id="cmap-type-mode" class="csv-map-select">
            <option value="expense">すべて支出</option>
            <option value="income">すべて収入</option>
            <option value="column">列で判別</option>
          </select>
        </div>
        <div class="csv-map-row" id="cmap-typecol-row" style="display:none">
          <label class="csv-map-label">種別判別列</label>
          <select id="cmap-type-col" class="csv-map-select">${colOpts}</select>
        </div>
      </div>
      <p class="hint">※「収入」「入金」「IN」を含むセルを収入と判別します</p>
      ${buildCSVPreviewTable(headers, dataRows.slice(0, 5))}
      <div class="csv-actions">
        <button class="btn btn-ghost btn-sm" id="csv-back">← 戻る</button>
        <button class="btn btn-primary" id="csv-exec-mapped">📥 ${total}件をインポート</button>
      </div>`;

    document.getElementById('cmap-type-mode').addEventListener('change', e => {
      document.getElementById('cmap-typecol-row').style.display =
        e.target.value === 'column' ? 'flex' : 'none';
    });
    document.getElementById('csv-back').addEventListener('click', goBack);
    document.getElementById('csv-exec-mapped').addEventListener('click', () => {
      const mapping = {
        hasHeader: true,
        date:     parseInt(document.getElementById('cmap-date').value),
        amount:   parseInt(document.getElementById('cmap-amount').value),
        memo:     parseInt(document.getElementById('cmap-memo').value),
        typeMode: document.getElementById('cmap-type-mode').value,
        typeCol:  parseInt((document.getElementById('cmap-type-col') || { value: '0' }).value),
      };
      const res = importFromMappedCSV(rows, mapping);
      hideModal(overlay);
      showToast(`インポート完了：${res.added}件追加、${res.skipped}件スキップ`, res.added > 0 ? 'success' : 'warning');
      if (res.added > 0) renderCurrentPage();
    });
  }
}

function buildCSVPreviewTable(headers, rows) {
  const ths = headers.map(h => `<th>${esc2(h)}</th>`).join('');
  const trs = rows.map(row =>
    `<tr>${row.map(c => `<td>${esc2(c)}</td>`).join('')}</tr>`
  ).join('');
  return `
    <div class="csv-preview-section">
      <div class="csv-preview-label">プレビュー（先頭5行）</div>
      <div class="table-wrap csv-preview-wrap">
        <table class="tx-table csv-preview-table">
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================
// ポイント残高管理 (v5.47)
// ============================================================
function renderPoints() {
  const pts = getPoints();
  const totalValue = calcTotalPointsValue();
  const expiringSoon = pts.filter(p => {
    const d = pointDaysUntilExpiry(p);
    return d !== null && d <= 30 && (Number(p.balance) || 0) > 0;
  });

  function ptCard(p, idx) {
    const days = pointDaysUntilExpiry(p);
    const urgCls = days !== null && days <= 7 ? 'pt-urgent' : days !== null && days <= 30 ? 'pt-soon' : '';
    const yenVal = Math.round((Number(p.balance) || 0) * (Number(p.pointValue) || 1));
    const accent = p.color || 'var(--primary)';
    let expiryHtml = '';
    if (days !== null) {
      if (days < 0)      expiryHtml = `<span class="pt-exp-badge pt-exp-expired">期限切れ</span>`;
      else if (days === 0) expiryHtml = `<span class="pt-exp-badge pt-urgent-badge">今日期限</span>`;
      else if (days <= 7) expiryHtml = `<span class="pt-exp-badge pt-urgent-badge">🔴 ${days}日後期限</span>`;
      else if (days <= 30) expiryHtml = `<span class="pt-exp-badge pt-soon-badge">🟡 ${days}日後期限</span>`;
      else {
        const d = new Date(p.expiryDate);
        expiryHtml = `<span class="pt-exp-badge">${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} 期限</span>`;
      }
    }
    // 有効期限プログレスバー: 残日数を上限90日で可視化 (v5.48)
    let expBarHtml = '';
    if (days !== null && days >= 0) {
      const pct = Math.min(100, Math.round(days / 90 * 100));
      const progCls = days <= 7 ? 'prog-urgent' : days <= 30 ? 'prog-soon' : 'prog-normal';
      expBarHtml = `<div class="pt-exp-bar"><div class="pt-exp-bar-fill ${progCls}" style="--pt-progress:${pct}%"></div></div>`;
    }
    return `
<div class="pt-card ${urgCls}" data-id="${p.id}" style="--pt-i:${idx};--pt-accent:${accent}">
  <div class="pt-card-color-bar" style="background:${accent}"></div>
  <div class="pt-card-icon" style="background:${accent}22;color:${accent}">${p.emoji||'🎫'}</div>
  <div class="pt-card-body">
    <div class="pt-card-name">${esc2(p.name)}</div>
    <div class="pt-card-meta">
      ${expiryHtml}
      ${p.note ? `<span class="pt-note">${esc2(p.note)}</span>` : ''}
    </div>
  </div>
  <div class="pt-card-right">
    <div class="pt-card-balance">${Number(p.balance).toLocaleString('ja-JP')}<span class="pt-unit">pt</span></div>
    <div class="pt-card-yen">${formatMoney(yenVal)}</div>
    <div class="pt-card-actions">
      <button class="btn-icon pt-edit-btn" data-id="${p.id}" title="編集">✏️</button>
      <button class="btn-icon pt-delete-btn" data-id="${p.id}" title="削除">🗑</button>
    </div>
  </div>
  ${expBarHtml}
</div>`;
  }

  const cards = pts.length > 0
    ? pts.map((p, i) => ptCard(p, i)).join('')
    : `<div class="pt-empty"><span class="pt-empty-icon">🎫</span><p>ポイントサービスが登録されていません</p><button class="btn btn-primary" id="pt-empty-add-btn">＋ 追加する</button></div>`;

  const presetOptions = POINT_PRESETS.map((ps, i) =>
    `<option value="${i}">${ps.name}</option>`
  ).join('');

  return `
<div class="page-header">
  <h1 class="page-title">🎫 ポイント残高</h1>
  <button class="btn btn-primary btn-sm" id="pt-add-btn">＋ 追加</button>
</div>

<div class="pt-summary-row">
  <div class="card pt-summary-card pt-total">
    <div class="pt-summary-label">合計ポイント価値</div>
    <div class="pt-summary-amount js-countup" data-value="${totalValue}">${formatMoney(totalValue)}</div>
    <div class="pt-summary-sub">${pts.length}サービス登録中</div>
  </div>
  <div class="card pt-summary-card pt-expiring">
    <div class="pt-summary-label">期限切れ間近</div>
    <div class="pt-summary-amount">${expiringSoon.length}<span class="pt-summary-unit">サービス</span></div>
    <div class="pt-summary-sub">30日以内に期限</div>
  </div>
</div>

<div class="pt-cards-list">${cards}</div>

<!-- ポイント追加/編集モーダル -->
<div class="modal-overlay" id="pt-modal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h2 id="pt-modal-title">ポイントを追加</h2>
      <button class="modal-close" id="pt-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>プリセットから選択</label>
        <select id="pt-preset" class="form-input">
          <option value="">— カスタム —</option>
          ${presetOptions}
        </select>
      </div>
      <div class="form-group">
        <label>サービス名 <span class="required">*</span></label>
        <input type="text" id="pt-name" class="form-input" placeholder="楽天ポイント など" maxlength="40">
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>絵文字アイコン</label>
          <div class="pt-emoji-grid" id="pt-emoji-grid">
            ${POINT_EMOJIS.map(e => `<button class="pt-emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
          </div>
          <input type="hidden" id="pt-emoji" value="🎫">
        </div>
        <div class="form-group">
          <label>カラー</label>
          <div class="pt-color-grid" id="pt-color-grid">
            ${POINT_COLORS.map(c => `<button class="pt-color-btn" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          </div>
          <input type="hidden" id="pt-color" value="#6366f1">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>現在の残高（pt） <span class="required">*</span></label>
          <input type="number" id="pt-balance" class="form-input" placeholder="5000" min="0">
        </div>
        <div class="form-group">
          <label>1pt = 何円</label>
          <input type="number" id="pt-value" class="form-input" placeholder="1" min="0.001" step="0.001" value="1">
        </div>
      </div>
      <div class="form-group">
        <label>有効期限（任意）</label>
        <input type="date" id="pt-expiry" class="form-input">
      </div>
      <div class="form-group">
        <label>メモ</label>
        <input type="text" id="pt-note" class="form-input" placeholder="プレミアム会員 など" maxlength="60">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="pt-modal-cancel">キャンセル</button>
        <button class="btn btn-primary" id="pt-modal-save">保存</button>
      </div>
    </div>
  </div>
</div>`;
}

function bindPoints() {
  document.querySelectorAll('.js-countup').forEach(el => {
    animateCountUp(el, Number(el.dataset.value));
  });

  let editingId = null;

  const modal = document.getElementById('pt-modal');
  const nameEl  = () => document.getElementById('pt-name');
  const emojiEl = () => document.getElementById('pt-emoji');
  const colorEl = () => document.getElementById('pt-color');
  const balEl   = () => document.getElementById('pt-balance');
  const valEl   = () => document.getElementById('pt-value');
  const expEl   = () => document.getElementById('pt-expiry');
  const noteEl  = () => document.getElementById('pt-note');

  function showModal(p) {
    editingId = p ? p.id : null;
    document.getElementById('pt-modal-title').textContent = p ? 'ポイントを編集' : 'ポイントを追加';
    nameEl().value  = p ? p.name : '';
    emojiEl().value = p ? (p.emoji || '🎫') : '🎫';
    colorEl().value = p ? (p.color || '#6366f1') : '#6366f1';
    balEl().value   = p ? p.balance : '';
    valEl().value   = p ? (p.pointValue || 1) : 1;
    expEl().value   = p ? (p.expiryDate || '') : '';
    noteEl().value  = p ? (p.note || '') : '';
    // ボタン状態反映
    document.querySelectorAll('#pt-emoji-grid .pt-emoji-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.emoji === emojiEl().value);
    });
    document.querySelectorAll('#pt-color-grid .pt-color-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.color === colorEl().value);
    });
    document.getElementById('pt-preset').value = '';
    modal.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('modal-is-open')));
  }

  function hideModal() {
    modal.classList.remove('modal-is-open');
    setTimeout(() => { modal.style.display = 'none'; }, 250);
  }

  on('pt-add-btn', 'click', () => showModal(null));
  on('pt-empty-add-btn', 'click', () => showModal(null));
  on('pt-modal-close', 'click', hideModal);
  on('pt-modal-cancel', 'click', hideModal);
  modal.addEventListener('click', e => { if (e.target === modal) hideModal(); });

  // プリセット選択
  on('pt-preset', 'change', () => {
    const idx = parseInt(document.getElementById('pt-preset').value);
    if (isNaN(idx) || idx < 0 || !POINT_PRESETS[idx]) return;
    const ps = POINT_PRESETS[idx];
    nameEl().value  = ps.name;
    emojiEl().value = ps.emoji;
    colorEl().value = ps.color;
    valEl().value   = ps.pointValue || 1;
    document.querySelectorAll('#pt-emoji-grid .pt-emoji-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.emoji === ps.emoji);
    });
    document.querySelectorAll('#pt-color-grid .pt-color-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.color === ps.color);
    });
  });

  // 絵文字・カラー選択
  document.querySelectorAll('#pt-emoji-grid .pt-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      emojiEl().value = btn.dataset.emoji;
      document.querySelectorAll('#pt-emoji-grid .pt-emoji-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });
  document.querySelectorAll('#pt-color-grid .pt-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      colorEl().value = btn.dataset.color;
      document.querySelectorAll('#pt-color-grid .pt-color-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  // 保存
  on('pt-modal-save', 'click', () => {
    const name    = nameEl().value.trim();
    const balance = parseInt(balEl().value) || 0;
    if (!name) { showToast('サービス名を入力してください', 'warning'); return; }
    if (balance < 0) { showToast('残高は0以上を入力してください', 'warning'); return; }
    const fields = {
      name,
      emoji:      emojiEl().value || '🎫',
      color:      colorEl().value || '#6366f1',
      balance,
      pointValue: parseFloat(valEl().value) || 1,
      expiryDate: expEl().value || null,
      note:       noteEl().value.trim(),
    };
    if (editingId) { updatePoint(editingId, fields); showToast('ポイントを更新しました', 'success'); }
    else           { addPoint(fields); showToast('ポイントを追加しました', 'success'); }
    hideModal();
    renderCurrentPage();
  });

  // 編集・削除（イベント委譲）
  document.querySelector('.pt-cards-list').addEventListener('click', e => {
    const editBtn = e.target.closest('.pt-edit-btn');
    const delBtn  = e.target.closest('.pt-delete-btn');
    if (editBtn) {
      const p = getPoints().find(p => p.id === editBtn.dataset.id);
      if (p) showModal(p);
    }
    if (delBtn) {
      if (!confirm('このポイントサービスを削除しますか？')) return;
      deletePoint(delBtn.dataset.id);
      showToast('削除しました');
      renderCurrentPage();
    }
  });
}

// ============================================================
// ほしいものリスト (v5.51)
// ============================================================
const WL_EMOJIS = ['🛍️','💻','📱','🎮','👗','👟','🎸','📚','🚲','✈️','🏠','🍳','🎁','💎','🛋️','📷'];
const WL_COLORS = ['#6366f1','#ec4899','#f97316','#eab308','#10b981','#06b6d4','#3b82f6','#8b5cf6','#f43f5e','#14b8a6','#84cc16','#64748b'];

function renderWishlist() {
  const items   = getWishlistItems(false);
  const done    = getWishlistItems(true).filter(w => w.purchased);
  const priSort = { high: 0, medium: 1, low: 2 };
  const sorted  = [...items].sort((a, b) => (priSort[a.priority] ?? 1) - (priSort[b.priority] ?? 1));
  const total   = items.reduce((s, w) => s + (Number(w.price) || 0), 0);

  const priLabel  = p => ({ high: '優先度：高', medium: '優先度：中', low: '優先度：低' }[p] || '優先度：中');
  const priCls    = p => ({ high: 'wl-pri-high', medium: 'wl-pri-medium', low: 'wl-pri-low' }[p] || 'wl-pri-medium');
  const priAccent = p => ({ high: 'var(--danger-text)', medium: 'var(--warning)', low: 'var(--success)' }[p] || 'var(--primary)');

  const cards = sorted.length > 0 ? sorted.map((w, i) =>
    `<div class="wl-card${w.priority === 'high' ? ' wl-high' : ''}" style="--wl-i:${i};--wl-accent:${priAccent(w.priority)}" data-id="${w.id}">
      <div class="wl-card-icon">${w.emoji || '🛍️'}</div>
      <div class="wl-card-body">
        <div class="wl-card-name">${esc2(w.name)}</div>
        <div class="wl-card-meta">
          <span class="wl-priority-badge ${priCls(w.priority)}">${priLabel(w.priority)}</span>
          ${w.notes ? `<span class="wl-card-note">${esc2(w.notes)}</span>` : ''}
        </div>
      </div>
      <div class="wl-card-right">
        <div class="wl-card-price">${formatMoney(w.price || 0)}</div>
        <div class="wl-card-actions">
          <button class="btn btn-sm btn-primary wl-buy-btn" data-id="${w.id}" title="購入済みにして取引追加">✓ 購入</button>
          <button class="btn btn-sm btn-ghost wl-edit-btn" data-id="${w.id}">✏️</button>
          <button class="btn btn-sm btn-danger wl-delete-btn" data-id="${w.id}">🗑</button>
        </div>
      </div>
    </div>`
  ).join('') : `<div class="wl-empty"><span class="wl-empty-icon">🛍️</span><p>ほしいものはまだありません</p><p class="wl-empty-sub">「＋ 追加」ボタンから登録しましょう</p></div>`;

  const archiveHtml = done.length > 0 ? `
<details class="wl-archive-wrap">
  <summary class="wl-archive-summary">✅ 購入済み（${done.length}件）</summary>
  <div class="wl-archive-list">
    ${done.map((w, wi) => `<div class="wl-archive-item" style="--wa-i:${wi}">
      <span class="wl-archive-emoji">${w.emoji || '🛍️'}</span>
      <span class="wl-archive-name">${esc2(w.name)}</span>
      <span class="wl-archive-date">${w.purchasedDate || ''}</span>
      <span class="wl-archive-price">${formatMoney(w.price || 0)}</span>
      <button class="btn btn-sm btn-danger wl-delete-btn wl-archive-del" data-id="${w.id}">🗑</button>
    </div>`).join('')}
  </div>
</details>` : '';

  return `
<div class="page-header">
  <h1 class="page-title">🛍️ ほしいものリスト</h1>
  <button class="btn btn-primary" id="wl-add-btn">＋ 追加</button>
</div>

<div class="wl-summary-row">
  <div class="card wl-summary-card wl-sum-count">
    <div class="wl-summary-label">リスト件数</div>
    <div class="wl-summary-value">${items.length}<span class="wl-summary-unit">件</span></div>
  </div>
  <div class="card wl-summary-card wl-sum-budget">
    <div class="wl-summary-label">合計予算</div>
    <div class="wl-summary-value js-countup" data-value="${total}">${formatMoney(total)}</div>
  </div>
  <div class="card wl-summary-card wl-sum-done">
    <div class="wl-summary-label">購入済み</div>
    <div class="wl-summary-value">${done.length}<span class="wl-summary-unit">件</span></div>
  </div>
</div>

<div class="wl-cards-list">${cards}</div>
${archiveHtml}`;
}

function bindWishlist() {
  document.querySelectorAll('.js-countup').forEach(el => animateCountUp(el, Number(el.dataset.value)));

  on('wl-add-btn', 'click', () => openWishlistModal(null));

  const list = document.querySelector('.wl-cards-list');
  if (list) {
    list.addEventListener('click', e => {
      const buyBtn  = e.target.closest('.wl-buy-btn');
      const editBtn = e.target.closest('.wl-edit-btn');
      const delBtn  = e.target.closest('.wl-delete-btn');
      if (buyBtn) {
        const id = buyBtn.dataset.id;
        const item = (appData.wishlist || []).find(w => w.id === id);
        if (!item) return;
        if (!confirm(`「${item.name}」を購入済みにして取引（${formatMoney(item.price || 0)}）を追加しますか？`)) return;
        markWishlistPurchased(id);
        showToast('購入済みにして取引を追加しました', 'success');
        renderCurrentPage();
      }
      if (editBtn) openWishlistModal(editBtn.dataset.id);
      if (delBtn) {
        if (!confirm('削除しますか？')) return;
        deleteWishlistItem(delBtn.dataset.id);
        showToast('削除しました');
        renderCurrentPage();
      }
    });
  }

  // 購入済みアーカイブの削除
  const archive = document.querySelector('.wl-archive-list');
  if (archive) {
    archive.addEventListener('click', e => {
      const delBtn = e.target.closest('.wl-archive-del');
      if (delBtn) {
        if (!confirm('削除しますか？')) return;
        deleteWishlistItem(delBtn.dataset.id);
        showToast('削除しました');
        renderCurrentPage();
      }
    });
  }
}

function openWishlistModal(editId) {
  const item = editId ? (appData.wishlist || []).find(w => w.id === editId) : null;
  let overlay = document.getElementById('wl-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wl-modal';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
  }

  const emojiOpts = WL_EMOJIS.map(e =>
    `<option value="${e}" ${item && item.emoji === e ? 'selected' : ''}>${e}</option>`
  ).join('');
  const colorOpts = WL_COLORS.map(c =>
    `<option value="${c}" ${item && item.color === c ? 'selected' : ''}>${c}</option>`
  ).join('');
  const catOpts = appData.categories.filter(c => c.type === 'expense').map(c =>
    `<option value="${c.id}" ${item && item.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`
  ).join('');

  overlay.innerHTML = `
    <div class="modal wl-modal">
      <div class="modal-header">
        <h2>${item ? 'ほしいものを編集' : 'ほしいものを追加'}</h2>
        <button class="modal-close" id="wl-modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">絵文字</label>
          <select class="form-input" id="wl-emoji">${emojiOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">名前 <span class="required">*</span></label>
          <input class="form-input" id="wl-name" type="text" placeholder="例: MacBook Pro" value="${item ? esc2(item.name) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">価格（円）</label>
          <input class="form-input" id="wl-price" type="number" min="0" placeholder="0" value="${item ? (item.price || 0) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">優先度</label>
          <select class="form-input" id="wl-priority">
            <option value="high"   ${item && item.priority === 'high'   ? 'selected' : ''}>🔴 高</option>
            <option value="medium" ${!item || item.priority === 'medium' ? 'selected' : ''}>🟡 中</option>
            <option value="low"    ${item && item.priority === 'low'    ? 'selected' : ''}>🟢 低</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">カテゴリ（購入時の取引に使用）</label>
          <select class="form-input" id="wl-category">
            <option value="">選択しない</option>
            ${catOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">メモ</label>
          <input class="form-input" id="wl-notes" type="text" placeholder="備考" value="${item ? esc2(item.notes || '') : ''}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="wl-modal-cancel">キャンセル</button>
        <button class="btn btn-primary" id="wl-modal-save">${item ? '更新' : '追加'}</button>
      </div>
    </div>`;

  showModal(overlay);

  document.getElementById('wl-modal-close').addEventListener('click', () => hideModal(overlay));
  document.getElementById('wl-modal-cancel').addEventListener('click', () => hideModal(overlay));
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(overlay); });

  document.getElementById('wl-modal-save').addEventListener('click', () => {
    const name = document.getElementById('wl-name').value.trim();
    if (!name) { showToast('名前を入力してください', 'warning'); return; }
    const fields = {
      name,
      emoji:      document.getElementById('wl-emoji').value || '🛍️',
      price:      parseInt(document.getElementById('wl-price').value) || 0,
      priority:   document.getElementById('wl-priority').value || 'medium',
      categoryId: document.getElementById('wl-category').value || '',
      notes:      document.getElementById('wl-notes').value.trim(),
    };
    if (editId) { updateWishlistItem(editId, fields); showToast('更新しました', 'success'); }
    else        { addWishlistItem(fields); showToast('追加しました', 'success'); }
    hideModal(overlay);
    renderCurrentPage();
  });
}

// ============================================================
// 節約チャレンジ (v5.64)
// ============================================================
function renderChallenges() {
  const now = currentYearMonth();
  const all = getChallenges();
  const active = all.filter(c => c.period === now);
  const past   = all.filter(c => c.period !== now).sort((a, b) => b.period.localeCompare(a.period));

  // サマリー
  const totalActive   = active.length;
  const totalAchieved = all.filter(c => c.achieved === true).length;

  const emptyHtml = `<div class="ch-empty"><span class="ch-empty-icon">🏆</span><p>今月のチャレンジはありません</p><p class="ch-empty-sub">「＋ チャレンジを作成」から挑戦してみましょう</p></div>`;

  const renderCard = (ch, i) => {
    const prog = calcChallengeProgress(ch);
    const pct  = prog.pct;
    const isOver = ch.type === 'budget' && prog.actual > prog.target;
    const isDone = ch.achieved === true;
    const isFailed = ch.achieved === false;
    const barCls = isOver ? 'ch-bar-over' : prog.isOnTrack ? 'ch-bar-ok' : 'ch-bar-warn';
    const statusBadge = isDone
      ? `<span class="ch-status ch-status-done">✓ 達成</span>`
      : isFailed
        ? `<span class="ch-status ch-status-fail">✗ 未達</span>`
        : isOver
          ? `<span class="ch-status ch-status-over">⚠ 超過</span>`
          : `<span class="ch-status ch-status-active">進行中</span>`;
    const typeLabel = ch.type === 'budget' ? '予算チャレンジ' : 'ノースペンドデー';
    const catName = ch.categoryId ? (getCategoryById(ch.categoryId) || {}).name || '' : '全カテゴリ';
    return `<div class="ch-card${isDone ? ' ch-card-done' : ''}" style="--ch-accent:${ch.color || 'var(--primary)'};--ch-i:${i}" data-id="${ch.id}">
      <div class="ch-card-accent"></div>
      <div class="ch-card-icon">${ch.emoji || '🏆'}</div>
      <div class="ch-card-body">
        <div class="ch-card-top">
          <div class="ch-card-name">${esc2(ch.name)}</div>
          ${statusBadge}
        </div>
        <div class="ch-card-meta"><span class="ch-type-badge">${typeLabel}</span> ${esc2(catName)}</div>
        <div class="ch-card-progress">
          <div class="ch-bar-bg"><div class="ch-bar-fill ${barCls}" style="width:${pct}%" data-ch-pct="${pct}"></div></div>
          <span class="ch-progress-label">${prog.label}</span>
          <span class="ch-progress-pct${isOver ? ' ch-pct-over' : prog.isOnTrack ? ' ch-pct-ok' : ''}">${pct}%</span>
        </div>
      </div>
      <div class="ch-card-actions">
        <button class="btn btn-sm btn-ghost ch-edit-btn" data-id="${ch.id}" title="編集">✏️</button>
        <button class="btn btn-sm btn-danger ch-delete-btn" data-id="${ch.id}" title="削除">🗑</button>
      </div>
    </div>`;
  };

  const activeCards = active.length
    ? active.map((c, i) => renderCard(c, i)).join('')
    : emptyHtml;

  const archiveHtml = past.length > 0 ? `
<details class="ch-archive-wrap">
  <summary class="ch-archive-summary">📁 過去のチャレンジ（${past.length}件）</summary>
  <div class="ch-archive-list">
    ${past.map((c, i) => renderCard(c, i)).join('')}
  </div>
</details>` : '';

  return `
<div class="page-header">
  <h1 class="page-title">🏆 節約チャレンジ</h1>
  <button class="btn btn-primary" id="ch-add-btn">＋ チャレンジを作成</button>
</div>

<div class="ch-summary-row">
  <div class="card ch-summary-card ch-sum-active">
    <div class="ch-summary-label">今月のチャレンジ</div>
    <div class="ch-summary-value">${totalActive}<span class="ch-summary-unit">件</span></div>
  </div>
  <div class="card ch-summary-card ch-sum-achieved">
    <div class="ch-summary-label">達成済み（累計）</div>
    <div class="ch-summary-value">${totalAchieved}<span class="ch-summary-unit">件</span></div>
  </div>
  <div class="card ch-summary-card ch-sum-total">
    <div class="ch-summary-label">登録チャレンジ</div>
    <div class="ch-summary-value">${all.length}<span class="ch-summary-unit">件</span></div>
  </div>
</div>

<h2 class="ch-section-title">今月のチャレンジ（${now}）</h2>
<div class="ch-cards-list">${activeCards}</div>

${archiveHtml}

<!-- チャレンジ作成/編集モーダル -->
<div id="ch-modal-overlay" class="modal-overlay" style="display:none">
  <div class="modal ch-modal">
    <h2 id="ch-modal-title">チャレンジを作成</h2>
    <div class="form-group">
      <label>チャレンジ名</label>
      <input type="text" id="ch-name" placeholder="例: 外食費を抑える" maxlength="30">
    </div>
    <div class="form-row-2">
      <div class="form-group">
        <label>絵文字</label>
        <div class="ch-emoji-grid" id="ch-emoji-grid">
          ${CHALLENGE_EMOJIS.map(e => `<button type="button" class="ch-emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
        </div>
        <input type="hidden" id="ch-emoji" value="🏆">
      </div>
      <div class="form-group">
        <label>カラー</label>
        <div class="ch-color-grid" id="ch-color-grid">
          ${CHALLENGE_COLORS.map(c => `<button type="button" class="ch-color-btn" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div>
        <input type="hidden" id="ch-color" value="${CHALLENGE_COLORS[0]}">
      </div>
    </div>
    <div class="form-group">
      <label>種別</label>
      <div class="type-toggle" id="ch-type-toggle">
        <button type="button" class="type-btn active" data-type="budget">💰 予算チャレンジ</button>
        <button type="button" class="type-btn" data-type="noSpend">📅 ノースペンドデー</button>
      </div>
      <input type="hidden" id="ch-type" value="budget">
    </div>
    <div class="form-group">
      <label>カテゴリ（省略=全カテゴリ）</label>
      <select id="ch-category">
        <option value="">全カテゴリ</option>
        ${appData.categories.filter(c => c.type === 'expense').map(c => `<option value="${c.id}">${esc2(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" id="ch-target-budget-wrap">
      <label>目標金額（円以内）</label>
      <input type="number" id="ch-target-amount" min="1" placeholder="例: 30000">
    </div>
    <div class="form-group" id="ch-target-noSpend-wrap" style="display:none">
      <label>目標無支出日数（日以上）</label>
      <input type="number" id="ch-target-days" min="1" max="31" placeholder="例: 15">
    </div>
    <div class="form-group">
      <label>対象月</label>
      <input type="month" id="ch-period" value="${now}">
    </div>
    <input type="hidden" id="ch-edit-id" value="">
    <div class="modal-actions">
      <button class="btn btn-ghost" id="ch-cancel-btn">キャンセル</button>
      <button class="btn btn-primary" id="ch-save-btn">保存</button>
    </div>
  </div>
</div>`;
}

function bindChallenges() {
  document.querySelectorAll('.js-countup').forEach(el => animateCountUp(el, Number(el.dataset.value)));

  // バーアニメーション
  document.querySelectorAll('.ch-bar-fill[data-ch-pct]').forEach(el => {
    const pct = Number(el.dataset.chPct) || 0;
    el.style.width = '0%';
    requestAnimationFrame(() => {
      el.style.transition = 'width 0.7s cubic-bezier(0.4,0,0.2,1)';
      el.style.width = pct + '%';
    });
  });

  on('ch-add-btn', 'click', () => openChallengeModal(null));

  // 節約機会スキャンからのプリフィル自動起動（v8.4）
  if (appState.challengePrefill) {
    const pf = appState.challengePrefill;
    appState.challengePrefill = null;
    setTimeout(() => openChallengeModal(null, pf), 200);
  }

  const list = document.querySelector('.ch-cards-list');
  const arch = document.querySelector('.ch-archive-list');
  const handler = e => {
    const editBtn   = e.target.closest('.ch-edit-btn');
    const deleteBtn = e.target.closest('.ch-delete-btn');
    if (editBtn) {
      const ch = getChallenges().find(c => c.id === editBtn.dataset.id);
      if (ch) openChallengeModal(ch);
    }
    if (deleteBtn) {
      if (confirm('このチャレンジを削除しますか？')) {
        deleteChallenge(deleteBtn.dataset.id);
        renderCurrentPage();
      }
    }
  };
  if (list) list.addEventListener('click', handler);
  if (arch) arch.addEventListener('click', handler);
}

function openChallengeModal(ch, prefill) {
  const overlay = document.getElementById('ch-modal-overlay');
  const title   = document.getElementById('ch-modal-title');
  const nameEl  = document.getElementById('ch-name');
  const emojiEl = document.getElementById('ch-emoji');
  const colorEl = document.getElementById('ch-color');
  const typeEl  = document.getElementById('ch-type');
  const catEl   = document.getElementById('ch-category');
  const amtEl   = document.getElementById('ch-target-amount');
  const daysEl  = document.getElementById('ch-target-days');
  const perEl   = document.getElementById('ch-period');
  const editId  = document.getElementById('ch-edit-id');

  if (ch) {
    title.textContent = 'チャレンジを編集';
    nameEl.value  = ch.name || '';
    emojiEl.value = ch.emoji || '🏆';
    colorEl.value = ch.color || CHALLENGE_COLORS[0];
    typeEl.value  = ch.type || 'budget';
    catEl.value   = ch.categoryId || '';
    amtEl.value   = ch.targetAmount || '';
    daysEl.value  = ch.targetDays || '';
    perEl.value   = ch.period || currentYearMonth();
    editId.value  = ch.id;
  } else {
    title.textContent = prefill ? '🔍 節約チャレンジを作成' : 'チャレンジを作成';
    nameEl.value  = prefill?.name  || '';
    emojiEl.value = prefill?.emoji || '🏆';
    colorEl.value = prefill?.color || CHALLENGE_COLORS[0];
    typeEl.value  = prefill?.type  || 'budget';
    catEl.value   = prefill?.categoryId || '';
    amtEl.value   = prefill?.targetAmount || '';
    daysEl.value  = '';
    perEl.value   = currentYearMonth();
    editId.value  = '';
  }

  // 絵文字ボタン反映
  document.querySelectorAll('.ch-emoji-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.emoji === emojiEl.value);
  });
  // カラーボタン反映
  document.querySelectorAll('.ch-color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === colorEl.value);
  });
  // タイプ表示切替
  const updateTypeUI = type => {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    document.getElementById('ch-target-budget-wrap').style.display  = type === 'budget'  ? '' : 'none';
    document.getElementById('ch-target-noSpend-wrap').style.display = type === 'noSpend' ? '' : 'none';
  };
  updateTypeUI(typeEl.value);

  // イベント
  document.querySelectorAll('.ch-emoji-btn').forEach(btn => {
    btn.onclick = () => {
      emojiEl.value = btn.dataset.emoji;
      document.querySelectorAll('.ch-emoji-btn').forEach(b => b.classList.toggle('active', b === btn));
    };
  });
  document.querySelectorAll('.ch-color-btn').forEach(btn => {
    btn.onclick = () => {
      colorEl.value = btn.dataset.color;
      document.querySelectorAll('.ch-color-btn').forEach(b => b.classList.toggle('active', b === btn));
    };
  });
  document.getElementById('ch-type-toggle').querySelectorAll('.type-btn').forEach(btn => {
    btn.onclick = () => { typeEl.value = btn.dataset.type; updateTypeUI(btn.dataset.type); };
  });

  document.getElementById('ch-cancel-btn').onclick = () => hideModal(overlay);
  document.getElementById('ch-save-btn').onclick = () => {
    const name = nameEl.value.trim();
    if (!name) { alert('チャレンジ名を入力してください'); return; }
    const type = typeEl.value;
    if (type === 'budget' && !amtEl.value) { alert('目標金額を入力してください'); return; }
    if (type === 'noSpend' && !daysEl.value) { alert('目標日数を入力してください'); return; }

    const fields = {
      name,
      emoji: emojiEl.value || '🏆',
      color: colorEl.value || CHALLENGE_COLORS[0],
      type,
      categoryId: catEl.value || '',
      targetAmount: type === 'budget' ? Number(amtEl.value) : null,
      targetDays: type === 'noSpend' ? Number(daysEl.value) : null,
      period: perEl.value || currentYearMonth(),
    };

    if (editId.value) {
      updateChallenge(editId.value, fields);
    } else {
      addChallenge(fields);
    }
    hideModal(overlay);
    renderCurrentPage();
  };

  showModal(overlay);
}

// ============================================================
// 負債・ローン管理 (v5.84)
// ============================================================

function renderDebts() {
  const debts = appData.debts || [];
  const totalDebt = getTotalDebt();
  const activeDebts = debts.filter(d => !d.paidOff);
  const paidDebts   = debts.filter(d => d.paidOff);
  const totalMonthly = activeDebts.reduce((s, d) => s + (Number(d.monthlyPayment) || 0), 0);

  const debtCard = (d, idx) => {
    const typeInfo = DEBT_TYPES[d.type] || DEBT_TYPES.other;
    const e = getDebtCurrentBalance(d);
    const cur = e ? Number(e.balance) : Number(d.principal);
    const prin = Number(d.principal) || 1;
    const paidPct = Math.max(0, Math.min(Math.round((1 - cur / prin) * 100), 100));
    const barCls = paidPct >= 75 ? 'debt-bar-great' : paidPct >= 40 ? 'debt-bar-mid' : 'debt-bar-low';
    const lowCls = paidPct < 25 ? ' debt-low' : '';
    const dateLabel = e ? `${formatDate(e.date)} 時点` : '残高未更新';
    const entries = [...(d.entries || [])].sort((a, b) => b.date.localeCompare(a.date));

    // 完済予定月 (v5.85: ピル形式)
    let endHint = '';
    if (d.endDate) {
      endHint = `<span class="debt-end-pill">🏁 完済予定: ${d.endDate.replace('-', '年').replace(/-(\d+)$/, '$1月')}</span>`;
    } else if (cur > 0 && Number(d.monthlyPayment) > 0) {
      const months = Math.ceil(cur / Number(d.monthlyPayment));
      endHint = `<span class="debt-end-pill">📅 残り約 ${months} ヶ月</span>`;
    }

    const histRows = entries.slice(0, 3).map((en, di) => `
      <div class="debt-entry-row" style="--de-i:${di}">
        <span class="debt-entry-date">${formatDate(en.date)}</span>
        <span class="debt-entry-note">${esc2(en.note || '—')}</span>
        <span class="debt-entry-balance">${formatMoney(en.balance)}</span>
        <button class="btn-icon debt-del-entry" data-debt="${d.id}" data-entry="${en.id}" title="削除">🗑️</button>
      </div>`).join('');

    return `
<div class="card debt-card${lowCls}" style="--debt-accent:${typeInfo.color};--dc-i:${idx}">
  <div class="debt-card-header">
    <div class="debt-info">
      <div class="debt-type-icon-wrap" style="background:${typeInfo.color}20;color:${typeInfo.color}">${d.emoji || typeInfo.icon}</div>
      <span class="debt-type-badge" style="background:${typeInfo.color}20;color:${typeInfo.color}">${typeInfo.label}</span>
      <span class="debt-name">${esc2(d.name)}</span>
    </div>
    <div class="debt-card-actions">
      <button class="btn-icon debt-add-entry" data-id="${d.id}" title="残高を更新">＋ 更新</button>
      ${!d.paidOff && d.monthlyPayment > 0 ? `<button class="btn-icon debt-sim" data-id="${d.id}" title="繰上返済シミュレーション">📊</button>` : ''}
      <button class="btn-icon debt-edit" data-id="${d.id}" title="編集">✏️</button>
      <button class="btn-icon debt-delete" data-id="${d.id}" title="削除">🗑️</button>
    </div>
  </div>
  <div class="debt-balance-row">
    <div>
      <div class="debt-balance js-countup" data-value="${cur}" style="color:var(--debt-accent)">${formatMoney(cur)}</div>
      <div class="debt-balance-meta">${dateLabel}</div>
    </div>
    <div class="debt-meta-right">
      ${d.interestRate > 0 ? `<span class="debt-rate-badge">年利 ${d.interestRate}%</span>` : ''}
      ${d.monthlyPayment > 0 ? `<span class="debt-monthly-badge">月返済 ${formatMoney(d.monthlyPayment)}</span>` : ''}
    </div>
  </div>
  <div class="debt-progress-wrap">
    <div class="debt-progress-hdr">
      <span class="debt-progress-label">返済済み ${paidPct}%</span>
      <span class="debt-progress-detail">元本 ${formatMoney(prin)}</span>
    </div>
    <div class="debt-bar-track"><div class="debt-bar-fill ${barCls}" style="width:${paidPct}%;--dbi:${idx}"></div></div>
  </div>
  ${endHint}
  ${entries.length > 0 ? `
  <div class="debt-history">
    <div class="debt-history-title">残高履歴</div>
    ${histRows}
    ${entries.length > 3 ? `<div class="debt-history-more">他 ${entries.length - 3} 件</div>` : ''}
  </div>` : ''}
  ${!d.paidOff ? `<button class="btn btn-ghost btn-sm debt-paidoff" data-id="${d.id}">✓ 完済にする</button>` : ''}
</div>`;
  };

  const emptyState = activeDebts.length === 0 ? `
<div class="empty-debt-state">
  <div class="empty-debt-icon">💳</div>
  <div class="empty-debt-msg">ローン・負債を登録していません</div>
  <div class="empty-debt-sub">住宅ローンや各種ローンを登録して<br>返済進捗を一元管理しましょう</div>
</div>` : '';

  const archivedSection = paidDebts.length > 0 ? `
<details class="debt-archive">
  <summary class="debt-archive-summary">✓ 完済済み（${paidDebts.length}件）</summary>
  ${paidDebts.map((d, i) => debtCard(d, i)).join('')}
</details>` : '';

  return `
<div class="page-header">
  <h1 class="page-title">💳 ローン管理</h1>
  <button class="btn btn-primary" id="btn-add-debt">＋ ローンを追加</button>
</div>

<div class="summary-cards">
  <div class="card summary-card debt-summary-total" style="--ds-i:0">
    <div class="summary-label">💳 総残高</div>
    <div class="summary-amount js-countup" data-value="${totalDebt}">${formatMoney(totalDebt)}</div>
    <div class="debt-summary-sub">${activeDebts.length}件のローン</div>
  </div>
  <div class="card summary-card debt-summary-monthly" style="--ds-i:1">
    <div class="summary-label">📅 月次返済総額</div>
    <div class="summary-amount js-countup" data-value="${totalMonthly}">${formatMoney(totalMonthly)}</div>
    <div class="debt-summary-sub">毎月の支払い合計</div>
  </div>
</div>

${emptyState}
${activeDebts.map((d, i) => debtCard(d, i)).join('')}
${archivedSection}

<!-- 負債追加/編集モーダル -->
<div class="modal-overlay" id="debt-modal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3 class="modal-title" id="debt-modal-title">ローンを追加</h3>
      <button class="modal-close" id="debt-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="debt-edit-id">
      <div class="form-group">
        <label class="form-label">ローン名</label>
        <input type="text" id="debt-name" class="form-input" placeholder="例：住宅ローン（○○銀行）">
      </div>
      <div class="form-group">
        <label class="form-label">種別</label>
        <select id="debt-type" class="form-input">
          ${Object.entries(DEBT_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">絵文字（任意）</label>
        <input type="text" id="debt-emoji" class="form-input" placeholder="🏠" maxlength="2">
      </div>
      <div class="form-group">
        <label class="form-label">借入元本（円）</label>
        <input type="number" id="debt-principal" class="form-input" placeholder="30000000" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">年利（%）</label>
        <input type="number" id="debt-rate" class="form-input" placeholder="1.5" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">月々の返済額（円）</label>
        <input type="number" id="debt-monthly" class="form-input" placeholder="80000" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">完済予定月（任意）</label>
        <input type="month" id="debt-enddate" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">メモ（任意）</label>
        <input type="text" id="debt-memo" class="form-input" placeholder="例：変動金利・10年固定">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="debt-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="debt-modal-save">保存</button>
    </div>
  </div>
</div>

<!-- 残高更新モーダル -->
<div class="modal-overlay" id="debt-entry-modal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3 class="modal-title" id="debt-entry-modal-title">残高を更新</h3>
      <button class="modal-close" id="debt-entry-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">日付</label>
        <input type="date" id="debt-entry-date" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">現在残高（円）</label>
        <input type="number" id="debt-entry-balance" class="form-input" placeholder="0" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">メモ（任意）</label>
        <input type="text" id="debt-entry-note" class="form-input" placeholder="例：3月末残高確認">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="debt-entry-modal-cancel">キャンセル</button>
      <button class="btn btn-primary" id="debt-entry-modal-save">保存</button>
    </div>
  </div>
</div>

<!-- 繰上返済シミュレーターモーダル（v5.86） -->
<div class="modal-overlay" id="debt-sim-modal" style="display:none">
  <div class="modal modal-lg">
    <div class="modal-header sim-modal-header">
      <h3 class="modal-title">📊 繰上返済シミュレーション</h3>
      <button class="modal-close" id="debt-sim-modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="sim-loan-info">
        <span class="sim-loan-name" id="debt-sim-name"></span>
        <span class="sim-loan-stat">残高 <strong id="debt-sim-balance"></strong></span>
        <span class="sim-loan-stat" id="debt-sim-rate-badge"></span>
        <span class="sim-loan-stat">月返済 <strong id="debt-sim-monthly"></strong></span>
      </div>
      <div class="form-group sim-extra-group">
        <label class="form-label">追加返済額 / 月（円）</label>
        <div class="sim-extra-row">
          <input type="number" id="debt-sim-extra" class="form-input" placeholder="0" min="0" step="1000">
          <div class="sim-preset-row">
            <button class="btn btn-sm btn-ghost sim-preset" data-v="10000">+1万</button>
            <button class="btn btn-sm btn-ghost sim-preset" data-v="30000">+3万</button>
            <button class="btn btn-sm btn-ghost sim-preset" data-v="50000">+5万</button>
            <button class="btn btn-sm btn-ghost sim-preset" data-v="100000">+10万</button>
          </div>
        </div>
      </div>
      <div id="debt-sim-result"></div>
      <div class="sim-chart-wrap">
        <div class="sim-chart-title">残高推移グラフ</div>
        <canvas id="debt-sim-chart" height="200"></canvas>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="debt-sim-modal-close2">閉じる</button>
    </div>
  </div>
</div>`;
}

let _editingDebtId = null;
let _entryTargetDebtId = null;
let _simDebtId = null;
let _debtSimChart = null;

// ============================================================
// 繰上返済シミュレーター（v5.86）
// ============================================================

function calcDebtAmortization(balance, annualRatePct, monthly) {
  const rate = annualRatePct / 100 / 12;
  const schedule = [];
  let bal = balance;
  let totalInterest = 0;
  let months = 0;
  const MAX_MONTHS = 600;
  while (bal > 0.5 && months < MAX_MONTHS) {
    const interest = rate > 0 ? bal * rate : 0;
    const principal = monthly - interest;
    if (principal <= 0) { months = MAX_MONTHS; break; }
    totalInterest += interest;
    bal = Math.max(0, bal - principal);
    months++;
    schedule.push({ month: months, balance: Math.round(bal) });
  }
  return { months, totalInterest: Math.round(totalInterest), schedule };
}

function openDebtSimModal(debtId) {
  _simDebtId = debtId;
  const d = (appData.debts || []).find(x => x.id === debtId);
  if (!d) return;
  const e = getDebtCurrentBalance(d);
  const cur = e ? Number(e.balance) : Number(d.principal);
  document.getElementById('debt-sim-name').textContent = d.name;
  document.getElementById('debt-sim-balance').textContent = formatMoney(cur);
  document.getElementById('debt-sim-rate-badge').textContent = d.interestRate > 0 ? `年利 ${d.interestRate}%` : '利率なし';
  document.getElementById('debt-sim-monthly').textContent = formatMoney(d.monthlyPayment || 0);
  document.getElementById('debt-sim-extra').value = '';
  document.querySelectorAll('.sim-preset').forEach(b => b.classList.remove('sim-preset-active'));
  updateDebtSim();
  showModal('debt-sim-modal');
}

function updateDebtSim() {
  const d = (appData.debts || []).find(x => x.id === _simDebtId);
  if (!d) return;
  const e = getDebtCurrentBalance(d);
  const cur = e ? Number(e.balance) : Number(d.principal);
  const rate = Number(d.interestRate) || 0;
  const monthly = Number(d.monthlyPayment) || 0;
  const extra = Number(document.getElementById('debt-sim-extra').value) || 0;
  if (monthly <= 0) {
    document.getElementById('debt-sim-result').innerHTML = '<p class="sim-no-data">月返済額が設定されていません。ローンを編集して月返済額を入力してください。</p>';
    return;
  }
  const fmtMonths = m => {
    if (m <= 0 || m >= 600) return '計算不可';
    const y = Math.floor(m / 12), mo = m % 12;
    if (y === 0) return `${mo}ヶ月`;
    if (mo === 0) return `${y}年`;
    return `${y}年${mo}ヶ月`;
  };
  const fmtEnd = m => {
    if (m <= 0 || m >= 600) return '—';
    const now = new Date();
    const dt = new Date(now.getFullYear(), now.getMonth() + m, 1);
    return `${dt.getFullYear()}年${dt.getMonth() + 1}月`;
  };
  const base = calcDebtAmortization(cur, rate, monthly);
  const accel = extra > 0 ? calcDebtAmortization(cur, rate, monthly + extra) : null;
  const savedMonths = accel ? Math.max(0, base.months - accel.months) : 0;
  const savedInterest = accel ? Math.max(0, base.totalInterest - accel.totalInterest) : 0;

  const colHead = accel ? `月+${extra >= 10000 ? (extra / 10000) + '万円' : formatMoney(extra)}` : '—';
  const betterCls = accel ? ' sim-val-better' : '';

  let html = `
<div class="sim-result-grid-wrap">
<div class="sim-result-grid">
  <div class="sim-result-label" style="--sim-ri:0"></div>
  <div class="sim-result-col-head sim-col-base sim-col-base-head" style="--sim-ri:0">現在の計画</div>
  <div class="sim-result-col-head sim-col-accel sim-col-accel-head" style="--sim-ri:0">${colHead}</div>

  <div class="sim-result-label" style="--sim-ri:1">残り期間</div>
  <div class="sim-result-val sim-col-base" style="--sim-ri:1">${fmtMonths(base.months)}</div>
  <div class="sim-result-val sim-col-accel${betterCls}" style="--sim-ri:1">${accel ? fmtMonths(accel.months) : '—'}</div>

  <div class="sim-result-label" style="--sim-ri:2">総支払利息</div>
  <div class="sim-result-val sim-col-base" style="--sim-ri:2">${formatMoney(base.totalInterest)}</div>
  <div class="sim-result-val sim-col-accel${betterCls}" style="--sim-ri:2">${accel ? formatMoney(accel.totalInterest) : '—'}</div>

  <div class="sim-result-label" style="--sim-ri:3">完済予定</div>
  <div class="sim-result-val sim-col-base" style="--sim-ri:3">${fmtEnd(base.months)}</div>
  <div class="sim-result-val sim-col-accel${betterCls}" style="--sim-ri:3">${accel ? fmtEnd(accel.months) : '—'}</div>
</div>
</div>`;

  if (accel && (savedMonths > 0 || savedInterest > 0)) {
    html += `
<div class="sim-savings-banner">
  <div class="sim-savings-item">
    <div class="sim-savings-label">⏱️ 短縮期間</div>
    <div class="sim-savings-value">${fmtMonths(savedMonths)}</div>
  </div>
  <div class="sim-savings-divider"></div>
  <div class="sim-savings-item">
    <div class="sim-savings-label">💰 節約できる利息</div>
    <div class="sim-savings-value">${formatMoney(savedInterest)}</div>
  </div>
</div>`;
  }
  document.getElementById('debt-sim-result').innerHTML = html;
  /* 節約値バウンスアニメーション */
  document.querySelectorAll('#debt-sim-result .sim-savings-value').forEach(el => {
    el.classList.remove('sim-val-pop');
    void el.offsetWidth;
    el.classList.add('sim-val-pop');
    el.addEventListener('animationend', () => el.classList.remove('sim-val-pop'), { once: true });
  });
  renderDebtSimChart(base, accel, extra);
}

function renderDebtSimChart(base, accel, extra) {
  const canvas = document.getElementById('debt-sim-chart');
  if (!canvas) return;
  if (_debtSimChart) { _debtSimChart.destroy(); _debtSimChart = null; }
  const ctx = canvas.getContext('2d');
  const downsample = (sch, maxPts) => {
    if (sch.length <= maxPts) return sch;
    const step = Math.ceil(sch.length / maxPts);
    const pts = [];
    for (let i = 0; i < sch.length; i += step) pts.push(sch[i]);
    if (pts[pts.length - 1] !== sch[sch.length - 1]) pts.push(sch[sch.length - 1]);
    return pts;
  };
  const baseData = downsample(base.schedule, 60);
  const totalMonths = base.schedule.length;
  const step = totalMonths <= 60 ? 1 : Math.ceil(totalMonths / 60);
  const labels = baseData.map(p => {
    const y = Math.floor(p.month / 12);
    const m = p.month % 12;
    if (m === 0 && y > 0) return `${y}年後`;
    return '';
  });
  // v26.23: charts.js のヘルパーシステム（getThemeColors/makeGradient/commonTooltip/commonAnimation）に統合。
  // makeGradient(canvas.height ベース 3-stop richer fade) と commonTooltip(v26.22 の borderColor 0xcc /
  // padding 14,10 / cornerRadius 10 / titleFont 700 / usePointStyle 円形 / caretSize 7 / 背景 0.95-0.98 等)
  // を共通化。borderWidth 2→2.5, tension 0.35→0.4, pointHoverRadius 4→7, point枠線(surface色) 追加で他の
  // ライン系チャート（renderBalanceLineChart / renderNetWorthChart）と完全対称な見た目に。
  const { text: textColor, grid: gridColor, surface, fs2xs } = getThemeColors();
  const primaryClr = getCSSVar('--primary');
  const successClr = getCSSVar('--success');
  const datasets = [{
    label: '現在の計画',
    data: baseData.map(p => p.balance),
    borderColor: primaryClr,
    backgroundColor: makeGradient(ctx, canvas, primaryClr, 0.32, 0.02),
    fill: true,
    tension: 0.4,
    borderWidth: 2.5,
    pointRadius: 0,
    pointHoverRadius: 7,
    pointBackgroundColor: primaryClr,
    pointBorderColor: surface,
    pointBorderWidth: 2,
    pointHoverBorderWidth: 3,
  }];
  if (accel) {
    const accelData = downsample(accel.schedule, 60);
    datasets.push({
      label: `繰上返済後`,
      data: accelData.map(p => p.balance),
      borderColor: successClr,
      backgroundColor: makeGradient(ctx, canvas, successClr, 0.30, 0.02),
      fill: true,
      tension: 0.4,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 7,
      pointBackgroundColor: successClr,
      pointBorderColor: surface,
      pointBorderWidth: 2,
      pointHoverBorderWidth: 3,
    });
  }
  _debtSimChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: fs2xs } } },
        tooltip: commonTooltip({
          label: c => ` ${c.dataset.label}: ${formatMoney(c.raw)}`,
          title: items => `${items[0].label || (Math.round(items[0].dataIndex * step + 1) + 'ヶ月後')}`,
        }),
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, color: textColor, font: { size: fs2xs } }, grid: { color: gridColor } },
        y: { ticks: { callback: v => v >= 10000 ? `¥${Math.round(v / 10000)}万` : `¥${v}`, color: textColor, font: { size: fs2xs } }, grid: { color: gridColor } },
      },
    },
  });
}

function openDebtModal(debtId) {
  _editingDebtId = debtId || null;
  const d = debtId ? (appData.debts || []).find(x => x.id === debtId) : null;
  document.getElementById('debt-modal-title').textContent = d ? 'ローンを編集' : 'ローンを追加';
  document.getElementById('debt-edit-id').value = d ? d.id : '';
  document.getElementById('debt-name').value = d ? d.name : '';
  document.getElementById('debt-type').value = d ? (d.type || 'mortgage') : 'mortgage';
  document.getElementById('debt-emoji').value = d ? (d.emoji || '') : '';
  document.getElementById('debt-principal').value = d ? (d.principal || '') : '';
  document.getElementById('debt-rate').value = d ? (d.interestRate || '') : '';
  document.getElementById('debt-monthly').value = d ? (d.monthlyPayment || '') : '';
  document.getElementById('debt-enddate').value = d ? (d.endDate || '') : '';
  document.getElementById('debt-memo').value = d ? (d.memo || '') : '';
  showModal('debt-modal');
}

function openDebtEntryModal(debtId) {
  _entryTargetDebtId = debtId;
  const d = (appData.debts || []).find(x => x.id === debtId);
  document.getElementById('debt-entry-modal-title').textContent =
    d ? `「${d.name}」残高を更新` : '残高を更新';
  document.getElementById('debt-entry-date').value = todayStr();
  document.getElementById('debt-entry-balance').value = '';
  document.getElementById('debt-entry-note').value = '';
  showModal('debt-entry-modal');
}

function bindDebts() {
  document.querySelectorAll('.js-countup').forEach(el => {
    animateCountUp(el, Number(el.dataset.value));
  });

  on('btn-add-debt', 'click', () => openDebtModal(null));

  on('debt-modal-close',   'click', () => hideModal('debt-modal'));
  on('debt-modal-cancel',  'click', () => hideModal('debt-modal'));
  on('debt-entry-modal-close',   'click', () => hideModal('debt-entry-modal'));
  on('debt-entry-modal-cancel',  'click', () => hideModal('debt-entry-modal'));
  on('debt-sim-modal-close',  'click', () => hideModal('debt-sim-modal'));
  on('debt-sim-modal-close2', 'click', () => hideModal('debt-sim-modal'));
  on('debt-sim-extra', 'input', () => updateDebtSim());

  on('debt-modal-save', 'click', () => {
    const name = document.getElementById('debt-name').value.trim();
    if (!name) { alert('ローン名を入力してください'); return; }
    const principal = Number(document.getElementById('debt-principal').value) || 0;
    if (!principal) { alert('借入元本を入力してください'); return; }
    const fields = {
      name,
      type:          document.getElementById('debt-type').value,
      emoji:         document.getElementById('debt-emoji').value.trim(),
      principal,
      interestRate:  Number(document.getElementById('debt-rate').value) || 0,
      monthlyPayment: Number(document.getElementById('debt-monthly').value) || 0,
      endDate:       document.getElementById('debt-enddate').value || '',
      memo:          document.getElementById('debt-memo').value.trim(),
    };
    const editId = document.getElementById('debt-edit-id').value;
    if (editId) {
      updateDebt(editId, fields);
    } else {
      addDebt(fields);
    }
    hideModal('debt-modal');
    renderCurrentPage();
  });

  on('debt-entry-modal-save', 'click', () => {
    const bal = Number(document.getElementById('debt-entry-balance').value);
    if (isNaN(bal) || bal < 0) { alert('残高を入力してください'); return; }
    const entry = {
      date:    document.getElementById('debt-entry-date').value,
      balance: bal,
      note:    document.getElementById('debt-entry-note').value.trim(),
    };
    addDebtEntry(_entryTargetDebtId, entry);
    hideModal('debt-entry-modal');
    renderCurrentPage();
  });

  // シミュレーター プリセットボタン（モーダル内）
  document.addEventListener('click', e => {
    const preset = e.target.closest('.sim-preset');
    if (!preset) return;
    const input = document.getElementById('debt-sim-extra');
    if (!input) return;
    input.value = preset.dataset.v;
    /* アクティブ状態ハイライト */
    document.querySelectorAll('.sim-preset').forEach(b => b.classList.remove('sim-preset-active'));
    preset.classList.add('sim-preset-active');
    updateDebtSim();
  }, { capture: false });
  /* 手入力時はプリセット選択解除 */
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'debt-sim-extra') {
      document.querySelectorAll('.sim-preset').forEach(b => {
        b.classList.toggle('sim-preset-active', b.dataset.v === e.target.value);
      });
    }
  });

  // イベント委譲
  document.getElementById('main-content').addEventListener('click', e => {
    const simBtn = e.target.closest('.debt-sim');
    if (simBtn) { openDebtSimModal(simBtn.dataset.id); return; }

    const addBtn = e.target.closest('.debt-add-entry');
    if (addBtn) { openDebtEntryModal(addBtn.dataset.id); return; }

    const editBtn = e.target.closest('.debt-edit');
    if (editBtn) { openDebtModal(editBtn.dataset.id); return; }

    const delBtn = e.target.closest('.debt-delete');
    if (delBtn) {
      if (!confirm('このローンを削除しますか？')) return;
      deleteDebt(delBtn.dataset.id);
      renderCurrentPage();
      return;
    }

    const delEntry = e.target.closest('.debt-del-entry');
    if (delEntry) {
      if (!confirm('この残高履歴を削除しますか？')) return;
      deleteDebtEntry(delEntry.dataset.debt, delEntry.dataset.entry);
      renderCurrentPage();
      return;
    }

    const paidBtn = e.target.closest('.debt-paidoff');
    if (paidBtn) {
      if (!confirm('このローンを完済済みにしますか？')) return;
      updateDebt(paidBtn.dataset.id, { paidOff: true, paidOffAt: todayStr() });
      renderCurrentPage();
      showToast('✓ 完済おめでとうございます！', 'success');
      return;
    }
  });
}

// ============================================================
// 年間収支予定管理（v5.90）
// ============================================================
function renderEvents() {
  const events = getEvents();
  const today = new Date();
  const thisYearStr = String(today.getFullYear());
  const thisMonthYM = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0');
  const nextDate = new Date(today.getFullYear(), today.getMonth()+1, 1);
  const nextMonthYM = nextDate.getFullYear() + '-' + String(nextDate.getMonth()+1).padStart(2,'0');

  // サマリー
  const thisMonthEvs = events.filter(e => e.month === thisMonthYM);
  const nextMonthEvs = events.filter(e => e.month === nextMonthYM);
  const thisYearEvs  = events.filter(e => e.month && e.month.startsWith(thisYearStr));
  const thisYearExp  = thisYearEvs.filter(e => e.type==='expense').reduce((s,e)=>s+(Number(e.plannedAmount)||0),0);
  const thisYearInc  = thisYearEvs.filter(e => e.type==='income').reduce((s,e)=>s+(Number(e.plannedAmount)||0),0);
  const thisMonthExp = thisMonthEvs.filter(e=>e.type==='expense').reduce((s,e)=>s+(Number(e.plannedAmount)||0),0);
  const thisMonthInc = thisMonthEvs.filter(e=>e.type==='income').reduce((s,e)=>s+(Number(e.plannedAmount)||0),0);
  const nextMonthExp = nextMonthEvs.filter(e=>e.type==='expense').reduce((s,e)=>s+(Number(e.plannedAmount)||0),0);
  const nextMonthInc = nextMonthEvs.filter(e=>e.type==='income').reduce((s,e)=>s+(Number(e.plannedAmount)||0),0);

  const summaryCards = `
<div class="ev-summary-grid">
  <div class="card ev-sum-card ev-sum-this" style="--ev-si:0">
    <div class="ev-sum-label">今月の予定</div>
    <div class="ev-sum-count">${thisMonthEvs.length}<small>件</small></div>
    <div class="ev-sum-amounts">
      ${thisMonthInc>0?`<span class="ev-sum-inc">+${formatMoney(thisMonthInc)}</span>`:''}
      ${thisMonthExp>0?`<span class="ev-sum-exp">-${formatMoney(thisMonthExp)}</span>`:''}
      ${thisMonthEvs.length===0?'<span class="ev-sum-none">予定なし</span>':''}
    </div>
  </div>
  <div class="card ev-sum-card ev-sum-next" style="--ev-si:1">
    <div class="ev-sum-label">来月の予定</div>
    <div class="ev-sum-count">${nextMonthEvs.length}<small>件</small></div>
    <div class="ev-sum-amounts">
      ${nextMonthInc>0?`<span class="ev-sum-inc">+${formatMoney(nextMonthInc)}</span>`:''}
      ${nextMonthExp>0?`<span class="ev-sum-exp">-${formatMoney(nextMonthExp)}</span>`:''}
      ${nextMonthEvs.length===0?'<span class="ev-sum-none">予定なし</span>':''}
    </div>
  </div>
  <div class="card ev-sum-card ev-sum-year" style="--ev-si:2">
    <div class="ev-sum-label">今年の予定合計</div>
    <div class="ev-sum-count">${thisYearEvs.length}<small>件</small></div>
    <div class="ev-sum-amounts">
      ${thisYearInc>0?`<span class="ev-sum-inc">+${formatMoney(thisYearInc)}</span>`:''}
      ${thisYearExp>0?`<span class="ev-sum-exp">-${formatMoney(thisYearExp)}</span>`:''}
      ${thisYearEvs.length===0?'<span class="ev-sum-none">予定なし</span>':''}
    </div>
  </div>
</div>`;

  // イベントカード
  const evCard = (ev, idx) => {
    const cat = (appData.categories||[]).find(c=>c.id===ev.categoryId);
    const isIncome = ev.type === 'income';
    const doneCls = ev.done ? ' ev-card-done' : '';
    return `<div class="card ev-card${doneCls}" style="--ev-accent:${ev.color||'var(--primary)'};--ev-ci:${idx}" data-id="${ev.id}">
  <div class="ev-card-header">
    <div class="ev-card-icon-wrap" style="background:color-mix(in srgb,${ev.color||'var(--primary)'} 9%,transparent);color:${ev.color||'var(--primary)'}">${ev.emoji||'📅'}</div>
    <div class="ev-card-info">
      <div class="ev-card-name ${ev.done?'ev-name-done':''}">${esc2(ev.name)}</div>
      <div class="ev-card-meta">
        <span class="ev-type-badge ${isIncome?'ev-income':'ev-expense'}">${isIncome?'収入':'支出'}</span>
        ${cat?`<span class="ev-cat-badge" style="color:${cat.color}">${esc2(cat.name)}</span>`:''}
      </div>
    </div>
    <div class="ev-card-amount ${isIncome?'ev-income':'ev-expense'}">${isIncome?'+':'-'}${formatMoney(ev.plannedAmount||0)}</div>
  </div>
  ${ev.memo?`<div class="ev-card-memo">${esc2(ev.memo)}</div>`:''}
  <div class="ev-card-footer">
    <label class="ev-done-label">
      <input type="checkbox" class="ev-done-cb" data-id="${ev.id}" ${ev.done?'checked':''}> 完了
    </label>
    <div class="ev-card-actions">
      <button class="btn-icon ev-edit" data-id="${ev.id}" title="編集">✏️</button>
      <button class="btn-icon ev-delete" data-id="${ev.id}" title="削除">🗑️</button>
    </div>
  </div>
</div>`;
  };

  // 12ヶ月グリッド
  const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const yearGrid = Array.from({length:12}, (_,i) => {
    const d = new Date(today.getFullYear(), i, 1);
    const ym = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const monthEvs = events.filter(e => e.month === ym).sort((a,b)=>(a.type==='income'?0:1)-(b.type==='income'?0:1));
    const isCurrent = ym === thisMonthYM;
    const incTotal = monthEvs.filter(e=>e.type==='income').reduce((s,e)=>s+(Number(e.plannedAmount)||0),0);
    const expTotal = monthEvs.filter(e=>e.type==='expense').reduce((s,e)=>s+(Number(e.plannedAmount)||0),0);
    const doneCount = monthEvs.filter(e=>e.done).length;
    const progPct   = monthEvs.length > 0 ? Math.round(doneCount / monthEvs.length * 100) : 0;
    const progCls   = progPct===100 ? 'ev-pm-done' : progPct>=50 ? 'ev-pm-mid' : '';
    const progressBar = monthEvs.length > 0
      ? `<div class="ev-month-progress ${progCls}" style="--ev-prog:${progPct};--ev-mi:${i}">
  <div class="ev-prog-bar"><div class="ev-prog-fill"></div></div>
  <span class="ev-prog-pct">${progPct}%</span>
</div>` : '';
    return `<div class="ev-month-col${isCurrent?' ev-month-current':''}">
  <div class="ev-month-header">
    <span class="ev-month-label">${MONTH_NAMES[i]}</span>
    <div class="ev-month-totals">
      ${incTotal>0?`<span class="ev-income ev-mtot">+${formatMoney(incTotal)}</span>`:''}
      ${expTotal>0?`<span class="ev-expense ev-mtot">-${formatMoney(expTotal)}</span>`:''}
    </div>
    <button class="btn-icon ev-add-month" data-month="${ym}" title="${MONTH_NAMES[i]}に追加">＋</button>
  </div>
  <div class="ev-month-body">
    ${monthEvs.length ? monthEvs.map((ev,idx) => evCard(ev,idx)).join('') : `<div class="ev-month-empty">予定なし</div>`}
  </div>
  ${progressBar}
</div>`;
  }).join('');

  return `<div class="page-header">
  <h2 class="page-title">📌 収支予定管理</h2>
  <button class="btn btn-primary btn-sm" id="ev-add-btn">＋ イベントを追加</button>
</div>
${summaryCards}
<div class="ev-year-grid">${yearGrid}</div>`;
}

function bindEvents() {
  // モーダルオーバーレイクリックで閉じる
  const evModal = document.getElementById('ev-modal');
  if (evModal) {
    evModal.addEventListener('click', e => { if (e.target === evModal) closeEventModal(); });
  }

  // ヘッダー追加ボタン
  const addBtn = document.getElementById('ev-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => openEventModal(null, null));

  // 月別追加ボタン
  document.querySelectorAll('.ev-add-month').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEventModal(null, btn.dataset.month);
    });
  });

  // イベント委譲（編集・削除・完了チェック）
  const main = document.getElementById('main-content');
  main.addEventListener('click', e => {
    const editBtn = e.target.closest('.ev-edit');
    if (editBtn) { openEventModal(editBtn.dataset.id, null); return; }
    const delBtn = e.target.closest('.ev-delete');
    if (delBtn) {
      if (!confirm('この予定を削除しますか？')) return;
      deleteEvent(delBtn.dataset.id);
      renderCurrentPage();
      return;
    }
  });

  // 完了チェックボックス
  main.addEventListener('change', e => {
    const cb = e.target.closest('.ev-done-cb');
    if (cb) {
      updateEvent(cb.dataset.id, { done: cb.checked });
      const card = cb.closest('.ev-card');
      if (card) {
        card.classList.toggle('ev-card-done', cb.checked);
        card.querySelector('.ev-card-name')?.classList.toggle('ev-name-done', cb.checked);
      }
    }
  });
}

function openEventModal(id, presetMonth) {
  const ev = id ? (getEvents().find(e => e.id === id) || null) : null;
  const today = new Date();
  const defaultMonth = presetMonth || (today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0'));

  const catOpts = (appData.categories||[]).map(c =>
    `<option value="${c.id}" ${ev && ev.categoryId===c.id?'selected':''}>${esc2(c.name)}</option>`
  ).join('');

  const emojiGrid = EVENT_EMOJIS.map(em =>
    `<button type="button" class="emoji-chip ev-emoji-chip${ev&&ev.emoji===em?' selected':''}" data-emoji="${em}">${em}</button>`
  ).join('');

  const colorSwatches = EVENT_COLORS.map(c =>
    `<button type="button" class="color-swatch${ev&&ev.color===c?' selected':''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`
  ).join('');

  const modal = document.getElementById('ev-modal');
  const form  = document.getElementById('ev-form');
  if (!modal || !form) return;

  // フォームに値をセット
  document.getElementById('ev-id').value       = id || '';
  document.getElementById('ev-name').value     = ev ? ev.name : '';
  document.getElementById('ev-amount').value   = ev ? (ev.plannedAmount||'') : '';
  document.getElementById('ev-month').value    = ev ? ev.month : defaultMonth;
  document.getElementById('ev-memo').value     = ev ? (ev.memo||'') : '';
  document.getElementById('ev-type-expense').checked = !ev || ev.type !== 'income';
  document.getElementById('ev-type-income').checked  = ev && ev.type === 'income';
  document.getElementById('ev-cat').innerHTML  = catOpts;

  // 絵文字グリッド
  document.getElementById('ev-emoji-grid').innerHTML = emojiGrid;
  document.getElementById('ev-emoji-selected').value = ev ? (ev.emoji||'📅') : '📅';
  document.getElementById('ev-emoji-preview').textContent = ev ? (ev.emoji||'📅') : '📅';

  // カラー
  document.getElementById('ev-color-swatches').innerHTML = colorSwatches;
  document.getElementById('ev-color-selected').value = ev ? (ev.color||'#6366f1') : '#6366f1';

  document.getElementById('ev-modal-title').textContent = id ? 'イベントを編集' : '収支予定を追加';
  showModal(modal);

  // 絵文字選択
  document.getElementById('ev-emoji-grid').querySelectorAll('.ev-emoji-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ev-emoji-chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('ev-emoji-selected').value = btn.dataset.emoji;
      document.getElementById('ev-emoji-preview').textContent = btn.dataset.emoji;
    });
  });

  // カラー選択
  document.getElementById('ev-color-swatches').querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ev-color-swatches .color-swatch').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('ev-color-selected').value = btn.dataset.color;
    });
  });
}

function closeEventModal() {
  const modal = document.getElementById('ev-modal');
  if (modal) hideModal(modal);
}

function saveEventForm() {
  const id     = document.getElementById('ev-id').value;
  const name   = document.getElementById('ev-name').value.trim();
  const amount = Number(document.getElementById('ev-amount').value) || 0;
  const month  = document.getElementById('ev-month').value;
  const memo   = document.getElementById('ev-memo').value.trim();
  const type   = document.getElementById('ev-type-income').checked ? 'income' : 'expense';
  const catId  = document.getElementById('ev-cat').value;
  const emoji  = document.getElementById('ev-emoji-selected').value || '📅';
  const color  = document.getElementById('ev-color-selected').value || '#6366f1';

  if (!name) { showToast('名前を入力してください', 'error'); return; }
  if (!month){ showToast('月を選択してください', 'error'); return; }

  const fields = { name, plannedAmount: amount, month, memo, type, categoryId: catId, emoji, color };
  if (id) {
    updateEvent(id, fields);
    showToast('予定を更新しました', 'success');
  } else {
    addEvent({ ...fields, done: false });
    showToast('予定を追加しました', 'success');
  }
  closeEventModal();
  renderCurrentPage();
}

// ============================================================
// 月初チェックインモーダル (v6.6)
// ============================================================
function showCheckinIfNeeded() {
  if (!appData.transactions || appData.transactions.length === 0) return;
  const curYM = currentYearMonth();
  if (localStorage.getItem('kk_checkin_last') === curYM) return;
  const prevYM = adjMonth(curYM, -1);
  if (getTransactionsByMonth(prevYM).length === 0) {
    localStorage.setItem('kk_checkin_last', curYM);
    return;
  }
  setTimeout(() => openCheckinModal(prevYM), 1500);
}

function openCheckinModal(prevYM) {
  const modal = document.getElementById('checkin-modal');
  if (!modal) return;

  const [y, m] = prevYM.split('-').map(Number);
  const txs     = getTransactionsByMonth(prevYM);
  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');
  const balance = income - expense;
  const savingsRate = income > 0 ? Math.round((income - expense) / income * 100) : 0;

  // 予算達成状況
  const budgets    = appData.budgets || {};
  const budgetCats = appData.categories.filter(c => c.type === 'expense' && (budgets[c.id] || 0) > 0);
  const spentMap   = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    spentMap[t.categoryId] = (spentMap[t.categoryId] || 0) + (Number(t.amount) || 0);
  });
  const okCount   = budgetCats.filter(c => (spentMap[c.id] || 0) <= budgets[c.id]).length;
  const overCount = budgetCats.filter(c => (spentMap[c.id] || 0) >  budgets[c.id]).length;

  // 家計スコア
  const hs = calculateHealthScore(prevYM);

  // タイトルメッセージ
  let titleMsg, subMsg;
  if (hs) {
    if      (hs.total >= 80) { titleMsg = '素晴らしい月でした！🎉'; subMsg = `家計スコア ${hs.total}点。先月の家計管理は優秀です。`; }
    else if (hs.total >= 60) { titleMsg = '良い調子です！👍';       subMsg = `家計スコア ${hs.total}点。もう一歩で優良家計です。`; }
    else                     { titleMsg = '先月を振り返ろう';        subMsg = `家計スコア ${hs.total}点。今月は改善できるはず！`; }
  } else {
    titleMsg = `${y}年${m}月の振り返り`;
    subMsg   = '先月の家計をチェックしましょう。';
  }

  // ヘッダー更新
  const badge = document.getElementById('ci-month-badge');
  const title = document.getElementById('ci-title');
  const sub   = document.getElementById('ci-sub');
  if (badge) badge.textContent = `📆 ${y}年${m}月`;
  if (title) title.textContent = titleMsg;
  if (sub)   sub.textContent   = subMsg;

  // ボディ組立
  const balClass = balance >= 0 ? 'positive' : 'negative';
  const balSign  = balance >= 0 ? '+' : '';

  let html = `<div class="ci-summary-grid">
    <div class="ci-cell"><div class="ci-cell-label">収入</div><div class="ci-cell-value income">${formatMoney(income)}</div></div>
    <div class="ci-cell"><div class="ci-cell-label">支出</div><div class="ci-cell-value expense">${formatMoney(expense)}</div></div>
    <div class="ci-cell"><div class="ci-cell-label">収支</div><div class="ci-cell-value ${balClass}">${balSign}${formatMoney(balance)}</div></div>
  </div>`;

  // 貯蓄率
  if (income > 0) {
    const pct = Math.max(0, Math.min(savingsRate, 100));
    html += `<div class="ci-savings-row">
      <span class="ci-savings-label">貯蓄率</span>
      <div class="ci-savings-bar-wrap"><div class="ci-savings-fill" data-w="${pct}" style="width:0%"></div></div>
      <span class="ci-savings-pct">${pct}%</span>
    </div>`;
  }

  // 予算達成
  if (budgetCats.length > 0) {
    html += `<div class="ci-budget-row">
      <span class="ci-budget-pill ok">✓ 達成 ${okCount}件</span>
      ${overCount > 0 ? `<span class="ci-budget-pill over">⚠ 超過 ${overCount}件</span>` : ''}
    </div>`;
  }

  // 家計スコア
  if (hs) {
    html += `<div class="ci-score-row">
      <span class="ci-score-label">家計スコア</span>
      <span class="ci-score-badge">${hs.grade}（${hs.total}点）</span>
    </div>`;
  }

  // 先月のチャレンジ
  const prevChallenges = (appData.challenges || []).filter(ch => ch.period === prevYM);
  if (prevChallenges.length > 0) {
    const items = prevChallenges.slice(0, 3).map((ch, idx) => {
      const prog     = calcChallengeProgress(ch);
      const achieved = ch.type === 'budget' ? prog.actual <= prog.target : prog.actual >= prog.target;
      return `<div class="ci-challenge-item" style="--ci-ch:${idx}">
        <span aria-hidden="true">${ch.emoji || '🏆'}</span>
        <span class="ci-challenge-name">${esc2(ch.name)}</span>
        <span class="ci-badge ${achieved ? 'achieved' : 'failed'}">${achieved ? '✓ 達成' : '未達'}</span>
      </div>`;
    }).join('');
    html += `<div><div class="ci-section-title">先月のチャレンジ</div>${items}</div>`;
  }

  // 今月の収支予定
  const curYM = currentYearMonth();
  const upcoming = (appData.events || []).filter(e => e.month === curYM && !e.done);
  if (upcoming.length > 0) {
    const items = upcoming.slice(0, 4).map((ev, idx) => {
      const typeColor = ev.type === 'income' ? 'var(--income)' : 'var(--expense)';
      const accent    = ev.color || typeColor;
      const amtStr    = ev.plannedAmount ? formatMoney(ev.plannedAmount) : '';
      return `<div class="ci-event-item" style="--ci-ev-accent:${accent};--ci-ev-i:${idx}">
        <span class="ci-event-icon" aria-hidden="true">${ev.emoji || '📌'}</span>
        <span class="ci-event-name">${esc2(ev.name)}</span>
        ${amtStr ? `<span class="ci-event-amount">${amtStr}</span>` : ''}
      </div>`;
    }).join('');
    html += `<div><div class="ci-section-title">今月の収支予定</div><div class="ci-event-list">${items}</div></div>`;
  }

  const body = document.getElementById('ci-body');
  if (body) {
    body.innerHTML = html;
    // 貯蓄率バーアニメーション
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const fill = body.querySelector('.ci-savings-fill');
      if (fill) fill.style.width = fill.dataset.w + '%';
    }));
  }

  showModal(modal);
  localStorage.setItem('kk_checkin_last', curYM);

  const doClose = () => hideModal(modal);
  const closeBtn = document.getElementById('ci-close-btn');
  const okBtn    = document.getElementById('ci-ok-btn');
  if (closeBtn) closeBtn.onclick = doClose;
  if (okBtn)    okBtn.onclick    = doClose;
  modal.addEventListener('click', e => { if (e.target === modal) doClose(); }, { once: true });
}

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
      btn.innerHTML = typeof appIcon === 'function'
        ? appIcon(theme === 'dark' ? 'sun' : 'moon', 18)
        : (theme === 'dark' ? '☀️' : '🌙');
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
