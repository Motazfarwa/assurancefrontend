import { render, screen } from '@testing-library/react';
import EtatTermeModal, { TermeSheet } from './EtatTerme';
import { listCompanies } from '../../services/companyApi';
import { getTermStatement } from '../../services/journalApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 'token' }) }));
jest.mock('../../services/companyApi', () => ({ isBordereauCompany: () => true, listCompanies: jest.fn() }));
jest.mock('../../services/journalApi', () => ({ getTermStatement: jest.fn() }));
jest.mock('../NewWindow/NewWindow', () => ({ __esModule: true, default: () => null, openReportWindow: jest.fn() }));

const line = (num_police, annee_naissance, nom_branche, echeance = '01/12') => ({ num_police, code_client: '1', nom_client: 'CLIENT', echeance, unite: 'A', duree: 1, etat: 'AN', temporaire: false, annee_naissance, nom_branche });
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

test('groups by branche name, policies without one last, and marks only CHAMEL ages ending in 0 or 5', async () => {
  setToday(2026, 10);
  getTermStatement.mockResolvedValue({ items: [
    line('P1', 1981, null), // 45, no branche
    line('P2', 1981, 'INCENDIE'), // 45, not CHAMEL
    line('P3', 2006, 'CHAMEL'), // 20
    line('P4', 1983, 'CHAMEL'), // 43
    line('P5', null, 'CHAMEL'), // no birth date
    line('P6', 1981, 'CHAMEL', '01/09'), // 45, but due in September: listed for its months
  ] });
  render(<TermeSheet params={{ mois: 12 }} month="Décembre" companyName="MAGHREBIA" onClose={() => {}} />);
  await screen.findByText('P1');

  const headings = [...document.querySelectorAll('.jrn-terme-branch')].map((row) => row.textContent);
  expect(headings).toEqual(['CHAMEL · 4 polices', 'INCENDIE · 1 police', 'Branche non renseignée · 1 police']);
  const isRed = (police) => screen.getByText(police).closest('tr').classList.contains('is-round-age');
  expect(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(isRed)).toEqual([false, false, true, false, false, false]);
});
