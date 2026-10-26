// What an imported payment document pays, shared by "Gestion des chèques" and "Recette technique".
const num = (value) => (value === '' || value == null ? 0 : Number(value) || 0);

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
