// What an imported payment document pays, shared by "Gestion des chèques" and "Recette technique".
const num = (value) => (value === '' || value == null ? 0 : Number(value) || 0);
const money = (value) => num(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// The amount spread over the client's unpaid quittances, each up to `available(row)`: the quittances named
// on the document when there are some, otherwise all of them, oldest first. Returns [{ row, amount }].
export function spreadImported(list, { numbers, montant }, available = (row) => Number(row.solde)) {
  let left = num(montant);
  const named = (numbers || []).map((number) => list.find((item) => String(item.num_quittance) === String(number))).filter(Boolean);
  const parts = [];
  (named.length ? named : list).forEach((row) => {
    if (left <= 0.0005) return;
    const amount = Math.max(0, Math.min(left, available(row)));
    if (amount > 0) parts.push({ row, amount });
    left -= amount;
  });
  return parts;
}

// Summary lines ({ key, label, value }) shown under the form once the client's quittances are handled.
export function importNotes(client, list, parts, documentName) {
  const notes = [];
  if (!list.length) notes.push({ key: 'alloc', label: 'Quittances impayées', value: 'aucune pour ce client' });
  else {
    const total = parts.reduce((sum, part) => sum + part.amount, 0);
    notes.push({ key: 'alloc', label: `Quittances impayées (${list.length})`, value: parts.length ? `${parts.map((part) => part.row.num_quittance).join(', ')} → ${money(total)}` : 'aucune réglée' });
  }
  const words = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const known = words(client?.nom_client);
  if (documentName && known.length && !words(documentName).some((word) => known.includes(word))) {
    notes.push({ key: 'nameCheck', label: '⚠ Nom différent', value: `document « ${documentName} » ≠ client « ${client.nom_client} »` });
  }
  return notes;
}

export const NO_CLIENT_NOTE = { key: 'alloc', label: 'Client', value: 'non trouvé sur le document : saisissez le code client pour régler ses quittances' };
