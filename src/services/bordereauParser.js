// Reads a bordereau sent by an insurer (Excel .xlsx or .csv) and turns it into lines the API can store.
// The columns are found from their titles (several spellings accepted); the user can correct the mapping.

export const BORDEREAU_FIELDS = [
  { key: 'num_police', label: 'N° Police', required: true, synonyms: ['npolice', 'numpolice', 'numint', 'numeropolice', 'policen', 'police', 'ncontrat', 'numcontrat', 'contrat', 'npol'] },
  { key: 'code_client', label: 'Code client', synonyms: ['codeclient', 'codeclt', 'cclient', 'codecli', 'codecl', 'ncl', 'client'] },
  { key: 'nom_client', label: 'Nom client', synonyms: ['nomclient', 'nomassure', 'nometprenom', 'nomprenom', 'raisonsociale', 'souscripteur', 'assure', 'nom'] },
  // LLOYD: the terme falls on the "Date d'effet acte comptable" (its "Date d'échéance" is the end of the period covered)
  { key: 'echeance', label: 'Échéance', synonyms: ['echeance', 'dateecheance', 'dateterme', 'terme', 'dech', 'datedeffetactecomptable', 'dateeffetactecomptable', 'dateeffet', 'datedeffet'] },
  // LLOYD: the quittance is the "N° d'acte comptable"
  { key: 'num_quittance', label: 'N° Quittance', synonyms: ['nquittance', 'numquittance', 'numeroquittance', 'quittancen', 'nquitt', 'nquit', 'numquit', 'quittance', 'quit', 'ndactecomptable', 'nactecomptable', 'numeroacte'] },
  { key: 'prime_net', label: 'P. Net + C.Q.', synonyms: ['primenette', 'primenet', 'pnetcq', 'pnet', 'netcq', 'net'] },
  { key: 'commission', label: 'Commission', synonyms: ['commission', 'commissions', 'comcie', 'comm', 'com'] },
  // LLOYD: the "Prime brut"; never what was cashed ("Montant encaissé", empty on a terme to come)
  { key: 'prime_total', label: 'Prime totale', synonyms: ['primetotale', 'primetotal', 'primebrut', 'primebrute', 'primettc', 'totalttc', 'montantttc', 'ptotal', 'ttc', 'total', 'montant'], never: /encaiss|commission|retenue|ristourne/ },
];

// Legacy grid order, used when the file has no title row.
const POSITIONAL = { num_police: 1, code_client: 2, nom_client: 3, echeance: 4, num_quittance: 5, prime_net: 6, commission: 7, prime_total: 8 };

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Titles and names saved in UTF-8 but read as Windows-1252 ("Ã©chÃ©ance" for "échéance", in the LLOYD exports):
// given back their accents; any other text is left as it is.
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a,
  0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98,
  0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
export function repairText(text) {
  if (typeof text !== 'string' || !/[\u00c3\u00c2\u00e2][\u0080-\u00ff\u0152-\u2122]/.test(text)) return text;
  const bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    const byte = code < 0x100 ? code : CP1252[code];
    if (byte === undefined) return text;
    bytes.push(byte);
  }
  return decodeUtf8(bytes) ?? text;
}

// UTF-8 bytes -> text; null when they are not valid UTF-8 (the text was not garbled after all).
function decodeUtf8(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i];
    const size = first < 0x80 ? 1 : first >= 0xc2 && first < 0xe0 ? 2 : first >= 0xe0 && first < 0xf0 ? 3 : first >= 0xf0 && first < 0xf5 ? 4 : 0;
    if (!size || i + size > bytes.length) return null;
    let code = size === 1 ? first : first & (0xff >> (size + 1));
    for (let k = 1; k < size; k += 1) {
      const next = bytes[i + k];
      if ((next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    out += String.fromCodePoint(code);
    i += size;
  }
  return out;
}

function cellToPlain(value) {
  if (value == null) return '';
  if (typeof value === 'string') return repairText(value);
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return cellToPlain(value.result);
    if ('text' in value) return repairText(String(value.text));
    if ('error' in value) return '';
  }
  return value;
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = [';', '\t', ','].map((char) => [char, firstLine.split(char).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(await file.text()).map((row) => row.map(repairText));
  if (name.endsWith('.xls')) {
    // Legacy Excel 97-2003 files (what the legacy software exports): read with SheetJS. Dates stay Excel serial numbers.
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheets = workbook.SheetNames.map((sheetName) => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '', blankrows: false }));
    const rows = sheets.find((candidate) => candidate.length > 1) || sheets[0];
    if (!rows) throw new Error('Le fichier ne contient aucune feuille.');
    return rows;
  }
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets.find((candidate) => candidate.actualRowCount > 1) || workbook.worksheets[0];
  if (!sheet) throw new Error('Le fichier ne contient aucune feuille.');
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    for (let column = 1; column <= row.cellCount; column += 1) values.push(cellToPlain(row.getCell(column).value));
    rows.push(values);
  });
  return rows;
}

