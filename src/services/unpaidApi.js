const API_BASE_URL = (process.env.REACT_APP_API_URL || 'https://assurancebackend.onrender.com').replace(/\/$/, '');

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
