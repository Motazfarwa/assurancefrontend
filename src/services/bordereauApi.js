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
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail) ? 'Données invalides : vérifiez la période et les colonnes du fichier.' : 'La requête a échoué. Réessayez.');
  }
  return body;
}

const query = (params) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null)).toString();

export const listBordereaux = (token, params) => request(`/api/bordereaux?${query(params)}`, token);
export const getBordereau = (token, id) => request(`/api/bordereaux/${id}`, token);
export const saveBordereau = (token, payload) => request('/api/bordereaux', token, { method: 'POST', body: JSON.stringify(payload) });
export const deleteBordereau = (token, id) => request(`/api/bordereaux/${id}`, token, { method: 'DELETE' });
export const getConfrontation = (token, params) => request(`/api/bordereaux/confrontation?${query(params)}`, token);

// "2026-11" (month input) <-> "11/2026" (period stored with the bordereau)
export const monthToPeriode = (month) => (/^\d{4}-\d{2}$/.test(month) ? `${month.slice(5)}/${month.slice(0, 4)}` : '');
export const currentMonth = () => new Date().toISOString().slice(0, 7);

export const fuseBordereau = (token, id, forcer = false) => request(`/api/bordereaux/${id}/fusion`, token, { method: 'POST', body: JSON.stringify({ forcer }) });
export const cancelFusion = (token, id) => request(`/api/bordereaux/${id}/fusion`, token, { method: 'DELETE' });
