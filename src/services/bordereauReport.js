// Printing and Excel export of the bordereau screens. A "section" is { title, columns: [{ key, label, kind? }], rows }.
// kind: 'money' (3 decimals, right aligned) or 'date' (ISO -> dd/mm/yyyy).

export const money = (value) => (value == null || value === '' ? '' : Number(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
export const shortDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

function cellText(row, column) {
  const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
  if (column.kind === 'money') return money(value);
  if (column.kind === 'date') return shortDate(value);
  return Array.isArray(value) ? value.join(' ; ') : value ?? '';
}

export function printReport({ title, lines = [], sections }) {
  const popup = window.open('', '_blank', 'width=1100,height=800');
  if (!popup) throw new Error('Autorisez les fenêtres pop-up pour imprimer.');
  const body = sections.map((section) => `
    <h2>${escapeHtml(section.title)}</h2>
    <table>
      <thead><tr>${section.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
      <tbody>${section.rows.length
    ? section.rows.map((row) => `<tr>${section.columns.map((column) => `<td class="${column.kind === 'money' ? 'num' : ''}">${escapeHtml(cellText(row, column))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${section.columns.length}" class="empty">Aucune ligne</td></tr>`}</tbody>
    </table>`).join('');
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font:12px Arial,sans-serif;color:#111;margin:24px}
    .head{display:flex;justify-content:space-between;font:italic bold 12px 'Times New Roman',serif;color:#1a237e}
    h1{margin:18px auto;width:max-content;padding:8px 40px;border:1px solid #333;font-size:16px}
    h2{margin:18px 0 6px;font-size:13px}
    .meta{margin:6px 0;padding:4px 8px;border:1px solid #c33;font-size:11px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #555;padding:3px 6px;text-align:left}
    th{background:#eee}
    td.num{text-align:right}
    .empty{text-align:center;color:#666}
    @media print{body{margin:8mm}}
  </style></head><body>
    <div class="head"><div>Cabinet d'Assurance Jemmali</div><div>Date : ${new Date().toLocaleDateString('fr-FR')}</div></div>
    <h1>${escapeHtml(title)}</h1>
    ${lines.map((line) => `<div class="meta">${escapeHtml(line)}</div>`).join('')}
    ${body}
  </body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export async function exportReportExcel(filename, sections) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  sections.forEach((section) => {
    const sheet = workbook.addWorksheet(section.title.slice(0, 30).replace(/[\\/?*[\]:]/g, ' '));
    sheet.addRow(section.columns.map((column) => column.label)).font = { bold: true };
    section.rows.forEach((row) => sheet.addRow(section.columns.map((column) => {
      const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
      if (column.kind === 'money') return value == null || value === '' ? null : Number(value);
      if (column.kind === 'date') return shortDate(value);
      return Array.isArray(value) ? value.join(' ; ') : value ?? '';
    })));
    sheet.columns.forEach((column) => { column.width = 18; });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
