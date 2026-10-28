import { useEffect, useRef, useState } from 'react';
import { listClients, normalizeClientRecord, rankClients } from '../../services/clientApi';
import '../ClientManagement/ClientManagementPage.css';

export default function ClientListModal({ accessToken, localClients = [], onClose, onView }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientType, setClientType] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [clients, setClients] = useState(null); // every client, loaded once when the list opens
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const localRef = useRef(localClients);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listClients(accessToken).then((apiClients) => {
      if (!active) return;
      const locals = localRef.current.filter((local) => !apiClients.some((api) => String(api.code_client) === String(local.clientCode)));
      setClients([...apiClients, ...locals].map((record) => ({ ...normalizeClientRecord(record), creationDate: String(record.date_creation || record.createdAt || '').slice(0, 10) })));
    }).catch((requestError) => {
      if (active) setError(requestError.message || 'Impossible de charger la liste des clients.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken]);

  // Results follow the filters as they change: nothing is listed until one of them is filled in.
  // date_creation is returned by FastAPI as an ISO timestamp; its date portion is compared inclusively.
  const filtering = Boolean(clientQuery.trim() || startDate || endDate || clientType);
  const results = clients && filtering ? clients.filter((record) => (
    (!startDate || (record.creationDate && record.creationDate >= startDate))
    && (!endDate || (record.creationDate && record.creationDate <= endDate))
    && (!clientType || record.clientType === clientType)
  )) : null;
  const visibleResults = results ? rankClients(results, clientQuery) : [];

  return (
    <div className="client-list-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="client-list-dialog" role="dialog" aria-modal="true" aria-labelledby="client-list-title">
        <header>
          <div><span className="client-profile-label">PRODUCTION · MODULE 100</span><h2 id="client-list-title">Liste des clients</h2></div>
          <button type="button" className="client-close-button" onClick={onClose} aria-label="Fermer">×</button>
        </header>
        <form onSubmit={(event) => event.preventDefault()}>
          <fieldset className="client-filter-group">
            <legend>Rechercher un client</legend>
            <label>Nom ou code client<input type="search" value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Ex. 5060 ou Ben Ali" /></label>
          </fieldset>
          <fieldset className="client-filter-group">
            <legend>Entre deux dates de création</legend>
            <label>Date début<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label>Date fin<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </fieldset>
          <fieldset className="client-filter-group">
            <legend>Type client</legend>
            <label><input type="radio" name="filter-client-type" checked={clientType === ''} onChange={() => setClientType('')} /> Tous</label>
            <label><input type="radio" name="filter-client-type" checked={clientType === 'Societe'} onChange={() => setClientType('Societe')} /> Société</label>
            <label><input type="radio" name="filter-client-type" checked={clientType === 'Particulier'} onChange={() => setClientType('Particulier')} /> Particulier</label>
          </fieldset>
        </form>
        {loading && <p className="client-list-loading">Chargement des clients…</p>}
        {error && <p className="client-list-error" role="alert">{error}</p>}
        {results && <div className="client-filter-results">
          <strong>{visibleResults.length} client{visibleResults.length > 1 ? 's' : ''} trouvé{visibleResults.length > 1 ? 's' : ''}</strong>
          {visibleResults.length ? <div className="client-result-list">{visibleResults.map((record, index) => <button type="button" key={`${record.clientCode || record.lastName}-${index}`} onClick={() => onView(record)}>
            <span><strong>{[record.lastName, record.firstName].filter(Boolean).join(' ') || 'Client sans nom'}</strong><small>Code {record.clientCode || '—'} · {record.clientType || 'Type non défini'} · {record.date_creation ? `Créé le ${String(record.date_creation).slice(0, 10)}` : 'Date de création non disponible'}</small></span><span aria-hidden="true">›</span>
          </button>)}</div> : <p>Aucun client ne correspond à ces filtres. Vérifiez la période de création et le type de client.</p>}
        </div>}
      </section>
    </div>
  );
}

