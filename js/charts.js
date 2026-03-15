// ============================================================
// charts.js - グラフ描画 (Chart.js) v8.0
// ============================================================

const chartInstances = {};

// CSS変数からテーマカラーを取得
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ダークモード対応カラーセット
function getThemeColors() {
  const text   = getCSSVar('--text-muted')  || '#64748b';
  const grid   = getCSSVar('--border')      || '#e2e8f0';
  const surface = getCSSVar('--surface')    || '#ffffff';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return { text, grid, surface, isDark };
}

// 共通ツールチップ設定
function commonTooltip(callbacks) {
  return {
    backgroundColor: 'rgba(15,23,42,0.92)',
    titleColor:      '#f8fafc',
    bodyColor:       '#cbd5e1',
    borderColor:     'rgba(99,102,241,0.5)',
    borderWidth:     1,
    padding:         { x: 12, y: 8 },
    cornerRadius:    8,
    titleFont:       { size: 12, weight: '600' },
    bodyFont:        { size: 12 },
    displayColors:   true,
    boxWidth:        10,
    boxHeight:       10,
    boxPadding:      4,
    callbacks,
  };
}

// 共通アニメーション設定
const commonAnimation = {
  duration: 600,
  easing: 'easeOutQuart',
};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// ─── ドーナツグラフ中央テキストプラグイン ────────────────────
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const total = chart.config.data._centerTotal;
    if (!total && total !== 0) return;

    const { width, height } = chart.chartArea || chart;
    const cx = chart.chartArea
      ? (chart.chartArea.left + chart.chartArea.right) / 2
      : width / 2;
    const cy = chart.chartArea
      ? (chart.chartArea.top + chart.chartArea.bottom) / 2
      : height / 2;

    const ctx = chart.ctx;
    ctx.save();

    const { text: textColor } = getThemeColors();
    const formatted = total >= 10000
      ? '¥' + (total / 10000).toFixed(1) + '万'
      : formatMoney(total);

    // ラベル
    ctx.font = '500 11px var(--font, system-ui)';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('合計', cx, cy - 12);

    // 金額
    ctx.font = '700 15px var(--font, system-ui)';
    ctx.fillStyle = getCSSVar('--text') || '#0f172a';
    ctx.fillText(formatted, cx, cy + 6);

    ctx.restore();
  },
};

// プラグイン登録（重複防止）
if (!Chart.registry.plugins.get('centerText')) {
  Chart.register(centerTextPlugin);
}

