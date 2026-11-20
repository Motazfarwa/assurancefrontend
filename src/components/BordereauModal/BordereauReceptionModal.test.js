import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BordereauReceptionModal from './BordereauReceptionModal';
import { getBordereauClients, listBordereaux, listQuittances, updateQuittanceLine } from '../../services/bordereauApi';
import { listCompanies } from '../../services/companyApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('../../services/companyApi', () => ({
  listCompanies: jest.fn(), isBordereauCompany: () => true, isTermeCompany: () => true,
}));
jest.mock('../../services/bordereauApi', () => ({
  ...jest.requireActual('../../services/bordereauApi'),
  listQuittances: jest.fn(),
  listBordereaux: jest.fn(),
  getBordereauClients: jest.fn(),
  updateQuittanceLine: jest.fn(),
}));

const QUITTANCES = [
  { num_police: '045200700082', code_client: '1272', nom_client: 'MANUTENTION SYSTEM', echeance: '2026-01-19', num_quittance: '630363', prime_net: 27.072, commission: 4.737, prime_total: 31.696 },
  { num_police: '043202602120', code_client: '4034', nom_client: 'CRK MAROQUINERIE', echeance: '2026-04-21', num_quittance: '0401503', prime_net: 74.05, commission: 12.958, prime_total: 81.493 },
];

beforeEach(() => {
  listCompanies.mockResolvedValue([{ code_compagnie: 1, nom_compagnie: 'GAT' }]);
  listBordereaux.mockResolvedValue([]);
  getBordereauClients.mockResolvedValue({});
  listQuittances.mockResolvedValue(QUITTANCES);
});

test('comptant: the lines are filtered by code or name of the client', async () => {
  render(<BordereauReceptionModal tc="C" onClose={() => {}} />);
  expect(await screen.findByText('MANUTENTION SYSTEM')).toBeInTheDocument();
  const search = screen.getByPlaceholderText('Code ou nom du client');
  fireEvent.change(search, { target: { value: 'crk' } });
  expect(screen.queryByText('MANUTENTION SYSTEM')).not.toBeInTheDocument();
  expect(screen.getByText('CRK MAROQUINERIE')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: '1272' } });
  expect(screen.getByText('MANUTENTION SYSTEM')).toBeInTheDocument();
  expect(screen.queryByText('CRK MAROQUINERIE')).not.toBeInTheDocument();
});

test('comptant: the N° quittance and the Prime Total are corrected in the grid', async () => {
  updateQuittanceLine
    .mockResolvedValueOnce({ num_quittance: '630399', prime_total: 31.696, solde_quittance: 31.696 })
    .mockResolvedValueOnce({ num_quittance: '0401503', prime_total: 90, solde_quittance: 90 });
  render(<BordereauReceptionModal tc="C" onClose={() => {}} />);
  const number = await screen.findByLabelText('N° Quit. 630363');
  fireEvent.change(number, { target: { value: '630399' } });
  await act(async () => { fireEvent.blur(number); });
  expect(updateQuittanceLine).toHaveBeenCalledWith('t', { num_quittance: '630363', num_int: '045200700082', nouveau_numero: '630399' });
  expect(await screen.findByLabelText('N° Quit. 630399')).toHaveValue('630399');

  const prime = screen.getByLabelText('Prime Total 0401503');
  fireEvent.change(prime, { target: { value: '90' } });
  await act(async () => { fireEvent.keyDown(prime, { key: 'Enter' }); fireEvent.blur(prime); });
  await waitFor(() => expect(updateQuittanceLine).toHaveBeenCalledWith('t', { num_quittance: '0401503', num_int: '043202602120', prime_total: 90 }));
  expect(updateQuittanceLine).toHaveBeenCalledTimes(2);
});
