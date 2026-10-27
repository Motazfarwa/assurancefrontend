import { fileToBase64, isPdf, toJpegBase64 } from './ficheOcr';

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
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail) ? 'Données invalides : vérifiez les champs saisis.' : 'La requête a échoué. Réessayez.');
  }
  return body;
}

const query = (params) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null)).toString();

export const getSinistreLookups = (token) => request('/api/sinistres/lookups', token);
export const listSinistres = (token, params = {}) => request(`/api/sinistres?${query(params)}`, token);
export const getSinistre = (token, numero) => request(`/api/sinistres/${encodeURIComponent(numero)}`, token);
export const nextSinistreNumber = (token, dateSinistre) => request(`/api/sinistres/next-number?${query({ date_sinistre: dateSinistre })}`, token);
export const findClaimPolicy = (token, { numero = '', immat = '' }) => request(`/api/sinistres/police?${query({ numero, immat })}`, token);
// The client's policies, most recently created first.
export const listClientPolicies = (token, codeClient) => request(`/api/polices/client/${encodeURIComponent(codeClient)}`, token);
export const createSinistre =(token, payload) => request('/api/sinistres', token, { method: 'POST', body: JSON.stringify(payload) });
export const updateSinistre = (token, numero, payload) => request(`/api/sinistres/${encodeURIComponent(numero)}`, token, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteSinistre = (token, numero) => request(`/api/sinistres/${encodeURIComponent(numero)}`, token, { method: 'DELETE' });

// Sends a scanned constat amiable / déclaration (JPG, PNG or PDF) to be read.
export async function extractSinistre(token, file) {
  const pdf = isPdf(file);
  const image = pdf ? await fileToBase64(file) : await toJpegBase64(file, 2200, 0.9);
  return request('/api/sinistres/extract', token, { method: 'POST', body: JSON.stringify({ image_base64: image, media_type: pdf ? 'application/pdf' : 'image/jpeg' }) });
}