// ─── グラデーション生成ヘルパー ──────────────────────────────
function makeGradient(ctx, canvas, color, alpha1 = 0.25, alpha2 = 0.02) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  // hex→rgb変換 (簡易)
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  grad.addColorStop(0,   `rgba(${r},${g},${b},${alpha1})`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},${alpha2})`);
  return grad;
}

// ─── カテゴリ別支出ドーナツグラフ ────────────────────────────
function renderDonutChart(canvasId, transactions, type, onCategoryClick) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const filtered = transactions.filter(t => t.type === type);
  const catMap = {};
  filtered.forEach(t => {
    const cat = getCategoryById(t.categoryId);
    const name  = cat ? cat.name  : 'その他';
    const color = cat ? cat.color : '#6b7280';
    if (!catMap[name]) catMap[name] = { amount: 0, color };
    catMap[name].amount += Number(t.amount) || 0;
  });

  const labels = Object.keys(catMap);
  const data   = labels.map(k => catMap[k].amount);
  const colors = labels.map(k => catMap[k].color);
  const total  = data.reduce((s, v) => s + v, 0);

  if (data.length === 0) {
    const c = canvas.getContext('2d');
    const { text } = getThemeColors();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = text;
    c.font = '13px system-ui';
    c.textAlign = 'center';
    c.fillText('データがありません', canvas.width / 2, canvas.height / 2);
    return;
  }

  const { text: textColor, surface } = getThemeColors();

  // ドリルダウンクリック対応 (v8.0)
  if (onCategoryClick) {
    canvas.classList.add('chart-clickable');
  } else {
    canvas.classList.remove('chart-clickable');
  }

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      _centerTotal: total,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'e0'),  // 軽い透過
        borderWidth: 2.5,
        borderColor: surface,
        hoverBorderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      animation: { ...commonAnimation, animateRotate: true, animateScale: false },
      onClick: onCategoryClick ? (_evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        onCategoryClick(labels[idx], colors[idx]);
      } : undefined,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11 },
            color: textColor,
            padding: 12,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: commonTooltip({
          label: ctx => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return `${ctx.label}: ${formatMoney(ctx.raw)} (${pct}%)`;
          },
        }),
        centerText: {},
      },
    },
  });
}

// ─── 月別収支棒グラフ（過去12ヶ月）────────────────────────────
function renderMonthlyBarChart(canvasId, onMonthClick) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const months      = getLast12Months();
  const incomeData  = months.map(m => calcTotal(getTransactionsByMonth(m), 'income'));
  const expenseData = months.map(m => calcTotal(getTransactionsByMonth(m), 'expense'));

  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return `${y.slice(2)}/${mo}`;
  });

  const { text: textColor, grid: gridColor } = getThemeColors();
  const clickable = typeof onMonthClick === 'function';

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '収入',
          data: incomeData,
          backgroundColor: 'rgba(5,150,105,0.75)',
          borderColor: '#059669',
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          hoverBackgroundColor: 'rgba(5,150,105,0.95)',
        },
        {
          label: '支出',
          data: expenseData,
          backgroundColor: 'rgba(220,38,38,0.75)',
          borderColor: '#dc2626',
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          hoverBackgroundColor: 'rgba(220,38,38,0.95)',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      onClick: clickable ? (event, elements) => {
        if (elements.length > 0) {
          onMonthClick(months[elements[0].index]);
        }
      } : undefined,
      onHover: clickable ? (event, elements) => {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      } : undefined,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 11 },
            color: textColor,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
          },
        },
        tooltip: commonTooltip({
          label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.raw)}`,
          footer: clickable ? () => 'クリックで詳細を表示' : undefined,
        }),
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { font: { size: 10 }, color: textColor },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          grid:  { color: gridColor + '60', drawBorder: false },
          ticks: {
            font:     { size: 10 },
            color:    textColor,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
      },
    },
  });
}

// ─── 月別残高折れ線グラフ（レポート用）──────────────────────
function renderBalanceLineChart(canvasId, months) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const balances = months.map(m => {
    const txs = getTransactionsByMonth(m);
    return calcTotal(txs, 'income') - calcTotal(txs, 'expense');
  });

  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return `${y.slice(2)}/${mo}`;
  });

  const { text: textColor, grid: gridColor } = getThemeColors();
  const lineColor = '#4f46e5';
  const ctx2d = canvas.getContext('2d');

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '収支',
        data: balances,
        borderColor: lineColor,
        backgroundColor: makeGradient(ctx2d, canvas, lineColor, 0.22, 0.01),
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: lineColor,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverBorderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      plugins: {
        legend: { display: false },
        tooltip: commonTooltip({
          label: ctx => `収支: ${formatMoney(ctx.raw)}`,
        }),
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { font: { size: 10 }, color: textColor },
          border: { color: gridColor },
        },
        y: {
          grid:  { color: gridColor + '60', drawBorder: false },
          ticks: {
            font:     { size: 10 },
            color:    textColor,
            callback: v => '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
      },
    },
  });
}

