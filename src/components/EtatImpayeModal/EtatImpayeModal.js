import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { downloadMemoirePdf, getClientLinks, getMemoireContacts, getRecoveryRate, getUnpaidStatement, listStatementCompanies, sendMemoire } from '../../services/unpaidApi';
import { getClientReglements } from '../../services/reglementClientApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import './EtatImpayeModal.css';
import { AGENCY } from '../../data/agencyInfo';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const amount = (value) => Number(value || 0);
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const initialFilters = {
  code_client: '', nom_client: '', view: 'global', piece: 'avec',
  dates: false, date_debut: '2020-01-01', date_fin: today(),
  // Every client type (particuliers and sociétés), as the legacy report; "Type client" narrows it to one.
  typed: false, type_client: 'P', compagnie: false, code_compagnie: '', mise_en_demeure: false, jours: 15, jours_autres: 60,
};
const DAY = 86400000;
const shiftDate = (iso, days) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);
const daysLate = (row) => Math.floor((Date.parse(today()) - Date.parse(String(row.echeance).slice(0, 10))) / DAY);
// "T" + "10/2026" as the legacy report prints it; a comptant quittance is just "C".
const termOf = (row) => (row.tc === 'T' && row.periode ? `T${row.periode}` : row.tc || '');
const total = (rows) => rows.reduce((sum, row) => sum + amount(row.solde), 0);
const sumOf = (rows, key) => rows.reduce((sum, row) => sum + amount(row[key]), 0);
const percent = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Taux de recouvrement = encaissements de l'année en cours / primes de l'année en cours exigibles.
export const RecoveryRate = ({ rate }) => <div className="eti-recovery" aria-label="Taux de recouvrement">
  <span>Taux de recouvrement {rate.annee}</span>
  <strong>{rate.taux == null ? '—' : `${percent.format(rate.taux)} %`}</strong>
  <small>Encaissements : {money.format(rate.encaissements)} TND</small>
  <small>Primes exigibles au {formatDate(rate.au)} : {money.format(rate.primes_exigibles)} TND</small>
</div>;
// summary: [label, amount] lines printed under the date (the mise en demeure totals, on its first page);
// recovery: the taux de recouvrement of the statement's scope.
const letterhead = (title, summary, recovery) => <div className="eti-letterhead">
  <address>{AGENCY.map((line) => <span key={line}>{line}</span>)}</address>
  <div className="eti-head-side">
    <span className="eti-date">Date : <b>{formatDate(today())}</b></span>
    {recovery && <RecoveryRate rate={recovery} />}
    {summary && <table className="eti-summary"><tbody>{summary.map(([label, value], index) => <tr key={label} className={index === summary.length - 1 ? 'is-total' : ''}><td>{label}</td><td>{money.format(value)} TND</td></tr>)}</tbody></table>}
  </div>
  <h3>{title}</h3>
</div>;
// Rows (already sorted by code client, compagnie, échéance) grouped by client, then, for the mémoire, by compagnie.
function byClient(rows) {
  const groups = [];
  rows.forEach((row) => {
    let group = groups[groups.length - 1];
    if (!group || group.code_client !== row.code_client) { group = { ...row, rows: [] }; groups.push(group); }
    group.rows.push(row);
  });
  return groups;
}
function byCompany(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row.nom_compagnie || 'Sans compagnie';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  });
  return [...groups.entries()];
}

