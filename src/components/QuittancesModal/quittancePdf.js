import { AGENCY_PYRAMID } from '../../data/agencyInfo';

// One quittance, printed from the page (or saved as PDF from the print window: « Enregistrer au format PDF »): the agency, the
// client, the police and the amounts the client pays. The commission (the agency's) is not printed.
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const date = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const amount = (value) => {
  if (value == null || value === '') return '';
  const rounded = Math.round(Number(value) * 1000) / 1000;
  return (rounded === 0 ? 0 : rounded).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};
const TC = { T: 'Terme', C: 'Comptant' };

export function quittanceHtml(record) {
  const trim = (key) => String(record[key] ?? '').trim();
  const montant = record.montant_quittance ?? record.prime_total;
  const solde = Number(record.solde_quittance || 0);
  const settled = solde <= 0.0005;
  const rows = [
    ['N° police', trim('num_police') || trim('num_int')],
    ['Compagnie', trim('nom_compagnie')],
    ['Branche', trim('branche')],
    ['Type', TC[trim('tc').toUpperCase()] || trim('tc')],
    ['Période', trim('Periode')],
    ['Date d’émission', date(record.date_emission)],
    ['Échéance', date(record.echeance)],
  ].filter(([, value]) => value);
  const amounts = [
    ['Prime nette', record.prime_net],
    ['Frais', Number(record.frais_quit || 0) ? record.frais_quit : null],
    ['Timbre', Number(record.timbre || 0) ? record.timbre : null],
    ['Prime totale', record.prime_total],
  ].filter(([, value]) => value != null && value !== '');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Quittance ${esc(trim('num_quittance'))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #fff; color: #142a38; font: 13px/1.45 "Segoe UI", Roboto, Arial, sans-serif; }
  .sheet { max-width: 760px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #1b6f64; }
  .agency { color: #1d3fa8; font-style: italic; font-weight: 600; line-height: 1.35; }
  .agency span { display: block; }
  .printed { text-align: right; font-size: 12px; color: #4c6270; }
  h1 { margin: 22px 0 4px; text-align: center; font-size: 22px; letter-spacing: .5px; }
  .number { text-align: center; margin: 0 0 20px; font-size: 15px; font-weight: 700; }
  .client { margin: 0 0 16px; padding: 10px 14px; border: 1px solid #c9d8de; border-radius: 8px; background: #f6fafb; }
  .client b { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { padding: 7px 10px; border: 1px solid #c9d8de; text-align: left; }
  th { width: 38%; background: #eef4f6; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total th, tr.total td { font-weight: 800; font-size: 15px; background: #e6f3f0; }
  .status { margin-top: 6px; font-weight: 700; color: ${settled ? '#1b6f64' : '#a2461f'}; }
  .sign { display: flex; justify-content: flex-end; margin-top: 48px; }
  .sign div { width: 240px; padding-top: 8px; border-top: 1px solid #8fa3ad; text-align: center; color: #4c6270; }
  .tools { display: flex; justify-content: flex-end; gap: 8px; max-width: 760px; margin: 0 auto 12px; }
  .tools button { min-height: 38px; padding: 0 16px; border: 1px solid #1b6f64; border-radius: 8px; background: #1b6f64; color: #fff; font: 600 14px "Segoe UI", Roboto, Arial, sans-serif; cursor: pointer; }
  @media print { body { padding: 0; } .tools { display: none; } }
  @media (max-width: 560px) { body { padding: 12px; } header { flex-direction: column; } .printed { text-align: left; } }
</style></head><body>
<div class="sheet">
  <header>
    <div class="agency">${AGENCY_PYRAMID.map((line) => `<span>${esc(line)}</span>`).join('')}</div>
    <div class="printed">Date : ${esc(date(new Date().toISOString()))}</div>
  </header>
  <h1>QUITTANCE DE PRIME</h1>
  <p class="number">N° ${esc(trim('num_quittance'))}</p>
  <div class="client">Assuré(e) : <b>${esc([trim('code_client'), trim('nom_client')].filter(Boolean).join(' · '))}</b></div>
  <table>${rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</table>
  <table>
    ${amounts.map(([label, value]) => `<tr><th>${esc(label)}</th><td class="num">${amount(value)} TND</td></tr>`).join('')}
    <tr class="total"><th>Montant de la quittance</th><td class="num">${amount(montant)} TND</td></tr>
    <tr><th>Reste à payer</th><td class="num">${amount(Math.max(solde, 0))} TND</td></tr>
  </table>
  <p class="status">${settled ? `Quittance réglée${record.Date_Reglement ? ` le ${esc(date(record.Date_Reglement))}` : ''}.` : 'Quittance non réglée.'}</p>
  <div class="sign"><div>Cachet et signature</div></div>
</div>
</body></html>`;
}

// Prints the quittance from the page itself: written in a hidden frame, then only the print window of the browser opens
// (« Enregistrer au format PDF » saves it as a PDF); the user stays in Gestion des quittances.
export function printQuittance(record) {
  const doc = document;
  doc.getElementById('quittance-print-frame')?.remove();
  const frame = doc.createElement('iframe');
  frame.id = 'quittance-print-frame';
  frame.title = `Quittance ${String(record.num_quittance || '').trim()}`;
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  doc.body.appendChild(frame);
  const win = frame.contentWindow;
  win.document.open();
  win.document.write(quittanceHtml(record));
  win.document.close();
  const remove = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', remove, { once: true });
  // printed once its content is laid out
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { frame.remove(); }
  }, 250);
  return frame;
}
