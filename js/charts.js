// ============================================================
// charts.js - グラフ描画 (Chart.js) v8.3
// ============================================================

const chartInstances = {};

// 日本語フォントスタック（canvas context.font / Chart.js defaults 共用）
const CHART_FONT_FAMILY = "'Hiragino Kaku Gothic ProN','Hiragino Sans','BIZ UDGothic','Meiryo','Yu Gothic UI',sans-serif";

// CSS変数からテーマカラーを取得
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// CSS変数からpx値を整数で取得（チャートフォントサイズ用）
function getCSSVarInt(name) {
  return parseInt(getCSSVar(name)) || 0;
}

// ダークモード対応カラーセット＋フォントサイズ
function getThemeColors() {
  const text   = getCSSVar('--text-muted')  || '#64748b';
  const grid   = getCSSVar('--border')      || '#e2e8f0';
  const surface = getCSSVar('--surface')    || '#ffffff';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  // チャートフォントサイズ（デザインシステムCSS変数より取得）
  const fs2xs  = getCSSVarInt('--fs-2xs') || 10;   /* 極小ラベル・tick */
  const fs3xs  = getCSSVarInt('--fs-3xs') || 11;   /* 超極小：凡例・ラベル */
  const fsXs   = getCSSVarInt('--fs-xs')  || 12;   /* 極小：一部凡例・ツールチップ */
  const fsSm   = getCSSVarInt('--fs-sm')  || 13;   /* 小：強調tick・canvas直描画 */
  const fsMd   = getCSSVarInt('--fs-md')  || 15;   /* 中基本：donut中央金額 */
  return { text, grid, surface, isDark, fs2xs, fs3xs, fsXs, fsSm, fsMd };
}

// 共通ツールチップ設定
// v28.31: チャート視覚改善#7 — Chart.js canvas tooltip を「glassmorphism風 frosted pill」に格上げ（全14チャート一括）。
//   ① padding {x:14,y:10}→{x:18,y:14}（呼吸感を一段強化、内容と枠の余白が広がりリッチに）
//   ② cornerRadius 10→14（モダン丸み拡大・ピル感が増し氷柱のような優雅さ）
//   ③ backgroundColor light alpha 0.95→0.90 / dark alpha 0.98→0.92（半透明度を上げ frosted glass 感を強化）
//   ④ borderColor: light は --primary を維持しつつ alpha 0xcc→0xee（より solid）/ dark は --primary-end (lavender) に切替（ダーク側のブランドアクセントカラー追従）+ borderWidth 1.5→2（線が立つ）
//   ⑤ titleFont size fsXs→fsSm・weight '700'→'800'（タイトル一段大きく & blacker bold）+ titleMarginBottom 6→10（タイトル下の間隔）+ bodySpacing 4→5
//   ⑥ footerMarginTop 6→9（フッター区切り強化）+ footerFont weight '400'→'500'（コール to アクション微強調）
//   ⑦ displayColors のスウォッチ boxWidth/Height 12→14・boxPadding 6→8（円スウォッチ拡大で凡例可読性UP）
//   ⑧ caretSize 7→9・caretPadding 8→11（吹き出し三角が一段浮き、tooltip と canvas の距離感がよりエレガント）
// v26.22: tooltip 第1次高級化（borderColor 80→cc / padding 12→14 / cornerRadius 8→10 / titleFont 600→700 / displayColors square→round / caret 5→7）。
function commonTooltip(callbacks) {
  const { isDark, fsXs, fsSm, fs2xs } = getThemeColors();
  return {
    // v28.31: light 0.95→0.90 / dark 0.98→0.92（frosted glass 感強化）
    // ダークモード: #0f172a背景ではツールチップが埋没するため中間色に切替 (v19.34)
    backgroundColor: isDark ? 'rgba(51,65,85,0.92)' : 'rgba(15,23,42,0.90)',
    titleColor:      '#f8fafc',
    bodyColor:       isDark ? '#e2e8f0' : '#cbd5e1',
    footerColor:     '#94a3b8',
    // v28.31: light primary 0xcc→0xee（より solid）/ dark は --primary-end (lavender) に切替
    borderColor:     isDark
      ? (getCSSVar('--primary-end') || '#a78bfa') + 'ee'
      : (getCSSVar('--primary') || '#7c3aed') + 'ee',
    borderWidth:     2,
    padding:         { x: 18, y: 14 },
    cornerRadius:    14,
    titleFont:       { size: fsSm, weight: '800' },
    bodyFont:        { size: fsXs },
    footerFont:      { size: fs2xs, weight: '500' },
    titleMarginBottom: 10,
    bodySpacing:     5,
    footerMarginTop: 9,
    displayColors:   true,
    usePointStyle:   true,
    boxWidth:        14,
    boxHeight:       14,
    boxPadding:      8,
    caretSize:       9,
    caretPadding:    11,
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
// v26.28: 中央テキストにテーマ追従 glow を追加。
//   ① ライト: ラベル「合計」に primary alpha 0.16 / blur 6 の subtle 紫 glow（視認可能だが背景に溶け込む静かな発光）
//   ② ライト: 金額テキストに primary alpha 0.18 / blur 8 の紫 glow + ctx.fillStyle は --text のまま（コントラスト保持）
//   ③ ダーク: primary-end (lavender) で同等パラメータの glow に差し替え（ダーク側のブランドアクセントカラー追従）
//   全ドーナツチャート（renderDonutChart / renderPaymentMethodChart / renderTagChart 等）で
//   中央テキストが薄く発光し、v26.27 の hover arc halo（外周）とドーナツ中心の glow が呼応する完成形演出に。
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

    const { text: textColor, fs3xs, fsMd, isDark } = getThemeColors();
    const formatted = total >= 10000
      ? '¥' + (total / 10000).toFixed(1) + '万'
      : formatMoney(total);

    // v26.28: テーマ追従 glow 色（ライト: primary / ダーク: primary-end）
    const glowSrc = isDark
      ? (getCSSVar('--primary-end') || '#a78bfa')
      : (getCSSVar('--primary') || '#7c3aed');

    // ラベル「合計」: subtle 紫 glow blur 6 / alpha 0.16
    ctx.font = '500 ' + fs3xs + 'px ' + CHART_FONT_FAMILY;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = hexToRgba(glowSrc, 0.16);
    ctx.shadowBlur = 6;
    ctx.fillText('合計', cx, cy - 12);

    // 金額: 紫 glow blur 8 / alpha 0.18（ラベルより少し強め）
    ctx.font = '700 ' + fsMd + 'px ' + CHART_FONT_FAMILY;
    ctx.fillStyle = getCSSVar('--text') || '#0f172a';
    ctx.shadowColor = hexToRgba(glowSrc, 0.18);
    ctx.shadowBlur = 8;
    ctx.fillText(formatted, cx, cy + 6);

    ctx.restore();
  },
};

