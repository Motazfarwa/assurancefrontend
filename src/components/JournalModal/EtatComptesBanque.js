import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AGENCY_PYRAMID } from '../../data/agencyInfo';
import { getBankAccounts, getBankStatement } from '../../services/journalApi';
import { BANK_COLUMNS, bankLines, confront, decide, inPeriod, proposalKey, readBankFile } from '../../services/bankStatement';
import NewWindow, { openReportWindow } from '../NewWindow/NewWindow';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './JournalModal.css';

const iso = (day) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const money = (value) => (value == null || value === '' ? '' : Number(value).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const SENS = { C: 'Crédit', D: 'Débit' };
// The last full month by default, as in the legacy screen.
const lastMonth = () => {
  const now = new Date();
  return { debut: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), fin: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
};

function SheetFrame({ title, subtitle, onClose, children, ready = true }) {
  return <div className="jrn-page">
    <div className="jrn-sheet-frame">
      <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={(event) => event.currentTarget.ownerDocument.defaultView.print()} disabled={!ready}>Imprimer</button><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button></div>
      <article className="jrn-sheet">
        <header className="jrn-sheet-head">
          <div className="jrn-agency">{AGENCY_PYRAMID.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="jrn-sheet-title"><h1>{title}</h1>{subtitle.map((line) => <p key={line}>{line}</p>)}</div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(iso(new Date()))}</span></div>
        </header>
        {children}
      </article>
    </div>
  </div>;
}

const dayLabel = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

// The movements of each day (with the day's totals and the solde at its end), and their totals per nature.
export function accountBreakdown(items) {
  const byDay = new Map();
  const byNature = new Map();
  items.forEach((item) => {
    const side = item.sens === 'C' ? 'credit' : 'debit';
    const day = byDay.get(item.date_mvt) || { date: item.date_mvt, items: [], credit: 0, debit: 0 };
    day.items.push(item);
    day[side] += Number(item.montant || 0);
    day.solde = item.solde;
    byDay.set(item.date_mvt, day);
    const key = `${item.sens}|${item.libelle || ''}`;
    const nature = byNature.get(key) || { libelle: item.libelle || 'Sans libellé', sens: item.sens, nombre: 0, credit: 0, debit: 0 };
    nature.nombre += 1;
    nature[side] += Number(item.montant || 0);
    byNature.set(key, nature);
  });
  const natures = [...byNature.values()].sort((a, b) => (a.sens === b.sens ? (b.credit + b.debit) - (a.credit + a.debit) : a.sens === 'C' ? -1 : 1));
  return { days: [...byDay.values()], natures };
}

// The four figures of the period, at the top of both états.
function AccountCards({ data }) {
  const credits = data.items.filter((item) => item.sens === 'C').length;
  return <div className="jrn-bank-cards">
    <div><span>Solde de départ au {formatDate(data.debut)}</span><strong>{money(data.solde_depart)}</strong></div>
    <div className="is-credit"><span>Crédits · {plural(credits, 'mouvement')}</span><strong>+ {money(data.total_credit)}</strong></div>
    <div className="is-debit"><span>Débits · {plural(data.items.length - credits, 'mouvement')}</span><strong>− {money(data.total_debit)}</strong></div>
    <div className="is-final"><span>Solde final au {formatDate(data.fin)}</span><strong>{money(data.solde_final)}</strong></div>
  </div>;
}

function NatureTable({ natures }) {
  if (!natures.length) return null;
  return <>
    <h2 className="jrn-bank-title">Récapitulatif par nature</h2>
    <table className="jrn-sheet-table jrn-bank-summary jrn-bank-natures">
      <thead><tr><th>Nature</th><th>Mouvements</th><th>Crédit</th><th>Débit</th></tr></thead>
      <tbody>{natures.map((nature) => <tr key={`${nature.sens}-${nature.libelle}`}><td>{nature.libelle}</td><td className="jrn-center">{nature.nombre}</td><td className="num">{nature.credit ? money(nature.credit) : ''}</td><td className="num">{nature.debit ? money(nature.debit) : ''}</td></tr>)}</tbody>
    </table>
  </>;
}

// Etat global: one line per day (crédit, débit, solde at the end of the day); détaillé: the movements day by day, each
// day with its own totals. Both open on the four figures of the period and close on the totals per nature.
function AccountSheet({ data, mode, onClose }) {
  const { banque, items } = data;
  const { days, natures } = useMemo(() => accountBreakdown(items), [items]);
  const detail = mode === 'detail';
  const footer = <tfoot><tr><td colSpan={detail ? 3 : 2}>{plural(items.length, 'mouvement')} · Solde final au {formatDate(data.fin)}</td><td className="num">{money(data.total_credit)}</td><td className="num">{money(data.total_debit)}</td><td className="num">{money(data.solde_final)}</td></tr></tfoot>;
  return <SheetFrame title={`ETAT ${detail ? 'DÉTAILLÉ' : 'GLOBAL'} DU COMPTE ${banque.code_banque}`} subtitle={[`${banque.nom_banque || ''}${banque.num_compte ? ` · N° ${banque.num_compte}` : ''}`, `Du ${formatDate(data.debut)} au ${formatDate(data.fin)}`]} onClose={onClose}>
    <AccountCards data={data} />
    <h2 className="jrn-bank-title">{detail ? 'Mouvements jour par jour' : 'Mouvements par jour'}</h2>
    {detail ? <table className="jrn-sheet-table jrn-bank-table jrn-bank-days">
      <thead><tr><th>Référence</th><th>Libellé</th><th>Client</th><th>Crédit</th><th>Débit</th><th>Solde</th></tr></thead>
      <tbody>
        <tr className="jrn-group"><td colSpan={5}>Solde de départ au {formatDate(data.debut)}</td><td className="num">{money(data.solde_depart)}</td></tr>
        {days.map((day) => <Fragment key={day.date}>
          <tr className="jrn-bank-day"><td colSpan={6}>{dayLabel(day.date)} <small>· {plural(day.items.length, 'mouvement')}</small></td></tr>
          {day.items.map((item) => <tr key={item.id}>
            <td>{item.reference}</td><td>{item.libelle}</td><td>{[item.code_client, item.nom_client].filter(Boolean).join(' · ')}</td>
            <td className="num">{item.sens === 'C' ? money(item.montant) : ''}</td><td className="num">{item.sens === 'D' ? money(item.montant) : ''}</td><td className="num">{money(item.solde)}</td>
          </tr>)}
          <tr className="jrn-bank-daytotal"><td colSpan={3}>Total du {formatDate(day.date)}</td><td className="num">{day.credit ? money(day.credit) : ''}</td><td className="num">{day.debit ? money(day.debit) : ''}</td><td className="num">{money(day.solde)}</td></tr>
        </Fragment>)}
        {!items.length && <tr><td colSpan={6} className="jrn-sheet-state">Aucun mouvement sur la période.</td></tr>}
      </tbody>
      {footer}
    </table> : <table className="jrn-sheet-table jrn-bank-table">
      <thead><tr><th>Date</th><th>Mouvements</th><th>Crédit</th><th>Débit</th><th>Solde</th></tr></thead>
      <tbody>
        <tr className="jrn-group"><td colSpan={4}>Solde de départ au {formatDate(data.debut)}</td><td className="num">{money(data.solde_depart)}</td></tr>
        {days.map((day) => <tr key={day.date}>
          <td>{formatDate(day.date)}</td><td className="jrn-center">{day.items.length}</td><td className="num">{money(day.credit)}</td><td className="num">{money(day.debit)}</td><td className="num">{money(day.solde)}</td>
        </tr>)}
        {!items.length && <tr><td colSpan={5} className="jrn-sheet-state">Aucun mouvement sur la période.</td></tr>}
      </tbody>
      {footer}
    </table>}
    <NatureTable natures={natures} />
  </SheetFrame>;
}

// Confrontation: the summary (both sides, the gap, what was paired), then each list by date: the close amounts still to
// confirm, those confirmed (side by side, with their difference), our movements missing from the statement, the bank's
// lines missing from our books, and the movements paired at the same amount.
const signedMoney = (value) => `${value > 0 ? '+ ' : value < 0 ? '− ' : ''}${money(Math.abs(value))}`;
const client = (item) => [item.code_client, item.nom_client].filter(Boolean).join(' · ');
const sideTotal = (lines, sens) => lines.filter((line) => line.sens === sens).reduce((total, line) => total + Number(line.montant), 0);

function PairsTable({ pairs, label }) {
  return <table className="jrn-sheet-table jrn-bank-table jrn-bank-pairs">
    <thead>
      <tr><th colSpan={4}>Chez nous</th><th colSpan={3}>Sur le relevé</th><th rowSpan={2}>Différence (relevé − nous)</th><th rowSpan={2}>Même opération ?</th></tr>
      <tr><th>Date</th><th>Référence</th><th>Libellé · client</th><th>Montant</th><th>Date</th><th>Libellé de la banque</th><th>Montant</th></tr>
    </thead>
    <tbody>{pairs.map((pair) => <tr key={proposalKey(pair)}>
      <td>{formatDate(pair.ours.date_mvt)}</td><td>{pair.ours.reference}</td><td>{[pair.ours.libelle, client(pair.ours)].filter(Boolean).join(' · ')}</td><td className="num">{money(pair.ours.montant)} {pair.ours.sens}</td>
      <td>{formatDate(pair.bank.date)}</td><td>{pair.bank.libelle}</td><td className="num">{money(pair.bank.montant)} {pair.bank.sens}</td>
      <td className="num jrn-bank-diff">{signedMoney(pair.difference)}</td><td className="jrn-center">{label}</td>
    </tr>)}</tbody>
  </table>;
}

function ConfrontationSheet({ data, result, fichier, outside, tolerance, amountTolerance, onClose }) {
  const { totals } = result;
  const gap = (side) => Math.round((totals.bank[side] - totals.ours[side]) * 1000) / 1000;
  const bankCount = result.matched.length + result.accepted.length + result.pending.length + result.bankOnly.length;
  const amounts = (lines) => `Crédit ${money(sideTotal(lines, 'C'))} · Débit ${money(sideTotal(lines, 'D'))}`;
  const rows = [
    ['Rapprochés, même montant', result.matched.length, '', 'is-ok'],
    ['Rapprochés avec un écart de montant (confirmés « Oui »)', result.accepted.length, result.accepted.length ? `Écart total ${signedMoney(result.ecartAccepte)}` : '', 'is-ok'],
    ['Montants proches à confirmer', result.pending.length, '', result.pending.length ? 'is-warn' : ''],
    ['Chez nous, absents du relevé', result.oursOnly.length, amounts(result.oursOnly), result.oursOnly.length ? 'is-gap' : ''],
    ['Sur le relevé, absents chez nous', result.bankOnly.length, amounts(result.bankOnly), result.bankOnly.length ? 'is-gap' : ''],
  ];
  let section = 1;
  return <SheetFrame title="CONFRONTATION AVEC LE RELEVÉ BANCAIRE" subtitle={[`Compte ${data.banque.code_banque}${data.banque.nom_banque ? ` · ${data.banque.nom_banque}` : ''}${data.banque.num_compte ? ` · N° ${data.banque.num_compte}` : ''}`, `Période du ${formatDate(data.debut)} au ${formatDate(data.fin)} · Relevé : ${fichier}${outside ? ` (${plural(outside, 'ligne')} hors période, non confrontée${outside > 1 ? 's' : ''})` : ''}`]} onClose={onClose}>
    <h2 className="jrn-bank-title">{section++}. Résumé de la période</h2>
    <table className="jrn-sheet-table jrn-bank-summary">
      <thead><tr><th /><th>Mouvements</th><th>Crédit</th><th>Débit</th></tr></thead>
      <tbody>
        <tr><td>Nos écritures</td><td className="jrn-center">{data.items.length}</td><td className="num">{money(totals.ours.credit)}</td><td className="num">{money(totals.ours.debit)}</td></tr>
        <tr><td>Relevé de la banque</td><td className="jrn-center">{bankCount}</td><td className="num">{money(totals.bank.credit)}</td><td className="num">{money(totals.bank.debit)}</td></tr>
        <tr className={gap('credit') || gap('debit') ? 'is-gap' : 'is-ok'}><td>Écart (relevé − nous)</td><td /><td className="num">{signedMoney(gap('credit'))}</td><td className="num">{signedMoney(gap('debit'))}</td></tr>
      </tbody>
    </table>
    <table className="jrn-sheet-table jrn-bank-summary jrn-bank-result">
      <thead><tr><th>Rapprochement</th><th>Nombre</th><th>Montants</th></tr></thead>
      <tbody>{rows.map(([label, count, detail, tone]) => <tr key={label} className={tone}><td>{label}</td><td className="jrn-center">{count}</td><td>{detail}</td></tr>)}</tbody>
    </table>
    <p className="jrn-bank-note">Même montant : même sens, d’abord par le N° de pièce retrouvé dans le libellé de la banque, puis par la date la plus proche ({tolerance} jours d’écart au plus). Montants proches : même sens, {money(amountTolerance)} TND de différence au plus, dans les mêmes {tolerance} jours ; « Oui » les rapproche, « Non » les laisse chacun de son côté.</p>

    {result.pending.length > 0 && <>
      <h2 className="jrn-bank-title is-warn">{section++}. Montants proches à confirmer ({result.pending.length})</h2>
      <PairsTable pairs={result.pending} label="À confirmer" />
    </>}
    {result.accepted.length > 0 && <>
      <h2 className="jrn-bank-title">{section++}. Rapprochés avec un écart de montant ({result.accepted.length})</h2>
      <PairsTable pairs={result.accepted} label="Oui" />
    </>}

    <h2 className="jrn-bank-title is-missing">{section++}. Chez nous, absents du relevé ({result.oursOnly.length})</h2>
    <table className="jrn-sheet-table jrn-bank-table">
      <thead><tr><th>Date</th><th>Référence</th><th>Libellé</th><th>Client</th><th>Sens</th><th>Montant</th></tr></thead>
      <tbody>
        {result.oursOnly.map((item) => <tr key={item.id}><td>{formatDate(item.date_mvt)}</td><td>{item.reference}</td><td>{item.libelle}</td><td>{client(item)}</td><td className="jrn-center">{SENS[item.sens]}</td><td className="num">{money(item.montant)}</td></tr>)}
        {!result.oursOnly.length && <tr><td colSpan={6} className="jrn-sheet-state">Toutes nos écritures de la période figurent sur le relevé.</td></tr>}
      </tbody>
    </table>

    <h2 className="jrn-bank-title is-missing">{section++}. Sur le relevé, absents chez nous ({result.bankOnly.length})</h2>
    <table className="jrn-sheet-table jrn-bank-table">
      <thead><tr><th>Ligne</th><th>Date</th><th>Date valeur</th><th>Libellé de la banque</th><th>Référence</th><th>Sens</th><th>Montant</th></tr></thead>
      <tbody>
        {result.bankOnly.map((line) => <tr key={line.ligne}><td className="jrn-center">{line.ligne}</td><td>{formatDate(line.date)}</td><td>{formatDate(line.valeur)}</td><td>{line.libelle}</td><td>{line.reference}</td><td className="jrn-center">{SENS[line.sens]}</td><td className="num">{money(line.montant)}</td></tr>)}
        {!result.bankOnly.length && <tr><td colSpan={7} className="jrn-sheet-state">Toutes les lignes du relevé de la période sont dans nos écritures.</td></tr>}
      </tbody>
    </table>

    <h2 className="jrn-bank-title">{section++}. Rapprochés, même montant ({result.matched.length})</h2>
    <table className="jrn-sheet-table jrn-bank-table">
      <thead><tr><th>Notre date</th><th>Date banque</th><th>Écart (j)</th><th>Notre référence</th><th>Libellé de la banque</th><th>Sens</th><th>Montant</th><th>Rapproché par</th></tr></thead>
      <tbody>
        {result.matched.map(({ ours, bank, ecart, how }) => <tr key={`${ours.id}-${bank.ligne}`}><td>{formatDate(ours.date_mvt)}</td><td>{formatDate(bank.date)}</td><td className="jrn-center">{ecart}</td><td>{ours.reference}</td><td>{bank.libelle}</td><td className="jrn-center">{SENS[ours.sens]}</td><td className="num">{money(ours.montant)}</td><td>{how}</td></tr>)}
        {!result.matched.length && <tr><td colSpan={8} className="jrn-sheet-state">Aucun mouvement rapproché au même montant.</td></tr>}
      </tbody>
    </table>
  </SheetFrame>;
}

// Module "Etat détaillé des comptes": an agency account between two dates, global (per day) or détaillé; then the
// confrontation of those movements with the statement (Excel) sent by the bank.
export default function EtatComptesBanqueModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const [banks, setBanks] = useState([]);
  const [filters, setFilters] = useState(() => ({ ...lastMonth(), code_banque: '', mode: 'global' }));
  const [report, setReport] = useState(null); // { popup, kind: 'etat' | 'confrontation' }
  const [data, setData] = useState(null); // the account movements, for the filters they were loaded with
  const [statement, setStatement] = useState(null); // the bank's file: { fichier, rows, headerRow, headers, mapping }
  const [tolerance, setTolerance] = useState(10);
  const [amountTolerance, setAmountTolerance] = useState(1); // TND: amounts this close are proposed side by side
  const [decisions, setDecisions] = useState({}); // the answers on those proposals: { key: 'oui' | 'non' }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const key = `${filters.code_banque}|${filters.debut}|${filters.fin}`;

  useEffect(() => {
    let active = true;
    getBankAccounts(accessToken)
      // Only the accounts in use: the archived ones (closed accounts) are not offered.
      .then((rows) => { if (active) { const open = (rows || []).filter((row) => !row.archive); setBanks(open); setFilters((current) => ({ ...current, code_banque: current.code_banque || open[0]?.code_banque || '' })); } })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The movements are fetched again only when the account or the dates change.
  async function movements() {
    if (data?.key === key) return data;
    const result = await getBankStatement(accessToken, { code_banque: filters.code_banque, debut: filters.debut, fin: filters.fin });
    const loaded = { ...result, debut: filters.debut, fin: filters.fin, key };
    setData(loaded);
    return loaded;
  }

  const valid = filters.code_banque && filters.debut && filters.fin && filters.fin >= filters.debut;
  function change(patch) { setFilters((current) => ({ ...current, ...patch })); setError(''); }

  async function preview() {
    setError('');
    let popup;
    try { popup = openReportWindow('Etat détaillé des comptes'); } catch (openError) { setError(openError.message); return; }
    setBusy(true);
    try {
      await movements();
      setReport({ popup, kind: 'etat' });
    } catch (loadError) { popup.close(); setError(loadError.message); }
    finally { setBusy(false); }
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const [read] = await Promise.all([readBankFile(file), movements()]);
      setStatement({ ...read, fichier: file.name });
      setDecisions({}); // the answers were on the lines of the previous statement
    } catch (readError) { setError(readError.message); setStatement(null); }
    finally { setBusy(false); }
  }

  const lines = useMemo(() => (statement ? bankLines(statement) : []), [statement]);
  // Only the statement lines of the period chosen (Date début - Date fin) are confronted with our movements of it.
  const period = useMemo(() => inPeriod(lines, filters.debut, filters.fin), [lines, filters.debut, filters.fin]);
  const raw = useMemo(() => (statement && data?.key === key ? confront(data.items, period.lines, tolerance, amountTolerance) : null), [statement, data, key, period, tolerance, amountTolerance]);
  const result = useMemo(() => (raw ? decide(raw, decisions) : null), [raw, decisions]);
  // A second click on the same answer takes it back.
  const answer = (pair, value) => setDecisions((current) => ({ ...current, [proposalKey(pair)]: current[proposalKey(pair)] === value ? undefined : value }));

  function showConfrontation() {
    setError('');
    try { setReport({ popup: openReportWindow('Confrontation bancaire'), kind: 'confrontation' }); } catch (openError) { setError(openError.message); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="unpaid-modal jrn-small jrn-bank-modal" role="dialog" aria-modal="true" aria-labelledby="bank-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>COMPTABILITE · MODULE {moduleId}</span><h2 id="bank-title">Etat détaillé des comptes</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters jrn-bank-filters">
          <label className="acompte-field"><span>Date début</span><input type="date" value={filters.debut} onChange={(event) => change({ debut: event.target.value })} /></label>
          <label className="acompte-field"><span>Date fin</span><input type="date" value={filters.fin} onChange={(event) => change({ fin: event.target.value })} /></label>
          <label className="acompte-field jrn-company"><span>Code banque</span>
            <select value={filters.code_banque} onChange={(event) => change({ code_banque: event.target.value })}>
              <option value="">Choisir…</option>
              {banks.map((bank) => <option key={bank.code_banque} value={bank.code_banque}>{bank.code_banque}</option>)}
            </select>
          </label>
          <fieldset className="jrn-bank-mode"><legend>Etat</legend>
            <label className="jrn-check"><input type="radio" name="bank-mode" checked={filters.mode === 'global'} onChange={() => change({ mode: 'global' })} />Etat global</label>
            <label className="jrn-check"><input type="radio" name="bank-mode" checked={filters.mode === 'detail'} onChange={() => change({ mode: 'detail' })} />Etat détaillé</label>
          </fieldset>
          <button type="button" className="expert-submit jrn-open" onClick={preview} disabled={!valid || busy}>{busy && !statement ? 'Patientez…' : 'Aperçu'}</button>
        </div>
        {filters.fin < filters.debut && <div className="expert-error unpaid-error" role="alert">La date de fin précède la date de début.</div>}

        <section className="jrn-bank-confront">
          <div className="jrn-bank-confront-head">
            <div><strong>Confrontation avec le relevé de la banque</strong><small>Importez le relevé Excel (ou CSV) du compte pour la même période.</small></div>
            <input ref={fileInput} type="file" accept=".xls,.xlsx,.csv,.txt" hidden onChange={chooseFile} />
            <button type="button" className="expert-cancel" onClick={() => fileInput.current?.click()} disabled={!valid || busy}>{statement ? 'Changer de relevé' : 'Importer le relevé'}</button>
          </div>
          {statement && <>
            <p className="jrn-hint">« {statement.fichier} » : {plural(lines.length, 'opération')} lue{lines.length > 1 ? 's' : ''}, dont <strong>{period.lines.length} du {formatDate(filters.debut)} au {formatDate(filters.fin)}</strong>{period.outside ? ` (${period.outside} hors période, non confrontée${period.outside > 1 ? 's' : ''})` : ''}{result ? '' : ' · changez le compte ou les dates : réimportez pour confronter'}.</p>
            {result && <div className="jrn-bank-tally" aria-label="Résultat de la confrontation">
              <div className="is-ok"><strong>{result.matched.length + result.accepted.length}</strong><span>rapprochés</span></div>
              <div className={result.pending.length ? 'is-warn' : ''}><strong>{result.pending.length}</strong><span>montants proches à confirmer</span></div>
              <div className={result.oursOnly.length ? 'is-gap' : ''}><strong>{result.oursOnly.length}</strong><span>chez nous seulement</span></div>
              <div className={result.bankOnly.length ? 'is-gap' : ''}><strong>{result.bankOnly.length}</strong><span>sur le relevé seulement</span></div>
            </div>}
            {raw && raw.proposals.length > 0 && <div className="jrn-bank-proposals">
              <strong>Montants proches : est-ce la même opération ?</strong>
              <small>« Oui » : rapprochés avec l’écart affiché. « Non » : chacun reste de son côté.</small>
              <div className="jrn-bank-proposals-scroll"><table>
                <thead><tr><th>Chez nous</th><th>Sur le relevé</th><th>Différence</th><th>Même opération ?</th></tr></thead>
                <tbody>{raw.proposals.map((pair) => {
                  const choice = decisions[proposalKey(pair)];
                  return <tr key={proposalKey(pair)} className={choice ? `is-${choice}` : ''}>
                    <td><b>{money(pair.ours.montant)}</b><small>{formatDate(pair.ours.date_mvt)} · {SENS[pair.ours.sens]}{pair.ours.reference ? ` · ${pair.ours.reference}` : ''}</small><small>{[pair.ours.libelle, client(pair.ours)].filter(Boolean).join(' · ')}</small></td>
                    <td><b>{money(pair.bank.montant)}</b><small>{formatDate(pair.bank.date)} · {SENS[pair.bank.sens]}</small><small>{pair.bank.libelle}</small></td>
                    <td className="jrn-bank-diff">{signedMoney(pair.difference)}</td>
                    <td><div className="jrn-bank-answer" role="group" aria-label={`Même opération : ${money(pair.ours.montant)} et ${money(pair.bank.montant)}`}>
                      <button type="button" className={choice === 'oui' ? 'is-on' : ''} aria-pressed={choice === 'oui'} onClick={() => answer(pair, 'oui')}>Oui</button>
                      <button type="button" className={choice === 'non' ? 'is-on is-no' : ''} aria-pressed={choice === 'non'} onClick={() => answer(pair, 'non')}>Non</button>
                    </div></td>
                  </tr>;
                })}</tbody>
              </table></div>
            </div>}
            <details className="jrn-bank-mapping">
              <summary>Colonnes du relevé — corrigez si besoin</summary>
              <div>
                {BANK_COLUMNS.map((column) => <label key={column.key} className="acompte-field"><span>{column.label}</span>
                  <select value={statement.mapping[column.key] ?? ''} onChange={(event) => setStatement((current) => {
                    const mapping = { ...current.mapping };
                    if (event.target.value === '') delete mapping[column.key]; else mapping[column.key] = Number(event.target.value);
                    return { ...current, mapping };
                  })}>
                    <option value="">— absente —</option>
                    {statement.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
                  </select>
                </label>)}
                <label className="acompte-field"><span>Écart de montant proposé (TND)</span><input type="number" min="0" max="1000" step="0.5" value={amountTolerance} onChange={(event) => setAmountTolerance(Math.max(0, Math.min(1000, Number(event.target.value) || 0)))} /></label>
                <label className="acompte-field"><span>Écart de dates admis (jours)</span><input type="number" min="0" max="60" value={tolerance} onChange={(event) => setTolerance(Math.max(0, Math.min(60, Number(event.target.value) || 0)))} /></label>
              </div>
            </details>
            <button type="button" className="expert-submit" onClick={showConfrontation} disabled={!result}>Voir le rapport de confrontation</button>
          </>}
        </section>
        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
        <p className="jrn-hint">Crédit : les règlements clients versés sur le compte et les entrées diverses. Débit : les dépenses payées par le compte (sinistres, ristournes, frais généraux, sorties diverses). Le solde de départ part du solde initial du compte.</p>
      </div>
    </section>
    {report && data && <NewWindow popup={report.popup} title={report.kind === 'etat' ? 'Etat détaillé des comptes' : 'Confrontation bancaire'} onClose={() => setReport(null)}>
      {report.kind === 'etat'
        ? <AccountSheet data={data} mode={filters.mode} onClose={() => setReport(null)} />
        : result && <ConfrontationSheet data={data} result={result} fichier={statement.fichier} outside={period.outside} tolerance={tolerance} amountTolerance={amountTolerance} onClose={() => setReport(null)} />}
    </NewWindow>}
  </div>;
}
