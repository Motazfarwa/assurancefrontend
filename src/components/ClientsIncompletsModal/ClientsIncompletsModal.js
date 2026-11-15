import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useClient } from '../../contexts/ClientContext';
import { navigate } from '../../navigation';
import { getClientByCode } from '../../services/clientApi';
import { listIncompleteClientsPage } from '../../services/notificationApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import '../AcompteModal/AcompteModal.css';
import './ClientsIncompletsModal.css';

const PAGE = 100;
// The kinds of gaps, as counted by the notification: [key of the counter, label].
export const CATEGORIES = [
  ['coordonnees', 'Coordonnées'],
  ['sans_police', 'Sans police'],
];

// Module "Clients à compléter" (administrator only): every client with missing information, what is missing, by kind.
export default function ClientsIncompletsModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const { setClient } = useClient();
  const [categorie, setCategorie] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: true, error: '', data: null, items: [] });
  const [loadingMore, setLoadingMore] = useState(false);

  // The search is sent once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    listIncompleteClientsPage(accessToken, { categorie, q: query, offset: 0, limit: PAGE })
      .then((data) => { if (active) setState({ loading: false, error: '', data, items: data.items || [] }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, data: null, items: [] }); });
    return () => { active = false; };
  }, [accessToken, categorie, query]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function more() {
    setLoadingMore(true);
    try {
      const data = await listIncompleteClientsPage(accessToken, { categorie, q: query, offset: state.items.length, limit: PAGE });
      setState((current) => ({ ...current, items: [...current.items, ...(data.items || [])] }));
    } catch (requestError) {
      setState((current) => ({ ...current, error: requestError.message }));
    } finally {
      setLoadingMore(false);
    }
  }

  async function openClient(code) {
    try {
      const record = await getClientByCode(accessToken, code);
      setClient({ ...record, _persisted: true });
      onClose();
      navigate('/clients');
    } catch (openError) {
      setState((current) => ({ ...current, error: openError.message }));
    }
  }

  const { data, items } = state;
  const found = data?.found ?? 0;
  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal cim-modal" role="dialog" aria-modal="true" aria-labelledby="cim-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId} · ADMINISTRATEUR</span><h2 id="cim-title">Clients à compléter</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="cim-cards" role="group" aria-label="Type d’information manquante">
          <button type="button" className={`cim-card${categorie === '' ? ' is-active' : ''}`} onClick={() => setCategorie('')}><span>Tous les clients</span><strong>{data ? data.total : '…'}</strong></button>
          {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={`cim-card${categorie === key ? ' is-active' : ''}`} onClick={() => setCategorie(key)} aria-pressed={categorie === key}>
            <span>{label}</span><strong>{data ? data[key] : '…'}</strong>
          </button>)}
        </div>
        <div className="unpaid-filter-form acompte-filters cim-filters">
          <label className="acompte-field cim-search"><span>Rechercher un client</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code ou nom du client" autoFocus /></label>
          <p className="cim-count" role="status">{state.loading ? 'Chargement…' : `${found} client${found > 1 ? 's' : ''}${categorie ? ` · ${CATEGORIES.find(([key]) => key === categorie)[1].toLowerCase()}` : ''}${items.length < found ? ` · ${items.length} affichés` : ''}`}</p>
        </div>
        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        <div className="cim-table-wrap">
          <table className="cim-table">
            <thead><tr><th>Client</th><th>Coordonnées manquantes</th><th>Police</th><th aria-label="Action" /></tr></thead>
            <tbody>
              {items.map((item) => { const d = item.details || {}; return <tr key={item.code_client}>
                <td className="cim-client"><b>{item.code_client}</b><span>{item.nom_client || 'Client sans nom'}</span></td>
                <td>{d.coordonnees?.length ? <ul className="cim-entries">{d.coordonnees.map((text) => <li key={text}><span>{text}</span></li>)}</ul> : <span className="cim-none">Complètes</span>}</td>
                <td>{d.sans_police ? <span className="cim-tag">Aucune police</span> : <span className="cim-none">—</span>}</td>
                <td><button type="button" className="expert-cancel cim-open" onClick={() => openClient(item.code_client)}>Ouvrir la fiche</button></td>
              </tr>; })}
              {!state.loading && !items.length && <tr><td colSpan={4} className="cim-empty">Aucun client à compléter pour ces critères.</td></tr>}
            </tbody>
          </table>
        </div>
        {items.length < found && <button type="button" className="expert-cancel cim-more" onClick={more} disabled={loadingMore}>{loadingMore ? 'Chargement…' : `Afficher ${Math.min(PAGE, found - items.length)} clients de plus`}</button>}
        <p className="cim-hint">Coordonnées manquantes : pas d’adresse, de ville ou de code postal (ni au domicile ni au bureau), ou aucun numéro de téléphone. Sans police : le client n’a aucune police. Un client à qui il manque les deux est compté dans chaque catégorie, mais une seule fois dans « Tous les clients ».</p>
      </div>
    </section>
  </div>;
}
