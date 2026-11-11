import { render, screen, fireEvent, within } from '@testing-library/react';
import EtatImpayeModal from './EtatImpayeModal';
import { getRecoveryRate, getUnpaidStatement } from '../../services/unpaidApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Admin' } }) }));
jest.mock('../../services/unpaidApi', () => ({
  getUnpaidStatement: jest.fn(), getRecoveryRate: jest.fn(), getClientLinks: jest.fn(), listStatementCompanies: () => Promise.resolve({ items: [] }),
}));
jest.mock('../../services/reglementClientApi', () => ({ getClientReglements: jest.fn() }));

beforeEach(() => {
  getUnpaidStatement.mockResolvedValue({ limit: 5000, items: [{
    code_client: '91', nom_client: 'BOUKER TAHAR', num_quittance: '02026094429', num_int: '5219970021', tc: 'T', periode: '09/2026',
    echeance: '2026-09-01', montant_quittance: 1008.159, regle: 0, solde: 1008.159, type_client: 'P',
  }] });
  getRecoveryRate.mockResolvedValue({ annee: 2026, du: '2026-01-01', au: '2026-11-11', encaissements: 2191273.555, primes_exigibles: 3360198.729, quittances_exigibles: 1570, taux: 65.21 });
});

test('the statement shows the taux de recouvrement of its scope: encaissements of the year / primes exigibles of the year', async () => {
  render(<EtatImpayeModal onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
  const box = await screen.findByLabelText('Taux de recouvrement');
  expect(within(box).getByText('Taux de recouvrement 2026')).toBeInTheDocument();
  expect(box).toHaveTextContent(/65,21\s%/);
  expect(box).toHaveTextContent(/Encaissements : 2\s191\s273,555 TND/);
  expect(box).toHaveTextContent(/Primes exigibles au 11\/11\/2026 : 3\s360\s198,729 TND/);
  // the same client / company / type of client as the statement (Particuliers by default)
  expect(getRecoveryRate).toHaveBeenCalledWith('t', { code_client: '', type_client: 'P', code_compagnie: '' });
});
