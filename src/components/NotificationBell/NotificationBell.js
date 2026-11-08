import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useClient } from '../../contexts/ClientContext';
import { navigate } from '../../navigation';
import { getClientByCode } from '../../services/clientApi';
import { listIncompleteClients, listNotifications, markNotificationsRead } from '../../services/notificationApi';
import HistoryDetailDialog from '../HistoriqueModal/HistoryDetailDialog';
import './NotificationBell.css';

const REFRESH_MS = 30000;

function when(item) {
  if (!item.date) return item.heure || '';
  const [year, month, day] = item.date.split('-');
  const sameDay = item.date === new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Tunis' });
  return `${sameDay ? "Aujourd'hui" : `${day}/${month}/${year}`}${item.heure ? ` · ${item.heure}` : ''}`;
}

// The bell of the workspace: the administrator follows every user's actions, a user follows their own.
export default function NotificationBell({ onOpenHistory }) {
  const { user, accessToken } = useAuth();
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null); // the administrator opens what exactly an action did
  const { setClient } = useClient();
  const [incomplete, setIncomplete] = useState(null); // administrator: the clients with missing information
  const [showIncomplete, setShowIncomplete] = useState(false);
  const rootRef = useRef(null);

  const load = useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return listNotifications(accessToken, user.isAdmin ? 100 : 30).then((body) => { setData(body); setError(''); }).catch((loadError) => setError(loadError.message));
  }, [accessToken, user.isAdmin]);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  // Read once per opening of the workspace and at each opening of the panel: it does not change every 30 seconds.
  const loadIncomplete = useCallback(() => {
    if (!user.isAdmin || !accessToken) return;
    listIncompleteClients(accessToken).then(setIncomplete).catch(() => setIncomplete(null));
  }, [accessToken, user.isAdmin]);
  useEffect(() => { loadIncomplete(); }, [loadIncomplete]);

  async function openClient(code) {
    try {
      const record = await getClientByCode(accessToken, code);
      setOpen(false);
      setClient({ ...record, _persisted: true });
      navigate('/clients');
    } catch (openError) {
      setError(openError.message);
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    loadIncomplete();
    // The list keeps the "new" marks while it is open; the counter is cleared on the server and in the badge.
    load().then(() => {
      setData((current) => ({ ...current, unread: 0 }));
      markNotificationsRead(accessToken).catch(() => {});
    });
  }

  const { unread, items } = data;
  return (
    <div className="notif" ref={rootRef}>
      <button type="button" className={`notif-bell ${unread ? 'has-unread' : ''}`} onClick={toggle} aria-haspopup="true" aria-expanded={open}
        aria-label={unread ? `Notifications : ${unread} nouvelle${unread > 1 ? 's' : ''}` : 'Notifications'} title="Notifications">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="notif-count">{unread > 99 ? '99+' : unread}</span>}
        {!unread && incomplete?.total > 0 && <span className="notif-alert-dot" title="Clients à compléter" />}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            <small>{user.isAdmin ? 'Actions de tous les utilisateurs' : 'Vos actions'}</small>
          </div>
          {incomplete?.total > 0 && <div className="notif-incomplete">
            <button type="button" className="notif-incomplete-head" aria-expanded={showIncomplete} onClick={() => setShowIncomplete((value) => !value)}>
              <span><strong>{incomplete.total} client{incomplete.total > 1 ? 's' : ''} à compléter</strong>
                <small>Coordonnées manquantes : {incomplete.coordonnees} · Sans police : {incomplete.sans_police} · Police incomplète : {incomplete.polices}{incomplete.quittances != null && ` · Quittance incomplète : ${incomplete.quittances} · Sinistre incomplet : ${incomplete.sinistres}`}</small></span>
              <b aria-hidden="true">{showIncomplete ? '▴' : '▾'}</b>
            </button>
            {showIncomplete && <ul>
              {incomplete.items.map((item) => <li key={item.code_client}><button type="button" title="Ouvrir la fiche du client" onClick={() => openClient(item.code_client)}>
                <strong>{item.code_client} · {item.nom_client || 'Client sans nom'}</strong><small>Manque : {item.manques.join(' · ')}</small>
              </button></li>)}
              {incomplete.total > incomplete.items.length && <li className="notif-incomplete-more">Les {incomplete.items.length} clients les plus récents sont affichés.</li>}
            </ul>}
          </div>}
          <div className="notif-list">
            {error && <p className="notif-empty">{error}</p>}
            {!error && !items.length && <p className="notif-empty">Aucune action enregistrée pour le moment.</p>}
            {items.map((item) => (
              <div className={`notif-item ${item.unread ? 'is-new' : ''}${user.isAdmin ? ' is-clickable' : ''}`} key={item.n}
                {...(user.isAdmin ? { role: 'button', tabIndex: 0, title: 'Voir le détail de l’action', onClick: () => { setOpen(false); setDetail(item.n); }, onKeyDown: (event) => { if (event.key === 'Enter') { setOpen(false); setDetail(item.n); } } } : {})}>
                <span className={`notif-move notif-move-${item.code ?? 0}`}>{item.mvt === 'Suppresion' ? 'Suppression' : item.mvt}</span>
                <div className="notif-copy">
                  <p>{item.design || item.mvt}</p>
                  <small>{user.isAdmin && <b>{item.utilisateur}</b>}{user.isAdmin && ' · '}{when(item)}</small>
                </div>
              </div>
            ))}
          </div>
          {user.isAdmin && onOpenHistory && (
            <button type="button" className="notif-all" onClick={() => { setOpen(false); onOpenHistory(); }}>Voir tout l'historique</button>
          )}
        </div>
      )}
      {detail && <HistoryDetailDialog n={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
