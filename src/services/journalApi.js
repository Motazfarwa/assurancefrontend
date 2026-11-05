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
// Opérations journalières (production): the policies or quittances added, modified or deleted between two dates.
export const getDailyProduction = (token, params) => request(`/api/journaux/production?${query(params)}`, token);
// Opérations journalières (financières): technique (client payments, claims and rebates paid) or divers, between two dates.
export const getDailyFinancial = (token, params) => request(`/api/journaux/financier?${query(params)}`, token);
// Etat des comptes client: per client, primes, ristournes, sinistres, règlements and commissions (filters: dates, company,
// client, police, état tous | comptabilise | instance | ristourne).
export const getClientAccounts = (token, params) => request(`/api/journaux/comptes-clients?${query(params)}`, token);
// Etat de la recette technique: the client payments between two dates, one line per quittance paid.
export const getRecetteTechnique = (token, params) => request(`/api/journaux/recette?${query(params)}`, token);
// Retour: the quittances of a company, type and period, and their return to the company (retour true / false).
export const listReturns = (token, params) => request(`/api/journaux/retours?${query(params)}`, token);
export const setReturn = (token, payload) => request('/api/journaux/retours/quittance', token, { method: 'PUT', body: JSON.stringify(payload) });
// Feuille de caisse of a company over a period (no dates: every day): the JEQ of each journal day and the claims and rebates.
export const getCashSheet = (token, params) => request(`/api/journaux/feuille?${query(params)}`, token);
// The solde and montant à déclarer kept for the feuille of a company on a day (± 1 DT of the computed ones, with a remarque).
export const getCashAdjustment = (token, params) => request(`/api/journaux/feuille/ajustement?${query(params)}`, token);
export const saveCashAdjustment = (token, payload) => request('/api/journaux/feuille/ajustement', token, { method: 'PUT', body: JSON.stringify(payload) });
