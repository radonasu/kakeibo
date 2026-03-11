// ============================================================
// charts.js - グラフ描画 (Chart.js) v5.20
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
function renderDonutChart(canvasId, transactions, type) {
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
function renderMonthlyBarChart(canvasId) {
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

// ─── 純資産推移折れ線グラフ（資産管理ページ用）───────────────
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
