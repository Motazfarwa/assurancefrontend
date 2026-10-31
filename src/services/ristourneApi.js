import { API_BASE_URL } from './apiBase';

async function request(path, accessToken, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que le serveur est démarré.`);
  }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : 'La requête a échoué. Réessayez.');
  }
  return body;
}

const path = (number) => `/api/ristournes/${encodeURIComponent(String(number).trim())}`;

// Ristournes (TQuittance of type R): search, one ristourne, the policy it is entered on, and its changes.
export const searchRistournes = (token, q = '') => request(`/api/ristournes?${new URLSearchParams({ q })}`, token);
export const getRistourne = (token, number) => request(path(number), token);
export const getRistournePolicy = (token, police) => request(`/api/ristournes/police/${encodeURIComponent(String(police).trim())}`, token);
export const createRistourne = (token, values) => request('/api/ristournes', token, { method: 'POST', body: JSON.stringify(values) });
export const updateRistourne = (token, number, values) => request(path(number), token, { method: 'PUT', body: JSON.stringify(values) });
export const deleteRistourne = (token, number) => request(path(number), token, { method: 'DELETE' });
