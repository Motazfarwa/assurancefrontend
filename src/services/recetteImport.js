// Reads a payment document (cheque, transfer slip, receipt...) from an image or a PDF and extracts the
// fields of the "Recette technique" form. Reuses the OCR of the client-file import.
import { scanFiche, scanFicheWithServerOcr, isPdf, toIsoDate } from './ficheOcr';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const normalize = (text) => String(text || '').replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/\r/g, '');

const AMOUNT_RE = /\d{1,3}(?:[ .]\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3}/g;
const toAmount = (value) => {
  const text = String(value).replace(/\s/g, '');
  const normalized = /[.,]\d{3}[.,]\d{2,3}$/.test(text) ? text.replace(/[.,](?=\d{3}[.,])/g, '') : text;
  const number = Number(normalized.replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
};

// Pulls the payment fields out of raw OCR text. `banks` is the list of { code_banque, nom_banque }.
export function extractRecette(rawText, banks = []) {
  const text = normalize(rawText);
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const flat = lines.join(' ');
  const result = {};

  // Payment type
  if (/virement/i.test(flat)) result.typeReglement = 'Virement';
  else if (/\btraite\b|lettre\s+de\s+change/i.test(flat)) result.typeReglement = 'Traite';
  else if (/esp[èe]ces|\bcash\b/i.test(flat)) result.typeReglement = 'Espèces';
  else if (/carte\s+bancaire|\bTPE\b/i.test(flat)) result.typeReglement = 'Carte bancaire';
  else if (/ch[èe]que|\bcheque\b|\bpayez\b/i.test(flat)) result.typeReglement = 'Chèque';

  // Client code
  const client = flat.match(/(?:code\s+client|client\s+n[°o]|n[°o]\s*client)\s*[:.-]?\s*(\d{1,8})/i);
  if (client) result.code = client[1];

  // Piece number (cheque / transfer reference)
  const piece = flat.match(/(?:n[°o]\s*(?:de\s+)?(?:ch[èe]que|pi[èe]ce|virement|traite)|ch[èe]que\s+n[°o]?|r[ée]f(?:[ée]rence)?)\s*[:.-]?\s*([A-Za-z0-9-]{4,20})/i);
  if (piece) result.nump = piece[1];
  else {
    const digits = flat.match(/\b\d{7,9}\b/);
    if (digits && result.typeReglement === 'Chèque') result.nump = digits[0];
  }

  // Amount: the figure next to a "montant"/"total"/"DT" label, else the largest amount on the document.
  const labelled = flat.match(/(?:montant|somme|total|la\s+somme\s+de)[^\d]{0,30}(\d{1,3}(?:[ .]\d{3})*[.,]\d{2,3}|\d+[.,]\d{2,3}|\d+)/i);
  const amounts = (flat.match(AMOUNT_RE) || []).map(toAmount).filter((n) => n > 0);
  const amount = labelled ? toAmount(labelled[1]) : amounts.length ? Math.max(...amounts) : 0;
  if (amount > 0) result.montant = amount.toFixed(3);

  // Due date ("échéance") or, failing that, the first date found
  const due = flat.match(/[ée]ch[ée]ance[^\d]{0,15}(\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4})/i);
  const anyDate = flat.match(/\b\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{4}\b/);
  const date = toIsoDate(due ? due[1] : anyDate ? anyDate[0] : '');
  if (date) result.echeance = date;

  // Bank: by name or code
  const upper = flat.toUpperCase();
  const bank = banks.find((item) => item.nom_banque && upper.includes(String(item.nom_banque).toUpperCase()))
    || banks.find((item) => item.code_banque && new RegExp(`(?:banque|bank)\\s*[:.\\-]?\\s*${item.code_banque}\\b`, 'i').test(flat));
  if (bank) result.code_banque = bank.code_banque;

  // Receipt numbers (quittances)
  const quittances = [...flat.matchAll(/quittance[s]?\s*(?:n[°o])?\s*[:.-]?\s*([A-Za-z0-9/-]{4,20})/gi)].map((m) => m[1]);
  if (quittances.length) result.quittances = [...new Set(quittances)];

  return result;
}

// Scans an image (JPG/PNG) or a PDF and returns the extracted form values.
export async function scanRecette(file, banks, accessToken, onProgress) {
  let reading;
  if (isPdf(file)) {
    reading = await scanFicheWithServerOcr(file, accessToken);
  } else {
    try {
      reading = await scanFiche(file, onProgress);
    } catch (localError) {
      reading = await scanFicheWithServerOcr(file, accessToken);
    }
  }
  return { text: reading.text, values: extractRecette(reading.text, banks) };
}
