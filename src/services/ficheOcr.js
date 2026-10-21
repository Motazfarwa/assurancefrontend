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
  { key: 'lastName', group: 'client', label: 'Nom', labels: ['nom\\b(?!\\s+du\\s+contact)', 'اللقب'], type: 'text' },
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
  { key: 'phone', group: 'client', label: 'Téléphone', labels: ['t[ée]l[ée]?(?:phone)?', 'gsm', 'mobile', 'الهاتف', 'هاتف'], type: 'phone' },
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
  if (type === 'cin' && !/^[A-Za-z0-9]{6,12}$/.test(value.replace(/\s/g, ''))) return 'Numéro de pièce d’identité invalide';
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
  FIELD_DEFS.forEach((def) => {
    let value = convert(def.type, after(lines, def.labels));
    // Fallbacks on the whole text for well-formed values.
    if (!value && def.type === 'email') value = convert('email', text);
    if (!value && def.type === 'policy') value = (text.replace(/[ .-]/g, '').match(/(?:19|20)\d{2}\d{3}\d{5}/) || [''])[0];
    if (!value && def.type === 'cin') value = (text.match(/\b\d{8}\b/) || [''])[0];
    found.push({ ...def, value, warning: checkValue(def.type, value) });
  });
  return found;
}

// Runs OCR (French + Arabic) on an image file. Progress is reported as 0..1.
export async function scanFiche(file, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['fra', 'ara'], 1, {
    logger: (message) => {
      if (message.status === 'recognizing text' && onProgress) onProgress(message.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return { text: data.text || '', fields: extractFields(data.text || ''), source: 'ocr' };
  } finally {
    await worker.terminate();
  }
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
async function toJpegBase64(file, maxSide = 2000) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
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
