import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientsIncompletsModal from './ClientsIncompletsModal';
import { listIncompleteClientsPage } from '../../services/notificationApi';
import { INSURANCE_MODULES } from '../../data/insuranceModules';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Admin', isAdmin: true } }) }));
jest.mock('../../contexts/ClientContext', () => ({ useClient: () => ({ setClient: () => {} }) }));
jest.mock('../../navigation', () => ({ navigate: () => {} }));
jest.mock('../../services/clientApi', () => ({ getClientByCode: () => Promise.resolve({}) }));
jest.mock('../../services/notificationApi', () => ({ listIncompleteClientsPage: jest.fn() }));

const counters = { total: 2039, coordonnees: 1845, sans_police: 893 };
const client = (code, name, details) => ({ code_client: code, nom_client: name, manques: [], details: { coordonnees: [], sans_police: false, ...details } });

beforeEach(() => {
  listIncompleteClientsPage.mockImplementation((token, params) => Promise.resolve(params.categorie === 'sans_police'
    ? { ...counters, found: 1, items: [client('5063', 'BEN AISSA ASMA', { sans_police: true })] }
    : { ...counters, found: 2, items: [
      client('5064', 'CAMBONI IGNAZIO', { coordonnees: ['téléphone'] }),
      client('5063', 'BEN AISSA ASMA', { sans_police: true }),
    ] }));
});

test('the module is for the administrator only', () => {
  expect(INSURANCE_MODULES.find((module) => module.form === 'clients-incomplets')).toMatchObject({ id: '105', adminOnly: true });
});

test('counts the clients with missing coordonnées, without police, and their total; filters on a kind', async () => {
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  expect(await screen.findByText('CAMBONI IGNAZIO')).toBeInTheDocument();
  expect(screen.getByText('téléphone')).toBeInTheDocument();
  expect(screen.getByText('Aucune police')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Tous les clients 2039/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Coordonnées 1845/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Quittances/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Polices/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Sans police 893/ }));
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'sans_police', q: '', offset: 0, limit: 100 }));
  await waitFor(() => expect(screen.queryByText('CAMBONI IGNAZIO')).not.toBeInTheDocument());
});
