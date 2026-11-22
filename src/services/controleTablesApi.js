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

// Contrôle des tables (administrateur, lecture seule): the tables of the database and the anomalies of one.
export const listTables = (token) => request('/api/controle-tables', token);
export const scanTable = (token, table, { cles, resume } = {}) => request(`/api/controle-tables/scan?${new URLSearchParams({
  table, ...(cles ? { cles: cles.join(',') } : {}), ...(resume ? { resume: 'true' } : {}),
})}`, token);
