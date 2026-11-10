import { API_BASE_URL } from './apiBase';

async function request(accessToken, path, method = 'GET') {
  const response = await fetch(`${API_BASE_URL}/api/notifications${path}`, { method, headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Notifications indisponibles.');
  return body;
}

// The latest actions: every user's for the administrator, one's own otherwise. { unread, items: [{ n, utilisateur, mvt, design, date, heure, unread }] }.
export const listNotifications = (accessToken, limit = 30) => request(accessToken, `?limit=${limit}`);
// Administrator: the clients to complete. { total, coordonnees, sans_police, polices, items: [{ code_client, nom_client, manques }] }.
export const listIncompleteClients = (accessToken, search = '') => request(accessToken, `/clients-incomplets${search ? `?q=${encodeURIComponent(search)}` : ''}`);
export const markNotificationsRead = (accessToken) => request(accessToken, '/lu', 'PUT');
// Module "Clients à compléter" (administrator): { categorie, q, offset, limit } -> the same body, with each client's details.
export const listIncompleteClientsPage = (accessToken, params) => request(accessToken, `/clients-incomplets?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null))}`);
