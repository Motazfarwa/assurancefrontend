import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import JournalModal from './JournalModal';
import { getReceiptsJournal, validateReceipt } from '../../services/journalApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Sami' } }) }));
jest.mock('../../services/journalApi', () => ({
  getReceiptsJournal: jest.fn(), getExpensesJournal: jest.fn(), listJournalCompanies: jest.fn(), postReceipts: jest.fn(), postExpenses: jest.fn(), validateReceipt: jest.fn(),
}));
jest.mock('./FeuilleCaisse', () => ({ CashSheet: () => null }));

const { listJournalCompanies } = jest.requireMock('../../services/journalApi');
const line = (number, extra) => ({
  num_quittance: number, tc: 'T', echeance: '2026-01-01', num_police: '6320245109', code_agence: '00', code_compagnie: 4, nom_compagnie: 'CARTE',
  montant: 100, a_s: 'S', frais: 0, timbre: 0, comm: 2.5, assure: 'MIDANI NEJLA', regle: 100, date_reglement: '2026-02-17T00:00:00',
  comptabilise: false, paye: true, solde_quittance: 0, ...extra,
});

beforeEach(() => {
  listJournalCompanies.mockResolvedValue([{ code_compagnie: 4, nom_compagnie: 'CARTE' }]);
  getReceiptsJournal.mockResolvedValue({ items: [line('02026017527'), line('02026999999', { paye: false, solde_quittance: 50, regle: 50 })] });
  validateReceipt.mockResolvedValue({ num_quittance: '02026017527', date_validation: '2026-11-11', montant: 100, a_s: 'S', valide_par: 'Sami' });
});

test('each encaissement is validated on its own, after a confirmation, and stays listed as validated', async () => {
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  const row = (await screen.findByText('02026017527')).closest('tr');
  expect(getReceiptsJournal).toHaveBeenCalledWith('t', expect.objectContaining({ regles: true, periode: true, comptabilises: true }));
  expect(screen.getByRole('columnheader', { name: 'Validation' })).toBeInTheDocument();
  // the client has not paid the rest of the second quittance: nothing to validate
  expect(within(screen.getByText('02026999999').closest('tr')).getByRole('button', { name: 'Valider' })).toBeDisabled();

  fireEvent.click(within(row).getByRole('button', { name: 'Valider' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Valider cet encaissement ?' });
  expect(dialog).toHaveTextContent('Êtes-vous sûr de vouloir valider l’encaissement de la quittance 02026017527');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
  expect(validateReceipt).not.toHaveBeenCalled();

  fireEvent.click(within(row).getByRole('button', { name: 'Valider' }));
  fireEvent.click(screen.getByRole('button', { name: 'Oui, valider' }));
  await waitFor(() => expect(validateReceipt).toHaveBeenCalledWith('t', '02026017527'));
  expect(await within(row).findByText(/Validé le 11\/11\/2026/)).toBeInTheDocument();
  expect(within(row).queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('déclaré et ajouté à la feuille de caisse de ce jour');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
