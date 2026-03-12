// ============================================================
// export.js - CSV・JSONエクスポート / インポート
// ============================================================

// ── 弥生会計 仕訳インポートCSV ────────────────────────────────
// 弥生会計の「仕訳日記帳インポート」形式（BOM付きUTF-8）
function exportYayoiCSV(transactions) {
  const cols = [
    '仕訳番号','決算','伝票日付',
    '借方勘定科目','借方補助科目','借方部門','借方税区分','借方金額','借方消費税額',
    '貸方勘定科目','貸方補助科目','貸方部門','貸方税区分','貸方金額','貸方消費税額',
    '摘要','番号','期日','タイプ','生成元','仕訳メモ','付箋１','付箋２','調整'
  ];

  const rows = [cols.map(c => `"${c}"`).join(',')];

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  sorted.forEach((t, i) => {
    const cat = getCategoryById(t.categoryId);
    const catAccount = cat ? cat.yayoiAccount : '雑費';

    // 支払方法 → 勘定科目
    const pmMap = {
      '現金': '現金',
      'クレカ': '未払金',
      '口座振替': '普通預金',
      '銀行振込': '普通預金',
      '電子マネー': '現金',
      'その他': '現金',
    };
    const payAccount = pmMap[t.paymentMethod] || '現金';

    // 消費税区分
    const taxRate = Number(t.taxRate) || 0;
    let debitTaxKbn = '', creditTaxKbn = '';
    if (t.type === 'expense') {
      debitTaxKbn = taxRate === 10 ? '課税仕入10%' : taxRate === 8 ? '課税仕入8%（軽減）' : '対象外';
    } else {
      creditTaxKbn = taxRate === 10 ? '課税売上10%' : taxRate === 8 ? '課税売上8%（軽減）' : '対象外';
    }

    const amount = Number(t.amount) || 0;
    const taxAmount = taxRate > 0 ? Math.round(amount * taxRate / (100 + taxRate)) : 0;
    const dateFormatted = t.date.replace(/-/g, '/');
    const memo = (t.memo || catAccount).replace(/"/g, '""');
    const no = i + 1;

    let row;
    if (t.type === 'expense') {
      // 借方: 費用科目、貸方: 支払手段
      row = [
        no, '', dateFormatted,
        catAccount, '', '', debitTaxKbn, amount, taxAmount,
        payAccount, '', '', '', amount, '',
        memo, '', '', '', '', '', '', '', ''
      ];
    } else {
      // 借方: 受取手段、貸方: 収益科目
      row = [
        no, '', dateFormatted,
        payAccount, '', '', '', amount, '',
        catAccount, '', '', creditTaxKbn, amount, taxAmount,
        memo, '', '', '', '', '', '', '', ''
      ];
    }

    rows.push(row.map(v => `"${v}"`).join(','));
  });

  const csv = rows.join('\r\n');
  // BOM付きUTF-8（弥生は BOM必須）
  return '\uFEFF' + csv;
}

// ── 汎用CSV ────────────────────────────────────────────────
function exportGenericCSV(transactions) {
  const header = ['日付','種別','カテゴリ','勘定科目（弥生）','担当者','支払方法','金額','消費税率','摘要','タグ'];
  const rows = [header.join(',')];

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach(t => {
    const cat = getCategoryById(t.categoryId);
    const mem = getMemberById(t.memberId);
    const tagsStr = (t.tags && Array.isArray(t.tags)) ? t.tags.join(';') : '';  // v5.61
    const row = [
      t.date,
      t.type === 'income' ? '収入' : '支出',
      esc(cat ? cat.name : ''),
      esc(cat ? cat.yayoiAccount : ''),
      esc(mem ? mem.name : ''),
      esc(t.paymentMethod || ''),
      t.amount,
      t.taxRate || 0,
      esc(t.memo || ''),
      esc(tagsStr),
    ];
    rows.push(row.join(','));
  });

  return '\uFEFF' + rows.join('\r\n');
}

function esc(s) {
  if (typeof s !== 'string') return s;
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── JSONバックアップ ────────────────────────────────────────
function exportJSON() {
  return JSON.stringify(appData, null, 2);
}

function importJSON(jsonStr) {
  const data = JSON.parse(jsonStr);
  if (!data.transactions || !data.categories) throw new Error('無効なデータ形式です');
  appData = data;
  if (!appData.settings) appData.settings = { ...DEFAULT_SETTINGS };
  saveData();
}

// ── ダウンロード ───────────────────────────────────────────
function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doExportYayoi(transactions) {
  const now = new Date();
  const label = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  downloadText(exportYayoiCSV(transactions), `仕訳インポート_${label}.csv`, 'text/csv;charset=utf-8');
}

function doExportCSV(transactions) {
  const now = new Date();
  const label = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  downloadText(exportGenericCSV(transactions), `家計簿_${label}.csv`, 'text/csv;charset=utf-8');
}

function doExportJSON() {
  const now = new Date();
  const label = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  downloadText(exportJSON(), `家計簿バックアップ_${label}.json`, 'application/json');
}

// ============================================================
// 月次サマリー画像生成・シェア (v5.13)
// ============================================================

// Canvas用roundRectヘルパー（クロスブラウザ対応）
function _rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function generateSummaryCanvas(ym) {
  const txs     = getTransactionsByMonth(ym);
  const income  = calcTotal(txs, 'income');
  const expense = calcTotal(txs, 'expense');
  const balance = income - expense;
  const [yr, mo] = ym.split('-');
  const familyName = (appData.settings && appData.settings.familyName) || '家族家計簿';

  const W = 800, H = 450;
  const canvas = document.createElement('canvas');
  canvas.width  = W * 2;
  canvas.height = H * 2;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const FONT = "'Hiragino Kaku Gothic ProN','Hiragino Sans','BIZ UDGothic','Meiryo',sans-serif";
  const PAD = 48;

  // ── 背景グラデーション ─────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#4338ca');
  bg.addColorStop(1, '#7c3aed');
  ctx.fillStyle = bg;
  _rrect(ctx, 0, 0, W, H, 0);
  ctx.fill();

  // ── グラスパネル（装飾） ────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  _rrect(ctx, 20, 20, W - 40, H - 40, 16);
  ctx.fill();

  // ── ヘッダー：ファミリー名 + 月 ───────────────────────────
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText(`💰 ${familyName}`, PAD, 68);

  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = `15px ${FONT}`;
  ctx.fillText(`${yr}年${parseInt(mo)}月 月次レポート`, PAD, 96);

  // ── 区切り線 ──────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 114);
  ctx.lineTo(W - PAD, 114);
  ctx.stroke();

  // ── サマリーカード（3列） ────────────────────────────────
  const cardData = [
    { label: '収入', value: income,  color: '#34d399', sign: '+' },
    { label: '支出', value: expense, color: '#f87171', sign: '-' },
    { label: '残高', value: balance, color: balance >= 0 ? '#60a5fa' : '#f87171', sign: '' },
  ];
  const totalCardW = W - PAD * 2;
  const cardW = Math.floor((totalCardW - 24) / 3);
  const cardH = 92;
  const cardY = 126;

  cardData.forEach((s, i) => {
    const cx = PAD + i * (cardW + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.11)';
    _rrect(ctx, cx, cardY, cardW, cardH, 12);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(s.label, cx + 14, cardY + 24);

    ctx.fillStyle = s.color;
    ctx.font = `bold 23px ${FONT}`;
    const sign = i === 2 ? (s.value >= 0 ? '' : '-') : (i === 0 ? '+' : '-');
    const amtTxt = sign + '¥' + Math.abs(s.value).toLocaleString('ja-JP');
    ctx.fillText(amtTxt, cx + 14, cardY + 66);
  });

  // ── 支出内訳（上位4カテゴリ） ─────────────────────────────
  const catSums = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    catSums[t.categoryId] = (catSums[t.categoryId] || 0) + (Number(t.amount) || 0);
  });
  const topCats = Object.entries(catSums)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, sum]) => ({ cat: getCategoryById(id), sum }))
    .filter(e => e.cat);

  if (topCats.length > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillText('支出内訳', PAD, 248);

    const maxSum   = topCats[0].sum;
    const barW     = Math.floor((W - PAD * 2) * 0.5);
    const nameX    = PAD + barW + 14;
    const amtRight = W - PAD;

    topCats.forEach((e, i) => {
      const ty = 260 + i * 36;
      const filled = Math.max(Math.round(barW * e.sum / maxSum), 14);

      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      _rrect(ctx, PAD, ty, barW, 14, 7);
      ctx.fill();

      ctx.fillStyle = e.cat.color || '#a5b4fc';
      _rrect(ctx, PAD, ty, filled, 14, 7);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.84)';
      ctx.font = `13px ${FONT}`;
      ctx.fillText(e.cat.name, nameX, ty + 11);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.58)';
      ctx.font = `12px ${FONT}`;
      ctx.fillText('¥' + e.sum.toLocaleString('ja-JP'), amtRight, ty + 11);
    });
  }

  // ── フッター ──────────────────────────────────────────────
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.font = `11px ${FONT}`;
  ctx.fillText(`家族家計簿 • 作成: ${dateStr}`, PAD, H - 18);

  return canvas;
}

