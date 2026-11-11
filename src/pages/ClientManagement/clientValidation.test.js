import { coordinatesErrors, requiredClientFields } from './clientValidation';

const base = {
  homeAddress: '', homeCity: '', homePostalCode: '', homePhones: [], homeEmails: [],
  officeAddress: '', officeCity: '', officePostalCode: '', officePhones: [], officeEmails: [],
};

test('Domicile chosen: only the home coordinates are required and checked, the office ones are free', () => {
  const client = { ...base, correspondence: 'Domicile', homeAddress: '4 rue Ohod', homeCity: 'Tunis', homePostalCode: '1082', homePhones: [{ value: '71 893 000' }],
    officePhones: [{ value: '' }, { value: '.' }], officePostalCode: 'abc', officeEmails: [{ value: 'pas un email' }] };
  expect(coordinatesErrors(client)).toEqual({});
  expect([...requiredClientFields(client)]).toEqual(expect.arrayContaining(['homeAddress', 'homeCity', 'homePostalCode']));
  expect(requiredClientFields(client).has('officeAddress')).toBe(false);
});

test('Bureau chosen: the office coordinates are required and checked, home is free', () => {
  const client = { ...base, correspondence: 'Bureau', homePhones: [{ value: '.' }], officePhones: [{ value: '12' }], officeEmails: [{ value: 'x@' }] };
  expect(coordinatesErrors(client)).toEqual({
    officeAddress: 'Ce champ est obligatoire.', officeCity: 'Ce champ est obligatoire.', officePostalCode: 'Ce champ est obligatoire.',
    'officePhones.0': 'Numéro invalide : chiffres uniquement, 8 au minimum.', 'officeEmails.0': 'Adresse email invalide (exemple : nom@domaine.tn).',
  });
  expect(requiredClientFields(client).has('homeAddress')).toBe(false);
  expect(requiredClientFields(client).has('officeCity')).toBe(true);
});

test('Bureau chosen without any office phone: one is asked for', () => {
  const client = { ...base, correspondence: 'Bureau', officeAddress: 'Av. Habib Bourguiba', officeCity: 'Tunis', officePostalCode: '1000' };
  expect(coordinatesErrors(client)).toEqual({ 'officePhones.0': 'Renseignez au moins un téléphone.' });
});
