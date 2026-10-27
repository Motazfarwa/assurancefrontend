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
        ...options.headers,
      },
    });
  } catch {
    throw new Error(`Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que FastAPI est démarré.`);
  }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'La requête a échoué. Réessayez.');
  return body;
}

// Companies no longer offered in the company lists (policy entry, bordereaux), by name.
const EXCLUDED_COMPANIES = new Set(['BIAT']);
export const isOfferedCompany = (company) => !EXCLUDED_COMPANIES.has(String(company?.nom_compagnie || '').trim().toUpperCase());

export function listCompanies(token) { return request('/api/compagnies', token); }
export function updateCompany(token, code, values) {
  return request(`/api/compagnies/${encodeURIComponent(code)}`, token, { method: 'PUT', body: JSON.stringify(values) });
}
export function deleteCompany(token, code) {
  return request(`/api/compagnies/${encodeURIComponent(code)}`, token, { method: 'DELETE' });
}
export function listCompanyBranches(token, code) {
  return request(`/api/compagnies/${encodeURIComponent(code)}/branches`, token);
}
export function saveCompanyBranch(token, companyCode, branch, isUpdate) {
  const path = `/api/compagnies/${encodeURIComponent(companyCode)}/branches${isUpdate ? `/${encodeURIComponent(branch.code_branche)}` : ''}`;
  return request(path, token, { method: isUpdate ? 'PUT' : 'POST', body: JSON.stringify(branch) });
}
export function deleteCompanyBranch(token, companyCode, branchCode) {
  return request(`/api/compagnies/${encodeURIComponent(companyCode)}/branches/${encodeURIComponent(branchCode)}`, token, { method: 'DELETE' });
}
