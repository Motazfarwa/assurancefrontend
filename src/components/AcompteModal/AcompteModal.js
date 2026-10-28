import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { listPartialPayments } from '../../services/unpaidApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import './AcompteModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const amount = (value) => Number(value || 0);
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—');
const initialFilters = { code_client: '', nom_client: '', date_debut: '', date_fin: '' };
const MARKS = { A: 'Acompte', S: 'Solde' };

// Etat des acomptes: quittances of type P partly paid (0,01 < solde quittance < montant quittance), per quittance or per client.
export default function AcompteModal({ onClose, moduleId = '350' }) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [view, setView] = useState('detail');
  const [state, setState] = useState({ loading: true, error: '', items: [], limit: 0 });

  // The list follows the filters as they are typed.
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    const timer = window.setTimeout(async () => {
      try {
        const body = await listPartialPayments(accessToken, { ...filters, code_client: filters.code_client.trim(), nom_client: filters.nom_client.trim() });
        if (active) setState({ loading: false, error: '', items: body.items || [], limit: body.limit });
      } catch (requestError) {
        if (active) setState({ loading: false, error: requestError.message, items: [], limit: 0 });
      }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, filters]);

  const update = (event) => { const { name, value } = event.target; setFilters((current) => ({ ...current, [name]: value })); };

  const totals = useMemo(() => state.items.reduce((sum, row) => ({
    montant: sum.montant + amount(row.montant_quittance), regle: sum.regle + amount(row.montant_regle), solde: sum.solde + amount(row.solde_quittance),
  }), { montant: 0, regle: 0, solde: 0 }), [state.items]);

  // Global view: one line per client.
  const clients = useMemo(() => {
    const groups = new Map();
    state.items.forEach((row) => {
      const key = row.code_client || '';
      const group = groups.get(key) || { code_client: row.code_client, nom_client: row.nom_client, count: 0, montant: 0, regle: 0, solde: 0 };
      group.count += 1; group.montant += amount(row.montant_quittance); group.regle += amount(row.montant_regle); group.solde += amount(row.solde_quittance);
      groups.set(key, group);
    });
    return [...groups.values()].sort((a, b) => b.solde - a.solde);
  }, [state.items]);

  const client = (row) => <td><strong>{row.nom_client || 'Client non renseigné'}</strong><small>{row.code_client || '—'}</small></td>;

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal" role="dialog" aria-modal="true" aria-labelledby="acompte-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>RECOUVREMENT · MODULE {moduleId}</span><h2 id="acompte-title">Etat des acomptes</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field"><span>Code client</span><input name="code_client" value={filters.code_client} onChange={update} maxLength={8} placeholder="Tous les clients" /></label>
          <label className="acompte-field"><span>Nom client</span><input name="nom_client" value={filters.nom_client} onChange={update} maxLength={30} placeholder="Rechercher par nom" /></label>
          <label className="acompte-field"><span>Échéance du</span><input type="date" name="date_debut" value={filters.date_debut} onChange={update} /></label>
          <label className="acompte-field"><span>au</span><input type="date" name="date_fin" value={filters.date_fin} onChange={update} /></label>
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Affichage</legend><label><input type="radio" name="acompte-view" checked={view === 'detail'} onChange={() => setView('detail')} /> Détaillé</label><label><input type="radio" name="acompte-view" checked={view === 'global'} onChange={() => setView('global')} /> Par client</label></fieldset>
          <button type="button" className="expert-cancel" onClick={() => setFilters(initialFilters)} disabled={filters === initialFilters}>Effacer</button>
        </div>

        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        <section className="unpaid-results">
          <div className="unpaid-results-heading">
            <div><span>QUITTANCES TYPE P EN ACOMPTE · SOLDE ENTRE 0,01 ET LE MONTANT DE LA QUITTANCE</span><h3>{state.loading ? 'Chargement…' : `${state.items.length} quittance${state.items.length > 1 ? 's' : ''}${view === 'global' ? ` · ${clients.length} client${clients.length > 1 ? 's' : ''}` : ''}`}</h3></div>
            <div className="acompte-totals">
              <div className="unpaid-total"><small>Total réglé</small><strong>{money.format(totals.regle)} TND</strong></div>
              <div className="unpaid-total"><small>Reste à payer</small><strong className="unpaid-balance">{money.format(totals.solde)} TND</strong></div>
            </div>
          </div>
          {!state.loading && state.items.length === 0 ? <div className="unpaid-empty">Aucune quittance en acompte ne correspond aux critères.</div> : <div className="unpaid-table-scroll"><table className="unpaid-table">
            <thead><tr>{view === 'detail'
              ? <><th>Client</th><th>N° quittance</th><th>N° police</th><th>Compagnie</th><th>Période</th><th>Échéance</th><th>Montant quittance</th><th>Montant réglé</th><th>Solde</th><th>Dernier règlement</th><th>Acompte / Solde</th></>
              : <><th>Client</th><th>Quittances</th><th>Montant quittances</th><th>Montant réglé</th><th>Solde</th></>}</tr></thead>
            <tbody>{view === 'detail'
              ? state.items.map((row, index) => <tr key={`${row.num_quittance}-${index}`}>
                {client(row)}<td>{row.num_quittance}</td><td>{row.num_police || '—'}</td><td>{row.nom_compagnie || '—'}</td><td>{row.Periode || '—'}</td><td>{formatDate(row.echeance)}</td>
                <td className="acompte-number">{money.format(amount(row.montant_quittance))}</td><td className="acompte-number">{money.format(amount(row.montant_regle))}</td>
                <td className="acompte-number unpaid-balance">{money.format(amount(row.solde_quittance))}</td><td>{formatDate(row.Date_Reglement)}</td>
                <td><span className={`acompte-mark is-${row.acompte_solde === 'S' ? 'solde' : 'acompte'}`}>{row.acompte_solde} — {MARKS[row.acompte_solde] || row.acompte_solde}</span></td>
              </tr>)
              : clients.map((row) => <tr key={row.code_client || 'none'}>
                {client(row)}<td>{row.count}</td><td className="acompte-number">{money.format(row.montant)}</td><td className="acompte-number">{money.format(row.regle)}</td><td className="acompte-number unpaid-balance">{money.format(row.solde)}</td>
              </tr>)}
            </tbody>
          </table></div>}
          {!state.loading && state.limit > 0 && state.items.length >= state.limit && <p className="acompte-limit">Résultats limités à {state.limit} : précisez les critères.</p>}
        </section>
      </div>
    </section>
  </div>;
}
