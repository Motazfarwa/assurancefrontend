import { useCallback, useEffect, useState } from 'react';
import { navigate } from '../../navigation';
import './BackButton.css';

// "Retour", on every screen: back to the window or the page opened before.
// - A window is open (a module, or a window opened from it): the one on top is closed, the one under it is shown again.
// - No window, on a page opened from another (Clients, Aperçu client, Utilisateurs): back to that page.
const DIALOGS = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';
const PARENT_PAGE = { '/clients': '/workspace', '/clients/preview': '/clients', '/admin/users': '/workspace' };
const CLOSE_TEXTS = ['×', '✕', 'Ã—', 'Fermer', 'Quitter'];
const CONFIRM_CANCEL_TEXTS = ['Annuler', 'Non'];

const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';

// The window on top: the last one in the page that is shown (a window opened from another comes after it).
export function topDialog(root = document) {
  const open = [...root.querySelectorAll(DIALOGS)].filter((element) => !element.closest('.app-back-button') && visible(element));
  return open[open.length - 1] || null;
}

// Its own close button (not one of a window inside it): "Fermer" / ×, or "Annuler" on a confirmation.
export function closeButtonOf(dialog) {
  const own = [...dialog.querySelectorAll('button')].filter((button) => button.closest(DIALOGS) === dialog && !button.disabled && visible(button));
  const label = (button) => (button.getAttribute('aria-label') || '').trim();
  const text = (button) => button.textContent.replace(/\s+/g, ' ').trim();
  return own.find((button) => /^Fermer/i.test(label(button)))
    || own.find((button) => CLOSE_TEXTS.includes(text(button)))
    || (dialog.getAttribute('role') === 'alertdialog' ? own.find((button) => CONFIRM_CANCEL_TEXTS.includes(text(button))) : null)
    || null;
}

export function goBack() {
  const dialog = topDialog();
  if (dialog) {
    const button = closeButtonOf(dialog);
    if (button) { button.click(); return true; }
    // No close button: the window closes with Échap.
    const target = dialog.contains(document.activeElement) ? document.activeElement : dialog;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    return true;
  }
  const parent = PARENT_PAGE[window.location.pathname];
  if (parent) { navigate(parent); return true; }
  return false;
}

const canGoBack = () => Boolean(topDialog() || PARENT_PAGE[window.location.pathname]);

export default function BackButton() {
  const [shown, setShown] = useState(false);
  const refresh = useCallback(() => setShown(canGoBack()), []);

  useEffect(() => {
    let frame = 0;
    const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); };
    const observer = new MutationObserver(later);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'role', 'aria-modal'] });
    window.addEventListener('popstate', later);
    refresh();
    return () => { observer.disconnect(); window.removeEventListener('popstate', later); if (frame) cancelAnimationFrame(frame); };
  }, [refresh]);

  if (!shown) return null;
  return <button type="button" className="app-back-button" onClick={goBack} title="Revenir à la fenêtre précédente" aria-label="Retour à la fenêtre précédente">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m0 0l6-6m-6 6l6 6" /></svg>Retour
  </button>;
}
