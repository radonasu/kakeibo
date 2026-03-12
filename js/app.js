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
  calendarMonth: currentYearMonth(),  // v5.38: カレンダービュー
  calendarDay: null,                  // v5.38: 選択中の日付
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
  }
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

  const gradeColors = { S: '#7c3aed', A: '#059669', B: '#2563eb', C: '#d97706', D: '#dc2626' };
  const gradeColor  = gradeColors[hs.grade] || 'var(--primary)';
  const gaugeOffset = (163.36 * (1 - hs.total / 100)).toFixed(2);

  const itemsHtml = hs.items.map((item, i) => {
    const ratio    = item.score / item.max;
    const pctW     = Math.round(ratio * 100);
    const barColor = ratio >= 0.8 ? gradeColor : ratio >= 0.5 ? '#f59e0b' : '#ef4444';
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
</div>`;
}

function renderDashboard() {
  // 初回ユーザー（データなし）→ オンボーディング画面
  if (appData.transactions.length === 0) return renderOnboarding();

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
  const budgetSection = budgetItems.length > 0 ? `
<div class="card">
  <div class="card-header-row">
    <h3 class="card-title">📊 今月の予算</h3>
    <button class="btn-link" onclick="navigate('categories')">予算設定 →</button>
  </div>
  <div class="budget-grid">${budgetItems.join('')}</div>
</div>` : '';

  // 目標ウィジェット（v5.31）
  const activeGoals = (appData.goals || []).filter(g => !g.achievedAt);
  const goalSection = activeGoals.length > 0 ? `
<div class="card">
  <div class="card-header-row">
    <h3 class="card-title">🎯 貯蓄目標</h3>
    <button class="btn-link" onclick="navigate('goals')">すべて見る →</button>
  </div>
  <div class="goal-dash-list">
    ${activeGoals.slice(0, 3).map(g => {
      const tgt = Number(g.targetAmount) || 0;
      const svd = Number(g.savedAmount) || 0;
      const pct = tgt > 0 ? Math.min(Math.round(svd / tgt * 100), 100) : 0;
      const clr = g.color || '#6366f1';
      const MINI_C = 81.68; // 2π×13（ミニリング r=13）
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
  </div>
</div>` : '';

  // サブスクウィジェット（v5.43）
  const activeSubs = getSubscriptions().filter(s => s.isActive !== false);
  const subTotal = calcMonthlySubTotal();
  const upcomingSubs = [...activeSubs]
    .sort((a, b) => subDaysUntilBilling(a) - subDaysUntilBilling(b))
    .slice(0, 3);
  const subSection = activeSubs.length > 0 ? `
<div class="card sub-widget-card">
  <div class="card-header-row">
    <h3 class="card-title">📱 サブスク管理</h3>
    <button class="btn-link" onclick="navigate('subscriptions')">すべて見る →</button>
  </div>
  <div class="sub-widget-header">
    <div class="sub-widget-total-label">月間合計</div>
    <div class="sub-widget-total-amount js-countup" data-value="${subTotal}">${formatMoney(subTotal)}</div>
  </div>
  <div class="sub-widget-list">
    ${upcomingSubs.map(s => {
      const days = subDaysUntilBilling(s);
      const urgentCls = days <= 3 ? 'sub-urgent' : days <= 7 ? 'sub-soon' : '';
      return `<div class="sub-widget-item ${urgentCls}">
        <div class="sub-widget-icon" style="background:${s.color || '#6366f1'}22;color:${s.color || '#6366f1'}">${s.emoji || '📱'}</div>
        <div class="sub-widget-info">
          <div class="sub-widget-name">${esc2(s.name)}</div>
          <div class="sub-widget-next">${days === 0 ? '今日請求' : `${days}日後に請求`}</div>
        </div>
        <div class="sub-widget-amount">${formatMoney(s.cycle === 'yearly' ? s.amount : s.amount)}<span class="sub-cycle-badge">${s.cycle === 'yearly' ? '/年' : '/月'}</span></div>
      </div>`;
    }).join('')}
  </div>
</div>` : '';

  // ポイントウィジェット（v5.47）
  const allPoints = getPoints();
  const totalPointsValue = calcTotalPointsValue();
  const expiringPoints = allPoints.filter(p => {
    const d = pointDaysUntilExpiry(p);
    return d !== null && d <= 30 && (Number(p.balance) || 0) > 0;
  }).sort((a, b) => pointDaysUntilExpiry(a) - pointDaysUntilExpiry(b));
  const pointSection = allPoints.length > 0 ? `
<div class="card pt-widget-card">
  <div class="card-header-row">
    <h3 class="card-title">🎫 ポイント残高</h3>
    <button class="btn-link" onclick="navigate('points')">すべて見る →</button>
  </div>
  <div class="pt-widget-header">
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
        <div class="pt-widget-icon" style="background:${p.color||'#6366f1'}22;color:${p.color||'#6366f1'}">${p.emoji||'🎫'}</div>
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
      <div class="pt-widget-icon" style="background:${p.color||'#6366f1'}22;color:${p.color||'#6366f1'}">${p.emoji||'🎫'}</div>
      <div class="pt-widget-info">
        <div class="pt-widget-name">${esc2(p.name)}</div>
        <div class="pt-widget-exp">${formatMoney(Math.round((Number(p.balance)||0)*(Number(p.pointValue)||1)))}</div>
      </div>
      <div class="pt-widget-balance">${Number(p.balance).toLocaleString('ja-JP')}<span class="pt-unit">pt</span></div>
    </div>`).join('')}
  </div>`}
</div>` : '';

  // ほしいものリストウィジェット（v5.51）
  const wishItems = getWishlistItems(false).sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 };
    return (p[a.priority] ?? 1) - (p[b.priority] ?? 1);
  });
  const wishTotal = wishItems.reduce((s, w) => s + (Number(w.price) || 0), 0);
  const wishSection = wishItems.length > 0 ? `
<div class="card wish-widget-card">
  <div class="card-header-row">
    <h3 class="card-title">🛍️ ほしいものリスト</h3>
    <button class="btn-link" onclick="navigate('wishlist')">すべて見る →</button>
  </div>
  <div class="wish-widget-header">
    <div class="wish-widget-total-label">合計予算</div>
    <div class="wish-widget-total-amount js-countup" data-value="${wishTotal}">${formatMoney(wishTotal)}</div>
  </div>
  <div class="wish-widget-list">
    ${wishItems.slice(0, 3).map(w => {
      const priLabel = { high: '高', medium: '中', low: '低' }[w.priority] || '中';
      const priCls   = { high: 'wl-pri-high', medium: 'wl-pri-medium', low: 'wl-pri-low' }[w.priority] || 'wl-pri-medium';
      const highCls  = w.priority === 'high' ? ' wl-high' : '';
      return `<div class="wish-widget-item${highCls}">
        <div class="wish-widget-icon">${w.emoji || '🛍️'}</div>
        <div class="wish-widget-info">
          <div class="wish-widget-name">${esc2(w.name)}</div>
          <span class="wl-priority-badge ${priCls}">${priLabel}</span>
        </div>
        <div class="wish-widget-price">${formatMoney(w.price || 0)}</div>
      </div>`;
    }).join('')}
  </div>
</div>` : '';

  // 家計スコアカード（v5.49）
  const healthScoreSection = renderHealthScoreCard(appState.month);

  // インサイトセクション（v5.40）
  const insights = generateInsights(appState.month);
  const insightSection = insights.length > 0 ? `
<div class="card insight-card">
  <div class="card-header-row">
    <h3 class="card-title">💡 今月のインサイト</h3>
  </div>
  <div class="insight-list">
    ${insights.map(ins => `
    <div class="insight-item insight-${ins.type}">
      <span class="insight-icon">${ins.icon}</span>
      <div class="insight-body">
        <div class="insight-title">${ins.title}</div>
        <div class="insight-desc">${ins.desc}</div>
      </div>
    </div>`).join('')}
  </div>
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
  <div class="page-header-right">
    ${monthSel}
    <button class="btn btn-share" id="btn-share-summary" title="月次サマリーをシェア">📤 シェア</button>
  </div>
</div>

<div class="summary-cards">
  <div class="card summary-card income">
    <div class="summary-label">今月の収入</div>
    <div class="summary-amount js-countup" data-value="${income}">${formatMoney(income)}</div>
    ${diffSign(income, prevIncome)}
  </div>
  <div class="card summary-card expense">
    <div class="summary-label">今月の支出</div>
    <div class="summary-amount js-countup" data-value="${expense}">${formatMoney(expense)}</div>
    ${diffSign(expense, prevExpense)}
  </div>
  <div class="card summary-card balance ${balance >= 0 ? 'positive' : 'negative'}">
    <div class="summary-label">今月の残高</div>
    <div class="summary-amount js-countup" data-value="${balance}">${formatMoney(balance)}</div>
  </div>
</div>

${healthScoreSection}

${insightSection}

${pointSection}

${wishSection}

${subSection}

${budgetSection}

${goalSection}

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
      <tbody>${recentRows || `<tr><td colspan="5"><div class="empty-month-state"><span class="empty-month-icon">📭</span><span class="empty-month-msg">今月の取引はまだありません</span><button class="empty-month-btn" onclick="document.getElementById('global-fab').click()">＋ 収支を追加する</button></div></td></tr>`}</tbody>
    </table>
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
  animateGoalRings(); // v5.32
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

// 取引一行HTML生成ヘルパー
function renderTxRow(t) {
  const cat = getCategoryById(t.categoryId);
  const mem = getMemberById(t.memberId);
  const isIncome = t.type === 'income';
  const icon = cat ? (CAT_ICONS[cat.name] || '📌') : '';
  const badgeIcon = icon ? `<span class="cat-badge-icon">${icon}</span>` : '';
  return `<tr data-id="${t.id}" data-type="${t.type}">
      <td>${formatDate(t.date)}</td>
      <td><span class="cat-badge" style="background:${cat ? cat.color : '#6b7280'}20;color:${cat ? cat.color : '#6b7280'}">${badgeIcon}${cat ? esc2(cat.name) : '—'}</span></td>
      <td class="memo-cell">${esc2(t.memo || '—')}</td>
      <td class="tx-col-pay">${esc2(t.paymentMethod || '—')}</td>
      <td class="tx-col-mem">${mem ? esc2(mem.name) : '—'}</td>
      <td class="amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatMoney(t.amount)}</td>
      <td class="actions">
        <button class="btn-icon edit-tx" data-id="${t.id}" title="編集">✏️</button>
        <button class="btn-icon delete-tx" data-id="${t.id}" title="削除">🗑️</button>
      </td>
    </tr>`;
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
  return `<select id="tx-month" class="month-sel">${allOpt}${opts}</select>`;
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
      return `<tr class="tx-month-group-row">
        <td colspan="7"><div class="tx-month-group-inner">
          <span class="tx-month-group-label">${y}年${parseInt(m)}月</span>
          <span class="tx-month-group-summary">
            <span class="income">+${formatMoney(gi)}</span>
            <span class="expense">-${formatMoney(ge)}</span>
            <span class="tx-month-group-count">${groups[ym].length}件</span>
          </span>
        </div></td>
      </tr>${groups[ym].map(t => renderTxRow(t)).join('')}`;
    }).join('');
  } else {
    rows = txs.map(t => renderTxRow(t)).join('');
  }

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

  const searchAllBtn = (!isAll && f.search)
    ? `<button id="search-all-btn" class="btn btn-ghost tx-search-all-btn">全期間</button>`
    : '';

  return `
<div class="page-header">
  <h1 class="page-title">収支一覧</h1>
  <button class="btn btn-primary" id="open-add-modal">＋ 追加</button>
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
</div>

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
</div>

<div class="card">
  <div class="table-wrap">
    <table class="tx-table">
      <thead><tr><th>日付</th><th>カテゴリ</th><th>摘要</th><th class="tx-col-pay">支払方法</th><th class="tx-col-mem">担当者</th><th>金額</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty">取引がありません</td></tr>'}</tbody>
    </table>
  </div>
</div>

${renderTxModal()}`;
}

function bindTransactions() {
  // 月
  on('tx-month', 'change', e => { appState.month = e.target.value; renderCurrentPage(); });
  // 全期間で検索ボタン
  on('search-all-btn', 'click', () => { appState.month = 'all'; renderCurrentPage(); });
  // フィルター
  on('filter-cat',    'change', e => { appState.txFilter.category = e.target.value; renderCurrentPage(); });
  on('filter-mem',    'change', e => { appState.txFilter.member   = e.target.value; renderCurrentPage(); });
  on('filter-type',   'change', e => { appState.txFilter.type     = e.target.value; renderCurrentPage(); });
  let _searchTimer = null;
  on('filter-search', 'input', e => {
    appState.txFilter.search = e.target.value;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => renderCurrentPage(), 300);
  });
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
      </div>
      <div class="form-group">
        <label>金額（円）</label>
        <input type="number" id="tx-amount" value="${src ? src.amount : ''}" placeholder="0" min="1" required>
        <div class="amount-presets">
          <button type="button" class="btn-preset" data-amount="500">¥500</button>
          <button type="button" class="btn-preset" data-amount="1000">¥1,000</button>
          <button type="button" class="btn-preset" data-amount="3000">¥3,000</button>
          <button type="button" class="btn-preset" data-amount="5000">¥5,000</button>
          <button type="button" class="btn-preset" data-amount="10000">¥10,000</button>
        </div>
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
        <div id="memo-cat-hint" class="memo-cat-hint" style="display:none"></div>
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
  on('modal-save', 'click', saveTxFromModal);

  // Enterキーで保存 / Escapeで閉じる
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeTxModal();
    } else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      saveTxFromModal();
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
      color: activeType === 'expense' ? '#6b7280' : '#059669',
    });
    // チップグリッドを更新して新しいカテゴリを選択状態にする
    const hi = document.getElementById('tx-category');
    if (hi) hi.value = newCat.id;
    renderCatChips(activeType, newCat.id);
    document.getElementById('quick-cat-form').style.display = 'none';
    document.getElementById('qcat-name').value  = '';
    document.getElementById('qcat-yayoi').value = '';
  });

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
    hint.style.display = 'none';
  });
}

