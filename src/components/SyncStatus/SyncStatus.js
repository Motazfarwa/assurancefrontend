import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { API_BASE_URL, IS_AGENCY_SERVER } from '../../services/apiBase';
import './SyncStatus.css';

const POLL_MS = 30000;
const OPS = { I: 'ajout', U: 'modification', D: 'suppression', T: 'vidage' };

function ago(iso) {
  const time = iso ? Date.parse(iso.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) : NaN;
  if (Number.isNaN(time)) return '';
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `il y a ${hours} h` : `le ${new Date(time).toLocaleDateString('fr-FR')}`;
}

// Agency (offline) server only: is the online database reachable, how many changes wait to be sent, what conflicted.
export default function SyncStatus() {
  const { accessToken, user } = useAuth();
  const [status, setStatus] = useState(null); // null = not loaded yet, false = agency server unreachable
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync/status`, { headers: { Authorization: `Bearer ${accessToken}` } });
      setStatus(response.ok ? await response.json() : false);
    } catch {
      setStatus(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!IS_AGENCY_SERVER || !accessToken) return undefined;
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [accessToken, load]);

  async function resolve(id) {
    await fetch(`${API_BASE_URL}/api/sync/conflicts/${id}/resolve`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    load();
  }

  if (!IS_AGENCY_SERVER || status === null || status?.mode === 'online') return null;

  let kind; let label;
  if (status === false) { kind = 'is-down'; label = "Serveur de l'agence injoignable"; }
  else if (!status.worker_running) { kind = 'is-warn'; label = 'Synchronisation arrêtée'; }
  else if (!status.online) { kind = 'is-offline'; label = `Hors ligne${status.pending_push ? ` · ${status.pending_push} modification(s) en attente` : ''}`; }
  else if (status.pending_push) { kind = 'is-busy'; label = `Envoi vers le serveur en ligne · ${status.pending_push}`; }
  else { kind = 'is-ok'; label = `Synchronisé ${ago(status.last_success_at)}`; }
  const conflicts = status ? status.open_conflicts : 0;

  return (
    <div className="sync-status">
      <button type="button" className={`sync-pill ${kind}`} onClick={() => setOpen((value) => !value)} aria-expanded={open}
        title={status && status.last_error ? `Dernière erreur : ${status.last_error}` : 'État de la synchronisation avec le serveur en ligne'}>
        <span className="sync-dot" aria-hidden="true" />{label}
        {conflicts > 0 && <b className="sync-conflicts">{conflicts} conflit{conflicts > 1 ? 's' : ''}</b>}
      </button>
      {open && (
        <div className="sync-panel" role="dialog" aria-label="Synchronisation">
          <p>
            {status === false
              ? "Le PC serveur de l'agence est éteint ou le réseau local est coupé. Les données restent sur ce serveur : reprenez dès qu'il répond."
              : status.online
                ? `Connecté au serveur en ligne. Dernière synchronisation ${ago(status.last_success_at)}.`
                : `Pas de connexion internet : le travail continue sur le serveur de l'agence. Les ${status.pending_push} modification(s) seront envoyées dès le retour de la connexion.`}
          </p>
          {status && !status.worker_running && <p className="sync-warn">Le programme de synchronisation ne tourne pas sur le PC serveur : relancez « start.bat ».</p>}
          {conflicts > 0 && (
            <>
              <strong>Conflits à vérifier</strong>
              <p className="sync-help">Le même enregistrement a été modifié des deux côtés. Comparez les deux versions, corrigez si besoin, puis marquez le conflit comme traité.</p>
              <ul>
                {status.conflicts.map((item) => (
                  <li key={item.id}>
                    <span>{new Date(item.at).toLocaleString('fr-FR')} · {item.tbl} · {OPS[item.op] || item.op} {item.direction === 'push' ? 'faite à l’agence' : 'faite en ligne'}{item.error ? ` · ${item.error}` : ''}</span>
                    {user?.isAdmin && <button type="button" onClick={() => resolve(item.id)}>Traité</button>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