// ─── カテゴリ別横棒グラフ（レポート用）──────────────────────
function renderCategoryBarChart(canvasId, transactions, type) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const filtered = transactions.filter(t => t.type === type);
  const catMap = {};
  filtered.forEach(t => {
    const cat = getCategoryById(t.categoryId);
    const name  = cat ? cat.name  : 'その他';
    const color = cat ? cat.color : '#6b7280';
    if (!catMap[name]) catMap[name] = { amount: 0, color };
    catMap[name].amount += Number(t.amount) || 0;
  });

  const sorted = Object.entries(catMap).sort((a, b) => b[1].amount - a[1].amount);
  const labels = sorted.map(([k]) => k);
  const data   = sorted.map(([, v]) => v.amount);
  const colors = sorted.map(([, v]) => v.color + 'cc');

  if (data.length === 0) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';

  const { text: textColor, grid: gridColor } = getThemeColors();

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        hoverBackgroundColor: sorted.map(([, v]) => v.color),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      plugins: {
        legend: { display: false },
        tooltip: commonTooltip({
          label: ctx => formatMoney(ctx.raw),
        }),
      },
      scales: {
        x: {
          beginAtZero: true,
          grid:  { color: gridColor + '60', drawBorder: false },
          ticks: {
            font:     { size: 10 },
            color:    textColor,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
        y: {
          ticks:  { font: { size: 11 }, color: textColor },
          grid:   { display: false },
          border: { color: gridColor },
        },
      },
    },
  });
}