// ============================================================
// 年間レポート PDF出力 (v5.17)
// ============================================================
function doExportPDF(year) {
  const familyName = (appData.settings && appData.settings.familyName) || '家族家計簿';

  // 月別データ収集
  const months12 = [];
  for (let m = 1; m <= 12; m++) months12.push(`${year}-${String(m).padStart(2,'0')}`);
  const monthlyData = months12.map(ym => {
    const txs = getTransactionsByMonth(ym);
    return {
      month: parseInt(ym.split('-')[1]),
      income:  calcTotal(txs, 'income'),
      expense: calcTotal(txs, 'expense'),
    };
  });

  // 年間合計
  const allTxs      = appData.transactions.filter(t => t.date && t.date.startsWith(String(year)));
  const totalIncome  = calcTotal(allTxs, 'income');
  const totalExpense = calcTotal(allTxs, 'expense');
  const totalBalance = totalIncome - totalExpense;

  // カテゴリ別支出集計（上位8件）
  const catSums = {};
  allTxs.filter(t => t.type === 'expense').forEach(t => {
    catSums[t.categoryId] = (catSums[t.categoryId] || 0) + (Number(t.amount) || 0);
  });
  const topCats = Object.entries(catSums)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, sum]) => ({ cat: getCategoryById(id), sum }))
    .filter(e => e.cat);
  const maxCatSum = topCats.length ? topCats[0].sum : 1;

  const fmt    = n => '¥' + Math.abs(n).toLocaleString('ja-JP');
  const signOf = n => n >= 0 ? '+' : '−';

  // 月別テーブル行
  const tableRows = monthlyData.map(d => {
    const bal = d.income - d.expense;
    const hasData = d.income || d.expense;
    return `<tr>
      <td>${d.month}月</td>
      <td class="num income">${d.income  ? fmt(d.income)  : '—'}</td>
      <td class="num expense">${d.expense ? fmt(d.expense) : '—'}</td>
      <td class="num ${bal >= 0 ? 'income' : 'expense'}">${hasData ? signOf(bal) + fmt(bal) : '—'}</td>
    </tr>`;
  }).join('');

  // カテゴリ行
  const catRows = topCats.map(e => {
    const pct  = totalExpense ? Math.round(e.sum / totalExpense * 100) : 0;
    const barW = Math.round(e.sum / maxCatSum * 100);
    const col  = e.cat.color || '#6366f1';
    return `<tr>
      <td><span class="dot" style="background:${col}"></span>${e.cat.name}</td>
      <td><div class="bar-bg"><div class="bar-fg" style="width:${barW}%;background:${col}"></div></div></td>
      <td class="num expense">${fmt(e.sum)}</td>
      <td class="num pct">${pct}%</td>
    </tr>`;
  }).join('');

  const now     = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;

  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<title>${familyName} ${year}年 年間収支レポート</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','BIZ UDGothic','Meiryo',sans-serif;color:#1e293b;background:#fff;font-size:12px;line-height:1.6}
