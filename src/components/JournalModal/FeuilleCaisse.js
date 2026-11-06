import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getCashAdjustment, getCashSheet, listJournalCompanies, saveCashAdjustment } from '../../services/journalApi';
import NewWindow, { openReportWindow } from '../NewWindow/NewWindow';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import '../EtatImpayeModal/EtatImpayeModal.css';
import './JournalModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
// Retenue à la source on the agency's commission, given back to the company as a recette.
const RS_RATE = 0.1;

const compact = (value) => String(value).slice(0, 10).replaceAll('-', '');

// Lines of the feuille de caisse of a company over a period, from the client settlements (TRegCli): for each day what the
// clients paid and the commission of the quittances settled, every claim and rebate paid, and the RS on the net commission.
export function cashSheetLines(journals, expenses) {
  const jeqCommission = sum(journals, 'commission');
  const rebateCommission = sum(expenses.filter((row) => row.nature === 'R'), 'd_com');
  const commission = jeqCommission - rebateCommission;
  const lines = [
    ...journals.flatMap((day) => [
      { label: `Règlements clients du ${formatDate(day.jour)} (${day.quittances} quittance${day.quittances > 1 ? 's' : ''})`, primes: Number(day.primes || 0), tq: Number(day.tq || 0), commission: Number(day.commission || 0), depenses: 0 },
      ...(Number(day.frais || 0) ? [{ label: `FSSR ${compact(day.jour)}`, primes: Number(day.frais), tq: 0, commission: 0, depenses: 0 }] : []),
    ]),
    ...expenses.map((row) => ({
      label: `${row.nature === 'R' ? 'Ristourne' : 'Sinistre'} N° ${row.numero || ''}`,
      primes: 0, tq: 0, commission: row.nature === 'R' ? -Number(row.d_com || 0) : 0, depenses: Number(row.montant || 0),
    })),
    { label: 'RS Commission', primes: Math.round(commission * RS_RATE * 1000) / 1000, tq: 0, commission: 0, depenses: 0 },
  ];
  const totals = { primes: sum(lines, 'primes'), tq: sum(lines, 'tq'), commission: sum(lines, 'commission'), depenses: sum(lines, 'depenses') };
  return { lines, totals, recettes: totals.primes + totals.tq, sorties: totals.commission + totals.depenses, summary: cashSummary(journals, expenses) };
}

const rs = (value) => Math.round(value * RS_RATE * 1000) / 1000;
// The "Détails" page of the feuille (the company's Excel sheet): encaissements against décaissements, the solde owed
// to the company, the net commission and the amount to declare (the net commission before its RS).
function cashSummary(journals, expenses) {
  const rebates = expenses.filter((row) => row.nature === 'R');
  const s = {
    primes: sum(journals, 'primes') + sum(journals, 'tq') + sum(journals, 'frais'),
    commissionBrute: sum(journals, 'commission'),
    commRistourne: sum(rebates, 'd_com'),
    sinistres: sum(expenses.filter((row) => row.nature !== 'R'), 'montant'),
    ristournes: sum(rebates, 'montant'),
    miseEnDemeure: 0,
  };
  s.rsCommissions = rs(s.commissionBrute);
  s.rsCommRistourne = rs(s.commRistourne);
  s.encaissements = s.primes + s.rsCommissions + s.commRistourne + s.miseEnDemeure;
  s.solde = s.encaissements - s.commissionBrute - s.sinistres - s.ristournes - s.rsCommRistourne;
  s.commissionNette = s.commissionBrute + s.rsCommRistourne - s.commRistourne - s.rsCommissions;
  s.aDeclarer = Math.round((s.commissionNette / (1 - RS_RATE)) * 1000) / 1000;
  return s;
}

