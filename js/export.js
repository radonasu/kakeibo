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
  const header = ['日付','種別','カテゴリ','勘定科目（弥生）','担当者','支払方法','金額','消費税率','摘要'];
  const rows = [header.join(',')];

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach(t => {
    const cat = getCategoryById(t.categoryId);
    const mem = getMemberById(t.memberId);
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
