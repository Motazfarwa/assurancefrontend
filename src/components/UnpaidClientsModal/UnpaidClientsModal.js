import { useEffect, useState } from 'react';
import { listAgencyUnpaid } from '../../services/unpaidApi';
import './UnpaidClientsModal.css';

const COLUMNS = [
  ['code_client', 'Code client'], ['nom_client', 'Client'], ['nom_compagnie', 'Compagnie'], ['num_quittance', 'N° quittance'],
  ['Periode', 'Période'], ['echeance', 'Échéance'], ['prime_total', 'Prime totale'], ['solde_quittance', 'Solde'], ['Total_Piece', 'Total pièce'],
];
const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function format(key, value) {
  if (value == null || value === '') return '—';
  if (key === 'echeance') return String(value).slice(0, 10).split('-').reverse().join('/');
  if (['prime_total', 'solde_quittance', 'Total_Piece'].includes(key)) return money.format(Number(value));
  return String(value);
}

export default function UnpaidClientsModal({ accessToken, onClose }) {
  const [statut, setStatut] = useState('impaye');
  const [search, setSearch] = useState('');
  const [state, setState] = useState({ loading: true, error: '', items: [], limit: 0 });

  useEffect(() => {
    let active = true;
    const text = search.trim();
    const filters = { statut };
    if (text) filters[/^\d+$/.test(text) ? 'code_client' : 'nom_client'] = text;
    setState((current) => ({ ...current, loading: true, error: '' }));
    const timer = window.setTimeout(async () => {
      try {
        const body = await listAgencyUnpaid(accessToken, filters);
        if (active) setState({ loading: false, error: '', items: body.items || [], limit: body.limit });
      } catch (error) {
        if (active) setState({ loading: false, error: error.message, items: [], limit: 0 });
      }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, statut, search]);

  return <div className="client-records-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="client-records-dialog unpaid-clients-dialog" role="dialog" aria-modal="true" aria-label="Visualisation des clients">
      <header><div><span>GESTION DES CLIENTS · ÉTAT DES IMPAYÉS</span><h2>Visualisation des clients</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></header>
      <div className="unpaid-clients-tools">
        <div className="unpaid-clients-toggle" role="radiogroup" aria-label="Statut du client">
          <label className={statut === 'impaye' ? 'is-active' : ''}><input type="radio" name="statut" checked={statut === 'impaye'} onChange={() => setStatut('impaye')} /> Clients impayés</label>
          <label className={statut === 'paye' ? 'is-active' : ''}><input type="radio" name="statut" checked={statut === 'paye'} onChange={() => setStatut('paye')} /> Clients payés</label>
        </div>
        <input type="search" placeholder="Code ou nom du client" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {state.loading ? <p className="client-records-message">Chargement…</p> : state.error ? <p className="client-records-message is-error">{state.error}</p> : state.items.length === 0 ? <p className="client-records-message">Aucun client trouvé.</p> : <div className="client-records-table-wrap"><table><thead><tr>{COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{state.items.map((row, index) => <tr key={`${row.num_quittance || row.code_client}-${index}`}>{COLUMNS.map(([key]) => <td key={key}>{format(key, row[key])}</td>)}</tr>)}</tbody></table></div>}
      <footer><span>{state.loading ? '' : `${state.items.length} résultat${state.items.length > 1 ? 's' : ''}${state.limit && state.items.length >= state.limit ? ` — limité à ${state.limit}` : ''}`}</span><button className="client-secondary-button" type="button" onClick={onClose}>Fermer</button></footer>
    </section>
  </div>;
}
