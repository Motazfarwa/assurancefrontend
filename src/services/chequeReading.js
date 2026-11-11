// Reading of a real bank cheque (Tunisian cheques: printed RIB, cheque number, account holder; amount and date written
// by hand) from the OCR text. Each value is checked before it is used, so a misread value is left empty with a warning
// rather than filled wrong:
//  - the cheque number (printed "Chèque N°"), confirmed by the code line at the bottom (number + RIB);
//  - the RIB (20 digits), validated by its key; its first two digits give the bank (code of the Banque Centrale);
//  - the amount in figures, confirmed by the amount in words (the words prevail by law, a mismatch is reported);
//  - the date of the cheque ("à Tunis, le 6/10/26"), never the "Validité" of the chequebook;
//  - the account holder (the client who pays), never the payee ("À l'ordre de": the agency).

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const normalize = (text) => String(text || '').replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/\r/g, '');
const fold = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Is this the text of a bank cheque (and not of a receipt or a transfer slip)?
export const isBankCheque = (text) => /payez\s+contre\s+ce\s+ch|non\s+endossable|titulaire\s+du\s+compte|ch[eè]que\s*n\s*[°o*º'e]?\s*:?\s*\d{6}/i.test(fold(text));

// ---- RIB ----
// Tunisian RIB: bank (2) + agency (3) + account (13) + key (2); key = 97 - (first 18 digits × 100 mod 97).
export function ribKeyValid(rib) {
  if (!/^\d{20}$/.test(rib)) return false;
  const rest = [...rib.slice(0, 18), '0', '0'].reduce((mod, digit) => (mod * 10 + Number(digit)) % 97, 0);
  return 97 - rest === Number(rib.slice(18));
}

function findRibs(lines) {
  const found = [];
  lines.forEach((line, index) => {
    // 20 digits written in groups ("04 001 007 4040073373 37"), possibly inside a longer code line
    const runs = line.match(/\d[\d \t]{18,}\d/g) || [];
    runs.forEach((run) => {
      const digits = run.replace(/\s/g, '');
      if (digits.length === 20) found.push({ rib: digits, index, valid: ribKeyValid(digits) });
      else if (digits.length > 20) {
        for (let at = 0; at + 20 <= digits.length; at += 1) {
          const rib = digits.slice(at, at + 20);
          if (ribKeyValid(rib)) found.push({ rib, index, valid: true, before: digits.slice(0, at) });
        }
      }
    });
  });
  return found.sort((a, b) => Number(b.valid) - Number(a.valid));
}

// ---- Bank ----
// First two digits of a RIB (codes of the Banque Centrale de Tunisie) -> bank.
const RIB_BANKS = { '01': 'ATB', '03': 'BNA', '04': 'ATTIJARI', '05': 'BT', '07': 'AMEN', '08': 'BIAT', '10': 'STB', '11': 'UBCI', '12': 'UIB', '14': 'BH', '17': 'POSTE', '20': 'BTK', '25': 'ZITOUNA' };
// Names printed on the cheque (whole words) -> bank.
const PRINTED_BANKS = [
  [/\battijari\b/, 'ATTIJARI'], [/\bamen\s*bank\b/, 'AMEN'], [/\bbiat\b|banque\s+internationale\s+arabe/, 'BIAT'], [/\bzitouna\b/, 'ZITOUNA'],
  [/banque\s+de\s+l\W?\s*habitat/, 'BH'], [/banque\s+nationale\s+agricole/, 'BNA'], [/societe\s+tunisienne\s+de\s+banque/, 'STB'],
  [/union\s+internationale\s+de\s+banques/, 'UIB'], [/union\s+bancaire\s+pour\s+le\s+commerce/, 'UBCI'], [/arab\s+tunisian\s+bank/, 'ATB'],
  [/banque\s+de\s+tunisie(?!\s+et\s+des\s+emirats)/, 'BT'], [/la\s+poste\s+tunisienne/, 'POSTE'],
];
// The agency's own bank list (TTBanque) names these banks its own way: matched by name, never by number.
const AGENCY_NAMES = { ATB: ['ATB'], BNA: ['BNA'], ATTIJARI: ['ATTIJARI', 'ATTIJARIBANK'], BT: ['BT'], AMEN: ['AMENBANK', 'AMEN'], BIAT: ['BIAT'], STB: ['STB'], UBCI: ['UBCI'], UIB: ['UIB'], BH: ['BH'], POSTE: ['CCP', 'POSTE', 'LAPOSTE'], BTK: ['BTK'], ZITOUNA: ['ZITOUNA'] };
const squash = (name) => fold(name).replace(/[^a-z0-9]/g, '').toUpperCase();
export function agencyBank(bank, banks) {
  const names = AGENCY_NAMES[bank] || [];
  for (const name of names) {
    const row = banks.find((item) => squash(item.nom_banque) === name);
    if (row) return row;
  }
  return null;
}
const BANK_LABELS = { ATB: 'ATB', BNA: 'BNA', ATTIJARI: 'Attijari bank', BT: 'Banque de Tunisie', AMEN: 'Amen Bank', BIAT: 'BIAT', STB: 'STB', UBCI: 'UBCI', UIB: 'UIB', BH: 'BH Bank', POSTE: 'La Poste', BTK: 'BTK', ZITOUNA: 'Banque Zitouna' };

// ---- Amount in words ----
const NUMBER_WORDS = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  septante: 70, huitante: 80, octante: 80, nonante: 90, cent: 100, cents: 100, mille: 1000, milles: 1000, million: 1000000, millions: 1000000,
};
const VOCABULARY = Object.keys(NUMBER_WORDS);

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

