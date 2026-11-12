import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getDailyFinancial, getDailyProduction } from '../../services/journalApi';
import NewWindow, { openReportWindow } from '../NewWindow/NewWindow';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './JournalModal.css';
import { AGENCY_PYRAMID } from '../../data/agencyInfo';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => (value == null ? '' : money.format(Number(value)));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const shortDay = (value) => formatDate(value).slice(0, 5); // 02/11
const today = () => new Date().toISOString().slice(0, 10);

// The two modules (as the legacy software): production (policies / quittances moved) and financières (money in and out).
// Each kind: its radio label, the report title, how to load it and its columns [label, value, 'num' for amounts].
export const FAMILIES = {
  production: {
    category: 'PRODUCTION',
    title: 'Opérations journalières (Production)',
    reportTitle: (kind) => `Etat des opérations journalières (${kind.title})`,
    hint: 'Les polices ou quittances ajoutées, modifiées ou supprimées entre les deux dates, d’après le journal des événements.',
    load: getDailyProduction,
    kinds: {
      police: {
        label: 'Police',
        title: 'Production des polices',
        columns: [
          ['Date Mvt', (row) => formatDate(row.date_mvt)], ['N° Police', (row) => row.num_int], ['C_Cl', (row) => row.code_client],
          ['Nom_Client', (row) => row.nom_client], ['Echéance', (row) => row.echeance], ['Etat', (row) => row.etat], ['Risque', (row) => row.risque],
          ['Mvt', (row) => row.mvt],
        ],
      },
      quittance: {
        label: 'Quittance',
        title: 'Production des quittances',
        columns: [
          // A quittance logged under its série (SERIE 341173 in its observation) shows its own number and the série;
          // one the base does not have any more is said so, nothing is filled in for it.
          ['Date Mvt', (row) => formatDate(row.date_mvt)], ['N° Quittance', (row) => (row.serie ? `${row.num_quittance} (série ${row.serie})` : row.num_quittance)],
          ['N° Police', (row) => row.num_int],
          ['C_Cl', (row) => row.code_client], ['Nom_Client', (row) => (row.trouvee === false ? 'Quittance introuvable dans la base' : row.nom_client)],
          ['Echéance', (row) => formatDate(row.echeance)],
          // The période of a comptant quittance is set when it is validated in a month of Réception comptant: until
          // then it is empty in the base, and said so (no month is made up for it).
          ['TC', (row) => row.tc], ['Période', (row) => row.periode || (row.trouvee !== false && row.tc === 'C' ? 'Non validée' : '')], ['Prime totale', (row) => fmt(row.prime_total), 'num'], ['Mvt', (row) => row.mvt],
        ],
      },
    },
  },
  financier: {
    category: 'COMPTABILITE',
    title: 'Opérations journalières (Financières)',
    reportTitle: (kind) => `Etat financier des opérations journalières (${kind.label})`,
    hint: 'Technique : règlements des clients (R) et règlements de sinistres, ristournes et experts (D). Divers : entrées (R) et sorties diverses (D).',
    load: getDailyFinancial,
    totals: true,
    kinds: {
      technique: {
        label: 'Technique',
        columns: [
          ['Date', (row) => shortDay(row.date_op)], ['Opé', (row) => row.ope], ['C_C', (row) => row.code_client], ['Nom Client', (row) => row.nom_client],
          ['N° Police', (row) => row.num_police], ['Echéance', (row) => formatDate(row.echeance)], ['TC', (row) => row.tc],
          ['Prime', (row) => fmt(row.prime), 'num'], ['Règlement', (row) => fmt(row.reglement), 'num'], ['Total', (row) => fmt(row.total), 'num'],
          ['N° Chèq', (row) => row.num_cheq], ['Date Chè', (row) => formatDate(row.date_cheq)], ['Compte', (row) => row.compte],
          ['N° Sin/Rist', (row) => row.sin_rist], ['Bénéficiaire', (row) => row.beneficiaire],
        ],
      },
      divers: {
        label: 'Divers',
        columns: [
          ['Date', (row) => formatDate(row.date_op)], ['Opér', (row) => row.ope], ['Numéro', (row) => row.numero, 'num'],
          ['Règlement', (row) => fmt(row.reglement), 'num'], ['N° Chèq', (row) => row.num_cheq], ['Date Chèq', (row) => formatDate(row.date_cheq)],
          ['Compte', (row) => row.compte], ['Bénéficiaire', (row) => row.beneficiaire],
        ],
      },
    },
  },
};

