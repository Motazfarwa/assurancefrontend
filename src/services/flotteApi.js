import { API_BASE_URL } from './apiBase';

// A refusal the user may override (the registration is on another policy in force): its message starts with "CONFIRMER:".
export class ConfirmationNeeded extends Error {}

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
    const detail = typeof body?.detail === 'string' ? body.detail : Array.isArray(body?.detail) ? 'Données invalides : vérifiez les champs du véhicule.' : 'La requête a échoué. Réessayez.';
    if (detail.startsWith('CONFIRMER:')) throw new ConfirmationNeeded(detail.slice('CONFIRMER:'.length));
    throw new Error(detail);
  }
  return body;
}

const base = (numInt) => `/api/flotte/${encodeURIComponent(String(numInt).trim())}`;

// The fleet contract, its vehicles (in the fleet or gone) and the totals of those in the fleet.
export const getFleet = (token, numInt) => request(base(numInt), token);
export const setFleet = (token, numInt, flotte) => request(base(numInt), token, { method: 'PUT', body: JSON.stringify({ flotte }) });
export const addVehicle = (token, numInt, vehicle) => request(`${base(numInt)}/vehicules`, token, { method: 'POST', body: JSON.stringify(vehicle) });
export const updateVehicle = (token, numInt, ordre, vehicle) => request(`${base(numInt)}/vehicules/${encodeURIComponent(ordre)}`, token, { method: 'PUT', body: JSON.stringify(vehicle) });
// Exit of the fleet from a date (motif: vendu, epave, transfert, autre); cancelExit puts the vehicle back.
export const removeVehicle = (token, numInt, ordre, sortie) => request(`${base(numInt)}/vehicules/${encodeURIComponent(ordre)}/sortie`, token, { method: 'POST', body: JSON.stringify(sortie) });
export const cancelExit = (token, numInt, ordre) => request(`${base(numInt)}/vehicules/${encodeURIComponent(ordre)}/sortie`, token, { method: 'DELETE' });
// One vehicle for another on a date: only the premium difference is billed or returned (avenant de remplacement).
export const replaceVehicle = (token, numInt, ordre, payload) => request(`${base(numInt)}/vehicules/${encodeURIComponent(ordre)}/remplacement`, token, { method: 'POST', body: JSON.stringify(payload) });
// A list of vehicles at once: { resultats: [{ num_imat, ok, message }] } with the fleet.
export const importVehicles = (token, numInt, vehicules) => request(`${base(numInt)}/vehicules/import`, token, { method: 'POST', body: JSON.stringify({ vehicules }) });
export const getVehicleClaims = (token, numInt, ordre) => request(`${base(numInt)}/vehicules/${encodeURIComponent(ordre)}/sinistres`, token);