// プラグイン登録（重複防止）
if (!Chart.registry.plugins.get('centerText')) {
  Chart.register(centerTextPlugin);
}

// Chart.js グローバルフォント設定（日本語フォントスタック）
Chart.defaults.font.family = CHART_FONT_FAMILY;

// ─── 色変換ヘルパー (hex→rgba) ────────────────────────────
// 8桁hex (#rrggbbaa) も #rrggbb と同様に rgb 部分のみ取り出して指定 alpha を付与
function hexToRgba(color, alpha) {
  if (!color || typeof color !== 'string' || !color.startsWith('#')) return color;
  const h = color.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── グラデーション生成ヘルパー (line area / 3-stop richer fade) ──
// v26.21: 中間stopを追加し色帯の伸びを強化。既存呼び出しの数値はそのまま流用可
function makeGradient(ctx, canvas, color, alpha1 = 0.25, alpha2 = 0.02) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  const top   = hexToRgba(color, alpha1);
  const mid   = hexToRgba(color, alpha1 * 0.45);
  const bottom = hexToRgba(color, alpha2);
  grad.addColorStop(0,    top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1,    bottom);
  return grad;
}

// ─── 縦方向バー用グラデーション (canvas全体・単色データセット用) ──
// 上部 alpha 高 / 下部 alpha 低 でバー全体に光沢感
function makeBarVertGrad(ctx, canvas, color, alphaTop = 0.92, alphaBottom = 0.55) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, hexToRgba(color, alphaTop));
  grad.addColorStop(1, hexToRgba(color, alphaBottom));
  return grad;
}

// ─── バーごとグラデーション (scriptable: dataIndex 毎の色配列対応) ──
// indexAxis: 'y' (横棒) は base→x、'x' (縦棒) は y→base に勾配
function barFillScript(colorOrArr, alphaHigh = 0.92, alphaLow = 0.5) {
  return (ctx) => {
    const color = Array.isArray(colorOrArr) ? colorOrArr[ctx.dataIndex] : colorOrArr;
    if (!color) return null;
    const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
    const bar  = meta && meta.data && meta.data[ctx.dataIndex];
    if (!bar) return hexToRgba(color, alphaHigh);
    const isHorizontal = ctx.chart.options && ctx.chart.options.indexAxis === 'y';
    const c2 = ctx.chart.ctx;
    let grad;
    if (isHorizontal) {
      grad = c2.createLinearGradient(bar.base, 0, bar.x, 0);
      grad.addColorStop(0, hexToRgba(color, alphaLow));
      grad.addColorStop(1, hexToRgba(color, alphaHigh));
    } else {
      grad = c2.createLinearGradient(0, bar.y, 0, bar.base);
      grad.addColorStop(0, hexToRgba(color, alphaHigh));
      grad.addColorStop(1, hexToRgba(color, alphaLow));
    }
    return grad;
  };
}