// A word of the amount, also when a letter of the handwriting is misread ("soixantc", "quatorse"); short words exactly.
function numberWord(token) {
  if (token in NUMBER_WORDS) return token;
  if (token.length < 5) return null;
  const close = VOCABULARY.filter((word) => word.length >= 5 && Math.abs(word.length - token.length) <= 1 && distance(word, token) <= 1);
  return close.length === 1 ? close[0] : null;
}

// "mille soixante quatorze" -> 1074; "quatre vingt dix" -> 90; "deux cent cinquante" -> 250.
export function wordsToNumber(words) {
  let total = 0;
  let current = 0;
  words.forEach((word) => {
    const value = NUMBER_WORDS[word];
    if (value === 1000000 || value === 1000) { total += (current || 1) * value; current = 0; } // "mille", "deux mille"
    else if (value === 100) current = (current || 1) * 100; // "cent", "deux cent"
    else if (value === 20 && current % 100 === 4) current += 76; // "quatre vingt" = 80
    else current += value; // "soixante dix" = 70, "dix sept" = 17
  });
  return total + current;
}

// The amount written in words: { dinars, millimes|null, text } or null.
export function amountInWords(text) {
  const folded = fold(text);
  // Only between "Payez contre ce chèque / la somme de" and "À l'ordre de" when the cheque has these words.
  const start = folded.search(/payez\s+contre|la\s+somme\s+de/);
  const end = folded.search(/a\s+l\W?\s*ordre\s+de|\bordre\s+de\b/);
  const zone = start >= 0 && end > start ? folded.slice(start, end) : folded;
  const tokens = zone.split(/[^a-z0-9]+/).filter(Boolean);
  const runs = [];
  let run = [];
  tokens.forEach((token, index) => {
    const word = numberWord(token);
    if (word) run.push({ word, index });
    else if (token === 'et' && run.length) run.push({ word: 'et', index });
    else { if (run.length) runs.push(run); run = []; }
  });
  if (run.length) runs.push(run);
  // "d'un organisme", "d'une banque": a lone "un" is not an amount.
  const candidates = runs.map((items) => items.filter((item) => item.word !== 'et')).filter((items) => items.length && !(items.length === 1 && NUMBER_WORDS[items[0].word] < 2));
  if (!candidates.length) return null;
  const dinarRun = candidates.find((items) => /^(dinars?|dt|dts|dnt|dns)$/.test(tokens[items[items.length - 1].index + 1] || '')) || [...candidates].sort((a, b) => b.length - a.length)[0];
  const dinars = wordsToNumber(dinarRun.map((item) => item.word));
  if (!dinars) return null;
  // The millimes: figures or words just after the dinars ("dinars 768 millimes", "et cinq cents millimes").
  const after = tokens.slice(dinarRun[dinarRun.length - 1].index + 1, dinarRun[dinarRun.length - 1].index + 9);
  let millimes = null;
  const milIndex = after.findIndex((token) => /^m(il|ill|illi|illimes?|ls?|m)?\w*$/.test(token) && token !== 'mille');
  if (milIndex > 0) {
    const before = after.slice(0, milIndex).filter((token) => !/^(dinars?|dt|dts|dns|et)$/.test(token));
    if (before.length === 1 && /^\d{1,3}$/.test(before[0])) millimes = Number(before[0]);
    else if (before.length && before.every((token) => numberWord(token))) millimes = wordsToNumber(before.map(numberWord));
  }
  if (millimes != null && millimes > 999) millimes = null;
  return { dinars, millimes, text: dinarRun.map((item) => item.word).join(' ') };
}

