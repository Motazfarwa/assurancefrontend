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
const NO_COMPANY = 'Sans compagnie';
const byCompany = (a, b) => (a === NO_COMPANY ? 1 : b === NO_COMPANY ? -1 : a.localeCompare(b, 'fr'));
const sum = (rows) => rows.reduce((total, row) => ({
  montant: total.montant + amount(row.montant_quittance), regle: total.regle + amount(row.montant_regle), solde: total.solde + amount(row.solde_quittance),
}), { montant: 0, regle: 0, solde: 0 });
// "Par client": one line per client, the largest balance first.
function byClient(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.code_client || '';
    const group = groups.get(key) || { code_client: row.code_client, nom_client: row.nom_client, count: 0, montant: 0, regle: 0, solde: 0 };
    group.count += 1; group.montant += amount(row.montant_quittance); group.regle += amount(row.montant_regle); group.solde += amount(row.solde_quittance);
    groups.set(key, group);
  });
  return [...groups.values()].sort((a, b) => b.solde - a.solde);
}

// Etat des acomptes: quittances of type P partly paid (0,01 < solde quittance < montant quittance), one table per compagnie,
// per quittance or per client.
export default function AcompteModal({ onClose, moduleId = '350' }) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [view, setView] = useState('detail');
  const [compagnie, setCompagnie] = useState(''); // nom_compagnie shown, '' = all
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

  // The quittances of the chosen compagnie ('' = all).
  const shown = useMemo(() => (compagnie ? state.items.filter((row) => (row.nom_compagnie || NO_COMPANY) === compagnie) : state.items), [state.items, compagnie]);
  const totals = useMemo(() => sum(shown), [shown]);
  const companyNames = useMemo(() => [...new Set(state.items.map((row) => row.nom_compagnie || NO_COMPANY))].sort(byCompany), [state.items]);

  // One table per compagnie (by name, quittances without compagnie last), each with its quittances or, "Par client", its clients.
  const companies = useMemo(() => {
    const groups = new Map();
    shown.forEach((row) => {
      const name = row.nom_compagnie || NO_COMPANY;
      if (!groups.has(name)) groups.set(name, { name, rows: [] });
      groups.get(name).rows.push(row);
    });
    return [...groups.values()].sort((a, b) => byCompany(a.name, b.name)).map((group) => ({ ...group, totals: sum(group.rows), clients: byClient(group.rows) }));
  }, [shown]);

  const client = (row) => <td><strong>{row.nom_client || 'Client non renseigné'}</strong><small>{row.code_client || '—'}</small></td>;
  const detail = view === 'detail';

  return <div className="expert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal" role="dialog" aria-modal="true" aria-labelledby="acompte-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>RECOUVREMENT · MODULE {moduleId}</span><h2 id="acompte-title">Etat des acomptes</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form acompte-filters">
          <label className="acompte-field"><span>Code client</span><input name="code_client" value={filters.code_client} onChange={update} maxLength={8} placeholder="Tous les clients" /></label>
          <label className="acompte-field"><span>Nom client</span><input name="nom_client" value={filters.nom_client} onChange={update} maxLength={30} placeholder="Rechercher par nom" /></label>
          <label className="acompte-field"><span>Échéance du</span><input type="date" name="date_debut" value={filters.date_debut} onChange={update} /></label>
          <label className="acompte-field"><span>au</span><input type="date" name="date_fin" value={filters.date_fin} onChange={update} /></label>
          <label className="acompte-field"><span>Compagnie</span>
            <select value={compagnie} onChange={(event) => setCompagnie(event.target.value)}>
              <option value="">Toutes les compagnies</option>
              {[...new Set([...companyNames, compagnie].filter(Boolean))].map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <fieldset className="unpaid-filter-set unpaid-choice"><legend>Affichage</legend><label><input type="radio" name="acompte-view" checked={view === 'detail'} onChange={() => setView('detail')} /> Détaillé</label><label><input type="radio" name="acompte-view" checked={view === 'global'} onChange={() => setView('global')} /> Par client</label></fieldset>
          <button type="button" className="expert-cancel" onClick={() => { setFilters(initialFilters); setCompagnie(''); }} disabled={filters === initialFilters && !compagnie}>Effacer</button>
        </div>

        {state.error && <div className="expert-error unpaid-error" role="alert">{state.error}</div>}
        <section className="unpaid-results">
          <div className="unpaid-results-heading">
            <div><span>QUITTANCES TYPE P EN ACOMPTE · SOLDE ENTRE 0,01 ET LE MONTANT DE LA QUITTANCE</span><h3>{state.loading ? 'Chargement…' : `${shown.length} quittance${shown.length > 1 ? 's' : ''} · ${companies.length} compagnie${companies.length > 1 ? 's' : ''}`}</h3></div>
            <div className="acompte-totals">
              <div className="unpaid-total"><small>Montant quittance</small><strong>{money.format(totals.montant)} TND</strong></div>
              <div className="unpaid-total"><small>Montant réglé</small><strong>{money.format(totals.regle)} TND</strong></div>
              <div className="unpaid-total"><small>Reste à payer</small><strong className="unpaid-balance">{money.format(totals.solde)} TND</strong></div>
            </div>
          </div>
          {!state.loading && shown.length === 0 ? <div className="unpaid-empty">Aucune quittance en acompte ne correspond aux critères.</div> : <div className="acompte-companies">
            {companies.map((group) => <section key={group.name} className="acompte-company">
              <header>
                <h4>{group.name}</h4>
                <span>{group.rows.length} quittance{group.rows.length > 1 ? 's' : ''}{detail ? '' : ` · ${group.clients.length} client${group.clients.length > 1 ? 's' : ''}`}</span>
                <span className="acompte-company-totals">Montant quittance <b>{money.format(group.totals.montant)}</b> · Réglé <b>{money.format(group.totals.regle)}</b> · Reste <b className="unpaid-balance">{money.format(group.totals.solde)}</b> TND</span>
              </header>
              <div className="unpaid-table-scroll"><table className="unpaid-table">
                <thead><tr>{detail
                  ? <><th>Client</th><th>N° quittance</th><th>N° police</th><th>Période</th><th>Échéance</th><th>Montant quittance</th><th>Montant réglé</th><th>Solde</th><th>Dernier règlement</th></>
                  : <><th>Client</th><th>Quittances</th><th>Montant quittances</th><th>Montant réglé</th><th>Solde</th></>}</tr></thead>
                <tbody>{detail
                  ? group.rows.map((row, index) => <tr key={`${row.num_quittance}-${index}`}>
                    {client(row)}<td>{row.num_quittance}</td><td>{row.num_police || '—'}</td><td>{row.Periode || '—'}</td><td>{formatDate(row.echeance)}</td>
                    <td className="acompte-number">{money.format(amount(row.montant_quittance))}</td><td className="acompte-number">{money.format(amount(row.montant_regle))}</td>
                    <td className="acompte-number unpaid-balance">{money.format(amount(row.solde_quittance))}</td><td>{formatDate(row.Date_Reglement)}</td>
                  </tr>)
                  : group.clients.map((row) => <tr key={row.code_client || 'none'}>
                    {client(row)}<td>{row.count}</td><td className="acompte-number">{money.format(row.montant)}</td><td className="acompte-number">{money.format(row.regle)}</td><td className="acompte-number unpaid-balance">{money.format(row.solde)}</td>
                  </tr>)}
                </tbody>
                <tfoot><tr className="acompte-subtotal">
                  <td colSpan={detail ? 5 : 2}>Total {group.name}</td>
                  <td className="acompte-number">{money.format(group.totals.montant)}</td><td className="acompte-number">{money.format(group.totals.regle)}</td>
                  <td className="acompte-number unpaid-balance">{money.format(group.totals.solde)}</td>{detail && <td />}
                </tr></tfoot>
              </table></div>
            </section>)}
          </div>}
          {!state.loading && state.limit > 0 && state.items.length >= state.limit && <p className="acompte-limit">Résultats limités à {state.limit} : précisez les critères.</p>}
        </section>
      </div>
    </section>
  </div>;
}
