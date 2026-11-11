import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChequeModal from './ChequeModal';
import { createPiece, getClientOverview } from '../../services/chequeApi';
import { scanPayment } from '../../services/paymentScan';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Sami' } }) }));
jest.mock('../../services/chequeApi', () => ({
  listBanks: jest.fn(), listAccounts: jest.fn(), getClientOverview: jest.fn(), getPiece: jest.fn(), listPieces: jest.fn(),
  createPiece: jest.fn(), updatePiece: jest.fn(), deletePiece: jest.fn(),
}));
jest.mock('../../services/clientApi', () => ({ listClients: () => Promise.resolve([]), normalizeClientRecord: (r) => r, rankClients: (r) => r }));
jest.mock('../../services/paymentScan', () => ({ scanPayment: jest.fn() }));

const { listBanks, listAccounts } = jest.requireMock('../../services/chequeApi');
const READ = {
  'ch1.jpg': { nump: '4410021', montant: '250.000', echeance: '2026-11-20', code: '2973', enInstance: true, typeReglement: 'Chèque' },
  'ch2.jpg': { nump: '4410022', montant: '180.500', echeance: '2026-12-05', code: '2973', enInstance: true, typeReglement: 'Chèque' },
};

beforeEach(() => {
  listBanks.mockResolvedValue([]);
  listAccounts.mockResolvedValue([]);
  getClientOverview.mockResolvedValue({ client: { code_client: '2973', nom_client: 'BEN SALAH ALI' }, quittances: [], pieces: [] });
  createPiece.mockResolvedValue({});
  scanPayment.mockImplementation((file) => Promise.resolve({ values: READ[file.name], found: [{ key: 'nump', label: 'N° pièce', value: READ[file.name].nump }] }));
});

test('several cheques are scanned and entered one after the other', async () => {
  const { container } = render(<ChequeModal onClose={() => {}} />);
  const files = ['ch1.jpg', 'ch2.jpg'].map((name) => new File(['x'], name, { type: 'image/jpeg' }));
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files } });

  expect(await screen.findByText(/Chèques scannés · 0 \/ 2/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByPlaceholderText('Nouveau n° de pièce')).toHaveValue('4410021'));
  await waitFor(() => expect(screen.getByPlaceholderText('Saisir un nom ou un prénom')).toHaveValue('BEN SALAH ALI'), { timeout: 2000 });
  expect(scanPayment).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
  await waitFor(() => expect(createPiece).toHaveBeenCalledWith('t', expect.objectContaining({ nump: '4410021', montant: 250, code_client: '2973', en_instance: true })));
  // the second cheque is loaded in the form, the status is kept
  await waitFor(() => expect(screen.getByPlaceholderText('Nouveau n° de pièce')).toHaveValue('4410022'));
  expect(screen.getByText(/Chèques scannés · 1 \/ 2/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
  await waitFor(() => expect(createPiece).toHaveBeenLastCalledWith('t', expect.objectContaining({ nump: '4410022', montant: 180.5, en_instance: true })));
  expect(await screen.findByText(/Tous les chèques scannés sont enregistrés/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Terminer' })).toBeInTheDocument();
});
