const API_BASE_URL = (process.env.REACT_APP_API_URL || 'http://https://assurancebackend.onrender.com').replace(/\/$/, '');

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

export function listDocuments(accessToken) { return request('/api/documents', accessToken); }
export function createDocument(accessToken, values) {
  return request('/api/documents', accessToken, { method: 'POST', body: JSON.stringify(values) });
}
