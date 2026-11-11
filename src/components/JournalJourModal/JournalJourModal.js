import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  createRequest, deleteRequest, getEmployeeHistory, getMyJournal, getMyRequests, getRequestTargets, getTeamDay, handleRequest, listRequests,
  markJournalSeen, reopenJournal, saveJournalParams, saveMyJournal, validateMyJournal,
} from '../../services/journalJourApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import './JournalJourModal.css';

export const STATES = [['fait', 'Fait'], ['en_cours', 'En cours'], ['a_faire', 'À faire']];
const stateLabel = (key) => (STATES.find(([value]) => value === key) || [])[1] || key;
export const localDay = (date = new Date()) => date.toLocaleDateString('sv-SE'); // YYYY-MM-DD in the agency's time
const frDay = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '');
const frTime = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)} à ${iso.slice(11, 16)}` : '');
const shiftDay = (iso, days) => { const date = new Date(`${iso}T12:00:00`); date.setDate(date.getDate() + days); return localDay(date); };
const blankTask = () => ({ texte: '', statut: 'fait' });
// How a client request came in.
export const CHANNELS = [['telephone', 'Téléphone'], ['email', 'Email'], ['whatsapp', 'WhatsApp']];
const channelsText = (canaux) => CHANNELS.filter(([value]) => (canaux || []).includes(value)).map(([, label]) => label).join(', ');
const blankRequest = () => ({ canaux: [], demande: '', observation: '' });
const written = (item) => item.demande.trim() || item.observation.trim();
const toggleIn = (list, value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

// "Reçue par": téléphone, email, WhatsApp (checkboxes).
function ChannelBoxes({ value, onChange, label = 'Reçue par' }) {
  return <fieldset className="jdj-channels"><legend>{label}</legend>
    {CHANNELS.map(([key, text]) => <label key={key}><input type="checkbox" checked={value.includes(key)} onChange={() => onChange(toggleIn(value, key))} /> {text}</label>)}
  </fieldset>;
}

// The client requests noted in a day (read only).
function RequestList({ demandes }) {
  if (!demandes?.length) return null;
  return <ul className="jdj-read-requests">{demandes.map((item, index) => <li key={index}>
    <strong>{item.demande}</strong>{item.canaux?.length > 0 && <span className="jdj-via">{channelsText(item.canaux)}</span>}
    {item.observation && <p>{item.observation}</p>}
  </li>)}</ul>;
}

// The requests the administrator assigned to me: marked "traitée" with a reply.
function AssignedRequests() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState(null);
  const [replies, setReplies] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getMyRequests(accessToken).then((body) => { if (active) setItems(body.items || []); }).catch((requestError) => { if (active) { setItems([]); setError(requestError.message); } });
    return () => { active = false; };
  }, [accessToken]);
  async function done(item) {
    setError('');
    try {
      const body = await handleRequest(accessToken, item.id, replies[item.id] || '');
      setItems(body.items || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  if (!items?.length && !error) return null;
  const open = (items || []).filter((item) => item.statut !== 'traitee').length;
  return <section className="jdj-card jdj-assigned" aria-label="Demandes qui me sont affectées">
    <h3>Demandes qui me sont affectées {open > 0 && <span className="jdj-count">{open} à traiter</span>}</h3>
    {error && <p className="jdj-warn" role="alert">{error}</p>}
    <ul>{(items || []).map((item) => <li key={item.id} className={item.statut === 'traitee' ? 'is-done' : ''}>
      <div className="jdj-assigned-head">
        <strong>{item.demande}</strong>
        {item.client && <span className="jdj-via">Client : {item.client}</span>}
        {item.canaux?.length > 0 && <span className="jdj-via">{channelsText(item.canaux)}</span>}
        <small>de {item.cree_par} · {frTime(item.date_creation)}</small>
      </div>
      {item.observation && <p className="jdj-text">{item.observation}</p>}
      {item.statut === 'traitee'
        ? <p className="jdj-sent">Traitée le {frTime(item.date_traitement)}{item.reponse ? ` : ${item.reponse}` : ''}</p>
        : <div className="jdj-assigned-reply">
          <input value={replies[item.id] || ''} maxLength={1500} placeholder="Réponse, suite donnée (facultatif)" aria-label={`Réponse à la demande ${item.id}`}
            onChange={(event) => setReplies({ ...replies, [item.id]: event.target.value })} />
          <button type="button" className="jdj-btn" onClick={() => done(item)}>Marquer traitée</button>
        </div>}
    </li>)}</ul>
  </section>;
}

function Activity({ activite, onPick }) {
  if (!activite) return null;
  return <div className="jdj-activity">
    <h4>Dans le logiciel ce jour <b>{activite.total}</b> action{activite.total > 1 ? 's' : ''}</h4>
    {activite.par_type.length > 0 && <p>{activite.par_type.map((item) => `${item.nombre} ${item.libelle}`).join(' · ')}</p>}
    {onPick && activite.dernieres.length > 0 && <ul>
      {activite.dernieres.map((item, index) => <li key={`${item.design}-${index}`}>
        <span><small>{item.heure}</small> {item.design}</span>
        <button type="button" onClick={() => onPick(item.design)} title="Ajouter cette action à mes tâches">+ Tâche</button>
      </li>)}
    </ul>}
  </div>;
}

function TaskList({ taches }) {
  if (!taches.length) return <p className="jdj-muted">Aucune tâche saisie.</p>;
  return <ul className="jdj-read-tasks">{taches.map((task, index) => <li key={index}><span className={`jdj-state is-${task.statut}`}>{stateLabel(task.statut)}</span>{task.texte}</li>)}</ul>;
}

// The email to the administrator, sent by the server when the day is submitted.
function EmailStatus({ email, journal }) {
  if (email?.envoye || journal.envoi_email === 'envoye') return <p className="jdj-sent">Rapport envoyé par email à l’administrateur{email?.destinataire ? ` (${email.destinataire})` : ''}.</p>;
  if (email?.erreur) return <p className="jdj-warn">{email.erreur}</p>;
  return null;
}

function WhatsappStatus({ whatsapp, journal }) {
  if (journal.envoi === 'api' || whatsapp?.envoye) return <p className="jdj-sent">Rapport envoyé sur le WhatsApp de l’administrateur.</p>;
  if (!whatsapp?.numero) return <p className="jdj-warn">Le numéro WhatsApp de l’administrateur n’est pas encore défini : le journal est enregistré, l’administrateur le voit dans ce module.</p>;
  return <div className="jdj-send">
    {whatsapp.erreur && <p className="jdj-warn">{whatsapp.erreur}</p>}
    <a className="jdj-wa" href={whatsapp.lien} target="_blank" rel="noreferrer">Envoyer le rapport sur WhatsApp</a>
    <small>WhatsApp s’ouvre avec le rapport déjà écrit : appuyez sur « Envoyer ».</small>
  </div>;
}

// ---- The employee: my day ----
function MyDay() {
  const { accessToken } = useAuth();
  const [day, setDay] = useState(localDay());
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ taches: [blankTask()], demandes: [blankRequest()], remarques: '', demain: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError(''); setNotice('');
    try {
      const result = await getMyJournal(accessToken, day);
      setData(result);
      const { journal } = result;
      setDraft({ taches: journal.taches.length ? journal.taches : [blankTask()], demandes: journal.demandes?.length ? journal.demandes : [blankRequest()], remarques: journal.remarques, demain: journal.demain });
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [accessToken, day]);
  useEffect(() => { setData(null); load(); }, [load]);

  const locked = data?.journal.statut === 'valide';
  const setTask = (index, patch) => setDraft((current) => ({ ...current, taches: current.taches.map((task, at) => (at === index ? { ...task, ...patch } : task)) }));
  // A new empty line (once the last one is written), or a task taken from the activity in place of the empty lines.
  const addTask = (texte = '', statut = 'fait') => setDraft((current) => {
    const written = current.taches.filter((task) => task.texte.trim());
    if (texte) return { ...current, taches: [...written, { texte, statut }] };
    return written.length === current.taches.length ? { ...current, taches: [...current.taches, blankTask()] } : current;
  });
  const removeTask = (index) => setDraft((current) => ({ ...current, taches: current.taches.length > 1 ? current.taches.filter((_, at) => at !== index) : [blankTask()] }));
  const setRequest = (index, patch) => setDraft((current) => ({ ...current, demandes: current.demandes.map((item, at) => (at === index ? { ...item, ...patch } : item)) }));
  const addRequest = () => setDraft((current) => ({ ...current, demandes: [...current.demandes, blankRequest()] }));
  const removeRequest = (index) => setDraft((current) => ({ ...current, demandes: current.demandes.length > 1 ? current.demandes.filter((_, at) => at !== index) : [blankRequest()] }));
  const body = () => ({
    date_jour: day,
    taches: draft.taches.filter((task) => task.texte.trim()).map((task) => ({ texte: task.texte.trim().slice(0, 300), statut: task.statut })),
    demandes: draft.demandes.filter(written).map((item) => ({ canaux: item.canaux, demande: item.demande.trim(), observation: item.observation.trim() })),
    remarques: draft.remarques, demain: draft.demain,
  });

  async function submit(validate) {
    const current = body();
    if (current.demandes.some((item) => !item.demande)) { setError('Écrivez la demande du client (l’observation seule ne suffit pas).'); return; }
    if (validate && !current.taches.length && !current.demandes.length) { setError('Ajoutez au moins une tâche ou une demande client avant de soumettre la journée.'); return; }
    if (validate && !window.confirm('Soumettre la journée ? Le journal ne pourra plus être modifié et le rapport est envoyé à l’administrateur (email).')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await (validate ? validateMyJournal : saveMyJournal)(accessToken, current);
      setData(result);
      setNotice(validate ? 'Journée soumise à l’administrateur.' : 'Brouillon enregistré.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="jdj-day">
    <div className="jdj-dayline">
      <label className="jdj-date"><span>Journée du</span><input type="date" value={day} max={localDay()} onChange={(event) => event.target.value && setDay(event.target.value)} /></label>
      <strong className="jdj-dayname">{frDay(day)}</strong>
      {data && <span className={`jdj-badge is-${data.journal.statut}`}>{locked ? `Soumis le ${frTime(data.journal.date_validation)}` : data.journal.statut === 'brouillon' ? 'Brouillon' : 'Non saisi'}</span>}
    </div>
    {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
    {notice && <p className="jdj-notice" role="status">{notice}</p>}
    {!data ? <p className="jdj-muted">Chargement…</p> : <div className="jdj-columns">
      <div className="jdj-main">
        <AssignedRequests />
        {locked ? <>
          <section className="jdj-card"><h3>Mes tâches</h3><TaskList taches={data.journal.taches} /></section>
          {data.journal.demandes?.length > 0 && <section className="jdj-card"><h3>Demandes clients</h3><RequestList demandes={data.journal.demandes} /></section>}
          {data.journal.remarques && <section className="jdj-card"><h3>Remarques</h3><p className="jdj-text">{data.journal.remarques}</p></section>}
          {data.journal.demain && <section className="jdj-card"><h3>Prévu ensuite</h3><p className="jdj-text">{data.journal.demain}</p></section>}
          <section className="jdj-card"><h3>Rapport envoyé à l’administrateur</h3><pre className="jdj-report">{data.rapport}</pre><EmailStatus email={data.email} journal={data.journal} /><WhatsappStatus whatsapp={data.whatsapp} journal={data.journal} /></section>
        </> : <>
          <section className="jdj-card">
            <h3>Mes tâches du jour</h3>
            <ol className="jdj-tasks">
              {draft.taches.map((task, index) => <li key={index}>
                <input
                  value={task.texte} maxLength={300} placeholder="Ce que j’ai fait (ex : saisie des quittances GAT, relance du client 4914…)" aria-label={`Tâche ${index + 1}`}
                  onChange={(event) => setTask(index, { texte: event.target.value })}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (task.texte.trim()) addTask(); } }}
                />
                <div className="jdj-states" role="group" aria-label={`État de la tâche ${index + 1}`}>
                  {STATES.map(([value, label]) => <button type="button" key={value} className={`is-${value}${task.statut === value ? ' is-on' : ''}`} aria-pressed={task.statut === value} onClick={() => setTask(index, { statut: value })}>{label}</button>)}
                </div>
                <button type="button" className="jdj-remove" onClick={() => removeTask(index)} aria-label={`Retirer la tâche ${index + 1}`}>×</button>
              </li>)}
            </ol>
            <button type="button" className="jdj-add" onClick={() => addTask()}>+ Ajouter une tâche</button>
          </section>
          <section className="jdj-card" aria-label="Demandes clients">
            <h3>Demandes clients</h3>
            <div className="jdj-requests">
              {draft.demandes.map((item, index) => <div className="jdj-request" key={index}>
                <div className="jdj-request-top">
                  <ChannelBoxes value={item.canaux} onChange={(canaux) => setRequest(index, { canaux })} />
                  <button type="button" className="jdj-remove" onClick={() => removeRequest(index)} aria-label={`Retirer la demande ${index + 1}`}>×</button>
                </div>
                <label className="jdj-field"><span>Demande du client</span>
                  <input value={item.demande} maxLength={500} onChange={(event) => setRequest(index, { demande: event.target.value })} placeholder="Ex : attestation d’assurance, changement d’adresse, devis…" />
                </label>
                <label className="jdj-field"><span>Observation</span>
                  <textarea rows={2} maxLength={1500} value={item.observation} onChange={(event) => setRequest(index, { observation: event.target.value })} placeholder="Suite donnée, à rappeler, information pour l’administrateur…" />
                </label>
              </div>)}
            </div>
            <button type="button" className="jdj-add" onClick={addRequest}>+ Ajouter une demande</button>
          </section>
          <section className="jdj-card jdj-notes">
            <label><span>Remarques, difficultés</span><textarea rows={3} maxLength={1500} value={draft.remarques} onChange={(event) => setDraft({ ...draft, remarques: event.target.value })} placeholder="Problème rencontré, client à rappeler, information pour l’administrateur…" /></label>
            <label><span>Prévu ensuite</span><textarea rows={2} maxLength={1000} value={draft.demain} onChange={(event) => setDraft({ ...draft, demain: event.target.value })} placeholder="Ce qui reste à faire demain" /></label>
          </section>
        </>}
      </div>
      <aside className="jdj-side"><Activity activite={data.activite} onPick={locked ? null : (design) => addTask(design, 'fait')} /></aside>
    </div>}
    {data && !locked && <footer className="jdj-actions">
      <button type="button" className="jdj-btn" disabled={busy} onClick={() => submit(false)}>Enregistrer le brouillon</button>
      <button type="button" className="jdj-validate" disabled={busy} onClick={() => submit(true)}>{busy ? 'Soumission…' : 'Soumettre'}</button>
    </footer>}
  </div>;
}

// ---- The administrator: every employee's day ----
function TeamDay() {
  const { accessToken } = useAuth();
  const [day, setDay] = useState(localDay());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [numero, setNumero] = useState(null);
  const [email, setEmail] = useState(null);
  const [history, setHistory] = useState(null); // { utilisateur, items }

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await getTeamDay(accessToken, day);
      setData(result);
      setNumero((current) => current ?? result.whatsapp.numero);
      setEmail((current) => current ?? result.email?.adresse ?? '');
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [accessToken, day]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function act(action, item) {
    try {
      if (action === 'vu') await markJournalSeen(accessToken, item.utilisateur, item.date_jour);
      if (action === 'rouvrir' && window.confirm(`Rouvrir le journal de ${item.utilisateur} ? Il pourra le corriger puis le soumettre à nouveau.`)) await reopenJournal(accessToken, item.utilisateur, item.date_jour);
      if (action === 'historique') setHistory(await getEmployeeHistory(accessToken, item.utilisateur));
      if (action !== 'historique') await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function saveNumber(event) {
    event.preventDefault();
    try {
      await saveJournalParams(accessToken, { whatsapp_admin: numero || '', email_admin: email || '' });
      await load();
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const counts = data?.compteurs || {};
  return <div className="jdj-team">
    <div className="jdj-dayline">
      <button type="button" className="jdj-nav" onClick={() => setDay(shiftDay(day, -1))} aria-label="Jour précédent">‹</button>
      <label className="jdj-date"><span>Journée du</span><input type="date" value={day} max={localDay()} onChange={(event) => event.target.value && setDay(event.target.value)} /></label>
      <button type="button" className="jdj-nav" disabled={day >= localDay()} onClick={() => setDay(shiftDay(day, 1))} aria-label="Jour suivant">›</button>
      <strong className="jdj-dayname">{frDay(day)}</strong>
    </div>
    <div className="jdj-counters">
      <span className="is-valide"><b>{counts.valide ?? '…'}</b> soumis</span>
      <span className="is-brouillon"><b>{counts.brouillon ?? '…'}</b> en brouillon</span>
      <span className="is-vide"><b>{counts.vide ?? '…'}</b> non saisi{counts.vide > 1 ? 's' : ''}</span>
      <form className="jdj-number" onSubmit={saveNumber}>
        <label><span>Email des rapports</span><input type="email" value={email ?? ''} onChange={(event) => setEmail(event.target.value)} placeholder="adresse@exemple.com" /></label>
        <label><span>WhatsApp de l’administrateur</span><input value={numero ?? ''} onChange={(event) => setNumero(event.target.value)} placeholder="Ex : 98 123 456" inputMode="tel" /></label>
        <button type="submit" className="jdj-btn">Enregistrer</button>
      </form>
    </div>
    {data?.email && !data.email.configure && <p className="jdj-warn">L’envoi des emails n’est pas encore configuré sur le serveur (SMTP_HOST, SMTP_USER, SMTP_PASSWORD, ou BREVO_API_KEY) : les journaux soumis restent visibles ici.</p>}
    {data && !data.whatsapp.api && <p className="jdj-muted jdj-hint">Les employés envoient le rapport depuis leur WhatsApp en un clic (le message est déjà écrit). Pour un envoi automatique par le serveur, configurer l’API WhatsApp Business (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).</p>}
    {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
    <div className="jdj-people">
      {!data ? <p className="jdj-muted">Chargement…</p> : data.items.length === 0 ? <p className="jdj-muted">Aucun employé.</p> : data.items.map((item) => <article key={item.utilisateur} className={`jdj-person is-${item.statut}`}>
        <header>
          <strong>{item.utilisateur}</strong>
          <span className={`jdj-badge is-${item.statut}`}>{item.statut === 'valide' ? `Soumis le ${frTime(item.date_validation)}` : item.statut === 'brouillon' ? 'Brouillon (non soumis)' : 'Non saisi'}</span>
          {item.envoi_email === 'envoye' && <span className="jdj-tag">Email envoyé</span>}
          {item.envoi === 'api' && <span className="jdj-tag">WhatsApp envoyé</span>}
          {item.vu_admin && <span className="jdj-tag is-seen">Vu</span>}
          <span className="jdj-spacer" />
          {item.statut === 'valide' && !item.vu_admin && <button type="button" className="jdj-btn" onClick={() => act('vu', item)}>Marquer vu</button>}
          {item.statut === 'valide' && <button type="button" className="jdj-btn" onClick={() => act('rouvrir', item)}>Rouvrir</button>}
          <button type="button" className="jdj-btn" onClick={() => act('historique', item)}>Historique</button>
        </header>
        <div className="jdj-person-body">
          <div>
            {item.statut === 'vide' ? <p className="jdj-muted">Aucun journal pour ce jour.</p> : <TaskList taches={item.taches} />}
            {item.demandes?.length > 0 && <><h5 className="jdj-subtitle">Demandes clients</h5><RequestList demandes={item.demandes} /></>}
            {item.remarques && <p className="jdj-text"><b>Remarques :</b> {item.remarques}</p>}
            {item.demain && <p className="jdj-text"><b>Prévu ensuite :</b> {item.demain}</p>}
          </div>
          <Activity activite={item.activite} />
        </div>
      </article>)}
    </div>
    {history && <div className="jdj-history-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistory(null); }}>
      <section className="jdj-history" role="dialog" aria-label={`Historique de ${history.utilisateur}`}>
        <header><h3>{history.utilisateur} · 14 derniers jours</h3><button type="button" className="expert-close" onClick={() => setHistory(null)} aria-label="Fermer">×</button></header>
        {history.items.length === 0 ? <p className="jdj-muted">Aucun journal sur cette période.</p> : history.items.map((item) => <div key={item.date_jour} className="jdj-history-day">
          <h4>{frDay(item.date_jour)} <span className={`jdj-badge is-${item.statut}`}>{item.statut === 'valide' ? 'Soumis' : 'Brouillon'}</span></h4>
          <TaskList taches={item.taches} />
          <RequestList demandes={item.demandes} />
          {item.remarques && <p className="jdj-text"><b>Remarques :</b> {item.remarques}</p>}
        </div>)}
      </section>
    </div>}
  </div>;
}

const blankAssignment = () => ({ client: '', canaux: [], demande: '', observation: '', cible_type: 'utilisateur', utilisateurs: [], agence: '' });

// ---- The administrator: a client request assigned to users, or to every user of an agency ----
function ClientRequests() {
  const { accessToken } = useAuth();
  const [targets, setTargets] = useState(null);
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(blankAssignment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [who, list] = await Promise.all([getRequestTargets(accessToken), listRequests(accessToken)]);
      setTargets(who);
      setItems(list.items || []);
    } catch (requestError) {
      setError(requestError.message);
      setItems((current) => current || []);
    }
  }, [accessToken]);
  useEffect(() => { load(); }, [load]);

  const agency = targets?.agences.find((item) => item.agence === form.agence);
  const recipients = form.cible_type === 'agence' ? agency?.utilisateurs || [] : form.utilisateurs;
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event) {
    event.preventDefault();
    setError(''); setNotice('');
    if (!form.demande.trim()) { setError('Écrivez la demande du client.'); return; }
    if (form.cible_type === 'agence' && !form.agence) { setError('Choisissez l’agence.'); return; }
    if (!recipients.length) { setError(form.cible_type === 'agence' ? 'Aucun utilisateur dans cette agence.' : 'Choisissez au moins un utilisateur.'); return; }
    setBusy(true);
    try {
      const created = await createRequest(accessToken, { ...form, client: form.client.trim(), demande: form.demande.trim(), observation: form.observation.trim() });
      setItems((current) => [created, ...(current || [])]);
      setForm(blankAssignment());
      setNotice(`Demande affectée à : ${created.affectations.map((item) => item.utilisateur).join(', ')}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Supprimer la demande « ${item.demande} » ? Elle disparaît aussi des journaux des employés.`)) return;
    try {
      await deleteRequest(accessToken, item.id);
      setItems((current) => current.filter((other) => other.id !== item.id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return <div className="jdj-requests-admin">
    <form className="jdj-card jdj-assign" onSubmit={submit} aria-label="Nouvelle demande client">
      <h3>Nouvelle demande client</h3>
      <div className="jdj-assign-grid">
        <label className="jdj-field"><span>Client</span><input value={form.client} maxLength={150} onChange={(event) => set({ client: event.target.value })} placeholder="Nom ou code du client" /></label>
        <ChannelBoxes value={form.canaux} onChange={(canaux) => set({ canaux })} />
      </div>
      <label className="jdj-field"><span>Demande du client</span><input value={form.demande} maxLength={1000} onChange={(event) => set({ demande: event.target.value })} placeholder="Ex : attestation d’assurance, changement d’adresse, devis…" /></label>
      <label className="jdj-field"><span>Observation</span><textarea rows={2} maxLength={1500} value={form.observation} onChange={(event) => set({ observation: event.target.value })} placeholder="Précisions pour l’employé" /></label>
      <fieldset className="jdj-target"><legend>Affecter</legend>
        <label><input type="radio" name="jdj-cible" checked={form.cible_type === 'utilisateur'} onChange={() => set({ cible_type: 'utilisateur' })} /> Par utilisateur</label>
        <label><input type="radio" name="jdj-cible" checked={form.cible_type === 'agence'} onChange={() => set({ cible_type: 'agence' })} /> Par agence</label>
      </fieldset>
      {!targets ? <p className="jdj-muted">Chargement des utilisateurs…</p> : form.cible_type === 'utilisateur'
        ? <div className="jdj-users" role="group" aria-label="Utilisateurs">
          {targets.utilisateurs.map((item) => <label key={item.nom}><input type="checkbox" checked={form.utilisateurs.includes(item.nom)} onChange={() => set({ utilisateurs: toggleIn(form.utilisateurs, item.nom) })} /> {item.nom}{item.agence && <small>{item.agence}</small>}</label>)}
        </div>
        : <label className="jdj-field jdj-agency"><span>Agence</span>
          <select value={form.agence} onChange={(event) => set({ agence: event.target.value })}>
            <option value="">Choisir l’agence…</option>
            {targets.agences.map((item) => <option key={item.agence} value={item.agence}>{item.agence} ({item.utilisateurs.length} employé{item.utilisateurs.length > 1 ? 's' : ''})</option>)}
          </select>
        </label>}
      {recipients.length > 0 && <p className="jdj-muted">Sera affectée à : <b>{recipients.join(', ')}</b></p>}
      {error && <p className="jdj-warn" role="alert">{error}</p>}
      {notice && <p className="jdj-notice" role="status">{notice}</p>}
      <div className="jdj-actions"><button type="submit" className="jdj-validate" disabled={busy}>{busy ? 'Affectation…' : 'Affecter la demande'}</button></div>
    </form>
    <section className="jdj-card">
      <h3>Demandes affectées (30 derniers jours)</h3>
      {!items ? <p className="jdj-muted">Chargement…</p> : items.length === 0 ? <p className="jdj-muted">Aucune demande.</p> : <ul className="jdj-request-log">{items.map((item) => <li key={item.id}>
        <div className="jdj-assigned-head">
          <strong>{item.demande}</strong>
          {item.client && <span className="jdj-via">Client : {item.client}</span>}
          {item.canaux.length > 0 && <span className="jdj-via">{channelsText(item.canaux)}</span>}
          <small>{item.cible_type === 'agence' ? `Agence ${item.cible}` : 'Par utilisateur'} · {frTime(item.date_creation)}</small>
          <button type="button" className="jdj-remove" onClick={() => remove(item)} aria-label={`Supprimer la demande ${item.id}`}>×</button>
        </div>
        {item.observation && <p className="jdj-text">{item.observation}</p>}
        <div className="jdj-assignees">{item.affectations.map((who) => <span key={who.utilisateur} className={`jdj-state is-${who.statut === 'traitee' ? 'fait' : 'a_faire'}`}
          title={who.statut === 'traitee' ? `Traitée le ${frTime(who.date_traitement)}${who.reponse ? ` : ${who.reponse}` : ''}` : 'À traiter'}>
          {who.utilisateur} · {who.statut === 'traitee' ? 'traitée' : 'à traiter'}</span>)}</div>
        {item.affectations.filter((who) => who.reponse).map((who) => <p key={who.utilisateur} className="jdj-text"><b>{who.utilisateur} :</b> {who.reponse}</p>)}
      </li>)}</ul>}
    </section>
  </div>;
}

function AdminView() {
  const [tab, setTab] = useState('journaux');
  return <>
    <div className="jdj-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'journaux'} className={tab === 'journaux' ? 'is-on' : ''} onClick={() => setTab('journaux')}>Journaux des employés</button>
      <button type="button" role="tab" aria-selected={tab === 'demandes'} className={tab === 'demandes' ? 'is-on' : ''} onClick={() => setTab('demandes')}>Demandes clients</button>
    </div>
    {tab === 'journaux' ? <TeamDay /> : <ClientRequests />}
  </>;
}

// Module "Journal du jour": every employee writes their day; the administrator follows the team.
export default function JournalJourModal({ moduleId, onClose }) {
  const { user } = useAuth();
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal jdj-modal" role="dialog" aria-modal="true" aria-labelledby="jdj-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId}{user.isAdmin ? ' · ADMINISTRATEUR' : ''}</span><h2 id="jdj-title">{user.isAdmin ? 'Journal des employés' : 'Mon journal du jour'}</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content jdj-content">{user.isAdmin ? <AdminView /> : <MyDay />}</div>
    </section>
  </div>;
}
