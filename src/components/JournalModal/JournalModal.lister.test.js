import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import JournalModal from './JournalModal';
import { CashSheet, isJournalDay, journalDay } from './FeuilleCaisse';
import { getExpensesJournal, getReceiptsJournal } from '../../services/journalApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Sami' } }) }));
jest.mock('../../services/journalApi', () => ({
  getReceiptsJournal: jest.fn(), getExpensesJournal: jest.fn(), listJournalCompanies: jest.fn(), postReceipts: jest.fn(), postExpenses: jest.fn(),
  getReceiptChoices: jest.fn(), saveReceiptChoices: jest.fn(),
}));
jest.mock('./FeuilleCaisse', () => ({
  ...jest.requireActual('./FeuilleCaisse'),
  CashSheet: jest.fn(() => null),
}));

const { listJournalCompanies, getReceiptChoices, saveReceiptChoices } = jest.requireMock('../../services/journalApi');
// The ticks kept on the server, per date (as dbo.TJournalChoix).
let mockKept = {};
const line = (number, extra) => ({
  num_quittance: number, tc: 'T', echeance: '2026-01-01', num_police: '6320245109', code_agence: '00', code_compagnie: 4, nom_compagnie: 'CARTE',
  montant: 100, a_s: 'S', frais: 0, timbre: 0, comm: 2.5, assure: 'MIDANI NEJLA', regle: 100, date_reglement: '2026-02-17T00:00:00',
  comptabilise: false, paye: true, solde_quittance: 0, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  listJournalCompanies.mockResolvedValue([{ code_compagnie: 4, nom_compagnie: 'CARTE' }]);
  mockKept = {};
  getReceiptChoices.mockImplementation((token, date) => Promise.resolve({ choix: { ...(mockKept[date] || {}) } }));
  saveReceiptChoices.mockImplementation((token, date, items) => {
    mockKept[date] = { ...(mockKept[date] || {}), ...Object.fromEntries(items.map((item) => [item.num_quittance, item.coche])) };
    return Promise.resolve({ enregistres: items.length });
  });
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

test('encaissement: listed as it opens, on the journal day (the 15th, or the last day of the month after the 15th)', async () => {
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  const day = journalDay();
  expect(screen.getByLabelText('Date')).toHaveValue(day);
  expect(await screen.findByText('02026017527')).toBeInTheDocument();
  expect(getReceiptsJournal).toHaveBeenCalledWith('t', expect.objectContaining({ date: day, regles: true, periode: true, comptabilises: true }));
  expect(getReceiptsJournal.mock.lastCall[1]).not.toHaveProperty('debut');
});

test('encaissement: the quittances declared on the date and those to declare, every line ticked, no validation column, red when declared off the 15th / end of month', async () => {
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  await waitFor(() => expect(getReceiptsJournal).toHaveBeenLastCalledWith('t', expect.objectContaining({ date: '2026-11-15', regles: true, periode: true, comptabilises: true })));
  const row = (await screen.findByText('02026017527')).closest('tr');
  expect(screen.queryByRole('columnheader', { name: 'Validation' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
  expect(within(row).getByRole('checkbox')).toBeChecked();
  expect(row).not.toHaveClass('is-offday');
  expect(screen.getByText('02026000001').closest('tr')).toHaveClass('is-offday');
  expect(screen.getByText('02026000002').closest('tr')).not.toHaveClass('is-offday');

  // another date: listed again for that date
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-12' } });
  await waitFor(() => expect(getReceiptsJournal).toHaveBeenLastCalledWith('t', expect.objectContaining({ date: '2026-11-12' })));
  await waitFor(() => expect(screen.getByText('02026017527').closest('tr')).toHaveClass('is-offday'));
  // "Lister" reads them again
  const calls = getReceiptsJournal.mock.calls.length;
  fireEvent.click(await screen.findByRole('button', { name: 'Lister' }));
  await waitFor(() => expect(getReceiptsJournal.mock.calls.length).toBe(calls + 1));
});

test('encaissement: nothing declared or to declare at the date', async () => {
  getReceiptsJournal.mockResolvedValue({ items: [] });
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  expect(await screen.findByText('Aucune quittance déclarée ou à déclarer au 15/11/2026.')).toBeInTheDocument();
});

test('the feuille de caisse opened from the journal validates the quittances ticked in it', async () => {
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  await screen.findByRole('option', { name: 'CARTE' });
  fireEvent.change(screen.getByLabelText('Compagnie'), { target: { value: '4' } });
  await waitFor(() => expect(getReceiptsJournal).toHaveBeenLastCalledWith('t', expect.objectContaining({ compagnie: '4' })));
  await screen.findByText('02026017527');
  fireEvent.click(screen.getByRole('button', { name: 'Feuille de caisse' }));
  expect(CashSheet.mock.lastCall[0]).toMatchObject({ date: '2026-11-15', selection: { quittances: ['02026017527'] } });
  // a quittance unticked is left out of the validation
  fireEvent.click(screen.getByLabelText('Choisir 02026017527'));
  expect(CashSheet.mock.lastCall[0].selection).toEqual({ quittances: [] });
});

test('dépense: listed as it opens for every company; "Lister" lists again with the filters', async () => {
  render(<JournalModal kind="depense" moduleId="585" onClose={() => {}} />);
  expect(await screen.findByText('2020007074')).toBeInTheDocument();
  expect(getExpensesJournal).toHaveBeenCalledWith('t', expect.objectContaining({ compagnie: '' }));
  expect(screen.getByRole('columnheader', { name: 'Compagnie' })).toBeInTheDocument();
  expect(screen.getByText('ASTREE')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('S/R'), { target: { value: 'S' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Lister' }));
  await waitFor(() => expect(getExpensesJournal).toHaveBeenLastCalledWith('t', expect.objectContaining({ compagnie: '', nature: 'S' })));
});

test('every line, declared ones included, is ticked and can be unticked; the ticks of a date are kept on the server for that date', async () => {
  const first = render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  await waitFor(() => expect(getReceiptsJournal).toHaveBeenLastCalledWith('t', expect.objectContaining({ date: '2026-11-15' })));
  const declared = await screen.findByLabelText('Choisir 02026000002');
  await waitFor(() => expect(declared).toBeChecked());
  expect(declared).not.toBeDisabled();
  fireEvent.click(declared);
  fireEvent.click(screen.getByLabelText('Choisir 02026017527'));
  expect(declared).not.toBeChecked();
  expect(saveReceiptChoices).toHaveBeenCalledWith('t', '2026-11-15', [{ num_quittance: '02026000002', coche: false }]);
  expect(saveReceiptChoices).toHaveBeenCalledWith('t', '2026-11-15', [{ num_quittance: '02026017527', coche: false }]);
  // ticked again: kept as ticked
  fireEvent.click(screen.getByLabelText('Choisir 02026017527'));
  expect(saveReceiptChoices).toHaveBeenLastCalledWith('t', '2026-11-15', [{ num_quittance: '02026017527', coche: true }]);
  first.unmount();

  // opened again on that date: the same choice
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  await waitFor(() => expect(getReceiptChoices).toHaveBeenLastCalledWith('t', '2026-11-15'));
  await waitFor(() => expect(screen.getByLabelText('Choisir 02026000002')).not.toBeChecked());
  expect(screen.getByLabelText('Choisir 02026017527')).toBeChecked();
  expect(screen.getByLabelText('Choisir 02026000001')).toBeChecked();
  // another date: its own choice (every line ticked)
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-30' } });
  await waitFor(() => expect(getReceiptChoices).toHaveBeenLastCalledWith('t', '2026-11-30'));
  await waitFor(() => expect(screen.getByLabelText('Choisir 02026000002')).toBeChecked());
});
