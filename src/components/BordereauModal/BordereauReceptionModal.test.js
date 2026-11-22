import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BordereauReceptionModal from './BordereauReceptionModal';
import { getBordereauClients, listBordereaux, listQuittances, updateQuittanceLine } from '../../services/bordereauApi';
import { listCompanies } from '../../services/companyApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('../../services/companyApi', () => ({
  listCompanies: jest.fn(), isBordereauCompany: () => true, isTermeCompany: () => true,
}));
jest.mock('../../services/bordereauParser', () => ({ ...jest.requireActual('../../services/bordereauParser'), readBordereauFile: jest.fn() }));
jest.mock('../../services/bordereauApi', () => ({
  ...jest.requireActual('../../services/bordereauApi'),
  listQuittances: jest.fn(),
  listBordereaux: jest.fn(),
  getBordereauClients: jest.fn(),
  updateQuittanceLine: jest.fn(),
}));

const QUITTANCES = [
  { num_police: '045200700082', code_client: '1272', nom_client: 'MANUTENTION SYSTEM', echeance: '2026-01-19', num_quittance: '630363', prime_net: 27.072, commission: 4.737, prime_total: 31.696 },
  { num_police: '043202602120', code_client: '4034', nom_client: 'CRK MAROQUINERIE', echeance: '2026-04-21', num_quittance: '0401503', prime_net: 74.05, commission: 12.958, prime_total: 81.493 },
];

beforeEach(() => {
  listCompanies.mockResolvedValue([{ code_compagnie: 1, nom_compagnie: 'GAT' }]);
  listBordereaux.mockResolvedValue([]);
  getBordereauClients.mockResolvedValue({});
  listQuittances.mockResolvedValue(QUITTANCES);
});

test('comptant: the lines are filtered by code or name of the client', async () => {
  render(<BordereauReceptionModal tc="C" onClose={() => {}} />);
  expect(await screen.findByText('MANUTENTION SYSTEM')).toBeInTheDocument();
  const search = screen.getByPlaceholderText('Code ou nom du client');
  fireEvent.change(search, { target: { value: 'crk' } });
  expect(screen.queryByText('MANUTENTION SYSTEM')).not.toBeInTheDocument();
  expect(screen.getByText('CRK MAROQUINERIE')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: '1272' } });
  expect(screen.getByText('MANUTENTION SYSTEM')).toBeInTheDocument();
  expect(screen.queryByText('CRK MAROQUINERIE')).not.toBeInTheDocument();
});

test('comptant: the N° quittance and the Prime Total are corrected in the grid', async () => {
  updateQuittanceLine
    .mockResolvedValueOnce({ num_quittance: '630399', prime_total: 31.696, solde_quittance: 31.696 })
    .mockResolvedValueOnce({ num_quittance: '0401503', prime_total: 90, solde_quittance: 90 });
  render(<BordereauReceptionModal tc="C" onClose={() => {}} />);
  const number = await screen.findByLabelText('N° Quit. 630363');
  fireEvent.change(number, { target: { value: '630399' } });
  fireEvent.blur(number);
  await waitFor(() => expect(updateQuittanceLine).toHaveBeenCalledTimes(1));
  expect(updateQuittanceLine).toHaveBeenCalledWith('t', { num_quittance: '630363', num_int: '045200700082', nouveau_numero: '630399' });
  expect(await screen.findByLabelText('N° Quit. 630399')).toHaveValue('630399');

  const prime = screen.getByLabelText('Prime Total 0401503');
  fireEvent.change(prime, { target: { value: '90' } });
  fireEvent.keyDown(prime, { key: 'Enter' });
  fireEvent.blur(prime);
  await waitFor(() => expect(updateQuittanceLine).toHaveBeenCalledWith('t', { num_quittance: '0401503', num_int: '043202602120', prime_total: 90 }));
  expect(updateQuittanceLine).toHaveBeenCalledTimes(2);
});