// Etat des impayés: quittances still unpaid, "avec pièce" (a cheque / traite en instance covers them, the solde is what it
// leaves) or "sans pièce" (nothing given yet, solde > 0). The modal only takes the criteria; "Aperçu" opens the preview page:
// "Global" lists the quittances by client, "Détaillé" the mémoire de règlement of each client by compagnie. A client asked
// for by code gets its mémoire de règlement only, and so do its liens, each in its own dossier.
export default function EtatImpayeModal({ onClose, moduleId = '340' }) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { items, limit, detail, sans, groups? }: the report being shown
  // Mise en demeure: two groups, the automobile particuliers past "jours" days and the others past "jours_autres" days.
  const relance = filters.mise_en_demeure;

  useEffect(() => {
    listStatementCompanies(accessToken).then((body) => setCompanies(body.items || [])).catch(() => setCompanies([]));
  }, [accessToken]);

  // A typed code brings the client's name, as in the legacy screen.
  useEffect(() => {
    const code = filters.code_client.trim();
    if (!code) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      getClientReglements(accessToken, code)
        .then((body) => { if (active && body.client) setFilters((current) => ({ ...current, nom_client: (body.client.nom_client || '').trim() })); })
        .catch(() => {});
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, filters.code_client]);

  // The name only filters when no code is typed. In relance every client type is read (the "Autres" group holds the
  // sociétés too). "Entre deux dates" bounds the échéance; without it, relance keeps the échéances at least as old as
  // the shorter of the two delays.
  const query = () => {
    const overdue = shiftDate(today(), -Math.min(Number(filters.jours), Number(filters.jours_autres)));
    return {
      code_client: filters.code_client.trim(),
      nom_client: filters.code_client.trim() ? '' : filters.nom_client.trim(),
      piece: filters.piece,
      date_debut: filters.dates ? filters.date_debut : '',
      // In relance the échéance is also at least as old as the shorter delay, dates ticked or not.
      date_fin: relance && (!filters.dates || filters.date_fin > overdue) ? overdue : filters.dates ? filters.date_fin : '',
      // Type client when ticked, except in mise en demeure (its "Autres" group holds the sociétés too) and when one client
      // is asked for by code or name.
      type_client: filters.typed && !relance && !filters.code_client.trim() && !filters.nom_client.trim() ? filters.type_client : '',
      code_compagnie: filters.compagnie ? filters.code_compagnie : '',
    };
  };
  // The client's dossier, then one per lien (its own Lien and the clients whose Lien it is) that has impayés, read with
  // the same criteria. The client's own dossier is kept even when empty, so its liens can still be reached.
  async function linkedDossiers(code, items) {
    let links = { client: { code_client: code, nom_client: filters.nom_client }, liens: [] };
    try { links = await getClientLinks(accessToken, code); } catch { /* no lien: the client alone */ }
    const others = [];
    for (let start = 0; start < links.liens.length; start += 6) {
      const batch = links.liens.slice(start, start + 6);
      // eslint-disable-next-line no-await-in-loop
      const bodies = await Promise.all(batch.map((lien) => getUnpaidStatement(accessToken, { ...query(), code_client: lien.code_client })));
      batch.forEach((lien, index) => { if (bodies[index].items?.length) others.push({ ...lien, items: bodies[index].items }); });
    }
    return [{ ...links.client, relation: 'client', items }, ...others];
  }

  async function apercu() {
    if (filters.dates && filters.date_debut && filters.date_fin && filters.date_debut > filters.date_fin) { setError('La date de début doit précéder la date de fin.'); return; }
    const jours = Number(filters.jours);
    const joursAutres = Number(filters.jours_autres);
    if (relance && ![jours, joursAutres].every((value) => Number.isInteger(value) && value >= 1 && value <= 365)) { setError('Le nombre de jours doit être entre 1 et 365.'); return; }
    setLoading(true);
    setError('');
    try {
      const params = query();
      // The taux de recouvrement of the same client / company / type of client (the report is shown without it if it fails).
      const [body, recovery] = await Promise.all([
        getUnpaidStatement(accessToken, params),
        getRecoveryRate(accessToken, { code_client: params.code_client, type_client: params.type_client, code_compagnie: params.code_compagnie }).catch(() => null),
      ]);
      // Mise en demeure: automobile particuliers past "jours" days; every other quittance (particulier non automobile,
      // société) past "jours_autres" days. "Entre deux dates" only narrows the échéances: the delays still apply.
      const autoParticulier = (row) => row.type_client === 'P' && row.automobile;
      // Every overdue quittance, with the report's solde: "Avec pièce", net of the pièces en instance (listed under
      // Pièce(s)), so each group's Total général is its total net of the pièces en instance.
      const owed = body.items || [];
      const range = filters.dates ? ` (ÉCHÉANCES DU ${formatDate(filters.date_debut)} AU ${formatDate(filters.date_fin)})` : '';
      const groups = relance ? [
        { title: `AUTOMOBILE PARTICULIERS — IMPAYÉS DE PLUS DE ${jours} JOURS${range}`, rows: owed.filter((row) => autoParticulier(row) && daysLate(row) >= jours) },
        { title: `AUTRES — IMPAYÉS DE PLUS DE ${joursAutres} JOURS${range}`, rows: owed.filter((row) => !autoParticulier(row) && daysLate(row) >= joursAutres) },
      ] : null;
      const items = groups ? groups.flatMap((group) => group.rows) : body.items || [];
      // One client asked for by code: its mémoire de règlement, then those of its liens, each in its own dossier.
      const dossiers = !relance && filters.code_client.trim() ? await linkedDossiers(filters.code_client.trim(), items) : null;
      if (dossiers ? !dossiers.some((dossier) => dossier.items.length) : !items.length) setError('Aucune quittance impayée ne correspond aux critères.');
      else setPreview({ items, limit: body.limit, detail: !relance && filters.view === 'detail', sans: filters.piece === 'sans', groups, dossiers, recovery,
        criteria: { piece: params.piece, date_debut: params.date_debut, date_fin: params.date_fin, code_compagnie: params.code_compagnie } });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const set = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const update = (event) => {
    const { name, type, checked, value } = event.target;
    set({ [name]: type === 'checkbox' ? checked : value, ...(name === 'code_client' && !value.trim() ? { nom_client: '' } : {}) });
    setError('');
  };
  const detail = filters.view === 'detail';
  const sans = filters.piece === 'sans';

  if (preview) return <EtatImpayePreview {...preview} onBack={() => setPreview(null)} onClose={onClose} />;

  return <div className="expert-modal-backdrop eti-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal eti-modal" role="dialog" aria-modal="true" aria-labelledby="eti-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>RECOUVREMENT · MODULE {moduleId}</span><h2 id="eti-title">Etat des impayés agence</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form eti-filters">
          <div className="eti-row">
            <label className="eti-field eti-code"><span>Code client</span><input name="code_client" value={filters.code_client} onChange={update} maxLength={8} placeholder="Tous" /></label>
            <label className="eti-field eti-name"><span>Nom client</span><input name="nom_client" value={filters.nom_client} onChange={update} maxLength={30} placeholder="Tous les clients" readOnly={Boolean(filters.code_client.trim())} /></label>
            <div className="eti-buttons">
              <button type="button" className="expert-submit" onClick={apercu} disabled={loading}>{loading ? 'Préparation…' : 'Aperçu'}</button>
              <button type="button" className="expert-cancel" onClick={() => setFilters({ ...initialFilters, date_fin: today() })}>Effacer</button>
            </div>
          </div>
          <div className="eti-row">
            <fieldset className="unpaid-filter-set unpaid-choice"><legend>Affichage</legend>
              <label><input type="radio" name="view" value="detail" checked={detail} onChange={update} /> Détaillé</label>
              <label><input type="radio" name="view" value="global" checked={!detail} onChange={update} /> Global</label>
            </fieldset>
            <fieldset className="unpaid-filter-set unpaid-choice"><legend>Pièce</legend>
              <label><input type="radio" name="piece" value="avec" checked={!sans} onChange={update} /> Avec pièce</label>
              <label><input type="radio" name="piece" value="sans" checked={sans} onChange={update} /> Sans pièce</label>
            </fieldset>
            <fieldset className="unpaid-filter-set eti-dates"><legend><label><input type="checkbox" name="dates" checked={filters.dates} onChange={update} /> Entre deux dates</label></legend>
              <label className="eti-field"><span>Date début</span><input type="date" name="date_debut" value={filters.date_debut} onChange={update} disabled={!filters.dates} /></label>
              <label className="eti-field"><span>Date fin</span><input type="date" name="date_fin" value={filters.date_fin} onChange={update} disabled={!filters.dates} /></label>
            </fieldset>
          </div>
          <div className="eti-row">
            <div className="eti-checks">
              <label className="eti-check"><input type="checkbox" name="compagnie" checked={filters.compagnie} onChange={update} /> Compagnie :
                <select name="code_compagnie" value={filters.code_compagnie} onChange={update} disabled={!filters.compagnie}>
                  <option value="">Toutes</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.label}</option>)}
                </select>
              </label>
              {!relance && <fieldset className="unpaid-filter-set unpaid-choice"><legend><label><input type="checkbox" name="typed" checked={filters.typed} onChange={update} /> Type client</label></legend>
                <label><input type="radio" name="type_client" value="P" checked={filters.type_client === 'P'} onChange={update} disabled={!filters.typed} /> Particulier</label>
                <label><input type="radio" name="type_client" value="S" checked={filters.type_client === 'S'} onChange={update} disabled={!filters.typed} /> Société</label>
              </fieldset>}
              <div className="eti-check">
                <label className="eti-check"><input type="checkbox" name="mise_en_demeure" checked={filters.mise_en_demeure} onChange={update} /> Mise en demeure</label>
                {relance && <label className="eti-check eti-days">Nombre jours<input type="number" name="jours" min={1} max={365} value={filters.jours} onChange={update} /> jours (auto particuliers)</label>}
                {relance && <label className="eti-check eti-days">Autres<input type="number" name="jours_autres" min={1} max={365} value={filters.jours_autres} onChange={update} /> jours</label>}
              </div>
            </div>
          </div>
        </div>

        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
      </div>
    </section>
  </div>;
}