function guessMapping(headers) {
  const normalized = headers.map(normalize);
  const used = new Set();
  const mapping = {};
  // the synonyms in their order: the most precise title first (when a file has several columns that could fit)
  const pick = (field, test) => {
    for (const synonym of field.synonyms) {
      if (mapping[field.key] !== undefined) return;
      const index = normalized.findIndex((header, position) => header && !used.has(position) && !field.never?.test(header) && test(header, synonym));
      if (index >= 0) { mapping[field.key] = index; used.add(index); }
    }
  };
  BORDEREAU_FIELDS.forEach((field) => pick(field, (header, synonym) => header === synonym));
  BORDEREAU_FIELDS.forEach((field) => pick(field, (header, synonym) => synonym.length >= 5 && header.includes(synonym)));
  return mapping;
}

export async function readBordereauFile(file) {
  const rows = await readRows(file);
  if (!rows.length) throw new Error('Le fichier est vide.');

  // The title row is the one (among the first 25) whose cells match the most known titles.
  let headerRow = -1;
  let best = 1;
  rows.slice(0, 25).forEach((row, index) => {
    const score = Object.keys(guessMapping(row.map(String))).length;
    if (score > best) { best = score; headerRow = index; }
  });

  const width = Math.max(...rows.slice(0, 50).map((row) => row.length));
  const headers = headerRow >= 0
    ? Array.from({ length: width }, (_, index) => String(rows[headerRow][index] ?? '').trim() || `Colonne ${index + 1}`)
    : Array.from({ length: width }, (_, index) => `Colonne ${index + 1}`);
  const mapping = headerRow >= 0 ? guessMapping(headers) : { ...POSITIONAL };
  // Some exports repeat the company code, the type (T / C) and the period on every line: use them to fill the form.
  const meta = {};
  if (headerRow >= 0) {
    const normalized = headers.map(normalize);
    const first = rows.slice(headerRow + 1).find((row) => row.some((cell) => String(cell ?? '').trim())) || [];
    const read = (name) => { const index = normalized.indexOf(name); return index >= 0 ? String(first[index] ?? '').trim() : ''; };
    meta.code_compagnie = read('codecompagnie');
    meta.tc = read('tc').toUpperCase().slice(0, 1);
    meta.periode = /^\d{1,2}\/\d{4}$/.test(read('periode')) ? read('periode').padStart(7, '0') : '';
  }
  return { rows, headerRow, headers, mapping, meta, titled: headerRow >= 0 };
}

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').replace(/\s| /g, '').replace(/[A-Za-z]/g, '');
  if (!text) return null;
  const cleaned = /,\d{1,3}$/.test(text) ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

// monthHint: month (1-12) of the period, used to read 11/4/2026 as 4 November rather than 11 April.
export function toIsoDate(value, monthHint) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel dates come back at UTC midnight: read them in UTC to keep the day.
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  // Excel serial day number (1900 date system), e.g. 46348 -> 2026-11-22
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const first = Number(match[1]);
    const second = Number(match[2]);
    // dd/mm/yyyy by default; month-first (mm/dd/yyyy) when the first number cannot be a day or the period says so.
    const monthFirst = first > 12 ? false : second > 12 ? true : Boolean(monthHint) && first === monthHint && second !== monthHint;
    const [month, day] = monthFirst ? [first, second] : [second, first];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

const toText = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, '');
  return String(value).trim().replace(/\.0+$/, '');
};

// Rows -> lines. Rows without a policy number (totals, blanks, notes) are ignored.
export function buildLines({ rows, headerRow, mapping }, { periodMonth } = {}) {
  const lines = [];
  rows.slice(headerRow + 1).forEach((row) => {
    const read = (key) => (mapping[key] === undefined || mapping[key] === '' ? '' : row[mapping[key]]);
    const numPolice = toText(read('num_police')).replace(/\s/g, '');
    if (!numPolice || !/\d/.test(numPolice) || numPolice.length > 30) return;
    lines.push({
      num_police: numPolice,
      code_client: toText(read('code_client')).slice(0, 12) || null,
      nom_client: toText(read('nom_client')).replace(/\s+/g, ' ').slice(0, 120) || null,
      echeance: toIsoDate(read('echeance'), periodMonth),
      num_quittance: toText(read('num_quittance')).replace(/\s/g, '').slice(0, 30) || null,
      prime_net: toNumber(read('prime_net')),
      commission: toNumber(read('commission')),
      prime_total: toNumber(read('prime_total')),
    });
  });
  return lines;
}

// Some exports give amounts in millimes (726050 = 726.050 TND): integers only, and big.
export function looksLikeMillimes(lines) {
  const totals = lines.map((line) => line.prime_total).filter((value) => value != null);
  return totals.length > 0 && lines.every((line) => ['prime_net', 'commission', 'prime_total'].every((key) => line[key] == null || Number.isInteger(line[key]))) && Math.max(...totals) >= 10000;
}

export const scaleMillimes = (lines) => lines.map((line) => ({
  ...line,
  prime_net: line.prime_net == null ? null : line.prime_net / 1000,
  commission: line.commission == null ? null : line.commission / 1000,
  prime_total: line.prime_total == null ? null : line.prime_total / 1000,
}));

// Rows of the first sheet of an Excel (.xlsx / .xls) or CSV file, as arrays of plain values (also used for fleet lists).
export { readRows as readSpreadsheetRows };
