import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getReceivedGaps } from '../../services/journalApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './JournalModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const AGENCY = ['Cabinet d’Assurance Jemmali', '1, Rue d’Arabie Saoudite', '1002 - Tunis', 'Tél : 71 893 000', 'Fax : 71 891 891'];

const KINDS = {
  moins: {
    title: 'Etat du moins perçu',
    columns: [
      ['Code', (row) => row.code_client], ['Nom', (row) => row.nom_client], ['N° Police', (row) => row.num_police],
      ['N° Quittance', (row) => row.num_quittance], ['Echéance', (row) => formatDate(row.echeance)], ['TC', (row) => row.tc], ['Banque', (row) => row.banque],
    ],
  },
  trop: {
    title: 'Etat du trop perçu',
    columns: [['Date Mvt.', (row) => formatDate(row.date_mvt)], ['C Cli', (row) => row.code_client], ['Nom Client', (row) => row.nom_client], ['Banque', (row) => row.banque]],
  },
};

// The printable état of the moins or trop perçus between two dates.
function PercusSheet({ type, debut, fin, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const kind = KINDS[type];

  useEffect(() => {
    let active = true;
    getReceivedGaps(accessToken, { type, debut, fin })
      .then((data) => { if (active) setState({ loading: false, error: '', data }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, data: null }); });
    return () => { active = false; };
  }, [accessToken, type, debut, fin]);

  const { data } = state;
  return <div className="jrn-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={() => window.print()} disabled={!data}>Imprimer</button><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button></div>
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-agency">{AGENCY.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="jrn-sheet-title"><h1>{kind.title}</h1><p>Période du {formatDate(debut)} au {formatDate(fin)}</p></div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(today())}</span></div>
        </header>
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p> : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p> : <table className="jrn-sheet-table jrn-percus-table">
          <thead><tr>{kind.columns.map(([label]) => <th key={label}>{label}</th>)}<th>Montant</th></tr></thead>
          <tbody>
            {data.items.map((row, index) => <tr key={index}>{kind.columns.map(([label, cell]) => <td key={label}>{cell(row)}</td>)}<td className="num">{fmt(row.montant)}</td></tr>)}
            {!data.items.length && <tr><td colSpan={kind.columns.length + 1} className="jrn-sheet-state">Aucun mouvement sur la période.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={kind.columns.length}>Total ({data.items.length})</td><td className="num">{fmt(data.total)}</td></tr></tfoot>
        </table>}
      </article>
    </div>
  </div>;
}

// Module "Etat des moins perçus & trop perçus": the period and the état, then its preview.
export default function EtatPercusModal({ moduleId, onClose }) {
  const [debut, setDebut] = useState(today);
  const [fin, setFin] = useState(today);
  const [type, setType] = useState('moins');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { if (open) setOpen(false); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const reversed = Boolean(debut && fin && fin < debut);
  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !open) onClose(); }}>
    <section className="unpaid-modal jrn-small" role="dialog" aria-modal="true" aria-labelledby="percus-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>RECOUVREMENT · MODULE {moduleId}</span><h2 id="percus-title">Etat des moins perçus & trop perçus</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field jrn-date"><span>Date début</span><input type="date" value={debut} onChange={(event) => setDebut(event.target.value)} autoFocus /></label>
          <label className="acompte-field jrn-date"><span>Date fin</span><input type="date" value={fin} onChange={(event) => setFin(event.target.value)} /></label>
          <button type="button" className="expert-submit jrn-open" onClick={() => setOpen(true)} disabled={!debut || !fin || reversed}>Aperçu</button>
        </div>
        <div className="jrn-percus-type" role="radiogroup" aria-label="Etat">
          <label className="jrn-check"><input type="radio" name="percus-type" checked={type === 'moins'} onChange={() => setType('moins')} />Moins perçu</label>
          <label className="jrn-check"><input type="radio" name="percus-type" checked={type === 'trop'} onChange={() => setType('trop')} />Trop perçu</label>
        </div>
        {reversed && <div className="expert-error unpaid-error" role="alert">La date de fin précède la date de début.</div>}
        <p className="jrn-hint">Moins perçu : restes de quittances abandonnés (règlements de type R). Trop perçu : montants payés en plus des quittances.</p>
      </div>
    </section>
    {open && <PercusSheet type={type} debut={debut} fin={fin} onClose={() => setOpen(false)} />}
  </div>;
}
