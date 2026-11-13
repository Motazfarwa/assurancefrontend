import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientsIncompletsModal from './ClientsIncompletsModal';
import { listIncompleteClientsPage } from '../../services/notificationApi';
import { INSURANCE_MODULES } from '../../data/insuranceModules';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Admin', isAdmin: true } }) }));
jest.mock('../../contexts/ClientContext', () => ({ useClient: () => ({ setClient: () => {} }) }));
jest.mock('../../navigation', () => ({ navigate: () => {} }));
jest.mock('../../services/clientApi', () => ({ getClientByCode: () => Promise.resolve({}) }));
jest.mock('../../services/notificationApi', () => ({ listIncompleteClientsPage: jest.fn() }));

const counters = { total: 4461, coordonnees: 4437, sans_police: 894, polices: 65, quittances: 2 };
const client = (code, name, details) => ({ code_client: code, nom_client: name, manques: [], details: { coordonnees: [], sans_police: false, polices: [], quittances: [], ...details } });

beforeEach(() => {
  listIncompleteClientsPage.mockImplementation((token, params) => Promise.resolve(params.categorie === 'quittances'
    ? { ...counters, found: 1, items: [client('4914', 'BEN ALI', { quittances: ['20261101052731 : prime nette'] })] }
    : { ...counters, found: 2, items: [
      client('5064', 'CAMBONI IGNAZIO', { coordonnees: ['email (domicile)'], polices: ['011202654898 : risque'] }),
      client('5063', 'BEN AISSA ASMA', { sans_police: true }),
    ] }));
});

test('the module is for the administrator only', () => {
  expect(INSURANCE_MODULES.find((module) => module.form === 'clients-incomplets')).toMatchObject({ id: '105', adminOnly: true });
});

test('lists what each client lacks, by kind, and filters on a kind; the sinistres are not counted', async () => {
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  expect(await screen.findByText('CAMBONI IGNAZIO')).toBeInTheDocument();
  expect(screen.getByText('email (domicile)')).toBeInTheDocument();
  expect(screen.getByText('011202654898')).toBeInTheDocument();
  expect(screen.getByText('Aucune police')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Tous les clients 4461/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Sinistres/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Sinistres' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Quittances 2/ }));
  expect(await screen.findByText('BEN ALI')).toBeInTheDocument();
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'quittances', q: '', offset: 0, limit: 100 }));
  expect(screen.queryByText('CAMBONI IGNAZIO')).not.toBeInTheDocument();
});
