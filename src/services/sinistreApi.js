import { readAiThenOcr } from './documentReading';

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

// Suivi of a claim: its steps (TEtape_Siniste) and the calls / letters sent or received, each row keyed by its "Cmp".
export const getSinistreSuivi = (token, numero) => request(`/api/sinistres/${encodeURIComponent(numero)}/suivi`, token);
const followUp = (kind) => ({
  add: (token, numero, payload) => request(`/api/sinistres/${encodeURIComponent(numero)}/${kind}`, token, { method: 'POST', body: JSON.stringify(payload) }),
  update: (token, numero, cmp, payload) => request(`/api/sinistres/${encodeURIComponent(numero)}/${kind}/${cmp}`, token, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (token, numero, cmp) => request(`/api/sinistres/${encodeURIComponent(numero)}/${kind}/${cmp}`, token, { method: 'DELETE' }),
});
export const sinistreEtapes = followUp('etapes');
export const sinistreAppels = followUp('appels');

// Reads a scanned constat amiable / déclaration (JPG, PNG or PDF), handwritten included: the AI first, OCR in the
// browser when it is unavailable; the server finds the claim's values and recognises the agency's policy.
export const extractSinistre = (token, file, onProgress) => readAiThenOcr(file, onProgress, {
  ai: (payload) => request('/api/sinistres/extract', token, { method: 'POST', body: JSON.stringify(payload) }),
  fromText: (text) => request('/api/sinistres/extract-text', token, { method: 'POST', body: JSON.stringify({ text: text.slice(0, 300000) }) }),
  isEmpty: (result) => !Object.keys(result.sinistre || {}).length,
});
