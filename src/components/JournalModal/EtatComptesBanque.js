import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AGENCY } from '../../data/agencyInfo';
import { getBankAccounts, getBankStatement } from '../../services/journalApi';
import { BANK_COLUMNS, bankLines, confront, readBankFile } from '../../services/bankStatement';
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
          <div className="jrn-agency">{AGENCY.map((line) => <span key={line}>{line}</span>)}</div>
          <div className="jrn-sheet-title"><h1>{title}</h1>{subtitle.map((line) => <p key={line}>{line}</p>)}</div>
          <div className="jrn-agency jrn-printed"><span>Date : {formatDate(iso(new Date()))}</span></div>
        </header>
        {children}
      </article>
    </div>
  </div>;
}

// Etat global: one line per day (crédit, débit, solde at the end of the day); détaillé: every movement.
function AccountSheet({ data, mode, onClose }) {
  const { banque, items } = data;
  const days = useMemo(() => {
    const byDay = new Map();
    items.forEach((item) => {
      const day = byDay.get(item.date_mvt) || { date: item.date_mvt, credit: 0, debit: 0, nombre: 0 };
      day[item.sens === 'C' ? 'credit' : 'debit'] += item.montant;
      day.nombre += 1;
      day.solde = item.solde;
      byDay.set(item.date_mvt, day);
    });
    return [...byDay.values()];
  }, [items]);
  const detail = mode === 'detail';
  return <SheetFrame title={`ETAT ${detail ? 'DÉTAILLÉ' : 'GLOBAL'} DU COMPTE ${banque.code_banque}`} subtitle={[`${banque.nom_banque || ''}${banque.num_compte ? ` · N° ${banque.num_compte}` : ''}`, `Du ${formatDate(data.debut)} au ${formatDate(data.fin)}`]} onClose={onClose}>
    <table className="jrn-sheet-table jrn-bank-table">
      <thead>{detail
        ? <tr><th>Date</th><th>Référence</th><th>Libellé</th><th>Client</th><th>Crédit</th><th>Débit</th><th>Solde</th></tr>
        : <tr><th>Date</th><th>Mouvements</th><th>Crédit</th><th>Débit</th><th>Solde</th></tr>}</thead>
      <tbody>
        <tr className="jrn-group"><td colSpan={detail ? 6 : 4}>Solde de départ au {formatDate(data.debut)}</td><td className="num">{money(data.solde_depart)}</td></tr>
        {detail ? items.map((item) => <tr key={item.id}>
          <td>{formatDate(item.date_mvt)}</td><td>{item.reference}</td><td>{item.libelle}</td><td>{[item.code_client, item.nom_client].filter(Boolean).join(' · ')}</td>
          <td className="num">{item.sens === 'C' ? money(item.montant) : ''}</td><td className="num">{item.sens === 'D' ? money(item.montant) : ''}</td><td className="num">{money(item.solde)}</td>
        </tr>) : days.map((day) => <tr key={day.date}>
          <td>{formatDate(day.date)}</td><td className="jrn-center">{day.nombre}</td><td className="num">{money(day.credit)}</td><td className="num">{money(day.debit)}</td><td className="num">{money(day.solde)}</td>
        </tr>)}
        {!items.length && <tr><td colSpan={detail ? 7 : 5} className="jrn-sheet-state">Aucun mouvement sur la période.</td></tr>}
      </tbody>
      <tfoot><tr><td colSpan={detail ? 4 : 2}>{items.length} mouvement{items.length > 1 ? 's' : ''} · Solde final au {formatDate(data.fin)}</td><td className="num">{money(data.total_credit)}</td><td className="num">{money(data.total_debit)}</td><td className="num">{money(data.solde_final)}</td></tr></tfoot>
    </table>
  </SheetFrame>;
}

