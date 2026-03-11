// ============================================================
// charts.js - グラフ描画 (Chart.js)
// ============================================================

const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// カテゴリ別支出ドーナツグラフ
function renderDonutChart(canvasId, transactions, type) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const filtered = transactions.filter(t => t.type === type);
  const catMap = {};
  filtered.forEach(t => {
    const cat = getCategoryById(t.categoryId);
    const name = cat ? cat.name : 'その他';
    const color = cat ? cat.color : '#6b7280';
    if (!catMap[name]) catMap[name] = { amount: 0, color };
    catMap[name].amount += Number(t.amount) || 0;
  });

  const labels = Object.keys(catMap);
  const data = labels.map(k => catMap[k].amount);
  const colors = labels.map(k => catMap[k].color);

  if (data.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('データがありません', canvas.width / 2, canvas.height / 2);
    return;
  }

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11 },
            padding: 10,
            boxWidth: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${formatMoney(ctx.raw)}`,
          },
        },
      },
    },
  });
}

// 月別収支棒グラフ（過去12ヶ月）
function renderMonthlyBarChart(canvasId) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const months = getLast12Months();
  const incomeData = months.map(m => calcTotal(getTransactionsByMonth(m), 'income'));
  const expenseData = months.map(m => calcTotal(getTransactionsByMonth(m), 'expense'));

  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return `${y.slice(2)}/${mo}`;
  });

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '収入',
          data: incomeData,
          backgroundColor: 'rgba(5, 150, 105, 0.7)',
          borderColor: '#059669',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: '支出',
          data: expenseData,
          backgroundColor: 'rgba(220, 38, 38, 0.7)',
          borderColor: '#dc2626',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 10 },
            callback: v => '¥' + v.toLocaleString('ja-JP'),
          },
        },
      },
    },
  });
}

// 月別残高折れ線グラフ（レポート用）
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

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '収支',
        data: balances,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#4f46e5',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `収支: ${formatMoney(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: {
          ticks: {
            font: { size: 10 },
            callback: v => '¥' + v.toLocaleString('ja-JP'),
          },
        },
      },
    },
  });
}

// カテゴリ別横棒グラフ（レポート用）
function renderCategoryBarChart(canvasId, transactions, type) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const filtered = transactions.filter(t => t.type === type);
  const catMap = {};
  filtered.forEach(t => {
    const cat = getCategoryById(t.categoryId);
    const name = cat ? cat.name : 'その他';
    const color = cat ? cat.color : '#6b7280';
    if (!catMap[name]) catMap[name] = { amount: 0, color };
    catMap[name].amount += Number(t.amount) || 0;
  });

  const sorted = Object.entries(catMap).sort((a, b) => b[1].amount - a[1].amount);
  const labels = sorted.map(([k]) => k);
  const data = sorted.map(([, v]) => v.amount);
  const colors = sorted.map(([, v]) => v.color);

  if (data.length === 0) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => formatMoney(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            font: { size: 10 },
            callback: v => '¥' + v.toLocaleString('ja-JP'),
          },
        },
        y: { ticks: { font: { size: 11 } } },
      },
    },
  });
}

// 純資産推移折れ線グラフ（資産管理ページ用）
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
      const valid = asset.entries.filter(e => e.date <= endDate);
      if (valid.length === 0) return sum;
      const sorted = [...valid].sort((a, b) => b.date.localeCompare(a.date));
      return sum + (Number(sorted[0].balance) || 0);
    }, 0);
  });

  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return `${y.slice(2)}/${mo}`;
  });

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '純資産',
        data: netWorthData,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#6366f1',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `純資産: ${formatMoney(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: {
          beginAtZero: false,
          ticks: {
            font: { size: 10 },
            callback: v => {
              if (Math.abs(v) >= 10000) return '¥' + (v / 10000).toFixed(0) + '万';
              return '¥' + v.toLocaleString('ja-JP');
            },
          },
        },
      },
    },
  });
}