@page{size:A4;margin:16mm 14mm}
/* ヘッダー */
.rpt-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2.5px solid #6366f1;margin-bottom:18px}
.rpt-title{font-size:20px;font-weight:700;color:#6366f1}
.rpt-sub{font-size:12px;color:#64748b;margin-top:2px}
.rpt-meta{text-align:right;font-size:10px;color:#94a3b8;line-height:1.9}
/* サマリーカード */
.sum-row{display:flex;gap:10px;margin-bottom:22px}
.sum-card{flex:1;padding:12px 14px;border-radius:8px;border:1px solid #e2e8f0}
.sum-card.inc{border-color:#86efac;background:#f0fdf4}
.sum-card.exp{border-color:#fca5a5;background:#fef2f2}
.sum-card.bal{border-color:#93c5fd;background:#eff6ff}
.sum-card.bal.neg{border-color:#fca5a5;background:#fef2f2}
.sum-lbl{font-size:10px;color:#64748b;font-weight:700;letter-spacing:.05em;margin-bottom:4px}
.sum-amt{font-size:18px;font-weight:700}
.inc .sum-amt{color:#059669}
.exp .sum-amt{color:#dc2626}
.bal .sum-amt{color:#2563eb}
.bal.neg .sum-amt{color:#dc2626}
/* セクション見出し */
h2{font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;padding-left:8px;border-left:3px solid #6366f1}
/* テーブル */
table{width:100%;border-collapse:collapse;margin-bottom:22px}
th{background:#f8fafc;color:#64748b;font-size:10px;font-weight:700;padding:7px 10px;text-align:right;border-bottom:2px solid #e2e8f0}
th:first-child{text-align:left}
td{padding:6px 10px;text-align:right;border-bottom:1px solid #f1f5f9}
td:first-child{text-align:left}
tr:last-child td{border-bottom:none}
tfoot td{font-weight:700;background:#f8fafc;border-top:2px solid #e2e8f0;border-bottom:none}
td.num{font-variant-numeric:tabular-nums}
.income{color:#059669}
.expense{color:#dc2626}
.pct{color:#94a3b8;font-size:10px}
/* カテゴリバー */
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
.bar-bg{display:inline-block;background:#f1f5f9;border-radius:3px;height:7px;width:140px;overflow:hidden;vertical-align:middle}
.bar-fg{height:100%;border-radius:3px}
/* フッター */
.rpt-footer{margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head>
<body>

<div class="rpt-header">
  <div>
    <div class="rpt-title">💰 ${familyName}</div>
    <div class="rpt-sub">${year}年 年間収支レポート</div>
  </div>
  <div class="rpt-meta">作成日: ${dateStr}<br>家族家計簿 PWA</div>
</div>

<div class="sum-row">
  <div class="sum-card inc">
    <div class="sum-lbl">年間収入</div>
    <div class="sum-amt">+${fmt(totalIncome)}</div>
  </div>
  <div class="sum-card exp">
    <div class="sum-lbl">年間支出</div>
    <div class="sum-amt">−${fmt(totalExpense)}</div>
  </div>
  <div class="sum-card bal${totalBalance < 0 ? ' neg' : ''}">
    <div class="sum-lbl">年間残高</div>
    <div class="sum-amt">${signOf(totalBalance)}${fmt(totalBalance)}</div>
  </div>
</div>

<h2>月別収支表</h2>
<table>
  <thead><tr><th>月</th><th>収入</th><th>支出</th><th>残高</th></tr></thead>
  <tbody>${tableRows}</tbody>
  <tfoot>
    <tr>
      <td>合計</td>
      <td class="num income">+${fmt(totalIncome)}</td>
      <td class="num expense">−${fmt(totalExpense)}</td>
      <td class="num ${totalBalance >= 0 ? 'income' : 'expense'}">${signOf(totalBalance)}${fmt(totalBalance)}</td>
    </tr>
  </tfoot>
</table>

${topCats.length > 0 ? `<h2>支出カテゴリ内訳</h2>
<table>
  <thead><tr><th>カテゴリ</th><th>グラフ</th><th>金額</th><th>比率</th></tr></thead>
  <tbody>${catRows}</tbody>
</table>` : ''}

<div class="rpt-footer">このレポートは家族家計簿PWAによって自動生成されました。</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    showToast('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
    return;
  }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ============================================================
// 月次サマリー画像生成・シェア (v5.13)
// ============================================================
function openShareModal(ym) {
  const canvas = generateSummaryCanvas(ym);
  const [yr, mo] = ym.split('-');

  let overlay = document.getElementById('share-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'share-modal';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
  }

  const canUseShare = !!(navigator.share && navigator.canShare);

  overlay.innerHTML = `
    <div class="modal modal-share">
      <div class="modal-header">
        <h2>月次サマリーをシェア</h2>
        <button class="modal-close" id="share-modal-close">✕</button>
      </div>
      <div class="modal-body share-modal-body">
        <div class="share-canvas-wrap" id="share-canvas-wrap"></div>
        <p class="share-hint">画像を保存して、家族や友人にシェアできます</p>
        <div class="share-actions">
          <button class="btn btn-ghost" id="share-download">⬇️ 画像を保存</button>
          ${canUseShare ? '<button class="btn btn-primary" id="share-share">📤 シェア</button>' : ''}
        </div>
      </div>
    </div>`;

  overlay.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal-is-open')));

  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  document.getElementById('share-canvas-wrap').appendChild(canvas);

  const closeModal = () => {
    overlay.classList.remove('modal-is-open');
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
  };
  document.getElementById('share-modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  document.getElementById('share-download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `家計簿_${yr}年${parseInt(mo)}月.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  const shareBtn = document.getElementById('share-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      canvas.toBlob(async blob => {
        const file = new File([blob], `家計簿_${yr}年${parseInt(mo)}月.png`, { type: 'image/png' });
        try {
          await navigator.share({
            title: `${(appData.settings && appData.settings.familyName) || '家族家計簿'} ${yr}年${parseInt(mo)}月 家計簿`,
            files: [file],
          });
        } catch (_) { /* キャンセルは無視 */ }
      }, 'image/png');
    });
  }
}

// ============================================================
// CSV インポート (v5.45)
// ============================================================

// RFC 4180準拠CSVパーサー（BOM・クォート・改行対応）
function parseCSVText(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r' && n === '\n') {
        row.push(field);
        if (row.some(f => f.trim())) rows.push(row);
        row = []; field = ''; i++;
      } else if (c === '\n' || c === '\r') {
        row.push(field);
        if (row.some(f => f.trim())) rows.push(row);
        row = []; field = '';
      } else { field += c; }
    }
  }
  if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row); }
  return rows;
}

// アプリ独自形式かどうか判定（日付・種別・金額列が一致）
function isAppCSVFormat(headers) {
  return headers[0] === '日付' && headers[1] === '種別' && headers.length >= 7;
}

// ============================================================
// カード会社CSV自動検出 (v5.42)
// ============================================================
const CARD_FORMATS = {
  rakuten: {
    name: '楽天カード',
    detect: h => h.some(c => c.includes('利用日')) && h.some(c => c.includes('利用店名')),
    date:   h => h.findIndex(c => c.includes('利用日')),
    amount: h => h.findIndex(c => c.includes('利用金額')),
    memo:   h => h.findIndex(c => c.includes('利用店名')),
  },
  smbc: {
    name: '三井住友カード',
    detect: h => h.some(c => c.includes('ご利用日')) && h.some(c => c.includes('ご利用先')),
    date:   h => h.findIndex(c => c.includes('ご利用日')),
    amount: h => h.findIndex(c => /ご利用金額|利用金額/.test(c)),
    memo:   h => h.findIndex(c => c.includes('ご利用先')),
  },
  amex: {
    name: 'アメリカン・エキスプレス',
    detect: h => h.some(c => c === '日付' || c === '利用日付') && h.some(c => c.includes('ご利用先') || c.includes('説明')) && h.some(c => c === '金額' || c.includes('ご利用金額')),
    date:   h => h.findIndex(c => c === '日付' || c === '利用日付'),
    amount: h => h.findIndex(c => c === '金額' || c.includes('ご利用金額')),
    memo:   h => h.findIndex(c => c.includes('ご利用先') || c.includes('説明')),
  },
  jcb: {
    name: 'JCBカード',
    detect: h => h.some(c => c.includes('利用日')) && h.some(c => c.includes('利用金額')) && h.some(c => /利用店名|利用先/.test(c)),
    date:   h => h.findIndex(c => c.includes('利用日')),
    amount: h => h.findIndex(c => c.includes('利用金額')),
    memo:   h => h.findIndex(c => /利用店名|利用先/.test(c)),
  },
  generic_card: {
    name: 'クレジットカード明細',
    detect: h => h.some(c => /利用日|ご利用日|取引日/.test(c)) && h.some(c => /金額|利用額/.test(c)),
    date:   h => h.findIndex(c => /利用日|ご利用日|取引日/.test(c)),
    amount: h => h.findIndex(c => /利用金額|ご利用金額|金額|利用額/.test(c)),
    memo:   h => h.findIndex(c => /店名|利用先|ご利用先|摘要|内容/.test(c)),
  },
};

function detectCardFormat(headers) {
  const trimmed = headers.map(h => h.trim());
  for (const [key, fmt] of Object.entries(CARD_FORMATS)) {
    if (fmt.detect(trimmed)) {
      return {
        key, name: fmt.name,
        date:   fmt.date(trimmed),
        amount: fmt.amount(trimmed),
        memo:   fmt.memo(trimmed),
      };
    }
  }
  return null;
}

// カード明細CSVインポート
function importFromCardCSV(rows, cm) {
  const data = rows.slice(1);
  let added = 0, skipped = 0;
  data.forEach(row => {
    const dateRaw = (row[cm.date] || '').trim();
    const amtRaw  = (row[cm.amount] || '').replace(/[¥￥,\s"]/g, '');
    const memo    = cm.memo >= 0 ? (row[cm.memo] || '').trim() : '';

    const dm = dateRaw.replace(/[^0-9\/\-]/g, '').match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!dm) { skipped++; return; }
    const date = `${dm[1]}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}`;

    const amtNum = parseInt(amtRaw.replace(/[^0-9\-]/g, '')) || 0;
    if (amtNum === 0) { skipped++; return; }

    const type   = amtNum < 0 ? 'income' : 'expense';
    const amount = Math.abs(amtNum);

    const defCat = appData.categories.find(c => c.type === type && c.name.includes('その他'))
                || appData.categories.find(c => c.type === type);

    const dup = appData.transactions.some(t =>
      t.date === date && t.amount === amount && t.type === type && (t.memo || '') === memo
    );
    if (dup) { skipped++; return; }

    addTransaction({
      date, type,
      categoryId:    defCat ? defCat.id : '',
      memberId:      appData.settings.defaultMemberId || '',
      paymentMethod: 'クレカ',
      amount, taxRate: 10, memo,
    });
    added++;
  });
  return { added, skipped };
}

// アプリ独自形式からインポート
function importFromAppCSV(rows) {
  const data = rows.slice(1);
  let added = 0, skipped = 0;
  data.forEach(row => {
    if (row.length < 7) { skipped++; return; }
    const date    = (row[0] || '').trim();
    const typeStr = (row[1] || '').trim();
    const catName = (row[2] || '').trim();
    const memName = (row[4] || '').trim();
    const pay     = (row[5] || '現金').trim();
    const amount  = parseInt((row[6] || '').replace(/[^0-9]/g, '')) || 0;
    const taxRate = parseInt(row[7]) || 0;
    const memo    = (row[8] || '').trim();
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/) || amount <= 0) { skipped++; return; }
    const type = typeStr === '収入' ? 'income' : 'expense';
    const cat  = appData.categories.find(c => c.name === catName && c.type === type)
              || appData.categories.find(c => c.type === type);
    const mem  = appData.members.find(m => m.name === memName);
    const dup  = appData.transactions.some(t =>
      t.date === date && t.amount === amount && t.type === type && (t.memo || '') === memo
    );
    if (dup) { skipped++; return; }
    addTransaction({
      date, type,
      categoryId:    cat ? cat.id : '',
      memberId:      mem ? mem.id : (appData.settings.defaultMemberId || ''),
      paymentMethod: pay,
      amount, taxRate, memo,
    });
    added++;
  });
  return { added, skipped };
}

// 列マッピング指定でインポート（銀行明細など）
function importFromMappedCSV(rows, m) {
  const data = m.hasHeader ? rows.slice(1) : rows;
  let added = 0, skipped = 0;
  data.forEach(row => {
    const dateRaw = (row[m.date]   || '').trim();
    const amtRaw  = (row[m.amount] || '').replace(/[¥,\s]/g, '');
    const memo    = m.memo >= 0 ? (row[m.memo] || '').trim() : '';
    const dm = dateRaw.replace(/[^0-9\/\-]/g, '').match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!dm) { skipped++; return; }
    const date   = `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
    const amount = parseInt(amtRaw.replace(/[^0-9]/g, '')) || 0;
    if (amount <= 0) { skipped++; return; }
    let type = 'expense';
    if (m.typeMode === 'income') { type = 'income'; }
    else if (m.typeMode === 'column') {
      const tv = (row[m.typeCol] || '').trim();
      type = /収入|入金|income|IN/i.test(tv) ? 'income' : 'expense';
    }
    const defCat = appData.categories.find(c => c.type === type && c.name.includes('その他'))
                || appData.categories.find(c => c.type === type);
    const dup = appData.transactions.some(t =>
      t.date === date && t.amount === amount && t.type === type
    );
    if (dup) { skipped++; return; }
    addTransaction({
      date, type,
      categoryId:    defCat ? defCat.id : '',
      memberId:      appData.settings.defaultMemberId || '',
      paymentMethod: '現金',
      amount, taxRate: 0, memo,
    });
    added++;
  });
  return { added, skipped };
}
