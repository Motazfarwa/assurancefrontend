import { API_BASE_URL } from './apiBase';

export async function listAgencyUnpaid(accessToken, filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value != null && value !== false) params.set(key, String(value));
  });
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/impayes-agence?${params.toString()}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de charger les impayés.');
  return body;
}

// Clients paid / unpaid according to their settlements (TRDetRegCli).
export async function listClientSettlements(accessToken, filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value != null) params.set(key, String(value));
  });
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/impayes-agence/reglements?${params.toString()}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de charger les clients.');
  return body;
}

export async function listSettlementClients(accessToken) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/impayes-agence/reglements/clients`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de charger les clients.');
  return body.items || [];
}

export async function listAgencyUnpaidCompanies(accessToken) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/impayes-agence/compagnies`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de charger les compagnies des impayés.');
  return body.items || [];
}

// Etat des acomptes: quittances partly paid (0,01 < solde < montant quittance).
export async function listPartialPayments(accessToken, filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value != null) params.set(key, String(value));
  });
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/impayes-agence/acomptes?${params.toString()}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de charger les acomptes.');
  return body;
}

// Etat des impayés computed live: quittances avec / sans pièce en instance, with the client and the compagnie.
async function getJson(path, accessToken, filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value != null && value !== false) params.set(key, String(value));
  });
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}?${params.toString()}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de charger l’état des impayés.');
  return body;
}
export const getUnpaidStatement = (accessToken, filters) => getJson('/api/impayes-agence/etat', accessToken, filters);
export const listStatementCompanies = (accessToken) => getJson('/api/impayes-agence/etat/compagnies', accessToken);