// ─── メンバー別支出横棒グラフ（レポート用）──────────────────
function renderMemberExpenseChart(canvasId, transactions) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const members = (appData.members || []);
  if (members.length === 0) return;

  // メンバー別支出集計（担当者なし分は含めない）
  const expData = members.map(m =>
    transactions
      .filter(t => t.memberId === m.id && t.type === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0)
  );
  const incData = members.map(m =>
    transactions
      .filter(t => t.memberId === m.id && t.type === 'income')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0)
  );

  const labels = members.map(m => m.name);
  const colors = members.map(m => m.color || '#6b7280');
  const { text: textColor, grid: gridColor } = getThemeColors();

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '支出',
          data: expData,
          backgroundColor: colors.map(c => c + 'cc'),
          hoverBackgroundColor: colors,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: '収入',
          data: incData,
          backgroundColor: colors.map(c => c + '55'),
          hoverBackgroundColor: colors.map(c => c + '99'),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 11 },
            color: textColor,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
          },
        },
        tooltip: commonTooltip({
          label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.raw)}`,
        }),
      },
      scales: {
        x: {
          beginAtZero: true,
          grid:  { color: gridColor + '60', drawBorder: false },
          ticks: {
            font: { size: 10 },
            color: textColor,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
        y: {
          ticks:  { font: { size: 12 }, color: textColor },
          grid:   { display: false },
          border: { color: gridColor },
        },
      },
    },
  });
}

// ─── 支払方法別ドーナツグラフ（レポート用）──────────────────
const PAYMENT_METHOD_COLORS = {
  '現金':       '#10b981',
  'クレカ':     '#6366f1',
  '口座振替':   '#8b5cf6',
  '銀行振込':   '#f59e0b',
  '電子マネー': '#06b6d4',
  'その他':     '#6b7280',
};

function renderPaymentMethodChart(canvasId, transactions) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const expTxs = transactions.filter(t => t.type === 'expense');
  const pmMap = {};
  expTxs.forEach(t => {
    const pm = t.paymentMethod || 'その他';
    if (!pmMap[pm]) pmMap[pm] = { amount: 0, count: 0 };
    pmMap[pm].amount += Number(t.amount) || 0;
    pmMap[pm].count++;
  });

  const labels = Object.keys(pmMap).sort((a, b) => pmMap[b].amount - pmMap[a].amount);
  const data   = labels.map(k => pmMap[k].amount);
  const colors = labels.map(k => PAYMENT_METHOD_COLORS[k] || '#6b7280');
  const total  = data.reduce((s, v) => s + v, 0);

  if (data.length === 0) {
    const c = canvas.getContext('2d');
    const { text } = getThemeColors();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = text;
    c.font = '13px system-ui';
    c.textAlign = 'center';
    c.fillText('データがありません', canvas.width / 2, canvas.height / 2);
    return;
  }

  const { text: textColor, surface } = getThemeColors();
  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      _centerTotal: total,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'e0'),
        borderWidth: 2.5,
        borderColor: surface,
        hoverBorderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { ...commonAnimation, animateRotate: true, animateScale: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11 },
            color: textColor,
            padding: 12,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: commonTooltip({
          label: ctx => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return `${ctx.label}: ${formatMoney(ctx.raw)} (${pct}%)`;
          },
        }),
        centerText: {},
      },
      cutout: '62%',
    },
  });
}

// ─── 前年比較グラフ（レポート用）────────────────────────────
function renderYoYChart(canvasId, year) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const prevYear = year - 1;
  const labels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  const thisExp  = labels.map((_, i) => calcTotal(getTransactionsByMonth(`${year}-${String(i+1).padStart(2,'0')}`), 'expense'));
  const prevExp  = labels.map((_, i) => calcTotal(getTransactionsByMonth(`${prevYear}-${String(i+1).padStart(2,'0')}`), 'expense'));
  const thisInc  = labels.map((_, i) => calcTotal(getTransactionsByMonth(`${year}-${String(i+1).padStart(2,'0')}`), 'income'));
  const prevInc  = labels.map((_, i) => calcTotal(getTransactionsByMonth(`${prevYear}-${String(i+1).padStart(2,'0')}`), 'income'));

  const { text: textColor, grid: gridColor } = getThemeColors();

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: `${year}年 支出`,
          data: thisExp,
          backgroundColor: 'rgba(220,38,38,0.75)',
          borderRadius: 5,
          borderSkipped: false,
          hoverBackgroundColor: 'rgba(220,38,38,0.95)',
          order: 1,
        },
        {
          label: `${prevYear}年 支出`,
          data: prevExp,
          backgroundColor: 'rgba(220,38,38,0.22)',
          borderColor: 'rgba(220,38,38,0.45)',
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
          order: 2,
        },
        {
          label: `${year}年 収入`,
          data: thisInc,
          backgroundColor: 'rgba(5,150,105,0.75)',
          borderRadius: 5,
          borderSkipped: false,
          hoverBackgroundColor: 'rgba(5,150,105,0.95)',
          order: 3,
        },
        {
          label: `${prevYear}年 収入`,
          data: prevInc,
          backgroundColor: 'rgba(5,150,105,0.22)',
          borderColor: 'rgba(5,150,105,0.45)',
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
          order: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 11 },
            color: textColor,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
          },
        },
        tooltip: commonTooltip({
          label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.raw)}`,
        }),
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { font: { size: 10 }, color: textColor, maxRotation: 0 },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          grid:  { color: gridColor + '60', drawBorder: false },
          ticks: {
            font:     { size: 10 },
            color:    textColor,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
      },
    },
  });
}

