import { API_BASE_URL } from './apiBase';

async function request(accessToken, path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/access${path}`, {
      ...options,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}). Vérifiez que le serveur FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Une erreur est survenue. Veuillez réessayer.');
  return body;
}

// Modules the signed-in user may open: a list of module numbers, or null for every module.
export const getMyModules = async (accessToken) => (await request(accessToken, '/me')).modules ?? null;
// Users limited by the administrator: [{ username, modules }] (a user not listed sees every module).
export const listAccess = (accessToken) => request(accessToken, '/users');
export const saveAccess = (accessToken, username, modules) =>
  request(accessToken, `/users/${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify({ modules }) });
