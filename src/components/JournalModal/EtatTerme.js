import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { isBordereauCompany, listCompanies } from '../../services/companyApi';
import { getTermStatement } from '../../services/journalApi';
import NewWindow, { openReportWindow } from '../NewWindow/NewWindow';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './JournalModal.css';

const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const AGENCY = ['Cabinet d’Assurance Jemmali', '1, Rue d’Arabie Saoudite', '1002 - Tunis', 'Tél : 71 893 000', 'Fax : 71 891 891'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
// The next month by default (January after December).
const nextMonth = () => (new Date().getMonth() + 1) % 12 + 1;
// Current year minus birth year ends in 0 or 5: 20, 25, 40, 45. A client without a birth date is never marked.
const hasRoundAge = (birthYear) => {
  const age = new Date().getFullYear() - birthYear;
  return Boolean(birthYear) && age > 0 && age % 5 === 0;
};
// The lines by branche, in alphabetical order, with the policies without a branche last. Codes are reused between
// companies for different branches, so the name is what groups them; a code without a name stays as it is.
function groupByBranch(items) {
  const groups = new Map();
  items.forEach((row) => {
    const label = row.nom_branche || (row.code_branche ? `Branche ${row.code_branche}` : 'Branche non renseignée');
    if (!groups.has(label)) groups.set(label, { label, known: Boolean(row.code_branche), rows: [] });
    groups.get(label).rows.push(row);
  });
  return [...groups.values()].sort((a, b) => Number(b.known) - Number(a.known) || a.label.localeCompare(b.label, 'fr'));
}

// The printable état: one line per policy; a temporary policy (with an expiration date) says so in Observation.
export function TermeSheet({ params, month, companyName, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', items: [] });

  useEffect(() => {
    let active = true;
    getTermStatement(accessToken, params)
      .then((data) => { if (active) setState({ loading: false, error: '', items: data.items || [] }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, items: [] }); });
    return () => { active = false; };
  }, [accessToken, params]);

  const temporary = state.items.filter((row) => row.temporaire).length;
  const columns = companyName ? 9 : 10;
  return <div className="jrn-page">
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={(event) => event.currentTarget.ownerDocument.defaultView.print()} disabled={state.loading || Boolean(state.error)}>Imprimer</button><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button></div>
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-agency">{AGENCY.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="jrn-sheet-title"><h1>ETAT DE TERME DU MOIS {month}</h1>{companyName && <p>Compagnie : {companyName}</p>}</div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(today())}</span></div>
        </header>
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p> : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p> : <table className="jrn-sheet-table jrn-terme-table">
          <thead><tr><th>N° Police</th><th>Code Cli.</th><th>Nom Client</th>{!companyName && <th>Compagnie</th>}<th>Echéance</th><th>Unité</th><th>Durée</th><th>Tous Risque</th><th>Etat</th><th>Observation</th></tr></thead>
          {groupByBranch(state.items).map((group) => <tbody key={group.label}>
            <tr className="jrn-terme-branch"><td colSpan={columns}>{group.label} · {group.rows.length} police{group.rows.length > 1 ? 's' : ''}</td></tr>
            {group.rows.map((row) => <tr key={row.num_police} className={[row.temporaire && 'is-temporary', hasRoundAge(row.annee_naissance) && 'is-round-age'].filter(Boolean).join(' ') || undefined}>
              <td>{row.num_police}</td><td>{row.code_client}</td><td>{row.nom_client}</td>{!companyName && <td>{row.nom_compagnie}</td>}
              <td>{row.echeance}</td><td className="jrn-center">{row.unite}</td><td className="jrn-center">{row.duree}</td><td className="jrn-center">{row.tous_risque ? 'X' : ''}</td>
              <td className="jrn-center">{row.etat}</td><td>{row.temporaire ? `Temporaire · expire le ${formatDate(row.expiration)}` : ''}</td>
            </tr>)}
          </tbody>)}
          {!state.items.length && <tbody><tr><td colSpan={columns} className="jrn-sheet-state">Aucune police à terme ce mois.</td></tr></tbody>}
          <tfoot><tr><td colSpan={columns}>{state.items.length} police{state.items.length > 1 ? 's' : ''}{temporary ? ` · dont ${temporary} temporaire${temporary > 1 ? 's' : ''}` : ''}</td></tr></tfoot>
        </table>}
      </article>
    </div>
  </div>;
}

// Module "Etat du terme": the month (and, ticked, a company), then the aperçu in a tab of its own.
export default function EtatTermeModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [month, setMonth] = useState(nextMonth);
  const [byCompany, setByCompany] = useState(false);
  const [company, setCompany] = useState('');
  const [companies, setCompanies] = useState([]);
  const [report, setReport] = useState(null); // { popup, params, month, companyName } of the open aperçu
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listCompanies(accessToken)
      // Without STAR, MAE, SALIM, EUROP ASSISTANCE and EL AMANA TAKAFUL, as in Réception comptant.
      .then((result) => { if (active) setCompanies((Array.isArray(result) ? result : result.items || []).filter(isBordereauCompany)); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function preview() {
    setError('');
    const code = byCompany ? company : '';
    const companyName = code ? companies.find((item) => String(item.code_compagnie) === String(code))?.nom_compagnie || code : '';
    try {
      setReport({ popup: openReportWindow('Etat du terme'), params: { mois: month, code_compagnie: code }, month: MONTHS[month - 1], companyName });
    } catch (openError) { setError(openError.message); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal jrn-small" role="dialog" aria-modal="true" aria-labelledby="terme-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId}</span><h2 id="terme-title">Etat du terme</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="jrn-check"><input type="checkbox" checked={byCompany} onChange={(event) => setByCompany(event.target.checked)} />Compagnie</label>
          <label className="acompte-field jrn-company"><span>Compagnie</span>
            <select value={company} onChange={(event) => setCompany(event.target.value)} disabled={!byCompany}>
              <option value="">Choisir…</option>
              {companies.map((item) => <option key={item.code_compagnie} value={item.code_compagnie}>{item.nom_compagnie}</option>)}
            </select>
          </label>
          <label className="acompte-field jrn-date"><span>Mois</span>
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="expert-submit jrn-open" onClick={preview} disabled={byCompany && !company}>Aperçu</button>
        </div>
        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
        <p className="jrn-hint">Polices en cours (état AN) dont l’échéance tombe dans le mois ; une police au mois (unité M) revient tous les « durée » mois. Une police avec une date d’expiration est notée « Temporaire » en observation. Les polices sont classées par branche ; la ligne est en rouge quand l’âge du client (année en cours moins année de naissance) se termine par 0 ou 5.</p>
      </div>
    </section>
    {report && <NewWindow popup={report.popup} title="Etat du terme" onClose={() => setReport(null)}>
      <TermeSheet params={report.params} month={report.month} companyName={report.companyName} onClose={() => setReport(null)} />
    </NewWindow>}
  </div>;
}
