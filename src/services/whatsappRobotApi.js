import { API_BASE_URL } from './apiBase';

// Administration → WhatsApp: the robot that sends the mémoires de règlement from the agency's WhatsApp number.
async function request(accessToken, path = '', options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/admin/whatsapp${path}`, {
      ...options,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Impossible de joindre l’API (${API_BASE_URL}).`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Une erreur est survenue. Veuillez réessayer.');
  return body;
}

export const getRobotStatus = (accessToken) => request(accessToken);
export const connectRobot = (accessToken) => request(accessToken, '/connecter', { method: 'POST' });
export const newRobotQr = (accessToken) => request(accessToken, '/nouveau-qr', { method: 'POST' });
export const robotPairCode = (accessToken, telephone) => request(accessToken, '/code', { method: 'POST', body: JSON.stringify({ telephone }) });
export const disconnectRobot = (accessToken) => request(accessToken, '/deconnecter', { method: 'POST' });