// ─── 純資産推移折れ線グラフ（資産管理ページ用）───────────────
// ─── 曜日別支出パターン分析 (v5.67 ビジュアル洗練) ─────────────────────────
function renderDayOfWeekChart(canvasId, transactions) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
  // 7曜日それぞれ個別カラー（app.jsと統一）
  const DOW_COLORS = [
    'rgba(239,68,68,0.85)',    // 日: red
    'rgba(99,102,241,0.85)',   // 月: indigo
    'rgba(139,92,246,0.85)',   // 火: violet
    'rgba(59,130,246,0.85)',   // 水: blue
    'rgba(20,184,166,0.85)',   // 木: teal
    'rgba(245,158,11,0.85)',   // 金: amber
    'rgba(8,145,178,0.85)',    // 土: cyan
  ];
  const DOW_BORDERS = [
    '#ef4444', '#6366f1', '#8b5cf6', '#3b82f6', '#14b8a6', '#f59e0b', '#0891b2',
  ];

  const dowTotals   = new Array(7).fill(0);
  const dowCounts   = new Array(7).fill(0);
  const dowDateSets = Array.from({ length: 7 }, () => new Set());

  transactions.filter(t => t.type === 'expense' && t.date).forEach(t => {
    const dow = new Date(t.date + 'T00:00:00').getDay();
    dowTotals[dow]  += Number(t.amount) || 0;
    dowCounts[dow]++;
    dowDateSets[dow].add(t.date);
  });

  const dowAvgs = dowTotals.map((total, i) => {
    const days = dowDateSets[i].size;
    return days > 0 ? Math.round(total / days) : 0;
  });

  const { text, grid } = getThemeColors();

  // 最大値インデックスを取得してバーをハイライト
  const maxAvg = Math.max(...dowAvgs);
  const hoverColors = DOW_COLORS.map((c, i) => dowAvgs[i] === maxAvg ? DOW_BORDERS[i] : c);

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: DOW_LABELS,
      datasets: [{
        label: '平均支出（円）',
        data: dowAvgs,
        backgroundColor: DOW_COLORS,
        borderColor: DOW_BORDERS,
        borderWidth: 2,
        borderRadius: 9,
        borderSkipped: false,
        hoverBackgroundColor: hoverColors,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { ...commonAnimation, duration: 800 },
      plugins: {
        legend: { display: false },
        tooltip: commonTooltip({
          title: ctx => ctx[0].label + '曜日の平均支出',
          label: ctx => ` ${formatMoney(ctx.raw)} / 取引日`,
        }),
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: text, font: { size: 13, weight: '700' } },
          border: { display: false },
        },
        y: {
          grid: { color: grid },
          ticks: {
            color: text,
            font: { size: 11 },
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
      },
    },
  });
}

function renderNetWorthChart(canvasId) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const months = getLast12Months();
  const assets = appData.assets || [];

  const netWorthData = months.map(m => {
    const [y, mo] = m.split('-');
    const lastDay = new Date(Number(y), Number(mo), 0).getDate();
    const endDate = `${m}-${String(lastDay).padStart(2, '0')}`;
    return assets.reduce((sum, asset) => {
      if (!asset.entries || asset.entries.length === 0) return sum;
      const valid  = asset.entries.filter(e => e.date <= endDate);
      if (valid.length === 0) return sum;
      const sorted = [...valid].sort((a, b) => b.date.localeCompare(a.date));
      const bal    = Number(sorted[0].balance) || 0;
      return sum + toJPY(bal, asset.currency || 'JPY');
    }, 0);
  });

  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return `${y.slice(2)}/${mo}`;
  });

  const { text: textColor, grid: gridColor } = getThemeColors();
  const lineColor = '#6366f1';
  const ctx2d = canvas.getContext('2d');

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '純資産',
        data: netWorthData,
        borderColor: lineColor,
        backgroundColor: makeGradient(ctx2d, canvas, lineColor, 0.20, 0.01),
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: lineColor,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverBorderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      plugins: {
        legend: { display: false },
        tooltip: commonTooltip({
          label: ctx => `純資産: ${formatMoney(ctx.raw)}`,
        }),
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { font: { size: 10 }, color: textColor },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: false,
          grid:  { color: gridColor + '60', drawBorder: false },
          ticks: {
            font:     { size: 10 },
            color:    textColor,
            callback: v => {
              if (Math.abs(v) >= 10000) return '¥' + (v / 10000).toFixed(0) + '万';
              return '¥' + v.toLocaleString('ja-JP');
            },
          },
          border: { display: false },
        },
      },
    },
  });
}