// The preview page (as the legacy report viewer): a toolbar, then the report on paper sheets; "Imprimer" prints only them.
// One "Etat des impayées" sheet: the quittances by client, with what the client already paid on them (its règlements) and
// client and general totals. "Avec pièce": a line whose pièces leave a solde to pay is shown in red.
function StatementPage({ title, rows, sans, summary, recovery }) {
  const clients = useMemo(() => byClient(rows), [rows]);
  const span = sans ? 2 : 3;
  return <article className="eti-page">
    {letterhead(title, summary, recovery)}
    {rows.length ? <div className="eti-scroll"><table className="eti-table">
      <thead><tr><th>N° Police</th><th>TC</th><th>Échéance</th><th className="eti-num">Prime</th><th className="eti-num">Réglé</th><th className="eti-num">Solde</th><th>N° quittance</th>{!sans && <th>Pièce(s)</th>}<th>Observation</th></tr></thead>
      {clients.map((client) => <tbody key={client.code_client}>
        <tr className="eti-client"><td colSpan={sans ? 8 : 9}>Code client : <b>{client.code_client}</b><span>Nom client : <b>{client.nom_client || '—'}</b></span></td></tr>
        {client.rows.map((row) => <tr key={row.num_quittance} className={!sans && amount(row.solde) > 0.0005 ? 'is-due' : undefined}>
          <td data-label="N° Police">{row.num_int}</td><td data-label="TC">{termOf(row)}</td><td data-label="Échéance">{formatDate(row.echeance)}</td>
          <td data-label="Prime" className="eti-num">{money.format(amount(row.montant_quittance))}</td>
          <td data-label="Réglé" className="eti-num" title={row.date_reglement ? `Dernier règlement le ${formatDate(row.date_reglement)}` : undefined}>{money.format(amount(row.regle))}</td>
          <td data-label="Solde" className="eti-num">{money.format(amount(row.solde))}</td>
          <td data-label="N° quittance">{row.num_quittance}</td>{!sans && <td data-label="Pièce(s)">{row.pieces}</td>}<td data-label="Observation">{row.observation}</td>
        </tr>)}
        <tr className="eti-subtotal"><td colSpan={4}>Total client</td><td className="eti-num">{money.format(sumOf(client.rows, 'regle'))}</td><td className="eti-num">{money.format(total(client.rows))}</td><td colSpan={span} /></tr>
      </tbody>)}
      <tfoot><tr className="eti-grand"><td colSpan={4}>Total général</td><td className="eti-num">{money.format(sumOf(rows, 'regle'))}</td><td className="eti-num">{money.format(total(rows))}</td><td colSpan={span} /></tr></tfoot>
    </table></div> : <p className="eti-empty">Aucune quittance impayée dans ce groupe.</p>}
  </article>;
}

