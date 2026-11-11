// Input checks of the Gestion des clients form. Each step gives { field: message }; contacts use "homePhones.0".
// The maximum lengths are those of the dbo.TClient columns.
const MAX_LENGTHS = {
  lastName: 50, firstName: 50, country: 50, nationalityOther: 50, birthPlace: 50, profession: 50, identityNumber: 50, identityPlace: 50,
  licenseNumber: 50, licensePlace: 50, relatedName: 50, homeAddress: 50, homeCity: 15, officeAddress: 50, officeCity: 15, notes: 200,
};
const REQUIRED_MESSAGE = 'Ce champ est obligatoire.';
// The coordinates checked are those of the address chosen for correspondence ("Bureau": the office; "Domicile", or none
// chosen on an old record: home, as the notifications read it); the other address is optional and not checked.
export const correspondenceSide = (client) => (client?.correspondence === 'Bureau' ? 'office' : 'home');
export const requiredClientFields = (client) => {
  const side = correspondenceSide(client);
  return new Set(['lastName', 'firstName', `${side}Address`, `${side}City`, `${side}PostalCode`]);
};

const text = (value) => String(value ?? '').trim();
const isInteger = (value) => /^\d+$/.test(text(value));
const isFuture = (value) => Boolean(value) && String(value).slice(0, 10) > new Date().toISOString().slice(0, 10);
const validPhone = (value) => /^[0-9 +()./-]+$/.test(value) && value.replace(/\D/g, '').length >= 8;
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function checkLengths(client, names, errors) {
  names.forEach((name) => {
    const max = MAX_LENGTHS[name];
    if (text(client[name]).length > max && !errors[name]) errors[name] = `${max} caractères maximum.`;
  });
}

function checkContacts(client, kind, errors) {
  (client[`${kind}Phones`] || []).forEach((contact, index) => {
    const value = text(contact?.value);
    if (value && !validPhone(value)) errors[`${kind}Phones.${index}`] = 'Numéro invalide : chiffres uniquement, 8 au minimum.';
  });
  (client[`${kind}Emails`] || []).forEach((contact, index) => {
    const value = text(contact?.value);
    if (value && !validEmail(value)) errors[`${kind}Emails.${index}`] = 'Adresse email invalide (exemple : nom@domaine.tn).';
    else if (value.length > 100) errors[`${kind}Emails.${index}`] = '100 caractères maximum.';
  });
}

export function identityErrors(client) {
  const errors = {};
  const isCompany = client.clientType === 'Societe';
  if (!text(client.lastName)) errors.lastName = REQUIRED_MESSAGE;
  if (!isCompany && !text(client.firstName)) errors.firstName = REQUIRED_MESSAGE;
  if (`${text(client.lastName)} ${text(client.firstName)}`.trim().length > 50 && text(client.lastName) && text(client.firstName)) {
    errors.firstName = 'Nom et prénom : 50 caractères maximum au total.';
  }
  if (client.nationality === 'Autre' && !text(client.nationalityOther)) errors.nationalityOther = REQUIRED_MESSAGE;
  [['birthDate', 'naissance'], ['identityDate', 'C.I.N.'], ['licenseDate', 'permis']].forEach(([name, label]) => {
    if (isFuture(client[name])) errors[name] = `La date de ${label} ne peut pas être dans le futur.`;
  });
  if (text(client.relatedCode) && !isInteger(client.relatedCode)) errors.relatedCode = 'Le code de contact doit être numérique.';
  checkLengths(client, ['lastName', 'firstName', 'country', 'nationalityOther', 'birthPlace', 'profession', 'identityNumber', 'identityPlace', 'licenseNumber', 'licensePlace', 'relatedName'], errors);
  return errors;
}

export function coordinatesErrors(client) {
  const errors = {};
  const side = correspondenceSide(client);
  if (!text(client[`${side}Address`])) errors[`${side}Address`] = REQUIRED_MESSAGE;
  if (!text(client[`${side}City`])) errors[`${side}City`] = REQUIRED_MESSAGE;
  if (!text(client[`${side}PostalCode`])) errors[`${side}PostalCode`] = REQUIRED_MESSAGE;
  else if (!isInteger(client[`${side}PostalCode`])) errors[`${side}PostalCode`] = 'Le code postal doit être numérique.';
  if (!(client[`${side}Phones`] || []).some((contact) => text(contact?.value))) errors[`${side}Phones.0`] = 'Renseignez au moins un téléphone.';
  checkContacts(client, side, errors);
  // Both addresses still fit the columns of TClient (the record could not be saved otherwise).
  checkLengths(client, ['homeAddress', 'homeCity', 'officeAddress', 'officeCity', 'notes'], errors);
  return errors;
}

export const clientStepErrors = (client, step) => (step === 1 ? identityErrors(client) : step === 2 ? coordinatesErrors(client) : {});