// ---- Amount in figures ----
// "1074,768", "1 074,768", "1.074,768", "1074 , 768". { value, decimals, raw } or null.
function parseFigure(raw) {
  const match = String(raw).match(/(\d{1,3}(?:[ .]\d{3})+|\d+)\s*[,.]\s*(\d{1,3})(?!\d)/) || String(raw).match(/^\s*(\d{1,7})\s*$/);
  if (!match) return null;
  const units = Number(match[1].replace(/[ .]/g, ''));
  const decimals = match[2] || '';
  return { value: units + (decimals ? Number(decimals.padEnd(3, '0')) / 1000 : 0), decimals: decimals.length, raw: match[0].trim() };
}

function amountInFigures(lines, flat) {
  const framed = flat.match(/#\s*(\d[\d .,]*\d)\s*(?:DT|TND|dinars?)?\s*#/i);
  if (framed) return parseFigure(framed[1]);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/max/i.test(line)) continue;
    // "B.P. 1074,768" (bon pour), "Montant (TND) 1 250,500" — never "Montant max".
    const label = line.match(/\b(?:b\s*\.?\s*p\s*\.?|bon\s+pour|montant(?:\s*\([^)]*\))?)\s*[:.]?\s*(.*)$/i);
    if (!label) continue;
    const value = parseFigure(label[1]) || (lines[index + 1] && !/max/i.test(lines[index + 1]) ? parseFigure(lines[index + 1]) : null);
    if (value && value.value > 0) return value;
  }
  return null;
}

