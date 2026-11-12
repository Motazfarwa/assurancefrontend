import { render, screen } from '@testing-library/react';
import { FAMILIES, OperationsSheet } from './OperationsJournalieres';
import { getDailyProduction } from '../../services/journalApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Admin', isAdmin: true } }) }));
jest.mock('../../services/journalApi', () => ({ getDailyProduction: jest.fn(), getDailyFinancial: jest.fn() }));

test('a quittance logged under its série shows its own data, one not in the base is said so', async () => {
  getDailyProduction.mockResolvedValue({ items: [
    { date_mvt: '2026-11-11', mvt: 'Modification', num_quittance: '20261104400741', serie: '341173', trouvee: true, num_int: '045202600012',
      code_client: '4034', nom_client: 'CRK MAROQUINERIE .', echeance: '2026-10-06T00:00:00', tc: 'C', periode: '11/2026', prime_total: 32.389 },
    { date_mvt: '2026-11-11', mvt: 'Ajout', num_quittance: '20261107050794', serie: null, trouvee: true, num_int: '074202648171',
      code_client: '4116', nom_client: 'STE VNEURON INC', echeance: '2026-11-14T00:00:00', tc: 'C', periode: null, prime_total: 33.4 },
    { date_mvt: '2026-11-11', mvt: 'Ajout', num_quittance: '4652.2026', serie: null, trouvee: false },
  ] });
  render(<OperationsSheet family={FAMILIES.production} type="quittance" debut="2026-11-11" fin="2026-11-12" onClose={() => {}} />);
  expect(await screen.findByText('20261104400741 (série 341173)')).toBeInTheDocument();
  ['045202600012', '4034', 'CRK MAROQUINERIE .', '06/10/2026', '11/2026'].forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
  expect(screen.getByText('4652.2026')).toBeInTheDocument();
  expect(screen.getByText('Quittance introuvable dans la base')).toBeInTheDocument();
  // a comptant quittance not yet validated in Réception comptant has no période in the base: said so, none made up
  expect(screen.getByText('20261107050794').closest('tr')).toHaveTextContent('Non validée');
  expect(screen.getAllByText('Non validée')).toHaveLength(1);
});
