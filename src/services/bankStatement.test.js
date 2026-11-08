import { bankLines, confront } from './bankStatement';

jest.mock('./bordereauParser', () => ({ ...jest.requireActual('./bordereauParser'), readSpreadsheetRows: jest.fn() }));

test('reads the operations of a statement, its balance lines left out', () => {
  const rows = [
    ['ATTIJARI BANK', '', '', '', ''],
    ['Date opération', 'Libellé', 'Date valeur', 'Débit', 'Crédit'],
    ['01/10/2026', 'SOLDE AU 30/09/2026', '', '', '7291,551'],
    ['02/10/2026', 'VERSEMENT ESPECES', '02/10/2026', '', '1 009,274'],
    ['03/10/2026', 'CHQ 0001180 BIAT', '04/10/2026', '', 738.842],
    ['05/10/2026', 'PAIEMENT CHEQUE 451236', '05/10/2026', '2916,000', ''],
    ['', 'Total des mouvements', '', '2916', '1748.116'],
  ];
  const mapping = { date: 0, libelle: 1, valeur: 2, debit: 3, credit: 4 };
  expect(bankLines({ rows, headerRow: 1, mapping })).toEqual([
    { ligne: 4, date: '2026-10-02', valeur: '2026-10-02', sens: 'C', montant: 1009.274, libelle: 'VERSEMENT ESPECES', reference: '' },
    { ligne: 5, date: '2026-10-03', valeur: '2026-10-04', sens: 'C', montant: 738.842, libelle: 'CHQ 0001180 BIAT', reference: '' },
    { ligne: 6, date: '2026-10-05', valeur: '2026-10-05', sens: 'D', montant: 2916, libelle: 'PAIEMENT CHEQUE 451236', reference: '' },
  ]);
});

test('pairs by piece number, then by amount and closest date, and lists what is left on each side', () => {
  const ours = [
    { id: 'R1', date_mvt: '2026-10-01', sens: 'C', montant: 738.842, reference: 'BIAT0001180' },
    { id: 'R2', date_mvt: '2026-10-01', sens: 'C', montant: 500, reference: 'ESP1' },
    { id: 'R3', date_mvt: '2026-10-20', sens: 'C', montant: 500, reference: 'ESP2' },
    { id: 'D1', date_mvt: '2026-10-05', sens: 'D', montant: 2916, reference: '451236' },
    { id: 'D2', date_mvt: '2026-10-06', sens: 'D', montant: 100, reference: '' },
  ];
  const bank = [
    { ligne: 2, date: '2026-10-21', sens: 'C', montant: 500, libelle: 'VERSEMENT', reference: '' },
    { ligne: 3, date: '2026-10-09', sens: 'C', montant: 738.842, libelle: 'REMISE CHQ 1180', reference: '' }, // 8 days later, but same piece
    { ligne: 4, date: '2026-10-05', sens: 'C', montant: 2916, libelle: 'VIREMENT RECU', reference: '' }, // same amount, other direction
    { ligne: 5, date: '2026-10-05', sens: 'D', montant: 2916, libelle: 'PAIEMENT CHQ 451236', reference: '' },
    { ligne: 6, date: '2026-10-30', sens: 'D', montant: 45.5, libelle: 'FRAIS TENUE DE COMPTE', reference: '' },
  ];
  const result = confront(ours, bank);
  expect(result.matched.map((pair) => [pair.ours.id, pair.bank.ligne, pair.how])).toEqual([
    ['D1', 5, 'référence'], ['R1', 3, 'référence'], ['R3', 2, 'montant et date'],
  ]);
  expect(result.oursOnly.map((line) => line.id)).toEqual(['R2', 'D2']); // R2: 20 days from the only 500 line
  expect(result.bankOnly.map((line) => line.ligne)).toEqual([4, 6]);
  expect(result.totals).toEqual({ ours: { credit: 1738.842, debit: 3016 }, bank: { credit: 4154.842, debit: 2961.5 } });
});
