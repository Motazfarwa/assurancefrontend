import { render, screen } from '@testing-library/react';
import EtatTermeModal, { TermeSheet } from './EtatTerme';
import { listCompanies } from '../../services/companyApi';
import { getTermStatement } from '../../services/journalApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 'token' }) }));
jest.mock('../../services/companyApi', () => ({ isBordereauCompany: () => true, listCompanies: jest.fn() }));
jest.mock('../../services/journalApi', () => ({ getTermStatement: jest.fn() }));
jest.mock('../NewWindow/NewWindow', () => ({ __esModule: true, default: () => null, openReportWindow: jest.fn() }));

const line = (num_police, annee_naissance, nom_branche, code_branche) => ({ num_police, code_client: '1', nom_client: 'CLIENT', echeance: '01/12', unite: 'A', duree: 1, etat: 'AN', temporaire: false, annee_naissance, nom_branche, code_branche });
const RealDate = Date;
function setToday(year, month) {
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [year, month, 7])); }
  };
}

beforeEach(() => listCompanies.mockResolvedValue([])); // CRA resets mocks before each test
afterEach(() => { global.Date = RealDate; });

test.each([[10, '12'], [11, '1']])('from month index %i it opens on month %s', async (today, expected) => {
  setToday(2026, today);
  render(<EtatTermeModal moduleId="547" onClose={() => {}} />);
  expect(screen.getByLabelText('Mois').value).toBe(expected);
  await screen.findByText('Aperçu');
});

test('groups by branche, policies without one last, and marks ages ending in 0 or 5', async () => {
  setToday(2026, 10);
  getTermStatement.mockResolvedValue({ items: [
    line('P1', null, null, null),
    line('P2', 1981, 'INCENDIE', '10'), // 45
    line('P3', 2006, 'AUTO', '20'), // 20
    line('P4', 1983, 'AUTO', '20'), // 43
    line('P5', 2026, null, '252'), // 0: not a real age
  ] });
  render(<TermeSheet params={{}} month="Décembre" companyName="MAGHREBIA" onClose={() => {}} />);
  await screen.findByText('P1');

  const headings = [...document.querySelectorAll('.jrn-terme-branch')].map((row) => row.textContent);
  expect(headings).toEqual(['AUTO · 2 polices', 'Branche 252 · 1 police', 'INCENDIE · 1 police', 'Branche non renseignée · 1 police']);
  const isRed = (police) => screen.getByText(police).closest('tr').classList.contains('is-round-age');
  expect(['P1', 'P2', 'P3', 'P4', 'P5'].map(isRed)).toEqual([false, true, true, false, false]);
});
