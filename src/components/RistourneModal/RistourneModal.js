import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createRistourne, deleteRistourne, getRistourne, getRistournePolicy, searchRistournes, updateRistourne } from '../../services/ristourneApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../CompanyManagementModal/CompanyManagementModal.css';
import './RistourneModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const day = (value) => (value ? String(value).slice(0, 10) : '');
const formatDate = (value) => (value ? day(value).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const round3 = (value) => Math.round(Number(value || 0) * 1000) / 1000;

const blank = () => ({
  num_ristourne: '', num_police: '', date_du: today(), date_au: today(), date_saisie: today(),
  nette: '', decommission: '', detaxe: '', observation: '', informations: '',
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
  const numberRef = useRef(null);
  const searchId = useRef(0);
  const editing = mode !== 'view';

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (search) setSearch(null); else if (editing) cancel(); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function show(item) {
    setCurrent(item); setForm(toForm(item)); setPolicy(item); setMode('view');
  }

  function reset(message = '') {
    setCurrent(null); setForm(blank()); setPolicy(null); setMode('view'); setNotice(message);
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
    try { setPolicy(await getRistournePolicy(accessToken, number)); setError(''); }
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
    const values = {
      ...form,
      num_police: policy.num_police || form.num_police,
      date_du: form.date_du || null, date_au: form.date_au || null, date_saisie: form.date_saisie || null,
      nette: round3(form.nette), decommission: round3(form.decommission), detaxe: round3(form.detaxe),
    };
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = mode === 'new' ? await createRistourne(accessToken, values) : await updateRistourne(accessToken, current.num_ristourne, values);
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

  const totale = editing ? round3(Number(form.nette || 0) + Number(form.detaxe || 0)) : current?.totale;
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
          </>}
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
          </div>
        </div>

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
    </section>
  </div>;
}
