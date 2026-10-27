import { API_BASE_URL } from './apiBase';

async function send(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Verifiez que FastAPI est demarre et que CORS autorise cette adresse.`);
  }
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : 'Une erreur est survenue. Veuillez reessayer.';
    throw new Error(detail);
  }
  return body;
}

export async function listLoginUsers(lieu = '') {
  const query = lieu ? `?lieu=${encodeURIComponent(lieu)}` : '';
  const response = await send(`${API_BASE_URL}/api/auth/users${query}`, {
    headers: { Accept: 'application/json' },
  });
  const body = await readResponse(response);
  return Array.isArray(body.items) ? body.items : [];
}

export async function loginRequest(username, password) {
  const response = await send(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return readResponse(response);
}

export async function currentUserRequest(accessToken) {
  const response = await send(`${API_BASE_URL}/api/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  return readResponse(response);
}
