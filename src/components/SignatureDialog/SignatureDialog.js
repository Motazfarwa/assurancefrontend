import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { deleteMySignature, getMySignature, saveMySignature } from '../../services/signatureApi';
import './SignatureDialog.css';

// « Ma signature »: the user (administrator or employee) signs with the finger, a pen or the mouse; the signature is
// kept with the user and put on the documents they print (the quittance's « Pour la Compagnie »).
export default function SignatureDialog({ onClose, onSaved }) {
  const { accessToken } = useAuth();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [saved, setSaved] = useState(null); // the signature kept, as an image
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    getMySignature(accessToken).then((body) => { if (active) setSaved(body?.image || null); }).catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [accessToken]);

  // The pad drawn at the resolution of the screen, so the line stays sharp on a tablet.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#10243a';
  }, []);

  const point = (event) => {
    const box = canvasRef.current.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  function start(event) {
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    const context = canvasRef.current.getContext('2d');
    const [x, y] = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    setDrawn(true);
    setNotice('');
  }
  function move(event) {
    if (!drawing.current) return;
    event.preventDefault();
    const context = canvasRef.current.getContext('2d');
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
  }
  function end() { drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setDrawn(false);
  }

  async function save() {
    setBusy(true); setError('');
    try {
      const image = canvasRef.current.toDataURL('image/png');
      await saveMySignature(accessToken, image);
      setSaved(image);
      clear();
      setNotice('Signature enregistrée : elle figurera sur les quittances que vous imprimez.');
      onSaved?.(image);
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm('Supprimer votre signature ?')) return;
    setBusy(true); setError('');
    try {
      await deleteMySignature(accessToken);
      setSaved(null);
      setNotice('Signature supprimée.');
      onSaved?.(null);
    } catch (deleteError) { setError(deleteError.message); }
    finally { setBusy(false); }
  }

  return <div className="sig-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="sig-dialog" role="dialog" aria-modal="true" aria-labelledby="sig-title">
      <header><div><span>SIGNATURE ÉLECTRONIQUE</span><h2 id="sig-title">Ma signature</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      <p className="sig-hint">Signez dans le cadre avec le doigt, un stylet ou la souris. Elle sera apposée sur les quittances que vous imprimez.</p>
      <canvas ref={canvasRef} className="sig-pad" aria-label="Zone de signature"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} />
      {saved && <div className="sig-saved"><span>Signature enregistrée</span><img src={saved} alt="Votre signature enregistrée" /></div>}
      {error && <p className="sig-error" role="alert">{error}</p>}
      {notice && !error && <p className="sig-notice" role="status">{notice}</p>}
      <footer>
        <button type="button" className="sig-secondary" onClick={clear} disabled={busy || !drawn}>Effacer</button>
        {saved && <button type="button" className="sig-danger" onClick={remove} disabled={busy}>Supprimer ma signature</button>}
        <button type="button" className="sig-primary" onClick={save} disabled={busy || !drawn}>{busy ? 'Enregistrement…' : 'Enregistrer la signature'}</button>
      </footer>
    </section>
  </div>;
}
