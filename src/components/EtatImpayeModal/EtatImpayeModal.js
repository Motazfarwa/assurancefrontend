import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getUnpaidStatement, listStatementCompanies } from '../../services/unpaidApi';
import { getClientReglements } from '../../services/reglementClientApi';
import '../ExpertManagementModal/ExpertManagementModal.css';
import '../AgencyUnpaidModal/AgencyUnpaidModal.css';
import './EtatImpayeModal.css';

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const amount = (value) => Number(value || 0);
const formatDate = (value) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '');
const today = () => new Date().toISOString().slice(0, 10);
const AGENCY = ['Cabinet d’Assurance Jemmali', '4, Rue Ohod - Mutuelleville', '1082 - Tunis', 'Tél : 71 893 000', 'Cell : 93 893 000'];
const initialFilters = {
  code_client: '', nom_client: '', view: 'global', piece: 'avec',
  dates: false, date_debut: '2020-01-01', date_fin: today(),
  typed: false, type_client: 'P', compagnie: false, code_compagnie: '', mise_en_demeure: false,
};
// "T" + "10/2026" as the legacy report prints it; a comptant quittance is just "C".
const termOf = (row) => (row.tc === 'T' && row.periode ? `T${row.periode}` : row.tc || '');
const total = (rows) => rows.reduce((sum, row) => sum + amount(row.solde), 0);
const letterhead = (title) => <div className="eti-letterhead">
  <address>{AGENCY.map((line) => <span key={line}>{line}</span>)}</address>
  <span className="eti-date">Date : <b>{formatDate(today())}</b></span>
  <h3>{title}</h3>
</div>;
// Rows (already sorted by code client, compagnie, échéance) grouped by client, then, for the mémoire, by compagnie.
function byClient(rows) {
  const groups = [];
  rows.forEach((row) => {
    let group = groups[groups.length - 1];
    if (!group || group.code_client !== row.code_client) { group = { ...row, rows: [] }; groups.push(group); }
    group.rows.push(row);
  });
  return groups;
}
function byCompany(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row.nom_compagnie || 'Sans compagnie';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  });
  return [...groups.entries()];
}

