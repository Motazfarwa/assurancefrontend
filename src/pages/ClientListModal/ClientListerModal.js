import { useEffect, useMemo, useState } from 'react';
import { listClients, normalizeClientRecord, rankClients } from '../../services/clientApi';
import '../ClientManagement/ClientManagementPage.css';
import './ClientListerModal.css';

const PAGE = 300;
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');

// "Lister": every client of the agency (TClient), filtered by nom / code, by the dates of creation and by type
// (Particulier / Société, both ticked at first); a click on a line opens the client.
export default function ClientListerModal({ accessToken, onClose, onView }) {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [types, setTypes] = useState({ Particulier: true, Societe: true });
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let active = true;
    listClients(accessToken)
      .then((rows) => { if (active) setClients(rows.map((record) => ({ ...normalizeClientRecord(record), creationDate: String(record.date_creation || '').slice(0, 10) }))); })
      .catch((requestError) => { if (active) setError(requestError.message || 'Impossible de charger la liste des clients.'); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo(() => {
    if (!clients) return [];
    const kept = clients.filter((record) => types[record.clientType]
      && (!debut || (record.creationDate && record.creationDate >= debut))
      && (!fin || (record.creationDate && record.creationDate <= fin)));
    return query.trim() ? rankClients(kept, query)
      : [...kept].sort((a, b) => String(a.clientCode).length - String(b.clientCode).length || String(a.clientCode).localeCompare(String(b.clientCode)));
  }, [clients, types, debut, fin, query]);
  // Each change of the filters starts the list from its top again.
  useEffect(() => { setShown(PAGE); }, [types, debut, fin, query]);

  const reversed = Boolean(debut && fin && fin < debut);
  const counts = { Particulier: results.filter((record) => record.clientType === 'Particulier').length, Societe: results.filter((record) => record.clientType === 'Societe').length };

  return (
    <div className="client-list-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="client-list-dialog cls-dialog" role="dialog" aria-modal="true" aria-labelledby="cls-title">
        <header>
          <div><span className="client-profile-label">PRODUCTION · MODULE 100</span><h2 id="cls-title">Lister les clients</h2></div>
          <button type="button" className="client-close-button" onClick={onClose} aria-label="Fermer">×</button>
        </header>
        <form className="cls-filters" onSubmit={(event) => event.preventDefault()}>
          <label className="cls-field cls-query">Nom ou code client<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. 5060 ou Ben Ali" autoFocus /></label>
          <fieldset className="cls-set"><legend>Date de création</legend>
            <label className="cls-field">Du<input type="date" value={debut} onChange={(event) => setDebut(event.target.value)} /></label>
            <label className="cls-field">Au<input type="date" value={fin} onChange={(event) => setFin(event.target.value)} /></label>
          </fieldset>
          <fieldset className="cls-set"><legend>Type client</legend>
            {[['Particulier', 'Particulier'], ['Societe', 'Société']].map(([key, label]) => (
              <label key={key} className="cls-check"><input type="checkbox" checked={types[key]} onChange={(event) => setTypes((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>
            ))}
          </fieldset>
        </form>
        {error && <p className="client-list-error" role="alert">{error}</p>}
        {reversed && <p className="client-list-error" role="alert">La date « Au » précède la date « Du ».</p>}
        {!clients && !error && <p className="client-list-loading">Chargement des clients…</p>}
        {clients && <>
          <p className="cls-count"><strong>{results.length} client{results.length > 1 ? 's' : ''}</strong> · {counts.Particulier} particulier{counts.Particulier > 1 ? 's' : ''} · {counts.Societe} société{counts.Societe > 1 ? 's' : ''}</p>
          <div className="cls-table-wrap">
            {results.length ? <table className="cls-table">
              <thead><tr><th>Code</th><th>Nom client</th><th>Type</th><th>Date création</th><th>Ville</th><th>Téléphone</th></tr></thead>
              <tbody>{results.slice(0, shown).map((record) => (
                <tr key={record.clientCode} onClick={() => onView(record)} title="Ouvrir ce client">
                  <td>{record.clientCode}</td><td><b>{record.nom_client || [record.lastName, record.firstName].filter(Boolean).join(' ') || '—'}</b></td>
                  <td>{record.clientType === 'Societe' ? 'Société' : record.clientType || '—'}</td><td>{formatDate(record.creationDate)}</td>
                  <td>{record.ville || ''}</td><td>{record.tel || record.mobile || ''}</td>
                </tr>
              ))}</tbody>
            </table> : <p className="cls-empty">Aucun client ne correspond à ces filtres.</p>}
          </div>
          {results.length > shown && <button type="button" className="cls-more" onClick={() => setShown(shown + PAGE)}>Afficher {Math.min(PAGE, results.length - shown)} de plus ({results.length - shown} restant{results.length - shown > 1 ? 's' : ''})</button>}
        </>}
      </section>
    </div>
  );
}
