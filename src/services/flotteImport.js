// Reads the list of a fleet's vehicles sent by the company or the client: an Excel / CSV table (columns found by their
// titles), or a PDF / photo read by the OCR (one vehicle per line holding a registration). Returns vehicle rows in the
// shape of the API (num_imat, marque, puissance, …); nothing is invented: a value not found stays empty.
import { readSpreadsheetRows, toIsoDate, toNumber } from './bordereauParser';
import { readText } from './documentReading';

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// [field, kind, titles (normalized)]: exact title first, then a title containing one of the longer ones.
const COLUMNS = [
  ['num_imat', 'text', ['immatriculation', 'immat', 'imat', 'matricule', 'nimmatriculation', 'numimmatriculation', 'plaque', 'numimat']],
  ['marque', 'text', ['marque', 'modele', 'marquemodele', 'marquetype', 'vehicule', 'typevehicule', 'type']],
  ['serie', 'text', ['chassis', 'nchassis', 'numchassis', 'serie', 'nserie', 'vin', 'numerodeserie']],
  ['puissance', 'int', ['puissance', 'cv', 'pf', 'puissancefiscale', 'chevaux']],
  ['energie', 'text', ['energie', 'carburant']],
  ['nbpl', 'int', ['places', 'nbpl', 'nbplaces', 'nombredeplaces']],
  ['genre', 'text', ['genre', 'usage', 'categorie']],
  ['circulation', 'date', ['miseencirculation', 'datecirculation', 'dmc', 'datepremieremiseencirculation', 'circulation']],
  ['effet', 'date', ['dateeffet', 'dateentree', 'entree', 'effet']],
  ['garantie', 'text', ['garanties', 'garantie']],
  ['venale', 'number', ['valeurvenale', 'venale']],
  ['neuf', 'number', ['valeuraneuf', 'valeurneuve', 'valeurneuf', 'neuf']],
  ['prime_net', 'number', ['primenette', 'primenet', 'pnette']],
  ['commission', 'number', ['commission', 'com']],
  ['prime_total', 'number', ['primetotale', 'primettc', 'primetotal', 'ttc', 'prime']],
  ['code_client', 'text', ['codeclient', 'client', 'cclient']],
];

function mapHeaders(row) {
  const headers = row.map(normalize);
  const mapping = {};
  const used = new Set();
  const pick = (exact) => COLUMNS.forEach(([field, , titles]) => {
    if (mapping[field] !== undefined) return;
    const index = headers.findIndex((header, position) => header && !used.has(position)
      && titles.some((title) => (exact ? header === title : title.length >= 5 && header.includes(title))));
    if (index >= 0) { mapping[field] = index; used.add(index); }
  });
  pick(true);
  pick(false);
  return mapping;
}

const cleanPlate = (value) => {
  const text = String(value ?? '').toUpperCase().replace(/تونس/g, 'TU').trim();
  const match = text.match(/(\d{1,3})\s*(TU|TN|RS)\s*(\d{1,4})/);
  return match ? `${match[1]} ${match[2] === 'TN' ? 'TU' : match[2]} ${match[3]}` : text.replace(/\s+/g, ' ');
};

function fromTable(rows) {
  let headerRow = -1;
  let best = 0;
  rows.slice(0, 25).forEach((row, index) => {
    const mapping = mapHeaders(row);
    const score = Object.keys(mapping).length + (mapping.num_imat !== undefined ? 2 : 0);
    if (score > best) { best = score; headerRow = index; }
  });
  const mapping = headerRow >= 0 ? mapHeaders(rows[headerRow]) : {};
  if (mapping.num_imat === undefined) throw new Error('Aucune colonne « Immatriculation » trouvée dans le fichier.');
  return rows.slice(headerRow + 1).map((row) => {
    const vehicle = {};
    COLUMNS.forEach(([field, kind]) => {
      if (mapping[field] === undefined) return;
      const raw = row[mapping[field]];
      if (raw == null || String(raw).trim() === '') return;
      if (kind === 'number') vehicle[field] = toNumber(raw);
      else if (kind === 'int') vehicle[field] = Number.isFinite(toNumber(raw)) ? Math.round(toNumber(raw)) : null;
      else if (kind === 'date') vehicle[field] = toIsoDate(raw) || null;
      else vehicle[field] = String(raw).trim();
    });
    if (vehicle.num_imat) vehicle.num_imat = cleanPlate(vehicle.num_imat);
    return vehicle;
  }).filter((vehicle) => vehicle.num_imat && /\d/.test(vehicle.num_imat));
}

// OCR text: each line holding a registration is a vehicle; the words before / after it are its make, an amount with
// 3 decimals at the end of the line its premium.
function fromText(text) {
  const seen = new Set();
  return text.split(/\r?\n/).map((line) => {
    const upper = line.toUpperCase().replace(/تونس/g, 'TU');
    const match = upper.match(/(\d{1,3})\s*(TU|TN|RS)\s*(\d{1,4})/);
    if (!match) return null;
    const vehicle = { num_imat: cleanPlate(match[0]) };
    const rest = upper.replace(match[0], ' ');
    const make = rest.replace(/\b(ESSENCE|DIESEL|GASOIL|HYBRIDE|GPL)\b.*/, ' ').match(/[A-Z][A-Z0-9-]+(?:\s+[A-Z][A-Z0-9-]+){0,2}/);
    if (make && !/^(TU|RS|DT|TND|CV)$/.test(make[0])) vehicle.marque = make[0].replace(/\s+/g, ' ').trim().slice(0, 50);
    const power = rest.match(/\b(\d{1,2})\s*CV\b/);
    if (power) vehicle.puissance = Number(power[1]);
    const energy = rest.match(/\b(ESSENCE|DIESEL|GASOIL|HYBRIDE|GPL)\b/);
    if (energy) vehicle.energie = { ESSENCE: 'Essence', DIESEL: 'Diesel', GASOIL: 'Diesel', HYBRIDE: 'Hybride', GPL: 'GPL' }[energy[1]];
    const amounts = [...rest.matchAll(/\d{1,3}(?:[ .]\d{3})*,\d{3}|\d+\.\d{3}/g)].map((found) => toNumber(found[0]));
    if (amounts.length) vehicle.prime_total = amounts[amounts.length - 1];
    return vehicle;
  }).filter((vehicle) => vehicle && !seen.has(vehicle.num_imat) && seen.add(vehicle.num_imat));
}

// { vehicules, source }: the vehicles read in the file.
export async function readFleetFile(token, file, onProgress) {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xls|csv|txt)$/.test(name)) return { vehicules: fromTable(await readSpreadsheetRows(file)), source: 'tableau' };
  const { text } = await readText(token, file, onProgress);
  const vehicules = fromText(text);
  if (!vehicules.length) throw new Error('Aucune immatriculation lue dans le document : vérifiez sa qualité ou utilisez un fichier Excel.');
  return { vehicules, source: 'ocr' };
}
