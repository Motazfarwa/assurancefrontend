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

// The agency's bank accounts (TBanque), archived ones included.
export const listBanques = (token) => request('/api/banques', token);
export const createBanque = (token, values) => request('/api/banques', token, { method: 'POST', body: JSON.stringify(values) });
export const updateBanque = (token, code, values) => request(`/api/banques/${encodeURIComponent(code)}`, token, { method: 'PUT', body: JSON.stringify(values) });
export const deleteBanque = (token, code) => request(`/api/banques/${encodeURIComponent(code)}`, token, { method: 'DELETE' });

// Sends a scanned RIB / attestation / relevé bancaire (JPG, PNG or PDF) to be read.
export async function extractBanque(token, file) {
  const pdf = isPdf(file);
  const image = pdf ? await fileToBase64(file) : await toJpegBase64(file, 2200, 0.9);
  return request('/api/banques/extract', token, { method: 'POST', body: JSON.stringify({ image_base64: image, media_type: pdf ? 'application/pdf' : 'image/jpeg' }) });
}
