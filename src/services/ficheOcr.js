// In-browser OCR of a client file (fiche client), French and Arabic, and extraction of the
// client / policy / receipt fields. Everything is returned to the caller to be reviewed before use.

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalize(text) {
  return String(text || '')
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[：﹕]/g, ':')
    .replace(/\r/g, '');
}

// "13/05/1990", "13-05-90", "1990-05-13" -> "1990-05-13"
export function toIsoDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  let year;
  let month;
  let day;
  if (match) [, year, month, day] = match;
  else {
    match = text.match(/(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2,4})/);
    if (!match) return '';
    [, day, month, year] = match;
    if (year.length === 2) year = Number(year) > 30 ? `19${year}` : `20${year}`;
  }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) || date.getMonth() + 1 !== Number(month) ? '' : iso;
}

const toNumber = (value) => {
  const cleaned = String(value || '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  return cleaned && !Number.isNaN(Number(cleaned)) ? cleaned : '';
};

const clean = (value) => String(value || '').replace(/[|_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

// Value written after one of the labels, on the same line.
function after(lines, labels) {
  const pattern = new RegExp(`(?:${labels.join('|')})\\s*[.:]?\\s*[:\\-]?\\s*(.*)$`, 'i');
  for (const line of lines) {
    const match = line.match(pattern);
    if (match && clean(match[1])) return clean(match[1]);
  }
  return '';
}

// Fields we know how to read. `kind` decides where the value goes and how it is checked.
export const FIELD_DEFS = [
  { key: 'lastName', group: 'client', label: 'Nom', labels: ['nom\\b(?!\\s*/)(?!\\s+du\\s+contact)', 'اللقب'], type: 'text' },
  { key: 'firstName', group: 'client', label: 'Prénom', labels: ['pr[ée]nom', 'الاسم'], type: 'text' },
  { key: 'birthDate', group: 'client', label: 'Date de naissance', labels: ['date\\s+de\\s+naissance', 'n[ée]\\(?e?\\)?\\s+le', 'تاريخ\\s+الولادة'], type: 'date' },
  { key: 'birthPlace', group: 'client', label: 'Lieu de naissance', labels: ['lieu\\s+de\\s+naissance', '[àa]\\s+naissance', 'مكان\\s+الولادة'], type: 'text' },
  { key: 'nationality', group: 'client', label: 'Nationalité', labels: ['nationalit[ée]', 'الجنسية'], type: 'text' },
  { key: 'profession', group: 'client', label: 'Profession', labels: ['profession', 'المهنة'], type: 'text' },
  { key: 'identityNumber', group: 'client', label: 'N° C.I.N.', labels: ['c\\.?i\\.?n\\.?', 'n[°o]\\s*(?:de\\s+)?c\\.?i\\.?n', 'بطاقة\\s+التعريف'], type: 'cin' },
  { key: 'identityDate', group: 'client', label: 'Date C.I.N.', labels: ['date\\s+(?:de\\s+)?(?:d[ée]livrance|c\\.?i\\.?n\\.?)', 'تاريخ\\s+(?:الإصدار|التسليم)'], type: 'date' },
  { key: 'identityPlace', group: 'client', label: 'Lieu C.I.N.', labels: ['lieu\\s+(?:de\\s+)?(?:d[ée]livrance|c\\.?i\\.?n\\.?)', 'مكان\\s+(?:الإصدار|التسليم)'], type: 'text' },
  { key: 'licenseNumber', group: 'client', label: 'N° permis', labels: ['n[°o]\\s*(?:de\\s+)?permis', 'permis', 'رخصة\\s+السياقة'], type: 'text' },
  { key: 'homeAddress', group: 'client', label: 'Adresse', labels: ['adresse', 'العنوان'], type: 'text' },
  { key: 'homeCity', group: 'client', label: 'Ville', labels: ['ville', 'المدينة'], type: 'text' },
  { key: 'homePostalCode', group: 'client', label: 'Code postal', labels: ['code\\s+postal', 'الرمز\\s+البريدي'], type: 'postal' },
  { key: 'phone', group: 'client', label: 'Téléphone', labels: ['\\bt[ée]l(?:[ée]phone)?\\b', '\\bgsm\\b', '\\bmobile\\b', 'الهاتف', 'هاتف'], type: 'phone' },
  { key: 'email', group: 'client', label: 'Email', labels: ['e-?mail', 'mail', 'البريد'], type: 'email' },
  { key: 'num_police', group: 'police', label: 'N° police', labels: ['n[°o]\\s*(?:de\\s+)?police', 'police\\s+n[°o]', 'عقد\\s+(?:عدد|رقم)'], type: 'policy' },
  { key: 'effet', group: 'police', label: 'Date effet', labels: ['date\\s+d[\'’]?\\s*effet', 'effet', 'تاريخ\\s+السريان'], type: 'date' },
  { key: 'expiration', group: 'police', label: 'Expiration', labels: ['expiration', 'date\\s+d[\'’]?\\s*expiration', 'تاريخ\\s+الانتهاء'], type: 'date' },
  { key: 'num_imat', group: 'police', label: 'Immatriculation', labels: ['immatriculation', 'immat\\.?', 'ترقيم', 'عدد\\s+الجولان'], type: 'text' },
  { key: 'prime_net', group: 'quittance', label: 'Prime nette', labels: ['prime\\s+nette', 'p\\.?\\s*nette'], type: 'money' },
  { key: 'taxe', group: 'quittance', label: 'Taxe', labels: ['taxes?'], type: 'money' },
  { key: 'timbre', group: 'quittance', label: 'Timbre', labels: ['timbre'], type: 'money' },
  { key: 'commission', group: 'quittance', label: 'Commission', labels: ['commission'], type: 'money' },
  { key: 'prime_total', group: 'quittance', label: 'Prime totale', labels: ['prime\\s+totale?', 'total\\s+ttc', 'net\\s+[àa]\\s+payer', 'المجموع'], type: 'money' },
  { key: 'periode', group: 'quittance', label: 'Période', labels: ['p[ée]riode'], type: 'text' },
];

// Returns an error message when a value looks wrong, otherwise ''.
export function checkValue(type, value) {
  if (!value) return '';
  if (type === 'cin' && !/^(\d{8}|[A-Za-z]{1,2}\d{6,8})$/.test(value.replace(/\s/g, ''))) return 'Numéro de pièce d’identité invalide';
  if (type === 'postal' && !/^\d{4}$/.test(value)) return 'Le code postal doit contenir 4 chiffres';
  if (type === 'policy' && !/^\d{8,14}$/.test(value)) return 'Numéro de contrat invalide (chiffres uniquement)';
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Email invalide';
  if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Date invalide (jj/mm/aaaa)';
  if (type === 'phone' && !/^\d{8}$/.test(value.replace(/\D/g, '').slice(-8))) return 'Téléphone invalide';
  return '';
}

function convert(type, raw) {
  const value = clean(raw);
  if (type === 'date') return toIsoDate(value);
  if (type === 'money') return toNumber(value);
  if (type === 'cin') return value.replace(/\s/g, '').toUpperCase().slice(0, 12);
  if (type === 'postal') return (value.match(/\b\d{4}\b/) || [''])[0];
  if (type === 'policy') return (value.replace(/\s/g, '').match(/\d{8,14}/) || [''])[0];
  if (type === 'phone') return value.replace(/[^\d+]/g, '').replace(/^\+?216/, '').slice(0, 8);
  if (type === 'email') return (value.match(/[^\s@]+@[^\s@]+\.[^\s@]+/) || [''])[0];
  return value;
}

export function extractFields(rawText) {
  const text = normalize(rawText);
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const found = [];
  const layout = readLayout(lines, text);
  FIELD_DEFS.forEach((def) => {
    // Generic "label: value" reading, kept only when the value looks sane (OCR noise is common).
    let generic = convert(def.type, after(lines, def.labels));
    if (generic && (checkValue(def.type, generic) || (LETTERS_ONLY.has(def.key) && !/^[\p{L}][\p{L}' -]{1,40}$/u.test(generic)))) generic = '';
    let value = layout[def.key] || generic;
    // Fallbacks on the whole text for well-formed values.
    if (!value && def.type === 'email') value = convert('email', text);
    if (!value && def.type === 'policy') value = (text.replace(/[ .-]/g, '').match(/(?:19|20)\d{2}\d{3}\d{5}/) || [''])[0];
    found.push({ ...def, value, warning: checkValue(def.type, value) });
  });
  return found;
}

const LETTERS_ONLY = new Set(['lastName', 'firstName', 'nationality', 'homeCity']);
const DATE_RE = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\b/;
const AMOUNT_RE = /\d{1,3}(?:[ .]\d{3})*[.,]\d{3}/g;

// A date written on the label's line, or on the line just above / below (table layouts).
function dateNear(lines, labelPattern, offsets = [0, -1, 1]) {
  const label = new RegExp(labelPattern, 'i');
  for (let index = 0; index < lines.length; index += 1) {
    if (!label.test(lines[index])) continue;
    for (const offset of offsets) {
      const match = (lines[index + offset] || '').match(DATE_RE);
      if (match) return toIsoDate(`${match[1]}/${match[2]}/${match[3]}`);
    }
  }
  return '';
}

// Values of documents laid out as tables / forms (contracts, quotations): label and value are
// often on different lines, so look at the neighbouring lines and at well-known shapes.
function readLayout(lines, text) {
  const result = {};
  const flat = text.replace(/\n/g, ' ');

  // Contract number: after "Contrat N°" (same or next line), otherwise the longest digit run starting like a policy.
  const contract = flat.match(/contrat\s*n[°o]?\s*[:._-]*\s*(\d{9,14})/i);
  if (contract) result.num_police = contract[1];

  // Tunisian plate: "209 TU 222", "123 تونس 4567".
  const plate = flat.match(/\b(\d{1,4})\s*(TU|RS|تونس)\s*(\d{1,4})\b/i);
  if (plate) result.num_imat = `${plate[1]} ${plate[2].toUpperCase()} ${plate[3]}`;

  result.effet = dateNear(lines, "(date\\s*d['’]?\\s*effet|sate\\s*d['’]?\\s*effet|effet)", [0, -1, -2, 1]);
  result.expiration = dateNear(lines, "(date\\s*d['’]?\\s*[ée]ch[ée]ance|expiration)", [0, 1]);
  result.birthDate = dateNear(lines, 'date\\s+de\\s+naissance|n[ée]\\(?e?\\)?\\s+le');
  result.identityDate = dateNear(lines, 'date\\s+(?:de\\s+)?(?:d[ée]livrance|c\\.?i\\.?n)');

  // Identity number next to "CIN / Identifiant unique": 8-digit CIN or a passport-like code.
  const idLine = lines.findIndex((line) => /c\.?i\.?n\s*\/?\s*identifiant|identifiant\s+unique/i.test(line));
  if (idLine >= 0) {
    const near = [lines[idLine], lines[idLine - 1], lines[idLine + 1]].join(' ');
    const id = near.match(/\b(\d{8})\b/) || near.match(/\b([A-Z]{1,2}\d{6,8})\b/);
    if (id) result.identityNumber = id[1];
  }

  // Insured name: "Nom / RS" followed by capitals (same line or next one).
  const nameLine = lines.findIndex((line) => /nom\s*\/\s*r\.?s|nom\s*\/\s*rs/i.test(line));
  if (nameLine >= 0) {
    const candidates = [lines[nameLine].replace(/.*nom\s*\/\s*r\.?s\.?/i, ''), lines[nameLine + 1], lines[nameLine - 1]];
    const name = candidates.map((candidate) => (candidate || '').match(/\b[A-ZÀ-Ý][A-ZÀ-Ý'-]{2,}(?:\s+[A-ZÀ-Ý][A-ZÀ-Ý'-]{2,}){0,3}\b/)).find(Boolean);
    if (name) {
      const [first, ...rest] = name[0].split(/\s+/);
      result.lastName = first;
      result.firstName = rest.join(' ');
    }
  }

  // Address line (street word) with an optional "CITY 8050" ending.
  const addressLine = lines.find((line) => /\b(rue|avenue|av\.|boulevard|bd|cit[ée]|r[ée]sidence|impasse|route)\b/i.test(line) && /[A-Za-z]{3}/.test(line));
  // Street word damaged by OCR ("RICE. LUMUMBA HAMMAMET 8050"): fall back on "... CITY 1234" at the end of a line.
  const cityLine = lines.find((line) => /\s[A-ZÀ-Ý]{4,}\s+\d{4}\s*$/.test(line.trim()) && !/[a-z]{3}/.test(line));
  if (!addressLine && cityLine) {
    const ending = clean(cityLine).match(/^(.*?)\s*([A-ZÀ-Ý]{4,})\s+(\d{4})$/);
    if (ending) [, result.homeAddress, result.homeCity, result.homePostalCode] = ending;
  }
  if (addressLine) {
    // Start at the street word: labels glued to the line ("Adresse - CIN ... RUE ...") are dropped.
    const street = addressLine.search(/\b(rue|avenue|av\.|boulevard|bd|cit[ée]|r[ée]sidence|impasse|route)\b/i);
    const cleaned = clean(addressLine.slice(Math.max(0, street)).replace(/[^\p{L}\p{N}\s'’./,-]/gu, ' '));
    const ending = cleaned.match(/^(.*?)\s+([A-ZÀ-Ý][A-ZÀ-Ý'-]{2,})\s+(\d{4})$/);
    if (ending) {
      [, result.homeAddress, result.homeCity, result.homePostalCode] = ending;
    } else {
      result.homeAddress = cleaned;
    }
  }

  // Amounts line: "140,000DT 30,000DT 48,449DT 3,400DT ... 459,394" in the order Net / Frais / Taxes / FGA / FSSR / FPAC / FA / Total.
  const amountLines = lines.map((line) => line.match(AMOUNT_RE)).filter((list) => list && list.length >= 5);
  if (amountLines.length) {
    const amounts = amountLines[0].map((value) => toNumber(value.replace(/\s/g, '').replace(/\.(?=\d{3}\b)/, ',')));
    result.prime_net = amounts[0];
    result.taxe = amounts[2];
    result.prime_total = String(Math.max(...amounts.map(Number)));
  }
  // Table "Contribution Nette / Frais / Taxes ... Total": amounts in DT follow the header, the total comes last.
  if (!result.prime_net) {
    const header = lines.findIndex((line) => /contribution\s+nette/i.test(line));
    const dt = header < 0 ? [] : lines.slice(header, header + 6).join(' ').match(/\d{1,3}(?:[ .]\d{3})*[.,]\d{3}\s*DT/g) || [];
    if (dt.length >= 4) {
      const values = dt.map((value) => Number(toNumber(value.replace(/\s*DT$/, '').replace(/\s/g, '').replace(/\.(?=\d{3}\b)/, ','))));
      if (values[values.length - 1] > values[values.length - 4]) {
        result.prime_net = String(values[values.length - 4]);
        result.taxe = String(values[values.length - 2]);
        result.prime_total = String(values[values.length - 1]);
      }
    }
  }
  if (result.expiration && result.expiration === result.effet) delete result.expiration; // a cut-off date read twice
  const total = flat.match(/(?:total|comptant|contribution\s+au\s+com\w*)\D{0,30}(\d{1,3}(?:[ .]\d{3})*[.,]\d{3})/i);
  if (total && !result.prime_total) result.prime_total = toNumber(total[1].replace(/\s/g, ''));

  Object.keys(result).forEach((key) => { if (!result[key]) delete result[key]; });
  return result;
}

// Runs OCR (French + Arabic) on an image file. Progress is reported as 0..1.
// Phone photos read much better once enlarged, turned to grey and stretched to full contrast.
async function enhanceImage(file, targetSide = 2600) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = targetSide / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const grey = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = grey;
    histogram[grey] += 1;
  }
  const pixels = data.length / 4;
  let low = 0;
  let high = 255;
  for (let sum = 0; low < 255 && sum + histogram[low] < pixels * 0.02; low += 1) sum += histogram[low];
  for (let sum = 0; high > 0 && sum + histogram[high] < pixels * 0.02; high -= 1) sum += histogram[high];
  const range = Math.max(1, high - low);
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.max(0, Math.min(255, ((data[i] - low) * 255) / range));
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Runs OCR on an image file (French first, then French + Arabic) and merges the readings.
// Progress is reported as 0..1.
export async function scanFiche(file, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const passes = [
    { langs: ['fra'], pageMode: '4', enhanced: true },
    { langs: ['fra'], pageMode: '6', enhanced: true },
    { langs: ['fra', 'ara'], pageMode: '3', enhanced: false },
  ];
  const enhanced = await enhanceImage(file);
  const texts = [];

  for (let index = 0; index < passes.length; index += 1) {
    const pass = passes[index];
    const worker = await createWorker(pass.langs, 1, {
      logger: (message) => {
        if (message.status === 'recognizing text' && onProgress) onProgress((index + message.progress) / passes.length);
      },
    });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: pass.pageMode, preserve_interword_spaces: '1' });
      const { data } = await worker.recognize(pass.enhanced ? enhanced : file);
      texts.push(data.text || '');
    } finally {
      await worker.terminate();
    }
  }

  return mergeReadings(texts, 'ocr');
}

// Each reading is parsed on its own and the first non-empty value wins, so one bad pass cannot hide a good one.
function mergeReadings(texts, source) {
  const readings = texts.map((text) => extractFields(text));
  const fields = readings[0].map((field, position) => {
    const candidates = readings.map((reading) => reading[position]).filter((candidate) => candidate.value);
    const valid = candidates.filter((candidate) => !candidate.warning);
    const pool = valid.length ? valid : candidates;
    if (!pool.length) return field;
    // The same value read by several passes is the most trustworthy; otherwise the first valid one.
    const votes = new Map();
    pool.forEach((candidate) => votes.set(candidate.value, (votes.get(candidate.value) || 0) + 1));
    const top = Math.max(...votes.values());
    return pool.find((candidate) => votes.get(candidate.value) === top);
  });
  return { text: texts.join('\n\n--- lecture suivante ---\n\n'), fields, source };
}

// Free server-side OCR (OCR.space): sturdier on phone photos than the in-browser engine, same parser.
export async function scanFicheWithServerOcr(file, accessToken) {
  if (!accessToken) throw new Error('session sans jeton serveur');
  let image = '';
  for (const [side, quality] of [[2200, 0.85], [1800, 0.75], [1500, 0.65], [1200, 0.6]]) {
    image = await toJpegBase64(file, side, quality);
    if (image.length < 1_300_000) break; // the free plan accepts files up to 1 MB
  }
  const response = await fetch(`${API_BASE_URL}/api/assistant/ocr-text`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ image_base64: image, media_type: 'image/jpeg' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `erreur ${response.status}`);
  return mergeReadings(body.texts || [], 'server-ocr');
}

// ---------------------------------------------------------------------------------------------
// Preferred reading: the server's vision model (handles skewed photos, tables, Arabic + French).
// ---------------------------------------------------------------------------------------------
const API_BASE_URL = (process.env.REACT_APP_API_URL || 'https://assurancebackend.onrender.com').replace(/\/$/, '');

// Server field -> form field key.
const AI_MAP = {
  last_name: 'lastName', first_name: 'firstName', birth_date: 'birthDate', birth_place: 'birthPlace',
  nationality: 'nationality', profession: 'profession', id_number: 'identityNumber', id_date: 'identityDate',
  id_place: 'identityPlace', license_number: 'licenseNumber', address: 'homeAddress', city: 'homeCity',
  postal_code: 'homePostalCode', phone: 'phone', email: 'email', policy_number: 'num_police',
  effect_date: 'effet', expiry_date: 'expiration', vehicle_registration: 'num_imat', net_premium: 'prime_net',
  taxes: 'taxe', stamp: 'timbre', commission: 'commission', total_premium: 'prime_total', period: 'periode',
};

// Shrinks a phone photo before upload (text stays readable, size stays well under the limit).
async function toJpegBase64(file, maxSide = 2000, quality = 0.88) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

export async function scanFicheWithAI(file, accessToken) {
  if (!accessToken) throw new Error('session sans jeton serveur');
  const image = await toJpegBase64(file);
  const response = await fetch(`${API_BASE_URL}/api/assistant/extract-fiche`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ image_base64: image, media_type: 'image/jpeg' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `erreur ${response.status}`);

  const values = body.fields || {};
  const fields = FIELD_DEFS.map((def) => {
    const aiKey = Object.keys(AI_MAP).find((key) => AI_MAP[key] === def.key);
    const raw = aiKey ? values[aiKey] : '';
    const value = raw ? convert(def.type, String(raw)) : '';
    return { ...def, value, warning: checkValue(def.type, value) };
  });
  // A company has no first name: its name goes in the Nom field.
  const lastName = fields.find((field) => field.key === 'lastName');
  if (lastName && !lastName.value && values.company_name) lastName.value = clean(values.company_name);
  return { text: JSON.stringify(values, null, 2), fields, source: 'ai' };
}
