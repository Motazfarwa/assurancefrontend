import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listCompanies } from '../../services/companyApi';
import { getRecetteTechnique } from '../../services/journalApi';
import NewWindow, { openReportWindow } from '../NewWindow/NewWindow';
import './JournalModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const AGENCY = ['Cabinet d’Assurance Jemmali', '1, Rue d’Arabie Saoudite', '1002 - Tunis', 'Tél : 71 893 000', 'Fax : 71 891 891'];

// Choix d'impression: the order / grouping of the payments. Each group gets its sub-total.
const CHOICES = {
  tous: { label: 'Tous' },
  reglement: { label: 'Par règlement', key: (row) => row.num_reg_cli, title: (row) => `Règlement N° ${row.num_reg_cli} du ${formatDate(row.date_reg)} — ${row.nom_client || ''} (${row.code_client || ''}) · pièce ${row.num_piece || '—'}` },
  client: { label: 'Par client', key: (row) => row.code_client, title: (row) => `Client ${row.code_client || ''} — ${row.nom_client || ''}` },
  police: { label: 'Par police', key: (row) => row.num_police || row.num_int || '', title: (row) => `Police N° ${row.num_police || row.num_int || 'inconnue'}${row.nom_compagnie ? ` · ${row.nom_compagnie}` : ''}` },
  recu: { label: 'Par reçu', sort: (a, b) => Number(a.num_recu || 0) - Number(b.num_recu || 0) },
  feuille: { label: 'Par feuille de caisse', key: (row) => row.date_comptabilise || '', title: (row) => (row.date_comptabilise ? `Feuille de caisse (JEQ) du ${formatDate(row.date_comptabilise)}` : 'Non comptabilisés') },
};
const COLUMNS = [
  ['Date', (row) => formatDate(row.date_reg)], ['N° Règl.', (row) => row.num_reg_cli], ['N° Reçu', (row) => row.num_recu],
  ['Code', (row) => row.code_client], ['Nom client', (row) => row.nom_client], ['N° Police', (row) => row.num_police || row.num_int],
  ['N° Quittance', (row) => row.num_quittance], ['Echéance', (row) => formatDate(row.echeance)], ['Compagnie', (row) => row.nom_compagnie],
  ['Pièce', (row) => row.num_piece], ['Banque', (row) => row.banque],
];

function groupRows(items, choice) {
  const rule = CHOICES[choice];
  if (!rule.key) return [{ title: '', rows: rule.sort ? [...items].sort(rule.sort) : items }];
  const groups = new Map();
  items.forEach((row) => {
    const key = String(rule.key(row) ?? '');
    if (!groups.has(key)) groups.set(key, { title: rule.title(row), rows: [] });
    groups.get(key).rows.push(row);
  });
  const list = [...groups.entries()];
  if (choice === 'feuille') list.sort(([a], [b]) => (a || '9999').localeCompare(b || '9999'));
  if (choice === 'client' || choice === 'police') list.sort(([, a], [, b]) => a.title.localeCompare(b.title, 'fr'));
  return list.map(([, group]) => group);
}

function RecetteSheet({ params, choice, companyName, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let active = true;
    getRecetteTechnique(accessToken, params)
      .then((data) => { if (active) setState({ loading: false, error: '', data }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, data: null }); });
    return () => { active = false; };
  }, [accessToken, params]);

  const { data } = state;
  const groups = data ? groupRows(data.items, choice) : [];
  const span = COLUMNS.length;
  return <div className="jrn-page">
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={(event) => event.currentTarget.ownerDocument.defaultView.print()} disabled={!data}>Imprimer</button><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button></div>
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-agency">{AGENCY.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="jrn-sheet-title"><h1>ETAT DE LA RECETTE TECHNIQUE</h1><p>Du {formatDate(params.debut)} au {formatDate(params.fin)}{companyName ? ` · Compagnie ${companyName}` : ''}</p><p>{CHOICES[choice].label}</p></div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(today())}</span></div>
        </header>
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p> : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p> : <table className="jrn-sheet-table jrn-recette-table">
          <thead><tr>{COLUMNS.map(([label]) => <th key={label}>{label}</th>)}<th>Montant</th></tr></thead>
          {groups.map((group, index) => <tbody key={index}>
            {group.title && <tr className="jrn-group"><td colSpan={span + 1}>{group.title}</td></tr>}
            {group.rows.map((row, rowIndex) => <tr key={`${row.num_reg_cli}-${row.num_recu}-${rowIndex}`}>{COLUMNS.map(([label, cell]) => <td key={label}>{cell(row)}</td>)}<td className="num">{fmt(row.montant)}</td></tr>)}
            {group.title && <tr className="jrn-subtotal"><td colSpan={span}>Sous-total ({group.rows.length})</td><td className="num">{fmt(group.rows.reduce((sum, row) => sum + Number(row.montant || 0), 0))}</td></tr>}
          </tbody>)}
          {!data.items.length && <tbody><tr><td colSpan={span + 1} className="jrn-sheet-state">Aucun règlement sur la période.</td></tr></tbody>}
          <tfoot><tr><td colSpan={span}>Total ({data.items.length})</td><td className="num">{fmt(data.total)}</td></tr></tfoot>
        </table>}
      </article>
    </div>
  </div>;
}

