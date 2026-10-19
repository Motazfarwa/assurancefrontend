import { useState } from 'react';
import { listClients, normalizeClientRecord } from '../../services/clientApi';
import '../ClientManagement/ClientManagementPage.css';

export default function ClientListModal({ accessToken, localClients = [], onClose, onView }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientType, setClientType] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function filterClients(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const apiClients = await listClients(accessToken);
      const combined = [...apiClients, ...localClients.filter((local) => !apiClients.some((api) => String(api.code_client) === String(local.clientCode)))];
      const filtered = combined.filter((record) => {
        // date_creation is returned by FastAPI as an ISO timestamp; compare its date portion inclusively.
        const creationDate = String(record.date_creation || record.createdAt || '').slice(0, 10);
        const normalized = normalizeClientRecord(record);
        return (!startDate || (creationDate && creationDate >= startDate))
          && (!endDate || (creationDate && creationDate <= endDate))
          && (!clientType || normalized.clientType === clientType);
      }).map(normalizeClientRecord);
      setResults(filtered);
    } catch (requestError) {
      setError(requestError.message || 'Impossible de charger la liste des clients.');
    } finally {
      setLoading(false);
    }
  }

  const visibleResults = results?.filter((record) => {
    const query = clientQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    return `${record.clientCode} ${record.firstName} ${record.lastName} ${record.relatedName}`.toLocaleLowerCase().includes(query);
  }) || [];

  return (
    <div className="client-list-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="client-list-dialog" role="dialog" aria-modal="true" aria-labelledby="client-list-title">
        <header>
          <div><span className="client-profile-label">PRODUCTION Â· MODULE 100</span><h2 id="client-list-title">Liste des clients</h2></div>
          <button type="button" className="client-close-button" onClick={onClose} aria-label="Fermer">Ã—</button>
        </header>
        <form onSubmit={filterClients}>
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
            <label><input type="radio" name="filter-client-type" checked={clientType === 'Societe'} onChange={() => setClientType('Societe')} /> SociÃ©tÃ©</label>
            <label><input type="radio" name="filter-client-type" checked={clientType === 'Particulier'} onChange={() => setClientType('Particulier')} /> Particulier</label>
          </fieldset>
          <div className="client-list-actions">
            <button type="button" className="client-secondary-button" onClick={onClose}>Fermer</button>
            <button type="submit" className="client-primary-button" disabled={loading}>{loading ? 'Chargementâ€¦' : 'Filtrer les clients'}</button>
          </div>
        </form>
        {error && <p className="client-list-error" role="alert">{error}</p>}
        {results && <div className="client-filter-results">
          <strong>{visibleResults.length} client{visibleResults.length > 1 ? 's' : ''} trouvÃ©{visibleResults.length > 1 ? 's' : ''}</strong>
          {visibleResults.length ? <div className="client-result-list">{visibleResults.map((record, index) => <button type="button" key={`${record.clientCode || record.lastName}-${index}`} onClick={() => onView(record)}>
            <span><strong>{[record.firstName, record.lastName].filter(Boolean).join(' ') || 'Client sans nom'}</strong><small>Code {record.clientCode || 'â€”'} Â· {record.clientType || 'Type non dÃ©fini'} Â· {record.date_creation ? `CrÃ©Ã© le ${String(record.date_creation).slice(0, 10)}` : 'Date de crÃ©ation non disponible'}</small></span><span aria-hidden="true">â€º</span>
          </button>)}</div> : <p>Aucun client ne correspond Ã  ces filtres. VÃ©rifiez la pÃ©riode de crÃ©ation et le type de client.</p>}
        </div>}
      </section>
    </div>
  );
}

