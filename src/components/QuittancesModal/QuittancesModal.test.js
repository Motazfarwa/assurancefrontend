import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuittancesModal, { nextFilters } from './QuittancesModal';
import { searchRecords } from '../../services/clientRecordsApi';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'Admin', isAdmin: true } }) }));
jest.mock('../../services/clientRecordsApi', () => ({ searchRecords: jest.fn(), updateClientRecord: jest.fn() }));
jest.mock('../../services/companyApi', () => ({ listCompanies: () => Promise.resolve([]), isBordereauCompany: () => true }));

const month = { date_min: '2026-11-01', date_max: '2026-11-30' };
const start = { num_quittance: '', num_police: '', code_client: '', nom_client: '', date_saisie: '', code_compagnie: '', reglement: 'tous', ...month };

test('a number, a client or a date de saisie is searched whatever the échéance, and the month comes back after', () => {
  const typed = nextFilters(start, 'num_quittance', '20260501052700', month);
  expect(typed).toMatchObject({ num_quittance: '20260501052700', date_min: '', date_max: '', autoDates: true });
  const more = nextFilters(typed, 'code_client', '5007', month);
  expect(more).toMatchObject({ date_min: '', date_max: '' });
  const cleared = nextFilters(nextFilters(more, 'code_client', '', month), 'num_quittance', '', month);
  expect(cleared).toMatchObject({ ...month, autoDates: false });
});

test('échéance dates chosen by the user are kept with the other criteria', () => {
  const chosen = nextFilters(start, 'date_min', '2026-05-01', month);
  const typed = nextFilters(chosen, 'nom_client', 'BEN', month);
  expect(typed).toMatchObject({ nom_client: 'BEN', date_min: '2026-05-01', date_max: '2026-11-30' });
  expect(nextFilters(typed, 'nom_client', '', month)).toMatchObject({ date_min: '2026-05-01' });
});

test('the company and the règlement keep the échéance of the month', () => {
  expect(nextFilters(start, 'code_compagnie', '4', month)).toMatchObject({ code_compagnie: '4', ...month });
});

test('only the answer of the last search is shown', async () => {
  let answerFirst;
  searchRecords
    .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }))
    .mockImplementation((token, kind, filters) => Promise.resolve(filters.num_quittance
      ? [{ num_quittance: filters.num_quittance, num_police: 'P1', code_client: '5007', nom_client: 'X', echeance: '2026-05-13' }] : []));
  render(<QuittancesModal moduleId="120" onClose={() => {}} />);
  await waitFor(() => expect(searchRecords).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByPlaceholderText('Ex : 2026…'), { target: { value: '20260501052700' } });
  await waitFor(() => expect(searchRecords).toHaveBeenCalledTimes(2));
  expect(searchRecords.mock.calls[1][2]).toMatchObject({ num_quittance: '20260501052700', date_min: '', date_max: '' });
  expect(searchRecords.mock.calls[1][2]).not.toHaveProperty('autoDates');
  expect(await screen.findByText('20260501052700')).toBeInTheDocument();
  await act(async () => { answerFirst([{ num_quittance: 'OLD', num_police: 'P0' }]); });
  expect(screen.queryByText('OLD')).toBeNull();
  expect(screen.getByText('20260501052700')).toBeInTheDocument();
});