// adjusted: the solde / montant à déclarer kept by the user (within 1 DT of the computed ones) and the remarque.
function CashDetails({ company, title, summary: s, adjusted }) {
  const solde = adjusted ? Number(adjusted.solde) : s.solde;
  const aDeclarer = adjusted ? Number(adjusted.a_declarer) : s.aDeclarer;
  const left = [['PRIMES ENCAISSÉES', s.primes], ['RS / COMMISSIONS', s.rsCommissions], ['COMM / RISTOURNE', s.commRistourne]];
  const right = [['COMMISSIONS', s.commissionBrute], ['SINISTRES', s.sinistres], ['RISTOURNES', s.ristournes], ['RS / COMM / RIST', s.rsCommRistourne]];
  const steps = (rows) => <table className="jrn-detail-steps"><tbody>{rows.map(([sign, label, value]) => <tr key={label}><td>{sign} {label}</td><td>:</td><td className="num">{fmt(value)}</td></tr>)}</tbody></table>;
  return <div className="jrn-details">
    <header className="jrn-details-head"><strong>AGENCE JEMMALI - CODE {company.code_agent}</strong><span>FEUILLE DE CAISSE {company.nom_compagnie}</span><span>{title}</span></header>
    <table className="jrn-sheet-table jrn-details-table">
      <thead><tr><th colSpan={2}>ENCAISSEMENTS</th><th colSpan={2}>DÉCAISSEMENTS</th></tr></thead>
      <tbody>{right.map(([label, value], index) => <tr key={label}>
        <td>{left[index]?.[0] || ''}</td><td className="num">{left[index] ? fmt(left[index][1]) : ''}</td><td>{label}</td><td className="num">{fmt(value)}</td>
      </tr>)}
        <tr><td /><td /><td><b>SOLDE {company.nom_compagnie}</b></td><td className="num"><b>{fmt(solde)}</b></td></tr>
      </tbody>
      <tfoot><tr><td>TOTAL</td><td className="num">{fmt(s.encaissements)}</td><td>TOTAL</td><td className="num">{fmt(s.encaissements)}</td></tr></tfoot>
    </table>
    {steps([['+', 'PRIMES ENCAISSÉES', s.primes], ['+', 'RS / COMMISSIONS', s.rsCommissions], ['+', 'COMM / RISTOURNES', s.commRistourne], ['+', 'COÛT DE MISE EN DEMEURE', s.miseEnDemeure],
      ['-', 'COMMISSION BRUTE', s.commissionBrute], ['-', 'SINISTRES', s.sinistres], ['-', 'RISTOURNES', s.ristournes], ['-', 'RS / COMM / RISTOURNES', s.rsCommRistourne]])}
    <p className="jrn-detail-result"><b>SOLDE {company.nom_compagnie}</b><b className="num">{fmt(solde)}</b></p>
    <h4>MONTANT DE LA COMMISSION NETTE :</h4>
    {steps([['+', 'COMMISSION BRUTE', s.commissionBrute], ['+', 'RS / COMM / RISTOURNES', s.rsCommRistourne], ['-', 'COMM / RISTOURNES', s.commRistourne], ['-', 'RS / COMMISSIONS', s.rsCommissions]])}
    <p className="jrn-detail-result"><b>COMMISSION NETTE</b><b className="num">{fmt(s.commissionNette)}</b></p>
    <p className="jrn-detail-result"><b>MONTANT À DÉCLARER</b><b className="num jrn-detail-box">{fmt(aDeclarer)}</b></p>
    {adjusted && <p className="jrn-detail-remark"><b>Remarque :</b> {adjusted.remarque}
      <small>Montants calculés : solde {fmt(adjusted.solde_calcule)} · à déclarer {fmt(adjusted.a_declarer_calcule)}</small></p>}
  </div>;
}

const round3 = (value) => Math.round(Number(value) * 1000) / 1000;
const MAX_ADJUSTMENT = 1; // DT, up or down

