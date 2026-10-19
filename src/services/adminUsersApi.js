const API_BASE_URL = (process.env.REACT_APP_API_URL || 'https://assurancebackend.onrender.com').replace(/\/$/, '');

async function request(accessToken, path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/admin/users${path}`, {
      ...options,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}). Vérifiez que le serveur FastAPI est démarré.`);
  }
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Une erreur est survenue. Veuillez réessayer.');
  return body;
}

export async function listUsers(accessToken) {
  const body = await request(accessToken, '');
  return Array.isArray(body.items) ? body.items : [];
}

export const createUser = (accessToken, { username, password, lieu, codeDepot }) =>
  request(accessToken, '', { method: 'POST', body: JSON.stringify({ username, password, lieu: lieu || null, code_depot: codeDepot || '01' }) });

export const updateUser = (accessToken, username, changes) =>
  request(accessToken, `/${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify(changes) });

export const deleteUser = (accessToken, username) =>
  request(accessToken, `/${encodeURIComponent(username)}`, { method: 'DELETE' });
