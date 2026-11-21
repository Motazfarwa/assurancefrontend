import { useCallback, useEffect, useState } from 'react';
import { topDialog } from '../BackButton/BackButton';
import './ModalZoom.css';

// The zoom of the windows (modules): − / + under every open window, for the window on top. Each window keeps its own
// zoom, remembered by its title on this computer, and it is given back when the window opens again.
const DIALOGS = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';
const STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];
const STORE = 'modalZoom:';

// The name a window is remembered by: its title (aria-labelledby, else its first heading).
export function dialogKey(dialog) {
  const labelled = dialog.getAttribute('aria-labelledby');
  const title = (labelled && document.getElementById(labelled.split(' ')[0])) || dialog.querySelector('h1, h2, h3');
  const text = (title?.textContent || dialog.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  return text ? STORE + text : '';
}

function storedZoom(key) {
  if (!key) return 1;
  try {
    const value = Number(window.localStorage.getItem(key));
    return STEPS.includes(value) ? value : 1;
  } catch { return 1; }
}

function store(key, value) {
  if (!key) return;
  try {
    if (value === 1) window.localStorage.removeItem(key); else window.localStorage.setItem(key, String(value));
  } catch { /* the zoom is only a convenience */ }
}

// The zoom is kept on the window (data-zoom) and given to it as the CSS zoom.
const zoomOf = (dialog) => Number(dialog.dataset.zoom) || 1;
const apply = (dialog, value) => {
  if (zoomOf(dialog) === value && dialog.dataset.zoom !== undefined) return;
  dialog.dataset.zoom = String(value);
  if (value === 1) dialog.style.removeProperty('zoom'); else dialog.style.setProperty('zoom', String(value));
};

export default function ModalZoom() {
  const [current, setCurrent] = useState(null); // { dialog, key, zoom } of the window on top

  const refresh = useCallback(() => {
    // every open window gets back its own zoom
    document.querySelectorAll(DIALOGS).forEach((dialog) => {
      if (dialog.closest('.app-modal-zoom')) return;
      if (dialog.dataset.zoomKey === undefined) {
        dialog.dataset.zoomKey = dialogKey(dialog);
        apply(dialog, storedZoom(dialog.dataset.zoomKey));
      }
    });
    const dialog = topDialog();
    setCurrent((previous) => {
      if (!dialog) return null;
      const key = dialog.dataset.zoomKey || '';
      const zoom = zoomOf(dialog);
      return previous && previous.dialog === dialog && previous.zoom === zoom ? previous : { dialog, key, zoom };
    });
  }, []);

  useEffect(() => {
    let frame = 0;
    const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); };
    const observer = new MutationObserver(later);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'role', 'aria-modal'] });
    refresh();
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [refresh]);

  if (!current) return null;
  const at = STEPS.indexOf(current.zoom);
  const set = (value) => {
    apply(current.dialog, value);
    store(current.key, value);
    setCurrent({ ...current, zoom: value });
  };
  return <div className="app-modal-zoom" role="group" aria-label="Zoom de la fenêtre">
    <button type="button" onClick={() => set(STEPS[Math.max(0, at - 1)])} disabled={at <= 0} aria-label="Réduire la fenêtre" title="Réduire">−</button>
    <button type="button" className="app-modal-zoom-value" onClick={() => set(1)} title="Taille normale (100 %)" aria-label={`Zoom ${Math.round(current.zoom * 100)} % : revenir à 100 %`}>{Math.round(current.zoom * 100)} %</button>
    <button type="button" onClick={() => set(STEPS[Math.min(STEPS.length - 1, at + 1)])} disabled={at >= STEPS.length - 1} aria-label="Agrandir la fenêtre" title="Agrandir">+</button>
  </div>;
}