// ---- Date of the cheque ----
const DATE_RE = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})(?!\d)/g;
function toDate(day, month, year) {
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
  const date = new Date(Date.UTC(fullYear, Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
  return date.toISOString().slice(0, 10);
}

function chequeDate(lines, today) {
  const year = Number(today.slice(0, 4));
  let validite = null;
  const misread = [];
  const candidates = [];
  lines.forEach((line) => {
    for (const match of line.matchAll(DATE_RE)) {
      const iso = toDate(match[1], match[2], match[3]);
      const before = fold(line.slice(Math.max(0, match.index - 18), match.index));
      if (/validit/.test(before)) { if (iso) validite = iso; continue; }
      const labelled = /\ble\s*[:.]?\s*$/.test(before);
      const echeance = /ech[ea]ance|payable\s+le/.test(before);
      if (iso && Number(iso.slice(0, 4)) >= year - 1 && Number(iso.slice(0, 4)) <= year + 1) candidates.push({ iso, labelled, echeance });
      else misread.push(match[0]);
    }
  });
  const pick = candidates.find((item) => item.echeance) || candidates.find((item) => item.labelled) || candidates[0];
  if (pick && validite && pick.iso > validite) return { iso: null, validite, misread: [...misread, pick.iso.split('-').reverse().join('/')] };
  return { iso: pick?.iso || null, validite, misread };
}

// ---- Account holder ----
const NOT_A_NAME = /\b(agence|avenue|av|rue|route|tel|fax|tnd|bank|banque|titulaire|signature|payable|validite|ordre|cheque|compte|montant|attijari|tunis|ariana|sfax|sousse|bp|cedex|payez|sauf|profit)\b/;
function nameLine(line) {
  const cleaned = line.replace(/[^A-Za-zÀ-ÿ' -]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const words = cleaned.split(' ').filter((word) => word.replace(/'/g, '').length >= 2);
  if (words.length < 2 || words.length > 6) return '';
  const letters = cleaned.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 6 || letters !== letters.toUpperCase() || NOT_A_NAME.test(fold(cleaned))) return '';
  return words.join(' ');
}

function accountHolder(lines, ribIndex) {
  const order = [];
  if (ribIndex >= 0) order.push(ribIndex + 1, ribIndex + 2, ribIndex - 1);
  const label = lines.findIndex((line) => /titulaire\s+du\s+compte/i.test(fold(line)));
  if (label >= 0) order.push(label + 1, label + 2, label + 3);
  for (const index of order) {
    const name = lines[index] && nameLine(lines[index]);
    if (name) return name;
  }
  return '';
}

const money = (value) => value.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// Everything read on one OCR text of a cheque. `banks`: the agency's banks ({ code_banque, nom_banque }).
// Returns { values, warnings }: values use the payment field names (nump, montant, echeance, code_banque, banqueLue, rib, tireur).
export function readCheque(rawText, banks = [], today = new Date().toISOString().slice(0, 10)) {
  const lines = normalize(rawText).split('\n').map((line) => line.trim()).filter(Boolean);
  const flat = lines.join(' ');
  const values = { typeReglement: /traite|lettre\s+de\s+change/i.test(fold(flat)) ? 'Traite' : 'Chèque' };
  const warnings = [];

  // RIB and bank
  const ribs = findRibs(lines);
  const rib = ribs.find((item) => item.valid);
  if (rib) values.rib = rib.rib;
  else if (ribs.length) warnings.push(`RIB lu « ${ribs[0].rib} » mais sa clé est incorrecte : non utilisé.`);
  const ribBank = rib ? RIB_BANKS[rib.rib.slice(0, 2)] : null;
  const printed = (PRINTED_BANKS.find(([pattern]) => pattern.test(fold(flat))) || [])[1] || null;
  if (ribBank && printed && ribBank !== printed) warnings.push(`Banque : le RIB indique ${BANK_LABELS[ribBank]}, le chèque porte ${BANK_LABELS[printed]} (RIB retenu).`);
  const bank = ribBank || printed;
  if (bank) {
    values.banqueLue = BANK_LABELS[bank];
    const row = agencyBank(bank, banks);
    if (row) values.code_banque = row.code_banque;
    else if (banks.length) warnings.push(`Banque ${BANK_LABELS[bank]} absente de la liste des banques : choisissez-la à la main.`);
  }

  // Cheque number: printed "Chèque N° 0451261" (label and number may be on two lines), confirmed by the code line.
  let nump = '';
  lines.forEach((line, index) => {
    if (nump) return;
    const match = fold(line).match(/ch[e]que\s*n\s*[°o*º'e]?\s*[:.]?\s*(\d{6,8})\b/) || fold(line).match(/(?:n[°o]\s*(?:de\s+)?)?ch[e]que\s*n\s*[°o*º'e]?\s*$/);
    if (match?.[1]) nump = match[1];
    else if (match && /^\d{6,8}$/.test((lines[index + 1] || '').replace(/\s/g, ''))) nump = lines[index + 1].replace(/\s/g, '');
  });
  const coded = rib?.before && rib.before.length >= 6 ? rib.before.slice(-7).replace(/^0(?=\d{7})/, '') : '';
  if (nump && coded && !coded.endsWith(nump) && !nump.endsWith(coded)) warnings.push(`N° de chèque : ${nump} imprimé, ${coded} sur la ligne de code (imprimé retenu).`);
  if (!nump && coded) nump = coded;
  if (nump) values.nump = nump;

  // Amount: figures checked against the words.
  const figures = amountInFigures(lines, flat);
  const words = amountInWords(flat);
  const wordsValue = words ? words.dinars + (words.millimes ?? 0) / 1000 : null;
  const figuresOk = figures && (figures.decimals === 0 || figures.decimals === 3);
  if (figuresOk && words) {
    const same = Math.abs(figures.value - wordsValue) < 0.0005 || (words.millimes == null && Math.floor(figures.value) === words.dinars);
    if (same) values.montant = figures.value.toFixed(3);
    else warnings.push(`Montant à vérifier : ${money(figures.value)} en chiffres, ${money(wordsValue)} en lettres (« ${words.text} »).`);
  } else if (figuresOk) {
    values.montant = figures.value.toFixed(3);
    if (isBankCheque(flat)) warnings.push(`Montant lu en chiffres seulement (${money(figures.value)}), non confirmé par le montant en lettres : vérifiez.`);
  } else if (words && words.millimes != null) {
    values.montant = wordsValue.toFixed(3);
    warnings.push(`Montant lu en lettres seulement (${money(wordsValue)}) : vérifiez.`);
  } else if (figures) {
    warnings.push(`Montant en chiffres mal lu (« ${figures.raw} ») : saisissez-le.`);
  } else if (words && words.text.includes(' ')) {
    warnings.push(`Montant en lettres lu en partie (« ${words.text} ») : saisissez le montant.`);
  } else {
    warnings.push('Montant non lu (écriture illisible) : saisissez-le.');
  }

  // Date of the cheque (the "Validité" of the chequebook is not a date of the cheque).
  const date = chequeDate(lines, today);
  if (date.iso) values.echeance = date.iso;
  else warnings.push(date.misread.length ? `Date du chèque mal lue (« ${date.misread[0]} ») : saisissez-la.` : 'Date du chèque non lue : saisissez-la.');

  const holder = accountHolder(lines, rib ? rib.index : (ribs[0]?.index ?? -1));
  if (holder) values.tireur = holder;
  return { values, warnings };
}

// Several readings of the same cheque: for each value the first reading that has it; for each value still missing or
// doubtful, the most useful warning of the readings.
const WARNING_RANK = [/^Montant à vérifier/, /^Montant lu en/, /^Montant en chiffres/, /^Montant en lettres/, /^Montant non lu/, /^Date du chèque mal/, /^Date du chèque non/];
export function readChequeAll(texts, banks = [], today) {
  const readings = texts.map((text) => readCheque(text, banks, today));
  const values = readings.map((reading) => reading.values).reduce((merged, reading) => ({ ...reading, ...merged }), {});
  const all = [...new Set(readings.flatMap((reading) => reading.warnings))];
  const rank = (warning) => { const at = WARNING_RANK.findIndex((pattern) => pattern.test(warning)); return at < 0 ? 99 : at; };
  const best = (prefix) => all.filter((warning) => warning.startsWith(prefix)).sort((a, b) => rank(a) - rank(b))[0];
  // the amount kept comes from a reading: its own remark on it (figures only, words only) stays
  const amountNote = values.montant ? readings.find((reading) => reading.values.montant === values.montant)?.warnings.find((warning) => /^Montant lu en/.test(warning)) : best('Montant');
  const warnings = all.filter((warning) => !/^(Montant|Date du chèque|RIB lu)/.test(warning));
  if (amountNote) warnings.unshift(amountNote);
  if (!values.echeance && best('Date du chèque')) warnings.push(best('Date du chèque'));
  if (!values.rib && best('RIB lu')) warnings.push(best('RIB lu'));
  return { values, warnings };
}
