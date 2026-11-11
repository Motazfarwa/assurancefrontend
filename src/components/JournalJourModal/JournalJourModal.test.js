import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import JournalJourModal, { localDay } from './JournalJourModal';
import { createRequest, getMyJournal, getMyRequests, getRequestTargets, getTeamDay, handleRequest, listRequests, validateMyJournal } from '../../services/journalJourApi';
import { INSURANCE_MODULES } from '../../data/insuranceModules';

let mockUser = { name: 'Sami', isAdmin: false };
jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: mockUser }) }));
jest.mock('../../services/journalJourApi', () => ({
  getMyJournal: jest.fn(), saveMyJournal: jest.fn(), validateMyJournal: jest.fn(), getTeamDay: jest.fn(),
  getEmployeeHistory: jest.fn(), markJournalSeen: jest.fn(), reopenJournal: jest.fn(), saveJournalParams: jest.fn(),
  getMyRequests: jest.fn(), handleRequest: jest.fn(), getRequestTargets: jest.fn(), listRequests: jest.fn(), createRequest: jest.fn(), deleteRequest: jest.fn(),
}));

const activite = { total: 3, par_type: [{ type: 'Ajout', libelle: 'ajouts', nombre: 3 }], dernieres: [{ heure: '10:12', design: 'Ajout Quittance N° 341175' }] };
const empty = (day) => ({ journal: { date_jour: day, taches: [], remarques: '', demain: '', statut: 'vide' }, activite, rapport: '', whatsapp: { numero: true, lien: null } });

beforeEach(() => {
  window.confirm = () => true;
  getMyJournal.mockImplementation((token, day) => Promise.resolve(empty(day)));
  getMyRequests.mockResolvedValue({ items: [] });
  validateMyJournal.mockImplementation((token, body) => Promise.resolve({
    journal: { ...body, statut: 'valide', date_validation: `${body.date_jour}T17:05`, envoi: 'lien' }, activite,
    rapport: '📋 Journal — Sami', whatsapp: { numero: true, envoye: false, lien: 'https://wa.me/21698123456?text=x' },
    email: { destinataire: 'farwamotez@gmail.com', envoye: true, erreur: null },
  }));
});

test('the daily journal is a module of every user', () => {
  expect(INSURANCE_MODULES.find((module) => module.form === 'journal-jour')).toMatchObject({ id: '150', everyone: true });
});