// Etat des impayés: quittances still unpaid, "avec pièce" (a cheque / traite en instance covers them, the solde is what it
// leaves) or "sans pièce" (nothing given yet, solde > 0). The modal only takes the criteria; "Aperçu" opens the preview page:
// "Global" lists the quittances by client, "Détaillé" the mémoire de règlement of each client by compagnie.
export default function EtatImpayeModal({ onClose, moduleId = '340' }) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { items, limit, detail, sans }: the report being shown

  useEffect(() => {
    listStatementCompanies(accessToken).then((body) => setCompanies(body.items || [])).catch(() => setCompanies([]));
  }, [accessToken]);

  // A typed code brings the client's name, as in the legacy screen.
  useEffect(() => {
    const code = filters.code_client.trim();
    if (!code) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      getClientReglements(accessToken, code)
        .then((body) => { if (active && body.client) setFilters((current) => ({ ...current, nom_client: (body.client.nom_client || '').trim() })); })
        .catch(() => {});
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, filters.code_client]);

  // The name only filters when no code is typed.
  const query = () => ({
    code_client: filters.code_client.trim(),
    nom_client: filters.code_client.trim() ? '' : filters.nom_client.trim(),
    piece: filters.piece,
    date_debut: filters.dates ? filters.date_debut : '',
    date_fin: filters.dates ? filters.date_fin : '',
    type_client: filters.typed ? filters.type_client : '',
    code_compagnie: filters.compagnie ? filters.code_compagnie : '',
    mise_en_demeure: filters.mise_en_demeure,
  });
  async function apercu() {
    if (filters.dates && filters.date_debut && filters.date_fin && filters.date_debut > filters.date_fin) { setError('La date de début doit précéder la date de fin.'); return; }
    setLoading(true);
    setError('');
    try {
      const body = await getUnpaidStatement(accessToken, query());
      const items = body.items || [];
      if (!items.length) setError('Aucune quittance impayée ne correspond aux critères.');
      else setPreview({ items, limit: body.limit, detail: filters.view === 'detail', sans: filters.piece === 'sans' });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const set = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const update = (event) => {
    const { name, type, checked, value } = event.target;
    set({ [name]: type === 'checkbox' ? checked : value, ...(name === 'code_client' && !value.trim() ? { nom_client: '' } : {}) });
    setError('');
  };
  const detail = filters.view === 'detail';
  const sans = filters.piece === 'sans';

  if (preview) return <EtatImpayePreview {...preview} onBack={() => setPreview(null)} onClose={onClose} />;

  return <div className="expert-modal-backdrop eti-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="unpaid-modal eti-modal" role="dialog" aria-modal="true" aria-labelledby="eti-title">
      <header className="expert-modal-header"><div className="expert-brand"><span className="expert-brand-mark">A</span><span><strong>Gestion Assurances</strong><small>Assurance Jemmali</small></span></div><div className="expert-title"><span>RECOUVREMENT · MODULE {moduleId}</span><h2 id="eti-title">Etat des impayés agence</h2></div><button className="expert-close" onClick={onClose} type="button" aria-label="Fermer">×</button></header>
      <div className="unpaid-content">
        <div className="unpaid-filter-form eti-filters">
          <div className="eti-row">
            <label className="eti-field eti-code"><span>Code client</span><input name="code_client" value={filters.code_client} onChange={update} maxLength={8} placeholder="Tous" /></label>
            <label className="eti-field eti-name"><span>Nom client</span><input name="nom_client" value={filters.nom_client} onChange={update} maxLength={30} placeholder="Tous les clients" readOnly={Boolean(filters.code_client.trim())} /></label>
            <div className="eti-buttons">
              <button type="button" className="expert-submit" onClick={apercu} disabled={loading}>{loading ? 'Préparation…' : 'Aperçu'}</button>
              <button type="button" className="expert-cancel" onClick={() => setFilters({ ...initialFilters, date_fin: today() })}>Effacer</button>
            </div>
          </div>
          <div className="eti-row">
            <fieldset className="unpaid-filter-set unpaid-choice"><legend>Affichage</legend>
              <label><input type="radio" name="view" value="detail" checked={detail} onChange={update} /> Détaillé</label>
              <label><input type="radio" name="view" value="global" checked={!detail} onChange={update} /> Global</label>
            </fieldset>
            <fieldset className="unpaid-filter-set unpaid-choice"><legend>Pièce</legend>
              <label><input type="radio" name="piece" value="avec" checked={!sans} onChange={update} /> Avec pièce</label>
              <label><input type="radio" name="piece" value="sans" checked={sans} onChange={update} /> Sans pièce</label>
            </fieldset>
            <fieldset className="unpaid-filter-set eti-dates"><legend><label><input type="checkbox" name="dates" checked={filters.dates} onChange={update} /> Entre deux dates</label></legend>
              <label className="eti-field"><span>Date début</span><input type="date" name="date_debut" value={filters.date_debut} onChange={update} disabled={!filters.dates} /></label>
              <label className="eti-field"><span>Date fin</span><input type="date" name="date_fin" value={filters.date_fin} onChange={update} disabled={!filters.dates} /></label>
            </fieldset>
          </div>
          <div className="eti-row">
            <fieldset className="unpaid-filter-set unpaid-choice"><legend><label><input type="checkbox" name="typed" checked={filters.typed} onChange={update} /> Type client</label></legend>
              <label><input type="radio" name="type_client" value="P" checked={filters.type_client === 'P'} onChange={update} disabled={!filters.typed} /> Particulier</label>
              <label><input type="radio" name="type_client" value="S" checked={filters.type_client === 'S'} onChange={update} disabled={!filters.typed} /> Société</label>
            </fieldset>
            <div className="eti-checks">
              <label className="eti-check"><input type="checkbox" name="compagnie" checked={filters.compagnie} onChange={update} /> Compagnie :
                <select name="code_compagnie" value={filters.code_compagnie} onChange={update} disabled={!filters.compagnie}>
                  <option value="">Toutes</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.label}</option>)}
                </select>
              </label>
              <label className="eti-check"><input type="checkbox" name="mise_en_demeure" checked={filters.mise_en_demeure} onChange={update} /> Mise en demeure</label>
            </div>
          </div>
        </div>

        {error && <div className="expert-error unpaid-error" role="alert">{error}</div>}
      </div>
    </section>
  </div>;
}

