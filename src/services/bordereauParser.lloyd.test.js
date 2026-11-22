import { buildLines, readBordereauFile, repairText } from './bordereauParser';

const csv = (name, text) => ({ name, text: async () => text });

test('accents garbled by the export are given back', () => {
  expect(repairText("Date d'Ã©chÃ©ance")).toBe("Date d'échéance");
  expect(repairText('NÂ° d\'acte comptable')).toBe('N° d\'acte comptable');
  expect(repairText('Ã‰tat acte comptable ')).toBe('État acte comptable ');
  expect(repairText('BEN AMMAR')).toBe('BEN AMMAR');
});

test('LLOYD terme: the prime brut, the date d\'effet and the N° d\'acte comptable are read, not the montant encaissé', async () => {
  const header = 'Num. police ;Date d\'effet acte comptable ;Date d\'Ã©chÃ©ance acte comptable ;Prime brut;Prime net ;Montant commissions;Souscripteur;NÂ° d\'acte comptable;Montant encaissÃ©';
  const info = await readBordereauFile(csv('T12-2026 LLOYD.csv', `${header}\n94402000088;30/12/2026;30/12/2027;2377,839;2087,374;262,765;STE J S AUTO PAINT;243222450;\n`));
  expect(buildLines(info, { periodMonth: 12 })).toEqual([{
    num_police: '94402000088', code_client: null, nom_client: 'STE J S AUTO PAINT', echeance: '2026-12-30', num_quittance: '243222450',
    prime_net: 2087.374, commission: 262.765, prime_total: 2377.839,
  }]);
});

test('LLOYD IRDS terme: another layout of the same company', async () => {
  const header = ';Date effet acte comptable;Prime brut;Prime net;Taxe;Commissions Incessament active        ;Description souscripteur ;Num. police ;';
  const info = await readBordereauFile(csv('T 12-2026 LLOYD IRDS.csv', `${header}\n;16/12/2026;283;253;30;63;SOCIETE CHARTEL;944450056;\n`));
  expect(buildLines(info, { periodMonth: 12 })[0]).toMatchObject({ num_police: '944450056', echeance: '2026-12-16', prime_total: 283, prime_net: 253, commission: 63, nom_client: 'SOCIETE CHARTEL' });
});
