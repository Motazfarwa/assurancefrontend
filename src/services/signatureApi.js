import { API_BASE_URL } from './apiBase';

// The signature of the user signed in (drawn in « Ma signature »): { image: 'data:image/png;base64,…' | null }.
async function request(path, accessToken, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}).`);
  }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'La signature n’a pas pu être lue ou enregistrée.');
  return body;
}

export const getMySignature = (accessToken) => request('/api/signature', accessToken);
export const saveMySignature = (accessToken, image) => request('/api/signature', accessToken, { method: 'PUT', body: JSON.stringify({ image }) });
export const deleteMySignature = (accessToken) => request('/api/signature', accessToken, { method: 'DELETE' });
