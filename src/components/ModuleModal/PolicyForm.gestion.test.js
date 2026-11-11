import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import PolicyForm from './PolicyForm';

let mockAdmin = true;
jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ accessToken: 't', user: { name: 'x', isAdmin: mockAdmin } }) }));
const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const polices = [
  { num_int: 'A1', num_police: '053202535665', nom_compagnie: 'GAT', code_compagnie: 9, nom_branche: 'MRP', etat: 'AN', effet: '2025-11-01', expiration: null },
  { num_int: 'B1', num_police: '074202336918', nom_compagnie: 'GAT', code_compagnie: 9, nom_branche: 'ASSISTANCE VOYAGE', etat: 'AN', effet: '2023-03-03', expiration: '2024-03-01T00:00:00' },
  { num_int: 'C1', num_police: '6320200013', nom_compagnie: 'CARTE', code_compagnie: 3, nom_branche: 'EPARGNE', etat: 'SS', effet: '2020-02-01', expiration: null },
  { num_int: 'D1', num_police: '011202324153', nom_compagnie: 'GAT', code_compagnie: 9, nom_branche: 'AUTO PARTICULIER', etat: 'AN', effet: '2023-06-08', expiration: '2099-06-08T00:00:00' },
];
const detail = (num) => {
  const item = polices.find((row) => row.num_police === num) || polices[0];
  return { police: { num_police: num, num_int: item.num_int, code_client: '2973', code_compagnie: item.code_compagnie, effet: `${item.effet}T00:00:00`, expiration: item.expiration, echeance: '01/11', duree: 12, etat: item.etat, risque: 'MRP RUE ALI', obser: '' }, quittances: [], nom_branche: item.nom_branche, nom_client: 'JEMMALI WALID', matches: 1 };
};
let puts;

beforeEach(() => {
  mockAdmin = true;
  puts = [];
  global.fetch = (url, options = {}) => {
    const u = String(url);
    if (options.method === 'PUT') { puts.push({ url: u, body: JSON.parse(options.body), headers: options.headers }); return ok({ num_int: 'A1' }); }
    if (u.includes('/api/polices/compagnies')) return ok([{ code_compagnie: 9, nom_compagnie: 'GAT', nbr_chiffre_code: 3 }, { code_compagnie: 3, nom_compagnie: 'CARTE', nbr_chiffre_code: 2 }]);
    if (u.includes('/api/polices/client/')) return ok(polices);
    if (u.includes('/api/polices/numero-branche')) return ok({ candidates: [] });
    if (u.includes('/api/polices/detail')) return ok(detail(new URL(u).searchParams.get('num_police')));
    if (u.includes('/api/clients/')) return ok({ nom_client: 'JEMMALI WALID', items: [] });
    return ok({});
  };
});

const openClient = async () => {
  render(<div className="policy-modal-expanded"><PolicyForm initialClient="2973" /></div>);
  const select = await screen.findByRole('combobox', { name: 'N° Police' });
  await waitFor(() => expect(select.value).toBe('053202535665'));
  return select;
};

test('Gestion des polices offers only the polices in force, the others on demand', async () => {
  const select = await openClient();
  const offered = () => within(select).getAllByRole('option').map((option) => option.value).filter(Boolean);
  expect(offered()).toEqual(['053202535665', '011202324153']);
  expect(screen.getByText(/2 en vigueur sur 4/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'voir toutes' }));
  expect(offered()).toEqual(['053202535665', '074202336918', '6320200013', '011202324153']);
  fireEvent.click(screen.getByRole('button', { name: 'en vigueur seulement' }));
  expect(offered()).toHaveLength(2);
});

test('the police is locked until "Modifier"; "Enregistrer" stores only what changed', async () => {
  await openClient();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument());
  const risque = screen.getByDisplayValue('MRP RUE ALI');
  expect(risque.closest('fieldset')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
  expect(risque.closest('fieldset')).not.toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'N° Police' })).toBeDisabled();
  fireEvent.change(risque, { target: { value: 'MRP RUE ALI BALHAOUANE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0].url).toMatch(/\/api\/polices\/A1$/);
  expect(puts[0].body).toEqual({ risque: 'MRP RUE ALI BALHAOUANE' });
  expect(await screen.findByText('Police 053202535665 modifiée.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
});

test('"Annuler" puts the police back as it was', async () => {
  await openClient();
  fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
  fireEvent.change(screen.getByDisplayValue('MRP RUE ALI'), { target: { value: 'autre' } });
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(screen.getByDisplayValue('MRP RUE ALI')).toBeInTheDocument();
  expect(puts).toHaveLength(0);
});

test('an employee sees the police without the "Modifier" button', async () => {
  mockAdmin = false;
  await openClient();
  await screen.findByDisplayValue('MRP RUE ALI');
  expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
});
