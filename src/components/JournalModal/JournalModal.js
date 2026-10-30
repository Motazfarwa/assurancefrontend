import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getExpensesJournal, getReceiptsJournal, listJournalCompanies, postExpenses, postReceipts } from '../../services/journalApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import '../ChequeInstanceModal/ChequeInstanceModal.css';
import { CashSheet } from './FeuilleCaisse';
import './JournalModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const AGENCY = ['Cabinet d’Assurance Jemmali', '1, Rue d’Arabie Saoudite', '1002 - Tunis', 'Tél : 71 893 000', 'Fax : 71 891 891'];

// Each journal: how its lines are read, keyed, pre-chosen, searched and comptabilisées.
const KINDS = {
  encaissement: {
    title: 'Journal d’encaissement',
    heading: 'QUITTANCES À DÉCLARER · COCHEZ « CHOIX » PUIS « COMPTABILISER »',
    load: getReceiptsJournal,
    post: (token, compagnie, date, rows) => postReceipts(token, { compagnie, date, quittances: rows.map((row) => row.num_quittance) }),
    key: (row) => row.num_quittance,
    // Fully paid receipts are proposed; unpaid ones are chosen by hand.
    preselect: (row) => row.paye || row.a_s === 'A',
    text: (row) => `${row.num_quittance} ${row.num_police || ''} ${row.assure || ''} ${row.code_client || ''}`,
    amount: 'montant',
  },
  depense: {
    title: 'Journal de dépense',
    heading: 'SINISTRES ET RISTOURNES PAYÉS · COCHEZ « CHOIX » PUIS « COMPTABILISER »',
    load: getExpensesJournal,
    post: (token, compagnie, date, rows) => postExpenses(token, { compagnie, date, depenses: rows.map((row) => row.num_dep) }),
    key: (row) => String(row.num_dep),
    preselect: () => true,
    text: (row) => `${row.numero || ''} ${row.num_police || ''} ${row.num_imat || ''} ${row.assure || ''} ${row.num_cheq || ''}`,
    amount: 'montant',
  },
};

