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

const query = (params) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null)).toString();

export const listJournalCompanies = (token) => request('/api/journaux/compagnies', token);
// Journal d'encaissement: receipts of a company to declare on a date (and, with comptabilises, those declared that day).
export const getReceiptsJournal = (token, params) => request(`/api/journaux/encaissement?${query(params)}`, token);
export const postReceipts = (token, payload) => request('/api/journaux/encaissement/comptabiliser', token, { method: 'POST', body: JSON.stringify(payload) });
// Journal de dépense: claim (S) and rebate (R) payments of a company.
export const getExpensesJournal = (token, params) => request(`/api/journaux/depense?${query(params)}`, token);
export const postExpenses = (token, payload) => request('/api/journaux/depense/comptabiliser', token, { method: 'POST', body: JSON.stringify(payload) });
// Etat des moins perçus (type moins) or trop perçus (type trop) of the client settlements between two dates.
export const getReceivedGaps = (token, params) => request(`/api/journaux/percus?${query(params)}`, token);
