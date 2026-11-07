// Input checks of the police and quittance steps: { field: message }. The maximum lengths are those of dbo.TPolice and dbo.TQuittance.
const REQUIRED_MESSAGE = 'Ce champ est obligatoire.';
export const REQUIRED_POLICY_FIELDS = new Set([
  'heure_effet', 'date_saisie', 'date_emission', 'periode', 'prime_net', 'prime_total', 'montant_quittance', 'solde_quittance',
]);

const text = (value) => String(value ?? '').trim();
const isAmount = (value) => text(value) !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

export const validEcheance = (echeance) => {
  const match = /^(\d{2})\/(\d{2})$/.exec(echeance || '');
  if (!match) return false;
  const [day, month] = [Number(match[1]), Number(match[2])];
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(2024, month, 0).getDate(); // leap year: 29/02 allowed
};

function checkAmounts(values, names, errors) {
  names.forEach((name) => {
    if (text(values[name]) && !isAmount(values[name])) errors[name] = 'Saisissez un nombre positif.';
  });
}

function checkRequired(values, names, errors) {
  names.forEach((name) => { if (!text(values[name])) errors[name] = REQUIRED_MESSAGE; });
}

// echeance is expected as "jj/mm".
export function policeErrors(values, dcKeys = []) {
  const errors = {};
  checkRequired(values, ['code_compagnie', 'code_branche', 'num_police', 'date_creation', 'effet', 'heure_effet', 'echeance', 'expiration', 'etat'], errors);
  const number = text(values.num_police);
  if (number && !/^\d{12}$/.test(number)) errors.num_police = 'Le numéro doit contenir 12 chiffres : année + branche + 5 chiffres.';
  const branch = text(values.code_branche);
  if (branch && !/^\d{3}$/.test(branch)) errors.code_branche = 'Le code branche doit contenir 3 chiffres.';
  else if (branch && !errors.num_police && number.slice(4, 7) !== branch) errors.code_branche = 'Le code branche ne correspond pas au numéro de police.';
  if (text(values.echeance) && !validEcheance(values.echeance)) errors.echeance = 'Échéance invalide : un jour et un mois (jj/mm).';
  if (values.effet && values.expiration && values.expiration < values.effet) errors.expiration = 'L’expiration ne peut pas précéder la date d’effet.';
  if (text(values.etat) && !/^[A-Za-z]{2}$/.test(text(values.etat))) errors.etat = 'L’état contient 2 lettres (exemple : AN).';
  if (text(values.num_imat).length > 12) errors.num_imat = '12 caractères maximum.';
  if (text(values.risque).length > 50) errors.risque = '50 caractères maximum.';
  if (values.revalorisation && !values.date_revalorisation) errors.date_revalorisation = REQUIRED_MESSAGE;
  checkAmounts(values, ['g_vol', 'g_incendie', 'g_bdg', 'g_personnes', 'g_ind_cond'], errors);
  if (values.tous_risque || values.dommages_cumules) {
    checkAmounts(values, ['neuf', 'venale'], errors);
    checkAmounts(values, dcKeys.filter((key) => values[`dc_${key}`]).map((key) => `dc_${key}_montant`), errors);
    if (text(values.franchise) && !(isAmount(values.franchise) && Number(values.franchise) <= 100)) errors.franchise = 'Saisissez un pourcentage entre 0 et 100.';
  }
  return errors;
}

export function quittanceErrors(values) {
  const errors = {};
  checkRequired(values, ['date_saisie', 'date_emission', 'periode', 'prime_net', 'prime_total', 'montant_quittance', 'solde_quittance'], errors);
  const periode = text(values.periode);
  if (periode && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(periode)) errors.periode = 'Période invalide : mois/année (exemple : 11/2026).';
  checkAmounts(values, ['prime_net', 'commission', 'prime_total', 'taxe', 'timbre', 'cout_attestation', 'montant_quittance', 'solde_quittance'], errors);
  if (text(values.num_attestation).length > 50) errors.num_attestation = '50 caractères maximum.';
  if (text(values.observation).length > 50) errors.observation = '50 caractères maximum.';
  if (values.carte_verte) {
    if (!values.cv_du) errors.cv_du = REQUIRED_MESSAGE;
    if (!values.cv_au) errors.cv_au = REQUIRED_MESSAGE;
    if (values.cv_du && values.cv_au && values.cv_du > values.cv_au) errors.cv_au = 'La date de fin doit suivre la date de début.';
  }
  return errors;
}