// "Choix d'impression" of the recette technique: the dates, a company (optional) and the grouping, then the aperçu.
export default function RecetteEtatDialog({ onClose }) {
  const { accessToken } = useAuth();
  const [debut, setDebut] = useState(today);
  const [fin, setFin] = useState(today);
  const [withCompany, setWithCompany] = useState(false);
  const [company, setCompany] = useState('');
  const [choice, setChoice] = useState('tous');
  const [companies, setCompanies] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listCompanies(accessToken)
      .then((result) => { if (active) setCompanies(Array.isArray(result) ? result : result.items || []); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  const reversed = Boolean(debut && fin && fin < debut);
  const companyName = withCompany ? companies.find((item) => String(item.code_compagnie) === String(company))?.nom_compagnie || '' : '';

  function preview() {
    setError('');
    try {
      setReport({ popup: openReportWindow('Etat de la recette technique'), params: { debut, fin, code_compagnie: withCompany ? company : '' }, choice, companyName });
    } catch (openError) { setError(openError.message); }
  }

  return <div className="cqi-popup-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="cqi-popup jrn-recette-popup" role="dialog" aria-modal="true" aria-labelledby="rct-etat-title">
      <h3 id="rct-etat-title">Choix d’impression</h3>
      <div className="jrn-recette-grid">
        <div className="jrn-recette-fields">
          <label className="acompte-field"><span>Du</span><input type="date" value={debut} onChange={(event) => setDebut(event.target.value)} autoFocus /></label>
          <label className="acompte-field"><span>Au</span><input type="date" value={fin} onChange={(event) => setFin(event.target.value)} /></label>
          <label className="jrn-check"><input type="checkbox" checked={withCompany} onChange={(event) => setWithCompany(event.target.checked)} />Compagnie</label>
          <select value={company} onChange={(event) => setCompany(event.target.value)} disabled={!withCompany} aria-label="Compagnie">
            <option value="">Choisir…</option>
            {companies.map((item) => <option key={item.code_compagnie} value={item.code_compagnie}>{item.nom_compagnie}</option>)}
          </select>
        </div>
        <fieldset className="unpaid-filter-set unpaid-choice jrn-recette-choice"><legend>Ordre</legend>
          {Object.entries(CHOICES).map(([key, rule]) => <label key={key}><input type="radio" name="rct-choice" checked={choice === key} onChange={() => setChoice(key)} /> {rule.label}</label>)}
        </fieldset>
      </div>
      {error && <div className="expert-error" role="alert">{error}</div>}
      {reversed && <div className="expert-error" role="alert">La date de fin précède la date de début.</div>}
      <footer>
        <button type="button" className="expert-cancel" onClick={onClose}>Fermer</button>
        <button type="button" className="expert-submit" onClick={preview} disabled={!debut || !fin || reversed || (withCompany && !company)}>Aperçu</button>
      </footer>
    </section>
    {report && <NewWindow popup={report.popup} title="Etat de la recette technique" onClose={() => setReport(null)}>
      <RecetteSheet params={report.params} choice={report.choice} companyName={report.companyName} onClose={() => setReport(null)} />
    </NewWindow>}
  </div>;
}
