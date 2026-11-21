import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { isStatementCompany, listCompanies } from '../../services/companyApi';
import { getClientAccounts } from '../../services/journalApi';
import { searchClients } from '../../services/clientApi';
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
const COLUMNS = [['prime', 'Prime'], ['ristourne', 'Ristourne'], ['sinistre', 'Sinistre'], ['reglement', 'Règlement'], ['reste', 'Reste à payer'], ['commission', 'Commission']];

// The detail lines (client, company, quittance) grouped client by client, then company by company, with their totals.
export function groupAccountLines(lines) {
  const clients = [];
  lines.forEach((line) => {
    let client = clients[clients.length - 1];
    if (!client || client.code !== line.code_client) {
      client = { code: line.code_client, nom: line.nom_client, companies: [], total: 0, regle: 0, reste: 0 };
      clients.push(client);
    }
    const name = line.nom_compagnie || 'Compagnie non renseignée';
    let company = client.companies[client.companies.length - 1];
    if (!company || company.name !== name) {
      company = { name, lines: [], total: 0, regle: 0, reste: 0 };
      client.companies.push(company);
    }
    company.lines.push(line);
    [company, client].forEach((group) => {
      group.total += Number(line.prime || 0);
      group.regle += Number(line.regle || 0);
      group.reste += Number(line.reste || 0);
    });
  });
  return clients;
}

function SheetHead({ params, subtitle }) {
  return <header className="jrn-sheet-head">
    <div className="jrn-agency">{AGENCY_PYRAMID.map((line) => <span key={line}>{line}</span>)}</div>
    <div className="jrn-sheet-title"><h1>ETAT DES COMPTES CLIENT</h1><p>{params.debut ? `Période du ${formatDate(params.debut)} au ${formatDate(params.fin)}` : 'Toutes périodes'}</p>{subtitle && <p>{subtitle}</p>}</div>
    <div className="jrn-agency jrn-printed"><span>Date : {formatDate(today())}</span></div>
  </header>;
}

