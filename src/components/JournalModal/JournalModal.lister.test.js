import { render, screen, fireEvent, within } from '@testing-library/react';
import JournalModal from './JournalModal';
import { CashSheet, isJournalDay, journalDay } from './FeuilleCaisse';
import { getExpensesJournal, getReceiptsJournal } from '../../services/journalApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Sami' } }) }));
jest.mock('../../services/journalApi', () => ({
  getReceiptsJournal: jest.fn(), getExpensesJournal: jest.fn(), listJournalCompanies: jest.fn(), postReceipts: jest.fn(), postExpenses: jest.fn(),
}));
jest.mock('./FeuilleCaisse', () => ({
  ...jest.requireActual('./FeuilleCaisse'),
  CashSheet: jest.fn(() => null),
}));

const { listJournalCompanies } = jest.requireMock('../../services/journalApi');
const line = (number, extra) => ({
  num_quittance: number, tc: 'T', echeance: '2026-01-01', num_police: '6320245109', code_agence: '00', code_compagnie: 4, nom_compagnie: 'CARTE',
  montant: 100, a_s: 'S', frais: 0, timbre: 0, comm: 2.5, assure: 'MIDANI NEJLA', regle: 100, date_reglement: '2026-02-17T00:00:00',
  comptabilise: false, paye: true, solde_quittance: 0, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  listJournalCompanies.mockResolvedValue([{ code_compagnie: 4, nom_compagnie: 'CARTE' }]);
  getReceiptsJournal.mockResolvedValue({ items: [
    line('02026017527'),
    line('02026000001', { comptabilise: true, date_comptabilise: '2026-11-11' }),
    line('02026000002', { comptabilise: true, date_comptabilise: '2026-11-15' }),
  ] });
  getExpensesJournal.mockResolvedValue({ items: [{ num_dep: 9037, numero: '2020007074', nature: 'S', montant: 184.111, code_compagnie: 6, nom_compagnie: 'ASTREE', comptabilise: false }] });
});

test('the journal days: the 15th and the last day of the month', () => {
  expect(journalDay(new Date(2026, 10, 11))).toBe('2026-11-15');
  expect(journalDay(new Date(2026, 1, 16))).toBe('2026-02-28');
  expect(isJournalDay('2026-11-30')).toBe(true);
  expect(isJournalDay('2026-11-11')).toBe(false);
});

test('encaissement: listed on "Lister", every line ticked, no validation column, red when declared off the 15th / end of month', async () => {
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  expect(getReceiptsJournal).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lister' }));
  const row = (await screen.findByText('02026017527')).closest('tr');
  expect(getReceiptsJournal).toHaveBeenCalledWith('t', expect.objectContaining({ date: '2026-11-15', regles: true, periode: true, comptabilises: true }));
  expect(screen.queryByRole('columnheader', { name: 'Validation' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
  expect(within(row).getByRole('checkbox')).toBeChecked();
  expect(row).not.toHaveClass('is-offday');
  expect(screen.getByText('02026000001').closest('tr')).toHaveClass('is-offday');
  expect(screen.getByText('02026000002').closest('tr')).not.toHaveClass('is-offday');

  // another date: the list is cleared until "Lister"
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-12' } });
  expect(screen.queryByText('02026017527')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Lister' }));
  expect((await screen.findByText('02026017527')).closest('tr')).toHaveClass('is-offday');
});

test('the feuille de caisse opened from the journal validates the quittances ticked in it', async () => {
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  await screen.findByRole('option', { name: 'CARTE' });
  fireEvent.change(screen.getByLabelText('Compagnie'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lister' }));
  await screen.findByText('02026017527');
  fireEvent.click(screen.getByRole('button', { name: 'Feuille de caisse' }));
  expect(CashSheet.mock.lastCall[0]).toMatchObject({ date: '2026-11-15', selection: { quittances: ['02026017527'] } });
  // a quittance unticked is left out of the validation
  fireEvent.click(screen.getByLabelText('Choisir 02026017527'));
  expect(CashSheet.mock.lastCall[0].selection).toEqual({ quittances: [] });
});

test('dépense: "Lister" without a company lists every company', async () => {
  render(<JournalModal kind="depense" moduleId="585" onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Lister' }));
  expect(await screen.findByText('2020007074')).toBeInTheDocument();
  expect(getExpensesJournal).toHaveBeenCalledWith('t', expect.objectContaining({ compagnie: '' }));
  expect(screen.getByRole('columnheader', { name: 'Compagnie' })).toBeInTheDocument();
  expect(screen.getByText('ASTREE')).toBeInTheDocument();
});
