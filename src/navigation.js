export function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// A module window left for a page (e.g. "Ouvrir la fiche" of Clients à compléter): kept for this tab, so that coming
// back to the modules (Retour, Fermer) opens it again where the user was. Read once; forgotten after a few hours.
const RETURN_KEY = 'app.returnModule';
const RETURN_MAX_AGE = 4 * 60 * 60 * 1000;
export function rememberReturnModule(moduleId, state = {}) {
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ moduleId, state, at: Date.now() })); } catch { /* storage unavailable: no return */ }
}
// What the client page does as soon as it opens a client (Clients à compléter): 'receipt' opens "Gestion quittance",
// 'police' goes to the "Saisir police" step. Kept for that client only, read once.
const CLIENT_ACTION_KEY = 'app.clientAction';
export function rememberClientAction(code, action) {
  try { sessionStorage.setItem(CLIENT_ACTION_KEY, JSON.stringify({ code: String(code).trim(), action, at: Date.now() })); } catch { /* storage unavailable */ }
}
export function takeClientAction(code) {
  try {
    const raw = sessionStorage.getItem(CLIENT_ACTION_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || saved.code !== String(code).trim()) return null;
    sessionStorage.removeItem(CLIENT_ACTION_KEY);
    return Date.now() - saved.at < RETURN_MAX_AGE ? saved.action : null;
  } catch {
    return null;
  }
}

export function takeReturnModule() {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return saved && Date.now() - saved.at < RETURN_MAX_AGE ? saved : null;
  } catch {
    return null;
  }
}
