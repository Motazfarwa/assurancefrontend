import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { isStatementCompany, listCompanies } from '../../services/companyApi';
import { getClientAccounts } from '../../services/journalApi';
import NewWindow, { openReportWindow } from '../NewWindow/NewWindow';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './JournalModal.css';
import { AGENCY_PYRAMID } from '../../data/agencyInfo';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => `${today().slice(0, 8)}01`;
const SCOPES = { tous: 'Tous', compagnie: 'Compagnie', client: 'Client', police: 'Police' };
const ETATS = { tous: 'Tous', comptabilise: 'Comptabilisées', instance: 'En instance', ristourne: 'Ristournes' };
const COLUMNS = [['prime', 'Prime'], ['ristourne', 'Ristourne'], ['sinistre', 'Sinistre'], ['reglement', 'Règlement'], ['commission', 'Commission']];

// The printable état: one line per client.
function ComptesSheet({ params, subtitle, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let active = true;
    getClientAccounts(accessToken, params)
      .then((data) => { if (active) setState({ loading: false, error: '', data }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, data: null }); });
    return () => { active = false; };
  }, [accessToken, params]);

  const { data } = state;
  return <div className="jrn-page">
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={(event) => event.currentTarget.ownerDocument.defaultView.print()} disabled={!data}>Imprimer</button><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button></div>
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-agency">{AGENCY_PYRAMID.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="jrn-sheet-title"><h1>ETAT DES COMPTES CLIENT</h1><p>{params.debut ? `Période du ${formatDate(params.debut)} au ${formatDate(params.fin)}` : 'Toutes périodes'}</p>{subtitle && <p>{subtitle}</p>}</div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(today())}</span></div>
        </header>
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p> : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p> : <table className="jrn-sheet-table jrn-accounts-table">
          <thead><tr><th>Code</th><th>Nom client</th>{COLUMNS.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
          <tbody>
            {data.items.map((row) => <tr key={row.code_client}><td>{row.code_client}</td><td>{row.nom_client}</td>{COLUMNS.map(([key]) => <td key={key} className="num">{fmt(row[key])}</td>)}</tr>)}
            {!data.items.length && <tr><td colSpan={COLUMNS.length + 2} className="jrn-sheet-state">Aucun mouvement pour ces critères.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={2}>Total ({data.items.length} client{data.items.length > 1 ? 's' : ''})</td>{COLUMNS.map(([key]) => <td key={key} className="num">{fmt(data.totals[key])}</td>)}</tr></tfoot>
        </table>}
      </article>
    </div>
  </div>;
}

// Module "Etat des comptes client": the period (or all), the selection (all, a company, a client or a police) and
// the état of the quittances, then the aperçu in a tab of its own.
export default function EtatComptesClientsModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [between, setBetween] = useState(true);
  const [debut, setDebut] = useState(firstOfMonth);
  const [fin, setFin] = useState(today);
  const [scope, setScope] = useState('tous');
  const [value, setValue] = useState('');
  const [etat, setEtat] = useState('tous');
  const [companies, setCompanies] = useState([]);
  const [report, setReport] = useState(null); // { popup, params, subtitle } of the open aperçu
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listCompanies(accessToken)
      .then((result) => { if (active) setCompanies((Array.isArray(result) ? result : result.items || []).filter(isStatementCompany)); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reversed = between && Boolean(debut && fin && fin < debut);
  const missing = (between && (!debut || !fin)) || (scope !== 'tous' && !value.trim());

  function preview() {
    setError('');
    const params = {
      debut: between ? debut : '', fin: between ? fin : '', etat,
      code_compagnie: scope === 'compagnie' ? value : '', code_client: scope === 'client' ? value.trim() : '', police: scope === 'police' ? value.trim() : '',
    };
    const company = companies.find((item) => String(item.code_compagnie) === String(value));
    const subtitle = [
      scope === 'compagnie' && `Compagnie : ${company?.nom_compagnie || value}`, scope === 'client' && `Client : ${value.trim()}`,
      scope === 'police' && `Police : ${value.trim()}`, etat !== 'tous' && `Quittances : ${ETATS[etat].toLowerCase()}`,
    ].filter(Boolean).join(' · ');
    try {
      setReport({ popup: openReportWindow('Etat des comptes client'), params, subtitle });
    } catch (openError) { setError(openError.message); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal jrn-small" role="dialog" aria-modal="true" aria-labelledby="comptes-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>COMPTABILITE · MODULE {moduleId}</span><h2 id="comptes-title">Etat des comptes client</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="jrn-check"><input type="checkbox" checked={between} onChange={(event) => setBetween(event.target.checked)} />Entre deux dates</label>
          <label className="acompte-field jrn-date"><span>Date début</span><input type="date" value={debut} onChange={(event) => setDebut(event.target.value)} disabled={!between} /></label>
          <label className="acompte-field jrn-date"><span>Date fin</span><input type="date" value={fin} onChange={(event) => setFin(event.target.value)} disabled={!between} /></label>
        </div>
        <div className="unpaid-filter-form acompte-filters jrn-dates">
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Sélection</legend>
            {Object.entries(SCOPES).map(([key, label]) => <label key={key}><input type="radio" name="comptes-scope" checked={scope === key} onChange={() => { setScope(key); setValue(''); }} /> {label}</label>)}
          </fieldset>
          {scope === 'compagnie' && <label className="acompte-field jrn-company"><span>Compagnie</span>
            <select value={value} onChange={(event) => setValue(event.target.value)}>
              <option value="">Choisir…</option>
              {companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.nom_compagnie}</option>)}
            </select>
          </label>}
          {scope === 'client' && <label className="acompte-field jrn-date"><span>Code client</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="ex. 5060" autoFocus /></label>}
          {scope === 'police' && <label className="acompte-field jrn-company"><span>N° police</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="N° police ou N° interne" autoFocus /></label>}
        </div>
        <div className="unpaid-filter-form acompte-filters jrn-dates">
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Etat quittance</legend>
            {Object.entries(ETATS).map(([key, label]) => <label key={key}><input type="radio" name="comptes-etat" checked={etat === key} onChange={() => setEtat(key)} /> {label}</label>)}
          </fieldset>
          <button type="button" className="expert-submit jrn-open" onClick={preview} disabled={missing || reversed}>Aperçu</button>
        </div>
        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
        {reversed && <div className="expert-error unpaid-error" role="alert">La date de fin précède la date de début.</div>}
        <p className="jrn-hint">Quittances d’échéance dans la période, sauf les quittances retournées à la compagnie : prime, ristourne (quittances de ristourne), règlements reçus du client et commission. Sinistre : sinistres payés au client dans la période.</p>
      </div>
    </section>
    {report && <NewWindow popup={report.popup} title="Etat des comptes client" onClose={() => setReport(null)}>
      <ComptesSheet params={report.params} subtitle={report.subtitle} onClose={() => setReport(null)} />
    </NewWindow>}
  </div>;
}
