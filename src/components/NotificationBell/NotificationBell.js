import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listNotifications, markNotificationsRead } from '../../services/notificationApi';
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
  const rootRef = useRef(null);

  const load = useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return listNotifications(accessToken).then((body) => { setData(body); setError(''); }).catch((loadError) => setError(loadError.message));
  }, [accessToken]);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

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
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            <small>{user.isAdmin ? 'Actions de tous les utilisateurs' : 'Vos actions'}</small>
          </div>
          <div className="notif-list">
            {error && <p className="notif-empty">{error}</p>}
            {!error && !items.length && <p className="notif-empty">Aucune action enregistrée pour le moment.</p>}
            {items.map((item) => (
              <div className={`notif-item ${item.unread ? 'is-new' : ''}`} key={item.n}>
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
    </div>
  );
}
