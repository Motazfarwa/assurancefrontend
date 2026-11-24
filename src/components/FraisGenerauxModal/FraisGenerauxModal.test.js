import { render, screen } from '@testing-library/react';
import FraisGenerauxModal, { AfficherFraisModal } from './FraisGenerauxModal';
import { INSURANCE_MODULES } from '../../data/insuranceModules';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('../NewWindow/NewWindow', () => ({ __esModule: true, default: () => null, openReportWindow: jest.fn() }));
jest.mock('../../services/fraisApi', () => ({
  createFrais: jest.fn(), listFrais: jest.fn(),
  getFraisOptions: () => Promise.resolve({ natures: [{ code: 'D', libelle: 'Frais Généraux (W.J)', types: [] }], modes: [{ code: 'C', libelle: 'Chèque' }], banques: [], banque_par_nature: {} }),
}));

test('"Saisie frais généraux" only enters the frais: no aperçu', async () => {
  render(<FraisGenerauxModal moduleId="400" onClose={() => {}} />);
  expect(await screen.findByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aperçu' })).not.toBeInTheDocument();
});

test('"État des frais généraux" is a module of its own: nature, period, aperçu', async () => {
  expect(INSURANCE_MODULES.find((module) => module.id === '401')).toMatchObject({ title: 'État des frais généraux', form: 'frais-generaux-liste' });
  render(<AfficherFraisModal moduleId="401" onClose={() => {}} />);
  expect(screen.getByRole('heading', { name: 'État des frais généraux' })).toBeInTheDocument();
  expect(await screen.findByRole('option', { name: 'Frais Généraux (W.J)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Aperçu' })).toBeEnabled();
});
