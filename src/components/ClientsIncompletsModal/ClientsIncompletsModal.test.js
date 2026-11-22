import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientsIncompletsModal from './ClientsIncompletsModal';
import { listIncompleteClientsPage } from '../../services/notificationApi';
import { INSURANCE_MODULES } from '../../data/insuranceModules';
import { navigate, rememberClientAction, rememberReturnModule } from '../../navigation';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Admin', isAdmin: true } }) }));
jest.mock('../../contexts/ClientContext', () => ({ useClient: () => ({ setClient: () => {} }) }));
jest.mock('../../navigation', () => ({ navigate: jest.fn(), rememberReturnModule: jest.fn(), rememberClientAction: jest.fn() }));
jest.mock('../../services/clientApi', () => ({ getClientByCode: () => Promise.resolve({}) }));
jest.mock('../../services/notificationApi', () => ({ listIncompleteClientsPage: jest.fn() }));

const counters = { total: 2039, coordonnees: 1845, sans_police: 893, sans_quittance: 1210 };
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

test('counts the clients with missing coordonnées, without police, without quittance, and their total; filters on a kind', async () => {
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  expect(await screen.findByText('CAMBONI IGNAZIO')).toBeInTheDocument();
  expect(screen.getByText('téléphone')).toBeInTheDocument();
  expect(screen.getByText('Aucune police')).toBeInTheDocument();
  // no counter cards over the list: the counts are in the "Afficher" list
  expect(screen.queryByRole('group', { name: 'Type d’information manquante' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: /Tous les clients à compléter \(2039\)/ })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: /Coordonnées manquantes \(1845\)/ })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: /Sans quittance \(1210\)/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Afficher'), { target: { value: 'sans_quittance' } });
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'sans_quittance', manque: '', q: '', offset: 0, limit: 100 }));
  fireEvent.change(screen.getByLabelText('Afficher'), { target: { value: 'sans_police' } });
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'sans_police', manque: '', q: '', offset: 0, limit: 100 }));
  await waitFor(() => expect(screen.queryByText('CAMBONI IGNAZIO')).not.toBeInTheDocument());
});

test('the filter shows the clients without police, or those without one coordonnée', async () => {
  listIncompleteClientsPage.mockResolvedValue({ ...counters, manques: { adresse: 95, ville: 123, 'code postal': 327, téléphone: 1773 }, found: 1,
    items: [client('5056', 'BORGHINI ANTONELLO', { coordonnees: ['ville'] })] });
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  const filter = await screen.findByLabelText('Afficher');
  expect(await screen.findByRole('option', { name: /Sans téléphone \(1773\)/ })).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: 'coordonnees:ville' } });
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'coordonnees', manque: 'ville', q: '', offset: 0, limit: 100 }));
  expect(filter).toHaveValue('coordonnees:ville');
  fireEvent.change(filter, { target: { value: 'sans_police' } });
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'sans_police', manque: '', q: '', offset: 0, limit: 100 }));
});

test('"Créés entre deux dates" lists the clients created in the period (sans police from 2000 to 2022)', async () => {
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenCalled());
  expect(screen.getByLabelText('Date de création du')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Afficher'), { target: { value: 'sans_police' } });
  fireEvent.click(screen.getByLabelText('Créés entre deux dates'));
  fireEvent.change(screen.getByLabelText('Date de création du'), { target: { value: '2000-01-01' } });
  fireEvent.change(screen.getByLabelText('Date de création au'), { target: { value: '2022-12-31' } });
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'sans_police', manque: '', q: '', offset: 0, limit: 100, date_debut: '2000-01-01', date_fin: '2022-12-31' }));
});

test('"Chargement des clients…" is shown over the list while the clients are read', async () => {
  let finish;
  listIncompleteClientsPage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  expect(await screen.findByText('Chargement des clients…')).toBeInTheDocument();
  finish({ total: 0, found: 0, coordonnees: 0, sans_police: 0, manques: {}, items: [] });
  await waitFor(() => expect(screen.queryByText('Chargement des clients…')).not.toBeInTheDocument());
});

test('"Ouvrir la fiche" remembers the module and its filters, so "Retour" on the fiche comes back to it', async () => {
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  fireEvent.change(await screen.findByLabelText('Afficher'), { target: { value: 'sans_police' } });
  await waitFor(() => expect(screen.queryByText('Chargement des clients…')).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ouvrir la fiche' })).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la fiche' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clients'));
  expect(rememberReturnModule).toHaveBeenCalledWith('105', expect.objectContaining({ categorie: 'sans_police', manque: '', search: '', between: false }));
});

test('opened again after the fiche: the filters are those that were left', async () => {
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} initial={{ categorie: 'sans_police', search: 'ben', between: true, debut: '2000-01-01', fin: '2022-12-31' }} />);
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'sans_police', manque: '', q: 'ben', offset: 0, limit: 100, date_debut: '2000-01-01', date_fin: '2022-12-31' }));
  expect(screen.getByLabelText('Afficher')).toHaveValue('sans_police');
  expect(screen.getByLabelText('Créés entre deux dates')).toBeChecked();
});

test('the list is paginated: a page reads its 100 clients, a filter goes back to page 1', async () => {
  listIncompleteClientsPage.mockImplementation((token, params) => Promise.resolve({ ...counters, found: 1845,
    items: [client(String(5000 + params.offset), `CLIENT ${params.offset}`, { coordonnees: ['ville'] })] }));
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} />);
  expect(await screen.findByText('CLIENT 0')).toBeInTheDocument();
  expect(screen.getByText('Page 1 / 19')).toBeInTheDocument();
  expect(screen.queryByText(/clients de plus/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Suivant ›' }));
  expect(await screen.findByText('CLIENT 100')).toBeInTheDocument();
  expect(screen.getByText('Page 2 / 19')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '19' }));
  expect(await screen.findByText('CLIENT 1800')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Afficher'), { target: { value: 'sans_police' } });
  await waitFor(() => expect(listIncompleteClientsPage).toHaveBeenLastCalledWith('t', { categorie: 'sans_police', manque: '', q: '', offset: 0, limit: 100 }));
});

test('"Sans quittance": the client opens on the quittance to enter, or on "Saisir police" without a police', async () => {
  listIncompleteClientsPage.mockResolvedValue({ ...counters, found: 2, items: [
    client('5055', 'HAS POLICE', { sans_quittance: true }),
    client('5063', 'BEN AISSA ASMA', { sans_police: true, sans_quittance: true }),
  ] });
  render(<ClientsIncompletsModal moduleId="105" onClose={() => {}} initial={{ categorie: 'sans_quittance' }} />);
  const buttons = await screen.findAllByRole('button', { name: 'Saisir la quittance' });
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clients'));
  expect(rememberClientAction).toHaveBeenCalledWith('5055', 'receipt');
  fireEvent.click(buttons[1]);
  await waitFor(() => expect(rememberClientAction).toHaveBeenCalledWith('5063', 'police'));
});
