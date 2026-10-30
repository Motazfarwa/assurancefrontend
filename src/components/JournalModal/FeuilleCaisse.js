import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getExpensesJournal, getReceiptsJournal, listJournalCompanies } from '../../services/journalApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './JournalModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
// Retenue à la source on the agency's commission, given back to the company as a recette.
const RS_RATE = 0.1;

// Lines of the feuille de caisse of a company on a date, from what is comptabilisé that day:
// the JEQ (primes, timbres, commission), its FSSR, every claim and rebate paid, and the RS on the commission.
export function cashSheetLines(receipts, expenses, date) {
  const jeqCommission = sum(receipts, 'comm');
  const rebateCommission = sum(expenses.filter((row) => row.nature === 'R'), 'd_com');
  const commission = jeqCommission - rebateCommission;
  const lines = [
    { label: `JEQ N° ${date.replaceAll('-', '')}`, primes: sum(receipts, 'montant'), tq: sum(receipts, 'timbre'), commission: jeqCommission, depenses: 0 },
    { label: 'FSSR JEQ', primes: sum(receipts, 'frais'), tq: 0, commission: 0, depenses: 0 },
    ...expenses.map((row) => ({
      label: `${row.nature === 'R' ? 'Ristourne' : 'Sinistre'} N° ${row.numero || ''}`,
      primes: 0, tq: 0, commission: row.nature === 'R' ? -Number(row.d_com || 0) : 0, depenses: Number(row.montant || 0),
    })),
    { label: 'RS Commission', primes: Math.round(commission * RS_RATE * 1000) / 1000, tq: 0, commission: 0, depenses: 0 },
  ];
  const totals = { primes: sum(lines, 'primes'), tq: sum(lines, 'tq'), commission: sum(lines, 'commission'), depenses: sum(lines, 'depenses') };
  return { lines, totals, recettes: totals.primes + totals.tq, sorties: totals.commission + totals.depenses };
}

// The printable feuille de caisse (loads the receipts and expenses comptabilisés on the date).
export function CashSheet({ company, date, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', sheet: null });

  useEffect(() => {
    let active = true;
    const params = { compagnie: company.code_compagnie, date, comptabilises: true };
    Promise.all([getReceiptsJournal(accessToken, params), getExpensesJournal(accessToken, params)])
      .then(([receipts, expenses]) => {
        if (!active) return;
        const done = (body) => (body.items || []).filter((row) => row.comptabilise);
        setState({ loading: false, error: '', sheet: cashSheetLines(done(receipts), done(expenses), date) });
      })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, sheet: null }); });
    return () => { active = false; };
  }, [accessToken, company.code_compagnie, date]);

  const { sheet } = state;
  return <div className="jrn-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={() => window.print()} disabled={!sheet}>Imprimer</button><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button></div>
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-cash-company"><strong>{company.nom_compagnie}</strong><strong>FEUILLE DE CAISSE LE {formatDate(date)}</strong></div>
          <div className="jrn-sheet-title"><h1>AGENCE : {company.code_agent}</h1><p>Journal d’encaissement non validé</p></div>
          <div className="jrn-agency jrn-printed"><span>Date impression : {formatDate(today())}</span></div>
        </header>
        {state.loading ? <p className="jrn-sheet-state">Chargement…</p> : state.error ? <p className="jrn-sheet-state" role="alert">{state.error}</p> : <table className="jrn-sheet-table jrn-cash-table">
          <thead>
            <tr><th rowSpan={2}>LIBELLÉ ET RÉFÉRENCES</th><th colSpan={2}>RECETTES</th><th colSpan={2}>DÉPENSES</th></tr>
            <tr><th>Primes et autres recettes</th><th>T.Q.</th><th>Commission</th><th>Sinistres et autres dépenses</th></tr>
          </thead>
          <tbody>{sheet.lines.map((line, index) => <tr key={`${index}-${line.label}`}>
            <td>{line.label}</td><td className="num">{fmt(line.primes)}</td><td className="num">{fmt(line.tq)}</td><td className="num">{fmt(line.commission)}</td><td className="num">{fmt(line.depenses)}</td>
          </tr>)}</tbody>
          <tfoot>
            <tr><td>Total</td><td className="num">{fmt(sheet.totals.primes)}</td><td className="num">{fmt(sheet.totals.tq)}</td><td className="num">{fmt(sheet.totals.commission)}</td><td className="num">{fmt(sheet.totals.depenses)}</td></tr>
            <tr className="jrn-cumul"><td>Cumul des totaux</td><td className="num" colSpan={2}>{fmt(sheet.recettes)}</td><td className="num" colSpan={2}>{fmt(sheet.sorties)}</td></tr>
            <tr className="jrn-cumul"><td>Solde à reverser à la compagnie</td><td className="num" colSpan={4}>{fmt(sheet.recettes - sheet.sorties)}</td></tr>
          </tfoot>
        </table>}
      </article>
    </div>
  </div>;
}

// Module "Feuille de caisse": choose the company and the date, then the sheet of what is comptabilisé that day.
export default function FeuilleCaisseModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [compagnie, setCompagnie] = useState('');
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listJournalCompanies(accessToken).then((rows) => { if (active) setCompanies(rows || []); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { if (open) setOpen(false); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const company = companies.find((item) => String(item.code_compagnie) === String(compagnie));
  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !open) onClose(); }}>
    <section className="unpaid-modal jrn-small" role="dialog" aria-modal="true" aria-labelledby="fc-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>COMPTABILITÉ · MODULE {moduleId}</span><h2 id="fc-title">Feuille de caisse</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field jrn-company"><span>Compagnie</span>
            <select value={compagnie} onChange={(event) => setCompagnie(event.target.value)} autoFocus>
              <option value="">Choisir la compagnie…</option>
              {companies.map((item) => <option key={item.code_compagnie} value={item.code_compagnie}>{item.nom_compagnie}</option>)}
            </select>
          </label>
          <label className="acompte-field jrn-date"><span>Feuille de caisse du</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button type="button" className="expert-submit jrn-open" onClick={() => setOpen(true)} disabled={!company || !date}>Aperçu</button>
        </div>
        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
        <p className="jrn-hint">La feuille reprend le journal d’encaissement et les sinistres et ristournes comptabilisés à cette date.</p>
      </div>
    </section>
    {open && company && <CashSheet company={company} date={date} onClose={() => setOpen(false)} />}
  </div>;
}
