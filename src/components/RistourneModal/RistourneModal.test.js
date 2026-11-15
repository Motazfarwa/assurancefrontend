import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RistourneModal from './RistourneModal';
import { listRistournes } from '../../services/ristourneApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('../../services/ristourneApi', () => ({
  listRistournes: jest.fn(), getRistourne: jest.fn(), getRistournePolicy: jest.fn(),
  createRistourne: jest.fn(), updateRistourne: jest.fn(), deleteRistourne: jest.fn(), extractRistournes: jest.fn(),
}));

beforeEach(() => {
  listRistournes.mockResolvedValue({ items: [
    { num_ristourne: 'R1', date_saisie: '2026-11-03', date_du: '2026-11-03', num_police: 'P1', code_client: '10', nom_client: 'CLIENT A', nom_compagnie: 'GAT', totale: 495.169, solde: 0, comptabilise: true, date_comptabilise: '2026-11-15' },
    { num_ristourne: 'R2', date_saisie: '2026-10-28', date_du: '2026-10-28', num_police: 'P2', code_client: '11', nom_client: 'CLIENT B', nom_compagnie: 'GAT', totale: 100, solde: 100, comptabilise: false },
  ] });
});

test('"Lister" lists the ristournes; with "Entre deux dates" those entered between the two dates', async () => {
  render(<RistourneModal moduleId="555" onClose={() => {}} />);
  expect(screen.getByLabelText('Date début')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Lister' }));
  const list = await screen.findByRole('dialog', { name: 'Liste des ristournes' });
  expect(listRistournes).toHaveBeenLastCalledWith('t', { q: '' });
  expect(screen.queryByRole('button', { name: 'Chercher' })).not.toBeInTheDocument();
  expect(await screen.findByText('2 ristournes')).toBeInTheDocument();
  expect(list).toHaveTextContent('Toutes les ristournes');
  expect(screen.getByText('R2')).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Entre deux dates'));
  fireEvent.change(screen.getByLabelText('Date début'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Date fin'), { target: { value: '2026-10-31' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lister' }));
  expect(listRistournes).toHaveBeenLastCalledWith('t', { debut: '2026-10-01', fin: '2026-10-31', q: '' });
  expect(await screen.findByText(/Saisies du 01\/10\/2026 au 31\/10\/2026/)).toBeInTheDocument();

  // the search bar of the list: N° ristourne, police, code or name of the client, with the same dates
  fireEvent.change(screen.getByLabelText('Rechercher une ristourne'), { target: { value: 'AMICALE' } });
  await waitFor(() => expect(listRistournes).toHaveBeenLastCalledWith('t', { debut: '2026-10-01', fin: '2026-10-31', q: 'AMICALE' }));
});
