import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientsIncompletsModal from './ClientsIncompletsModal';
import { listIncompleteClientsPage } from '../../services/notificationApi';
import { INSURANCE_MODULES } from '../../data/insuranceModules';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Admin', isAdmin: true } }) }));
jest.mock('../../contexts/ClientContext', () => ({ useClient: () => ({ setClient: () => {} }) }));
jest.mock('../../navigation', () => ({ navigate: () => {} }));
jest.mock('../../services/clientApi', () => ({ getClientByCode: () => Promise.resolve({}) }));
jest.mock('../../services/notificationApi', () => ({ listIncompleteClientsPage: jest.fn() }));

const counters = { total: 4792, coordonnees: 4412, sans_police: 895, polices: 749, quittances: 2, sinistres: 44 };
const client = (code, name, details) => ({ code_client: code, nom_client: name, manques: [], details: { coordonnees: [], sans_police: false, polices: [], quittances: [], sinistres: [], ...details } });

beforeEach(() => {
  listIncompleteClientsPage.mockImplementation((token, params) => Promise.resolve(params.categorie === 'sinistres'
    ? { ...counters, found: 1, items: [client('4914', 'BEN ALI', { sinistres: ['202609006 : N° sinistre compagnie'] })] }
    : { ...counters, found: 2, items: [
      client('5064', 'CAMBONI IGNAZIO', { coordonnees: ['email (domicile)'], polices: ['011202654898 : code branche'] }),
      client('5063', 'BEN AISSA ASMA', { sans_police: true }),
    ] }));
});

test('the module is for the administrator only', () => {
  expect(INSURANCE_MODULES.find((module) => module.form === 'clients-incomplets')).toMatchObject({ id: '105', adminOnly: true });
});

test('lists what each client lacks, by kind, and filters on a kind', async () => {
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  expect(await screen.findByText('CAMBONI IGNAZIO')).toBeInTheDocument();
  expect(screen.getByText('email (domicile)')).toBeInTheDocument();
  expect(screen.getByText('011202654898')).toBeInTheDocument();
  expect(screen.getByText('Aucune police')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Sinistres 44/ }));
  expect(await screen.findByText('BEN ALI')).toBeInTheDocument();
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'sinistres', q: '', offset: 0, limit: 100 }));
  expect(screen.queryByText('CAMBONI IGNAZIO')).not.toBeInTheDocument();
});
