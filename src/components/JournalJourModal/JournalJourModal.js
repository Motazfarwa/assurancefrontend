import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  getEmployeeHistory, getMyJournal, getTeamDay, markJournalSeen, reopenJournal, saveJournalParams, saveMyJournal, validateMyJournal,
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
  const [draft, setDraft] = useState({ taches: [blankTask()], remarques: '', demain: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError(''); setNotice('');
    try {
      const result = await getMyJournal(accessToken, day);
      setData(result);
      const { journal } = result;
      setDraft({ taches: journal.taches.length ? journal.taches : [blankTask()], remarques: journal.remarques, demain: journal.demain });
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
  const body = () => ({ date_jour: day, taches: draft.taches.filter((task) => task.texte.trim()).map((task) => ({ texte: task.texte.trim().slice(0, 300), statut: task.statut })), remarques: draft.remarques, demain: draft.demain });

  async function submit(validate) {
    if (validate && !body().taches.length) { setError('Ajoutez au moins une tâche avant de soumettre la journée.'); return; }
    if (validate && !window.confirm('Soumettre la journée ? Le journal ne pourra plus être modifié et le rapport est envoyé à l’administrateur (email).')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await (validate ? validateMyJournal : saveMyJournal)(accessToken, body());
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
        {locked ? <>
          <section className="jdj-card"><h3>Mes tâches</h3><TaskList taches={data.journal.taches} /></section>
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
          {item.remarques && <p className="jdj-text"><b>Remarques :</b> {item.remarques}</p>}
        </div>)}
      </section>
    </div>}
  </div>;
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
      <div className="unpaid-content jdj-content">{user.isAdmin ? <TeamDay /> : <MyDay />}</div>
    </section>
  </div>;
}
