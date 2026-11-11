import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PoliceFictiveWizard, { storeDraft } from './PoliceFictiveWizard';
import { getNextClientCode, saveClient } from '../../services/clientApi';
import { checkPlate, importVehicles } from '../../services/flotteApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 'token', user: null, isLoading: false }) }));
jest.mock('../../services/clientApi', () => ({ getClientByCode: jest.fn(), getNextClientCode: jest.fn(), saveClient: jest.fn(), searchClients: jest.fn(() => Promise.resolve([])) }));
jest.mock('../../services/flotteApi', () => ({ checkPlate: jest.fn(), importVehicles: jest.fn() }));
jest.mock('./FlotteDialog', () => ({
  __esModule: true,
  VEHICLE_FIELDS: [['num_imat', 'Immatriculation *', 'text'], ['marque', 'Marque / modèle', 'text'], ['puissance', 'Puissance (CV)', 'number'], ['effet', 'Date d’entrée dans la flotte', 'date'], ['prime_total', 'Prime totale annuelle', 'number']],
}));

const contract = { code_client: '5065', nom_client: 'Farwa Mootez', num_police: '202607445012', effet: '2026-11-08', expiration: '2027-11-08' };
// A message shown under a field is part of its label; Domicile comes before Bureau, which has the same labels.
const field = (label) => screen.getAllByLabelText(new RegExp(`^${label.replace(/[*]/g, '\\*')}`))[0];
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole('button', { name: /Suivant|Ajouter à la flotte/ }));

function fillIdentity() {
  type('Nom *', 'BEN ALI');
  type('Prenom *', 'SAMI');
  next();
}
function fillCoordinates() {
  // the home address is the one for correspondence: only its coordinates are required
  fireEvent.click(screen.getByRole('radio', { name: 'Domicile' }));
  type('Adresse *', '4 Rue Ohod');
  type('Ville *', 'Tunis');
  type('Code postal *', '1082');
  type('Téléphone 1', '71893000');
  next();
}
function fillQuittance() {
  type('Date émission *', '2026-11-08');
  type('Période *', '11/2026');
  type('Prime nette *', '100');
  type('Prime totale *', '120');
  type('Montant quittance *', '120');
  type('Solde quittance *', '120');
  next();
}

beforeEach(() => jest.clearAllMocks());

test('goes through the five steps and gives a draft with a new client', async () => {
  checkPlate.mockResolvedValue({ flotte: null, police: null });
  const onSubmit = jest.fn();
  render(<PoliceFictiveWizard contract={contract} onSubmit={onSubmit} onClose={() => {}} />);

  next(); // empty identity: stays, with the messages
  expect(screen.getAllByText('Ce champ est obligatoire.').length).toBe(2);
  fillIdentity();
  await screen.findByLabelText('Adresse *');
  next();
  expect(screen.getByText('Renseignez au moins un téléphone.')).toBeTruthy();
  fillCoordinates();
  await screen.findByLabelText('Immatriculation *');
  type('Immatriculation *', '123 tun 456');
  next();
  await screen.findByLabelText('Date émission *');
  expect(checkPlate).toHaveBeenCalledWith('token', '123 TUN 456', contract.num_police);
  fillQuittance();
  fireEvent.click(await screen.findByLabelText('Ce véhicule a un sinistre à déclarer'));
  next();

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const draft = onSubmit.mock.calls[0][0];
  expect(draft).toMatchObject({ num_imat: '123 TUN 456', code_client: '', nom_client: 'BEN ALI SAMI', prime_total: 120 });
  expect(draft.form.withClaim).toBe(true);
});

test('the souscripteur skips the client steps', async () => {
  checkPlate.mockResolvedValue({ flotte: null, police: null });
  render(<PoliceFictiveWizard contract={contract} onSubmit={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText(/^Souscripteur/));
  next();
  expect(await screen.findByLabelText('Immatriculation *')).toBeTruthy();
});

test('a plate already in another fleet is refused', async () => {
  checkPlate.mockResolvedValue({ flotte: '202600000001', police: null });
  render(<PoliceFictiveWizard contract={contract} onSubmit={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText(/^Souscripteur/));
  next();
  await screen.findByLabelText('Immatriculation *');
  type('Immatriculation *', 'AB 12');
  next();
  expect(await screen.findByText(/déjà dans la flotte de la police 202600000001/)).toBeTruthy();
});

const form = {
  mode: 'nouveau', code: '', loaded: '', forcer: false, withClaim: false, client: { lastName: 'BEN ALI', clientCode: '' },
  vehicle: { num_imat: '123 tun 456', marque: '', puissance: '7', effet: '2026-11-08' },
  quittance: { date_saisie: '2026-11-08', date_emission: '2026-11-08', periode: '11/2026', prime_net: '100', commission: '', prime_total: '120', montant_quittance: '120', solde_quittance: '120', num_attestation: '', carte_verte: false, cv_du: '', cv_au: '', observation: '' },
};

test('stores a new client under the next code, then the vehicle and its quittance', async () => {
  getNextClientCode.mockResolvedValue('5066');
  saveClient.mockResolvedValue({ clientCode: '5066' });
  importVehicles.mockResolvedValue({ resultats: [{ ok: true }] });
  const code = await storeDraft('token', 'P1', { form, code_client: '', num_imat: '123 TUN 456' });
  expect(code).toBe('5066');
  expect(saveClient).toHaveBeenCalledWith('token', expect.objectContaining({ clientCode: '5066', lastName: 'BEN ALI' }), false);
  const [line] = importVehicles.mock.calls[0][2];
  expect(line).toMatchObject({ code_client: '5066', num_imat: '123 TUN 456', puissance: 7, prime_net: 100, prime_total: 120, commission: null, carte_verte: null });
  expect(line.quittance).toMatchObject({ prime_total: 120, montant_quittance: 120, periode: '11/2026', commission: null });
});

test('a refused vehicle keeps its stored client, so a retry does not create it twice', async () => {
  getNextClientCode.mockResolvedValue('5066');
  saveClient.mockResolvedValue({ clientCode: '5066' });
  importVehicles.mockResolvedValueOnce({ resultats: [{ ok: false, message: 'Refusé' }] });
  const failure = await storeDraft('token', 'P1', { form, code_client: '', num_imat: '123 TUN 456' }).catch((error) => error);
  expect(failure.message).toBe('Refusé');
  expect(failure.draft.form.mode).toBe('existant');

  importVehicles.mockResolvedValueOnce({ resultats: [{ ok: true }] });
  await waitFor(() => storeDraft('token', 'P1', failure.draft));
  expect(saveClient).toHaveBeenCalledTimes(1);
});
