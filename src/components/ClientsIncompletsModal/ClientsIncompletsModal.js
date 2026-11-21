import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useClient } from '../../contexts/ClientContext';
import { navigate, rememberReturnModule } from '../../navigation';
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
  ['sans_quittance', 'Sans quittance'],
];
// The coordonnée missing, to show only the clients without it.
export const MANQUES = [['adresse', 'Sans adresse'], ['ville', 'Sans ville'], ['code postal', 'Sans code postal'], ['téléphone', 'Sans téléphone']];
// The filter list: every client, one kind, or one missing coordonnée ("coordonnees:ville").
const filterValue = (categorie, manque) => (manque ? `coordonnees:${manque}` : categorie);

// Module "Clients à compléter" (administrator only): every client with missing information, what is missing, by kind.
// initial: the filters to open with (coming back from a client's fiche, as they were left).
// The page numbers shown (0-based): the first, the last and two around the current one; null marks a gap ("…").
export function pageNumbers(page, pages) {
  const shown = [...new Set([0, pages - 1, page - 2, page - 1, page, page + 1, page + 2])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);
  return shown.flatMap((n, i) => (i && n - shown[i - 1] > 1 ? [null, n] : [n]));
}

export default function ClientsIncompletsModal({ moduleId, onClose, initial = {} }) {
  const { accessToken } = useAuth();
  const { setClient } = useClient();
  const [categorie, setCategorie] = useState(initial.categorie || '');
  const [manque, setManque] = useState(initial.manque || '');
  const choose = (value) => { const [kind, missing = ''] = value.split(':'); setCategorie(kind); setManque(missing); };
  const [search, setSearch] = useState(initial.search || '');
  // "Entre deux dates": the clients created (date de création) between the two dates; the counters follow.
  const [between, setBetween] = useState(Boolean(initial.between));
  const [debut, setDebut] = useState(initial.debut || '2000-01-01');
  const [fin, setFin] = useState(() => initial.fin || new Date().toISOString().slice(0, 10));
  const reversed = between && Boolean(debut && fin && debut > fin);
  const period = between && debut && fin && !reversed ? { date_debut: debut, date_fin: fin } : {};
  const periodKey = `${period.date_debut || ''}|${period.date_fin || ''}`;
  const [query, setQuery] = useState((initial.search || '').trim());
  const [state, setState] = useState({ loading: true, error: '', data: null, items: [] });
  // Pagination: PAGE clients a page; a new filter, dates or search goes back to the first page.
  const filterKey = JSON.stringify([categorie, manque, query, periodKey]);
  const [pager, setPager] = useState(() => ({ key: filterKey, page: initial.page || 0 }));
  const page = pager.key === filterKey ? pager.page : 0;
  const goTo = (next) => setPager({ key: filterKey, page: next });
  const tableRef = useRef(null);

  // The search is sent once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    listIncompleteClientsPage(accessToken, { categorie, manque, q: query, offset: page * PAGE, limit: PAGE, ...period })
      .then((data) => {
        if (!active) return;
        setState({ loading: false, error: '', data, items: data.items || [] });
        if (tableRef.current) tableRef.current.scrollTop = 0;
      })
      .catch((requestError) => { if (active) setState({ loading: false, error: requestError.message, data: null, items: [] }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the period is read through periodKey
  }, [accessToken, categorie, manque, query, periodKey, page]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function openClient(code) {
    try {
      const record = await getClientByCode(accessToken, code);
      setClient({ ...record, _persisted: true });
      // "Retour" (or Fermer) on the fiche comes back here, with the same filters.
      rememberReturnModule(moduleId, { categorie, manque, search, between, debut, fin, page });
      onClose();
      navigate('/clients');
    } catch (openError) {
      setState((current) => ({ ...current, error: openError.message }));
    }
  }

  const { data, items } = state;
  const found = data?.found ?? 0;
  const pages = Math.max(1, Math.ceil(found / PAGE));
  const first = found ? page * PAGE + 1 : 0;
  const last = Math.min(found, (page + 1) * PAGE);
  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal cim-modal" role="dialog" aria-modal="true" aria-labelledby="cim-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>PRODUCTION · MODULE {moduleId} · ADMINISTRATEUR</span><h2 id="cim-title">Clients à compléter</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters cim-filters">
          <label className="acompte-field cim-filter"><span>Afficher</span>
            <select value={filterValue(categorie, manque)} onChange={(event) => choose(event.target.value)}>
              <option value="">Tous les clients à compléter{data ? ` (${data.total})` : ''}</option>
              <option value="sans_police">Sans police{data ? ` (${data.sans_police})` : ''}</option>
              <option value="sans_quittance">Sans quittance{data?.sans_quittance !== undefined ? ` (${data.sans_quittance})` : ''}</option>
              <option value="coordonnees">Coordonnées manquantes{data ? ` (${data.coordonnees})` : ''}</option>
              {MANQUES.map(([key, label]) => <option key={key} value={`coordonnees:${key}`}>{'  '}{label}{data?.manques ? ` (${data.manques[key]})` : ''}</option>)}
            </select></label>
          <span className="cim-dates">
            <label className="cim-between"><input type="checkbox" checked={between} onChange={(event) => setBetween(event.target.checked)} /> Créés entre deux dates</label>
            <input type="date" aria-label="Date de création du" value={debut} onChange={(event) => setDebut(event.target.value)} disabled={!between} />
            <input type="date" aria-label="Date de création au" value={fin} onChange={(event) => setFin(event.target.value)} disabled={!between} />
          </span>
          <label className="acompte-field cim-search"><span>Rechercher un client</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code ou nom du client" autoFocus /></label>
          <p className="cim-count" role="status">{state.loading ? 'Chargement…' : `${found} client${found > 1 ? 's' : ''}${period.date_debut ? ` créé${found > 1 ? 's' : ''} du ${period.date_debut.split('-').reverse().join('/')} au ${period.date_fin.split('-').reverse().join('/')}` : ''}${manque ? ` · ${MANQUES.find(([key]) => key === manque)[1].toLowerCase()}` : categorie ? ` · ${CATEGORIES.find(([key]) => key === categorie)[1].toLowerCase()}` : ''}${pages > 1 ? ` · ${first} à ${last}` : ''}`}</p>
        </div>
        {reversed && <div className="expert-error unpaid-error" role="alert">La date de début doit précéder la date de fin.</div>}
        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        <div className={`cim-table-box${state.loading ? ' is-loading' : ''}`} aria-busy={state.loading}>
        {/* while the clients are read (opening, a filter, the dates, a search): over the visible list, so it is seen */}
        {state.loading && <div className="cim-loading" role="status"><span className="cim-spinner" aria-hidden="true" /><b>Chargement des clients…</b><small>Lecture des données en cours, veuillez patienter.</small></div>}
        <div className="cim-table-wrap" ref={tableRef}>
          <table className="cim-table">
            <thead><tr><th>Client</th><th>Créé le</th><th>Coordonnées manquantes</th><th>Police</th><th>Quittance</th><th aria-label="Action" /></tr></thead>
            <tbody>
              {items.map((item) => { const d = item.details || {}; return <tr key={item.code_client}>
                <td className="cim-client"><b>{item.code_client}</b><span>{item.nom_client || 'Client sans nom'}</span></td>
                <td>{!item.date_creation ? '—' : item.date_creation.startsWith('1900') ? <span className="cim-none" title="Date inconnue dans l’ancien logiciel (01/01/1900)">Inconnue</span> : item.date_creation.split('-').reverse().join('/')}</td>
                <td>{d.coordonnees?.length ? <ul className="cim-entries">{d.coordonnees.map((text) => <li key={text}><span>{text}</span></li>)}</ul> : <span className="cim-none">Complètes</span>}</td>
                <td>{d.sans_police ? <span className="cim-tag">Aucune police</span> : <span className="cim-none">—</span>}</td>
                <td>{d.sans_quittance ? <span className="cim-tag">Aucune quittance</span> : <span className="cim-none">—</span>}</td>
                <td><button type="button" className="expert-cancel cim-open" onClick={() => openClient(item.code_client)}>Ouvrir la fiche</button></td>
              </tr>; })}
              {!state.loading && !items.length && <tr><td colSpan={6} className="cim-empty">Aucun client à compléter pour ces critères.</td></tr>}
            </tbody>
          </table>
        </div>
        </div>
        {pages > 1 && <nav className="cim-pager" aria-label="Pagination">
          <button type="button" onClick={() => goTo(0)} disabled={page === 0 || state.loading} aria-label="Première page">«</button>
          <button type="button" onClick={() => goTo(page - 1)} disabled={page === 0 || state.loading}>‹ Précédent</button>
          {pageNumbers(page, pages).map((number, index) => (number === null
            ? <span key={`gap${index}`} className="cim-pager-gap">…</span>
            : <button type="button" key={number} className={number === page ? 'is-current' : ''} aria-current={number === page ? 'page' : undefined} onClick={() => goTo(number)} disabled={state.loading}>{number + 1}</button>))}
          <button type="button" onClick={() => goTo(page + 1)} disabled={page >= pages - 1 || state.loading}>Suivant ›</button>
          <button type="button" onClick={() => goTo(pages - 1)} disabled={page >= pages - 1 || state.loading} aria-label="Dernière page">»</button>
          <span className="cim-pager-info">Page {page + 1} / {pages}</span>
        </nav>}
      </div>
    </section>
  </div>;
}