test('terme: the Prime Total of a line of the file is corrected in the grid and the Solde follows', async () => {
  const { readBordereauFile } = jest.requireMock('../../services/bordereauParser');
  readBordereauFile.mockResolvedValue({
    meta: {}, headers: ['police', 'nom', 'prime'], headerRow: 0, mapping: { num_police: 0, nom_client: 1, prime_total: 2 },
    rows: [['police', 'nom', 'prime'], ['B09650', 'NICOLA CASTELLITTO', 100], ['A74723', 'WE WISH AGENCY', 50]],
  });
  render(<BordereauReceptionModal tc="T" onClose={() => {}} />);
  const files = [new File(['a'], 'terme-1.xlsx'), new File(['b'], 'terme-2.xlsx')];
  fireEvent.change(screen.getByLabelText('Fichiers du siège'), { target: { files } });
  expect(await screen.findByText(/4 ligne\(s\) lues dans 2 fichiers/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confrontation' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ajouter une nouvelle ligne' })).toBeInTheDocument();
  const prime = screen.getAllByLabelText('Prime Total B09650')[0];
  // the file imported: the Total is the file's (100 + 50, twice) and the Solde 0
  expect(screen.getByLabelText('Total')).toHaveValue('300,000');
  expect(screen.getByLabelText('Solde')).toHaveValue('0,000');
  fireEvent.change(prime, { target: { value: '120' } });
  fireEvent.blur(prime);
  // the lines now 320 for a Total of 300: Solde -20
  await waitFor(() => expect(screen.getByLabelText('Solde')).toHaveValue((-20).toLocaleString('fr-TN', { minimumFractionDigits: 3 })));
  expect(screen.getByLabelText('Total')).toHaveValue('300,000');
});