// Synthèse (administrator): one line per client.
function SummaryTable({ data }) {
  return <table className="jrn-sheet-table jrn-accounts-table">
    <thead><tr><th>Code</th><th>Nom client</th>{COLUMNS.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
    <tbody>
      {data.items.map((row) => <tr key={row.code_client}><td>{row.code_client}</td><td>{row.nom_client}</td>{COLUMNS.map(([key]) => <td key={key} className="num">{fmt(row[key])}</td>)}</tr>)}
      {!data.items.length && <tr><td colSpan={COLUMNS.length + 2} className="jrn-sheet-state">Aucun mouvement pour ces critères.</td></tr>}
    </tbody>
    <tfoot><tr><td colSpan={2}>Total ({data.items.length} client{data.items.length > 1 ? 's' : ''})</td>{COLUMNS.map(([key]) => <td key={key} className="num">{fmt(data.totals[key])}</td>)}</tr></tfoot>
  </table>;
}

// Détail (every user; the only one an employee gets): each client, each of its companies, the quittances and their primes.
function DetailTables({ data }) {
  const clients = useMemo(() => groupAccountLines(data.lines), [data.lines]);
  if (!clients.length) return <p className="jrn-sheet-state">Aucun mouvement pour ces critères.</p>;
  return <div className="jrn-accounts-detail">
    {clients.map((client) => <section className="jrn-account-client" key={client.code}>
      <h2><span>Code client : {client.code}</span><span>Nom client : {client.nom || '—'}</span></h2>
      {client.companies.map((company) => <Fragment key={company.name}>
        <h3>Compagnie : {company.name}</h3>
        <table className="jrn-sheet-table jrn-account-lines">
          <thead><tr><th>Date</th><th>N° Police</th><th>N° Quittance</th><th>Primes</th><th>Réglé</th><th>Reste à payer</th></tr></thead>
          <tbody>{company.lines.map((line) => <tr key={line.num_quittance}><td>{formatDate(line.echeance)}</td><td>{line.num_police}</td><td>{line.num_quittance}</td><td className="num">{fmt(line.prime)}</td><td className="num">{fmt(line.regle)}</td><td className="num">{fmt(line.reste)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Total {company.name}</td><td className="num">{fmt(company.total)}</td><td className="num">{fmt(company.regle)}</td><td className="num">{fmt(company.reste)}</td></tr></tfoot>
        </table>
      </Fragment>)}
      <p className="jrn-account-total"><span>Total {client.nom || client.code}</span><strong>{fmt(client.total)}</strong></p>
      <p className="jrn-account-total"><span>Réglé · Reste à payer</span><strong>{fmt(client.regle)} · {fmt(client.reste)}</strong></p>
    </section>)}
    <p className="jrn-account-total is-grand"><span>Total général ({clients.length} client{clients.length > 1 ? 's' : ''})</span><strong>{fmt(data.total)}</strong></p>
    {data.total_reste != null && <p className="jrn-account-total is-grand"><span>Réglé · Reste à payer</span><strong>{fmt(data.total_regle)} · {fmt(data.total_reste)}</strong></p>}
  </div>;
}

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
        <SheetHead params={params} subtitle={subtitle} />
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p>
          : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p>
          : data.presentation === 'detail' ? <DetailTables data={data} /> : <SummaryTable data={data} />}
      </article>
    </div>
  </div>;
}

// The client of the état: searched by code or name in the clients; picking one keeps its code (onPick(code, name)).
function ClientField({ value, name, onChange, onPick }) {
  const { accessToken } = useAuth();
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const text = value.trim();
    if (!open || text.length < 2 || name) { setResults([]); return undefined; }
    let active = true;
    const timer = setTimeout(() => {
      searchClients(accessToken, text, 10).then((rows) => { if (active) setResults(rows); }).catch(() => { if (active) setResults([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, value, open, name]);
  const nameOf = (row) => (row.nom_client || `${row.lastName || ''} ${row.firstName || ''}`).trim();
  return <label className="acompte-field jrn-company jrn-client-field"><span>Client (code ou nom)</span>
    <input value={value} placeholder="ex. 5060 ou BEN SALAH" autoFocus autoComplete="off" role="combobox" aria-controls="comptes-client-results" aria-expanded={open && results.length > 0}
      onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
    {name && <small className="jrn-client-name">{name}</small>}
    {open && results.length > 0 && <ul id="comptes-client-results" className="jrn-client-results" role="listbox" aria-label="Clients trouvés">
      {results.map((row) => <li key={row.clientCode} role="option" aria-selected={false}
        onMouseDown={(event) => { event.preventDefault(); onPick(row.clientCode, nameOf(row)); setOpen(false); }}>
        <b>{row.clientCode}</b> {nameOf(row)}
      </li>)}
    </ul>}
  </label>;
}

// Module "Etat des comptes client": the period (or all), the selection (all, a company, a client or a police) and
// the état of the quittances, then the aperçu in a tab of its own. The administrator chooses the synthèse (with the
// règlements and commissions) or the detail; any other user gets the detail, as in the legacy software.
export default function EtatComptesClientsModal({ moduleId, onClose }) {
  const { accessToken, user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const [between, setBetween] = useState(true);
  const [debut, setDebut] = useState(firstOfMonth);
  const [fin, setFin] = useState(today);
  const [scope, setScope] = useState('tous');
  const [value, setValue] = useState('');
  const [clientName, setClientName] = useState(''); // the client picked in the list
  const [etat, setEtat] = useState('tous');
  const [presentation, setPresentation] = useState('synthese');
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
  // a name typed but no client picked: the état needs the client's code
  const unpicked = scope === 'client' && Boolean(value.trim()) && !clientName && !/^\d+$/.test(value.trim());

  function preview() {
    setError('');
    const params = {
      debut: between ? debut : '', fin: between ? fin : '', etat, presentation: isAdmin ? presentation : 'detail',
      code_compagnie: scope === 'compagnie' ? value : '', code_client: scope === 'client' ? value.trim() : '', police: scope === 'police' ? value.trim() : '',
    };
    const company = companies.find((item) => String(item.code_compagnie) === String(value));
    const subtitle = [
      scope === 'compagnie' && `Compagnie : ${company?.nom_compagnie || value}`, scope === 'client' && `Client : ${value.trim()}${clientName ? ` ${clientName}` : ''}`,
      scope === 'police' && `Police : ${value.trim()}`, etat !== 'tous' && `Quittances : ${ETATS[etat].toLowerCase()}`,
    ].filter(Boolean).join(' · ');
    try {
      setReport({ popup: openReportWindow('Etat des comptes client'), params, subtitle });
    } catch (openError) { setError(openError.message); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal jrn-small" role="dialog" aria-modal="true" aria-labelledby="comptes-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId}</span><h2 id="comptes-title">Etat des comptes client</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="jrn-check"><input type="checkbox" checked={between} onChange={(event) => setBetween(event.target.checked)} />Entre deux dates</label>
          <label className="acompte-field jrn-date"><span>Date début</span><input type="date" value={debut} onChange={(event) => setDebut(event.target.value)} disabled={!between} /></label>
          <label className="acompte-field jrn-date"><span>Date fin</span><input type="date" value={fin} onChange={(event) => setFin(event.target.value)} disabled={!between} /></label>
        </div>
        <div className="unpaid-filter-form acompte-filters jrn-dates">
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Sélection</legend>
            {Object.entries(SCOPES).map(([key, label]) => <label key={key}><input type="radio" name="comptes-scope" checked={scope === key} onChange={() => { setScope(key); setValue(''); setClientName(''); }} /> {label}</label>)}
          </fieldset>
          {scope === 'compagnie' && <label className="acompte-field jrn-company"><span>Compagnie</span>
            <select value={value} onChange={(event) => setValue(event.target.value)}>
              <option value="">Choisir…</option>
              {companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.nom_compagnie}</option>)}
            </select>
          </label>}
          {scope === 'client' && <ClientField value={value} name={clientName} onChange={(text) => { setValue(text); setClientName(''); }} onPick={(code, nom) => { setValue(code); setClientName(nom); }} />}
          {scope === 'police' && <label className="acompte-field jrn-company"><span>N° police</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="N° police ou N° interne" autoFocus /></label>}
        </div>
        <div className="unpaid-filter-form acompte-filters jrn-dates">
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Etat quittance</legend>
            {Object.entries(ETATS).map(([key, label]) => <label key={key}><input type="radio" name="comptes-etat" checked={etat === key} onChange={() => setEtat(key)} /> {label}</label>)}
          </fieldset>
          {isAdmin && <fieldset className="unpaid-filter-set unpaid-choice"><legend>Présentation</legend>
            <label><input type="radio" name="comptes-presentation" checked={presentation === 'synthese'} onChange={() => setPresentation('synthese')} /> Synthèse</label>
            <label><input type="radio" name="comptes-presentation" checked={presentation === 'detail'} onChange={() => setPresentation('detail')} /> Détail par client</label>
          </fieldset>}
          <button type="button" className="expert-submit jrn-open" onClick={preview} disabled={missing || reversed || unpicked}>Aperçu</button>
        </div>
        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
        {reversed && <div className="expert-error unpaid-error" role="alert">La date de fin précède la date de début.</div>}
        {unpicked && <p className="jrn-hint">Choisissez le client dans la liste proposée.</p>}
        <p className="jrn-hint">{isAdmin && presentation === 'synthese'
          ? 'Synthèse : une ligne par client — prime, ristourne, montant réglé, reste à payer, commission (quittances d’échéance dans la période, sauf celles retournées à la compagnie) et sinistres payés dans la période.'
          : 'Détail : pour chaque client, ses quittances d’échéance dans la période, compagnie par compagnie, avec la prime, le montant réglé et le reste à payer de chacune, et les totaux.'}</p>
      </div>
    </section>
    {report && <NewWindow popup={report.popup} title="Etat des comptes client" onClose={() => setReport(null)}>
      <ComptesSheet params={report.params} subtitle={report.subtitle} onClose={() => setReport(null)} />
    </NewWindow>}
  </div>;
}