function closeTxModal() {
  const modal = document.getElementById('tx-modal');
  if (modal) hideModal(modal);
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
  // 予算アラートチェック
  checkBudgetAlerts(appState.month);
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
</div>

<div id="sec-monthly-charts" class="charts-row">
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
  <div class="card" style="flex:1">
    <h3 class="card-title">支出カテゴリ詳細</h3>
    <div class="chart-wrap" style="height:300px">
      <canvas id="report-cat-expense"></canvas>
    </div>
  </div>
</div>

<div id="sec-payment" class="charts-row">
  <div class="card chart-card">
    <h3 class="card-title">💳 支払方法別支出</h3>
    <div class="chart-wrap" style="height:260px">
      <canvas id="report-payment-donut"></canvas>
    </div>
  </div>
  <div class="card" style="flex:1;min-width:0">
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
            const pmColors = { '現金': '#10b981', 'クレカ': '#6366f1', '口座振替': '#8b5cf6', '銀行振込': '#f59e0b', '電子マネー': '#06b6d4', 'その他': '#6b7280' };
            const total = Object.values(pmMap).reduce((s, v) => s + v.amount, 0);
            if (!total) return '<tr><td colspan="4" class="empty">データがありません</td></tr>';
            return Object.entries(pmMap)
              .sort((a, b) => b[1].amount - a[1].amount)
              .map(([pm, v]) => {
                const color = pmColors[pm] || '#6b7280';
                const pct = total > 0 ? Math.round(v.amount / total * 100) : 0;
                return `<tr>
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
              <td><span class="color-dot" style="background:${m.color || '#6b7280'}"></span>${esc2(m.name)}</td>
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
            <td><span class="color-dot" style="background:#94a3b8"></span>担当者なし</td>
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
  <div class="chart-wrap" style="height:280px;margin:var(--sp-4) 0 var(--sp-2)">
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
</div>`;
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

  setTimeout(() => {
    renderBalanceLineChart('report-bar', months12);
    renderDonutChart('report-donut', allTxs, 'expense');
    renderCategoryBarChart('report-cat-expense', allTxs, 'expense');
    renderPaymentMethodChart('report-payment-donut', allTxs);
    renderMemberExpenseChart('report-member-bar', allTxs);
    renderYoYChart('report-yoy', year);
  }, 50);

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
    <p class="hint" style="margin-bottom:10px">固定費や繰り返しの取引を登録。収支一覧画面でワンタップ入力できます。</p>
    ${templateRows ? `<div class="table-wrap">
      <table class="tx-table">
        <thead><tr><th>名前</th><th>種別</th><th>カテゴリ</th><th>金額</th><th></th></tr></thead>
        <tbody>${templateRows}</tbody>
      </table>
    </div>` : '<p class="empty" style="text-align:center;padding:12px 0;color:var(--text-muted)">テンプレートがありません</p>'}
  </div>
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
    <h3 class="card-title">💱 為替レート設定</h3>
    <p class="hint" style="margin-bottom:14px">外貨建て資産を日本円に換算するレートです（1外貨 = X円）。自動取得ボタンで最新レートを即時反映できます。</p>
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
</div>

<!-- ── パネル4: その他 ── -->
<div class="settings-panel" id="stp-other">
  <div class="card">
    <h3 class="card-title">🔔 予算アラート通知</h3>
    <p class="hint" style="margin-bottom:12px">予算の80%到達・超過時にブラウザ通知でお知らせします。</p>
    <div id="notif-status-area"></div>
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
        <button class="btn btn-ghost btn-sm" id="btn-test-notif" style="margin-top:8px">テスト通知を送る</button>`;
      } else if (perm === 'denied') {
        html = '<p class="hint" style="color:var(--expense)">❌ 通知がブロックされています。ブラウザの設定から通知を許可してください。</p>';
      } else {
        html = `<p class="hint" style="margin-bottom:10px">通知を許可すると、予算超過時に自動でお知らせします。</p>
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

async function callGeminiVision(base64, mimeType, categoryNames) {
  const apiKey  = appData.settings.geminiApiKey;
  const proxyUrl = APP_CONFIG.geminiProxy?.url;

  if (!proxyUrl) {
    throw new Error('Geminiプロキシが未設定です。管理者に連絡してください。');
  }

  const categoryListStr = (categoryNames || []).join('、');

  const prompt = `この画像/PDFからレシート・領収書の情報を抽出してください。
画像が横向き・逆さま・斜めに回転している場合でも、正しく向きを判断して読み取ってください。
複数のレシートが含まれる場合は、すべてのレシートを個別に抽出してください。
各レシートについてJSON形式で回答してください。

[
  {
    "date": "YYYY-MM-DD（日付が読み取れない場合は今日の日付 ${todayStr()}）",
    "amount": 税込み合計金額（数値のみ、カンマなし）,
    "storeName": "店名または施設名（不明な場合は空文字）",
    "taxRate": 消費税率（10・8・0のいずれか。軽減税率の場合は8）,
    "category": "以下のカテゴリから最も適切なもの1つを選択: ${categoryListStr}"
  }
]

必ずJSON配列として回答してください。レシートが1枚でも配列に入れてください。`;

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

function getAssetCurrentBalance(asset) {
  if (!asset.entries || asset.entries.length === 0) return null;
  return [...asset.entries].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function getTotalNetWorth() {
  return (appData.assets || []).reduce((sum, a) => {
    const e = getAssetCurrentBalance(a);
    if (!e) return sum;
    return sum + toJPY(Number(e.balance) || 0, a.currency);
  }, 0);
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
  const assetCards = assets.map(asset => {
    const typeInfo = ASSET_TYPES[asset.type] || ASSET_TYPES.other;
    const currency = asset.currency || 'JPY';
    const isForeign = currency !== 'JPY';
    const currInfo = getCurrencyInfo(currency);
    const latest = getAssetCurrentBalance(asset);
    const balance = latest ? Number(latest.balance) : null;
    const balanceJPY = balance !== null ? toJPY(balance, currency) : null;
    const dateLabel = latest ? `${formatDate(latest.date)} 時点` : '残高未登録';
    const entries = [...(asset.entries || [])].sort((a, b) => b.date.localeCompare(a.date));

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
      : `<div class="asset-balance">—</div>`;

    return `
<div class="card asset-card">
  <div class="asset-card-header">
    <div class="asset-info">
      <span class="asset-type-badge" style="background:${typeInfo.color}20;color:${typeInfo.color}">${typeInfo.icon} ${typeInfo.label}</span>
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
      ${balanceDisplay}
      <div class="asset-date-label">${dateLabel}</div>
      ${rateHint}
    </div>
    <button class="btn btn-primary btn-sm asset-add-entry" data-id="${asset.id}">＋ 残高を更新</button>
  </div>
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
  <div class="card summary-card balance ${totalNetWorth >= 0 ? 'positive' : 'negative'}">
    <div class="summary-label">💎 純資産合計（円換算）</div>
    <div class="summary-amount js-countup" data-value="${totalNetWorth}">${formatMoney(totalNetWorth)}</div>
    ${diffHtml}
    ${(() => {
      const foreignTotal = getForeignAssetsTotalJPY();
      return foreignTotal > 0 ? `<div class="asset-foreign-hint">うち外貨資産 ${formatMoney(foreignTotal)}</div>` : '';
    })()}
  </div>
</div>

${assets.length > 0 ? `
<div class="card chart-card">
  <h3 class="card-title">純資産推移（12ヶ月）</h3>
  <div class="chart-wrap" style="height:220px">
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

  function goalCard(g, isDone) {
    const target    = Number(g.targetAmount) || 0;
    const saved     = Number(g.savedAmount)  || 0;
    const pct       = target > 0 ? Math.min(Math.round(saved / target * 100), 100) : 0;
    const remaining = Math.max(target - saved, 0);
    const color     = g.color || '#6366f1';
    const emoji     = g.emoji || '🎯';
    const accentStyle = isDone
      ? `style="--goal-accent:var(--success)"`
      : `style="--goal-accent:${color}"`;

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

  const activeCards   = active.map(g => goalCard(g, false)).join('');
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
  // 前月の空セル
  for (let i = 0; i < startDow; i++) {
    cells += `<div class="cal-cell cal-empty"></div>`;
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
    cells += `<div class="cal-cell${isSelected ? ' selected' : ''} heat-${heat}" data-date="${dateStr}">${inner}</div>`;
  }

  const monthName = `${year}年${month}月`;
  const balSign = totalBalance >= 0 ? '+' : '';
  const balCls  = totalBalance >= 0 ? 'income' : 'expense';

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
    body.innerHTML = txs.map(t => {
      const cat = getCategoryById(t.categoryId);
      const mem = getMemberById(t.memberId);
      const isIncome = t.type === 'income';
      const dotColor = (cat && cat.color) ? cat.color : (isIncome ? '#059669' : '#e11d48');
      return `
        <div class="cal-panel-tx">
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
function applyRecurringTransactions() {
  const ym = currentYearMonth();
  const templates = appData.templates || [];
  let count = 0;

  templates.forEach(tpl => {
    if (!tpl.isRecurring || !tpl.recurringDay) return;
    if (tpl.lastApplied === ym) return; // 当月は適用済み

    const [year, month] = ym.split('-').map(Number);
    // 月末より大きい日付は月末日にクランプ
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

    // 適用済みマークを更新
    updateTemplate(tpl.id, { lastApplied: ym });
    count++;
  });

  if (count > 0) {
    setTimeout(() => showToast(`🔁 ${count}件の繰り返し取引を自動追加しました`), 1200);
  }
  return count;
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
    console.warn('通知送信失敗:', e);
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
        e.target.id !== 'hamburger') {
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

  // グローバルFAB（どのページからでも取引追加）
  const fab = document.getElementById('global-fab');
  if (fab) fab.addEventListener('click', () => openTxModal(null));

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

  // 繰り返し取引の自動適用（描画前に実行、当月未適用分を追加）
  applyRecurringTransactions();

  // 起動時予算アラートチェック（1秒後、描画安定後）
  setTimeout(() => checkBudgetAlerts(appState.month), 1000);

  // スワイプジェスチャー（v5.22）
  initSwipeGestures();

  // ピンチズーム無効化（PWAアプリ固定表示）
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
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
<div class="sub-card ${urgentCls} ${inactiveCls}" data-id="${s.id}" style="--sub-i:${idx || 0};--sub-progress:${progress}%">
  <div class="sub-card-color-bar" style="background:${s.color || '#6366f1'}"></div>
  <div class="sub-card-icon" style="background:${s.color || '#6366f1'}22;color:${s.color || '#6366f1'}">${s.emoji || '📱'}</div>
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
          <p class="hint" style="margin-bottom:var(--sp-4)">
            家計簿CSVを選択してください。アプリ独自形式（CSVダウンロードで出力したファイル）は自動認識します。
            銀行明細など他形式も列マッピングで取り込めます。
          </p>
          <div class="csv-format-list">
            <div class="csv-format-item">
              <span class="csv-badge csv-badge-auto">自動</span>
              <span>アプリ独自形式（日付・種別・カテゴリ・金額・摘要）</span>
            </div>
            <div class="csv-format-item">
              <span class="csv-badge csv-badge-manual">手動</span>
              <span>銀行明細・他の家計簿アプリのCSV（列マッピングを指定）</span>
            </div>
          </div>
          <label class="btn btn-primary csv-file-label" style="margin-top:var(--sp-5);display:inline-flex;align-items:center;gap:6px;cursor:pointer">
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
      <p class="hint" style="margin:var(--sp-2) 0 var(--sp-3)">※「収入」「入金」「IN」を含むセルを収入と判別します</p>
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
    const accent = p.color || '#6366f1';
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
  const priAccent = p => ({ high: '#ef4444', medium: '#f59e0b', low: '#10b981' }[p] || '#6366f1');

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
    ${done.map(w => `<div class="wl-archive-item">
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