test('terme entered by hand: the Total is typed at the top and each line takes its Prime Total off the Solde', async () => {
  getBordereauClients.mockResolvedValue({ 1777: { num_int: '001777', code_client: '2316', nom_client: 'BEN AMOR INSAF' } });
  render(<BordereauReceptionModal tc="T" onClose={() => {}} />);
  const totalBox = screen.getByLabelText('Total');
  fireEvent.focus(totalBox);
  fireEvent.change(totalBox, { target: { value: '10000' } });
  fireEvent.blur(totalBox);
  expect(screen.getByLabelText('Solde')).toHaveValue((10000).toLocaleString('fr-TN', { minimumFractionDigits: 3 }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter une nouvelle ligne' }));
  fireEvent.change(screen.getByLabelText('N° Police (num_int)'), { target: { value: '1777' } });
  fireEvent.change(screen.getByLabelText('Prime Total'), { target: { value: '5600' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter la ligne (Entrée)' }));
  // 10 000 - 5 600, as the legacy
  expect(screen.getByLabelText('Solde')).toHaveValue((4400).toLocaleString('fr-TN', { minimumFractionDigits: 3 }));
  expect(screen.getByLabelText('Total')).toHaveValue((10000).toLocaleString('fr-TN', { minimumFractionDigits: 3 }));
  // the Solde typed: the Total follows
  const soldeBox = screen.getByLabelText('Solde');
  fireEvent.focus(soldeBox);
  fireEvent.change(soldeBox, { target: { value: '400' } });
  fireEvent.blur(soldeBox);
  expect(screen.getByLabelText('Total')).toHaveValue((6000).toLocaleString('fr-TN', { minimumFractionDigits: 3 }));
});

test('terme, several files: each is read with its own columns and shown one at a time (Suivant), or all together', async () => {
  const { readBordereauFile } = jest.requireMock('../../services/bordereauParser');
  readBordereauFile
    .mockResolvedValueOnce({
      meta: {}, headers: ['Num. police', 'Souscripteur', 'Prime brut'], headerRow: 0, mapping: { num_police: 0, nom_client: 1, prime_total: 2 },
      rows: [['Num. police', 'Souscripteur', 'Prime brut'], ['94402000088', 'STE J S AUTO PAINT', 2377.839], ['94402000087', 'BOUHNAK SOFIEN', 375.39]],
    })
    .mockResolvedValueOnce({
      meta: {}, headers: ['Date', 'Prime brut', 'Description souscripteur', 'Num. police'], headerRow: 0, mapping: { prime_total: 1, nom_client: 2, num_police: 3 },
      rows: [['Date', 'Prime brut', 'Description souscripteur', 'Num. police'], ['16/12/2026', 283, 'SOCIETE CHARTEL', '944450056']],
    });
  render(<BordereauReceptionModal tc="T" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Fichiers du siège'), { target: { files: [new File(['a'], 'T12-2026 LLOYD.xlsx'), new File(['b'], 'T 12-2026 LLOYD IRDS.xlsx')] } });
  expect(await screen.findByText('Fichier 1 / 2 : T12-2026 LLOYD.xlsx')).toBeInTheDocument();
  expect(screen.getByText('STE J S AUTO PAINT')).toBeInTheDocument();
  expect(screen.queryByText('SOCIETE CHARTEL')).not.toBeInTheDocument();
  expect(screen.getByText(/2 ligne\(s\) · Total 2 753,229/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Suivant ›' }));
  expect(screen.getByText('Fichier 2 / 2 : T 12-2026 LLOYD IRDS.xlsx')).toBeInTheDocument();
  expect(screen.getByText('SOCIETE CHARTEL')).toBeInTheDocument();
  expect(screen.queryByText('STE J S AUTO PAINT')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tous les fichiers' }));
  expect(screen.getByText('STE J S AUTO PAINT')).toBeInTheDocument();
  expect(screen.getByText('SOCIETE CHARTEL')).toBeInTheDocument();
  // the bordereau total is the one of both files
  expect(screen.getByLabelText('Total')).toHaveValue((3036.229).toLocaleString('fr-TN', { minimumFractionDigits: 3 }));
  expect(screen.getByLabelText('Solde')).toHaveValue('0,000');
});

test('terme: a police whose zeros the file dropped (1777) is shown as ours (001777), with the name of our client file', async () => {
  const { readBordereauFile } = jest.requireMock('../../services/bordereauParser');
  readBordereauFile.mockResolvedValue({
    meta: {}, headers: ['police', 'nom', 'prime'], headerRow: 0, mapping: { num_police: 0, nom_client: 1, prime_total: 2 },
    rows: [['police', 'nom', 'prime'], [1777, 'BEN AMOR EP KANOUN INSAF', 100]],
  });
  getBordereauClients.mockResolvedValue({ 1777: { num_int: '001777', code_client: '2316', nom_client: 'BEN AMOR INSAF' } });
  render(<BordereauReceptionModal tc="T" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Fichiers du siège'), { target: { files: [new File(['a'], 'terme.xlsx')] } });
  expect(await screen.findByText('BEN AMOR INSAF')).toBeInTheDocument();
  expect(screen.getByText('001777')).toBeInTheDocument();
  expect(screen.getByText('2316')).toBeInTheDocument();
  expect(screen.queryByText('BEN AMOR EP KANOUN INSAF')).not.toBeInTheDocument();
  expect(getBordereauClients).toHaveBeenCalledWith('t', ['1777']);
});

test('terme entered by hand: the P.Net+C.Q. typed is the Prime Total of the line (unless one is typed) and comes off the Solde', async () => {
  getBordereauClients.mockResolvedValue({ 1777: { num_int: '001777', code_client: '2316', nom_client: 'BEN AMOR INSAF' } });
  render(<BordereauReceptionModal tc="T" onClose={() => {}} />);
  const totalBox = screen.getByLabelText('Total');
  fireEvent.focus(totalBox);
  fireEvent.change(totalBox, { target: { value: '100000' } });
  fireEvent.blur(totalBox);
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter une nouvelle ligne' }));
  fireEvent.change(screen.getByLabelText('N° Police (num_int)'), { target: { value: '1777' } });
  fireEvent.change(screen.getByLabelText('P.Net+C.Q.'), { target: { value: '145200' } });
  expect(screen.getByLabelText('Prime Total')).toHaveValue(145200);
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter la ligne (Entrée)' }));
  expect(screen.getByLabelText('Solde')).toHaveValue((-45200).toLocaleString('fr-TN', { minimumFractionDigits: 3 }));
  // a Prime Total of its own is kept
  fireEvent.change(screen.getByLabelText('P.Net+C.Q.'), { target: { value: '5000' } });
  fireEvent.change(screen.getByLabelText('Prime Total'), { target: { value: '5600' } });
  fireEvent.change(screen.getByLabelText('P.Net+C.Q.'), { target: { value: '5001' } });
  expect(screen.getByLabelText('Prime Total')).toHaveValue(5600);
});
