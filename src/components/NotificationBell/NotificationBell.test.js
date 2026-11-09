import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationBell from './NotificationBell';
import { listIncompleteClients } from '../../services/notificationApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Admin', isAdmin: true }, accessToken: 'token' }) }));
jest.mock('../../contexts/ClientContext', () => ({ useClient: () => ({ setClient: () => {} }) }));
jest.mock('../../navigation', () => ({ navigate: () => {} }));
jest.mock('../../services/clientApi', () => ({ getClientByCode: () => Promise.resolve({}) }));
jest.mock('../HistoriqueModal/HistoryDetailDialog', () => () => null);
jest.mock('../../services/notificationApi', () => ({
  listNotifications: () => Promise.resolve({ unread: 0, items: [] }),
  markNotificationsRead: () => Promise.resolve({}),
  listIncompleteClients: jest.fn(),
}));

const client = (code, name) => ({ code_client: code, nom_client: name, manques: ['email (domicile)'] });
const counters = { total: 2, coordonnees: 2, sans_police: 0, polices: 0 };

async function openList() {
  render(<NotificationBell />);
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
  fireEvent.click(await screen.findByText(/à compléter$/));
}

beforeEach(() => {
  listIncompleteClients.mockImplementation((token, search) => {
    if (search === 'nadia') return Promise.resolve({ ...counters, found: 1, items: [client('12', 'JABNOUNI NADIA')] });
    if (search) return Promise.resolve({ ...counters, found: 0, items: [] });
    return Promise.resolve({ ...counters, found: 2, items: [client('5064', 'CAMBONI IGNAZIO')] });
  });
});

test('searches the whole list on the server and keeps the counters', async () => {
  await openList();
  expect(screen.getByText(/CAMBONI/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' nadia ' } });
  expect(await screen.findByText(/JABNOUNI NADIA/)).toBeInTheDocument();
  expect(listIncompleteClients).toHaveBeenLastCalledWith('token', 'nadia');
  expect(screen.queryByText(/CAMBONI/)).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 client trouvé');
  expect(screen.getByText('2 clients à compléter')).toBeInTheDocument();
});

test('says when nothing matches, and clearing brings the list back', async () => {
  await openList();
  const input = screen.getByRole('searchbox');
  fireEvent.change(input, { target: { value: 'zzz' } });
  expect(await screen.findByText(/Aucun client à compléter/)).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '' } });
  await waitFor(() => expect(screen.getByText(/CAMBONI/)).toBeInTheDocument());
});
