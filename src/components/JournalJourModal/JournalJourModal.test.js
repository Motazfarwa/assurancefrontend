import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JournalJourModal, { localDay } from './JournalJourModal';
import { getMyJournal, getTeamDay, validateMyJournal } from '../../services/journalJourApi';
import { INSURANCE_MODULES } from '../../data/insuranceModules';

let mockUser = { name: 'Sami', isAdmin: false };
jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: mockUser }) }));
jest.mock('../../services/journalJourApi', () => ({
  getMyJournal: jest.fn(), saveMyJournal: jest.fn(), validateMyJournal: jest.fn(), getTeamDay: jest.fn(),
  getEmployeeHistory: jest.fn(), markJournalSeen: jest.fn(), reopenJournal: jest.fn(), saveWhatsappNumber: jest.fn(),
}));

const activite = { total: 3, par_type: [{ type: 'Ajout', libelle: 'ajouts', nombre: 3 }], dernieres: [{ heure: '10:12', design: 'Ajout Quittance N° 341175' }] };
const empty = (day) => ({ journal: { date_jour: day, taches: [], remarques: '', demain: '', statut: 'vide' }, activite, rapport: '', whatsapp: { numero: true, lien: null } });

beforeEach(() => {
  window.confirm = () => true;
  getMyJournal.mockImplementation((token, day) => Promise.resolve(empty(day)));
  validateMyJournal.mockImplementation((token, body) => Promise.resolve({
    journal: { ...body, statut: 'valide', date_validation: `${body.date_jour}T17:05`, envoi: 'lien' }, activite,
    rapport: '📋 Journal — Sami', whatsapp: { numero: true, envoye: false, lien: 'https://wa.me/21698123456?text=x' },
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
  fireEvent.click(screen.getByRole('button', { name: '+ Tâche' }));
  fireEvent.click(screen.getByRole('button', { name: /Valider et envoyer/ }));
  await waitFor(() => expect(validateMyJournal).toHaveBeenCalledWith('t', {
    date_jour: localDay(), remarques: '', demain: '',
    taches: [{ texte: 'Relance du client 4914', statut: 'en_cours' }, { texte: 'Ajout Quittance N° 341175', statut: 'fait' }],
  }));
  expect(await screen.findByRole('link', { name: /Envoyer le rapport sur WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/21698123456?text=x');
  expect(screen.queryByLabelText('Tâche 1')).not.toBeInTheDocument();
});

test('the administrator follows every employee of the day', async () => {
  mockUser = { name: 'Admin', isAdmin: true };
  getTeamDay.mockResolvedValue({
    date_jour: localDay(), compteurs: { valide: 1, brouillon: 0, vide: 1 }, whatsapp: { numero: '98123456', api: false },
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
  expect(screen.getByRole('button', { name: 'Marquer vu' })).toBeInTheDocument();
});
