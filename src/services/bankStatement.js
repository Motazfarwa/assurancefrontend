// Relevé bancaire (Excel / CSV sent by the bank) and its confrontation with the account movements of the agency.
import { readSpreadsheetRows, toIsoDate, toNumber } from './bordereauParser';

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The columns a statement may have, and the words of their titles.
export const BANK_COLUMNS = [
  { key: 'date', label: 'Date opération', test: (h) => h.startsWith('date') && !h.includes('valeur') },
  { key: 'valeur', label: 'Date valeur', test: (h) => h.includes('valeur') },
  { key: 'libelle', label: 'Libellé', test: (h) => ['libelle', 'operation', 'designation', 'description', 'motif', 'nature'].some((word) => h.includes(word)) },
  { key: 'reference', label: 'Référence', test: (h) => ['reference', 'ref', 'numero', 'cheque', 'piece'].some((word) => h.startsWith(word) || h === word) },
  { key: 'debit', label: 'Débit', test: (h) => h.includes('debit') },
  { key: 'credit', label: 'Crédit', test: (h) => h.includes('credit') },
  { key: 'montant', label: 'Montant (signé)', test: (h) => h.includes('montant') || h === 'somme' },
];

function guessColumns(headers) {
  const mapping = {};
  const used = new Set();
  const normalized = headers.map(normalize);
  BANK_COLUMNS.forEach((column) => {
    const index = normalized.findIndex((header, position) => header && !used.has(position) && column.test(header));
    if (index >= 0) { mapping[column.key] = index; used.add(index); }
  });
  return mapping;
}

// The title row is the first one (among the first 40) with a date column and amounts.
export async function readBankFile(file) {
  const rows = await readSpreadsheetRows(file);
  if (!rows.length) throw new Error('Le fichier est vide.');
  const headerRow = rows.slice(0, 40).findIndex((row) => {
    const mapping = guessColumns(row.map(String));
    return mapping.date !== undefined && (mapping.debit !== undefined || mapping.credit !== undefined || mapping.montant !== undefined);
  });
  if (headerRow < 0) throw new Error('Ligne de titres introuvable : le relevé doit avoir une colonne Date et des colonnes Débit / Crédit (ou Montant).');
  const width = Math.max(...rows.slice(headerRow, headerRow + 50).map((row) => row.length));
  const headers = Array.from({ length: width }, (_, index) => String(rows[headerRow][index] ?? '').trim() || `Colonne ${index + 1}`);
  return { rows, headerRow, headers, mapping: guessColumns(headers) };
}

// Statement rows -> { date, sens 'C' | 'D', montant, libelle, reference }. Balance lines (Solde …) and rows without a
// date or an amount are left out. Crédit on the statement = money in = a crédit of the agency account.
export function bankLines({ rows, headerRow, mapping }) {
  const cell = (row, key) => (mapping[key] === undefined ? '' : row[mapping[key]]);
  const lines = [];
  rows.slice(headerRow + 1).forEach((row, index) => {
    const day = toIsoDate(cell(row, 'date')) || toIsoDate(cell(row, 'valeur'));
    const libelle = String(cell(row, 'libelle') ?? '').trim();
    if (!day || /^(ancien |nouveau )?solde/i.test(libelle) || /^total/i.test(libelle)) return;
    const debit = Math.abs(toNumber(cell(row, 'debit')) || 0);
    const credit = Math.abs(toNumber(cell(row, 'credit')) || 0);
    const signed = toNumber(cell(row, 'montant')) || 0;
    let sens = null;
    let montant = 0;
    if (credit > 0) { sens = 'C'; montant = credit; } else if (debit > 0) { sens = 'D'; montant = debit; } else if (signed) { sens = signed > 0 ? 'C' : 'D'; montant = Math.abs(signed); }
    if (!sens) return;
    lines.push({ ligne: headerRow + index + 2, date: day, valeur: toIsoDate(cell(row, 'valeur')) || '', sens, montant: Math.round(montant * 1000) / 1000, libelle, reference: String(cell(row, 'reference') ?? '').trim() });
  });
  return lines;
}

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const digits = (value) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
// Our piece number (at least 4 digits once leading zeros are dropped) written in the bank's reference or libellé.
const sameReference = (ours, bank) => {
  const number = digits(ours.reference);
  return number.length >= 4 && digits(`${bank.reference} ${bank.libelle}`).includes(number);
};

// Pairs each statement line with one of our movements: same direction and same amount (to the millime), first when the
// piece number matches, then by the closest date within `tolerance` days. Returns the pairs, ours alone, the bank's alone.
export function confront(ours, bank, tolerance = 10) {
  const free = new Set(ours.map((_, index) => index));
  const taken = new Set();
  const matched = [];
  const pair = (bankIndex, ourIndex, how) => {
    free.delete(ourIndex); taken.add(bankIndex);
    matched.push({ ours: ours[ourIndex], bank: bank[bankIndex], ecart: days(ours[ourIndex].date_mvt, bank[bankIndex].date), how });
  };
  const sameAmount = (o, b) => o.sens === b.sens && Math.abs(Number(o.montant) - Number(b.montant)) < 0.0005;

  bank.forEach((line, bankIndex) => {
    const index = [...free].find((ourIndex) => sameAmount(ours[ourIndex], line) && sameReference(ours[ourIndex], line));
    if (index !== undefined) pair(bankIndex, index, 'référence');
  });
  // Closest dates first, so one early movement does not take the line of a later one.
  const candidates = [];
  bank.forEach((line, bankIndex) => {
    if (taken.has(bankIndex)) return;
    free.forEach((ourIndex) => {
      const gap = Math.abs(days(ours[ourIndex].date_mvt, line.date));
      if (sameAmount(ours[ourIndex], line) && gap <= tolerance) candidates.push({ bankIndex, ourIndex, gap });
    });
  });
  candidates.sort((a, b) => a.gap - b.gap || a.bankIndex - b.bankIndex);
  candidates.forEach(({ bankIndex, ourIndex }) => {
    if (!taken.has(bankIndex) && free.has(ourIndex)) pair(bankIndex, ourIndex, 'montant et date');
  });

  matched.sort((a, b) => a.bank.date.localeCompare(b.bank.date) || a.bank.ligne - b.bank.ligne);
  const sum = (lines, sens) => Math.round(lines.filter((line) => line.sens === sens).reduce((total, line) => total + Number(line.montant), 0) * 1000) / 1000;
  return {
    matched,
    oursOnly: ours.filter((_, index) => free.has(index)),
    bankOnly: bank.filter((_, index) => !taken.has(index)),
    totals: { ours: { credit: sum(ours, 'C'), debit: sum(ours, 'D') }, bank: { credit: sum(bank, 'C'), debit: sum(bank, 'D') } },
  };
}
