import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SinistreModal from './SinistreModal';
import { findClaimPolicy, getSinistre, getSinistreLookups, listClientPolicies, listSinistres, nextSinistreNumber, updateSinistre } from '../../services/sinistreApi';
import { getClientByCode } from '../../services/clientApi';
import { listAccounts } from '../../services/chequeApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Mami G.', isAdmin: false } }) }));
jest.mock('../../services/clientApi', () => ({ getClientByCode: jest.fn(() => Promise.resolve({ nom_client: 'JEMMALI WALID' })) }));
jest.mock('../../services/chequeApi', () => ({ listAccounts: jest.fn(() => Promise.resolve([])) }));
jest.mock('../../services/toast', () => ({ showToast: jest.fn() }));
jest.mock('./SinistreSuivi', () => () => null);
jest.mock('../DocumentImportDialog/DocumentImportDialog', () => () => null);
jest.mock('../../services/sinistreApi', () => ({
  createSinistre: jest.fn(), extractSinistre: jest.fn(), findClaimPolicy: jest.fn(() => Promise.resolve({})),
  getSinistre: jest.fn(), listClientPolicies: jest.fn(() => Promise.resolve([])), listSinistres: jest.fn(),
  nextSinistreNumber: jest.fn(() => Promise.resolve({ numero: '202611001' })), updateSinistre: jest.fn(),
  getSinistreLookups: jest.fn(() => Promise.resolve({ responsabilites: [], types_sinistre: [], branches: [], compagnies: [], compagnies_adverses: [], experts: [], garanties: [], types_degats: [], etapes: [], urgences: [] })),
}));

const record = { Num_Sinistre_Agence: '202411012', Date_Sinistre: '2024-11-20T10:00:00', Date_Saisie: '2026-10-09', Lieu_Sinistre: 'Hammamet', Num_Int: '011202324153', Code_Client: '2973', nom_client: 'JEMMALI WALID', Code_Compagnie_Assure: '9', Code_Type_Branche: '1', Observation: 'constat reçu' };

beforeEach(() => {
  window.confirm = () => true;
  getSinistreLookups.mockResolvedValue({ responsabilites: [], types_sinistre: [], branches: [], compagnies: [], compagnies_adverses: [], experts: [], garanties: [], types_degats: [], etapes: [], urgences: [] });
  findClaimPolicy.mockResolvedValue({});
  listClientPolicies.mockResolvedValue([]);
  nextSinistreNumber.mockResolvedValue({ numero: '202611001' });
  getClientByCode.mockResolvedValue({ nom_client: 'JEMMALI WALID' });
  listAccounts.mockResolvedValue([]);
  listSinistres.mockResolvedValue({ items: [record], total: 1 });
  getSinistre.mockResolvedValue(record);
  updateSinistre.mockResolvedValue({ numero: '202411012' });
});

async function openClaim() {
  render(<SinistreModal onClose={() => {}} clientCode="2973" />);
  fireEvent.click(await screen.findByText('202411012'));
  return screen.findByDisplayValue('Hammamet');
}

test('a stored claim opens locked; "Modifier" opens it, "Enregistrer" stores it and locks it again', async () => {
  const lieu = await openClaim();
  expect(lieu).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Observation')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
  expect(lieu).not.toHaveAttribute('readonly');
  fireEvent.change(screen.getByLabelText('Observation'), { target: { value: 'rapport d’expertise reçu' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(updateSinistre).toHaveBeenCalledWith('t', '202411012', expect.objectContaining({ Observation: 'rapport d’expertise reçu' })));
  expect(await screen.findByRole('button', { name: 'Modifier' })).toBeInTheDocument();
  expect(screen.getByLabelText('Observation')).toBeDisabled();
});

test('"Annuler" puts the claim back as stored', async () => {
  await openClaim();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
  fireEvent.change(screen.getByLabelText('Observation'), { target: { value: 'autre' } });
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  await waitFor(() => expect(screen.getByLabelText('Observation')).toHaveValue('constat reçu'));
  expect(screen.getByLabelText('Observation')).toBeDisabled();
  expect(updateSinistre).not.toHaveBeenCalled();
});
