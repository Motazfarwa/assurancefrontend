import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AGENCY_PYRAMID } from '../../data/agencyInfo';
import { getTechnicalExpenses, listJournalCompanies } from '../../services/journalApi';
import NewWindow, { openReportWindow } from '../NewWindow/NewWindow';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './JournalModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const pad = (value) => String(value).padStart(2, '0');
const todayIso = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
// The month just ended, as the legacy screen (opened on 10/11/2026 it proposes 10/2026).
const lastMonth = () => { const now = new Date(); const day = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${day.getFullYear()}-${pad(day.getMonth() + 1)}`; };
const monthLabel = (value) => value.split('-').reverse().join('/');

// The feuille de caisse a payment went into: the legacy numbers a feuille by its closing day (15/10/2026 -> 15102026),
// the day the payment was comptabilisé in the Journal de dépense.
export function feuilleOf(row) {
  if (!row.comptabilise || !row.date_feuille) return 'En instance';
  return `FC du ${formatDate(row.date_feuille)}`;
}

function DepensesSheet({ params, companyName, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let active = true;
    getTechnicalExpenses(accessToken, params)
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
          <div className="jrn-sheet-title"><h1>ETAT DES DÉPENSES TECHNIQUES</h1><p>Compagnie : {companyName}</p><p>Mois de : {monthLabel(params.mois)}</p></div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(todayIso())}</span></div>
        </header>
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p> : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p> : <table className="jrn-sheet-table jrn-depenses-table">
          <thead><tr><th>Date dép.</th><th>N° Police</th><th>Assuré(e)</th><th>Libellé</th><th>Montant</th><th>N° Chèque</th><th>Banque</th><th>Sinistre</th><th>Feuille de caisse</th></tr></thead>
          <tbody>
            {data.items.map((row) => <tr key={row.num_dep}>
              <td>{formatDate(row.date_dep)}</td><td>{row.num_police}</td><td>{row.assure || row.code_client}</td><td>{row.libelle}</td>
              <td className="num">{fmt(row.montant)}</td><td>{row.num_cheq}</td><td>{row.banque}</td><td>{row.sinistre}</td>
              <td className={row.comptabilise ? '' : 'jrn-pending'}>{feuilleOf(row)}</td>
            </tr>)}
            {!data.items.length && <tr><td colSpan={9} className="jrn-sheet-state">Aucune dépense technique ce mois pour cette compagnie.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={4}>Total ({data.items.length} dépense{data.items.length > 1 ? 's' : ''})</td><td className="num">{fmt(data.total)}</td><td colSpan={4} /></tr></tfoot>
        </table>}
      </article>
    </div>
  </div>;
}

// Module "Etat des dépenses techniques": a month and a company, then the aperçu in a tab of its own.
export default function EtatDepensesTechniquesModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [mois, setMois] = useState(lastMonth);
  const [compagnie, setCompagnie] = useState('');
  const [companies, setCompanies] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listJournalCompanies(accessToken)
      .then((result) => { if (active) setCompanies(Array.isArray(result) ? result : result.items || []); })
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
    const companyName = companies.find((item) => String(item.code_compagnie) === String(compagnie))?.nom_compagnie || compagnie;
    try {
      setReport({ popup: openReportWindow('Etat des dépenses techniques'), params: { compagnie, mois }, companyName });
    } catch (openError) { setError(openError.message); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal jrn-small" role="dialog" aria-modal="true" aria-labelledby="depenses-tech-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>COMPTABILITE · MODULE {moduleId}</span><h2 id="depenses-tech-title">Etat des dépenses techniques</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field jrn-date"><span>Mois / Année</span><input type="month" value={mois} onChange={(event) => setMois(event.target.value)} /></label>
          <label className="acompte-field jrn-company"><span>Compagnie</span>
            <select value={compagnie} onChange={(event) => setCompagnie(event.target.value)}>
              <option value="">Choisir…</option>
              {companies.map((company) => <option key={company.code_compagnie} value={company.code_compagnie}>{company.nom_compagnie}</option>)}
            </select>
          </label>
          <button type="button" className="expert-submit jrn-open" onClick={preview} disabled={!mois || !compagnie}>Aperçu</button>
        </div>
        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
        <p className="jrn-hint">Sinistres, ristournes et règlements d’expert payés dans le mois pour les polices de la compagnie. La dernière colonne indique la feuille de caisse où la dépense a été comptabilisée (Journal de dépense), ou « En instance ».</p>
      </div>
    </section>
    {report && <NewWindow popup={report.popup} title="Etat des dépenses techniques" onClose={() => setReport(null)}>
      <DepensesSheet params={report.params} companyName={report.companyName} onClose={() => setReport(null)} />
    </NewWindow>}
  </div>;
}
