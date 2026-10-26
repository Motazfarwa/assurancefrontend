import { fileToBase64, isPdf, toJpegBase64 } from './ficheOcr';

const API_BASE_URL = (process.env.REACT_APP_API_URL || 'https://assurancebackend.onrender.com').replace(/\/$/, '');

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

export const listBanks = (token) => request('/api/cheques/banques', token);
export const getClientOverview = (token, code, excludeNump = '') => request(`/api/cheques/client/${encodeURIComponent(code)}?${query({ exclude_nump: excludeNump })}`, token);
export const getPiece = (token, code, nump) => request(`/api/cheques/piece?${query({ code_client: code, nump })}`, token);
export const listPieces = (token, params) => request(`/api/cheques?${query(params)}`, token);
export const createPiece = (token, payload) => request('/api/cheques', token, { method: 'POST', body: JSON.stringify(payload) });
export const updatePiece = (token, nump, payload) => request(`/api/cheques/${encodeURIComponent(nump)}`, token, { method: 'PUT', body: JSON.stringify(payload) });
export const deletePiece = (token, nump, code) => request(`/api/cheques/${encodeURIComponent(nump)}?${query({ code_client: code })}`, token, { method: 'DELETE' });

// Sends a photographed / scanned cheque (JPG, PNG or PDF) to be read.
export async function extractCheque(token, file) {
  const pdf = isPdf(file);
  const image = pdf ? await fileToBase64(file) : await toJpegBase64(file);
  return request('/api/cheques/extract', token, { method: 'POST', body: JSON.stringify({ image_base64: image, media_type: pdf ? 'application/pdf' : 'image/jpeg' }) });
}
