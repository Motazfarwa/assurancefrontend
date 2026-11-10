import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PolicyForm from './PolicyForm';

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'x', isAdmin: true } }) }));
const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const polices = [
  { num_int: 'A', num_police: '011202651268', nom_compagnie: 'GAT', code_compagnie: 9, nom_branche: null, risque: 'MINI VOL+INC', etat: 'AN', effet: '2026-10-10' },
  { num_int: 'B', num_police: '074202647091', nom_compagnie: 'GAT', code_compagnie: 9, nom_branche: 'ASSISTANCE VOYAGE', etat: 'AN', effet: '2026-09-01' },
];
const detail = (num) => ({ police: { num_police: num, num_int: num, code_client: '5059', code_compagnie: 9, code_branche: null, effet: '2026-10-10T00:00:00', expiration: '2027-10-10T00:00:00', echeance: '10/10', etat: 'AN', risque: 'MINI VOL+INC 36500' }, quittances: [], nom_branche: null, nom_client: 'JABNOUNI NADIA', matches: 1 });

beforeEach(() => {
  global.fetch = (url) => {
    const u = String(url);
    if (u.includes('/api/polices/compagnies')) return ok([{ code_compagnie: 9, nom_compagnie: 'GAT', nbr_chiffre_code: 3 }, { code_compagnie: 14, nom_compagnie: 'BH ASSURANCES', nbr_chiffre_code: 3 }]);
    if (u.includes('/api/polices/client/')) return ok(polices);
    if (u.includes('/api/polices/numero-branche')) return ok({ candidates: u.includes('074') ? [{ code_compagnie: 9, nom_compagnie: 'GAT', code_branche: '074', nom_branche: 'ASSISTANCE VOYAGE', taux_comm: 0.1, forme: 'ancienne' }] : [{ code_compagnie: 9, nom_compagnie: 'GAT', code_branche: '011', nom_branche: 'AUTO PARTICULIER', taux_comm: 0.09, forme: 'ancienne' }] });
    if (u.includes('/api/polices/detail')) return ok(detail(new URL(u).searchParams.get('num_police') || '011202651268'));
    if (u.includes('/api/clients/')) return ok({ nom_client: 'JABNOUNI NADIA', items: [] });
    return ok({});
  };
});

test('client with several polices: a list in N° police, the branch read from the number', async () => {
  const { container } = render(<div className="policy-modal-expanded"><PolicyForm clientCode="5059" clientName="JABNOUNI NADIA" /></div>);
  const select = await screen.findByRole('combobox', { name: 'N° Police' });
  await waitFor(() => expect(select.value).toBe('011202651268'));
  await waitFor(() => expect(screen.getByDisplayValue('AUTO PARTICULIER')).toBeInTheDocument());
  expect(screen.queryByText(/Code branche/)).not.toBeInTheDocument();
  expect(screen.getByText(/2 polices pour ce client/)).toBeInTheDocument();
  fireEvent.change(select, { target: { value: '__nouvelle__' } });
  const input = await screen.findByRole('textbox', { name: 'N° Police' });
  expect(input.value).toBe('');
  expect(screen.getByRole('button', { name: '← Polices du client' })).toBeInTheDocument();
});
