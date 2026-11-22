import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ControleTablesModal from './ControleTablesModal';
import { listTables, scanTable } from '../../services/controleTablesApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('../../services/controleTablesApi', () => ({ listTables: jest.fn(), scanTable: jest.fn() }));

const TABLES = [
  { table: 'TBranche', lignes_estimees: 224, colonnes: ['code_compagnie', 'code_branche', 'nom_branche'], cle: ['code_compagnie', 'code_branche'] },
  { table: 'TClient', lignes_estimees: 5070, colonnes: ['code_client', 'nom_client', 'tel'], cle: ['code_client'] },
];
const clean = (table, lignes) => ({ table, lignes, colonnes: [], cle: [], doublons_exacts: { groupes: 0, lignes_en_trop: 0 }, doublons_cle: { groupes: 0, lignes: 0 }, cles_vides: 0 });
const CLIENT = {
  table: 'TClient', lignes: 5071, colonnes: ['code_client', 'nom_client', 'tel'], cle: ['code_client'],
  doublons_exacts: { groupes: 1, lignes_en_trop: 1 }, doublons_cle: { groupes: 1, lignes: 2 }, cles_vides: 0, limite: 200,
  exacts: [{ fois: 2, ctids: ['(1,1)', '(1,2)'], valeurs: { code_client: '9001', nom_client: 'CLIENT A', tel: '1' } }],
  groupes: [{
    cle: { code_client: '9002' }, nombre: 2, verdict: 'incomplete', colonnes_differentes: ['tel'],
    lignes: [
      { ctid: '(2,1)', etat: 'complete', remplies: 3, valeurs: { code_client: '9002', nom_client: 'CLIENT B', tel: '2' } },
      { ctid: '(2,2)', etat: 'incomplete', remplies: 2, valeurs: { code_client: '9002', nom_client: 'CLIENT B', tel: null } },
    ],
  }],
  vides: [],
};

beforeEach(() => {
  listTables.mockResolvedValue({ items: TABLES });
  scanTable.mockImplementation((token, table) => Promise.resolve(table === 'TClient' ? CLIENT : clean(table, 224)));
});

test('a table chosen is analysed on its key: the incomplete copy and the rows entered twice are shown', async () => {
  render(<ControleTablesModal moduleId="760" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /TClient/ }));
  expect(await screen.findByText('code_client = 9002')).toBeInTheDocument();
  expect(scanTable).toHaveBeenCalledWith('t', 'TClient', { cles: ['code_client'] });
  expect(screen.getByText('Une copie incomplète')).toBeInTheDocument();
  expect(screen.getByText('Incomplète')).toBeInTheDocument();
  expect(screen.getByText('Lignes identiques en double (1)')).toBeInTheDocument();
  // another key chosen: analysed again on it
  fireEvent.click(screen.getByRole('checkbox', { name: 'nom_client' }));
  fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
  await waitFor(() => expect(scanTable).toHaveBeenLastCalledWith('t', 'TClient', { cles: ['code_client', 'nom_client'] }));
});

test('« Analyser toutes les tables » scans each one and keeps those with anomalies', async () => {
  render(<ControleTablesModal moduleId="760" onClose={() => {}} />);
  await screen.findByRole('button', { name: /TBranche/ });
  fireEvent.click(screen.getByRole('button', { name: 'Analyser toutes les tables' }));
  expect(await screen.findByText(/2 tables analysées · 1 table avec anomalies/)).toBeInTheDocument();
  expect(scanTable).toHaveBeenCalledWith('t', 'TBranche', { resume: true });
  expect(screen.queryByRole('button', { name: /TBranche/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /TClient/ })).toBeInTheDocument();
});
