// Reads a bordereau sent by an insurer (Excel .xlsx or .csv) and turns it into lines the API can store.
// The columns are found from their titles (several spellings accepted); the user can correct the mapping.

export const BORDEREAU_FIELDS = [
  { key: 'num_police', label: 'N° Police', required: true, synonyms: ['npolice', 'numpolice', 'numint', 'numeropolice', 'policen', 'police', 'ncontrat', 'numcontrat', 'contrat', 'npol'] },
  { key: 'code_client', label: 'Code client', synonyms: ['codeclient', 'codeclt', 'cclient', 'codecli', 'codecl', 'ncl', 'client'] },
  { key: 'nom_client', label: 'Nom client', synonyms: ['nomclient', 'nomassure', 'nometprenom', 'nomprenom', 'raisonsociale', 'souscripteur', 'assure', 'nom'] },
  { key: 'echeance', label: 'Échéance', synonyms: ['echeance', 'dateecheance', 'dateterme', 'terme', 'dech'] },
  { key: 'num_quittance', label: 'N° Quittance', synonyms: ['nquittance', 'numquittance', 'numeroquittance', 'quittancen', 'nquitt', 'nquit', 'numquit', 'quittance', 'quit'] },
  { key: 'prime_net', label: 'P. Net + C.Q.', synonyms: ['primenette', 'primenet', 'pnetcq', 'pnet', 'netcq', 'net'] },
  { key: 'commission', label: 'Commission', synonyms: ['commission', 'commissions', 'comcie', 'comm', 'com'] },
  { key: 'prime_total', label: 'Prime totale', synonyms: ['primetotale', 'primetotal', 'primettc', 'totalttc', 'montantttc', 'ptotal', 'ttc', 'total', 'montant'] },
];

// Legacy grid order, used when the file has no title row.
const POSITIONAL = { num_police: 1, code_client: 2, nom_client: 3, echeance: 4, num_quittance: 5, prime_net: 6, commission: 7, prime_total: 8 };

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function cellToPlain(value) {
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return cellToPlain(value.result);
    if ('text' in value) return String(value.text);
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
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(await file.text());
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
  const pick = (field, test) => {
    if (mapping[field.key] !== undefined) return;
    const index = normalized.findIndex((header, position) => header && !used.has(position) && test(header));
    if (index >= 0) { mapping[field.key] = index; used.add(index); }
  };
  BORDEREAU_FIELDS.forEach((field) => pick(field, (header) => field.synonyms.includes(header)));
  BORDEREAU_FIELDS.forEach((field) => pick(field, (header) => field.synonyms.some((synonym) => synonym.length >= 5 && header.includes(synonym))));
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
