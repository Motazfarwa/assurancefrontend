import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChequeModal from './ChequeModal';
import { journalDay } from '../JournalModal/FeuilleCaisse';
import { createPiece, getClientOverview } from '../../services/chequeApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Sami' } }) }));
jest.mock('../../services/chequeApi', () => ({
  listBanks: jest.fn(), listAccounts: jest.fn(), getClientOverview: jest.fn(), getPiece: jest.fn(), listPieces: jest.fn(),
  createPiece: jest.fn(), updatePiece: jest.fn(), deletePiece: jest.fn(),
}));
jest.mock('../../services/clientApi', () => ({ listClients: () => Promise.resolve([]), normalizeClientRecord: (r) => r, rankClients: (r) => r }));
jest.mock('../../services/paymentScan', () => ({ scanPayment: jest.fn() }));

const { listBanks, listAccounts } = jest.requireMock('../../services/chequeApi');
const shortDate = (value) => value.split('-').reverse().join('/');

beforeEach(() => {
  listBanks.mockResolvedValue([]);
  listAccounts.mockResolvedValue([{ code_banque: 'ATB1', nom_banque: 'ATTIJARI BH' }]);
  getClientOverview.mockResolvedValue({
    client: { code_client: '2973', nom_client: 'BEN SALAH ALI' },
    quittances: [{ num_quittance: '20261001136712', num_police: '074202648171', echeance: '2026-11-14', solde: 120, instance: 0 }],
    pieces: [],
  });
  createPiece.mockResolvedValue({ nump: 'ESP1', num_reg_cli: 41804, date_comptabilise: journalDay() });
});

test('"À verser": the quittances paid can be comptabilisées in the feuille de caisse of the journal day', async () => {
  render(<ChequeModal onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText('Ex : 2973'), { target: { value: '2973' } });
  await waitFor(() => expect(screen.getByPlaceholderText('Saisir un nom ou un prénom')).toHaveValue('BEN SALAH ALI'), { timeout: 2000 });
  const label = `Comptabiliser dans la feuille de caisse du ${shortDate(journalDay())}`;
  // only offered for a piece "à verser"
  expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('À verser'));
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.change(screen.getByPlaceholderText('Nouveau n° de pièce'), { target: { value: 'ESP1' } });
  fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '120' } });
  fireEvent.change(screen.getByLabelText('Compte de versement *'), { target: { value: 'ATB1' } });
  // nothing split over a quittance: nothing to comptabilise
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(await screen.findByText('Pour comptabiliser dans la feuille de caisse, répartissez le montant sur au moins une quittance.')).toBeInTheDocument();
  expect(createPiece).not.toHaveBeenCalled();

  fireEvent.change(document.querySelector('input.chq-amount'), { target: { value: '120' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
  await waitFor(() => expect(createPiece).toHaveBeenCalledWith('t', expect.objectContaining({ a_verser: true, comptabiliser: true, allocations: [{ num_quittance: '20261001136712', montant: 120 }] })));
  expect(await screen.findByText(new RegExp(`comptabilisées dans la feuille de caisse du ${shortDate(journalDay())}`))).toBeInTheDocument();
});
