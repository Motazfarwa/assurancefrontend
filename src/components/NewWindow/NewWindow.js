import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Opens a browser tab synchronously, so call it from the click itself (pop-up blockers allow only that).
export function openReportWindow(title) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Autorisez les fenêtres pop-up de ce site pour afficher l’aperçu.');
  popup.document.title = title;
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
    const doc = popup.document;
    doc.title = title;
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
    setContainer(root);

    const closed = () => closeRef.current();
    popup.addEventListener('pagehide', closed);
    return () => {
      popup.removeEventListener('pagehide', closed);
      setTimeout(() => { if (popup.reportOwner === owner && !popup.closed) popup.close(); }, 0);
    };
  }, [popup, title]);

  return container ? createPortal(children, container) : null;
}
