import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import JournalPeriods from './JournalPeriods';
import { getExpensesJournal, getReceiptChoices, getReceiptsJournal, listJournalCompanies, postExpenses, postReceipts, saveReceiptChoices } from '../../services/journalApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import '../ChequeInstanceModal/ChequeInstanceModal.css';
import { CashSheet, isJournalDay, journalDay } from './FeuilleCaisse';
import './JournalModal.css';
import { AGENCY_PYRAMID } from '../../data/agencyInfo';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmt = (value) => money.format(Number(value || 0));
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
// What the journal line of a quittance is: [label, explanation shown on hover].
// An encaissement is declared (by the validation of the feuille de caisse) once the client has paid something not
// declared yet: all of it, or an acompte.
export const canDeclare = (row) => !row.comptabilise && (row.paye || row.a_s === 'A');
// The day a line is (or will be) declared: the day it was comptabilisée, else the journal date. Journals are made on the
// 15th and the last day of the month: a line declared on another day is shown in red.
export const offDay = (row, date) => !isJournalDay(row.comptabilise ? row.date_comptabilise : date);
const receiptStatus = (row) => {
  if (row.comptabilise) return ['Déjà déclarée', `Comptabilisée au journal (${row.a_s === 'A' ? 'acompte' : 'solde'}).`];
  if (row.paye) return ['Payée intégralement', 'Le client a tout réglé : la quittance est déclarée pour son montant.'];
  if (row.a_s === 'A') return ['Acompte', `Paiement partiel : l’acompte de ${fmt(row.montant)} est à déclarer, il reste ${fmt(row.solde_quittance)} dû par le client.`];
  return ['Reste dû', `Les acomptes (${fmt(row.regle)}) sont déjà déclarés : la ligne déclarerait les ${fmt(row.solde_quittance)} que le client n’a pas encore payés.`];
};

// Each journal: how its lines are read, keyed, pre-chosen, searched and comptabilisées.
const KINDS = {
  encaissement: {
    title: 'Journal d’encaissement',
    heading: 'QUITTANCES DÉCLARÉES À CETTE DATE ET QUITTANCES RÉGLÉES À DÉCLARER · COCHÉES PAR DÉFAUT · « VALIDER » DANS LA FEUILLE DE CAISSE LES DÉCLARE À SA DATE',
    load: getReceiptsJournal,
    post: (token, compagnie, date, rows) => postReceipts(token, { compagnie, date, quittances: rows.map((row) => row.num_quittance) }),
    key: (row) => row.num_quittance,
    // Every quittance paid by a client (RDetRegCli) is chosen from the start; one is left out by unticking it.
    preselect: () => true,
    text: (row) => `${row.num_quittance} ${row.num_police || ''} ${row.assure || ''} ${row.code_client || ''} ${row.nom_compagnie || ''}`,
    amount: 'montant',
    // Every company is listed until one is chosen.
    allCompanies: true,
    // The journal of the date: the quittances declared on it (in its period), and every quittance paid by then still to declare.
    settled: true,
    // No "Comptabiliser": the lines chosen are declared by the validation of the feuille de caisse ("Valider").
    readOnly: true,
    // The encaissements declared in the period of the date (1st-15th, 16th-end of the month) stay listed, ticked.
    showDone: true,
    // The feuille de caisse validates the quittances chosen here.
    selection: (keys) => ({ quittances: keys }),
    // Every line, declared or not, is ticked and can be unticked; the ticks of a date are kept on the server, so the
    // journal of that date shows the same choice when it is opened again. "Valider" on the feuille of the date declares
    // the ticked lines and takes the unticked ones out of the date.
    choices: { load: getReceiptChoices, save: saveReceiptChoices },
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
    // As the legacy journal: the dépenses comptabilisées on the date are listed (and printed) from the start.
    showDone: true,
    // "Lister" without a company: the dépenses of every company.
    allCompanies: true,
    selection: (keys) => ({ depenses: keys.map(Number) }),
  },
};

