const API_BASE_URL = (process.env.REACT_APP_API_URL || 'https://assurancebackend.onrender.com').replace(/\/$/, '');

// messages: [{ role: 'user' | 'assistant', content }], mode: 'ask' | 'agent'
export async function askAssistant(accessToken, { messages, mode, clientCode }, signal) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
      method: 'POST',
      signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messages, mode, client_code: clientCode || null }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error("Impossible de joindre l'assistant. Vérifiez la connexion puis réessayez.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Session expirée : reconnectez-vous pour utiliser l’assistant.');
    throw new Error(typeof body.detail === 'string' ? body.detail : 'L’assistant a rencontré une erreur.');
  }
  return { answer: body.answer || '', steps: Array.isArray(body.steps) ? body.steps : [] };
}
