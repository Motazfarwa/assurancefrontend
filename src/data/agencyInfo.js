// ============================================================================================
//  AGENCY INFORMATION: printed at the top of every report (Etat du terme, journaux, états…).
//  To change the name, the address or the phones, edit the values below, then redeploy.
//  Leave a value empty ('') to leave it out of the reports.
// ============================================================================================
export const AGENCY_INFO = {
  nom: 'Cabinet d’Assurance Jemmali',
  adresse: '4, Rue Ohod - Mutuelleville',
  ville: '1082 - Tunis',
  telephone: 'Tél : 71 893 000',
  telephone2: 'Cell : 93 893 000', // second phone, a mobile or a fax ("Fax : 71 891 891")
};

// --------------------------------------------------------------------------------------------
// Nothing to edit below: the layouts built from the values above.
// --------------------------------------------------------------------------------------------
const { nom, adresse, ville, telephone, telephone2 } = AGENCY_INFO;
const join = (...parts) => parts.filter(Boolean).join(' · ');

// One value per line (Etat impayé).
export const AGENCY = [nom, adresse, ville, telephone, telephone2].filter(Boolean);

// 3 centered lines, each wider than the one above (a pyramid): the name; the phones; the address and city.
export const AGENCY_PYRAMID = [nom, join(telephone, telephone2), join(adresse, ville)].filter(Boolean);
