const API_BASE_URL = (process.env.REACT_APP_API_URL || 'https://assurancebackend.onrender.com').replace(/\/$/, '');

export async function listClientRecords(accessToken, kind, clientCode, query = {}) {
  const resource = { policies: 'policies', receipts: 'receipts', claims: 'claims' }[kind];
  let response;
  try {
    const search = new URLSearchParams(query).toString();
    response = await fetch(`${API_BASE_URL}/api/clients/${encodeURIComponent(clientCode)}/${resource}${search ? `?${search}` : ''}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}). Vérifiez que le serveur FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Impossible de charger les enregistrements du client.');
  return Array.isArray(body.items) ? body.items : [];
}

export async function updateClientRecord(accessToken, kind, id, changes) {
  const path = kind === 'policies' ? `polices/${encodeURIComponent(id)}` : `quittances/${encodeURIComponent(id)}`;
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(changes),
    });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}). Vérifiez que le serveur FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join(' ; ') : body.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Impossible d’enregistrer les modifications.');
  }
  return body;
}

export async function createQuittance(accessToken, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/quittances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}). Vérifiez que le serveur FastAPI est démarré.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join(' ; ') : body.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Impossible d’enregistrer la quittance.');
  }
  return body;
}
