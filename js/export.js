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
