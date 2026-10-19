import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listCompanies } from '../../services/companyApi';
import { listAgencyUnpaid, listAgencyUnpaidCompanies } from '../../services/unpaidApi';
import { getClientByCode } from '../../services/clientApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import './AgencyUnpaidModal.css';

const today = new Date().toISOString().slice(0, 10);
const initialFilters = { code_client: '', nom_client: '', date_debut: '2000-01-01', date_fin: today, type_client: '', compagnie: '', piece: '', mise_en_demeure: false };
const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const amount = (value) => Number(value || 0);
const formatDate = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : 'â€”';

function aggregateRows(rows) {
  const summary = new Map();
  rows.forEach((row) => {
    const key = `${row.code_client || ''}|${row.nom_compagnie || ''}`;
    const current = summary.get(key) || { ...row, items_count: 0, prime_total: 0, solde_quittance: 0, Total_Piece: 0 };
    current.items_count += 1;
    current.prime_total += amount(row.prime_total);
    current.solde_quittance += amount(row.solde_quittance);
    current.Total_Piece += amount(row.Total_Piece);
    summary.set(key, current);
  });
  return Array.from(summary.values());
}

export default function AgencyUnpaidModal({ onClose }) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [companies, setCompanies] = useState([]);
  const [items, setItems] = useState(null);
  const [view, setView] = useState('detail');
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [error, setError] = useState('');
  const [clientLookupMessage, setClientLookupMessage] = useState('');
  const lookupRequest = useRef(0);
  const visibleItems = useMemo(() => view === 'global' && items ? aggregateRows(items) : items || [], [items, view]);
  const totalBalance = useMemo(() => (items || []).reduce((sum, row) => sum + amount(row.solde_quittance), 0), [items]);

  useEffect(() => {
    let active = true;
    async function loadCompanyOptions() {
      try {
        const reportCompanies = await listAgencyUnpaidCompanies(accessToken);
        if (reportCompanies.length) {
          if (active) setCompanies(reportCompanies);
          return;
        }
      } catch {
        // Fall back to the company master list if the report lookup is unavailable.
      }
      try {
        const result = await listCompanies(accessToken);
        const companyRows = Array.isArray(result) ? result : result.items || [];
        if (active) setCompanies(companyRows.map((company) => company.nom_compagnie).filter(Boolean));
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    }
    loadCompanyOptions().finally(() => { if (active) setLoadingCompanies(false); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const code = filters.code_client.trim();
    if (!code) return undefined;
    const requestId = ++lookupRequest.current;
    setClientLookupMessage('Recherche du client…');
    const timer = window.setTimeout(async () => {
      try {
        const client = await getClientByCode(accessToken, code);
        if (requestId !== lookupRequest.current) return;
        const clientName = client.nom_client || [client.lastName, client.firstName].filter(Boolean).join(' ');
        if (!clientName) throw new Error('Le client est trouvé, mais aucun nom n’est renseigné.');
        setFilters((current) => current.code_client.trim() === code ? { ...current, nom_client: clientName } : current);
        setClientLookupMessage('Client trouvé');
      } catch (lookupError) {
        if (requestId === lookupRequest.current) setClientLookupMessage(lookupError.message || 'Client introuvable.');
      }
    }, 350);
    return () => { window.clearTimeout(timer); lookupRequest.current += 1; };
  }, [accessToken, filters.code_client]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape' && !loading) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, loading]);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setFilters((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  function updateClientCode(event) {
    const code = event.target.value;
    lookupRequest.current += 1;
    setClientLookupMessage('');
    setFilters((current) => ({ ...current, code_client: code, nom_client: '' }));
  }

  async function applyFilters(event) {
    event.preventDefault();
    setLoading(true); setError(''); setItems(null);
    const params = {
      code_client: filters.code_client.trim(),
      nom_client: filters.nom_client.trim(),
      date_debut: filters.date_debut,
      date_fin: filters.date_fin,
      type_client: filters.type_client || '',
      compagnie: filters.compagnie || '',
      piece: filters.piece || '',
      mise_en_demeure: filters.mise_en_demeure,
    };
    try {
      const result = await listAgencyUnpaid(accessToken, params);
      setItems(result.items || []);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
    <section className="unpaid-modal" role="dialog" aria-modal="true" aria-labelledby="unpaid-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali </small></span></div><div className="expert-title"><span>RECOUVREMENT Â· MODULE 340</span><h2 id="unpaid-title">Etat des impayés </h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">Ã—</button></header>
      <div className="unpaid-content"><form className="unpaid-filter-form" onSubmit={applyFilters}>
        <div className="unpaid-filter-grid">
          <label className="catalog-field unpaid-client-code"><span>Code client</span><input name="code_client" value={filters.code_client} onChange={updateClientCode} maxLength={8} placeholder="Tous les clients" /><small aria-live="polite">{clientLookupMessage}</small></label>
          <label className="catalog-field"><span>Nom client</span><input name="nom_client" value={filters.nom_client} onChange={update} maxLength={30} placeholder="Rechercher par nom" /></label>
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Affichage</legend><label><input type="radio" name="view" checked={view === 'detail'} onChange={() => setView('detail')} /> DÃ©taillÃ©</label><label><input type="radio" name="view" checked={view === 'global'} onChange={() => setView('global')} /> Global</label></fieldset>
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>PiÃ¨ces</legend><label><input type="radio" name="piece" checked={filters.piece === ''} onChange={() => setFilters((current) => ({ ...current, piece: '' }))} /> Toutes</label><label><input type="radio" name="piece" checked={filters.piece === 'avec'} onChange={() => setFilters((current) => ({ ...current, piece: 'avec' }))} /> Avec piÃ¨ce</label><label><input type="radio" name="piece" checked={filters.piece === 'sans'} onChange={() => setFilters((current) => ({ ...current, piece: 'sans' }))} /> Sans piÃ¨ce</label></fieldset>
          <fieldset className="unpaid-filter-set unpaid-date-set"><legend><label><input type="checkbox" name="date_enabled" checked={Boolean(filters.date_debut || filters.date_fin)} onChange={(event) => setFilters((current) => ({ ...current, date_debut: event.target.checked ? (current.date_debut || '1900-01-01') : '', date_fin: event.target.checked ? (current.date_fin || today) : '' }))} /> Entre deux dates dâ€™Ã©chÃ©ance</label></legend><label>Date dÃ©but<input type="date" name="date_debut" value={filters.date_debut} onChange={update} /></label><label>Date fin<input type="date" name="date_fin" value={filters.date_fin} onChange={update} /></label></fieldset>
          <fieldset className="unpaid-filter-set unpaid-choice"><legend><label><input type="checkbox" checked={Boolean(filters.type_client)} onChange={(event) => setFilters((current) => ({ ...current, type_client: event.target.checked ? 'P' : '' }))} /> Type client</label></legend><label><input type="radio" name="type_client" checked={filters.type_client === 'P'} onChange={() => setFilters((current) => ({ ...current, type_client: 'P' }))} /> Particulier</label><label><input type="radio" name="type_client" checked={filters.type_client === 'S'} onChange={() => setFilters((current) => ({ ...current, type_client: 'S' }))} /> SociÃ©tÃ©</label></fieldset>
          <fieldset className="unpaid-filter-set unpaid-company-set"><legend><label><input type="checkbox" checked={Boolean(filters.compagnie)} onChange={(event) => setFilters((current) => ({ ...current, compagnie: event.target.checked ? String(companies[0] || '') : '' }))} /> Compagnie</label></legend><select aria-label="Compagnie" value={filters.compagnie} onChange={(event) => setFilters((current) => ({ ...current, compagnie: event.target.value }))} disabled={loadingCompanies || (!filters.compagnie && companies.length === 0)}><option value="">Toutes les compagnies</option>{companies.map((company) => <option key={company} value={company}>{company}</option>)}</select></fieldset>
          <label className="unpaid-notice-check"><input type="checkbox" name="mise_en_demeure" checked={filters.mise_en_demeure} onChange={update} /> Mise en demeure</label>
        </div>
        <div className="unpaid-actions"><button type="button" className="expert-cancel" onClick={onClose}>Fermer</button><button type="submit" className="expert-submit" disabled={loading || loadingCompanies}>{loading ? 'Rechercheâ€¦' : 'Afficher les impayÃ©s'}</button></div>
      </form>
      {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
      {items && <section className="unpaid-results"><div className="unpaid-results-heading"><div><span>RÃ‰SULTATS</span><h3>{items.length} impayÃ©{items.length > 1 ? 's' : ''} trouvÃ©{items.length > 1 ? 's' : ''}</h3></div><div className="unpaid-total"><small>Solde total</small><strong>{money.format(totalBalance)} TND</strong></div></div>
        {visibleItems.length ? <div className="unpaid-table-scroll"><table className="unpaid-table"><thead><tr>{view === 'detail' ? <><th>Client</th><th>Compagnie</th><th>NÂ° quittance</th><th>Ã‰chÃ©ance</th><th>PÃ©riode</th><th>Prime totale</th><th>Solde</th><th>PiÃ¨ces</th><th>Observation</th></> : <><th>Client</th><th>Compagnie</th><th>Quittances</th><th>Prime totale</th><th>Solde total</th><th>Total piÃ¨ces</th></>}</tr></thead><tbody>{visibleItems.map((row, index) => <tr key={`${row.code_client}-${row.num_quittance}-${index}`}>
          <td><strong>{row.nom_client || 'Client non renseignÃ©'}</strong><small>{row.code_client || 'â€”'} Â· {row.adresse || ''} {row.ville || ''}</small></td><td>{row.nom_compagnie || 'â€”'}</td>{view === 'detail' ? <><td>{row.num_quittance || 'â€”'}</td><td>{formatDate(row.echeance)}</td><td>{row.Periode || 'â€”'}</td><td>{money.format(amount(row.prime_total))}</td><td className="unpaid-balance">{money.format(amount(row.solde_quittance))}</td><td>{row.Total_Piece == null ? 'Sans piÃ¨ce' : money.format(amount(row.Total_Piece))}</td><td>{row.observation || 'â€”'}</td></> : <><td>{row.items_count}</td><td>{money.format(row.prime_total)}</td><td className="unpaid-balance">{money.format(row.solde_quittance)}</td><td>{money.format(row.Total_Piece)}</td></>}</tr>)}</tbody></table></div> : <div className="unpaid-empty">Aucun impayÃ© ne correspond aux critÃ¨res sÃ©lectionnÃ©s.</div>}
      </section>}
      </div>
    </section>
  </div>;
}
