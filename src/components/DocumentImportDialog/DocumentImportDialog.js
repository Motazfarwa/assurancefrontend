import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isPdf } from '../../services/ficheOcr';
import '../FicheImportModal/FicheImportModal.css';
import './DocumentImportDialog.css';

// The import window of every module, like "Importer un contrat (OCR)": the imported PDF or image on the left, the
// reading on the right, then what was read; "Appliquer" hands the result to the module, which fills its form.
// read(onProgress) reads the document; summarize(result) gives { rows: [[label, value]], empty, note } to show.
export default function DocumentImportDialog({ file, kicker, title, read, summarize, applyLabel = 'Appliquer', onApply, onClose }) {
  const [status, setStatus] = useState('reading');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const reported = useRef(false); // the reading reports its own progress (in-browser OCR); else an estimate moves on
  const readRef = useRef(read);
  readRef.current = read;
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    let active = true;
    reported.current = false;
    setStatus('reading'); setProgress(0); setError(''); setResult(null);
    // A server reading gives no progress: the bar advances slowly towards 90 % until the answer arrives.
    const started = Date.now();
    const timer = setInterval(() => {
      if (!reported.current && active) setProgress(0.9 * (1 - Math.exp(-(Date.now() - started) / 15000)));
    }, 250);
    const onProgress = (value) => { reported.current = true; if (active) setProgress(Math.max(0, Math.min(1, Number(value) || 0))); };
    Promise.resolve()
      .then(() => readRef.current(onProgress))
      .then((value) => { if (active) { setProgress(1); setResult(value); setStatus('done'); } })
      .catch((readError) => { if (active) { setError(readError?.message || 'La lecture du document a échoué.'); setStatus('error'); } })
      .finally(() => clearInterval(timer));
    return () => { active = false; clearInterval(timer); };
  }, [file, attempt]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const summary = status === 'done' ? (summarize ? summarize(result) : { rows: [] }) : null;
  const nothing = summary && !summary.rows?.length;

  return createPortal(
    <div className="fiche-backdrop doc-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="fiche-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><span>{kicker}</span><h2>{title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="fiche-body">
          <aside className="fiche-preview">
            {previewUrl && (isPdf(file)
              ? <iframe src={previewUrl} title="Document importé" />
              : <img src={previewUrl} alt="Document importé" />)}
            <small>{file?.name}</small>
          </aside>

          <div className="fiche-results">
            {status === 'reading' && (
              <div className="fiche-progress" role="status">
                <strong>Lecture du document… {Math.round(progress * 100)} %</strong>
                <div><i style={{ width: `${Math.max(4, progress * 100)}%` }} /></div>
                <small>Analyse complète du document (français et arabe). Cela peut prendre jusqu’à une minute.</small>
              </div>
            )}
            {status === 'error' && <>
              <p className="fiche-error" role="alert">{error}</p>
              <button type="button" className="fiche-secondary" onClick={() => setAttempt((value) => value + 1)}>Réessayer la lecture</button>
            </>}
            {status === 'done' && <>
              {summary.note && <p className="fiche-hint">{summary.note}</p>}
              {nothing ? <p className="fiche-error" role="status">{summary.empty || 'Aucune information lisible dans ce document.'}</p> : (
                <fieldset>
                  <legend>Informations lues</legend>
                  <dl className="doc-import-values">
                    {summary.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === '' || value == null ? <i>Non lu</i> : String(value)}</dd></div>)}
                  </dl>
                </fieldset>
              )}
              {summary.warnings?.length > 0 && <ul className="doc-import-warnings">{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
              {/* Every labelled value read on the document, besides those that fill the form (nothing read is lost) */}
              {result?.infos?.length > 0 && (
                <fieldset>
                  <legend>Autres informations lues sur le document ({result.infos.length})</legend>
                  <dl className="doc-import-values">
                    {result.infos.map((info, index) => <div key={`${info.libelle}-${index}`}><dt>{info.libelle}</dt><dd>{info.valeur}</dd></div>)}
                  </dl>
                </fieldset>
              )}
            </>}
          </div>
        </div>

        <footer>
          <span>{status === 'done' && !nothing ? 'Vérifiez les informations, puis appliquez-les au formulaire.' : ''}</span>
          <div>
            <button type="button" className="fiche-secondary" onClick={onClose}>Annuler</button>
            <button type="button" className="fiche-primary" disabled={status !== 'done' || nothing} onClick={() => onApply(result)}>{applyLabel}</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