test('an employee writes the day, adds a software action as a task, validates and sends it on WhatsApp', async () => {
  mockUser = { name: 'Sami', isAdmin: false };
  render(<JournalJourModal moduleId="150" onClose={() => {}} />);
  fireEvent.change(await screen.findByLabelText('Tâche 1'), { target: { value: 'Relance du client 4914' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'En cours' })[0]);
  // each task: the day (calendar) and the time it was done
  expect(screen.getByLabelText('Date de la tâche 1')).toHaveValue(localDay());
  fireEvent.change(screen.getByLabelText('Heure de la tâche 1'), { target: { value: '09:45' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Tâche' }));
  fireEvent.click(screen.getByRole('button', { name: 'Soumettre' }));
  await waitFor(() => expect(validateMyJournal).toHaveBeenCalledWith('t', {
    date_jour: localDay(), remarques: '', demain: '',
    taches: [
      { texte: 'Relance du client 4914', statut: 'en_cours', date: localDay(), heure: '09:45' },
      // taken from the activity: the time of that action
      { texte: 'Ajout Quittance N° 341175', statut: 'fait', date: localDay(), heure: '10:12' },
    ],
  }));
  expect(await screen.findByText('Rapport envoyé par email à l’administrateur (farwamotez@gmail.com).')).toBeInTheDocument();
  expect(screen.getByText(/^Soumis le/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Envoyer le rapport sur WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/21698123456?text=x');
  expect(screen.queryByLabelText('Tâche 1')).not.toBeInTheDocument();
});

test('the administrator follows every employee of the day', async () => {
  mockUser = { name: 'Admin', isAdmin: true };
  getTeamDay.mockResolvedValue({
    date_jour: localDay(), compteurs: { valide: 1, brouillon: 0, vide: 1 }, whatsapp: { numero: '98123456', api: false }, email: { adresse: 'farwamotez@gmail.com', configure: true },
    items: [
      { utilisateur: 'Mami G.', statut: 'valide', date_validation: '2026-11-11T17:05', taches: [{ texte: 'Bordereau GAT', statut: 'fait' }], remarques: 'RAS', demain: '', activite },
      { utilisateur: 'May M.', statut: 'vide', taches: [], remarques: '', demain: '', activite: { total: 0, par_type: [], dernieres: [] } },
    ],
  });
  render(<JournalJourModal moduleId="150" onClose={() => {}} />);
  expect(await screen.findByText('Bordereau GAT')).toBeInTheDocument();
  expect(screen.getByText('Journal des employés')).toBeInTheDocument();
  expect(screen.getByText('Aucun journal pour ce jour.')).toBeInTheDocument();
  expect(screen.getByDisplayValue('98123456')).toBeInTheDocument();
  expect(screen.getByDisplayValue('farwamotez@gmail.com')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Marquer vu' })).toBeInTheDocument();
});

test('the employee view has no client requests block to fill in', async () => {
  mockUser = { name: 'Sami', isAdmin: false };
  render(<JournalJourModal moduleId="150" onClose={() => {}} />);
  await screen.findByLabelText('Tâche 1');
  expect(screen.queryByRole('region', { name: 'Demandes clients' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Demande du client')).not.toBeInTheDocument();
});

test('an employee sees the requests assigned to them and marks one as handled', async () => {
  mockUser = { name: 'Sami', isAdmin: false };
  const item = { id: 7, client: 'BEN ALI', canaux: ['telephone'], demande: 'Devis auto', observation: '', statut: 'a_traiter', cree_par: 'admin', date_creation: '2026-11-11T09:00' };
  getMyRequests.mockResolvedValue({ items: [item] });
  handleRequest.mockResolvedValue({ items: [{ ...item, statut: 'traitee', reponse: 'Devis envoyé', date_traitement: '2026-11-11T10:30' }] });
  render(<JournalJourModal moduleId="150" onClose={() => {}} />);
  const box = await screen.findByRole('region', { name: 'Demandes qui me sont affectées' });
  expect(within(box).getByText('1 à traiter')).toBeInTheDocument();
  fireEvent.change(within(box).getByLabelText('Réponse à la demande 7'), { target: { value: 'Devis envoyé' } });
  fireEvent.click(within(box).getByRole('button', { name: 'Marquer traitée' }));
  await waitFor(() => expect(handleRequest).toHaveBeenCalledWith('t', 7, 'Devis envoyé'));
  expect(await within(box).findByText('Traitée le 11/11 à 10:30 : Devis envoyé')).toBeInTheDocument();
});

test('the administrator assigns a client request to every employee of an agency, or to chosen users', async () => {
  mockUser = { name: 'Admin', isAdmin: true };
  getTeamDay.mockResolvedValue({ date_jour: localDay(), compteurs: {}, whatsapp: { numero: '', api: false }, email: { adresse: '', configure: true }, items: [] });
  getRequestTargets.mockResolvedValue({
    utilisateurs: [{ nom: 'Mami G.', agence: 'Tunis' }, { nom: 'Maaoui E.', agence: 'Tunis' }, { nom: 'May M.', agence: 'Hammamet' }],
    agences: [{ agence: 'Hammamet', utilisateurs: ['May M.'] }, { agence: 'Tunis', utilisateurs: ['Mami G.', 'Maaoui E.'] }],
  });
  listRequests.mockResolvedValue({ items: [] });
  createRequest.mockImplementation((token, body) => Promise.resolve({ id: 1, ...body, cible: body.agence, date_creation: '2026-11-11T09:00',
    affectations: [{ utilisateur: 'Mami G.', statut: 'a_traiter' }, { utilisateur: 'Maaoui E.', statut: 'a_traiter' }] }));
  render(<JournalJourModal moduleId="150" onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Demandes clients' }));
  const form = await screen.findByRole('form', { name: 'Nouvelle demande client' });
  await within(form).findByLabelText(/^May M./);
  fireEvent.change(within(form).getByLabelText('Client'), { target: { value: 'BEN ALI' } });
  fireEvent.click(within(form).getByLabelText('Email'));
  fireEvent.change(within(form).getByLabelText('Demande du client'), { target: { value: 'Changement d’adresse' } });
  fireEvent.click(within(form).getByLabelText('Par agence'));
  fireEvent.change(within(form).getByLabelText('Agence'), { target: { value: 'Tunis' } });
  expect(within(form).getByText('Mami G., Maaoui E.')).toBeInTheDocument();
  fireEvent.click(within(form).getByRole('button', { name: 'Affecter la demande' }));
  await waitFor(() => expect(createRequest).toHaveBeenCalledWith('t', expect.objectContaining({
    client: 'BEN ALI', canaux: ['email'], demande: 'Changement d’adresse', cible_type: 'agence', agence: 'Tunis',
  })));
  expect(await screen.findByText('Demande affectée à : Mami G., Maaoui E.')).toBeInTheDocument();
  expect(screen.getByText('Mami G. · à traiter')).toBeInTheDocument();
});
