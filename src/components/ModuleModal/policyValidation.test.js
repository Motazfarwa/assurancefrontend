import { policeErrors, quittanceErrors } from './policyValidation';

const police = { code_compagnie: '9', code_branche: '011', num_police: '2026011589', date_creation: '2026-11-08', effet: '2026-11-09', heure_effet: '00:00', echeance: '09/11', expiration: '2027-11-09', etat: 'AN' };

test('a N° police is the year, the code branche of the company length, then any digits', () => {
  expect(policeErrors(police, [], 3)).toEqual({});
  expect(policeErrors({ ...police, num_police: '20260111234567' }, [], 3)).toEqual({}); // 14 characters
  expect(policeErrors({ ...police, code_branche: '4001', num_police: '202640017' }, [], 4)).toEqual({}); // BIAT
  expect(policeErrors({ ...police, code_branche: '00', num_police: '2026001' }, [], 2)).toEqual({}); // MAGHREBIA
  expect(policeErrors({ ...police, code_branche: '01' }, [], 3).code_branche).toMatch(/3 caractères/);
  expect(policeErrors({ ...police, num_police: '2026012589' }, [], 3).num_police).toMatch(/code branche \(011\)/);
  expect(policeErrors({ ...police, num_police: '2026011' }, [], 3).num_police).toMatch(/au moins un chiffre/);
  expect(policeErrors({ ...police, num_police: '2026011123456789' }, [], 3).num_police).toMatch(/15 caractères/);
});

const quittance = { date_saisie: '2026-11-08', date_emission: '2026-11-08', prime_net: '100', prime_total: '120', montant_quittance: '120', solde_quittance: '120' };

test('the période is asked only once its box is ticked', () => {
  expect(quittanceErrors({ ...quittance, with_periode: false })).toEqual({});
  expect(quittanceErrors({ ...quittance, with_periode: true }).periode).toBe('Ce champ est obligatoire.');
  expect(quittanceErrors({ ...quittance, with_periode: true, periode: '13/2026' }).periode).toMatch(/invalide/);
  expect(quittanceErrors(quittance).periode).toBe('Ce champ est obligatoire.'); // police fictive: always asked
});