// The "Détails" of the feuille on an A4 page of its own tab: the solde and the montant à déclarer can be corrected by
// at most one dinar each way, with a remarque (kept for the company and the day).
function CashDetailsPage({ company, jour, title, summary, onClose }) {
  const { accessToken } = useAuth();
  const [adjusted, setAdjusted] = useState(null);
  const [form, setForm] = useState(null); // { solde, a_declarer, remarque } while modifying
  const [state, setState] = useState({ loading: Boolean(jour), saving: false, error: '' });
  const computed = { solde: round3(summary.solde), a_declarer: round3(summary.aDeclarer) };

  useEffect(() => {
    if (!jour) return undefined;
    let active = true;
    getCashAdjustment(accessToken, { compagnie: company.code_compagnie, jour })
      .then((body) => { if (active) { setAdjusted(body.ajustement); setState({ loading: false, saving: false, error: '' }); } })
      .catch((requestError) => { if (active) setState({ loading: false, saving: false, error: requestError.message }); });
    return () => { active = false; };
  }, [accessToken, company.code_compagnie, jour]);

  // An adjustment made on other figures (the day was comptabilisé again since) no longer applies.
  const current = adjusted && round3(adjusted.solde_calcule) === computed.solde && round3(adjusted.a_declarer_calcule) === computed.a_declarer ? adjusted : null;
  const outside = (key) => form && (form[key] === '' || Number.isNaN(Number(form[key])) || Math.abs(round3(Number(form[key]) - computed[key])) > MAX_ADJUSTMENT);
  const changed = form && (round3(form.solde) !== computed.solde || round3(form.a_declarer) !== computed.a_declarer);

  function edit() {
    setState((previous) => ({ ...previous, error: '' }));
    setForm({ solde: String(current ? round3(current.solde) : computed.solde), a_declarer: String(current ? round3(current.a_declarer) : computed.a_declarer), remarque: current?.remarque || '' });
  }

  async function save() {
    if (outside('solde') || outside('a_declarer')) { setState((previous) => ({ ...previous, error: 'Chaque montant peut s’écarter au plus de 1,000 DT du montant calculé.' })); return; }
    if (changed && !form.remarque.trim()) { setState((previous) => ({ ...previous, error: 'Indiquez une remarque pour expliquer la modification.' })); return; }
    setState((previous) => ({ ...previous, saving: true, error: '' }));
    try {
      const body = await saveCashAdjustment(accessToken, {
        compagnie: company.code_compagnie, jour, solde_calcule: computed.solde, solde: round3(form.solde),
        a_declarer_calcule: computed.a_declarer, a_declarer: round3(form.a_declarer), remarque: form.remarque.trim() || null,
      });
      setAdjusted(body.ajustement);
      setForm(null);
      setState({ loading: false, saving: false, error: '' });
    } catch (saveError) {
      setState((previous) => ({ ...previous, saving: false, error: saveError.message }));
    }
  }

  const field = (key, label) => <label className="acompte-field"><span>{label} <small>(calculé : {fmt(computed[key])} · entre {fmt(computed[key] - MAX_ADJUSTMENT)} et {fmt(computed[key] + MAX_ADJUSTMENT)})</small></span>
    <input type="number" step="0.001" min={round3(computed[key] - MAX_ADJUSTMENT)} max={round3(computed[key] + MAX_ADJUSTMENT)} value={form[key]} className={outside(key) ? 'is-invalid' : undefined}
      onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>;

  return <div className="jrn-page">
    <div className="jrn-a4-tools">
      {jour && !form && <button type="button" className="expert-cancel" onClick={edit} disabled={state.loading}>Modifier</button>}
      <button type="button" className="expert-submit" onClick={(event) => event.currentTarget.ownerDocument.defaultView.print()} disabled={Boolean(form)}>Imprimer</button>
      <button type="button" className="expert-cancel" onClick={onClose}>Fermer</button>
    </div>
    {form && <div className="jrn-a4-edit">
      {field('solde', `Solde ${company.nom_compagnie}`)}
      {field('a_declarer', 'Montant à déclarer')}
      <label className="acompte-field jrn-a4-remark"><span>Remarque {changed ? '(obligatoire)' : ''}</span><input value={form.remarque} maxLength={200} onChange={(event) => setForm({ ...form, remarque: event.target.value })} placeholder="Ex : arrondi au dinar" /></label>
      <div className="jrn-a4-edit-actions"><button type="button" className="expert-cancel" onClick={() => setForm(null)} disabled={state.saving}>Annuler</button><button type="button" className="expert-submit" onClick={save} disabled={state.saving}>{state.saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </div>}
    {state.error && <p className="expert-error jrn-a4-error" role="alert">{state.error}</p>}
    {adjusted && !current && !form && <p className="jrn-a4-note">Une modification avait été enregistrée sur d’autres montants calculés : elle n’est plus appliquée.</p>}
    <article className="jrn-sheet jrn-a4">
      <CashDetails company={company} title={title} summary={summary} adjusted={form ? { ...form, solde_calcule: computed.solde, a_declarer_calcule: computed.a_declarer } : current} />
    </article>
  </div>;
}

const periodTitle = (debut, fin) => {
  if (!debut && !fin) return 'FEUILLE DE CAISSE (TOUTES DATES)';
  if (debut === fin) return `FEUILLE DE CAISSE LE ${formatDate(debut)}`;
  return `FEUILLE DE CAISSE DU ${formatDate(debut)} AU ${formatDate(fin)}`;
};

// The printable feuille de caisse of a company: one day (date), a period (debut, fin) or, without dates, every day.
export function CashSheet({ company, date, debut = date, fin = date, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', sheet: null });
  const [details, setDetails] = useState(null); // { popup } of the "Détails" tab
  const [detailsError, setDetailsError] = useState('');
  // Adjustments are kept per day: only a feuille of one day can be modified.
  const jour = debut && debut === fin ? debut : '';
  const title = periodTitle(debut, fin).replace('FEUILLE DE CAISSE ', '');

  function openDetails() {
    setDetailsError('');
    try { setDetails({ popup: openReportWindow(`Détails feuille de caisse ${company.nom_compagnie}`) }); } catch (openError) { setDetailsError(openError.message); }
  }

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '', sheet: null });
    getCashSheet(accessToken, { compagnie: company.code_compagnie, debut: debut || '', fin: fin || '' })
      .then((body) => { if (active) setState({ loading: false, error: '', sheet: cashSheetLines(body.journaux || [], body.depenses || []) }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, sheet: null }); });
    return () => { active = false; };
  }, [accessToken, company.code_compagnie, debut, fin]);

  const { sheet } = state;
  return <div className="jrn-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools">
        <button type="button" className="expert-cancel" onClick={openDetails} disabled={!sheet}>Détails</button>
        <button type="button" className="expert-submit" onClick={() => window.print()} disabled={!sheet}>Imprimer</button>
        <button type="button" className="expert-cancel" onClick={onClose}>Fermer</button>
      </div>
      {detailsError && <p className="expert-error" role="alert">{detailsError}</p>}
      {details && sheet && <NewWindow popup={details.popup} title={`Détails feuille de caisse ${company.nom_compagnie} ${title}`} onClose={() => setDetails(null)}>
        <CashDetailsPage company={company} jour={jour} title={title} summary={sheet.summary} onClose={() => setDetails(null)} />
      </NewWindow>}
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-cash-company"><strong>{company.nom_compagnie}</strong><strong>{periodTitle(debut, fin)}</strong></div>
          <div className="jrn-sheet-title"><h1>AGENCE : {company.code_agent}</h1><p>Règlements clients et dépenses du jour</p></div>
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

// Module "Feuille de caisse": the company and one day (today by default).
export default function FeuilleCaisseModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [compagnie, setCompagnie] = useState('');
  const [jour, setJour] = useState(today);
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
          <label className="acompte-field jrn-date"><span>Date</span><input type="date" value={jour} onChange={(event) => setJour(event.target.value)} /></label>
          <button type="button" className="expert-submit jrn-open" onClick={() => setOpen(true)} disabled={!company || !jour}>Aperçu</button>
        </div>
        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
        <p className="jrn-hint">La feuille reprend les règlements des clients de ce jour-là (montants payés, commission des quittances soldées) et les sinistres et ristournes payés ce jour-là. « Détails » ouvre la page A4, où le solde et le montant à déclarer peuvent être arrondis de 1 DT au plus.</p>
      </div>
    </section>
    {open && company && <CashSheet company={company} date={jour} onClose={() => setOpen(false)} />}
  </div>;
}