// ─── 共通クロスヘアプラグイン (line/area/bar系チャート用 hover時のガイドライン) ──
// v26.24: renderCategoryTrendChart に閉じていた ctCrosshair を共通化し、全ライン系チャート
// （renderBalanceLineChart / renderNetWorthChart / renderCategoryTrendChart /
//  renderFixedVariableTrend / renderDebtSimChart）に適用。
// v26.25: 月別時系列バー系 3 種（renderMonthlyBarChart / renderPaymentTrendChart /
//  renderYoYChart）にも展開。さらに category center に正確にスナップさせるため、
//  chart.scales.x.getPixelForValue(_active[0].index) を優先使用し、
//  失敗時 (or scale 未対応時) のみ従来の element.x にフォールバック。
//  これにより grouped bar （4 dataset per category 等）でも crosshair が
//  「カテゴリの幾何学的中央」を貫く（旧来は最初の dataset の bar 中心 = 左寄り）。
// v26.26: 横棒系（indexAxis:'y'）に展開するため orientation 引数（'vertical' | 'horizontal'）を追加。
//  'horizontal' 指定時はカテゴリ軸（y）の getPixelForValue(idx) を優先し、chartArea の left→right に
//  水平方向のクロスヘアを描画。renderCategoryBarChart / renderMemberExpenseChart に適用予定。
//   ① strokeStyle: gridColor → primary alpha 0.42 で brand 色のクロスヘアに格上げ（テーマ追従）
//   ② lineWidth 1 → 1.2 で線が立つ（hairline すぎず認識しやすい）
//   ③ dash [4,4] → [5,4] で破線リズム微強化
//   ④ shadow（primary alpha 0.18 / blur 6）追加でクロスヘアに微発光
// hover中のみ描画（chart.tooltip._active ある時のみ afterDraw）。各チャート毎に新規 instance を
// 生成しテーマ色をクロージャに保持する（ライト/ダーク切替時は再描画で最新色が適用される）。
// ─── Arc Hover Glow（v26.27: doughnut 系 hover halo 共通プラグイン）──────
// active arc の外周に色付きハロー弧 + shadowBlur で発光させる。
// renderDonutChart / renderFixedVariableDonut / renderTagChart で共用。
function makeArcHoverGlowPlugin(alpha = 0.45, blur = 14) {
  return {
    id: 'arcHoverGlow',
    afterDatasetsDraw(chart) {
      if (chart.config.type !== 'doughnut' && chart.config.type !== 'pie') return;
      const active = chart.tooltip?._active;
      if (!active?.length) return;
      const idx = active[0].index;
      const meta = chart.getDatasetMeta(0);
      const arc = meta?.data?.[idx];
      if (!arc) return;
      const ds = chart.data.datasets[0];
      let color = '#7c3aed';
      const bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[idx] : ds.backgroundColor;
      const hbg = Array.isArray(ds.hoverBackgroundColor) ? ds.hoverBackgroundColor[idx] : ds.hoverBackgroundColor;
      if (typeof hbg === 'string') color = hbg;
      else if (typeof bg === 'string') color = bg;
      const props = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'outerRadius'], true);
      if (!Number.isFinite(props.outerRadius)) return;
      const c = chart.ctx;
      c.save();
      c.beginPath();
      c.arc(props.x, props.y, props.outerRadius + 4, props.startAngle, props.endAngle);
      c.lineWidth = 2.5;
      c.strokeStyle = hexToRgba(color, alpha);
      c.shadowColor = hexToRgba(color, alpha * 0.75);
      c.shadowBlur = blur;
      c.lineCap = 'round';
      c.stroke();
      c.restore();
    },
  };
}

// ─── Bar Hover Glow（v26.27: 縦棒系 hover top outline + 発光）──────
// active bar の上辺〜両側辺をなぞる丸角アウトラインに shadowBlur で発光。
// renderDayOfWeekChart で適用（曜日 hover 強調）。
function makeBarHoverGlowPlugin(alpha = 0.55, blur = 14) {
  return {
    id: 'barHoverGlow',
    afterDatasetsDraw(chart) {
      const active = chart.tooltip?._active;
      if (!active?.length) return;
      const idx = active[0].index;
      const meta = chart.getDatasetMeta(0);
      const bar = meta?.data?.[idx];
      if (!bar) return;
      const ds = chart.data.datasets[0];
      let color = '#7c3aed';
      const border = Array.isArray(ds.borderColor) ? ds.borderColor[idx] : ds.borderColor;
      if (typeof border === 'string') color = border;
      const props = bar.getProps(['x', 'y', 'width', 'height', 'base'], true);
      if (!Number.isFinite(props.x) || !Number.isFinite(props.y)) return;
      const left = props.x - props.width / 2;
      const top = Math.min(props.y, props.base);
      const h = Math.abs(props.base - props.y);
      if (h < 2) return;
      const r = Math.min(9, props.width / 2);
      const c = chart.ctx;
      c.save();
      c.shadowColor = hexToRgba(color, alpha);
      c.shadowBlur = blur;
      c.lineWidth = 2;
      c.strokeStyle = hexToRgba(color, alpha);
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(left, top + h);
      c.lineTo(left, top + r);
      c.quadraticCurveTo(left, top, left + r, top);
      c.lineTo(left + props.width - r, top);
      c.quadraticCurveTo(left + props.width, top, left + props.width, top + r);
      c.lineTo(left + props.width, top + h);
      c.stroke();
      c.restore();
    },
  };
}

