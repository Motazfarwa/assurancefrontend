// Full reading of a payment document (cheque, bill of exchange, transfer slip, receipt) from an image or a
// PDF, shared by "Gestion des chèques" and "Recette technique". Two readings run together and are merged:
// the server's cheque reader (AI) and the whole text of the document (PDF text layer / OCR of every page).
import { extractCheque } from './chequeApi';
import { searchClients } from './clientApi';
import { isPdf, scanFiche, scanFicheWithServerOcr, toIsoDate } from './ficheOcr';
import { pdfReadings } from './pdfText';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const normalize = (text) => String(text || '').replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/\r/g, '');
const clean = (value) => String(value || '').replace(/[|_*#]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const AMOUNT_RE = /\d{1,3}(?:[ .]\d{3})*[.,]\d{1,3}|\d+[.,]\d{1,3}/g;
const DATE_SOURCE = '\\d{1,2}\\s*[/.-]\\s*\\d{1,2}\\s*[/.-]\\s*\\d{2,4}';
const toAmount = (value) => {
  const text = String(value).replace(/\s/g, '');
  const normalized = /[.,]\d{3}[.,]\d{1,3}$/.test(text) ? text.replace(/[.,](?=\d{3}[.,])/g, '') : text;
  const number = Number(normalized.replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
};

// Value shapes, anchored at the start of the text that follows a label.
const VALUE = {
  code: /^(\d{1,8})\b/,
  name: /^([\p{L}][\p{L}\p{N}'’ .&-]{1,60})$/u,
  piece: /^([A-Za-z]{0,4}\d[\w-]{2,19})\b/,
  amount: /^[#*\s]*(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,3})?|\d+(?:[.,]\d{1,3})?)(?!\s*[/-]\s*\d)/,
  date: new RegExp(`^(${DATE_SOURCE})`),
  bankCode: /^0*(\d{1,3})\b/,
  text: /^(.{2,80})$/,
};

// A line that is only a label ("Code client", "Montant (TND)"): never taken as the value of the line above.
const LABEL_ONLY = /^(?:code\s+client|nom\s+(?:du\s+)?client|client|n[°o]\s*(?:de\s+)?(?:pi[èe]ce|ch[èe]que|traite)|date(?:\s+\S+){0,2}|[ée]ch[ée]ance|mode|type(?:\s+\S+)?|banque|code\s+banque|montant(?:\s*\([^)]*\))?|solde|statut|rib|tireur|quittances?|police)\s*:?$/i;

// Value written after a label: on the same line ("Label : value") or on the next line (label and value stacked).
function valueAfter(lines, label, shape) {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${label})(?![\\p{L}\\p{N}])\\s*(?:\\([^)]*\\))?\\s*[:.\\-–]?\\s*(.*)$`, 'iu');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    const candidates = [];
    const sameLine = match[1].split(/\s{3,}/)[0].trim();
    if (sameLine) candidates.push(sameLine);
    const next = lines[index + 1];
    if (next && !LABEL_ONLY.test(next) && !(shape === VALUE.name && next.includes(':'))) candidates.push(next.split(/\s{3,}/)[0].trim());
    for (const candidate of candidates) {
      const found = clean(candidate).match(shape) || candidate.match(shape);
      if (found) return clean(found[1]);
    }
  }
  return '';
}

const TYPE_WORDS = [
  [/virement/i, 'Virement'], [/\btraite\b|lettre\s+de\s+change|\bLC\b/i, 'Traite'], [/esp[èe]ces?|\bcash\b/i, 'Espèces'],
  [/carte\s+bancaire|\bTPE\b|\bCB\b/i, 'Carte bancaire'], [/ch[èe]que|\bcheque\b|\bpayez\b/i, 'Chèque'],
];
const typeOf = (text) => (TYPE_WORDS.find(([pattern]) => pattern.test(text)) || [])[1] || '';
const nameWord = (name) => new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');

export const PAYMENT_LABELS = {
  typeReglement: 'Type', nump: 'N° pièce', montant: 'Montant', echeance: 'Échéance', dateEmission: 'Date d’émission', dateSaisie: 'Date saisie',
  code_banque: 'Banque', banqueLue: 'Banque (document)', code: 'Code client', nomClient: 'Nom client', beneficiaire: 'À l’ordre de', tireur: 'Tireur',
  rib: 'RIB', statut: 'Statut', quittances: 'Quittances', police: 'N° police',
};

// Pulls the payment fields out of one reading of the document. `banks` is the list of { code_banque, nom_banque }.
export function extractPayment(rawText, banks = []) {
  const lines = normalize(rawText).split('\n').map((line) => line.trim()).filter(Boolean);
  const flat = lines.join(' ');
  const result = {};
  const set = (key, value) => { if (value && !result[key]) result[key] = value; };

  set('typeReglement', typeOf(valueAfter(lines, 'mode(?:\\s+de\\s+(?:paiement|r[èe]glement))?|type\\s+(?:de\\s+)?(?:r[èe]glement|pi[èe]ce|paiement)', VALUE.text)) || typeOf(flat));

  set('code', valueAfter(lines, 'code\\s+client|client\\s*n[°o]|n[°o]\\s*client|client', VALUE.code));
  set('nomClient', valueAfter(lines, 'nom\\s+(?:du\\s+)?client|nom\\s*/\\s*raison\\s+sociale|raison\\s+sociale|assur[ée]|souscripteur', VALUE.name));
  set('beneficiaire', valueAfter(lines, "[àa]\\s+l['’]\\s*ordre\\s+de|b[ée]n[ée]ficiaire", VALUE.name));
  set('tireur', valueAfter(lines, "(?<!signature\\s+du\\s+)tireur|titulaire(?:\\s+du\\s+compte)?|[ée]mis\\s+par|donneur\\s+d['’]\\s*ordre|ordonnateur", VALUE.name));

  set('nump', valueAfter(lines, 'n[°o]\\s*(?:de\\s+)?(?:pi[èe]ce|ch[èe]que|traite|virement|lettre\\s+de\\s+change)|ch[èe]que\\s+n[°o]?|traite\\s+n[°o]?|r[ée]f[ée]rence(?:\\s+virement)?', VALUE.piece));
  set('nump', (flat.match(/\|\s*(\d{5,10})\s*\|/) || [])[1]); // cheque line at the bottom: |0001234|

  const labelled = valueAfter(lines, 'montant|somme|total|net\\s+[àa]\\s+payer|la\\s+somme\\s+de', VALUE.amount);
  const framed = (flat.match(/#\s*(\d[\d .,]*\d)\s*(?:DT|TND|dinars?)?\s*#/i) || [])[1];
  const amounts = (flat.match(AMOUNT_RE) || []).map(toAmount).filter((n) => n > 0);
  const amount = toAmount(labelled || framed || 0) || (amounts.length ? Math.max(...amounts) : 0);
  if (amount > 0) set('montant', amount.toFixed(3));

  set('echeance', toIsoDate(valueAfter(lines, '[ée]ch[ée]ance|payable\\s+le|[àa]\\s+payer\\s+le|date\\s+(?:d[\'’]\\s*)?[ée]ch[ée]ance', VALUE.date)));
  set('dateEmission', toIsoDate(valueAfter(lines, "date\\s+(?:d['’]\\s*)?[ée]mission|date\\s+de\\s+cr[ée]ation|le", VALUE.date)));
  set('dateSaisie', toIsoDate(valueAfter(lines, 'date\\s+(?:de\\s+)?saisie', VALUE.date)));
  if (!result.echeance) set('echeance', result.dateEmission || toIsoDate((flat.match(new RegExp(DATE_SOURCE)) || [''])[0]));

  // Bank: its code ("Code banque : 10", "Banque 10 - ..."), else its name written as a whole word.
  const bankCode = valueAfter(lines, 'code\\s+banque|banque|bank', VALUE.bankCode);
  const byCode = bankCode && banks.find((bank) => Number(bank.code_banque) === Number(bankCode) || bank.code_banque === bankCode);
  const byName = [...banks].filter((bank) => String(bank.nom_banque || '').trim().length >= 3)
    .sort((a, b) => b.nom_banque.length - a.nom_banque.length).find((bank) => nameWord(bank.nom_banque.trim()).test(flat));
  if (byCode || byName) set('code_banque', (byCode || byName).code_banque);
  const bankText = (flat.match(/\b\d{1,3}\s*-\s*(banque[\p{L} ]{3,40}?)(?=\s{2,}|\s+[A-Z][a-z]+\s*\(|$|\s+Montant)/iu) || flat.match(/\b(banque\s+[\p{L}]+(?:\s+(?:de|du|des|d['’]|la|le|[\p{L}]+)){0,4})/iu) || [])[1];
  if (bankCode || bankText) set('banqueLue', clean([bankCode, bankText].filter(Boolean).join(' - ')));

  const statut = valueAfter(lines, 'statut|[ée]tat(?:\\s+de\\s+la\\s+pi[èe]ce)?', VALUE.text);
  if (/verser|instance/i.test(statut)) {
    set('statut', statut);
    result.aVerser = /verser/i.test(statut);
    result.enInstance = /instance/i.test(statut);
  }

  const rib = valueAfter(lines, 'r\\.?i\\.?b', /^([\d ]{20,32})/).replace(/\s/g, '') || (flat.match(/\b\d{20}\b/) || [''])[0];
  if (/^\d{20}$/.test(rib)) set('rib', rib);

  const quittances = [...flat.matchAll(/quittances?\s*(?:n[°o]s?)?\s*[:.-]?\s*([A-Z]{0,3}\d[\w/-]{3,19}(?:\s*(?:[,;]|\bet\b)\s*[A-Z]{0,3}\d[\w/-]{3,19})*)/gi)]
    .flatMap((match) => match[1].split(/\s*[,;]\s*|\s+et\s+/)).map((value) => value.trim()).filter((value) => /\d{4,}/.test(value));
  if (quittances.length) result.quittances = [...new Set(quittances)];
  set('police', (flat.match(/(?:police|contrat)\s*n[°o]?\s*[:.-]?\s*(\d{8,14})/i) || [])[1]);

  Object.keys(result).forEach((key) => { if (result[key] === '' || result[key] == null) delete result[key]; });
  return result;
}

// Several readings of the same document: the first one that found a field gives it.
export function extractPaymentAll(texts, banks = []) {
  return texts.map((text) => extractPayment(text, banks)).reduce((merged, reading) => ({ ...reading, ...merged }), {});
}

// Whole text of the document: every PDF page locally (two readings); for images the server OCR, else the in-browser OCR.
async function readTexts(file, accessToken, onProgress) {
  if (isPdf(file)) {
    const readings = await pdfReadings(file, onProgress).catch(() => []);
    if (readings.some((text) => text.trim())) return readings;
    return [(await scanFicheWithServerOcr(file, accessToken)).text];
  }
  try {
    return [(await scanFicheWithServerOcr(file, accessToken)).text];
  } catch {
    return [(await scanFiche(file, onProgress)).text];
  }
}

// No client code on the document: look the client up by the name written on it.
async function findClientCode(accessToken, name) {
  const matches = await searchClients(accessToken, name, 5).catch(() => []);
  const fullName = (client) => clean(`${client.lastName} ${client.firstName}`).toLowerCase();
  const exact = matches.filter((client) => fullName(client) === name.toLowerCase() || String(client.Nom || '').toLowerCase() === name.toLowerCase());
  const pick = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
  return pick?.clientCode || '';
}

const AI_TYPES = { traite: 'Traite', cheque: 'Chèque', chèque: 'Chèque', virement: 'Virement' };

// Scans the document and returns { values, found, text }: `values` uses the Recette field names,
// `found` lists every value read ({ key, label, value }) for display.
export async function scanPayment(file, { accessToken, banks = [], onProgress } = {}) {
  const [ai, texts] = await Promise.all([
    extractCheque(accessToken, file).catch(() => null),
    readTexts(file, accessToken, onProgress).catch(() => []),
  ]);
  if (!ai && !texts.some((text) => text.trim())) throw new Error('aucun texte n’a pu être lu (vérifiez la qualité du document).');

  const values = extractPaymentAll(texts, banks);
  const fields = ai?.fields || {};
  // The cheque reader knows the layout of a cheque: its values win over the plain text, except the bank
  // when the document gives its code.
  if (fields.numero) values.nump = String(fields.numero).replace(/\s/g, '');
  const aiAmount = fields.montant ? toAmount(fields.montant) : 0;
  if (aiAmount > 0) values.montant = aiAmount.toFixed(3);
  if (fields.date_echeance && toIsoDate(fields.date_echeance)) values.echeance = toIsoDate(fields.date_echeance);
  if (fields.type && AI_TYPES[String(fields.type).toLowerCase()]) values.typeReglement = AI_TYPES[String(fields.type).toLowerCase()];
  if (fields.tireur && !values.tireur) values.tireur = clean(fields.tireur);
  if (fields.banque && !values.code_banque) {
    const name = String(fields.banque).trim();
    const bank = banks.find((item) => item.nom_banque && item.nom_banque.trim().length >= 3 && (nameWord(item.nom_banque.trim()).test(name) || item.nom_banque.trim().toLowerCase() === name.toLowerCase()));
    if (bank) values.code_banque = bank.code_banque;
    else if (!values.banqueLue) values.banqueLue = name;
  }
  if (!values.code && values.nomClient && accessToken) {
    const code = await findClientCode(accessToken, values.nomClient);
    if (code) values.code = code;
  }

  const shown = (key, value) => {
    if (key === 'code_banque') return `${value} - ${banks.find((bank) => bank.code_banque === value)?.nom_banque || ''}`;
    if (['echeance', 'dateEmission', 'dateSaisie'].includes(key)) return value.split('-').reverse().join('/');
    if (key === 'quittances') return value.join(', ');
    return value;
  };
  const found = Object.keys(PAYMENT_LABELS).filter((key) => values[key]).map((key) => ({ key, label: PAYMENT_LABELS[key], value: shown(key, values[key]) }));
  const text = [ai ? `Lecture chèque : ${JSON.stringify(fields)}` : '', ...texts.slice(0, 1)].filter(Boolean).join('\n\n');
  return { values, found, text };
}
