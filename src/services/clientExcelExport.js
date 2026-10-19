const POLICY_LABELS = {
  num_int: 'N° dossier', num_police: 'N° police', code_branche: 'Branche', effet: 'Date effet',
  expiration: 'Expiration', etat: 'État', prime_total: 'Prime totale',
};
const RECEIPT_LABELS = {
  num_quittance: 'N° quittance', num_int: 'N° dossier', date_emission: 'Émission', echeance: 'Échéance',
  montant_quittance: 'Montant', solde_quittance: 'Solde', observation: 'Observation',
};

function clientRows(client) {
  return [
    ['Code client', client.clientCode], ['Date de création', client.createdAt], ['Nom', client.lastName],
    ['Prénom', client.firstName], ['Nationalité', client.nationality], ['Pays', client.country],
    ['Date de naissance', client.birthDate], ['Lieu de naissance', client.birthPlace],
    ['Profession', client.profession], ['Situation familiale', client.civilStatus],
    ['N° de pièce d’identité', client.identityNumber], ['Lieu de délivrance', client.identityPlace],
    ['N° de permis', client.licenseNumber], ['Adresse du domicile', client.homeAddress],
    ['Ville / code postal', [client.homeCity, client.homePostalCode].filter(Boolean).join(' · ')],
    ['Téléphone domicile', client.homePhone], ['Adresse du bureau', client.officeAddress],
    ['Téléphone bureau', client.officePhone], ['Email', client.email],
    ['Adresse de correspondance', client.correspondence], ['Type client', client.clientType],
    ['Exonéré', client.taxExempt ? 'Oui' : 'Non'], ['Observation', client.notes],
  ];
}

function cellValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function addRecordsSheet(workbook, name, records, labels) {
  const sheet = workbook.addWorksheet(name);
  const keys = records.length ? Object.keys(records[0]) : Object.keys(labels);
  sheet.columns = keys.map((key) => ({ header: labels[key] || key, key, width: 20, style: key.match(/^(date|effet|expiration|echeance)/) ? { numFmt: 'dd/mm/yyyy' } : {} }));
  records.forEach((record) => sheet.addRow(keys.reduce((row, key) => ({ ...row, [key]: cellValue(record[key]) }), {})));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function downloadClientExcel({ client, policies, receipts }) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();

  const info = workbook.addWorksheet('Client');
  info.columns = [{ header: 'Champ', key: 'label', width: 30 }, { header: 'Valeur', key: 'value', width: 50 }];
  clientRows(client).forEach(([label, value]) => info.addRow({ label, value: value || '' }));
  info.getRow(1).font = { bold: true };

  addRecordsSheet(workbook, 'Polices', policies, POLICY_LABELS);
  addRecordsSheet(workbook, 'Quittances', receipts, RECEIPT_LABELS);

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `client-${client.clientCode || 'nouveau'}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
