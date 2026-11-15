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
// The coordonnée missing, to show only the clients without it.
export const MANQUES = [['adresse', 'Sans adresse'], ['ville', 'Sans ville'], ['code postal', 'Sans code postal'], ['téléphone', 'Sans téléphone']];
// The filter list: every client, one kind, or one missing coordonnée ("coordonnees:ville").
const filterValue = (categorie, manque) => (manque ? `coordonnees:${manque}` : categorie);

// Module "Clients à compléter" (administrator only): every client with missing information, what is missing, by kind.
export default function ClientsIncompletsModal({ moduleId, onClose }) {
  const { accessToken } = useAuth();
  const { setClient } = useClient();
  const [categorie, setCategorie] = useState('');
  const [manque, setManque] = useState('');
  const choose = (value) => { const [kind, missing = ''] = value.split(':'); setCategorie(kind); setManque(missing); };
  const [search, setSearch] = useState('');
  // "Entre deux dates": the clients created (date de création) between the two dates; the counters follow.
  const [between, setBetween] = useState(false);
  const [debut, setDebut] = useState('2000-01-01');
  const [fin, setFin] = useState(() => new Date().toISOString().slice(0, 10));
  const reversed = between && Boolean(debut && fin && debut > fin);
  const period = between && debut && fin && !reversed ? { date_debut: debut, date_fin: fin } : {};
  const periodKey = `${period.date_debut || ''}|${period.date_fin || ''}`;
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
    listIncompleteClientsPage(accessToken, { categorie, manque, q: query, offset: 0, limit: PAGE, ...period })
      .then((data) => { if (active) setState({ loading: false, error: '', data, items: data.items || [] }); })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, data: null, items: [] }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the period is read through periodKey
  }, [accessToken, categorie, manque, query, periodKey]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function more() {
    setLoadingMore(true);
    try {
      const data = await listIncompleteClientsPage(accessToken, { categorie, manque, q: query, offset: state.items.length, limit: PAGE, ...period });
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
          <button type="button" className={`cim-card${categorie === '' ? ' is-active' : ''}`} onClick={() => choose('')}><span>Tous les clients</span><strong>{data ? data.total : '…'}</strong></button>
          {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={`cim-card${categorie === key ? ' is-active' : ''}`} onClick={() => choose(key)} aria-pressed={categorie === key}>
            <span>{label}</span><strong>{data ? data[key] : '…'}</strong>
          </button>)}
        </div>
        <div className="unpaid-filter-form acompte-filters cim-filters">
          <label className="acompte-field cim-filter"><span>Afficher</span>
            <select value={filterValue(categorie, manque)} onChange={(event) => choose(event.target.value)}>
              <option value="">Tous les clients à compléter{data ? ` (${data.total})` : ''}</option>
              <option value="sans_police">Sans police{data ? ` (${data.sans_police})` : ''}</option>
              <option value="coordonnees">Coordonnées manquantes{data ? ` (${data.coordonnees})` : ''}</option>
              {MANQUES.map(([key, label]) => <option key={key} value={`coordonnees:${key}`}>{'  '}{label}{data?.manques ? ` (${data.manques[key]})` : ''}</option>)}
            </select></label>
          <span className="cim-dates">
            <label className="cim-between"><input type="checkbox" checked={between} onChange={(event) => setBetween(event.target.checked)} /> Créés entre deux dates</label>
            <input type="date" aria-label="Date de création du" value={debut} onChange={(event) => setDebut(event.target.value)} disabled={!between} />
            <input type="date" aria-label="Date de création au" value={fin} onChange={(event) => setFin(event.target.value)} disabled={!between} />
          </span>
          <label className="acompte-field cim-search"><span>Rechercher un client</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code ou nom du client" autoFocus /></label>
          <p className="cim-count" role="status">{state.loading ? 'Chargement…' : `${found} client${found > 1 ? 's' : ''}${period.date_debut ? ` créé${found > 1 ? 's' : ''} du ${period.date_debut.split('-').reverse().join('/')} au ${period.date_fin.split('-').reverse().join('/')}` : ''}${manque ? ` · ${MANQUES.find(([key]) => key === manque)[1].toLowerCase()}` : categorie ? ` · ${CATEGORIES.find(([key]) => key === categorie)[1].toLowerCase()}` : ''}${items.length < found ? ` · ${items.length} affichés` : ''}`}</p>
        </div>
        {reversed && <div className="expert-error unpaid-error" role="alert">La date de début doit précéder la date de fin.</div>}
        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        <div className={`cim-table-box${state.loading ? ' is-loading' : ''}`} aria-busy={state.loading}>
        {/* while the clients are read (opening, a filter, the dates, a search): over the visible list, so it is seen */}
        {state.loading && <div className="cim-loading" role="status"><span className="cim-spinner" aria-hidden="true" /><b>Chargement des clients…</b><small>Lecture des données en cours, veuillez patienter.</small></div>}
        <div className="cim-table-wrap">
          <table className="cim-table">
            <thead><tr><th>Client</th><th>Créé le</th><th>Coordonnées manquantes</th><th>Police</th><th aria-label="Action" /></tr></thead>
            <tbody>
              {items.map((item) => { const d = item.details || {}; return <tr key={item.code_client}>
                <td className="cim-client"><b>{item.code_client}</b><span>{item.nom_client || 'Client sans nom'}</span></td>
                <td>{!item.date_creation ? '—' : item.date_creation.startsWith('1900') ? <span className="cim-none" title="Date inconnue dans l’ancien logiciel (01/01/1900)">Inconnue</span> : item.date_creation.split('-').reverse().join('/')}</td>
                <td>{d.coordonnees?.length ? <ul className="cim-entries">{d.coordonnees.map((text) => <li key={text}><span>{text}</span></li>)}</ul> : <span className="cim-none">Complètes</span>}</td>
                <td>{d.sans_police ? <span className="cim-tag">Aucune police</span> : <span className="cim-none">—</span>}</td>
                <td><button type="button" className="expert-cancel cim-open" onClick={() => openClient(item.code_client)}>Ouvrir la fiche</button></td>
              </tr>; })}
              {!state.loading && !items.length && <tr><td colSpan={5} className="cim-empty">Aucun client à compléter pour ces critères.</td></tr>}
            </tbody>
          </table>
        </div>
        </div>
        {items.length < found && <button type="button" className="expert-cancel cim-more" onClick={more} disabled={loadingMore}>{loadingMore ? 'Chargement…' : `Afficher ${Math.min(PAGE, found - items.length)} clients de plus`}</button>}
        <p className="cim-hint">Coordonnées manquantes : pas d’adresse, de ville ou de code postal (ni au domicile ni au bureau), ou aucun numéro de téléphone. Sans police : le client n’a aucune police. Un client à qui il manque les deux est compté dans chaque catégorie, mais une seule fois dans « Tous les clients ». « Créés entre deux dates » se base sur la date de création du client (les compteurs suivent) ; l’ancien logiciel a mis le 01/01/1900 (« Inconnue ») aux clients dont la date n’était pas connue.</p>
      </div>
    </section>
  </div>;
}
