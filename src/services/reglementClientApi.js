import { API_BASE_URL } from './apiBase';

async function request(path, accessToken) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que le serveur est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'La requête a échoué. Réessayez.');
  return body;
}

// The client, its règlements (TRegCli, most recent first) and their totals.
export const getClientReglements = (token, code) => request(`/api/reglements-clients/client/${encodeURIComponent(code)}`, token);
// One règlement, its client and the quittances it paid (RDetRegCli).
export const getReglement = (token, numero) => request(`/api/reglements-clients/${encodeURIComponent(numero)}`, token);
