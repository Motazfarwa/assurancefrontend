// Full reading of a payment document (cheque, bill of exchange, transfer slip, receipt) from an image or a
// PDF, shared by "Gestion des chèques" and "Recette technique". Two readings run together and are merged:
// the server's cheque reader (AI) and the whole text of the document (PDF text layer / OCR of every page).
import { extractCheque } from './chequeApi';
import { isPdf, scanFiche, scanFicheWithServerOcr, toIsoDate } from './ficheOcr';
import { pdfToText } from './pdfText';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const normalize = (text) => String(text || '').replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/\r/g, '');
const clean = (value) => String(value || '').replace(/[|_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const AMOUNT_RE = /\d{1,3}(?:[ .]\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3}/g;
const DATE_RE = /\b\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}\b/;
const toAmount = (value) => {
  const text = String(value).replace(/\s/g, '');
  const normalized = /[.,]\d{3}[.,]\d{2,3}$/.test(text) ? text.replace(/[.,](?=\d{3}[.,])/g, '') : text;
  const number = Number(normalized.replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
};

// Name written after a label on the same line ("Tireur : BEN SALAH MOHAMED"), letters only, up to 5 words.
function nameAfter(lines, label) {
  const pattern = new RegExp(`${label.source}\\s*[:.-]?\\s*([\\p{L}][\\p{L}'’ -]{1,60})`, 'iu');
  for (const line of lines) {
    const match = line.match(pattern);
    const name = match && clean(match[1].split(/\s{3,}/)[0]).split(' ').slice(0, 5).join(' ');
    if (name && name.length > 2) return name;
  }
  return '';
}

export const PAYMENT_LABELS = {
  typeReglement: 'Type', nump: 'N° pièce', montant: 'Montant', echeance: 'Échéance', dateEmission: 'Date d’émission',
  code_banque: 'Banque', code: 'Code client', nomClient: 'Client', tireur: 'Tireur', rib: 'RIB', quittances: 'Quittances', police: 'N° police',
};

// Pulls the payment fields out of the raw text. `banks` is the list of { code_banque, nom_banque }.
export function extractPayment(rawText, banks = []) {
  const lines = normalize(rawText).split('\n').map((line) => line.trim()).filter(Boolean);
  const flat = lines.join(' ');
  const result = {};

  if (/virement/i.test(flat)) result.typeReglement = 'Virement';
  else if (/\btraite\b|lettre\s+de\s+change/i.test(flat)) result.typeReglement = 'Traite';
  else if (/esp[èe]ces|\bcash\b/i.test(flat)) result.typeReglement = 'Espèces';
  else if (/carte\s+bancaire|\bTPE\b/i.test(flat)) result.typeReglement = 'Carte bancaire';
  else if (/ch[èe]que|\bcheque\b|\bpayez\b/i.test(flat)) result.typeReglement = 'Chèque';

  const client = flat.match(/(?:code\s+client|client\s+n[°o]|n[°o]\s*client)\s*[:.-]?\s*(\d{1,8})\b/i);
  if (client) result.code = client[1];
  const clientName = nameAfter(lines, /(?:nom\s+(?:du\s+)?client|assur[ée]|souscripteur)/);
  if (clientName) result.nomClient = clientName;

  const piece = flat.match(/(?:n[°o]\s*(?:de\s+)?(?:ch[èe]que|pi[èe]ce|virement|traite|lettre\s+de\s+change)|ch[èe]que\s+n[°o]?|traite\s+n[°o]?|r[ée]f(?:[ée]rence)?(?:\s+virement)?)\s*[:.-]?\s*([A-Za-z0-9-]{4,20})/i);
  if (piece) result.nump = piece[1];
  else if (result.typeReglement === 'Chèque' || result.typeReglement === 'Traite') {
    const digits = flat.replace(/\b\d{20}\b|\d{2}\s\d{3}\s\d{13}\s\d{2}/g, '').match(/\b\d{7}\b/); // not inside the RIB
    if (digits) result.nump = digits[0];
  }

  const labelled = flat.match(/(?:montant|somme|total|net\s+[àa]\s+payer|la\s+somme\s+de)[^\d]{0,30}(\d{1,3}(?:[ .]\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3}|\d+)/i);
  const amounts = (flat.match(AMOUNT_RE) || []).map(toAmount).filter((n) => n > 0);
  const amount = labelled ? toAmount(labelled[1]) : amounts.length ? Math.max(...amounts) : 0;
  if (amount > 0) result.montant = amount.toFixed(3);

  const due = flat.match(new RegExp(`(?:[ée]ch[ée]ance|payable\\s+le|[àa]\\s+payer\\s+le)[^\\d]{0,15}(${DATE_RE.source})`, 'i'));
  const issued = flat.match(new RegExp(`(?:date\\s+(?:d['’]\\s*)?[ée]mission|cr[ée]ation|fait\\s+[àa]\\s+[\\p{L} ]{2,25}?\\s*,?\\s*le|\\ble)\\s*[:.-]?\\s*(${DATE_RE.source})`, 'iu'));
  const anyDate = flat.match(DATE_RE);
  if (due) result.echeance = toIsoDate(due[1]);
  if (issued) result.dateEmission = toIsoDate(issued[1]);
  if (!result.echeance) result.echeance = result.dateEmission || toIsoDate(anyDate ? anyDate[0] : '');
  Object.keys(result).forEach((key) => { if (result[key] === '') delete result[key]; });

  const upper = flat.toUpperCase();
  const bank = banks.find((item) => item.nom_banque && upper.includes(String(item.nom_banque).toUpperCase()))
    || banks.find((item) => item.code_banque && new RegExp(`(?:banque|bank|code\\s+banque)\\s*[:.-]?\\s*0*${Number(item.code_banque) || item.code_banque}\\b`, 'i').test(flat));
  if (bank) result.code_banque = bank.code_banque;

  const drawer = nameAfter(lines, /(?:tireur|titulaire(?:\s+du\s+compte)?|[ée]mis\s+par|donneur\s+d['’]\s*ordre|ordonnateur)/);
  if (drawer) result.tireur = drawer;
  const rib = flat.match(/\b(\d{2}\s?\d{3}\s?\d{13}\s?\d{2})\b/);
  if (rib) result.rib = rib[1].replace(/\s/g, '');

  const quittances = [...flat.matchAll(/quittances?\s*(?:n[°o]s?)?\s*[:.-]?\s*([A-Z]{0,3}\d[\w/-]{3,19}(?:\s*(?:[,;]|\bet\b)\s*[A-Z]{0,3}\d[\w/-]{3,19})*)/gi)]
    .flatMap((match) => match[1].split(/\s*[,;]\s*|\s+et\s+/)).map((value) => value.trim()).filter((value) => /\d{4,}/.test(value));
  if (quittances.length) result.quittances = [...new Set(quittances)];
  const police = flat.match(/(?:police|contrat)\s*n[°o]?\s*[:.-]?\s*(\d{8,14})/i);
  if (police) result.police = police[1];

  return result;
}

// Whole text of the document: every PDF page locally; for images the server OCR, else the in-browser OCR.
async function readText(file, accessToken, onProgress) {
  if (isPdf(file)) {
    const text = await pdfToText(file, onProgress).catch(() => '');
    if (text.trim()) return text;
    return (await scanFicheWithServerOcr(file, accessToken)).text;
  }
  try {
    return (await scanFicheWithServerOcr(file, accessToken)).text;
  } catch {
    return (await scanFiche(file, onProgress)).text;
  }
}

const AI_TYPES = { traite: 'Traite', cheque: 'Chèque', chèque: 'Chèque', virement: 'Virement' };

// Scans the document and returns { values, found, text }: `values` uses the Recette field names,
// `found` lists "Label : value" lines of everything that was read, for display.
export async function scanPayment(file, { accessToken, banks = [], onProgress } = {}) {
  const [ai, text] = await Promise.all([
    extractCheque(accessToken, file).catch(() => null),
    readText(file, accessToken, onProgress).catch(() => ''),
  ]);
  if (!ai && !text.trim()) throw new Error('aucun texte n’a pu être lu (vérifiez la qualité du document).');

  const values = extractPayment(text, banks);
  const fields = ai?.fields || {};
  // The cheque reader knows the layout of a cheque: its values win over the plain text.
  if (fields.numero) values.nump = String(fields.numero).replace(/\s/g, '');
  const aiAmount = fields.montant ? toAmount(fields.montant) : 0;
  if (aiAmount > 0) values.montant = aiAmount.toFixed(3);
  if (fields.date_echeance && toIsoDate(fields.date_echeance)) values.echeance = toIsoDate(fields.date_echeance);
  if (fields.type && AI_TYPES[String(fields.type).toLowerCase()]) values.typeReglement = AI_TYPES[String(fields.type).toLowerCase()];
  if (fields.tireur) values.tireur = clean(fields.tireur);
  if (fields.banque) {
    const name = String(fields.banque).toLowerCase();
    const bank = banks.find((item) => item.nom_banque && (item.nom_banque.toLowerCase() === name || name.includes(item.nom_banque.toLowerCase()) || item.nom_banque.toLowerCase().includes(name)));
    if (bank) values.code_banque = bank.code_banque;
    else if (!values.code_banque) values.banqueLue = fields.banque;
  }

  const shown = (key, value) => {
    if (key === 'code_banque') return banks.find((bank) => bank.code_banque === value)?.nom_banque || value;
    if (key === 'echeance' || key === 'dateEmission') return value.split('-').reverse().join('/');
    if (key === 'quittances') return value.join(', ');
    return value;
  };
  const found = Object.keys(PAYMENT_LABELS).filter((key) => values[key]).map((key) => ({ key, label: PAYMENT_LABELS[key], value: shown(key, values[key]) }));
  if (values.banqueLue) found.push({ key: 'banqueLue', label: 'Banque (non reconnue)', value: values.banqueLue });
  return { values, found, text: [ai ? `Lecture chèque : ${JSON.stringify(fields)}` : '', text].filter(Boolean).join('\n\n') };
}