// One client's "Mémoire de règlement": its unpaid quittances by compagnie.
function MemoirePage({ client }) {
  return <article className="eti-page">
    {letterhead('MÉMOIRE DE RÈGLEMENT')}
    <dl className="eti-client-card">
      <dt>Client</dt><dd><b>{client.code_client}</b>&nbsp;&nbsp;{client.nom_client}</dd>
      <dt>Adresse</dt><dd>{client.adresse || '—'}</dd>
      <dt>Ville</dt><dd>{client.ville || '—'}</dd>
      <dt>Code postal</dt><dd>{client.cp ?? '—'}</dd>
    </dl>
    {byCompany(client.rows).map(([name, rows]) => <section key={name} className="eti-company">
      <h4>Compagnie : {name}</h4>
      <div className="eti-scroll"><table className="eti-table">
        <thead><tr><th>N° Police</th><th>TC</th><th>Échéance</th><th className="eti-num">Prime</th><th className="eti-num">Solde</th><th>Risque</th><th>Observation</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.num_quittance}>
          <td data-label="N° Police">{row.num_int}</td><td data-label="TC">{termOf(row)}</td><td data-label="Échéance">{formatDate(row.echeance)}</td>
          <td data-label="Prime" className="eti-num">{money.format(amount(row.montant_quittance))}</td><td data-label="Solde" className="eti-num">{money.format(amount(row.solde))}</td>
          <td data-label="Risque">{row.risque}</td><td data-label="Observation">{row.observation}</td>
        </tr>)}</tbody>
        <tfoot><tr className="eti-subtotal"><td colSpan={4}>Total compagnie</td><td className="eti-num">{money.format(total(rows))}</td><td colSpan={2} /></tr></tfoot>
      </table></div>
    </section>)}
    <p className="eti-client-total">Total client <b>{money.format(total(client.rows))}</b></p>
  </article>;
}

