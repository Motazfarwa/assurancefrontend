// Success toast shown by <AppToast /> (mounted once in App). Every successful submission to the API shows one
// (see installAuthFetch); a module may call showToast with a more precise message, which replaces it.
export const TOAST_EVENT = 'app:toast';

export function showToast(text) {
  if (text) window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { text } }));
}

// Requests that send data without saving anything (sign in, document reading, assistant, lookups): no toast.
const SILENT = [/\/api\/auth\//, /\/api\/assistant\//, /\/api\/notifications\b/,/\/extract\b/, /\/ocr/, /\/api\/bordereaux\/clients\b/];

// Message for a successful submission to the API, or '' when the request is not one.
export function submissionMessage(url, method) {
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || SILENT.some((pattern) => pattern.test(url))) return '';
  if (/\/comptabiliser\b/.test(url)) return 'Comptabilisation effectuée avec succès.';
  if (/\/verser\b/.test(url)) return 'Versement enregistré avec succès.';
  if (/\/fusion\b/.test(url)) return verb === 'DELETE' ? 'Fusion annulée avec succès.' : 'Fusion effectuée avec succès.';
  if (verb === 'DELETE') return 'Suppression effectuée avec succès.';
  if (verb === 'PUT' || verb === 'PATCH') return 'Modifications enregistrées avec succès.';
  return 'Enregistrement effectué avec succès.';
}
