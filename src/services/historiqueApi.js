import { API_BASE_URL } from './apiBase';

async function request(accessToken, path) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/historique${path}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}). Vérifiez que le serveur FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Une erreur est survenue. Veuillez réessayer.');
  return body;
}

// History of the users' actions (TMouchard): { total, items: [{ n, utilisateur, mvt, date, heure, design, code }] }.
export const listHistory = (accessToken, filters) => {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null)).toString();
  return request(accessToken, `?${query}`);
};
export const listHistoryUsers = (accessToken) => request(accessToken, '/utilisateurs');
