import { Fragment, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createRistourne, deleteRistourne, extractRistournes, getRistourne, getRistournePolicy, searchRistournes, updateRistourne } from '../../services/ristourneApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../CompanyManagementModal/CompanyManagementModal.css';
import DocumentImportDialog from '../DocumentImportDialog/DocumentImportDialog';
import './RistourneModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const day = (value) => (value ? String(value).slice(0, 10) : '');
const formatDate = (value) => (value ? day(value).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const round3 = (value) => Math.round(Number(value || 0) * 1000) / 1000;

const blank = () => ({
  num_ristourne: '', num_police: '', date_du: today(), date_au: today(), date_saisie: today(),
  nette: '', decommission: '', detaxe: '', totale: '', observation: '', informations: '',
});
const toForm = (item) => ({
  num_ristourne: item.num_ristourne || '', num_police: item.num_police || item.num_int || '',
  date_du: day(item.date_du), date_au: day(item.date_au), date_saisie: day(item.date_saisie),
  nette: item.nette ?? '', decommission: item.decommission ?? '', detaxe: item.detaxe ?? '',
  observation: item.observation || '', informations: item.informations || '',
});

// Module "Gestion des ristournes": a ristourne is a receipt of type R given back to the client on a policy
// (ristourne totale = nette + détaxe; the solde is what is still to pay to the client).
export default function RistourneModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [mode, setMode] = useState('view'); // view | new | edit
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState(blank);
  const [policy, setPolicy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState(null); // { q, items, loading }
  const [imported, setImported] = useState(null); // the document read: { compagnie, type_document, date_document, source, lignes }
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null); // the document being read in the import window
  const [importLine, setImportLine] = useState(null); // index of the imported line in the form
  const [savedLines, setSavedLines] = useState([]);
  const [lineWarnings, setLineWarnings] = useState([]);
  const fileRef = useRef(null);
  const numberRef = useRef(null);
  const searchId = useRef(0);
  const editing = mode !== 'view';

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (search) setSearch(null); else if (showImport) setShowImport(false); else if (editing) cancel(); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function show(item) {
    setCurrent(item); setForm(toForm(item)); setPolicy(item); setMode('view'); setImportLine(null); setLineWarnings([]);
  }

  // Once the import window has read the document: the list of its ristournes, to load one by one into the form.
  function applyImport(document) {
    setImportFile(null); setError(''); setNotice('');
    setImported({ ...document, fileName: importFile?.name }); setSavedLines([]); setShowImport(true);
  }

  const summarizeImport = (document) => {
    const lines = document.lignes || [];
    const rows = [['Compagnie', document.compagnie], ['Document', document.type_document], ['Date du document', formatDate(document.date_document)], ['Ristournes lues', String(lines.length)]];
    lines.forEach((line, index) => {
      const prefix = lines.length > 1 ? `Ligne ${index + 1} · ` : '';
      rows.push([`${prefix}N° ristourne`, line.num_ristourne], [`${prefix}Police`, [line.num_police, line.policy?.nom_client && `→ ${line.policy.nom_client}`].filter(Boolean).join(' ')],
        [`${prefix}Période`, [formatDate(line.date_du), formatDate(line.date_au)].filter(Boolean).join(' → ')],
        [`${prefix}Nette / Décom. / Détaxe`, [line.nette, line.decommission, line.detaxe].map((value) => (value == null ? '—' : fmt(value))).join(' / ')],
        [`${prefix}Totale`, line.totale == null ? '' : fmt(line.totale)]);
      if (line.colonnes?.length) rows.push([`${prefix}Colonnes du document`, line.colonnes.map((column) => `${column.libelle} ${fmt(column.valeur)}`).join(' · ')]);
    });
    return {
      rows: lines.length ? rows.filter(([, value]) => value !== undefined) : [],
      empty: 'Aucune ristourne trouvée dans ce document.',
      note: `Lu par OCR${document.engine === 'serveur' ? ' (texte imprimé et manuscrit)' : ' dans le navigateur'}. « Voir les ristournes lues » ouvre la liste : vérifiez chaque montant avec le document, puis enregistrez.`,
      warnings: [...new Set(lines.flatMap((line) => line.warnings || []))],
    };
  };

  // Puts one line of the document in the form as a new ristourne; the user checks it, then saves it.
  function loadLine(line, index) {
    setCurrent(null);
    setForm({
      ...blank(), num_ristourne: line.num_ristourne || '', num_police: line.num_police || '',
      date_du: line.date_du || '', date_au: line.date_au || '',
      nette: line.nette ?? '', decommission: line.decommission ?? '', detaxe: line.detaxe ?? '',
      totale: line.totale ?? '', // the Prime Totale printed on the quittance
      observation: (line.motif || '').slice(0, 50),
    });
    setPolicy(line.policy || (line.candidates?.length ? { candidates: line.candidates } : null));
    setMode('new'); setImportLine(index); setLineWarnings(line.warnings || []); setShowImport(false); setError('');
    setNotice(`Ligne ${index + 1} du document chargée : vérifiez chaque champ avec le document, puis Enregistrer.`);
  }

  function reset(message = '') {
    setCurrent(null); setForm(blank()); setPolicy(null); setMode('view'); setNotice(message); setImportLine(null); setLineWarnings([]);
  }

  async function open(number) {
    if (!String(number).trim()) return;
    setBusy(true); setError(''); setNotice('');
    try { show(await getRistourne(accessToken, number)); setSearch(null); }
    catch (openError) { setError(openError.message); }
    finally { setBusy(false); }
  }

  async function lookupPolicy(number) {
    if (!String(number).trim()) { setPolicy(null); return; }
    try {
      const found = await getRistournePolicy(accessToken, number);
      setPolicy(found.candidates ? { candidates: found.candidates } : found); // a shared number: the user chooses
      setError('');
    }
    catch (policyError) { setPolicy(null); setError(policyError.message); }
  }

  function change(event) {
    const { name, value } = event.target;
    setForm((values) => ({ ...values, [name]: value }));
  }

  function startNew() {
    setCurrent(null); setForm(blank()); setPolicy(null); setMode('new'); setError(''); setNotice('');
    setTimeout(() => numberRef.current?.focus(), 0);
  }

  function cancel() {
    if (current) show(current); else reset();
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    if (!policy) { setError('Saisissez une police existante.'); return; }
    if (!policy.num_int || policy.candidates) { setError('Plusieurs polices portent ce n° : choisissez la bonne police.'); return; }
    const values = {
      ...form,
      num_police: policy.num_police || form.num_police,
      num_int: policy.num_int,
      date_du: form.date_du || null, date_au: form.date_au || null, date_saisie: form.date_saisie || null,
      nette: round3(form.nette), decommission: round3(form.decommission), detaxe: round3(form.detaxe),
      totale: form.totale === '' || form.totale == null ? null : round3(form.totale),
    };
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = mode === 'new' ? await createRistourne(accessToken, values) : await updateRistourne(accessToken, current.num_ristourne, values);
      if (mode === 'new' && importLine !== null) setSavedLines((lines) => [...lines, importLine]);
      show(saved);
      setNotice(mode === 'new' ? `Ristourne ${saved.num_ristourne} ajoutée.` : `Ristourne ${saved.num_ristourne} modifiée.`);
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!current || !window.confirm(`Supprimer la ristourne ${current.num_ristourne} ?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await deleteRistourne(accessToken, current.num_ristourne); reset(`Ristourne ${current.num_ristourne} supprimée.`); }
    catch (deleteError) { setError(deleteError.message); }
    finally { setBusy(false); }
  }

  async function runSearch(q) {
    const id = ++searchId.current; // only the latest search fills the list
    setSearch({ q, items: search?.items || [], loading: true });
    try { const body = await searchRistournes(accessToken, q); if (id === searchId.current) setSearch({ q, items: body.items || [], loading: false }); }
    catch (searchError) { if (id === searchId.current) setSearch({ q, items: [], loading: false, error: searchError.message }); }
  }

  // Ristourne totale: the Prime Totale of the imported quittance, else nette + détaxe.
  const totale = editing ? (form.totale !== '' && form.totale != null ? round3(form.totale) : round3(Number(form.nette || 0) + Number(form.detaxe || 0))) : current?.totale;
  const paid = current ? round3(Number(current.totale || 0) - Number(current.solde || 0)) : 0;
  const solde = editing ? round3(totale - paid) : current?.solde;
  const locked = Boolean(current?.comptabilise);
  const field = (name, label, props = {}) => <label className="catalog-field" key={name}><span>{label}</span><input name={name} value={form[name]} onChange={change} readOnly={!editing} {...props} /></label>;
  const shown = (label, value) => <label className="catalog-field" key={label}><span>{label}</span><input value={value ?? ''} readOnly tabIndex={-1} /></label>;

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !editing) onClose(); }}>
    <section className="catalog-modal rst-modal" role="dialog" aria-modal="true" aria-labelledby="rst-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId}</span><h2 id="rst-title">Gestion des ristournes</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <form className="catalog-body" onSubmit={save}>
        <div className="rst-toolbar">
          {editing ? <>
            <button type="submit" className="expert-submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            <button type="button" className="expert-cancel" onClick={cancel} disabled={busy}>Annuler</button>
          </> : <>
            <button type="button" className="expert-submit" onClick={startNew} disabled={busy}>Ajouter</button>
            <button type="button" className="expert-cancel" onClick={() => { setMode('edit'); setNotice(''); }} disabled={busy || !current || locked}>Modifier</button>
            <button type="button" className="catalog-delete" onClick={remove} disabled={busy || !current || locked}>Supprimer</button>
            <button type="button" className="expert-cancel" onClick={() => runSearch('')} disabled={busy}>Chercher</button>
            <button type="button" className="expert-cancel rst-import" onClick={() => fileRef.current?.click()} disabled={busy} title="PDF ou image (JPG, PNG) d’un avis ou bordereau de ristourne">⬆ Importer un document</button>
            {imported && <button type="button" className="expert-cancel" onClick={() => setShowImport(true)} disabled={busy}>Lignes importées ({savedLines.length}/{imported.lignes.length})</button>}
          </>}
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setImportFile(file); }} />
          {locked && !editing && <span className="rst-lock">Comptabilisée le {formatDate(current.date_comptabilise)} : non modifiable</span>}
        </div>

        <div className="catalog-section">
          <div className="rst-grid">
            <label className="catalog-field"><span>N° ristourne</span>
              <input ref={numberRef} name="num_ristourne" value={form.num_ristourne} onChange={change} maxLength={15} required readOnly={mode === 'edit'} autoComplete="off" autoFocus
                placeholder={mode === 'new' ? 'Nouveau n°' : 'N° puis Entrée'}
                onKeyDown={(event) => { if (event.key === 'Enter' && mode === 'view') { event.preventDefault(); open(form.num_ristourne); } }}
                onBlur={() => { if (mode === 'view' && form.num_ristourne && form.num_ristourne !== current?.num_ristourne) open(form.num_ristourne); }} />
            </label>
            {shown('Compagnie', policy?.nom_compagnie)}
            {shown('Branche', policy ? [policy.code_branche, policy.nom_branche].filter(Boolean).join(' · ') : '')}
            {field('num_police', 'Police', { required: true, maxLength: 20, onBlur: () => { if (editing) lookupPolicy(form.num_police); }, onKeyDown: (event) => { if (event.key === 'Enter' && editing) { event.preventDefault(); lookupPolicy(form.num_police); } } })}
            {shown('Date règlement', formatDate(current?.date_reglement))}
            {shown('Date comptabilisé', formatDate(current?.date_comptabilise))}
            {field('date_du', 'Date du', { type: 'date' })}
            {field('date_au', 'Au', { type: 'date', min: form.date_du || undefined })}
            {field('date_saisie', 'Date saisie', { type: 'date' })}
            {shown('Code client', policy?.code_client)}
            <label className="catalog-field rst-wide"><span>Nom client</span><input value={policy?.nom_client ?? ''} readOnly tabIndex={-1} /></label>
            {editing && policy?.candidates && <label className="catalog-field rst-full rst-choose"><span>Plusieurs polices portent le n° {form.num_police} : choisissez la bonne</span>
              <select value="" onChange={(event) => setPolicy(policy.candidates.find((item) => item.num_int === event.target.value) || policy)}>
                <option value="">— Choisir la police —</option>
                {policy.candidates.map((item) => <option key={item.num_int} value={item.num_int}>{item.nom_client || 'Client sans nom'} · client {item.code_client} · {item.nom_compagnie || item.code_compagnie} · {[item.code_branche, item.nom_branche].filter(Boolean).join(' ')} (n° interne {item.num_int})</option>)}
              </select>
            </label>}
          </div>
        </div>
        {editing && lineWarnings.length > 0 && <div className="rst-warnings" role="note"><strong>À vérifier sur le document :</strong><ul>{lineWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}

        <div className="catalog-section">
          <div className="rst-grid">
            {field('nette', 'Ristourne nette (DT)', { type: 'number', step: '0.001', min: 0, required: true })}
            {field('decommission', 'Décommission (DT)', { type: 'number', step: '0.001', min: 0 })}
            {field('detaxe', 'Détaxe (DT)', { type: 'number', step: '0.001', min: 0 })}
            {shown('Ristourne totale (DT)', current || editing ? fmt(totale) : '')}
            {shown('Solde ristourne (DT)', current || editing ? fmt(solde) : '')}
            <span />
            <label className="catalog-field rst-full"><span>Observation</span><input name="observation" value={form.observation} onChange={change} readOnly={!editing} maxLength={50} /></label>
            <label className="catalog-field rst-full"><span>Informations supplémentaires</span><textarea name="informations" value={form.informations} onChange={change} readOnly={!editing} maxLength={200} rows={2} /></label>
          </div>
        </div>

        {error && <div className="expert-error catalog-message rst-message" role="alert">{error}</div>}
        {notice && <div className="catalog-notice" role="status">{notice}</div>}
        <div className="rst-spacer" />
      </form>

      {search && <div className="rst-search" role="dialog" aria-label="Chercher une ristourne">
        <div className="rst-search-head">
          <input value={search.q} onChange={(event) => runSearch(event.target.value)} placeholder="N° ristourne, police, code ou nom client" autoFocus />
          <button type="button" className="expert-cancel" onClick={() => setSearch(null)}>Fermer</button>
        </div>
        <div className="rst-search-list">
          {search.error ? <p className="rst-empty" role="alert">{search.error}</p> : !search.items.length ? <p className="rst-empty">{search.loading ? 'Recherche…' : 'Aucune ristourne.'}</p> : <table>
            <thead><tr><th>N° ristourne</th><th>Date saisie</th><th>Police</th><th>Client</th><th>Compagnie</th><th className="num">Totale</th><th className="num">Solde</th></tr></thead>
            <tbody>{search.items.map((item) => <tr key={item.num_ristourne} onClick={() => open(item.num_ristourne)}>
              <td>{item.num_ristourne}</td><td>{formatDate(item.date_saisie)}</td><td>{item.num_police}</td><td>{item.nom_client}</td><td>{item.nom_compagnie}</td><td className="num">{fmt(item.totale)}</td><td className="num">{fmt(item.solde)}</td>
            </tr>)}</tbody>
          </table>}
        </div>
      </div>}

      {showImport && imported && <div className="rst-search" role="dialog" aria-label="Ristournes lues dans le document">
        <div className="rst-search-head rst-import-head">
          <div>
            <strong>{imported.lignes.length} ristourne{imported.lignes.length > 1 ? 's' : ''} lue{imported.lignes.length > 1 ? 's' : ''} dans {imported.fileName}</strong>
            <small>{[imported.type_document, imported.compagnie, imported.date_document && `du ${formatDate(imported.date_document)}`].filter(Boolean).join(' · ') || 'Document de ristourne'}
              {imported.source === 'ocr' && ' · lecture OCR simple : seules les polices reconnues sont listées, montants et dates à saisir'}</small>
          </div>
          <button type="button" className="expert-cancel" onClick={() => setShowImport(false)}>Fermer</button>
        </div>
        <p className="rst-import-hint">Rien n’est enregistré automatiquement. Chargez une ligne, vérifiez-la avec le document, puis Enregistrer. Une case vide signifie que la valeur n’est pas lisible sur le document.</p>
        <div className="rst-search-list">
          <table className="rst-import-table">
            <thead><tr><th>#</th><th>N° ristourne</th><th>Police</th><th>Client (document → base)</th><th>Du</th><th>Au</th><th className="num">Nette</th><th className="num">Décom.</th><th className="num">Détaxe</th><th className="num">Totale</th><th /></tr></thead>
            <tbody>{imported.lignes.map((line, index) => {
              const saved = savedLines.includes(index);
              return <Fragment key={index}>
                <tr className={saved ? 'is-saved' : line.warnings?.length ? 'has-warning' : ''}>
                  <td>{index + 1}</td><td>{line.num_ristourne || '—'}</td><td>{line.num_police || '—'}</td>
                  <td>{line.client || '—'}{line.policy && <small className="rst-db"> → {line.policy.nom_client} ({line.policy.nom_compagnie || line.policy.code_compagnie})</small>}</td>
                  <td>{formatDate(line.date_du) || '—'}</td><td>{formatDate(line.date_au) || '—'}</td>
                  <td className="num">{line.nette == null ? '—' : fmt(line.nette)}</td><td className="num">{line.decommission == null ? '—' : fmt(line.decommission)}</td>
                  <td className="num">{line.detaxe == null ? '—' : fmt(line.detaxe)}</td><td className="num">{line.totale == null ? '—' : fmt(line.totale)}</td>
                  <td className="rst-line-action">{saved ? <span className="rst-ok">Enregistrée</span>
                    : line.exists ? <button type="button" className="expert-cancel" onClick={() => { setShowImport(false); open(line.num_ristourne); }}>Ouvrir l’existante</button>
                    : <button type="button" className="expert-submit" onClick={() => loadLine(line, index)}>Charger</button>}</td>
                </tr>
                {line.colonnes?.length > 0 && !saved && <tr className="rst-columns-row"><td /><td colSpan={10}>Colonnes du document : {line.colonnes.map((column) => `${column.libelle} ${fmt(column.valeur)}`).join(' · ')}{line.immatriculation ? ` · Immatriculation ${line.immatriculation}` : ''}</td></tr>}
                {line.warnings?.length > 0 && !saved && <tr className="rst-warning-row"><td /><td colSpan={10}>{line.warnings.join(' · ')}</td></tr>}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
      </div>}
    </section>
    {importFile && <DocumentImportDialog file={importFile} kicker={`PRODUCTION · MODULE ${moduleId} · IMPORT`} title="Importer un document de ristourne" read={(onProgress) => extractRistournes(accessToken, importFile, onProgress)} summarize={summarizeImport} applyLabel="Voir les ristournes lues" onApply={applyImport} onClose={() => setImportFile(null)} />}
  </div>;
}
