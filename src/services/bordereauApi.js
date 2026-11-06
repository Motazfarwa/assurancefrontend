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
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail) ? 'Données invalides : vérifiez la période et les colonnes du fichier.' : 'La requête a échoué. Réessayez.');
  }
  return body;
}

const query = (params) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null)).toString();

export const listBordereaux = (token, params) => request(`/api/bordereaux?${query(params)}`, token);
export const getBordereau = (token, id) => request(`/api/bordereaux/${id}`, token);
export const saveBordereau = (token, payload) => request('/api/bordereaux', token, { method: 'POST', body: JSON.stringify(payload) });
export const deleteBordereau = (token, id) => request(`/api/bordereaux/${id}`, token, { method: 'DELETE' });
// Policy numbers (num_int) -> { code_client, nom_client } of the agency's policies.
export const getBordereauClients = (token, numeros) => request('/api/bordereaux/clients', token, { method: 'POST', body: JSON.stringify({ numeros }) });
// Quittances of TQuittance of a type and period (empty period: the quittances without one, of the due year `annee`),
// of one company or of the list `compagnies` ("1,4,9").
export const listQuittances = (token, { tc, periode, annee, code_compagnie, compagnies }) => request(`/api/bordereaux/quittances?${query({ tc, annee, code_compagnie, compagnies })}&periode=${encodeURIComponent(periode || '')}`, token);
// Validates a comptant quittance in a period ('' takes the validation back); avant = the period it has now.
export const setQuittancePeriode = (token, { num_quittance, num_int, periode, avant }) => request('/api/bordereaux/quittances/periode', token, { method: 'PUT', body: JSON.stringify({ num_quittance, num_int, periode, avant }) });
export const getConfrontation =(token, params) => request(`/api/bordereaux/confrontation?${query(params)}`, token);
// Periods that have a bordereau for a company and T/C, most recent first: [{ periode, nb_lignes, fusionne }].
export const listBordereauPeriodes = (token, { code_compagnie, tc }) => request(`/api/bordereaux/periodes?${query({ code_compagnie, tc })}`, token);

// "2026-11" (month input) <-> "11/2026" (period stored with the bordereau)
export const monthToPeriode = (month) => (/^\d{4}-\d{2}$/.test(month) ? `${month.slice(5)}/${month.slice(0, 4)}` : '');
export const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
// The bordereau received is the one of the coming term: the month after the current one.
export const nextMonth = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
};

// A bordereau of TBordereau (the agency's bordereaux) is fused by company, T/C and period; one imported in the
// application (TBordereauCie) by its number.
export const fuseBordereau = (token, bordereau, forcer = false) => (bordereau.source === 'TBordereau'
  ? request('/api/bordereaux/fusion-periode', token, { method: 'POST', body: JSON.stringify({ code_compagnie: bordereau.code_compagnie, tc: bordereau.tc, periode: bordereau.periode, forcer }) })
  : request(`/api/bordereaux/${bordereau.id_bordereau}/fusion`, token, { method: 'POST', body: JSON.stringify({ forcer }) }));
export const cancelFusion = (token, bordereau) => (bordereau.source === 'TBordereau'
  ? request(`/api/bordereaux/fusion-periode?${query({ code_compagnie: bordereau.code_compagnie, tc: bordereau.tc, periode: bordereau.periode })}`, token, { method: 'DELETE' })
  : request(`/api/bordereaux/${bordereau.id_bordereau}/fusion`, token, { method: 'DELETE' }));
