import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createFrais, getFraisOptions, listFrais } from '../../services/fraisApi';
import NewWindow, { openReportWindow } from '../NewWindow/NewWindow';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../CompanyManagementModal/CompanyManagementModal.css';
import '../RistourneModal/RistourneModal.css';
import '../JournalModal/JournalModal.css';
import './FraisGenerauxModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const AGENCY = ['Cabinet d’Assurance Jemmali', '1, Rue d’Arabie Saoudite', '1002 - Tunis', 'Tél : 71 893 000', 'Fax : 71 891 891'];

const entry = (nature = 'D', banque = '') => ({ nature, code_type: '', mode: 'C', date_dep: today(), num_piece: '', code_banque: banque, montant: '', observation: '' });

// The printable list of the frais of a nature over a period, shown in a browser tab of its own.
function FraisSheet({ nature, natureLabel, debut, fin, options, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const modeLabel = (code) => options?.modes.find((mode) => mode.code === code)?.libelle || code;

  useEffect(() => {
    let active = true;
    listFrais(accessToken, { nature, debut, fin })
      .then((data) => { if (active) setState({ loading: false, error: '', data }); })
      .catch((loadError) => { if (active) setState({ loading: false, error: loadError.message, data: null }); });
    return () => { active = false; };
  }, [accessToken, nature, debut, fin]);

  const { data } = state;
  return <div className="jrn-page">
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={(event) => event.currentTarget.ownerDocument.defaultView.print()} disabled={!data}>Imprimer</button><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button></div>
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-agency">{AGENCY.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="jrn-sheet-title"><h1>{natureLabel}</h1><p>Période du {formatDate(debut)} au {formatDate(fin)}</p></div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(today())}</span></div>
        </header>
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p> : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p> : <table className="jrn-sheet-table frg-sheet-table">
          <thead><tr><th>N°</th><th>Date</th><th>Type frais</th><th>Mode</th><th>N° pièce</th><th>Compte</th><th>Observation</th><th>Montant</th></tr></thead>
          <tbody>
            {data.items.map((item) => <tr key={item.num_dep}>
              <td>{item.num_dep}</td><td>{formatDate(item.date_dep)}</td><td>{item.libelle || item.code_type}</td><td>{modeLabel(item.mode)}</td><td>{item.num_piece}</td><td>{item.code_banque}</td><td>{item.observation}</td><td className="num">{fmt(item.montant)}</td>
            </tr>)}
            {!data.items.length && <tr><td colSpan={8} className="jrn-sheet-state">Aucun frais sur la période.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={7}>Total ({data.items.length} frais)</td><td className="num">{fmt(data.total)}</td></tr></tfoot>
        </table>}
      </article>
    </div>
  </div>;
}

// Module "Saisie frais généraux" (administrateur): the agency's expenses (salaires, loyers, téléphone…), entered by
// nature and type; the frais of a period open as an aperçu in a tab of their own.
export default function FraisGenerauxModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState(entry);
  const [period, setPeriod] = useState({ debut: monthStart(), fin: today() });
  const [report, setReport] = useState(null); // { popup, nature, debut, fin } of the open aperçu
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const typeRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    let active = true;
    getFraisOptions(accessToken)
      .then((body) => { if (!active) return; setOptions(body); setForm((values) => ({ ...values, code_banque: body.banque_par_nature?.[values.nature] || '' })); })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [accessToken]);

  const nature = options?.natures.find((item) => item.code === form.nature);
  const natureLabel = (code) => options?.natures.find((item) => item.code === code)?.libelle || 'Frais généraux';
  const typeLabel = (code) => nature?.types.find((type) => type.code_type === code)?.libelle || code;
  const reversed = Boolean(period.debut && period.fin && period.fin < period.debut);

  function change(event) {
    const { name, value } = event.target;
    if (name === 'nature') setForm(entry(value, options?.banque_par_nature?.[value] || ''));
    else setForm((values) => ({ ...values, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await createFrais(accessToken, { ...form, montant: Math.round(Number(form.montant) * 1000) / 1000, date_piece: null });
      setNotice(`Frais n° ${saved.num_dep} enregistré : ${typeLabel(form.code_type)}, ${fmt(form.montant)} DT.`);
      setForm((values) => ({ ...entry(values.nature, values.code_banque), mode: values.mode, date_dep: values.date_dep }));
      typeRef.current?.focus();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  }

  // The aperçu opens in a browser tab of its own; a new aperçu replaces the previous tab (NewWindow closes it).
  function preview() {
    setError('');
    try { setReport({ popup: openReportWindow(natureLabel(form.nature)), nature: form.nature, ...period }); }
    catch (openError) { setError(openError.message); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="catalog-modal frg-modal" role="dialog" aria-modal="true" aria-labelledby="frg-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>COMPTABILITÉ · MODULE {moduleId}</span><h2 id="frg-title">Saisie frais généraux</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="catalog-body">
        <form className="catalog-section" onSubmit={save}>
          <div className="frg-grid">
            <label className="catalog-field"><span>Nature frais</span>
              <select name="nature" value={form.nature} onChange={change} disabled={!options}>{options?.natures.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}</select>
            </label>
            <label className="catalog-field frg-type"><span>Type frais</span>
              <select ref={typeRef} name="code_type" value={form.code_type} onChange={change} required disabled={!options} autoFocus>
                <option value="">Choisir le type de frais…</option>
                {nature?.types.map((type) => <option key={type.code_type} value={type.code_type}>{type.libelle}</option>)}
              </select>
            </label>
            <label className="catalog-field"><span>Mode paiement</span>
              <select name="mode" value={form.mode} onChange={change} disabled={!options}>{options?.modes.map((mode) => <option key={mode.code} value={mode.code}>{mode.libelle}</option>)}</select>
            </label>
            <label className="catalog-field"><span>N° pièce</span><input name="num_piece" value={form.num_piece} onChange={change} maxLength={20} autoComplete="off" /></label>
            <label className="catalog-field"><span>Date</span><input type="date" name="date_dep" value={form.date_dep} onChange={change} required /></label>
            <label className="catalog-field"><span>Compte (banque)</span>
              <select name="code_banque" value={form.code_banque} onChange={change} disabled={!options}>
                <option value="">—</option>
                {options?.banques.map((bank) => <option key={bank.code_banque} value={bank.code_banque}>{bank.code_banque}{bank.nom_banque && bank.nom_banque !== bank.code_banque ? ` · ${bank.nom_banque}` : ''}</option>)}
              </select>
            </label>
            <label className="catalog-field"><span>Montant (DT)</span><input type="number" name="montant" value={form.montant} onChange={change} step="0.001" min="0.001" required /></label>
            <label className="catalog-field frg-obs"><span>Observation</span><input name="observation" value={form.observation} onChange={change} maxLength={50} placeholder="Ex. SALAIRE 10/2026, FACTURE STEG…" /></label>
          </div>
          <div className="frg-actions"><button type="submit" className="expert-submit" disabled={busy || !options}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
        </form>

        {error && <div className="expert-error catalog-message rst-message" role="alert">{error}</div>}
        {notice && <div className="catalog-notice" role="status">{notice}</div>}

        <div className="catalog-section frg-preview">
          <strong>{natureLabel(form.nature)} saisis</strong>
          <label className="catalog-field"><span>Du</span><input type="date" value={period.debut} onChange={(event) => setPeriod((value) => ({ ...value, debut: event.target.value }))} /></label>
          <label className="catalog-field"><span>Au</span><input type="date" value={period.fin} min={period.debut} onChange={(event) => setPeriod((value) => ({ ...value, fin: event.target.value }))} /></label>
          <button type="button" className="expert-submit" onClick={preview} disabled={!options || !period.debut || !period.fin || reversed}>Aperçu</button>
        </div>
        <div className="rst-spacer" />
      </div>
    </section>
    {report && <NewWindow popup={report.popup} title={`${natureLabel(report.nature)} du ${formatDate(report.debut)} au ${formatDate(report.fin)}`} onClose={() => setReport(null)}>
      <FraisSheet nature={report.nature} natureLabel={natureLabel(report.nature)} debut={report.debut} fin={report.fin} options={options} onClose={() => setReport(null)} />
    </NewWindow>}
  </div>;
}