// Journal d'encaissement / de dépense of a company on a date: the lines still to comptabiliser, chosen with "Choix";
// "Comptabiliser" records them on that date and shows the feuille de caisse to print.
export default function JournalModal({ kind = 'encaissement', moduleId, onClose }) {
  const config = KINDS[kind];
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [compagnie, setCompagnie] = useState('');
  // The journal day: the 15th until the 15th, then the last day of the month (11/11 -> 15/11, 16/11 -> 30/11).
  const [date, setDate] = useState(journalDay);
  // Encaissement: only the quittances a client paid something on (a date de règlement and Réglé > 0).
  const settledParams = () => (config.settled ? { regles: true, periode: true } : {});
  // A line that can be ticked / unticked: every line of the journal d'encaissement, the ones not comptabilisées elsewhere.
  const editable = (row) => Boolean(config.choices) || !row.comptabilise;
  const [nature, setNature] = useState(''); // dépense: '' | S | R
  const [showDone, setShowDone] = useState(Boolean(config.showDone));
  const [search, setSearch] = useState('');
  const [state, setState] = useState({ loading: false, error: '', items: [] });
  const [chosen, setChosen] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [sheet, setSheet] = useState(null); // the journal printout: { rows, preview }
  const [cashSheet, setCashSheet] = useState(false); // the feuille de caisse of the company on the date
  // "Lister" (and the opening): one line per journal of the half months; "Détails" opens the lines of one of them.
  const [view, setView] = useState('journaux');
  const [periodsKey, setPeriodsKey] = useState(0);
  // The lines of the journal opened: { compagnie, date, nature }, read again when a filter changes.
  const [listedFor, setListedFor] = useState(null);

  useEffect(() => {
    let active = true;
    listJournalCompanies(accessToken)
      .then((rows) => { if (active) setCompanies(rows || []); })
      .catch((requestError) => { if (active) setState((current) => ({ ...current, error: requestError.message })); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => { setListedFor(view === 'detail' && date ? { compagnie, date, nature, at: Date.now() } : null); }, [compagnie, date, nature, view]);

  useEffect(() => {
    if (!listedFor) { setState({ loading: false, error: '', items: [] }); setChosen(new Set()); return undefined; }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    Promise.all([
      config.load(accessToken, { compagnie: listedFor.compagnie, date: listedFor.date, nature: listedFor.nature, comptabilises: showDone, journal: true, ...settledParams(listedFor.date) }),
      config.choices ? config.choices.load(accessToken, listedFor.date).catch(() => ({ choix: {} })) : Promise.resolve({ choix: {} }),
    ])
      .then(([body, kept]) => {
        if (!active) return;
        const items = body.items || [];
        const choix = kept.choix || {};
        setState({ loading: false, error: '', items });
        // Ticked from the start, unless unticked on this date before.
        setChosen(new Set(items.filter((row) => editable(row) && config.preselect(row) && choix[config.key(row)] !== false).map(config.key)));
      })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, items: [] }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settledParams only depends on config
  }, [accessToken, config, listedFor, showDone]);
  const list = () => { setView('journaux'); setPeriodsKey((value) => value + 1); };
  // The lines of the journal of a half month (its date: the 15th or the last day of the month).
  const openJournal = (jour) => { setDate(jour); setView('detail'); };

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { if (cashSheet) setCashSheet(false); else if (sheet) setSheet(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, cashSheet, onClose]);

  const company = companies.find((item) => String(item.code_compagnie) === String(compagnie));
  const listed = Boolean(listedFor);
  const allListed = listed && !listedFor.compagnie;
  const shown = useMemo(() => {
    const text = search.trim().toLocaleLowerCase();
    return text ? state.items.filter((row) => config.text(row).toLocaleLowerCase().includes(text)) : state.items;
  }, [state.items, search, config]);
  const pending = shown.filter(editable);
  const selected = state.items.filter((row) => editable(row) && chosen.has(config.key(row)));
  const done = state.items.filter((row) => row.comptabilise);
  const allChosen = pending.length > 0 && pending.every((row) => chosen.has(config.key(row)));

  // A tick or untick is kept on the server for the date of the journal: opened again on that date, the journal shows it.
  const remember = (rows, ticked) => {
    if (!config.choices || !listedFor || !rows.length) return;
    config.choices.save(accessToken, listedFor.date, rows.map((row) => ({ num_quittance: config.key(row), coche: ticked })))
      .catch((requestError) => setState((current) => ({ ...current, error: `Choix non enregistré : ${requestError.message}` })));
  };
  const toggle = (row) => {
    const ticked = !chosen.has(config.key(row));
    setChosen((current) => {
      const next = new Set(current);
      if (ticked) next.add(config.key(row)); else next.delete(config.key(row));
      return next;
    });
    remember([row], ticked);
  };
  const toggleAll = () => {
    const ticked = !allChosen;
    setChosen((current) => {
      const next = new Set(current);
      pending.forEach((row) => (ticked ? next.add(config.key(row)) : next.delete(config.key(row))));
      return next;
    });
    remember(pending, ticked);
  };

  async function comptabiliser() {
    if (!selected.length) return;
    const message = `Comptabiliser ${selected.length} ligne${selected.length > 1 ? 's' : ''} (${fmt(sum(selected, config.amount))} TND) pour ${company?.nom_compagnie || (compagnie ? 'la compagnie' : 'leurs compagnies')} au ${formatDate(date)} ?`;
    if (!window.confirm(message)) return;
    setSaving(true); setNotice('');
    try {
      // With every company listed, each company's lines go in its own journal.
      const groups = new Map();
      selected.forEach((row) => {
        const code = compagnie || row.code_compagnie;
        groups.set(code, [...(groups.get(code) || []), row]);
      });
      let count = 0;
      for (const [code, rows] of groups) {
        const result = await config.post(accessToken, Number(code), date, rows);
        count += result.comptabilisees;
      }
      const body = await config.load(accessToken, { compagnie, date, nature, comptabilises: true, journal: true, ...settledParams(date) });
      const items = body.items || [];
      setShowDone(true);
      setState({ loading: false, error: '', items });
      setChosen(new Set());
      setNotice(`${count} ligne${count > 1 ? 's' : ''} comptabilisée${count > 1 ? 's' : ''} au ${formatDate(date)}${groups.size > 1 ? ` (${groups.size} compagnies)` : ''}.`);
      if (company) setCashSheet(true);
    } catch (requestError) {
      setState((current) => ({ ...current, error: requestError.message }));
    } finally {
      setSaving(false);
    }
  }

  // The feuille de caisse validates the lines ticked here (once listed); otherwise every line still to declare.
  const cashSelection = listed && config.selection ? config.selection(selected.filter((row) => !row.comptabilise).map(config.key)) : undefined;
  // After its validation the journal is read again: the lines declared stay listed, ticked.
  const afterCashValidation = () => { if (listed) setListedFor((current) => ({ ...current, at: Date.now() })); };

  // The feuille: what is comptabilisé on the date, or else a preview of the chosen lines.
  function openSheet() {
    // Encaissement: the lines ticked (a preview while some are still to declare).
    if (config.choices) setSheet({ rows: selected, preview: selected.some((row) => !row.comptabilise) });
    else if (showDone && done.length) setSheet({ rows: done, preview: false });
    else setSheet({ rows: selected, preview: true });
  }

  return <div className="expert-modal-backdrop jrn-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !sheet && !cashSheet) onClose(); }}>
    <section className="unpaid-modal jrn-modal" role="dialog" aria-modal="true" aria-labelledby="jrn-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>COMPTABILITÉ · MODULE {moduleId}</span><h2 id="jrn-title">{config.title}</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field jrn-company"><span>Compagnie</span>
            <select value={compagnie} onChange={(event) => setCompagnie(event.target.value)} autoFocus>
              <option value="">{config.allCompanies ? 'Toutes les compagnies' : 'Choisir la compagnie…'}</option>
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
          <button type="button" className="expert-submit jrn-open" onClick={list} disabled={!date || state.loading}>{state.loading ? 'Chargement…' : 'Lister'}</button>
        </div>

        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        {notice && <div className="cqi-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Masquer">×</button></div>}
        {view === 'journaux' ? <JournalPeriods kind={kind} accessToken={accessToken} date={date} compagnie={compagnie} nature={nature} companyName={company?.nom_compagnie}
          reloadKey={periodsKey} onOpen={openJournal} onValidated={setNotice} />
        : <section className="unpaid-results">
          <div className="unpaid-results-heading">
            <div><button type="button" className="jrn-back" onClick={() => setView('journaux')}>← Tous les journaux</button>
              <span>{config.title.toUpperCase()} DU {formatDate(date)} · {config.heading}</span><h3>{!listed ? 'Choisissez la date' : state.loading ? 'Chargement…' : `${shown.length} ligne${shown.length > 1 ? 's' : ''} · ${selected.length} choisie${selected.length > 1 ? 's' : ''}`}</h3></div>
            <div className="jrn-actions">
              <div className="unpaid-total"><small>Total choisi</small><strong>{fmt(sum(selected, config.amount))} TND</strong></div>
              <button type="button" className="expert-cancel" onClick={openSheet} disabled={!listed || !listedFor.compagnie || (!selected.length && !(showDone && done.length))} title={listed && listedFor.compagnie ? undefined : 'Choisissez une compagnie puis « Lister »'}>Imprimer le journal</button>
              <button type="button" className="expert-cancel" onClick={() => setCashSheet(true)} disabled={!company} title={company ? undefined : 'Choisissez une compagnie'}>Feuille de caisse</button>
              {!config.readOnly && <button type="button" className="expert-submit" onClick={comptabiliser} disabled={saving || !selected.length}>{saving ? 'Comptabilisation…' : 'Comptabiliser'}</button>}
            </div>
          </div>
          {kind === 'encaissement' && listed && shown.some((row) => offDay(row, listedFor.date)) && <p className="jrn-offday-legend"><i aria-hidden="true" /> En rouge : quittance déclarée (ou à déclarer) un autre jour que le 15 ou le dernier jour du mois.</p>}
          {listed && !state.loading && shown.length === 0 ? <div className="unpaid-empty">{kind === 'depense' ? `Aucune dépense à déclarer ${allListed ? '' : 'pour cette compagnie '}à cette date.` : `Aucune quittance déclarée ou à déclarer au ${formatDate(listedFor.date)}${allListed ? '' : ' pour cette compagnie'}.`}</div>
            : listed && <div className="unpaid-table-scroll cqi-scroll jrn-scroll"><table className="unpaid-table jrn-table">
              <thead><tr>
                <th className="cqi-verser"><input type="checkbox" aria-label="Tout choisir" checked={allChosen} onChange={toggleAll} disabled={!pending.length} /> Choix</th>
                {kind === 'encaissement'
                  ? <>{allListed && <th>Compagnie</th>}<th>TC</th><th>N° quittance</th><th>Échéance</th><th>N° contrat</th><th>Agence</th><th className="cqi-number">Prime</th><th>A/S</th><th className="cqi-number">Frais</th><th className="cqi-number">Timbre</th><th className="cqi-number">Comm.</th><th>Assuré</th><th className="cqi-number">Réglé</th><th>Dernier règlement</th></>
                  : <>{allListed && <th>Compagnie</th>}<th>N° sinistre / ristourne</th><th>Type</th><th>Date</th><th>N° contrat</th><th>Immatriculation</th><th className="cqi-number">Montant</th><th>Assuré</th><th>Chèque</th><th>Comptabilisé</th></>}
              </tr></thead>
              <tbody>{shown.map((row) => {
                const key = config.key(row);
                const on = editable(row) ? chosen.has(key) : row.comptabilise;
                const red = kind === 'encaissement' && offDay(row, listedFor.date);
                const status = kind === 'encaissement' ? receiptStatus(row) : null;
                return <tr key={key} className={`${!editable(row) ? 'is-done' : on ? 'is-chosen' : ''}${red ? ' is-offday' : ''}`} onClick={() => { if (editable(row)) toggle(row); }}
                  title={status ? `${status[0]} : ${status[1]}${row.comptabilise && row.date_comptabilise ? ` Déclarée le ${formatDate(row.date_comptabilise)}.` : ''}` : undefined}>
                  <td className="cqi-verser"><input type="checkbox" checked={on} disabled={!editable(row)} onChange={() => toggle(row)} onClick={(event) => event.stopPropagation()} aria-label={`Choisir ${key}`} /></td>
                  {kind === 'encaissement'
                    ? <>{allListed && <td>{row.nom_compagnie}</td>}<td>{row.tc}</td><td><strong>{row.num_quittance}</strong></td><td>{formatDate(row.echeance)}</td><td>{row.num_police}</td><td>{row.code_agence || '00'}</td>
                      <td className="cqi-number">{fmt(row.montant)}</td><td>{row.a_s}</td><td className="cqi-number">{fmt(row.frais)}</td><td className="cqi-number">{fmt(row.timbre)}</td>
                      <td className="cqi-number">{fmt(row.comm)}</td><td>{row.assure}</td>
                      <td className="cqi-number" title={row.pieces_reglement ? `Pièce(s) : ${row.pieces_reglement}` : undefined}>{fmt(row.regle)}</td><td>{formatDate(row.date_reglement)}</td></>
                    : <>{allListed && <td>{row.nom_compagnie}</td>}<td><strong>{row.numero}</strong></td><td>{row.nature === 'R' ? 'Ristourne' : 'Sinistre'}</td><td>{formatDate(row.date_dep)}</td><td>{row.num_police}</td><td>{row.num_imat}</td>
                      <td className="cqi-number">{fmt(row.montant)}</td><td>{row.assure}</td><td>{row.num_cheq}</td><td>{row.comptabilise ? `Oui · ${formatDate(row.date_comptabilise)}` : 'Non'}</td></>}
                </tr>;
              })}</tbody>
            </table></div>}
        </section>}
      </div>
    </section>

    {sheet && <div className="jrn-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheet(null); }}>
      <div className="jrn-sheet-frame">
        <div className="jrn-sheet-tools"><button type="button" className="expert-submit" onClick={() => window.print()}>Imprimer</button><button type="button" className="expert-cancel" onClick={() => setSheet(null)}>Fermer</button></div>
        <article className="jrn-sheet">
          <header className="jrn-sheet-head">
            <div className="jrn-agency">{AGENCY_PYRAMID.map((line) => <span key={line}>{line}</span>)}</div>
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
    {cashSheet && company && <CashSheet company={company} date={date} selection={listedFor?.compagnie === compagnie && listedFor?.date === date ? cashSelection : undefined}
      onValidated={afterCashValidation} onClose={() => setCashSheet(false)} />}
  </div>;
}
