import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import JournalModal from './JournalModal';
import { CashSheet, isJournalDay, journalDay } from './FeuilleCaisse';
import { getExpensesJournal, getReceiptsJournal } from '../../services/journalApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Sami' } }) }));
jest.mock('../../services/journalApi', () => ({
  getReceiptsJournal: jest.fn(), getExpensesJournal: jest.fn(), listJournalCompanies: jest.fn(), postReceipts: jest.fn(), postExpenses: jest.fn(),
  getReceiptChoices: jest.fn(), saveReceiptChoices: jest.fn(), getJournalPeriods: jest.fn(), validateJournal: jest.fn(),
}));
jest.mock('./FeuilleCaisse', () => ({
  ...jest.requireActual('./FeuilleCaisse'),
  CashSheet: jest.fn(() => null),
}));

const { listJournalCompanies, getReceiptChoices, saveReceiptChoices, getJournalPeriods, validateJournal } = jest.requireMock('../../services/journalApi');
const period = (jour, debut, extra) => ({ jour, debut, declarees: 2, montant_declare: 200, a_declarer: 1, montant_a_declarer: 100, lignes: 3, montant: 300, validation: null, ...extra });
// The journal opens on its lines (the table); "Lister" opens the window of the journals of the half months.
async function openDetails() {
  await screen.findByRole('button', { name: 'Lister' });
}
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
  getJournalPeriods.mockImplementation((token, params) => Promise.resolve({ items: [period(params.date, '2026-11-01'), period('2026-10-31', '2026-10-16', { a_declarer: 0, montant_a_declarer: 0, montant: 200 })], anterieur: null }));
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
  await openDetails();
  expect(await screen.findByText('02026017527')).toBeInTheDocument();
  expect(getReceiptsJournal).toHaveBeenCalledWith('t', expect.objectContaining({ date: day, regles: true, periode: true, comptabilises: true }));
  expect(getReceiptsJournal.mock.lastCall[1]).not.toHaveProperty('debut');
});

test('encaissement: the quittances declared on the date and those to declare, every line ticked, no validation column, red when declared off the 15th / end of month', async () => {
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  await openDetails();
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
  // "Lister": the window of the journals of the half months, over the table
  expect(getJournalPeriods).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Lister' }));
  expect(await screen.findByRole('dialog', { name: 'Journal d’encaissement · journaux par quinzaine' })).toBeInTheDocument();
  await waitFor(() => expect(getJournalPeriods).toHaveBeenCalled());
  expect(screen.getByText('02026017527')).toBeInTheDocument();
});

test('encaissement: nothing declared or to declare at the date', async () => {
  getReceiptsJournal.mockResolvedValue({ items: [] });
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  await openDetails();
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  expect(await screen.findByText('Aucune quittance déclarée ou à déclarer au 15/11/2026.')).toBeInTheDocument();
});

test('the feuille de caisse opened from the journal validates the quittances ticked in it', async () => {
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  await openDetails();
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

test('dépense: the journal opened lists every company; "Lister" lists the journals again with the filters', async () => {
  render(<JournalModal kind="depense" moduleId="585" onClose={() => {}} />);
  await openDetails();
  expect(await screen.findByText('2020007074')).toBeInTheDocument();
  expect(getExpensesJournal).toHaveBeenCalledWith('t', expect.objectContaining({ compagnie: '' }));
  expect(screen.getByRole('columnheader', { name: 'Compagnie' })).toBeInTheDocument();
  expect(screen.getByText('ASTREE')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('S/R'), { target: { value: 'S' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Lister' }));
  await waitFor(() => expect(getJournalPeriods).toHaveBeenLastCalledWith('t', expect.objectContaining({ type: 'depense', compagnie: '', nature: 'S' })));
});

test('every line, declared ones included, is ticked and can be unticked; the ticks of a date are kept on the server for that date', async () => {
  const first = render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  await openDetails();
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
  await openDetails();
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

test('"Lister": one line per journal of the half months; "Valider" asks, then declares the journal on its date', async () => {
  validateJournal.mockResolvedValue({ jour: '2026-11-15', declarees: 1, montant: 100, retirees: 0 });
  render(<JournalModal kind="encaissement" moduleId="580" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Lister' }));
  await waitFor(() => expect(getJournalPeriods).toHaveBeenLastCalledWith('t', expect.objectContaining({ type: 'encaissement', date: '2026-11-15', nombre: 12 })));
  const current = (await screen.findByRole('button', { name: 'Journal d’encaissement du 15/11/2026' })).closest('tr');
  const previous = screen.getByRole('button', { name: 'Journal d’encaissement du 31/10/2026' }).closest('tr');
  expect(within(current).getByText('300,000')).toBeInTheDocument();
  expect(within(previous).getByRole('button', { name: 'Valider' })).toBeDisabled();
  expect(within(previous).getByText('À jour')).toBeInTheDocument();
  fireEvent.click(within(current).getByRole('button', { name: 'Valider' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Valider le journal d’encaissement du 15/11/2026 ?' });
  expect(validateJournal).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oui, valider' }));
  await waitFor(() => expect(validateJournal).toHaveBeenCalledWith('t', { type: 'encaissement', jour: '2026-11-15', compagnie: null, nature: '' }));
  expect(await screen.findByText(/Journal d’encaissement du 15\/11\/2026 validé : 1 quittance/)).toBeInTheDocument();
  // older journals on demand
  fireEvent.click(screen.getByRole('button', { name: 'Journaux plus anciens' }));
  await waitFor(() => expect(getJournalPeriods).toHaveBeenLastCalledWith('t', expect.objectContaining({ nombre: 24 })));
  // "Détails": the window closes, the journal of that date is listed in the table
  fireEvent.click(within(previous).getByRole('button', { name: 'Détails' }));
  expect(screen.queryByRole('dialog', { name: 'Journal d’encaissement · journaux par quinzaine' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Date')).toHaveValue('2026-10-31');
  await waitFor(() => expect(getReceiptsJournal).toHaveBeenLastCalledWith('t', expect.objectContaining({ date: '2026-10-31' })));
});
