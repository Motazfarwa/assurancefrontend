import { render, screen, fireEvent } from '@testing-library/react';
import FeuilleCaisseModal, { journalDay } from './FeuilleCaisse';
import { getCashValidation, getExpensesJournal, getReceiptsJournal, listJournalCompanies, validateCashSheet } from '../../services/journalApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Sami' } }) }));
jest.mock('../NewWindow/NewWindow', () => ({ __esModule: true, default: () => null, openReportWindow: jest.fn() }));
jest.mock('../../services/journalApi', () => ({
  getCashAdjustment: jest.fn(), getCashSheet: jest.fn(() => new Promise(() => {})), saveCashAdjustment: jest.fn(), listJournalCompanies: jest.fn(),
  getReceiptsJournal: jest.fn(), getExpensesJournal: jest.fn(), getCashValidation: jest.fn(), validateCashSheet: jest.fn(),
}));

const receipt = (number, extra) => ({ num_quittance: number, echeance: '2026-10-01', num_police: 'P1', assure: 'CLIENT', a_s: 'S', montant: 100, regle: 100, comptabilise: false, paye: true, ...extra });

beforeEach(() => {
  listJournalCompanies.mockResolvedValue([{ code_compagnie: 4, nom_compagnie: 'CARTE', code_agent: '123' }]);
  getCashValidation.mockResolvedValue({ validation: null });
  getReceiptsJournal.mockResolvedValue({ items: [receipt('Q1'), receipt('Q2', { paye: false, a_s: 'S' }), receipt('Q3', { comptabilise: true, date_comptabilise: '2026-11-11' })] });
  getExpensesJournal.mockResolvedValue({ items: [{ num_dep: 5, numero: 'S5', nature: 'S', montant: 40, comptabilise: false }] });
  validateCashSheet.mockResolvedValue({ validation: { jour: journalDay(), quittances: 1, encaissements: 100, depenses: 1, montant_depenses: 40, utilisateur: 'Sami', date_saisie: '2026-11-11T16:00' } });
});

test('the feuille de caisse: on the 15th / end of month, "Lister" shows its lines; there is no "Valider"', async () => {
  render(<FeuilleCaisseModal moduleId="590" onClose={() => {}} />);
  expect(screen.getByLabelText('Date')).toHaveValue(journalDay());
  await screen.findByRole('option', { name: 'CARTE' });
  fireEvent.change(screen.getByLabelText('Compagnie'), { target: { value: '4' } });

  fireEvent.click(screen.getByRole('button', { name: 'Lister' }));
  expect(await screen.findByText('Q1')).toBeInTheDocument();
  expect(getReceiptsJournal).toHaveBeenCalledWith('t', expect.objectContaining({ compagnie: '4', date: journalDay(), regles: true, periode: true, comptabilises: true }));
  expect(screen.getByText('Q2').closest('tr')).toHaveTextContent('Reste dû (non déclaré)');
  expect(screen.getByText('Q3').closest('tr')).toHaveClass('is-offday');
  expect(screen.getByText('S5')).toBeInTheDocument();

  // no "Valider" in this module: it only lists and shows the feuille
  expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
});
