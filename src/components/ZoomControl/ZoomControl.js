import { useEffect, useState } from 'react';
import './ZoomControl.css';

const KEY = 'app-zoom';
const LEVELS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.5];

function savedZoom() {
  try {
    const value = Number(window.localStorage.getItem(KEY));
    return LEVELS.includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

// Zoom of the whole application (CSS zoom on the page), kept for the next visits of this browser.
export default function ZoomControl() {
  const [zoom, setZoom] = useState(savedZoom);

  useEffect(() => {
    document.documentElement.style.zoom = zoom === 1 ? '' : String(zoom);
    try { window.localStorage.setItem(KEY, String(zoom)); } catch { /* private window: the zoom just isn't kept */ }
  }, [zoom]);

  const index = LEVELS.indexOf(zoom);
  return <div className="zoom-control" role="group" aria-label="Zoom de l’application">
    <button type="button" onClick={() => setZoom(LEVELS[index - 1])} disabled={index <= 0} aria-label="Zoom arrière" title="Zoom arrière">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M7.5 10.5h6M15.5 15.5 20 20" /></svg>
    </button>
    <button type="button" className="zoom-level" onClick={() => setZoom(1)} title="Revenir à 100 %">{Math.round(zoom * 100)} %</button>
    <button type="button" onClick={() => setZoom(LEVELS[index + 1])} disabled={index >= LEVELS.length - 1} aria-label="Zoom avant" title="Zoom avant">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M7.5 10.5h6M10.5 7.5v6M15.5 15.5 20 20" /></svg>
    </button>
  </div>;
}
