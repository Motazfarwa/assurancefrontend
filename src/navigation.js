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