const RELATIONS = { client: 'Client recherché', lien: 'Son lien', lie: 'Client lié' };

// "Envoyer par email" / "Envoyer par WhatsApp": the mémoire de règlement of the client shown, as a PDF (made by the server
// from the same criteria), with a message. The addresses offered are those of the client file; they can be changed.
const defaultMessage = (client, rows) => [
  `Bonjour ${(client.nom_client || '').trim()},`,
  '',
  `Veuillez trouver ci-joint votre mémoire de règlement au ${formatDate(today())} : ${rows.length} quittance${rows.length > 1 ? 's' : ''} impayée${rows.length > 1 ? 's' : ''}, total ${money.format(total(rows))} TND.`,
  '',
  'Cordialement,',
  ...AGENCY.filter((line, index) => index === 0 || /^(Tél|Cell)/.test(line)),
].join('\n');

function SendMemoireDialog({ channel, client, rows, criteria, onClose }) {
  const { accessToken } = useAuth();
  const email = channel === 'email';
  const [contacts, setContacts] = useState(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(`Mémoire de règlement – ${client.nom_client || client.code_client}`);
  const [message, setMessage] = useState(() => defaultMessage(client, rows));
  const [state, setState] = useState({ busy: false, error: '', done: null });
  useEffect(() => {
    let active = true;
    getMemoireContacts(accessToken, client.code_client)
      .then((body) => { if (!active) return; setContacts(body); setTo((email ? body.emails : body.telephones)[0] || ''); })
      .catch(() => { if (active) setContacts({ emails: [], telephones: [] }); });
    return () => { active = false; };
  }, [accessToken, client.code_client, email]);
  const options = contacts ? (email ? contacts.emails : contacts.telephones) : [];

  async function send(event) {
    event.preventDefault();
    setState({ busy: true, error: '', done: null });
    try {
      const result = await sendMemoire(accessToken, client.code_client, { canal: channel, destinataire: to.trim(), sujet: subject, message, ...criteria });
      // No WhatsApp API on the server: the PDF is downloaded, WhatsApp opens with the message (the file is attached there).
      if (!result.envoye) await downloadMemoirePdf(accessToken, client.code_client, criteria);
      setState({ busy: false, error: '', done: result });
    } catch (requestError) {
      setState({ busy: false, error: requestError.message, done: null });
    }
  }
  const preview = () => downloadMemoirePdf(accessToken, client.code_client, criteria).catch((requestError) => setState((value) => ({ ...value, error: requestError.message })));

  const done = state.done;
  return <div className="eti-send-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !state.busy) onClose(); }}>
    <form className="eti-send" role="dialog" aria-modal="true" aria-labelledby="eti-send-title" onSubmit={send}>
      <h3 id="eti-send-title">{email ? 'Envoyer par email' : 'Envoyer par WhatsApp'} · {client.code_client} {client.nom_client}</h3>
      {done ? <>
        {done.envoye
          ? <p className="eti-send-ok" role="status">Mémoire de règlement envoyé {email ? 'par email' : 'par WhatsApp'} à <b>{done.destinataire}</b>, avec le PDF « {done.fichier} ».</p>
          : <p className="eti-send-ok" role="status">Le PDF « {done.fichier} » a été téléchargé. Ouvrez WhatsApp : le message est déjà écrit pour le <b>+{done.destinataire}</b> ; joignez-y le fichier téléchargé puis envoyez.</p>}
        <footer>
          {!done.envoye && done.lien && <a className="expert-submit eti-send-link" href={done.lien} target="_blank" rel="noreferrer">Ouvrir WhatsApp</a>}
          <button type="button" className="expert-cancel" onClick={onClose}>Fermer</button>
        </footer>
      </> : <>
        <label className="eti-send-field"><span>{email ? 'Adresse email du client' : 'Numéro WhatsApp du client'}</span>
          <input type={email ? 'email' : 'tel'} value={to} onChange={(event) => setTo(event.target.value)} list="eti-send-options" required autoFocus placeholder={contacts ? (email ? 'nom@domaine.tn' : '22 123 456') : 'Chargement…'} />
          <datalist id="eti-send-options">{options.map((value) => <option key={value} value={value} />)}</datalist>
          {contacts && !options.length && <small>Aucun {email ? 'email' : 'numéro'} n’est enregistré sur la fiche du client : saisissez-le.</small>}
        </label>
        {email && <label className="eti-send-field"><span>Objet</span><input value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} required /></label>}
        <label className="eti-send-field"><span>Message</span><textarea rows={8} value={message} maxLength={email ? 4000 : 1000} onChange={(event) => setMessage(event.target.value)} /></label>
        <p className="eti-send-attachment">Pièce jointe : <b>Mémoire de règlement (PDF)</b> · {rows.length} quittance{rows.length > 1 ? 's' : ''} · {money.format(total(rows))} TND
          <button type="button" className="eti-send-preview" onClick={preview}>Voir le PDF</button></p>
        {state.error && <p className="expert-error" role="alert">{state.error}</p>}
        <footer>
          <button type="button" className="expert-cancel" onClick={onClose} disabled={state.busy}>Annuler</button>
          <button type="submit" className="expert-submit" disabled={state.busy || !to.trim()}>{state.busy ? 'Envoi…' : 'Envoyer'}</button>
        </footer>
      </>}
    </form>
  </div>;
}