function makeCrosshairPlugin(strokeColor, glowColor, orientation = 'vertical') {
  return {
    id: 'crosshair',
    afterDraw(chart) {
      const active = chart.tooltip?._active;
      if (!active?.length) return;
      const idx = active[0].index;
      const c = chart.ctx;
      const { left, right, top, bottom } = chart.chartArea;
      let x1, y1, x2, y2;
      if (orientation === 'horizontal') {
        // 横棒系: カテゴリ軸（y）の中心を貫く水平線（chartArea の left→right）。
        const yScale = chart.scales?.y;
        let y;
        if (yScale && typeof yScale.getPixelForValue === 'function' && Number.isFinite(idx)) {
          const v = yScale.getPixelForValue(idx);
          y = Number.isFinite(v) ? v : active[0].element.y;
        } else {
          y = active[0].element.y;
        }
        x1 = left;  y1 = y;
        x2 = right; y2 = y;
      } else {
        // 縦棒/ライン系: カテゴリ軸（x）の中心を貫く垂直線。
        // line/stacked bar では element.x と一致するため挙動は変わらない。
        const xScale = chart.scales?.x;
        let x;
        if (xScale && typeof xScale.getPixelForValue === 'function' && Number.isFinite(idx)) {
          const v = xScale.getPixelForValue(idx);
          x = Number.isFinite(v) ? v : active[0].element.x;
        } else {
          x = active[0].element.x;
        }
        x1 = x; y1 = top;
        x2 = x; y2 = bottom;
      }
      c.save();
      if (glowColor) {
        c.shadowColor = glowColor;
        c.shadowBlur = 6;
      }
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.lineWidth = 1.2;
      c.strokeStyle = strokeColor;
      c.setLineDash([5, 4]);
      c.stroke();
      c.restore();
    },
  };
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
    const color = cat ? cat.color : getCSSVar('--text-muted');
    if (!catMap[name]) catMap[name] = { amount: 0, color };
    catMap[name].amount += Number(t.amount) || 0;
  });

  const labels = Object.keys(catMap);
  const data   = labels.map(k => catMap[k].amount);
  const colors = labels.map(k => catMap[k].color);
  const total  = data.reduce((s, v) => s + v, 0);

  if (data.length === 0) {
    const c = canvas.getContext('2d');
    const { text, fsSm } = getThemeColors();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = text;
    c.font = fsSm + 'px ' + CHART_FONT_FAMILY;
    c.textAlign = 'center';
    c.fillText('データがありません', canvas.width / 2, canvas.height / 2);
    return;
  }

  const { text: textColor, surface, fs3xs, fsXs } = getThemeColors();

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
        backgroundColor: colors.map(c => hexToRgba(c, 0.88)),
        hoverBackgroundColor: colors.map(c => hexToRgba(c, 0.98)),
        borderWidth: 2.5,
        borderColor: surface,
        hoverBorderWidth: 4,
        hoverOffset: 10,
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
            font: { size: fs3xs },
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
    plugins: [makeArcHoverGlowPlugin(0.46, 14)],
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

  const { text: textColor, grid: gridColor, fs2xs, fs3xs, fsXs } = getThemeColors();
  const incomeClr  = getCSSVar('--income');
  const expenseClr = getCSSVar('--expense');
  const primaryClr = getCSSVar('--primary');
  const clickable  = typeof onMonthClick === 'function';
  const ctx2d = canvas.getContext('2d');

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '収入',
          data: incomeData,
          backgroundColor: makeBarVertGrad(ctx2d, canvas, incomeClr, 0.92, 0.55),
          borderColor: incomeClr,
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          hoverBackgroundColor: makeBarVertGrad(ctx2d, canvas, incomeClr, 1, 0.78),
        },
        {
          label: '支出',
          data: expenseData,
          backgroundColor: makeBarVertGrad(ctx2d, canvas, expenseClr, 0.92, 0.55),
          borderColor: expenseClr,
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          hoverBackgroundColor: makeBarVertGrad(ctx2d, canvas, expenseClr, 1, 0.78),
        },
      ],
    },
    // v26.25: 月別収支グループ化バーに crosshair 適用（カテゴリ中心追従）。
    plugins: [makeCrosshairPlugin(hexToRgba(primaryClr, 0.42), hexToRgba(primaryClr, 0.18))],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
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
            font: { size: fs3xs },
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
          ticks: { font: { size: fs2xs }, color: textColor },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          grid:  { color: gridColor + '60' },
          ticks: {
            font:     { size: fs2xs },
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
function renderBalanceLineChart(canvasId, months, onMonthClick) {
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

  const { text: textColor, grid: gridColor, surface, fs2xs, fs3xs, fsXs } = getThemeColors();
  const lineColor = getCSSVar('--primary');
  const ctx2d = canvas.getContext('2d');

  const tooltipCallbacks = {
    label: ctx => `収支: ${formatMoney(ctx.raw)}`,
  };
  if (onMonthClick) {
    tooltipCallbacks.footer = () => 'クリックで詳細を表示';
  }

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '収支',
        data: balances,
        borderColor: lineColor,
        backgroundColor: makeGradient(ctx2d, canvas, lineColor, 0.32, 0.01),
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: lineColor,
        pointBorderColor: surface,
        pointBorderWidth: 2,
        pointHoverBorderWidth: 3,
      }],
    },
    plugins: [makeCrosshairPlugin(hexToRgba(lineColor, 0.42), hexToRgba(lineColor, 0.18))],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: commonTooltip(tooltipCallbacks),
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { font: { size: fs2xs }, color: textColor },
          border: { color: gridColor },
        },
        y: {
          grid:  { color: gridColor + '60' },
          ticks: {
            font:     { size: fs2xs },
            color:    textColor,
            callback: v => '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
      },
      ...(onMonthClick ? {
        onClick: (_evt, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          if (months[idx]) onMonthClick(months[idx]);
        },
        onHover: (_evt, elements) => {
          canvas.style.cursor = elements.length ? 'pointer' : 'default';
        },
      } : {}),
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
    const color = cat ? cat.color : getCSSVar('--text-muted');
    if (!catMap[name]) catMap[name] = { amount: 0, color };
    catMap[name].amount += Number(t.amount) || 0;
  });

  const sorted = Object.entries(catMap).sort((a, b) => b[1].amount - a[1].amount);
  const labels    = sorted.map(([k]) => k);
  const data      = sorted.map(([, v]) => v.amount);
  const baseColors = sorted.map(([, v]) => v.color);

  if (data.length === 0) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';

  const { text: textColor, grid: gridColor, fs2xs, fs3xs, fsXs } = getThemeColors();
  const primaryClr = getCSSVar('--primary');

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: barFillScript(baseColors, 0.92, 0.45),
        hoverBackgroundColor: barFillScript(baseColors, 1, 0.7),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    // v26.26: 横棒系（indexAxis:'y'）に水平方向クロスヘア適用。
    plugins: [makeCrosshairPlugin(hexToRgba(primaryClr, 0.42), hexToRgba(primaryClr, 0.18), 'horizontal')],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: commonTooltip({
          label: ctx => formatMoney(ctx.raw),
        }),
      },
      scales: {
        x: {
          beginAtZero: true,
          grid:  { color: gridColor + '60' },
          ticks: {
            font:     { size: fs2xs },
            color:    textColor,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
        y: {
          ticks:  { font: { size: fs3xs }, color: textColor },
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
  const colors = members.map(m => m.color || getCSSVar('--text-muted'));
  const { text: textColor, grid: gridColor, fs2xs, fs3xs, fsXs } = getThemeColors();
  const primaryClr = getCSSVar('--primary');

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '支出',
          data: expData,
          backgroundColor: barFillScript(colors, 0.92, 0.45),
          hoverBackgroundColor: barFillScript(colors, 1, 0.7),
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: '収入',
          data: incData,
          backgroundColor: barFillScript(colors, 0.42, 0.18),
          hoverBackgroundColor: barFillScript(colors, 0.6, 0.32),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    // v26.26: メンバー別横棒（grouped bar・indexAxis:'y'）に水平方向クロスヘア適用。
    // yScale.getPixelForValue(idx) を優先しメンバー行の幾何中央を貫通する。
    plugins: [makeCrosshairPlugin(hexToRgba(primaryClr, 0.42), hexToRgba(primaryClr, 0.18), 'horizontal')],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: fs3xs },
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
          grid:  { color: gridColor + '60' },
          ticks: {
            font: { size: fs2xs },
            color: textColor,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
        y: {
          ticks:  { font: { size: fsXs }, color: textColor },
          grid:   { display: false },
          border: { color: gridColor },
        },
      },
    },
  });
}

