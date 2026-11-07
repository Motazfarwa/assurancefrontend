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
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : 'La requête a échoué. Réessayez.');
  }
  return body;
}

// Recodification de client (administrator): the police(s) of a number, with their quittances not yet comptabilisées.
export const findPolice = (token, numero) => request(`/api/reconciliation/police?${new URLSearchParams({ numero })}`, token);
export const findClient = (token, code) => request(`/api/reconciliation/client/${encodeURIComponent(code)}`, token);
// The police goes to the new client with the chosen quittances.
export const changePoliceClient = (token, payload) => request('/api/reconciliation/police/client', token, { method: 'PUT', body: JSON.stringify(payload) });
// kind: police | quittance | attestation; replaces the old number by the new one everywhere it is used.
export const renameNumber = (token, kind, ancien, nouveau) => request(`/api/reconciliation/numero/${kind}`, token, { method: 'PUT', body: JSON.stringify({ ancien, nouveau }) });
