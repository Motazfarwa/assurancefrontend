import { AGENCY_INFO } from '../../data/agencyInfo';
import { API_BASE_URL } from '../../services/apiBase';

// One quittance printed as the companies' « QUITTANCE DE PRIME » form (printed from the page; « Enregistrer au format
// PDF » in the print window saves it): the company, the agency and its code, the police and its validity, the client,
// prime nette / accessoires / taxes / prime totale, and how it was paid. Everything comes from the database
// (GET /api/records/receipts/{n}/impression); what the database does not have is left blank, never made up.
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const amount = (value) => {
  const rounded = Math.round(Number(value || 0) * 1000) / 1000;
  return (rounded === 0 ? 0 : rounded).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};
const date = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const dateParts = (value) => (value ? String(value).slice(0, 10).split('-').reverse() : ['', '', '']);
const box = (checked) => `<span class="box">${checked ? 'X' : '0'}</span>`;

export async function fetchQuittancePrint(accessToken, numero) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/records/receipts/${encodeURIComponent(String(numero).trim())}/impression`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}).`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de préparer la quittance.');
  return body;
}

export function quittanceHtml(data) {
  const { compagnie, police, validite, client, montants } = data;
  const agence = compagnie.nom_agence || AGENCY_INFO.nom;
  const [duD, duM, duY] = dateParts(validite.du);
  const [auD, auM, auY] = dateParts(validite.au);
  const taxes = [...montants.taxes, 0, 0, 0].slice(0, 3);
  const pay = data.reglements[data.reglements.length - 1];
  const especes = Boolean(pay && pay.mode === 'E');
  const cheque = Boolean(pay && pay.mode === 'C');
  const other = Boolean(pay && !especes && !cheque);
  const paidOn = montants.solde <= 0.0005 ? (data.date_reglement || pay?.date) : null;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Quittance ${esc(data.num_quittance)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: #fff; color: #000; font: 12px/1.3 Arial, Helvetica, sans-serif; }
  .q { width: 100%; max-width: 1000px; margin: 0 auto; border: 1.5px solid #000; padding: 10px 0 18px; }
  .top { display: grid; grid-template-columns: 1.3fr 1fr; padding: 0 14px 8px; }
  .cie b { display: block; font-size: 15px; }
  .cie span { display: block; font-weight: 700; font-size: 11.5px; }
  .brand { align-self: center; font-size: 26px; font-weight: 800; letter-spacing: 1px; }
  .title { display: grid; grid-template-columns: 1fr auto; align-items: end; padding: 0 14px 2px; }
  .title h1 { margin: 0; justify-self: center; font-size: 17px; }
  .title .num { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  .grid th, .grid td { border: 1px solid #000; padding: 3px 6px; text-align: center; }
  .grid th { font-size: 11.5px; }
  .grid td { font-weight: 700; height: 26px; }
  .valid td { border: 1px solid #000; padding: 2px 6px; width: 30%; }
  .valid td.lbl { width: auto; padding: 2px 4px; }
  .client { margin-top: 8px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 14px; font-weight: 700; }
  .client div { display: grid; grid-template-columns: 110px 1fr; }
  .client div span:first-child { text-align: right; padding-right: 6px; }
  .money th, .money td { border: 1px solid #000; padding: 2px 6px; text-align: center; }
  .money td.total { vertical-align: middle; font-weight: 700; }
  .money .cie-sign { border: 0; text-align: center; vertical-align: top; font-weight: 700; }
  .pay { display: grid; grid-template-columns: 240px 1fr; gap: 10px 0; padding: 14px 14px 0; font-weight: 700; }
  .box { display: inline-block; min-width: 22px; margin-right: 6px; padding: 0 5px; border: 1px solid #000; text-align: center; }
  @media print { body { padding: 0; } }
</style></head><body>
<div class="q">
  <div class="top">
    <div class="cie"><b>${esc(compagnie.nom)}</b>${compagnie.adresse ? `<span>${esc(compagnie.adresse)}</span>` : ''}${compagnie.ville ? `<span>${esc(compagnie.ville)}</span>` : ''}</div>
    <div class="brand">${esc(compagnie.nom)}</div>
  </div>
  <div class="title"><h1>QUITTANCE DE PRIME</h1><span class="num">N° &nbsp;&nbsp; ${esc(data.num_quittance)}</span></div>
  <table class="grid">
    <tr><th style="width:22%">AGENCE</th><th style="width:12%">CODE AGENCE</th><th style="width:22%">POLICE N°</th><th style="width:10%">CATEGORIE</th><th>VALIDITE</th></tr>
    <tr>
      <td>${esc(agence)}</td><td>${esc(compagnie.code_agence)}</td><td>${esc(police.num_police)}</td><td></td>
      <td style="padding:0"><table class="valid"><tr><td class="lbl">DU</td><td>${esc(duD)}</td><td>${esc(duM)}</td><td>${esc(duY)}</td></tr>
        <tr><td class="lbl">AU</td><td>${esc(auD)}</td><td>${esc(auM)}</td><td>${esc(auY)}</td></tr></table></td>
    </tr>
  </table>
  <div class="client">
    <div><span>Nom Prénom</span><span>${client.societe ? '' : esc(client.nom_client)}</span></div>
    <div><span>ou :</span><span></span></div>
    <div><span>Raison social</span><span>${client.societe ? esc(client.nom_client) : ''}</span></div>
    <div><span>Adresse</span><span>${esc(client.adresse)}</span></div>
  </div>
  <table class="money">
    <tr><th style="width:12%">PRIME NETTE</th><th style="width:18%">ACCESSOIRES</th><th style="width:14%">TAXES</th><th style="width:20%">PRIME TOTALE</th><th class="cie-sign" rowspan="4">Pour la Compagnie</th></tr>
    <tr><td>${amount(montants.prime_nette)}</td><td>${amount(montants.accessoires)}</td><td>${amount(taxes[0])}</td><td class="total" rowspan="3">${amount(montants.prime_totale)}</td></tr>
    <tr><td>${amount(0)}</td><td></td><td>${amount(taxes[1])}</td></tr>
    <tr><td>${amount(0)}</td><td></td><td>${amount(taxes[2])}</td></tr>
  </table>
  <div class="pay">
    <span></span><div>${box(especes)}Espèces</div>
    <span>Quittance payée le : ${esc(date(paidOn))}</span>
    <div>${box(cheque)}par Chèque N° &nbsp;&nbsp;&nbsp; ${cheque ? `${esc(pay.piece)} &nbsp;&nbsp; SUR &nbsp;&nbsp; ${esc(pay.banque)}` : ''}</div>
    <span></span><div>${box(other)}${other ? `${esc(pay.mode === 'V' ? 'Virement' : pay.mode === 'T' ? 'Traite' : 'Autre')} ${esc(pay.piece)}${pay.banque ? ` SUR ${esc(pay.banque)}` : ''}` : ''}</div>
  </div>
</div>
</body></html>`;
}

// Prints the quittance from the page itself: written in a hidden frame, then only the browser's print window opens; the
// user stays in Gestion des quittances.
export async function printQuittance(accessToken, record) {
  const data = await fetchQuittancePrint(accessToken, record.num_quittance);
  const doc = document;
  doc.getElementById('quittance-print-frame')?.remove();
  const frame = doc.createElement('iframe');
  frame.id = 'quittance-print-frame';
  frame.title = `Quittance ${data.num_quittance}`;
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  doc.body.appendChild(frame);
  const win = frame.contentWindow;
  win.document.open();
  win.document.write(quittanceHtml(data));
  win.document.close();
  win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 500), { once: true });
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { frame.remove(); }
  }, 250);
  return frame;
}