// Journal d'encaissement / de dépense of a company on a date: the lines still to comptabiliser, chosen with "Choix";
// "Comptabiliser" records them on that date and shows the feuille de caisse to print.
export default function JournalModal({ kind = 'encaissement', moduleId, onClose }) {
  const config = KINDS[kind];
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [compagnie, setCompagnie] = useState('');
  const [date, setDate] = useState(today);
  const [nature, setNature] = useState(''); // dépense: '' | S | R
  const [showDone, setShowDone] = useState(false);
  const [search, setSearch] = useState('');
  const [state, setState] = useState({ loading: false, error: '', items: [] });
  const [chosen, setChosen] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [sheet, setSheet] = useState(null); // the journal printout: { rows, preview }
  const [cashSheet, setCashSheet] = useState(false); // the feuille de caisse of the company on the date

  useEffect(() => {
    let active = true;
    listJournalCompanies(accessToken)
      .then((rows) => { if (active) setCompanies(rows || []); })
      .catch((requestError) => { if (active) setState((current) => ({ ...current, error: requestError.message })); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!compagnie || !date) { setState({ loading: false, error: '', items: [] }); return undefined; }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    config.load(accessToken, { compagnie, date, nature, comptabilises: showDone })
      .then((body) => {
        if (!active) return;
        const items = body.items || [];
        setState({ loading: false, error: '', items });
        setChosen(new Set(items.filter((row) => !row.comptabilise && config.preselect(row)).map(config.key)));
      })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, items: [] }); });
    return () => { active = false; };
  }, [accessToken, config, compagnie, date, nature, showDone]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { if (cashSheet) setCashSheet(false); else if (sheet) setSheet(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, cashSheet, onClose]);

  const company = companies.find((item) => String(item.code_compagnie) === String(compagnie));
  const shown = useMemo(() => {
    const text = search.trim().toLocaleLowerCase();
    return text ? state.items.filter((row) => config.text(row).toLocaleLowerCase().includes(text)) : state.items;
  }, [state.items, search, config]);
  const pending = shown.filter((row) => !row.comptabilise);
  const selected = state.items.filter((row) => !row.comptabilise && chosen.has(config.key(row)));
  const done = state.items.filter((row) => row.comptabilise);
  const allChosen = pending.length > 0 && pending.every((row) => chosen.has(config.key(row)));

  const toggle = (row) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(config.key(row))) next.delete(config.key(row)); else next.add(config.key(row));
    return next;
  });
  const toggleAll = () => setChosen((current) => {
    const next = new Set(current);
    pending.forEach((row) => (allChosen ? next.delete(config.key(row)) : next.add(config.key(row))));
    return next;
  });

  async function comptabiliser() {
    if (!selected.length) return;
    const message = `Comptabiliser ${selected.length} ligne${selected.length > 1 ? 's' : ''} (${fmt(sum(selected, config.amount))} TND) pour ${company?.nom_compagnie || 'la compagnie'} au ${formatDate(date)} ?`;
    if (!window.confirm(message)) return;
    setSaving(true); setNotice('');
    try {
      const result = await config.post(accessToken, Number(compagnie), date, selected);
      const body = await config.load(accessToken, { compagnie, date, nature, comptabilises: true });
      const items = body.items || [];
      setShowDone(true);
      setState({ loading: false, error: '', items });
      setChosen(new Set());
      setNotice(`${result.comptabilisees} ligne${result.comptabilisees > 1 ? 's' : ''} comptabilisée${result.comptabilisees > 1 ? 's' : ''} au ${formatDate(date)}.`);
      setCashSheet(true);
    } catch (requestError) {
      setState((current) => ({ ...current, error: requestError.message }));
    } finally {
      setSaving(false);
    }
  }

  // The feuille: what is comptabilisé on the date, or else a preview of the chosen lines.
  function openSheet() {
    if (showDone && done.length) setSheet({ rows: done, preview: false });
    else setSheet({ rows: selected, preview: true });
  }

  return <div className="expert-modal-backdrop jrn-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !sheet && !cashSheet) onClose(); }}>
    <section className="unpaid-modal jrn-modal" role="dialog" aria-modal="true" aria-labelledby="jrn-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>COMPTABILITÉ · MODULE {moduleId}</span><h2 id="jrn-title">{config.title}</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field jrn-company"><span>Compagnie</span>
            <select value={compagnie} onChange={(event) => setCompagnie(event.target.value)} autoFocus>
              <option value="">Choisir la compagnie…</option>
              {companies.map((item) => <option key={item.code_compagnie} value={item.code_compagnie}>{item.nom_compagnie}</option>)}
            </select>
          </label>
          <label className="acompte-field jrn-date"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          {kind === 'depense' && <label className="acompte-field jrn-date"><span>S/R</span>
            <select value={nature} onChange={(event) => setNature(event.target.value)}>
              <option value="">Tous</option><option value="S">Sinistres</option><option value="R">Ristournes</option>
            </select>
          </label>}
          <label className="acompte-field"><span>Rechercher</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={kind === 'depense' ? 'N° sinistre, police, immatriculation, assuré…' : 'N° quittance, police, assuré…'} /></label>
          <label className="jrn-check"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} /> Comptabilisés du jour</label>
        </div>

        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        {notice && <div className="cqi-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Masquer">×</button></div>}
        <section className="unpaid-results">
          <div className="unpaid-results-heading">
            <div><span>{config.heading}</span><h3>{!compagnie ? 'Choisissez une compagnie' : state.loading ? 'Chargement…' : `${shown.length} ligne${shown.length > 1 ? 's' : ''} · ${selected.length} choisie${selected.length > 1 ? 's' : ''}`}</h3></div>
            <div className="jrn-actions">
              <div className="unpaid-total"><small>Total choisi</small><strong>{fmt(sum(selected, config.amount))} TND</strong></div>
              <button type="button" className="expert-cancel" onClick={openSheet} disabled={!compagnie || (!selected.length && !(showDone && done.length))}>Imprimer le journal</button>
              <button type="button" className="expert-cancel" onClick={() => setCashSheet(true)} disabled={!company}>Feuille de caisse</button>
              <button type="button" className="expert-submit" onClick={comptabiliser} disabled={saving || !selected.length}>{saving ? 'Comptabilisation…' : 'Comptabiliser'}</button>
            </div>
          </div>
          {compagnie && !state.loading && shown.length === 0 ? <div className="unpaid-empty">Aucune ligne à comptabiliser pour cette compagnie à cette date.</div>
            : compagnie && <div className="unpaid-table-scroll cqi-scroll jrn-scroll"><table className="unpaid-table jrn-table">
              <thead><tr>
                <th className="cqi-verser"><input type="checkbox" aria-label="Tout choisir" checked={allChosen} onChange={toggleAll} disabled={!pending.length} /> Choix</th>
                {kind === 'encaissement'
                  ? <><th>TC</th><th>N° quittance</th><th>Échéance</th><th>N° contrat</th><th>Agence</th><th className="cqi-number">Prime</th><th>A/S</th><th className="cqi-number">Frais</th><th className="cqi-number">Timbre</th><th className="cqi-number">Comm.</th><th>Assuré</th><th>Comptabilisé</th></>
                  : <><th>N° sinistre / ristourne</th><th>Type</th><th>Date</th><th>N° contrat</th><th>Immatriculation</th><th className="cqi-number">Montant</th><th>Assuré</th><th>Chèque</th><th>Comptabilisé</th></>}
              </tr></thead>
              <tbody>{shown.map((row) => {
                const key = config.key(row);
                const on = row.comptabilise || chosen.has(key);
                return <tr key={key} className={row.comptabilise ? 'is-done' : on ? 'is-chosen' : ''} onClick={() => { if (!row.comptabilise) toggle(row); }}>
                  <td className="cqi-verser"><input type="checkbox" checked={on} disabled={row.comptabilise} onChange={() => toggle(row)} onClick={(event) => event.stopPropagation()} aria-label={`Choisir ${key}`} /></td>
                  {kind === 'encaissement'
                    ? <><td>{row.tc}</td><td><strong>{row.num_quittance}</strong></td><td>{formatDate(row.echeance)}</td><td>{row.num_police}</td><td>{row.code_agence || '00'}</td>
                      <td className="cqi-number">{fmt(row.montant)}</td><td>{row.a_s}</td><td className="cqi-number">{fmt(row.frais)}</td><td className="cqi-number">{fmt(row.timbre)}</td>
                      <td className="cqi-number">{fmt(row.comm)}</td><td>{row.assure}</td><td>{row.comptabilise ? 'Oui' : row.paye ? 'Non' : 'Non · impayée'}</td></>
                    : <><td><strong>{row.numero}</strong></td><td>{row.nature === 'R' ? 'Ristourne' : 'Sinistre'}</td><td>{formatDate(row.date_dep)}</td><td>{row.num_police}</td><td>{row.num_imat}</td>
                      <td className="cqi-number">{fmt(row.montant)}</td><td>{row.assure}</td><td>{row.num_cheq}</td><td>{row.comptabilise ? `Oui · ${formatDate(row.date_comptabilise)}` : 'Non'}</td></>}
                </tr>;
              })}</tbody>
            </table></div>}
        </section>
      </div>
    </section>

    {sheet && <div className="jrn-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheet(null); }}>
      <div className="jrn-sheet-frame">
        <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={() => window.print()}>Imprimer</button><button type="button" className="expert-cancel" onClick={() => setSheet(null)}>Fermer</button></div>
        <article className="jrn-sheet">
          <header className="jrn-sheet-head">
            <div className="jrn-agency">{AGENCY.map((line) => <span key={line}>{line}</span>)}</div>
            <div className="jrn-sheet-title">
              <h1>{kind === 'encaissement' ? 'JOURNAL D’ENCAISSEMENT DES QUITTANCES' : 'LISTE DES DÉPENSES (SINISTRE, RISTOURNE)'}</h1>
              <p>{sheet.preview ? 'APERÇU · NON COMPTABILISÉ' : kind === 'encaissement' ? 'NON VALIDÉ' : `Pour la date du ${formatDate(date)}`}</p>
            </div>
            <div className="jrn-agency jrn-printed"><span>Date impression : {formatDate(today())}</span></div>
          </header>
          <div className="jrn-sheet-info">
            <div><strong>{company?.nom_compagnie}</strong>{company?.adresse && <span>{company.adresse}</span>}{company?.ville && <span>{company.ville}</span>}</div>
            {kind === 'encaissement'
              ? <div><span>JEQ N° : <b>{date.replaceAll('-', '')}</b></span><span>Journée du : <b>{formatDate(date)}</b></span><span>Code : <b>{company?.code_agent}</b> · Assurance Jemmali</span></div>
              : <div><span>Nom compagnie : <b>{company?.nom_compagnie}</b></span></div>}
          </div>
          {kind === 'encaissement' ? <table className="jrn-sheet-table">
            <thead>
              <tr><th rowSpan={2}>TC</th><th colSpan={3}>Identification de la quittance encaissée</th><th rowSpan={2}>Prime nette + coût quit.</th><th colSpan={2}>Prime</th><th rowSpan={2}>Frais éventuels</th><th rowSpan={2}>Timbre quittance</th><th rowSpan={2}>Comm.</th><th rowSpan={2}>Assuré</th></tr>
              <tr><th>N° quittance</th><th>Échéance</th><th>N° contrat</th><th>Solde</th><th>Acompte</th></tr>
            </thead>
            <tbody>{sheet.rows.map((row) => <tr key={config.key(row)}>
              <td>{row.tc}</td><td>{row.num_quittance}</td><td>{formatDate(row.echeance)}</td><td>{row.num_police}</td><td className="num">{fmt(row.prime_cout)}</td>
              <td className="num">{row.a_s === 'S' ? fmt(row.montant) : fmt(0)}</td><td className="num">{row.a_s === 'A' ? fmt(row.montant) : fmt(0)}</td>
              <td className="num">{fmt(row.frais)}</td><td className="num">{fmt(row.timbre)}</td><td className="num">{fmt(row.comm)}</td><td>{row.assure}</td>
            </tr>)}</tbody>
            <tfoot><tr>
              <td colSpan={4} /><td className="num">{fmt(sum(sheet.rows, 'prime_cout'))}</td>
              <td className="num">{fmt(sum(sheet.rows.filter((row) => row.a_s === 'S'), 'montant'))}</td><td className="num">{fmt(sum(sheet.rows.filter((row) => row.a_s === 'A'), 'montant'))}</td>
              <td className="num">{fmt(sum(sheet.rows, 'frais'))}</td><td className="num">{fmt(sum(sheet.rows, 'timbre'))}</td><td className="num">{fmt(sum(sheet.rows, 'comm'))}</td><td />
            </tr></tfoot>
          </table> : <table className="jrn-sheet-table">
            <thead><tr><th>Sinistre / ristourne</th><th>SR</th><th>N° police</th><th>Assuré</th><th>Montant</th><th>D.Com</th><th>N° chèque</th><th>Immatriculation</th></tr></thead>
            <tbody>{sheet.rows.map((row) => <tr key={config.key(row)}>
              <td>{row.numero}</td><td>{row.nature === 'R' ? 'RIS' : 'SIN'}</td><td>{row.num_police}</td><td>{row.assure}</td>
              <td className="num">{fmt(row.montant)}</td><td className="num">{fmt(row.d_com)}</td><td>{row.num_cheq}</td><td>{row.num_imat}</td>
            </tr>)}</tbody>
            <tfoot><tr><td colSpan={4}>Total</td><td className="num">{fmt(sum(sheet.rows, 'montant'))}</td><td className="num">{fmt(sum(sheet.rows, 'd_com'))}</td><td colSpan={2} /></tr></tfoot>
          </table>}
          <p className="jrn-grand-total">Total général : <b>{fmt(sum(sheet.rows, 'montant'))}</b></p>
        </article>
      </div>
    </div>}
    {cashSheet && company && <CashSheet company={company} date={date} onClose={() => setCashSheet(false)} />}
  </div>;
}