// ─── カテゴリ別支出トレンドグラフ (v5.68) ────────────────────
function renderCategoryTrendChart(canvasId, selectedCats, year) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const { text: textColor, grid: gridColor } = getThemeColors();
  const ctx2d = canvas.getContext('2d');

  const datasets = (selectedCats || []).map(cat => {
    const data = labels.map((_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, '0')}`;
      return getTransactionsByMonth(month)
        .filter(t => t.type === 'expense' && t.categoryId === cat.id)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    });
    return {
      label: cat.name,
      data,
      borderColor: cat.color,
      backgroundColor: makeGradient(ctx2d, canvas, cat.color, 0.30, 0.03),
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 8,
      pointBackgroundColor: cat.color,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointHoverBorderWidth: 2,
      fill: true,
      tension: 0.4,
    };
  });

  if (!datasets.length) return;

  // クロスヘアプラグイン（ホバー時の垂直ライン）
  const ctCrosshairPlugin = {
    id: 'ctCrosshair',
    afterDraw(chart) {
      if (!chart.tooltip?._active?.length) return;
      const x = chart.tooltip._active[0].element.x;
      const { top, bottom } = chart.chartArea;
      const c = chart.ctx;
      c.save();
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, bottom);
      c.lineWidth = 1;
      c.strokeStyle = gridColor;
      c.setLineDash([4, 4]);
      c.stroke();
      c.restore();
    },
  };

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'line',
    data: { labels, datasets },
    plugins: [ctCrosshairPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutCubic' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 11 },
            color: textColor,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
          },
        },
        tooltip: commonTooltip({
          label: ctx => ` ${ctx.dataset.label}: ${formatMoney(ctx.raw)}`,
          footer: items => {
            if (items.length <= 1) return null;
            const total = items.reduce((s, i) => s + (i.raw || 0), 0);
            return `合計: ${formatMoney(total)}`;
          },
        }),
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { font: { size: 10 }, color: textColor, maxRotation: 0 },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          grid:  { color: gridColor },
          ticks: {
            font: { size: 10 },
            color: textColor,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { color: gridColor, dash: [3, 3] },
        },
      },
    },
  });
}

// ─── 固定費 vs 変動費 ドーナツグラフ (v5.70) ─────────────────────────
function renderFixedVariableDonut(canvasId, allTxs) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { text, surface } = getThemeColors();
  const fixedIds = new Set(appData.categories.filter(c => c.isFixed).map(c => c.id));
  const expTxs   = (allTxs || []).filter(t => t.type === 'expense');
  const fixedAmt = expTxs.filter(t => fixedIds.has(t.categoryId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const varAmt   = expTxs.filter(t => !fixedIds.has(t.categoryId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const total    = fixedAmt + varAmt;

  if (!total) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['固定費', '変動費'],
      datasets: [{
        data: [fixedAmt, varAmt],
        backgroundColor: ['#6366f1', '#10b981'],
        borderColor: surface,
        borderWidth: 3,
        hoverOffset: 10,
      }],
      _centerTotal: total,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: text, font: { size: 12 }, padding: 12, usePointStyle: true },
        },
        tooltip: commonTooltip({
          label: ctx => {
            const pct = total > 0 ? Math.round(ctx.raw / total * 100) : 0;
            return ` ${ctx.label}: ${formatMoney(ctx.raw)} (${pct}%)`;
          },
        }),
      },
      cutout: '62%',
    },
    plugins: [centerTextPlugin],
  });
}

// ─── 月次 固定費率推移 折れ線グラフ (v5.70) ──────────────────────────
function renderFixedVariableTrend(canvasId, year) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { text, grid, surface, isDark } = getThemeColors();
  const months12 = [];
  for (let m = 1; m <= 12; m++) months12.push(`${year}-${String(m).padStart(2,'0')}`);

  const fixedIds = new Set(appData.categories.filter(c => c.isFixed).map(c => c.id));

  const fixedData = [];
  const varData   = [];
  const rateData  = [];

  months12.forEach(ym => {
    const mTxs   = (typeof getTransactionsByMonth === 'function' ? getTransactionsByMonth(ym) : appData.transactions.filter(t => t.date && t.date.startsWith(ym))).filter(t => t.type === 'expense');
    const mFixed = mTxs.filter(t => fixedIds.has(t.categoryId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const mVar   = mTxs.filter(t => !fixedIds.has(t.categoryId)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const mTotal = mFixed + mVar;
    fixedData.push(mFixed);
    varData.push(mVar);
    rateData.push(mTotal > 0 ? Math.round(mFixed / mTotal * 100) : null);
  });

  const labels = months12.map((_, i) => `${i + 1}月`);
  const ctx    = canvas.getContext('2d');

  // グラデーション塗り（固定費）
  const gFixed = ctx.createLinearGradient(0, 0, 0, 220);
  gFixed.addColorStop(0, 'rgba(99,102,241,0.28)');
  gFixed.addColorStop(1, 'rgba(99,102,241,0.02)');

  const gVar = ctx.createLinearGradient(0, 0, 0, 220);
  gVar.addColorStop(0, 'rgba(16,185,129,0.22)');
  gVar.addColorStop(1, 'rgba(16,185,129,0.02)');

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: '固定費',
          data: fixedData,
          backgroundColor: 'rgba(99,102,241,0.80)',
          borderRadius: 5,
          order: 2,
        },
        {
          type: 'bar',
          label: '変動費',
          data: varData,
          backgroundColor: 'rgba(16,185,129,0.72)',
          borderRadius: 5,
          order: 2,
        },
        {
          type: 'line',
          label: '固定費率(%)',
          data: rateData,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.12)',
          borderWidth: 2.5,
          pointBackgroundColor: '#f59e0b',
          pointRadius: 4,
          tension: 0.35,
          fill: false,
          yAxisID: 'yRate',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: text, font: { size: 11 }, padding: 10, usePointStyle: true },
        },
        tooltip: commonTooltip({
          label: ctx => {
            if (ctx.dataset.yAxisID === 'yRate') return ` 固定費率: ${ctx.raw}%`;
            return ` ${ctx.dataset.label}: ${formatMoney(ctx.raw)}`;
          },
        }),
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: text, maxRotation: 0 },
          border: { color: grid },
          stacked: true,
        },
        y: {
          beginAtZero: true,
          stacked: true,
          grid: { color: grid },
          ticks: {
            font: { size: 10 }, color: text,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { color: grid, dash: [3, 3] },
        },
        yRate: {
          position: 'right',
          beginAtZero: true,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 10 }, color: '#f59e0b', callback: v => v + '%' },
          border: { color: grid },
        },
      },
    },
  });
}

// ─── タグ別支出ドーナツグラフ (v6.0) ─────────────────────────
function renderTagChart(canvasId, transactions) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const expTxs = transactions.filter(t => t.type === 'expense');
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

  const labels = Object.keys(tagMap).sort((a, b) => tagMap[b].amount - tagMap[a].amount);
  const data   = labels.map(k => tagMap[k].amount);
  const total  = data.reduce((s, v) => s + v, 0);

  if (data.length === 0) {
    const c = canvas.getContext('2d');
    const { text } = getThemeColors();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = text;
    c.font = '13px system-ui';
    c.textAlign = 'center';
    c.fillText('データがありません', canvas.width / 2, canvas.height / 2);
    return;
  }

  function tagColor(tag) {
    if (tag === 'タグなし') return '#94a3b8';
    const palette = ['#6366f1','#0891b2','#059669','#d97706','#7c3aed','#db2777','#ea580c','#0d9488','#e11d48','#64748b'];
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xFFFF;
    return palette[h % palette.length];
  }

  const colors = labels.map(tagColor);
  const { text: textColor, surface } = getThemeColors();

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      _centerTotal: total,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'e0'),
        borderWidth: 2.5,
        borderColor: surface,
        hoverBorderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { ...commonAnimation, animateRotate: true, animateScale: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11 },
            color: textColor,
            padding: 12,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: commonTooltip({
          label: ctx => {
            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            return `${ctx.label}: ${formatMoney(ctx.raw)} (${pct}%)`;
          },
        }),
        centerText: {},
      },
      cutout: '62%',
    },
  });
}