// ─── 支払方法別ドーナツグラフ（レポート用）──────────────────
// app.js でも参照するためグローバル定数として定義
const PAYMENT_METHOD_COLORS = {
  '現金':       '#10b981',
  'クレカ':     '#6366f1',
  '口座振替':   '#8b5cf6',
  '銀行振込':   '#f59e0b',
  '電子マネー': '#06b6d4',
  'その他':     '#6b7280',
};

// 曜日別カラー定数（app.jsと共用・7曜日固有色）
// renderDayOfWeekChart および app.js のテーブル描画で参照
const DOW_COLORS_HEX = [
  '#ef4444',  // 日: red
  '#6366f1',  // 月: indigo
  '#8b5cf6',  // 火: violet
  '#3b82f6',  // 水: blue
  '#14b8a6',  // 木: teal
  '#f59e0b',  // 金: amber
  '#0891b2',  // 土: cyan
];

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
  const colors = labels.map(k => PAYMENT_METHOD_COLORS[k] || getCSSVar('--text-muted'));
  const total  = data.reduce((s, v) => s + v, 0);

  if (data.length === 0) {
    const c = canvas.getContext('2d');
    const { text, fsSm } = getThemeColors();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = text;
    c.font = fsSm + 'px ' + CHART_FONT_FAMILY;
    c.textAlign = 'center';
    c.fillText('データがありません', canvas.width / 2, canvas.height / 2);
    return;
  }

  const { text: textColor, surface, fs3xs, fsXs } = getThemeColors();
  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      _centerTotal: total,
      datasets: [{
        data,
        backgroundColor: colors.map(c => hexToRgba(c, 0.88)),
        hoverBackgroundColor: colors.map(c => hexToRgba(c, 0.98)),
        borderWidth: 2.5,
        borderColor: surface,
        hoverBorderWidth: 4,
        hoverOffset: 10,
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
            font: { size: fs3xs },
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
    plugins: [makeArcHoverGlowPlugin(0.46, 14)],
  });
}

