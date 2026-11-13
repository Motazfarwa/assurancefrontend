import { coordinatesErrors, requiredClientFields } from './clientValidation';

const base = {
  homeAddress: '', homeCity: '', homePostalCode: '', homePhones: [], homeEmails: [],
  officeAddress: '', officeCity: '', officePostalCode: '', officePhones: [], officeEmails: [],
};

test('Domicile chosen: only the home coordinates are required and checked, the office ones are free', () => {
  const client = { ...base, correspondence: 'Domicile', homeAddress: '4 rue Ohod', homeCity: 'Tunis', homePostalCode: '1082',
    homePhones: [{ value: '71 893 000' }], homeEmails: [{ value: 'client@domaine.tn' }],
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

test('the first phone and the first email are required: empty or "neant" is not accepted', () => {
  const client = { ...base, correspondence: 'Bureau', officeAddress: 'Av. Habib Bourguiba', officeCity: 'Tunis', officePostalCode: '1000',
    officePhones: [{ value: 'neant' }], officeEmails: [] };
  expect(coordinatesErrors(client)).toEqual({ 'officePhones.0': 'Le téléphone 1 est obligatoire.', 'officeEmails.0': 'L’email 1 est obligatoire.' });
});

test('the other phones and emails are optional: "neant" left by the old software does not block, a wrong entry does', () => {
  const client = { ...base, correspondence: 'Domicile', homeAddress: 'MENZAH 8', homeCity: 'MENZAH 8', homePostalCode: '2037',
    homePhones: [{ value: '53 094 605' }, { value: 'neant' }, { value: 'neant' }, { value: '.' }],
    homeEmails: [{ value: 'client@domaine.tn' }, { value: 'neant' }, { value: 'neant' }] };
  expect(coordinatesErrors(client)).toEqual({});
  const wrong = { ...client, homePhones: [{ value: '53 094 605' }, { value: '123' }], homeEmails: [{ value: 'client@domaine.tn' }, { value: 'abc' }] };
  expect(coordinatesErrors(wrong)).toEqual({
    'homePhones.1': 'Numéro invalide : chiffres uniquement, 8 au minimum.', 'homeEmails.1': 'Adresse email invalide (exemple : nom@domaine.tn).',
  });
});