// The printable état of the kind chosen between two dates.
export function OperationsSheet({ family, type, debut, fin, onClose }) {
  const { accessToken, user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const kind = family.kinds[type];
  // Total recette / total dépense: shown to the administrator only.
  const showTotals = family.totals && Boolean(user?.isAdmin);

  useEffect(() => {
    let active = true;
    family.load(accessToken, { type, debut, fin })
      .then((data) => { if (active) setState({ loading: false, error: '', data }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, data: null }); });
    return () => { active = false; };
  }, [accessToken, family, type, debut, fin]);

  const items = state.data?.items;
  const span = kind.columns.length;
  return <div className="jrn-page">
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={(event) => event.currentTarget.ownerDocument.defaultView.print()} disabled={!items}>Imprimer</button><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button></div>
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-agency">{AGENCY_PYRAMID.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="jrn-sheet-title"><h1>{family.reportTitle(kind)}</h1><p>Période du {formatDate(debut)} au {formatDate(fin)}</p></div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(today())}</span></div>
        </header>
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p> : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p> : <table className="jrn-sheet-table jrn-percus-table">
          <thead><tr>{kind.columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {items.map((row, index) => <tr key={index}>{kind.columns.map(([label, cell, align]) => <td key={label} className={align}>{cell(row)}</td>)}</tr>)}
            {!items.length && <tr><td colSpan={span} className="jrn-sheet-state">Aucune opération sur la période.</td></tr>}
          </tbody>
          <tfoot>
            {showTotals ? <>
              <tr><td colSpan={span}>Total recette : {fmt(state.data.total_recette)}</td></tr>
              <tr><td colSpan={span}>Total dépense : {fmt(state.data.total_depense)}</td></tr>
            </> : <tr><td colSpan={span}>{items.length} opération(s)</td></tr>}
          </tfoot>
        </table>}
      </article>
    </div>
  </div>;
}

// Module "Opérations journalières" (production or financières): the period and the kind, then the état in its own tab.
export default function OperationsJournalieresModal({ moduleId, familyKey = 'production', onClose }) {
  const family = FAMILIES[familyKey] || FAMILIES.production;
  const [debut, setDebut] = useState(today);
  const [fin, setFin] = useState(today);
  const [type, setType] = useState(() => Object.keys(family.kinds)[0]);
  const [report, setReport] = useState(null); // { popup, type, debut, fin } of the open aperçu
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function preview() {
    setError('');
    try {
      setReport({ popup: openReportWindow(family.reportTitle(family.kinds[type])), type, debut, fin });
    } catch (openError) { setError(openError.message); }
  }

  const reversed = Boolean(debut && fin && fin < debut);
  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal jrn-small" role="dialog" aria-modal="true" aria-labelledby="ops-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>{family.category} · MODULE {moduleId}</span><h2 id="ops-title">{family.title}</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field jrn-date"><span>Date début</span><input type="date" value={debut} onChange={(event) => setDebut(event.target.value)} autoFocus /></label>
          <label className="acompte-field jrn-date"><span>Date fin</span><input type="date" value={fin} onChange={(event) => setFin(event.target.value)} /></label>
          <button type="button" className="expert-submit jrn-open" onClick={preview} disabled={!debut || !fin || reversed}>Aperçu</button>
        </div>
        <div className="jrn-percus-type" role="radiogroup" aria-label="Opérations">
          {Object.entries(family.kinds).map(([key, kind]) => <label key={key} className="jrn-check"><input type="radio" name="ops-type" checked={type === key} onChange={() => setType(key)} />{kind.label}</label>)}
        </div>
        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
        {reversed && <div className="expert-error unpaid-error" role="alert">La date de fin précède la date de début.</div>}
        <p className="jrn-hint">{family.hint}</p>
      </div>
    </section>
    {report && <NewWindow popup={report.popup} title={`${family.reportTitle(family.kinds[report.type])} du ${formatDate(report.debut)} au ${formatDate(report.fin)}`} onClose={() => setReport(null)}>
      <OperationsSheet family={family} type={report.type} debut={report.debut} fin={report.fin} onClose={() => setReport(null)} />
    </NewWindow>}
  </div>;
}
