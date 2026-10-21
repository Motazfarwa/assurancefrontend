import { useEffect, useMemo, useState } from 'react';
import { checkValue, scanFiche, scanFicheWithAI } from '../../services/ficheOcr';
import './FicheImportModal.css';

const GROUPS = [
  { id: 'client', label: 'Client' },
  { id: 'police', label: 'Police' },
  { id: 'quittance', label: 'Quittance' },
];

// Turns the confirmed rows into a patch for the client form and one for the policy / receipt form.
function buildPatches(rows) {
  const client = {};
  const policy = {};
  rows.filter((row) => row.use && row.value).forEach((row) => {
    if (row.group === 'client') {
      if (row.key === 'nationality') {
        const known = ['Tunisienne', 'Italienne'].find((item) => item.toLowerCase() === row.value.toLowerCase());
        client.nationality = known || 'Autre';
        if (!known) client.nationalityOther = row.value;
      } else if (row.key === 'phone') {
        client.homePhones = [{ value: row.value, label: '' }, { value: '', label: '' }, { value: '', label: '' }, { value: '', label: '' }];
      } else if (row.key === 'email') {
        client.homeEmails = [{ value: row.value, label: '' }, { value: '', label: '' }, { value: '', label: '' }];
      } else {
        client[row.key] = row.value;
      }
    } else {
      policy[row.key] = row.value;
      if (row.key === 'num_police' && row.value.length === 12) policy.code_branche = row.value.slice(4, 7);
    }
  });
  return { client, policy };
}

export default function FicheImportModal({ file, accessToken, onClose, onApply }) {
  const [source, setSource] = useState('');
  const [aiNotice, setAiNotice] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('scanning');
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [text, setText] = useState('');
  const [showText, setShowText] = useState(false);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    let active = true;
    scanFicheWithAI(file, accessToken)
      .catch((aiError) => {
        if (active) setAiNotice(`Lecture IA indisponible (${aiError.message}). Lecture locale utilisée : moins précise sur les photos.`);
        return scanFiche(file, (value) => { if (active) setProgress(value); });
      })
      .then((result) => {
        if (!active) return;
        setSource(result.source);
        setText(result.text);
        setRows(result.fields.map((field) => ({ ...field, use: Boolean(field.value) && !field.warning })));
        setStatus('done');
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'La lecture du document a échoué.');
        setStatus('error');
      });
    return () => { active = false; };
  }, [file, accessToken]);

  function change(key, value) {
    setRows((current) => current.map((row) => (row.key === key
      ? { ...row, value, warning: checkValue(row.type, value), use: Boolean(value) }
      : row)));
  }

  const selected = rows.filter((row) => row.use && row.value).length;
  const blocking = rows.some((row) => row.use && row.value && row.warning);

  return (
    <div className="fiche-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="fiche-dialog" role="dialog" aria-modal="true" aria-label="Importer une fiche client">
        <header>
          <div><span>GESTION DES CLIENTS · IMPORT</span><h2>Importer une fiche (OCR)</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="fiche-body">
          <aside className="fiche-preview">
            {previewUrl && <img src={previewUrl} alt="Document importé" />}
            <small>{file?.name}</small>
          </aside>

          <div className="fiche-results">
            {status === 'scanning' && (
              <div className="fiche-progress" role="status">
                <strong>Lecture du document… {Math.round(progress * 100)} %</strong>
                <div><i style={{ width: `${Math.max(4, progress * 100)}%` }} /></div>
                <small>Analyse par l’IA (français et arabe). Si elle est indisponible, une lecture locale prend le relais.</small>
              </div>
            )}
            {status === 'error' && <p className="fiche-error" role="alert">{error}</p>}
            {status === 'done' && <>
              {aiNotice && <p className="fiche-error" role="status">{aiNotice}</p>}
              <p className="fiche-hint">{source === 'ai' ? 'Lu par l’IA. ' : ''}Vérifiez et corrigez les informations détectées, puis cochez celles à appliquer. Les valeurs suspectes sont signalées.</p>
              {GROUPS.map((group) => (
                <fieldset key={group.id}>
                  <legend>{group.label}</legend>
                  {rows.filter((row) => row.group === group.id).map((row) => (
                    <label className={`fiche-row${row.warning ? ' has-warning' : ''}`} key={row.key}>
                      <input type="checkbox" checked={row.use} disabled={!row.value} onChange={(event) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, use: event.target.checked } : item)))} />
                      <span>{row.label}</span>
                      <input type="text" value={row.value} placeholder="Non détecté" onChange={(event) => change(row.key, event.target.value)} />
                      {row.warning && <em>{row.warning}</em>}
                    </label>
                  ))}
                </fieldset>
              ))}
              <button type="button" className="fiche-link" onClick={() => setShowText(!showText)}>{showText ? 'Masquer' : 'Afficher'} le texte lu</button>
              {showText && <pre className="fiche-text" dir="auto">{text || '(aucun texte détecté)'}</pre>}
            </>}
          </div>
        </div>

        <footer>
          <span>{status === 'done' ? `${selected} champ(s) à appliquer` : ''}</span>
          <div>
            <button type="button" className="fiche-secondary" onClick={onClose}>Annuler</button>
            <button type="button" className="fiche-primary" disabled={status !== 'done' || selected === 0 || blocking} onClick={() => onApply(buildPatches(rows))} title={blocking ? 'Corrigez les valeurs signalées ou décochez-les' : undefined}>Appliquer au dossier</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
