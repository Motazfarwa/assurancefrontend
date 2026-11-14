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
// Taux de recouvrement = encaissements de l'année / primes exigibles de l'année (same client / company / type of client):
// { annee, du, au, encaissements, primes_exigibles, quittances_exigibles, taux }.
export const getRecoveryRate = (accessToken, filters) => getJson('/api/impayes-agence/taux-recouvrement', accessToken, filters);
export const listStatementCompanies = (accessToken) => getJson('/api/impayes-agence/etat/compagnies', accessToken);
// The clients linked to a client (its Lien, and the clients whose Lien it is): { client, liens: [{ code_client, nom_client, relation }] }.
export const getClientLinks = (accessToken, code) => getJson(`/api/impayes-agence/etat/liens/${encodeURIComponent(code)}`, accessToken);

// Mémoire de règlement of one client, sent to the client. criteria: { piece, date_debut, date_fin, code_compagnie } of the
// statement shown (the server reads the same quittances again to build the PDF).
const memoirePath = (code) => `/api/impayes-agence/memoire/${encodeURIComponent(code)}`;
// The emails and phones stored on the client file: { code_client, nom_client, emails, telephones }.
export const getMemoireContacts = (accessToken, code) => getJson(`${memoirePath(code)}/contacts`, accessToken);
// The PDF, downloaded by the browser (to attach in WhatsApp when the server cannot send it).
export async function downloadMemoirePdf(accessToken, code, criteria) {
  const params = new URLSearchParams();
  Object.entries(criteria || {}).forEach(([key, value]) => { if (value !== '' && value != null) params.set(key, String(value)); });
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${memoirePath(code)}/pdf?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}).`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de préparer le PDF.');
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || `memoire_reglement_${code}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
// { canal: 'email' | 'whatsapp', destinataire, sujet, message } → { envoye, destinataire, fichier, lien? } (lien: wa.me when
// the server has no WhatsApp API: the message is written there, the PDF is attached by hand).
export async function sendMemoire(accessToken, code, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${memoirePath(code)}/envoyer`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      // the criteria left empty on screen ('') are not sent
      body: JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== '' && value != null))),
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}).`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join(' ; ') : body.detail;
    throw new Error(typeof detail === 'string' && detail ? detail : 'Envoi impossible.');
  }
  return body;
}
