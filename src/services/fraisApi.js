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

// Frais généraux of the agency (TDepense of nature D or F, administrateur only): options of the form, list and entry.
export const getFraisOptions = (token) => request('/api/frais-generaux/options', token);
export const listFrais = (token, params) => request(`/api/frais-generaux?${new URLSearchParams(params)}`, token);
export const createFrais = (token, values) => request('/api/frais-generaux', token, { method: 'POST', body: JSON.stringify(values) });