// The preview page (as the legacy report viewer): a toolbar, then the report on paper sheets; "Imprimer" prints only them.
function EtatImpayePreview({ items, limit, detail, sans, onBack, onClose }) {
  const clients = useMemo(() => byClient(items), [items]);
  const grandTotal = useMemo(() => total(items), [items]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  const pages = detail ? clients.length : 1;

  return <div className="eti-preview" role="dialog" aria-modal="true" aria-label={detail ? 'Mémoire de règlement' : 'Etat des impayées'}>
    <header className="eti-preview-bar">
      <button type="button" className="expert-cancel" onClick={onBack}>← Retour aux critères</button>
      <div className="eti-preview-title"><strong>{detail ? 'Mémoire de règlement' : 'Etat des impayées'}</strong>
        <span>{sans ? 'Sans pièce' : 'Avec pièce'} · {items.length} quittance{items.length > 1 ? 's' : ''} · {clients.length} client{clients.length > 1 ? 's' : ''}{detail ? ` · ${pages} page${pages > 1 ? 's' : ''}` : ''} · total {money.format(grandTotal)} TND</span></div>
      <button type="button" className="expert-submit" onClick={() => window.print()}>Imprimer</button>
      <button type="button" className="expert-close" onClick={onClose} aria-label="Fermer">×</button>
    </header>
    {limit > 0 && items.length >= limit && <p className="eti-limit eti-preview-limit">Résultats limités à {limit} quittances : précisez les critères.</p>}
    <div className="eti-report">
      {!detail ? <article className="eti-page">
        {letterhead('ETAT DES IMPAYÉES')}
        <div className="eti-scroll"><table className="eti-table">
          <thead><tr><th>N° Police</th><th>TC</th><th>Échéance</th><th className="eti-num">Prime</th><th className="eti-num">Solde</th><th>N° quittance</th>{!sans && <th>Pièce(s)</th>}<th>Observation</th></tr></thead>
          {clients.map((client) => <tbody key={client.code_client}>
            <tr className="eti-client"><td colSpan={sans ? 7 : 8}>Code client : <b>{client.code_client}</b><span>Nom client : <b>{client.nom_client || '—'}</b></span></td></tr>
            {client.rows.map((row) => <tr key={row.num_quittance}>
              <td>{row.num_int}</td><td>{termOf(row)}</td><td>{formatDate(row.echeance)}</td>
              <td className="eti-num">{money.format(amount(row.montant_quittance))}</td><td className="eti-num">{money.format(amount(row.solde))}</td>
              <td>{row.num_quittance}</td>{!sans && <td>{row.pieces}</td>}<td>{row.observation}</td>
            </tr>)}
            <tr className="eti-subtotal"><td colSpan={4}>Total client</td><td className="eti-num">{money.format(total(client.rows))}</td><td colSpan={sans ? 2 : 3} /></tr>
          </tbody>)}
          <tfoot><tr className="eti-grand"><td colSpan={4}>Total général</td><td className="eti-num">{money.format(grandTotal)}</td><td colSpan={sans ? 2 : 3} /></tr></tfoot>
        </table></div>
      </article>
        : clients.map((client) => <article key={client.code_client} className="eti-page">
          {letterhead('MÉMOIRE DE RÈGLEMENT')}
          <dl className="eti-client-card">
            <dt>Client</dt><dd><b>{client.code_client}</b>&nbsp;&nbsp;{client.nom_client}</dd>
            <dt>Adresse</dt><dd>{client.adresse || '—'}</dd>
            <dt>Ville</dt><dd>{client.ville || '—'}</dd>
            <dt>Code postal</dt><dd>{client.cp ?? '—'}</dd>
          </dl>
          {byCompany(client.rows).map(([name, rows]) => <section key={name} className="eti-company">
            <h4>Compagnie : {name}</h4>
            <div className="eti-scroll"><table className="eti-table">
              <thead><tr><th>N° Police</th><th>TC</th><th>Échéance</th><th className="eti-num">Prime</th><th className="eti-num">Solde</th><th>Risque</th><th>Observation</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.num_quittance}>
                <td>{row.num_int}</td><td>{termOf(row)}</td><td>{formatDate(row.echeance)}</td>
                <td className="eti-num">{money.format(amount(row.montant_quittance))}</td><td className="eti-num">{money.format(amount(row.solde))}</td>
                <td>{row.risque}</td><td>{row.observation}</td>
              </tr>)}</tbody>
              <tfoot><tr className="eti-subtotal"><td colSpan={4}>Total compagnie</td><td className="eti-num">{money.format(total(rows))}</td><td colSpan={2} /></tr></tfoot>
            </table></div>
          </section>)}
          <p className="eti-client-total">Total client <b>{money.format(total(client.rows))}</b></p>
        </article>)}
    </div>
  </div>;
}