// Confrontation: the totals of both sides, then the pairs, our movements missing from the statement and the bank's
// lines missing from our books.
function ConfrontationSheet({ data, result, fichier, tolerance, onClose }) {
  const { totals } = result;
  const gap = (side) => Math.round((totals.bank[side] - totals.ours[side]) * 1000) / 1000;
  return <SheetFrame title="CONFRONTATION AVEC LE RELEVÉ BANCAIRE" subtitle={[`Compte ${data.banque.code_banque}${data.banque.num_compte ? ` · N° ${data.banque.num_compte}` : ''}`, `Du ${formatDate(data.debut)} au ${formatDate(data.fin)} · Relevé : ${fichier}`]} onClose={onClose}>
    <table className="jrn-sheet-table jrn-bank-summary">
      <thead><tr><th /><th>Mouvements</th><th>Crédit</th><th>Débit</th></tr></thead>
      <tbody>
        <tr><td>Nos écritures</td><td className="jrn-center">{data.items.length}</td><td className="num">{money(totals.ours.credit)}</td><td className="num">{money(totals.ours.debit)}</td></tr>
        <tr><td>Relevé de la banque</td><td className="jrn-center">{result.matched.length + result.bankOnly.length}</td><td className="num">{money(totals.bank.credit)}</td><td className="num">{money(totals.bank.debit)}</td></tr>
        <tr className={gap('credit') || gap('debit') ? 'is-gap' : 'is-ok'}><td>Écart (banque − nous)</td><td className="jrn-center">{result.matched.length} rapprochés</td><td className="num">{money(gap('credit'))}</td><td className="num">{money(gap('debit'))}</td></tr>
      </tbody>
    </table>
    <p className="jrn-bank-note">Rapprochement : même sens et même montant, d’abord par le N° de pièce retrouvé dans le libellé de la banque, puis par la date la plus proche (écart de {tolerance} jours au plus).</p>

    <h2 className="jrn-bank-title is-missing">Chez nous, absents du relevé ({result.oursOnly.length})</h2>
    <table className="jrn-sheet-table jrn-bank-table">
      <thead><tr><th>Date</th><th>Référence</th><th>Libellé</th><th>Client</th><th>Sens</th><th>Montant</th></tr></thead>
      <tbody>
        {result.oursOnly.map((item) => <tr key={item.id}><td>{formatDate(item.date_mvt)}</td><td>{item.reference}</td><td>{item.libelle}</td><td>{[item.code_client, item.nom_client].filter(Boolean).join(' · ')}</td><td className="jrn-center">{SENS[item.sens]}</td><td className="num">{money(item.montant)}</td></tr>)}
        {!result.oursOnly.length && <tr><td colSpan={6} className="jrn-sheet-state">Toutes nos écritures figurent sur le relevé.</td></tr>}
      </tbody>
    </table>

    <h2 className="jrn-bank-title is-missing">Sur le relevé, absents chez nous ({result.bankOnly.length})</h2>
    <table className="jrn-sheet-table jrn-bank-table">
      <thead><tr><th>Ligne</th><th>Date</th><th>Date valeur</th><th>Libellé de la banque</th><th>Référence</th><th>Sens</th><th>Montant</th></tr></thead>
      <tbody>
        {result.bankOnly.map((line) => <tr key={line.ligne}><td className="jrn-center">{line.ligne}</td><td>{formatDate(line.date)}</td><td>{formatDate(line.valeur)}</td><td>{line.libelle}</td><td>{line.reference}</td><td className="jrn-center">{SENS[line.sens]}</td><td className="num">{money(line.montant)}</td></tr>)}
        {!result.bankOnly.length && <tr><td colSpan={7} className="jrn-sheet-state">Toutes les lignes du relevé sont dans nos écritures.</td></tr>}
      </tbody>
    </table>

    <h2 className="jrn-bank-title">Rapprochés ({result.matched.length})</h2>
    <table className="jrn-sheet-table jrn-bank-table">
      <thead><tr><th>Notre date</th><th>Date banque</th><th>Écart (j)</th><th>Notre référence</th><th>Libellé de la banque</th><th>Sens</th><th>Montant</th><th>Rapproché par</th></tr></thead>
      <tbody>
        {result.matched.map(({ ours, bank, ecart, how }) => <tr key={`${ours.id}-${bank.ligne}`}><td>{formatDate(ours.date_mvt)}</td><td>{formatDate(bank.date)}</td><td className="jrn-center">{ecart}</td><td>{ours.reference}</td><td>{bank.libelle}</td><td className="jrn-center">{SENS[ours.sens]}</td><td className="num">{money(ours.montant)}</td><td>{how}</td></tr>)}
        {!result.matched.length && <tr><td colSpan={8} className="jrn-sheet-state">Aucun mouvement rapproché.</td></tr>}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const key = `${filters.code_banque}|${filters.debut}|${filters.fin}`;

  useEffect(() => {
    let active = true;
    getBankAccounts(accessToken)
      .then((rows) => { if (active) { setBanks(rows); setFilters((current) => ({ ...current, code_banque: current.code_banque || rows.find((row) => !row.archive)?.code_banque || '' })); } })
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
    } catch (readError) { setError(readError.message); setStatement(null); }
    finally { setBusy(false); }
  }

  const lines = useMemo(() => (statement ? bankLines(statement) : []), [statement]);
  const result = useMemo(() => (statement && data?.key === key ? confront(data.items, lines, tolerance) : null), [statement, data, key, lines, tolerance]);

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
              {banks.map((bank) => <option key={bank.code_banque} value={bank.code_banque}>{bank.code_banque}{bank.archive ? ' (archivé)' : ''}</option>)}
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
            <p className="jrn-hint">« {statement.fichier} » : {lines.length} opération{lines.length > 1 ? 's' : ''} lue{lines.length > 1 ? 's' : ''}{result ? ` · ${result.matched.length} rapprochée${result.matched.length > 1 ? 's' : ''}, ${result.oursOnly.length} chez nous seulement, ${result.bankOnly.length} sur le relevé seulement` : ' · changez le compte ou les dates : réimportez pour confronter'}.</p>
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
        : result && <ConfrontationSheet data={data} result={result} fichier={statement.fichier} tolerance={tolerance} onClose={() => setReport(null)} />}
    </NewWindow>}
  </div>;
}