function EtatImpayePreview({ items: allItems, limit, detail, sans, groups, dossiers, recovery, criteria, onBack, onClose }) {
  // A client searched by code: one dossier at a time (the client, then its liens), "◀ / ▶" to move between them.
  const [current, setCurrent] = useState(0);
  const dossier = dossiers ? dossiers[current] : null;
  const items = dossier ? dossier.items : allItems;
  const clients = useMemo(() => byClient(items), [items]);
  const grandTotal = useMemo(() => total(items), [items]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onBack();
      if (dossiers && event.key === 'ArrowRight') setCurrent((index) => Math.min(index + 1, dossiers.length - 1));
      if (dossiers && event.key === 'ArrowLeft') setCurrent((index) => Math.max(index - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, dossiers]);
  const pages = dossier ? 1 : detail ? clients.length : 1;
  // The mémoire of one client is shown: it can be sent to that client.
  const [sending, setSending] = useState(null); // 'email' | 'whatsapp'
  const single = (dossier || detail) && clients.length === 1 ? clients[0] : null;
  const heading = dossier || detail ? 'Mémoire de règlement' : 'Etat des impayées';

  return <div className="eti-preview" role="dialog" aria-modal="true" aria-label={heading}>
    <header className="eti-preview-bar">
      <button type="button" className="expert-cancel" onClick={onBack}>← Retour aux critères</button>
      <div className="eti-preview-title"><strong>{heading}</strong>
        <span>{groups ? `Mise en demeure · auto particuliers : ${groups[0].rows.length} (${money.format(total(groups[0].rows))} TND) · autres : ${groups[1].rows.length} (${money.format(total(groups[1].rows))} TND) · ` : ''}{sans ? 'Sans pièce' : 'Avec pièce'} · {items.length} quittance{items.length > 1 ? 's' : ''} · {clients.length} client{clients.length > 1 ? 's' : ''}{detail || dossier ? ` · ${pages} page${pages > 1 ? 's' : ''}` : ''} · total {money.format(grandTotal)} TND</span></div>
      <div className="eti-preview-actions">
        {single && <>
          <button type="button" className="expert-cancel eti-send-button" onClick={() => setSending('email')}>Envoyer par email</button>
          <button type="button" className="expert-cancel eti-send-button is-whatsapp" onClick={() => setSending('whatsapp')}>Envoyer par WhatsApp</button>
        </>}
        <button type="button" className="expert-submit" onClick={() => window.print()}>Imprimer</button>
        <button type="button" className="expert-close" onClick={onClose} aria-label="Fermer">×</button>
      </div>
    </header>
    {dossiers && <nav className="eti-dossiers" aria-label="Client et ses liens">
      <button type="button" className="expert-cancel" onClick={() => setCurrent(current - 1)} disabled={current === 0} aria-label="Dossier précédent">◀</button>
      <div className="eti-dossier-tabs">{dossiers.map((item, index) => (
        <button key={item.code_client} type="button" className={index === current ? 'is-current' : ''} onClick={() => setCurrent(index)} aria-current={index === current ? 'page' : undefined}>
          <small>{RELATIONS[item.relation]}</small><b>{item.code_client}</b> {item.nom_client}<em>{money.format(total(item.items))}</em>
        </button>
      ))}</div>
      <button type="button" className="expert-cancel" onClick={() => setCurrent(current + 1)} disabled={current === dossiers.length - 1} aria-label="Dossier suivant">▶</button>
    </nav>}
    {sending && single && <SendMemoireDialog key={`${sending}-${single.code_client}`} channel={sending} client={single} rows={single.rows} criteria={criteria} onClose={() => setSending(null)} />}
    {dossiers && dossiers.length === 1 && <p className="eti-limit eti-preview-limit">Aucun lien de ce client n’a de quittance impayée.</p>}
    {limit > 0 && items.length >= limit && <p className="eti-limit eti-preview-limit">Résultats limités à {limit} quittances : précisez les critères.</p>}
    <div className="eti-report">
      {dossier ? (items.length ? clients.map((client) => <MemoirePage key={client.code_client} client={client} />)
        : <article className="eti-page">{letterhead('MÉMOIRE DE RÈGLEMENT')}<p className="eti-empty">Aucune quittance impayée pour le client {dossier.code_client} {dossier.nom_client} : voyez ses liens.</p></article>)
        : groups ? groups.map((group, index) => <StatementPage key={group.title} title={group.title} rows={group.rows} sans={sans}
          summary={index === 0 ? [['Total automobile particuliers', total(groups[0].rows)], ['Total autres', total(groups[1].rows)], ['Total général', grandTotal]] : undefined}
          recovery={index === 0 ? recovery : undefined} />)
          : !detail ? <StatementPage title="ETAT DES IMPAYÉES" rows={items} sans={sans} recovery={recovery} />
            : clients.map((client) => <MemoirePage key={client.code_client} client={client} />)}
    </div>
  </div>;
}