// ─── 支払方法別 月次推移スタック棒グラフ（v9.3）─────────────
function renderPaymentTrendChart(canvasId, year) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const months  = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const labels  = months.map(m => `${parseInt(m.split('-')[1])}月`);
  const pmKeys  = ['現金', 'クレカ', '口座振替', '銀行振込', '電子マネー', 'その他'];

  const pmData = {};
  pmKeys.forEach(pm => {
    pmData[pm] = months.map(m =>
      getTransactionsByMonth(m)
        .filter(t => t.type === 'expense' && (t.paymentMethod || 'その他') === pm)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );
  });

  const activeKeys = pmKeys.filter(pm => pmData[pm].some(v => v > 0));
  if (activeKeys.length === 0) {
    const c = canvas.getContext('2d');
    const { text, fsSm } = getThemeColors();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = text;
    c.font = fsSm + 'px ' + CHART_FONT_FAMILY;
    c.textAlign = 'center';
    c.fillText('データがありません', canvas.width / 2, canvas.height / 2);
    return;
  }

  const { text: textColor, grid: gridColor, fs2xs, fs3xs, fsXs } = getThemeColors();
  const primaryClr = getCSSVar('--primary');
  const ctx2d = canvas.getContext('2d');

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'bar',
    data: {
      labels,
      datasets: activeKeys.map(pm => {
        const baseColor = PAYMENT_METHOD_COLORS[pm] || getCSSVar('--text-muted');
        return {
          label: pm,
          data: pmData[pm],
          backgroundColor: makeBarVertGrad(ctx2d, canvas, baseColor, 0.92, 0.55),
          hoverBackgroundColor: makeBarVertGrad(ctx2d, canvas, baseColor, 1, 0.78),
          borderColor:      baseColor,
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
        };
      }),
    },
    // v26.25: 支払方法 stacked bar（年間 12 ヶ月分）に crosshair 適用。
    plugins: [makeCrosshairPlugin(hexToRgba(primaryClr, 0.42), hexToRgba(primaryClr, 0.18))],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: fs3xs },
            color: textColor,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
          },
        },
        tooltip: commonTooltip({
          label: ctx => `${ctx.dataset.label}: ${formatMoney(ctx.raw)}`,
          footer: ctxList => {
            const total = ctxList.reduce((s, c) => s + c.raw, 0);
            return total > 0 ? `合計: ${formatMoney(total)}` : undefined;
          },
        }),
      },
      scales: {
        x: {
          stacked: true,
          grid:  { display: false },
          ticks: { font: { size: fs2xs }, color: textColor },
          border: { color: gridColor },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid:  { color: gridColor + '60' },
          ticks: {
            font: { size: fs2xs },
            color: textColor,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
      },
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

  const { text: textColor, grid: gridColor, fs2xs, fs3xs, fsXs } = getThemeColors();
  const expClr = getCSSVar('--expense');
  const incClr = getCSSVar('--income');
  const primaryClr = getCSSVar('--primary');
  const ctx2d = canvas.getContext('2d');

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: `${year}年 支出`,
          data: thisExp,
          backgroundColor: makeBarVertGrad(ctx2d, canvas, expClr, 0.92, 0.55),
          borderRadius: 6,
          borderSkipped: false,
          hoverBackgroundColor: makeBarVertGrad(ctx2d, canvas, expClr, 1, 0.78),
          order: 1,
        },
        {
          label: `${prevYear}年 支出`,
          data: prevExp,
          backgroundColor: makeBarVertGrad(ctx2d, canvas, expClr, 0.30, 0.14),
          borderColor: expClr + '73',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
          order: 2,
        },
        {
          label: `${year}年 収入`,
          data: thisInc,
          backgroundColor: makeBarVertGrad(ctx2d, canvas, incClr, 0.92, 0.55),
          borderRadius: 6,
          borderSkipped: false,
          hoverBackgroundColor: makeBarVertGrad(ctx2d, canvas, incClr, 1, 0.78),
          order: 3,
        },
        {
          label: `${prevYear}年 収入`,
          data: prevInc,
          backgroundColor: makeBarVertGrad(ctx2d, canvas, incClr, 0.30, 0.14),
          borderColor: incClr + '73',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
          order: 4,
        },
      ],
    },
    // v26.25: 前年比較 grouped bar（4 dataset/category）に crosshair 適用。
    // category center 追従によりグループの幾何中央を貫く。
    plugins: [makeCrosshairPlugin(hexToRgba(primaryClr, 0.42), hexToRgba(primaryClr, 0.18))],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: fs3xs },
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
          ticks: { font: { size: fs2xs }, color: textColor, maxRotation: 0 },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          grid:  { color: gridColor + '60' },
          ticks: {
            font:     { size: fs2xs },
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
  // グローバル定数 DOW_COLORS_HEX を参照（app.js と共用）
  const DOW_BORDERS = DOW_COLORS_HEX;

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

  const { text, grid, fs2xs, fs3xs, fsSm } = getThemeColors();

  // 最大値ハイライト: 最大値バーは alpha を引き上げて目立たせる
  const maxAvg = Math.max(...dowAvgs);
  const isMax  = dowAvgs.map(v => v === maxAvg && v > 0);

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: DOW_LABELS,
      datasets: [{
        label: '平均支出（円）',
        data: dowAvgs,
        backgroundColor: (ctx) => {
          const i = ctx.dataIndex;
          const high = isMax[i] ? 1 : 0.88;
          const low  = isMax[i] ? 0.65 : 0.45;
          return barFillScript(DOW_COLORS_HEX[i], high, low)(ctx);
        },
        hoverBackgroundColor: (ctx) => {
          return barFillScript(DOW_COLORS_HEX[ctx.dataIndex], 1, 0.7)(ctx);
        },
        borderColor: DOW_BORDERS,
        borderWidth: 2,
        borderRadius: 9,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { ...commonAnimation, duration: 800 },
      interaction: { mode: 'index', intersect: false },
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
          ticks: { color: text, font: { size: fsSm, weight: '700' } },
          border: { display: false },
        },
        y: {
          grid: { color: grid + '60' },
          ticks: {
            color: text,
            font: { size: fs3xs },
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { display: false },
        },
      },
    },
    plugins: [makeBarHoverGlowPlugin(0.55, 14)],
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

  const { text: textColor, grid: gridColor, surface, fs2xs, fs3xs, fsXs } = getThemeColors();
  const lineColor = getCSSVar('--primary');
  const ctx2d = canvas.getContext('2d');

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '純資産',
        data: netWorthData,
        borderColor: lineColor,
        backgroundColor: makeGradient(ctx2d, canvas, lineColor, 0.30, 0.01),
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: lineColor,
        pointBorderColor: surface,
        pointBorderWidth: 2,
        pointHoverBorderWidth: 3,
      }],
    },
    plugins: [makeCrosshairPlugin(hexToRgba(lineColor, 0.42), hexToRgba(lineColor, 0.18))],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: commonTooltip({
          label: ctx => `純資産: ${formatMoney(ctx.raw)}`,
        }),
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { font: { size: fs2xs }, color: textColor },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: false,
          grid:  { color: gridColor + '60' },
          ticks: {
            font:     { size: fs2xs },
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
  const { text: textColor, grid: gridColor, surface, fs2xs, fs3xs, fsXs } = getThemeColors();
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
      backgroundColor: makeGradient(ctx2d, canvas, cat.color, 0.36, 0.02),
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 8,
      pointBackgroundColor: cat.color,
      pointBorderColor: surface,
      pointBorderWidth: 2,
      pointHoverBorderWidth: 2,
      fill: true,
      tension: 0.4,
    };
  });

  if (!datasets.length) return;

  // v26.24: 共通クロスヘアプラグイン（makeCrosshairPlugin）に統合。
  // 従来 strokeStyle: gridColor / lineWidth 1 / dash [4,4] / shadow なしの素朴版を、
  // primary alpha 0.42 + lineWidth 1.2 + dash [5,4] + shadow blur 6 の brand 連動版に置換。
  const primaryClr = getCSSVar('--primary');

  chartInstances[canvasId] = new Chart(ctx2d, {
    type: 'line',
    data: { labels, datasets },
    plugins: [makeCrosshairPlugin(hexToRgba(primaryClr, 0.42), hexToRgba(primaryClr, 0.18))],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutCubic' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: fs3xs },
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
          ticks: { font: { size: fs2xs }, color: textColor, maxRotation: 0 },
          border: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          grid:  { color: gridColor + '60' },
          ticks: {
            font: { size: fs2xs },
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

  const { text, surface, fsXs } = getThemeColors();
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
        backgroundColor: [
          hexToRgba(getCSSVar('--primary'), 0.92),
          hexToRgba(getCSSVar('--success'), 0.92),
        ],
        hoverBackgroundColor: [getCSSVar('--primary'), getCSSVar('--success')],
        borderColor: surface,
        borderWidth: 3,
        hoverOffset: 12,
        hoverBorderWidth: 4,
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
          labels: { color: text, font: { size: fsXs }, padding: 12, usePointStyle: true },
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
    plugins: [centerTextPlugin, makeArcHoverGlowPlugin(0.5, 16)],
  });
}

