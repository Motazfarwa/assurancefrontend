import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The blank page a report tab opens on (public/apercu.html): of this site, so the tab can then show the report's name in its
// address (…/etat-financier-des-operations-journalieres-technique) instead of about:blank.
const BASE = process.env.PUBLIC_URL || '';

export function windowSlug(title) {
  return String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').toLowerCase() || 'apercu';
}

// Opens a browser tab synchronously, so call it from the click itself (pop-up blockers allow only that); null when blocked.
export function openNamedWindow(title, features) {
  return window.open(`${BASE}/apercu.html#${windowSlug(title)}`, '_blank', features);
}

// The tab's title and address: the report's name.
export function nameWindow(popup, title) {
  try {
    popup.document.title = title;
    popup.history.replaceState(null, '', `${BASE}/${windowSlug(title)}`);
  } catch { /* the name is only cosmetic */ }
}

// Runs ready(document) once the blank page is loaded in the tab (what is written earlier is wiped by its loading),
// then names the tab; returns a function cancelling the wait.
export function whenWindowReady(popup, title, ready) {
  let done = false;
  const check = () => {
    if (done || popup.closed) return true;
    let loaded = false;
    try { loaded = popup.location.href !== 'about:blank' && popup.document.readyState === 'complete'; } catch { loaded = false; }
    if (!loaded) return false;
    done = true;
    ready(popup.document);
    nameWindow(popup, title);
    return true;
  };
  if (check()) return () => {};
  const timer = setInterval(() => { if (check()) clearInterval(timer); }, 25);
  return () => { done = true; clearInterval(timer); };
}

// « ← Retour » on every aperçu tab: closes the tab and goes back to the application where it was (the tab that opened
// it); not printed.
export function addBackButton(doc, popup) {
  if (!doc?.body || doc.getElementById('apercu-retour')) return;
  const style = doc.createElement('style');
  style.textContent = '#apercu-retour{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;'
    + 'min-height:44px;padding:0 20px;border:1px solid #cfe0e4;border-radius:999px;background:#fff;color:#1b5f57;'
    + 'font:600 16px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 18px rgba(18,45,60,.18);cursor:pointer}'
    + '#apercu-retour:hover{background:#f1f8f6}@media print{#apercu-retour{display:none!important}}';
  doc.head.appendChild(style);
  const button = doc.createElement('button');
  button.id = 'apercu-retour';
  button.type = 'button';
  button.textContent = '← Retour';
  button.setAttribute('aria-label', 'Retour à l’application');
  button.addEventListener('click', () => {
    try { popup.opener?.focus(); } catch { /* another origin: nothing to focus */ }
    popup.close();
    // a tab the browser will not close (opened by hand, or the opener is gone): back to the application
    setTimeout(() => { if (!popup.closed) popup.location.href = `${BASE}/workspace`; }, 150);
  });
  doc.body.appendChild(button);
}

// A whole HTML page written in a new tab named after the report, then printed when `print`; null when blocked.
export function writeNamedWindow(title, html, { print = false, features } = {}) {
  const popup = openNamedWindow(title, features);
  if (!popup) return null;
  whenWindowReady(popup, title, (doc) => {
    doc.open();
    doc.write(html);
    doc.close();
    addBackButton(doc, popup);
    nameWindow(popup, title); // document.open gives the tab the address of this page: named again
    popup.focus();
    if (print) setTimeout(() => popup.print(), 0);
  });
  return popup;
}

// Opens a browser tab synchronously, so call it from the click itself (pop-up blockers allow only that).
export function openReportWindow(title) {
  const popup = openNamedWindow(title);
  if (!popup) throw new Error('Autorisez les fenêtres pop-up de ce site pour afficher l’aperçu.');
  return popup;
}

// Renders its children in a tab opened with openReportWindow, with the application's styles;
// onClose runs when the tab is closed, and the tab closes when this component goes away.
export default function NewWindow({ popup, title, onClose, children }) {
  const [container, setContainer] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // Owner token: in development React mounts effects twice, the tab must survive the first cleanup.
    const owner = {};
    popup.reportOwner = owner;
    let closed = null;
    const cancel = whenWindowReady(popup, title, (doc) => {
      doc.head.querySelectorAll('[data-app-style]').forEach((node) => node.remove());
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        const copy = node.cloneNode(true);
        if (node.href) copy.href = node.href; // absolute, the tab has no base URL of its own
        copy.setAttribute('data-app-style', '');
        doc.head.appendChild(copy);
    });
    doc.body.innerHTML = '';
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    addBackButton(doc, popup);
    setContainer(root);
    // listened once the page is loaded: the blank page replacing the opening about:blank is not a closing
    closed = () => closeRef.current();
    popup.addEventListener('pagehide', closed);
    });
    return () => {
      cancel();
      if (closed) popup.removeEventListener('pagehide', closed);
      setTimeout(() => { if (popup.reportOwner === owner && !popup.closed) popup.close(); }, 0);
    };
  }, [popup, title]);

  return container ? createPortal(children, container) : null;
}
