import { render, screen, fireEvent, within } from '@testing-library/react';
import EtatImpayeModal from './EtatImpayeModal';
import { getClientReglements } from '../../services/reglementClientApi';
import { getClientLinks, getMemoireContacts, getRecoveryRate, getUnpaidStatement, sendMemoire } from '../../services/unpaidApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Admin' } }) }));
jest.mock('../../services/unpaidApi', () => ({
  getUnpaidStatement: jest.fn(), getRecoveryRate: jest.fn(), getClientLinks: jest.fn(), listStatementCompanies: () => Promise.resolve({ items: [] }),
  getMemoireContacts: jest.fn(), sendMemoire: jest.fn(), downloadMemoirePdf: jest.fn(),
}));
jest.mock('../../services/reglementClientApi', () => ({ getClientReglements: jest.fn(() => Promise.resolve({ client: null })) }));

beforeEach(() => {
  getUnpaidStatement.mockResolvedValue({ limit: 5000, items: [{
    code_client: '91', nom_client: 'BOUKER TAHAR', num_quittance: '02026094429', num_int: '5219970021', tc: 'T', periode: '09/2026',
    echeance: '2026-09-01', montant_quittance: 1008.159, regle: 0, solde: 1008.159, type_client: 'P',
  }] });
  getRecoveryRate.mockResolvedValue({ annee: 2026, du: '2026-01-01', au: '2026-11-11', encaissements: 2191273.555, primes_exigibles: 3360198.729, quittances_exigibles: 1570, taux: 65.21 });
});

test('the statement shows the taux de recouvrement of its scope: encaissements of the year / primes exigibles of the year', async () => {
  render(<EtatImpayeModal onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
  const box = await screen.findByLabelText('Taux de recouvrement');
  expect(within(box).getByText('Taux de recouvrement 2026')).toBeInTheDocument();
  expect(box).toHaveTextContent(/65,21\s%/);
  expect(box).toHaveTextContent(/Encaissements : 2\s191\s273,555 TND/);
  expect(box).toHaveTextContent(/Primes exigibles au 11\/11\/2026 : 3\s360\s198,729 TND/);
  // the same client / company / type of client as the statement (every client type by default)
  expect(getRecoveryRate).toHaveBeenCalledWith('t', { code_client: '', type_client: '', code_compagnie: '' });
});

test('every client type is read by default (the sociétés too, as the legacy report); "Type client" narrows it to one', async () => {
  render(<EtatImpayeModal onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
  await screen.findByLabelText('Taux de recouvrement');
  expect(getUnpaidStatement).toHaveBeenLastCalledWith('t', expect.objectContaining({ type_client: '' }));
});

test('"Type client" ticked with Société reads the sociétés only', async () => {
  render(<EtatImpayeModal onClose={() => {}} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Type client' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Société' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
  await screen.findByLabelText('Taux de recouvrement');
  expect(getUnpaidStatement).toHaveBeenLastCalledWith('t', expect.objectContaining({ type_client: 'S' }));
});

test('the mémoire of a client is sent by email with its PDF: the address offered is the one of the client file', async () => {
  getClientReglements.mockResolvedValue({ client: { nom_client: 'BOUKER TAHAR' } });
  getClientLinks.mockResolvedValue({ client: { code_client: '91', nom_client: 'BOUKER TAHAR' }, liens: [] });
  getMemoireContacts.mockResolvedValue({ code_client: '91', nom_client: 'BOUKER TAHAR', emails: ['tahar@domaine.tn'], telephones: ['22 123 456'] });
  sendMemoire.mockResolvedValue({ canal: 'email', destinataire: 'tahar@domaine.tn', envoye: true, fichier: 'memoire_reglement_91_20261114.pdf' });
  render(<EtatImpayeModal onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText(/Code client/i), { target: { value: '91' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Envoyer par email' }, { timeout: 5000 }));
  const dialog = await screen.findByRole('dialog', { name: /Envoyer par email/ }, { timeout: 5000 });
  await within(dialog).findByDisplayValue('tahar@domaine.tn', {}, { timeout: 5000 });
  expect(within(dialog).getByLabelText('Message').value).toMatch(/1 quittance impayée, total 1\s008,159 TND/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Envoyer' }));
  expect(await within(dialog).findByRole('status', {}, { timeout: 5000 })).toHaveTextContent('envoyé par email à tahar@domaine.tn');
  expect(sendMemoire).toHaveBeenCalledWith('t', '91', expect.objectContaining({ canal: 'email', destinataire: 'tahar@domaine.tn', piece: 'avec' }));
}, 15000);