// ─── 月次 固定費率推移 折れ線グラフ (v5.70) ──────────────────────────
function renderFixedVariableTrend(canvasId, year) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const { text, grid, fs2xs, fs3xs, fsSm } = getThemeColors();
  const primaryClr = getCSSVar('--primary');
  const successClr = getCSSVar('--success');
  const warningClr = getCSSVar('--warning');
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

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: '固定費',
          data: fixedData,
          backgroundColor: makeBarVertGrad(ctx, canvas, primaryClr, 0.92, 0.55),
          hoverBackgroundColor: makeBarVertGrad(ctx, canvas, primaryClr, 1, 0.78),
          borderRadius: 6,
          order: 2,
        },
        {
          type: 'bar',
          label: '変動費',
          data: varData,
          backgroundColor: makeBarVertGrad(ctx, canvas, successClr, 0.88, 0.5),
          hoverBackgroundColor: makeBarVertGrad(ctx, canvas, successClr, 1, 0.72),
          borderRadius: 6,
          order: 2,
        },
        {
          type: 'line',
          label: '固定費率(%)',
          data: rateData,
          borderColor: warningClr,
          backgroundColor: warningClr + '1f',
          borderWidth: 2.5,
          pointBackgroundColor: warningClr,
          pointRadius: 4,
          tension: 0.35,
          fill: false,
          yAxisID: 'yRate',
          order: 1,
        },
      ],
    },
    plugins: [makeCrosshairPlugin(hexToRgba(primaryClr, 0.42), hexToRgba(primaryClr, 0.18))],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: commonAnimation,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: text, font: { size: fs3xs }, padding: 10, usePointStyle: true },
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
          ticks: { font: { size: fs2xs }, color: text, maxRotation: 0 },
          border: { color: grid },
          stacked: true,
        },
        y: {
          beginAtZero: true,
          stacked: true,
          grid: { color: grid + '60' },
          ticks: {
            font: { size: fs2xs }, color: text,
            callback: v => v >= 10000 ? '¥' + (v / 10000).toFixed(0) + '万' : '¥' + v.toLocaleString('ja-JP'),
          },
          border: { color: grid, dash: [3, 3] },
        },
        yRate: {
          position: 'right',
          beginAtZero: true,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { font: { size: fs2xs }, color: warningClr, callback: v => v + '%' },
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
    const { text, fsSm } = getThemeColors();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = text;
    c.font = fsSm + 'px ' + CHART_FONT_FAMILY;
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
  const { text: textColor, surface, fs3xs, fsXs } = getThemeColors();

  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      _centerTotal: total,
      datasets: [{
        data,
        backgroundColor: colors.map(c => hexToRgba(c, 0.88)),
        hoverBackgroundColor: colors.map(c => hexToRgba(c, 0.98)),
        borderWidth: 2.5,
        borderColor: surface,
        hoverBorderWidth: 4,
        hoverOffset: 10,
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
            font: { size: fs3xs },
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
    plugins: [makeArcHoverGlowPlugin(0.46, 14)],
  });
}
