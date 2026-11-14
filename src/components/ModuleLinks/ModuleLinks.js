import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { searchClients } from '../../services/clientApi';
import './ModuleLinks.css';

// Gestion des polices, des quittances and des sinistres lead to each other: each shows the two others (those the user
// may open), and its own "Nouveau" / "Modifier" actions next to them.
export const LINKED_MODULES = [['110', 'Gestion des polices'], ['120', 'Gestion des quittances'], ['620', 'Gestion des sinistres']];

export default function ModuleLinks({ current, available, onNavigate, children }) {
  const links = onNavigate ? LINKED_MODULES.filter(([id]) => id !== current && (!available || available.includes(id))) : [];
  if (!links.length && !children) return null;
  return <nav className="module-links" aria-label="Actions et autres modules">
    {children}
    {links.map(([id, label]) => <button key={id} type="button" className="module-link" onClick={() => onNavigate(id)} title={`Ouvrir ${label} (module ${id})`}>
      {label} <span aria-hidden="true">→</span>
    </button>)}
  </nav>;
}

// The client a new police / quittance is entered for: its code, or its name searched among the clients.
export function ClientPickDialog({ title, kicker, onPick, onClose }) {
  const { accessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: false, items: [], error: '' });
  useEffect(() => {
    const text = query.trim();
    if (!text) { setState({ loading: false, items: [], error: '' }); return undefined; }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    const timer = setTimeout(() => {
      searchClients(accessToken, text, 12)
        .then((items) => { if (active) setState({ loading: false, items: Array.isArray(items) ? items : [], error: '' }); })
        .catch((error) => { if (active) setState({ loading: false, items: [], error: error.message }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [accessToken, query]);
  const name = (item) => [item.lastName, item.firstName].filter(Boolean).join(' ') || item.nom_client || '';
  return <div className="module-links-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="module-links-dialog" role="dialog" aria-modal="true" aria-labelledby="module-pick-title">
      <header><div><span>{kicker}</span><h3 id="module-pick-title">{title}</h3></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      <label className="module-links-field"><span>Code ou nom du client</span>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex : 249 ou TECHNIC" /></label>
      {state.error && <p className="module-links-error" role="alert">{state.error}</p>}
      <ul className="module-links-results" aria-label="Clients trouvés">
        {state.items.map((item) => <li key={item.clientCode}><button type="button" onClick={() => onPick({ code: String(item.clientCode).trim(), nom: name(item) })}>
          <b>{item.clientCode}</b> {name(item)}</button></li>)}
      </ul>
      {query.trim() && !state.loading && !state.items.length && !state.error && <p className="module-links-hint">Aucun client trouvé.</p>}
      {!query.trim() && <p className="module-links-hint">Saisissez le code ou le nom du client, puis choisissez-le dans la liste.</p>}
    </section>
  </div>;
}
