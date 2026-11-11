import { API_BASE_URL } from './apiBase';

// "Journal du jour": the employee's day (tasks, remarks), validated and sent to the administrator's WhatsApp.
async function request(accessToken, path, method = 'GET', body) {
  const response = await fetch(`${API_BASE_URL}/api/journal-employe${path}`, {
    method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((item) => item.msg).join(' ') : data.detail;
    throw new Error(typeof detail === 'string' && detail ? detail : 'Journal du jour indisponible.');
  }
  return data;
}

// { journal: { date_jour, taches: [{ texte, statut }], remarques, demain, statut: vide|brouillon|valide, date_validation, envoi },
//   activite: { total, par_type, dernieres }, rapport, whatsapp: { numero, lien } }
export const getMyJournal = (accessToken, day) => request(accessToken, `/moi?date=${day}`);
export const saveMyJournal = (accessToken, journal) => request(accessToken, '/moi', 'PUT', journal);
// The same body, whatsapp: { numero, envoye, erreur, lien } (lien: wa.me link when the server did not send it)
// and email: { destinataire, envoye, erreur }.
export const validateMyJournal = (accessToken, journal) => request(accessToken, '/moi/valider', 'POST', journal);

// Administrator
export const getTeamDay = (accessToken, day) => request(accessToken, `/equipe?date=${day}`);
export const getEmployeeHistory = (accessToken, name, jours = 14) => request(accessToken, `/equipe/${encodeURIComponent(name)}?jours=${jours}`);
export const markJournalSeen = (accessToken, name, day) => request(accessToken, `/equipe/${encodeURIComponent(name)}/${day}/vu`, 'POST');
export const reopenJournal = (accessToken, name, day) => request(accessToken, `/equipe/${encodeURIComponent(name)}/${day}/rouvrir`, 'POST');
export const saveWhatsappNumber = (accessToken, numero) => request(accessToken, '/parametres', 'PUT', { whatsapp_admin: numero });
// Where the submitted days go: { whatsapp_admin, email_admin } (only the keys given are changed).
export const saveJournalParams = (accessToken, params) => request(accessToken, '/parametres', 'PUT', params);

// Client requests. The employee: those assigned to them ({ items: [{ id, client, canaux, demande, observation, statut,
// reponse, date_traitement, cree_par, date_creation }] }), marked "traitée" with a reply.
export const getMyRequests = (accessToken) => request(accessToken, '/moi/demandes');
export const handleRequest = (accessToken, id, reponse) => request(accessToken, `/moi/demandes/${id}/traiter`, 'POST', { reponse });
// The administrator: who can receive one ({ utilisateurs: [{ nom, agence }], agences: [{ agence, utilisateurs }] }), the
// requests recorded ({ items: [... affectations: [{ utilisateur, statut, reponse, date_traitement }]] }), a new one
// ({ client, canaux, demande, observation, cible_type: utilisateur | agence, utilisateurs, agence }), and its removal.
export const getRequestTargets = (accessToken) => request(accessToken, '/demandes/destinataires');
export const listRequests = (accessToken) => request(accessToken, '/demandes');
export const createRequest = (accessToken, demande) => request(accessToken, '/demandes', 'POST', demande);
export const deleteRequest = (accessToken, id) => request(accessToken, `/demandes/${id}`, 'DELETE');
